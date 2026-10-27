-- migration29 — v2: profile header images, the daily-picks newsletter, and
-- lists in the browser extension. Additive only: v1 shares this database and
-- never reads any of it.

-- ── 1. profile header image ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists header_url text
  check (header_url is null or (char_length(header_url) <= 1000 and header_url ~* '^https://'));

-- ── 2. newsletter: Home's daily picks by email ─────────────────────────────
-- Visitors confirm by email (double opt-in); members subscribe their account
-- email in one click. Only the functions below touch these tables (RLS on,
-- no policies). Server-side calls prove themselves with app_secrets'
-- newsletter_key, so the token in a confirmation email never reaches the
-- browser that typed the address.
create table if not exists public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (char_length(email) between 3 and 200),
  profile_id      uuid references public.profiles (id) on delete set null,
  token           text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status          text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  confirm_sent_at timestamptz,
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));
alter table public.newsletter_subscribers enable row level security;

-- one row per sent day: the claim makes a double-fired cron a no-op
create table if not exists public.newsletter_issues (
  day        date primary key,
  picks      jsonb not null default '[]'::jsonb,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  recipients int not null default 0
);
alter table public.newsletter_issues enable row level security;

create or replace function public.newsletter_key_ok(p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_key, '') <> ''
     and p_key = (select value from public.app_secrets where name = 'newsletter_key')
$$;
revoke execute on function public.newsletter_key_ok(text) from public, anon, authenticated;

