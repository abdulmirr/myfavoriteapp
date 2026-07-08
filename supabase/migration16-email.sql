-- The outbound channel. Three person-to-person activity emails (first follower,
-- favorited-from-your-library, taste approval) triggered off notification rows,
-- capped at one per recipient per day, plus a rebuilt weekly digest with real
-- names/titles instead of bare counts. Signed one-click unsubscribe for both.
-- Idempotent.

-- ── 0) plumbing ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

alter table public.profile_private
  add column if not exists email_events boolean not null default true;

-- send throttle ledger (definer-only; RLS on, zero policies)
create table if not exists public.email_log (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists email_log_recency_idx
  on public.email_log (profile_id, kind, created_at desc);
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

-- per-install secret that signs unsubscribe links
insert into public.app_secrets (name, value)
select 'email_secret', gen_random_uuid()::text || gen_random_uuid()::text
where not exists (select 1 from public.app_secrets where name = 'email_secret');

-- user text lands inside HTML emails — escape it (display names, titles, notes)
create or replace function public.esc_html(t text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- signed one-click unsubscribe: the token is hmac(profile:kind) with the
-- install secret, so a link works signed-out and can't be forged for others
create or replace function public.email_unsub(p_profile uuid, p_kind text, p_token text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare secret text;
begin
  select value into secret from public.app_secrets where name = 'email_secret';
  if secret is null or p_kind not in ('digest', 'events') then return false; end if;
  if encode(hmac(p_profile::text || ':' || p_kind, secret, 'sha256'), 'hex') <> p_token then
    return false;
  end if;
  if p_kind = 'digest' then
    update public.profile_private set digest_opt_in = false where profile_id = p_profile;
  else
    update public.profile_private set email_events = false where profile_id = p_profile;
  end if;
  return true;
end $$;

revoke all on function public.email_unsub(uuid, text, text) from public;
grant execute on function public.email_unsub(uuid, text, text) to anon, authenticated;

-- shared footer builder — page link + the signed unsubscribe link
create or replace function public.email_footer(p_profile uuid, p_username text, p_kind text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare secret text; token text;
begin
  select value into secret from public.app_secrets where name = 'email_secret';
  token := encode(hmac(p_profile::text || ':' || p_kind, secret, 'sha256'), 'hex');
  return format(
    '<p style="color:#a1a1aa">— Favorites · <a href="https://myfavoriteapp.com/%s" style="color:#a1a1aa">your page</a> · <a href="https://myfavoriteapp.com/api/email/unsubscribe?p=%s&k=%s&t=%s" style="color:#a1a1aa">stop these emails</a></p>',
    p_username, p_profile, p_kind, token);
end $$;

revoke all on function public.email_footer(uuid, text, text) from public, anon, authenticated;

-- ── 1) activity emails off notification rows ─────────────────────────────────
-- One trigger covers all three types because notifications are already the
-- canonical person-to-person event stream (trigger-written, retracted on undo,
-- block-aware). Caps: at most one activity email per recipient per ~day; the
-- rest wait in the bell and the weekly digest. Any failure must never break
-- the social write that caused it.
create or replace function public.email_on_notification()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  rcpt record; actor record; resend_key text;
  subj text; body text; item_title text; item_thoughts text; taste_note text;
begin
  select p.id, p.username,
         coalesce(nullif(p.display_name, ''), '@' || p.username) as name, u.email
    into rcpt
    from public.profiles p
    join public.profile_private pp on pp.profile_id = p.id and pp.email_events
    join auth.users u on u.id = p.user_id
   where p.id = new.profile_id and u.email is not null;
  if rcpt.id is null then return new; end if;

  if exists (select 1 from public.email_log
              where profile_id = new.profile_id and kind = 'events'
                and created_at > now() - interval '20 hours') then
    return new;
  end if;

  select username, coalesce(nullif(display_name, ''), '@' || username) as name
    into actor from public.profiles where id = new.actor_id;
  if actor.username is null then return new; end if;

  if new.type = 'follow' then
    -- the milestone only — later follows roll into the weekly digest
    if (select count(*) from public.follows where followee_id = new.profile_id) > 1 then
      return new;
    end if;
    subj := 'Your first follower';
    body := format(
      '<p>%s (<a href="https://myfavoriteapp.com/%s" style="color:#18181b">@%s</a>) just followed you. Your library has an audience now — what you favorite lands in their feed.</p>',
      public.esc_html(actor.name), actor.username, actor.username);

  elsif new.type = 'favorited' then
    select title, description into item_title, item_thoughts
      from public.items where id = new.item_id;
    if item_title is null then return new; end if;
    subj := format('%s favorited “%s” from your library', actor.name, item_title);
    body := format(
      '<p>%s took <em>%s</em> from your library — it''s on <a href="https://myfavoriteapp.com/%s?item=%s" style="color:#18181b">their wall</a> now, via you.</p>',
      public.esc_html(actor.name), public.esc_html(item_title), actor.username, new.item_id)
      || case when coalesce(item_thoughts, '') <> ''
           then format('<p style="color:#52525b">“%s”</p>', public.esc_html(left(item_thoughts, 200)))
           else '' end;

  elsif new.type = 'taste' then
    select ta.note into taste_note from public.taste_approvals ta
     where ta.giver_id = new.actor_id and ta.receiver_id = new.profile_id;
    subj := format('%s approves your taste', actor.name);
    body := format(
      '<p>%s (<a href="https://myfavoriteapp.com/%s" style="color:#18181b">@%s</a>) approves your taste.</p>',
      public.esc_html(actor.name), actor.username, actor.username)
      || case when coalesce(taste_note, '') <> ''
           then format('<p style="color:#52525b">“%s”</p>', public.esc_html(taste_note))
           else '' end
      || format('<p><a href="https://myfavoriteapp.com/%s" style="color:#18181b">Approve back →</a></p>', actor.username);

  else
    return new;
  end if;

  select value into resend_key from public.app_secrets where name = 'resend_api_key';
  if resend_key is null then return new; end if;

  insert into public.email_log (profile_id, kind) values (new.profile_id, 'events');
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || resend_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Favorites <hello@myfavoriteapp.com>',
      'to', jsonb_build_array(rcpt.email),
      'subject', subj,
      'html',
        '<div style="font-family:ui-monospace,Menlo,monospace;color:#18181b;font-size:13px;line-height:1.7">'
        || format('<p>Hi %s,</p>', public.esc_html(rcpt.name))
        || body
        || public.email_footer(rcpt.id, rcpt.username, 'events')
        || '</div>'
    )
  );
  return new;
exception when others then
  -- an email problem must never fail the follow/favorite/approval behind it
  raise notice 'activity email skipped: %', sqlerrm;
  return new;
end $$;

revoke all on function public.email_on_notification() from public, anon, authenticated;

drop trigger if exists email_on_notification on public.notifications;
create trigger email_on_notification
  after insert on public.notifications
  for each row execute function public.email_on_notification();

-- ── 2) digest rebuild: names and titles, not counts; silent on empty weeks ──
create or replace function public.send_weekly_digests()
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  rec record;
  resend_key text;
  followers_line text; spread_lines text; friend_lines text; body text;
