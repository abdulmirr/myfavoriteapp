-- Monthly recap ritual: on the 1st, tell people with a card-worthy month
-- (3+ saves) that their recap is ready. Rides the digest opt-in and the
-- digest unsubscribe scope — it's the same weekly-rhythm relationship,
-- just a monthly beat. Idempotent.

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
  loop
    if rec.saves < 3 then continue; end if;

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
    insert into public.email_log (profile_id, kind) values (rec.id, 'recap');
  end loop;
end $$;

revoke all on function public.send_monthly_recaps() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'monthly-recap') then
    perform cron.unschedule('monthly-recap');
  end if;
  perform cron.schedule('monthly-recap', '0 15 1 * *', 'select public.send_monthly_recaps()');
end $$;