-- server: subscribe an address; says whether to send a confirmation (hourly cap)
create or replace function public.newsletter_subscribe(p_key text, p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row   public.newsletter_subscribers;
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 200 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_row from public.newsletter_subscribers where lower(email) = v_email for update;
  if not found then
    insert into public.newsletter_subscribers (email, confirm_sent_at)
    values (v_email, now()) returning * into v_row;
    return jsonb_build_object('status', 'pending', 'send', true, 'token', v_row.token);
  end if;
  if v_row.status = 'active' then
    return jsonb_build_object('status', 'active', 'send', false);
  end if;
  if v_row.confirm_sent_at > now() - interval '1 hour' then
    return jsonb_build_object('status', 'pending', 'send', false);
  end if;
  update public.newsletter_subscribers
     set status = 'pending', confirm_sent_at = now()
   where id = v_row.id;
  return jsonb_build_object('status', 'pending', 'send', true, 'token', v_row.token);
end $$;

-- anyone with the emailed token: confirm / unsubscribe
create or replace function public.newsletter_confirm(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  update public.newsletter_subscribers
     set status = 'active', confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = null
   where token = p_token and status = 'pending'
  returning status into v_status;
  if v_status is null then
    select status into v_status from public.newsletter_subscribers where token = p_token;
  end if;
  return coalesce(v_status, 'unknown');
end $$;

create or replace function public.newsletter_unsubscribe(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  update public.newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = now()
   where token = p_token and status <> 'unsubscribed';
  if exists (select 1 from public.newsletter_subscribers where token = p_token) then
    return 'unsubscribed';
  end if;
  return 'unknown';
end $$;

-- members: their account email's status, and a one-click switch (the
-- account email is already verified, so no confirmation round trip)
create or replace function public.newsletter_me()
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_status text;
begin
  if auth.uid() is null then return 'signed-out'; end if;
  select s.status into v_status
    from public.newsletter_subscribers s
    join auth.users u on lower(u.email) = lower(s.email)
   where u.id = auth.uid();
  return coalesce(v_status, 'none');
end $$;

create or replace function public.newsletter_set_me(p_on boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email   text;
  v_profile uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if coalesce(v_email, '') = '' then raise exception 'no email on this account'; end if;
  select id into v_profile from public.profiles where user_id = auth.uid();
  if p_on then
    insert into public.newsletter_subscribers (email, profile_id, status, confirmed_at)
    values (v_email, v_profile, 'active', now())
    on conflict ((lower(email))) do update
      set status = 'active',
          confirmed_at = coalesce(newsletter_subscribers.confirmed_at, now()),
          unsubscribed_at = null,
          profile_id = coalesce(newsletter_subscribers.profile_id, excluded.profile_id);
    return 'active';
  end if;
  update public.newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = now()
   where lower(email) = v_email and status <> 'unsubscribed';
  return 'unsubscribed';
end $$;

-- server: the day's send — claim (once per day), recipients, record
create or replace function public.newsletter_claim(p_key text, p_day date)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  insert into public.newsletter_issues (day) values (p_day) on conflict (day) do nothing;
  return found;
end $$;

create or replace function public.newsletter_recipients(p_key text)
returns table (email text, token text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  return query
    select s.email, s.token from public.newsletter_subscribers s
     where s.status = 'active' order by s.created_at;
end $$;

create or replace function public.newsletter_finish(p_key text, p_day date, p_picks jsonb, p_recipients int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  update public.newsletter_issues
     set picks = coalesce(p_picks, '[]'::jsonb), sent_at = now(), recipients = coalesce(p_recipients, 0)
   where day = p_day;
end $$;

-- ── 3. lists in the browser extension ──────────────────────────────────────
-- Same auth as extension_save (migration24): a personal token, hashed. The
-- popup lists your lists (with "already here" marks for the current page),
-- saves to or removes from one, and can start a new one. Budgets are charged
-- by hand because anon calls skip the auth.uid()-based budget triggers.
create or replace function public.extension_profile(p_token text)
returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select t.profile_id from public.extension_tokens t
   where t.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
revoke execute on function public.extension_profile(text) from public, anon, authenticated;

create or replace function public.extension_charge(p_profile uuid, p_route text, p_cap int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_hits int;
begin
  select user_id into v_user from public.profiles where id = p_profile;
  if v_user is null then return false; end if;
  insert into public.api_usage as u (user_id, day, route, hits)
  values (v_user, current_date, p_route, 1)
  on conflict (user_id, day, route) do update set hits = u.hits + 1
  returning u.hits into v_hits;
  return v_hits <= p_cap;
end $$;
revoke execute on function public.extension_charge(uuid, text, int) from public, anon, authenticated;

create or replace function public.extension_lists(p_token text, p_url text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := nullif(trim(coalesce(p_url, '')), '');
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  return jsonb_build_object(
    'status', 'ok',
    'favorited', v_url is not null and exists (
      select 1 from public.items i where i.profile_id = v_profile and i.view_url = v_url),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'title', l.title,
               'is_public', l.is_public,
               'count', (select count(*) from public.list_items c where c.list_id = l.id),
               'has', v_url is not null and exists (
                 select 1 from public.list_items h where h.list_id = l.id and h.view_url = v_url))
             order by l.updated_at desc)
        from public.lists l
       where l.profile_id = v_profile), '[]'::jsonb));
end $$;

create or replace function public.extension_save_to_list(
  p_token     text,
  p_list_id   uuid,
  p_url       text,
  p_title     text,
  p_site      text default '',
  p_image_url text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := trim(coalesce(p_url, ''));
  v_title   text := left(trim(coalesce(p_title, '')), 300);
  v_img     text := nullif(trim(coalesce(p_image_url, '')), '');
  v_id      uuid;
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if not exists (select 1 from public.lists where id = p_list_id and profile_id = v_profile) then
    return jsonb_build_object('status', 'error', 'message', 'That list is gone.');
  end if;
  if v_url !~* '^https?://' or length(v_url) > 2048 or v_title = '' then
    return jsonb_build_object('status', 'error', 'message', 'Missing or invalid page URL/title.');
  end if;
  if v_img is not null and (v_img !~* '^https?://' or length(v_img) > 2048) then
    v_img := null;
  end if;
  if exists (
    select 1 from public.list_items li
     where li.list_id = p_list_id
       and (li.view_url = v_url or li.work_key = 'article|' || lower(btrim(v_title)))
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if not public.extension_charge(v_profile, 'w:saves', 500) then
    return jsonb_build_object('status', 'error', 'message', 'Daily save limit reached.');
  end if;
  update public.extension_tokens set last_used_at = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  insert into public.list_items (list_id, profile_id, media_type, title, creator, image_url, view_url)
  values (p_list_id, v_profile, 'article', v_title, left(trim(coalesce(p_site, '')), 120), v_img, v_url)
  returning id into v_id;
  return jsonb_build_object('status', 'added', 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('status', 'duplicate');
end $$;

create or replace function public.extension_remove_from_list(p_token text, p_list_id uuid, p_url text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_profile uuid := public.extension_profile(p_token);
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  delete from public.list_items
   where list_id = p_list_id and profile_id = v_profile and view_url = trim(coalesce(p_url, ''));
  return jsonb_build_object('status', 'removed');
end $$;

create or replace function public.extension_create_list(p_token text, p_title text, p_public boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_title   text := left(btrim(coalesce(p_title, '')), 80);
  v_base    text;
  v_slug    text;
  v_n       int := 1;
  v_id      uuid;
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if v_title = '' then return jsonb_build_object('status', 'error', 'message', 'Give your list a name.'); end if;
  v_base := left(btrim(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '-'), 70);
  if v_base = '' then v_base := 'list'; end if;
  v_slug := v_base;
  while exists (select 1 from public.lists where profile_id = v_profile and slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  if not public.extension_charge(v_profile, 'w:lists', 50) then
    return jsonb_build_object('status', 'error', 'message', 'Daily list limit reached.');
  end if;
  insert into public.lists (profile_id, title, slug, is_public)
  values (v_profile, v_title, v_slug, coalesce(p_public, true))
  returning id into v_id;
  return jsonb_build_object('status', 'created', 'id', v_id, 'title', v_title, 'is_public', coalesce(p_public, true));
end $$;
