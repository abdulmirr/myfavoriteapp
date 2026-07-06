-- home page: weekly AI recommendations, cached one row per profile per week

create table if not exists public.recommendations (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, week_start)
);

alter table public.recommendations enable row level security;

drop policy if exists "own recommendations read"  on public.recommendations;
drop policy if exists "own recommendations write" on public.recommendations;

-- recommendations are personal: only the profile's owner can read or create them
create policy "own recommendations read" on public.recommendations for select
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own recommendations write" on public.recommendations for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));

-- following feed queries items by recency across many profiles
create index if not exists items_created_at_idx on public.items (created_at desc);
