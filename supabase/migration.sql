-- myfavoriteapp.com — schema v1 (multiplayer-ready, single owner for now)

create extension if not exists pgcrypto;

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users (id) on delete set null,
  claim_email  text unique,                -- profile auto-links to this email on first sign-in
  username     text unique not null check (username ~ '^[a-z0-9_]{2,30}$'),
  display_name text not null default '',
  bio          text not null default '',
  avatar_url   text,
  socials      jsonb not null default '[]'::jsonb,   -- [{label, url}]
  created_at   timestamptz not null default now()
);

-- ── items ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.media_type as enum
    ('book','movie','tv','music','podcast','video','article','photo','other');
exception when duplicate_object then null; end $$;
-- upgrading an existing DB: alter type public.media_type add value if not exists 'other';
-- (must run outside a transaction, so it's not part of this file's batch)

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  media_type  public.media_type not null,
  title       text not null,
  creator     text not null default '',            -- author / director / artist
  description text not null default '',            -- the owner's thoughts
  image_url   text,
  view_url    text,
  metadata    jsonb not null default '{}'::jsonb,  -- year, source ids, etc.
  sort_order  int not null default 0,
  pos_x       real,                                -- freeform canvas position (fractions)
  pos_y       real,
  pos_rot     real,
  created_at  timestamptz not null default now()
);

create index if not exists items_profile_idx on public.items (profile_id, sort_order);

-- ── row level security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.items    enable row level security;

drop policy if exists "profiles are public"      on public.profiles;
drop policy if exists "owner updates profile"    on public.profiles;
drop policy if exists "items are public"         on public.items;
drop policy if exists "owner inserts items"      on public.items;
drop policy if exists "owner updates items"      on public.items;
drop policy if exists "owner deletes items"      on public.items;

create policy "profiles are public"   on public.profiles for select using (true);
create policy "owner updates profile" on public.profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "items are public"    on public.items for select using (true);
create policy "owner inserts items" on public.items for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "owner updates items" on public.items for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "owner deletes items" on public.items for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

-- ── claim trigger: link profile to auth user on first sign-in ───────────────
create or replace function public.claim_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set user_id = new.id
   where claim_email = lower(new.email) and user_id is null;
  return new;
end $$;

drop trigger if exists claim_profile_on_signup on auth.users;
create trigger claim_profile_on_signup
  after insert on auth.users
  for each row execute function public.claim_profile();

-- ── storage: public media bucket, owner-scoped writes ───────────────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media is public"       on storage.objects;
drop policy if exists "owner uploads media"   on storage.objects;
drop policy if exists "owner updates media"   on storage.objects;
drop policy if exists "owner deletes media"   on storage.objects;

create policy "media is public" on storage.objects for select
  using (bucket_id = 'media');
create policy "owner uploads media" on storage.objects for insert
  with check (bucket_id = 'media' and auth.role() = 'authenticated');
create policy "owner updates media" on storage.objects for update
  using (bucket_id = 'media' and owner = auth.uid());
create policy "owner deletes media" on storage.objects for delete
  using (bucket_id = 'media' and owner = auth.uid());

-- ── seed the owner profile ───────────────────────────────────────────────────
insert into public.profiles (claim_email, username, display_name, bio, socials)
values (
  'builtbyabdul@gmail.com',
  'abdulmir',
  'Abdul Mir',
  'ceo of favorite. chill, humble and handsome guy.',
  '[{"label":"x","url":"https://x.com/creativesoldr"},
    {"label":"instagram","url":"https://instagram.com/creativesoldr"}]'::jsonb
)
on conflict (username) do nothing;
