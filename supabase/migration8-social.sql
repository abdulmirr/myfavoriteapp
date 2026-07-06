-- social core: asymmetric follows (replacing mutual friendships),
-- Favorite-verb provenance, and trigger-written notifications.

-- ── 1) follows ────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

drop policy if exists "follows are public"   on public.follows;
drop policy if exists "follow as yourself"   on public.follows;
drop policy if exists "unfollow as yourself" on public.follows;

create policy "follows are public" on public.follows for select using (true);
create policy "follow as yourself" on public.follows for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = follower_id and p.user_id = auth.uid()));
create policy "unfollow as yourself" on public.follows for delete
  using (exists (select 1 from public.profiles p
                 where p.id = follower_id and p.user_id = auth.uid()));

-- backfill: each mutual friendship becomes two follows, then friendships go away
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'friendships') then
    insert into public.follows (follower_id, followee_id, created_at)
    select a, b, created_at from public.friendships
    union all
    select b, a, created_at from public.friendships
    on conflict do nothing;
    drop table public.friendships;
  end if;
end $$;

-- ── 2) Favorite-verb provenance ───────────────────────────────────────────────
-- who this favorite was taken from ("via @user") and which exact item
alter table public.items
  add column if not exists via_profile_id uuid references public.profiles (id) on delete set null;
alter table public.items
  add column if not exists source_item_id uuid references public.items (id) on delete set null;

create index if not exists items_via_idx on public.items (via_profile_id)
  where via_profile_id is not null;

-- ── 3) notifications ──────────────────────────────────────────────────────────
-- written ONLY by security-definer triggers; recipients read/mark/delete.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade, -- recipient
  type       text not null check (type in ('follow', 'favorited')),
  actor_id   uuid references public.profiles (id) on delete cascade,
  item_id    uuid references public.items (id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "own notifications read"   on public.notifications;
drop policy if exists "own notifications update" on public.notifications;
drop policy if exists "own notifications delete" on public.notifications;

create policy "own notifications read" on public.notifications for select
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own notifications update" on public.notifications for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own notifications delete" on public.notifications for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (profile_id, type, actor_id)
  values (new.followee_id, 'follow', new.follower_id);
  return new;
end $$;

drop trigger if exists notify_on_follow on public.follows;
create trigger notify_on_follow
  after insert on public.follows
  for each row execute function public.notify_follow();

-- unfollow retracts its notification (kills follow/unfollow ping abuse)
create or replace function public.denotify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
   where profile_id = old.followee_id and actor_id = old.follower_id and type = 'follow';
  return old;
end $$;

drop trigger if exists denotify_on_unfollow on public.follows;
create trigger denotify_on_unfollow
  after delete on public.follows
  for each row execute function public.denotify_follow();

-- someone favorited a piece from your library → the flattering one
create or replace function public.notify_favorited()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.via_profile_id is not null and new.via_profile_id <> new.profile_id then
    insert into public.notifications (profile_id, type, actor_id, item_id)
    values (new.via_profile_id, 'favorited', new.profile_id, new.id);
  end if;
  return new;
end $$;

drop trigger if exists notify_on_favorited on public.items;
create trigger notify_on_favorited
  after insert on public.items
  for each row execute function public.notify_favorited();
