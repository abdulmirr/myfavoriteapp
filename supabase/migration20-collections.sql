-- Collections: curator-named shelves ("cooking books", "2025 canon") that
-- live on the public page and filter the grid. An item can sit in many
-- collections; deleting a collection never touches its items. Idempotent.

create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (profile_id, name)
);

create index if not exists collections_owner_idx
  on public.collections (profile_id, created_at);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id       uuid not null references public.items (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, item_id)
);

create index if not exists collection_items_item_idx
  on public.collection_items (item_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

-- collections are part of the public page — world-readable, owner-writable
drop policy if exists "collections public read"  on public.collections;
drop policy if exists "collections owner insert" on public.collections;
drop policy if exists "collections owner update" on public.collections;
drop policy if exists "collections owner delete" on public.collections;

create policy "collections public read" on public.collections for select
  using (true);
create policy "collections owner insert" on public.collections for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "collections owner update" on public.collections for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "collections owner delete" on public.collections for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

drop policy if exists "collection items public read"  on public.collection_items;
drop policy if exists "collection items owner insert" on public.collection_items;
drop policy if exists "collection items owner delete" on public.collection_items;

create policy "collection items public read" on public.collection_items for select
  using (true);
-- membership writes require owning the collection AND the item belonging to
-- the same profile — you can't shelve someone else's rows into your shelf
create policy "collection items owner insert" on public.collection_items for insert
  with check (exists (
    select 1
      from public.collections c
      join public.profiles p on p.id = c.profile_id and p.user_id = auth.uid()
      join public.items i on i.id = item_id and i.profile_id = c.profile_id
     where c.id = collection_id
  ));
create policy "collection items owner delete" on public.collection_items for delete
  using (exists (
    select 1
      from public.collections c
      join public.profiles p on p.id = c.profile_id and p.user_id = auth.uid()
     where c.id = collection_id
  ));

-- creating shelves shares the daily items write budget
drop trigger if exists budget_collections on public.collections;
create trigger budget_collections
  before insert on public.collections
  for each row execute function public.enforce_social_budget();