begin
  select value into resend_key from public.app_secrets where name = 'resend_api_key';
  if resend_key is null then
    raise notice 'digest skipped: no resend_api_key in app_secrets';
    return;
  end if;

  for rec in
    select p.id, p.username,
           coalesce(nullif(p.display_name, ''), '@' || p.username) as name,
           u.email
      from public.profiles p
      join public.profile_private pp on pp.profile_id = p.id and pp.digest_opt_in
      join auth.users u on u.id = p.user_id
     where u.email is not null
  loop
    -- who followed you this week, by name
    select string_agg(
             format('<a href="https://myfavoriteapp.com/%s" style="color:#18181b">%s</a>',
                    f2.username, public.esc_html(f2.name)), ', ')
      into followers_line
      from (select pr.username,
                   coalesce(nullif(pr.display_name, ''), '@' || pr.username) as name
              from public.follows f
              join public.profiles pr on pr.id = f.follower_id
             where f.followee_id = rec.id
               and f.created_at > now() - interval '7 days'
             order by f.created_at desc limit 5) f2;

    -- your taste spreading: who took what from your library
    select string_agg(s.line, '')
      into spread_lines
      from (select format(
              '<p>· <a href="https://myfavoriteapp.com/%s" style="color:#18181b">%s</a> favorited <em>%s</em> via you</p>',
              a.username,
              public.esc_html(coalesce(nullif(a.display_name, ''), '@' || a.username)),
              public.esc_html(i.title)) as line
              from public.items i
              join public.profiles a on a.id = i.profile_id
             where i.via_profile_id = rec.id
               and i.created_at > now() - interval '7 days'
             order by i.created_at desc limit 5) s;

    -- what the people you follow favorited this week
    select string_agg(s.line, '')
      into friend_lines
      from (select format(
              '<p>· <a href="https://myfavoriteapp.com/%s?item=%s" style="color:#18181b">%s</a> favorited <em>%s</em></p>',
              a.username, i.id,
              public.esc_html(coalesce(nullif(a.display_name, ''), '@' || a.username)),
              public.esc_html(i.title)) as line
              from public.items i
              join public.follows f on f.followee_id = i.profile_id and f.follower_id = rec.id
              join public.profiles a on a.id = i.profile_id
             where i.created_at > now() - interval '7 days'
             order by i.created_at desc limit 6) s;

    -- a week where nothing happened sends nothing — silence beats filler
    if followers_line is null and spread_lines is null and friend_lines is null then
      continue;
    end if;

    body := '';
    if followers_line is not null then
      body := body || format('<p>%s followed you this week.</p>', followers_line);
    end if;
    if spread_lines is not null then
      body := body
        || '<p style="margin-top:14px;color:#a1a1aa;font-size:11px;letter-spacing:0.08em">YOUR TASTE, SPREADING</p>'
        || spread_lines;
    end if;
    if friend_lines is not null then
      body := body
        || '<p style="margin-top:14px;color:#a1a1aa;font-size:11px;letter-spacing:0.08em">FROM PEOPLE YOU FOLLOW</p>'
        || friend_lines;
    end if;
    body := body
      || '<p style="margin-top:14px">Fresh picks are on your <a href="https://myfavoriteapp.com" style="color:#18181b">home page</a> every day.</p>';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || resend_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'Favorites <hello@myfavoriteapp.com>',
        'to', jsonb_build_array(rec.email),
        'subject', 'Your week on Favorites',
        'html',
          '<div style="font-family:ui-monospace,Menlo,monospace;color:#18181b;font-size:13px;line-height:1.7">'
          || format('<p>Hi %s,</p>', public.esc_html(rec.name))
          || body
          || public.email_footer(rec.id, rec.username, 'digest')
          || '</div>'
      )
    );
    insert into public.email_log (profile_id, kind) values (rec.id, 'digest');
  end loop;
end $$;

revoke all on function public.send_weekly_digests() from public, anon, authenticated;
