-- Radar: the private "on my radar" shelf. A favorite is a completed judgment;
-- radar is where something intriguing waits without becoming a claim. Rows are
-- owner-private, deliberately unnumbered in the UI (never a guilt pile), and
-- feed the taste engine as interest signal. Idempotent.

create table if not exists public.radar_items (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  media_type     text not null,
  title          text not null,
  creator        text not null default '',
  image_url      text,
  view_url       text,
  metadata       jsonb not null default '{}'::jsonb,
  canonical_id   text,
  -- where it was spotted — carried into the library row if it's promoted
  via_profile_id uuid references public.profiles (id) on delete set null,
  source_item_id uuid references public.items (id) on delete set null,
  created_at     timestamptz not null default now(),
  -- putting the same thing on your radar twice is a no-op
  unique (profile_id, media_type, title)
);

create index if not exists radar_items_owner_idx
  on public.radar_items (profile_id, created_at desc);

alter table public.radar_items enable row level security;

-- radar is private to its owner — it never renders on the public page
drop policy if exists "own radar read"   on public.radar_items;
drop policy if exists "own radar insert" on public.radar_items;
drop policy if exists "own radar delete" on public.radar_items;

create policy "own radar read" on public.radar_items for select
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own radar insert" on public.radar_items for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "own radar delete" on public.radar_items for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

-- radar inserts share the daily items write budget (enforce_social_budget's
-- default branch charges w:items for any non-follows/taste table)
drop trigger if exists budget_radar on public.radar_items;
create trigger budget_radar
  before insert on public.radar_items
  for each row execute function public.enforce_social_budget();
