-- Brand rename: the product is "Favorite" (singular) everywhere — sender name,
-- digest subject, footer, and the logo's alt. Every function below is carried
-- over verbatim from migration23 apart from those strings; logic (throttles,
-- advisory lock, idempotency guards, log-before-send) is untouched. Idempotent.

-- ── 0) the shared shell ───────────────────────────────────────────────────────
-- One place owns the chrome. Callers hand in body HTML (greeting included);
-- the shell wraps it with the mark and the column. Plain concatenation, no
-- format() — the CSS percent signs stay literal.
create or replace function public.email_shell(p_content text)
returns text language sql immutable as $$
  select
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">'
    || '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%"><tr>'
    || '<td style="padding:40px 24px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#18181b">'
    -- the mark is served from Supabase storage, not the app, so emails never
    -- depend on a Vercel deploy for their logo (and SVG is a no-go in Gmail)
    || '<img src="https://bvpruvuenqdwilysgojy.supabase.co/storage/v1/object/public/assets/icon-192.png" width="28" height="28" alt="Favorite" style="display:block;margin:0 0 28px;border:0">'
    || p_content
    || '</td></tr></table></td></tr></table>'
$$;

-- ── 1) footer, restyled ───────────────────────────────────────────────────────
create or replace function public.email_footer(p_profile uuid, p_username text, p_kind text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare secret text; token text;
begin
  select value into secret from public.app_secrets where name = 'email_secret';
  token := encode(hmac(p_profile::text || ':' || p_kind, secret, 'sha256'), 'hex');
  return format(
    '<div style="margin-top:36px;padding-top:16px;border-top:1px solid #f4f4f5;font-size:12px;line-height:1.6;color:#a1a1aa">'
    || 'Favorite · <a href="https://myfavoriteapp.com/%s" style="color:#a1a1aa">your page</a>'
    || ' · <a href="https://myfavoriteapp.com/api/email/unsubscribe?p=%s&k=%s&t=%s" style="color:#a1a1aa">stop these emails</a>'
    || '</div>',
    p_username, p_profile, p_kind, token);
end $$;

revoke all on function public.email_footer(uuid, text, text) from public, anon, authenticated;

-- ── 2) activity emails (logic verbatim from migration22, markup new) ─────────
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
      '<p style="margin:0 0 16px">%s (<a href="https://myfavoriteapp.com/%s" style="color:#18181b">@%s</a>) just followed you. Your library has an audience now — what you favorite lands in their feed.</p>',
      public.esc_html(actor.name), actor.username, actor.username);

  elsif new.type = 'favorited' then
    select title, description into item_title, item_thoughts
      from public.items where id = new.item_id;
    if item_title is null then return new; end if;
    subj := public.email_subject(format('%s favorited “%s” from your library', actor.name, item_title));
    body := format(
      '<p style="margin:0 0 16px">%s took <em>%s</em> from your library — it''s on <a href="https://myfavoriteapp.com/%s?item=%s" style="color:#18181b">their wall</a> now, via you.</p>',
      public.esc_html(actor.name), public.esc_html(item_title), actor.username, new.item_id)
      || case when coalesce(item_thoughts, '') <> ''
           then format('<p style="margin:0 0 16px;padding-left:14px;border-left:2px solid #e4e4e7;color:#71717a">“%s”</p>', public.esc_html(left(item_thoughts, 200)))
           else '' end;

  elsif new.type = 'taste' then
    select ta.note into taste_note from public.taste_approvals ta
     where ta.giver_id = new.actor_id and ta.receiver_id = new.profile_id;
    subj := public.email_subject(format('%s approves your taste', actor.name));
    body := format(
      '<p style="margin:0 0 16px">%s (<a href="https://myfavoriteapp.com/%s" style="color:#18181b">@%s</a>) approves your taste.</p>',
      public.esc_html(actor.name), actor.username, actor.username)
      || case when coalesce(taste_note, '') <> ''
           then format('<p style="margin:0 0 16px;padding-left:14px;border-left:2px solid #e4e4e7;color:#71717a">“%s”</p>', public.esc_html(taste_note))
           else '' end
      || format('<p style="margin:0"><a href="https://myfavoriteapp.com/%s" style="color:#18181b">Approve back →</a></p>', actor.username);

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
      'from', 'Favorite <hello@myfavoriteapp.com>',
      'to', jsonb_build_array(rcpt.email),
      'subject', subj,
      'html', public.email_shell(
        format('<p style="margin:0 0 16px">Hi %s,</p>', public.esc_html(rcpt.name))
        || body
        || public.email_footer(rcpt.id, rcpt.username, 'events'))
    )
  );
  return new;
exception when others then
  -- an email problem must never fail the follow/favorite/approval behind it
  raise notice 'activity email skipped: %', sqlerrm;
  return new;
end $$;

revoke all on function public.email_on_notification() from public, anon, authenticated;

-- ── 3) weekly digest (logic verbatim, markup new) ─────────────────────────────
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
              '<p style="margin:0 0 8px"><a href="https://myfavoriteapp.com/%s" style="color:#18181b">%s</a> favorited <em>%s</em> via you</p>',
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
              '<p style="margin:0 0 8px"><a href="https://myfavoriteapp.com/%s?item=%s" style="color:#18181b">%s</a> favorited <em>%s</em></p>',
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
      body := body || format('<p style="margin:0 0 16px">%s followed you this week.</p>', followers_line);
    end if;
    if spread_lines is not null then
      body := body
        || '<p style="margin:28px 0 10px;color:#a1a1aa;font-size:11px;font-weight:600;letter-spacing:0.1em">YOUR TASTE, SPREADING</p>'
        || spread_lines;
    end if;
    if friend_lines is not null then
      body := body
        || '<p style="margin:28px 0 10px;color:#a1a1aa;font-size:11px;font-weight:600;letter-spacing:0.1em">FROM PEOPLE YOU FOLLOW</p>'
        || friend_lines;
    end if;
    body := body
      || '<p style="margin:24px 0 0">Fresh picks are on your <a href="https://myfavoriteapp.com" style="color:#18181b">home page</a> every day.</p>';

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
        'from', 'Favorite <hello@myfavoriteapp.com>',
        'to', jsonb_build_array(rec.email),
        'subject', 'Your week on Favorite',
        'html', public.email_shell(
          format('<p style="margin:0 0 16px">Hi %s,</p>', public.esc_html(rec.name))
          || body
          || public.email_footer(rec.id, rec.username, 'digest'))
      )
    );
  end loop;
end $$;

revoke all on function public.send_weekly_digests() from public, anon, authenticated;

-- ── 4) monthly recap (logic verbatim, markup new; CTA becomes a button) ──────
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
        'from', 'Favorite <hello@myfavoriteapp.com>',
        'to', jsonb_build_array(rec.email),
        'subject', format('Your %s recap is ready', prev_label),
        'html', public.email_shell(
          format('<p style="margin:0 0 16px">Hi %s,</p>', public.esc_html(rec.name))
          || format(
               '<p style="margin:0 0 24px">%s favorites in %s — your recap card is ready to look back on (and post, if it turned out well).</p>',
               rec.saves, prev_label)
          || '<p style="margin:0"><a href="https://myfavoriteapp.com/recap" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 22px;border-radius:999px">See your month</a></p>'
          || public.email_footer(rec.id, rec.username, 'digest'))
      )
    );
  end loop;
end $$;

revoke all on function public.send_monthly_recaps() from public, anon, authenticated;
