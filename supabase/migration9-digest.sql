-- weekly digest: opt-in email sent by pg_cron + pg_net straight from Postgres.
-- One email, Mondays 15:00 UTC: new followers, favorites that spread from your
-- library, and a nudge that the week's picks are ready.

alter table public.profile_private
  add column if not exists digest_opt_in boolean not null default false;

-- secrets readable only by definer functions (RLS on, zero policies)
create table if not exists public.app_secrets (
  name  text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.send_weekly_digests()
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  resend_key text;
  lines text;
begin
  select value into resend_key from public.app_secrets where name = 'resend_api_key';
  if resend_key is null then
    raise notice 'digest skipped: no resend_api_key in app_secrets';
    return;
  end if;

  for rec in
    select p.username,
           coalesce(nullif(p.display_name, ''), '@' || p.username) as name,
           u.email,
           (select count(*) from public.follows f
             where f.followee_id = p.id and f.created_at > now() - interval '7 days') as new_followers,
           (select count(*) from public.items i
             where i.via_profile_id = p.id and i.created_at > now() - interval '7 days') as spreads
      from public.profiles p
      join public.profile_private pp on pp.profile_id = p.id and pp.digest_opt_in
      join auth.users u on u.id = p.user_id
     where u.email is not null
  loop
    lines := '';
    if rec.new_followers > 0 then
      lines := lines || format('<p>%s new %s followed you.</p>',
        rec.new_followers, case when rec.new_followers = 1 then 'person' else 'people' end);
    end if;
    if rec.spreads > 0 then
      lines := lines || format('<p>%s favorite%s spread from your library this week.</p>',
        rec.spreads, case when rec.spreads = 1 then '' else 's' end);
    end if;

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
          || format('<p>Hi %s,</p>', rec.name)
          || lines
          || '<p>Your Monday picks are ready on the <a href="https://myfavoriteapp.com" style="color:#18181b">home page</a>.</p>'
          || format('<p style="color:#a1a1aa">— Favorites · <a href="https://myfavoriteapp.com/%s" style="color:#a1a1aa">your page</a> · turn this email off in Settings</p>', rec.username)
          || '</div>'
      )
    );
  end loop;
end $$;

revoke all on function public.send_weekly_digests() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'weekly-digest') then
    perform cron.unschedule('weekly-digest');
  end if;
  perform cron.schedule('weekly-digest', '0 15 * * 1', 'select public.send_weekly_digests()');
end $$;
