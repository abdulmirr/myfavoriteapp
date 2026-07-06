-- hardening for public launch: private profile columns, confirmed-only claims,
-- per-user API rate limits, owner-scoped storage, recommendations claim-row.

-- ── 1) private profile data ──────────────────────────────────────────────────
-- claim_email and taste_note were world-readable on profiles (select using true).
create table if not exists public.profile_private (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  claim_email text unique,
  taste_note  text not null default ''
);

alter table public.profile_private enable row level security;

drop policy if exists "owner reads private"   on public.profile_private;
drop policy if exists "owner inserts private" on public.profile_private;
drop policy if exists "owner updates private" on public.profile_private;

create policy "owner reads private" on public.profile_private for select
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "owner inserts private" on public.profile_private for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "owner updates private" on public.profile_private for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

-- move the data, then drop the public columns (no-op when rerun)
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'claim_email') then
    insert into public.profile_private (profile_id, claim_email, taste_note)
    select id, claim_email, coalesce(taste_note, '') from public.profiles
    on conflict (profile_id) do update
      set claim_email = excluded.claim_email,
          taste_note  = excluded.taste_note;
    alter table public.profiles drop column claim_email;
    alter table public.profiles drop column if exists taste_note;
  end if;
end $$;

-- ── 2) claim/auto-profile trigger: verified emails only ──────────────────────
-- Email confirmation is now ON. Claiming a pre-seeded profile (or creating a
-- fresh one) waits until the address is verified, so registering someone
-- else's email can no longer steal their profile. OAuth users arrive verified.
create or replace function public.claim_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  if new.email_confirmed_at is null then return new; end if;

  update public.profiles p
     set user_id = new.id
   where p.user_id is null
     and p.id = (select pp.profile_id from public.profile_private pp
                 where pp.claim_email = lower(new.email));

  if not found and not exists (select 1 from public.profiles where user_id = new.id) then
    base := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g');
    if length(base) < 2 then base := 'user'; end if;
    base := left(base, 24);
    candidate := base;
    while exists (select 1 from public.profiles where username = candidate) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;
    insert into public.profiles (user_id, username, display_name)
    values (new.id, candidate, split_part(new.email, '@', 1));
  end if;

  -- every owned profile gets a private row for settings to write into
  insert into public.profile_private (profile_id)
  select p.id from public.profiles p where p.user_id = new.id
  on conflict (profile_id) do nothing;

  return new;
end $$;

drop trigger if exists claim_profile_on_signup on auth.users;
create trigger claim_profile_on_signup
  after insert on auth.users
  for each row execute function public.claim_profile();

drop trigger if exists claim_profile_on_confirm on auth.users;
create trigger claim_profile_on_confirm
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.claim_profile();

-- ── 3) per-user daily API budgets ────────────────────────────────────────────
-- RLS with no policies: only the security-definer function can touch the table.
create table if not exists public.api_usage (
  user_id uuid not null,
  day     date not null,
  route   text not null,
  hits    int  not null default 0,
  primary key (user_id, day, route)
);

alter table public.api_usage enable row level security;

create or replace function public.bump_api_usage(p_route text, p_limit int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.api_usage as u (user_id, day, route, hits)
  values (auth.uid(), current_date, p_route, 1)
  on conflict (user_id, day, route) do update set hits = u.hits + 1
  returning u.hits into v_hits;
  return v_hits <= p_limit;
end $$;

revoke all on function public.bump_api_usage(text, int) from public;
revoke all on function public.bump_api_usage(text, int) from anon;
grant execute on function public.bump_api_usage(text, int) to authenticated;

-- ── 4) storage: uploads scoped to the uploader's own profile folder ─────────
drop policy if exists "owner uploads media" on storage.objects;
create policy "owner uploads media" on storage.objects for insert
  with check (
    bucket_id = 'media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in
        (select p.id::text from public.profiles p where p.user_id = auth.uid())
  );

update storage.buckets
   set file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']
 where id = 'media';

-- ── 5) recommendations: owners may update (claim-row pattern) ────────────────
-- The API inserts an empty claim row first, then fills it after the model call,
-- so parallel first loads spend exactly one Anthropic call.
drop policy if exists "own recommendations update" on public.recommendations;
create policy "own recommendations update" on public.recommendations for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
