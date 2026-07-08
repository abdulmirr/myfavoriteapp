-- Hardening pass from the full-diff review. Five fixes:
--   1) taste_approvals UPDATE could retarget receiver (bypassing block/budget/
--      notifications) — the note is the only mutable column now.
--   2) activity-email throttle was check-then-insert; concurrent notifications
--      could double-send — per-recipient advisory lock serializes it. Subjects
--      also now strip newlines and cap length (display names are free text).
--   3) digest/recap senders were write-only on email_log — a manual re-run or
--      double cron registration re-emailed everyone. Now idempotent per window.
--   4) reorder_items accepted unbounded arrays — capped.
--   5) rec_dismissals had no write budget and no length caps.
-- Idempotent.

-- ── 1) taste approvals: only the note may change ──────────────────────────────
create or replace function public.taste_note_only()
returns trigger language plpgsql as $$
begin
  if new.giver_id <> old.giver_id or new.receiver_id <> old.receiver_id then
    raise exception 'approvals cannot be retargeted' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists taste_note_only on public.taste_approvals;
create trigger taste_note_only
  before update on public.taste_approvals
  for each row execute function public.taste_note_only();

-- ── 2) activity email: serialize the throttle, sanitize subjects ─────────────
create or replace function public.email_subject(t text)
returns text language sql immutable as $$
  select left(regexp_replace(coalesce(t, ''), E'[\\r\\n\\t]+', ' ', 'g'), 78);
$$;

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

  -- serialize concurrent notifications for the same recipient so the
  -- one-email-per-day check can't be raced past (lock releases at commit,
  -- by which point the winner's email_log row is visible to the loser)
  perform pg_advisory_xact_lock(hashtext('email:' || new.profile_id::text));

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
    subj := public.email_subject(format('%s favorited “%s” from your library', actor.name, item_title));
    body := format(
      '<p>%s took <em>%s</em> from your library — it''s on <a href="https://myfavoriteapp.com/%s?item=%s" style="color:#18181b">their wall</a> now, via you.</p>',
      public.esc_html(actor.name), public.esc_html(item_title), actor.username, new.item_id)
      || case when coalesce(item_thoughts, '') <> ''
           then format('<p style="color:#52525b">“%s”</p>', public.esc_html(left(item_thoughts, 200)))
           else '' end;

  elsif new.type = 'taste' then
    select ta.note into taste_note from public.taste_approvals ta
     where ta.giver_id = new.actor_id and ta.receiver_id = new.profile_id;
    subj := public.email_subject(format('%s approves your taste', actor.name));
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

-- ── 3) digest + recap: skip anyone already emailed this window ────────────────
-- (patch the loop guards by recreating both senders with an email_log check)
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
       -- re-running the sender (manual invoke, duplicate cron) must not
       -- re-email anyone who already got this week's digest
       and not exists (select 1 from public.email_log el
                        where el.profile_id = p.id and el.kind = 'digest'
                          and el.created_at > now() - interval '5 days')
  loop
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

    -- log before the send: a crash mid-loop then re-run must not double-send
    -- (the reverse order risks duplicates; a lost email is the lesser failure)
    insert into public.email_log (profile_id, kind) values (rec.id, 'digest');
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
  end loop;
end $$;

revoke all on function public.send_weekly_digests() from public, anon, authenticated;

create or replace function public.send_monthly_recaps()
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  rec record;
  resend_key text;
  prev_start date := date_trunc('month', now() - interval '1 month')::date;
  prev_end   date := date_trunc('month', now())::date;
  prev_label text := trim(to_char(now() - interval '1 month', 'FMMonth YYYY'));
begin
  select value into resend_key from public.app_secrets where name = 'resend_api_key';
  if resend_key is null then
    raise notice 'recap email skipped: no resend_api_key in app_secrets';
    return;
  end if;

  for rec in
    select p.id, p.username,
           coalesce(nullif(p.display_name, ''), '@' || p.username) as name,
           u.email,
           (select count(*) from public.items i
             where i.profile_id = p.id
               and i.created_at >= prev_start and i.created_at < prev_end) as saves
      from public.profiles p
      join public.profile_private pp on pp.profile_id = p.id and pp.digest_opt_in
      join auth.users u on u.id = p.user_id
     where u.email is not null
       and not exists (select 1 from public.email_log el
                        where el.profile_id = p.id and el.kind = 'recap'
                          and el.created_at > now() - interval '20 days')
  loop
    if rec.saves < 3 then continue; end if;

    insert into public.email_log (profile_id, kind) values (rec.id, 'recap');
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || resend_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'Favorites <hello@myfavoriteapp.com>',
        'to', jsonb_build_array(rec.email),
        'subject', format('Your %s recap is ready', prev_label),
        'html',
          '<div style="font-family:ui-monospace,Menlo,monospace;color:#18181b;font-size:13px;line-height:1.7">'
          || format('<p>Hi %s,</p>', public.esc_html(rec.name))
          || format(
               '<p>%s favorites in %s — your recap card is ready to look back on (and post, if it turned out well).</p>',
               rec.saves, prev_label)
          || '<p><a href="https://myfavoriteapp.com/recap" style="color:#18181b">See your month →</a></p>'
          || public.email_footer(rec.id, rec.username, 'digest')
          || '</div>'
      )
    );
  end loop;
end $$;

revoke all on function public.send_monthly_recaps() from public, anon, authenticated;

-- ── 4) reorder: bound the input ───────────────────────────────────────────────
create or replace function public.reorder_items(p_ids uuid[])
returns void
language plpgsql as $$
begin
  -- far above any real library (items budget is 300/day) — this is a
  -- guardrail against megabyte arrays, not a product limit
  if coalesce(array_length(p_ids, 1), 0) > 2000 then
    raise exception 'too many items' using errcode = 'check_violation';
  end if;
  update public.items i
     set sort_order = u.ord - 1
    from unnest(p_ids) with ordinality as u(id, ord)
   where i.id = u.id;
end $$;

revoke all on function public.reorder_items(uuid[]) from public, anon;
grant execute on function public.reorder_items(uuid[]) to authenticated;

-- ── 5) dismissals: budget + sane sizes ────────────────────────────────────────
drop trigger if exists budget_dismissals on public.rec_dismissals;
create trigger budget_dismissals
  before insert on public.rec_dismissals
  for each row execute function public.enforce_social_budget();

-- rows are tiny today; constrain before anyone tests the boundary
alter table public.rec_dismissals drop constraint if exists rec_dismissals_sane_sizes;
alter table public.rec_dismissals add constraint rec_dismissals_sane_sizes
  check (char_length(title) <= 300 and char_length(creator) <= 200
         and char_length(media_type) <= 20);
