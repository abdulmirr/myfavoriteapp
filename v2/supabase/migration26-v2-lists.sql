-- Favorite v2: lists (playlists of media), daily picks, feedback, and the
-- feed's one-row-per-work read. Additive only — v1 (repo root) shares this
-- database and keeps working untouched. Idempotent: safe to re-run.

-- ── lists ────────────────────────────────────────────────────────────────────
-- A list is a named, ordered collection of works ("Check later", "Fiction
-- books that made me cry", "10/10 albums"). Public lists render on the
-- profile and feed "Saved by…" on cards; private lists are owner-only.
create table if not exists public.lists (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 1 and 80),
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description     text not null default '' check (char_length(description) <= 280),
  is_public       boolean not null default true,
  show_added      boolean not null default true,
  cover_image_url text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, slug)
);

create index if not exists lists_owner_idx on public.lists (profile_id, updated_at desc);

-- A list item is a snapshot of the work (like radar rows), so any work can be
-- listed whether or not anyone has favorited it. work_key is the same identity
-- the feed groups by: canonical id when known, else type + normalized title.
create table if not exists public.list_items (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.lists (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  media_type     text not null,
  title          text not null check (char_length(title) between 1 and 500),
  creator        text not null default '',
  image_url      text,
  view_url       text,
  metadata       jsonb not null default '{}'::jsonb,
  canonical_id   text,
  note           text not null default '' check (char_length(note) <= 280),
  -- owner-controlled order; ascending. New saves land on top (see default).
  position       double precision not null default (-extract(epoch from clock_timestamp())),
  via_profile_id uuid references public.profiles (id) on delete set null,
  source_item_id uuid references public.items (id) on delete set null,
  work_key       text generated always as
                   (coalesce(canonical_id, media_type || '|' || lower(btrim(title)))) stored,
  created_at     timestamptz not null default now(),
  unique (list_id, work_key)
);

create index if not exists list_items_list_idx on public.list_items (list_id, position);
create index if not exists list_items_owner_idx on public.list_items (profile_id, created_at desc);
create index if not exists list_items_work_idx on public.list_items (work_key);

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

drop policy if exists "lists read"   on public.lists;
drop policy if exists "lists insert" on public.lists;
drop policy if exists "lists update" on public.lists;
drop policy if exists "lists delete" on public.lists;

create policy "lists read" on public.lists for select
  using (is_public or exists (select 1 from public.profiles p
                              where p.id = profile_id and p.user_id = auth.uid()));
create policy "lists insert" on public.lists for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "lists update" on public.lists for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "lists delete" on public.lists for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

drop policy if exists "list items read"   on public.list_items;
drop policy if exists "list items insert" on public.list_items;
drop policy if exists "list items update" on public.list_items;
drop policy if exists "list items delete" on public.list_items;

-- visible when the parent list is (lists' own RLS applies inside the subquery)
create policy "list items read" on public.list_items for select
  using (exists (select 1 from public.lists l where l.id = list_id));
-- writes: you own the list, and the row's profile_id is the list's owner
create policy "list items insert" on public.list_items for insert
  with check (exists (
    select 1 from public.lists l
      join public.profiles p on p.id = l.profile_id and p.user_id = auth.uid()
     where l.id = list_id and l.profile_id = profile_id));
create policy "list items update" on public.list_items for update
  using (exists (
    select 1 from public.lists l
      join public.profiles p on p.id = l.profile_id and p.user_id = auth.uid()
     where l.id = list_id))
  with check (exists (
    select 1 from public.lists l
      join public.profiles p on p.id = l.profile_id and p.user_id = auth.uid()
     where l.id = list_id and l.profile_id = profile_id));
create policy "list items delete" on public.list_items for delete
  using (exists (
    select 1 from public.lists l
      join public.profiles p on p.id = l.profile_id and p.user_id = auth.uid()
     where l.id = list_id));

-- a list's "updated" date follows its contents
create or replace function public.touch_list()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.lists set updated_at = now()
   where id = coalesce(new.list_id, old.list_id);
  return null;
end $$;

drop trigger if exists touch_list_on_item on public.list_items;
create trigger touch_list_on_item
  after insert or update or delete on public.list_items
  for each row execute function public.touch_list();

-- ── budgets: lists and saves get their own daily lanes ──────────────────────
-- Same function v1 uses (follows/taste/items/radar/collections keep their
-- exact behavior); two new branches for the v2 tables.
create or replace function public.enforce_social_budget()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- server-side/seed paths
  if tg_table_name = 'follows' then
    if not public.bump_api_usage('w:follows', 100) then
      raise exception 'daily follow limit reached';
    end if;
  elsif tg_table_name = 'taste_approvals' then
    if not public.bump_api_usage('w:taste', 100) then
      raise exception 'daily approval limit reached';
    end if;
  elsif tg_table_name = 'lists' then
    if not public.bump_api_usage('w:lists', 50) then
      raise exception 'daily list limit reached';
    end if;
  elsif tg_table_name = 'list_items' then
    if not public.bump_api_usage('w:saves', 500) then
      raise exception 'daily save limit reached';
    end if;
  else
    if not public.bump_api_usage('w:items', 300) then
      raise exception 'daily favorite limit reached';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists budget_lists on public.lists;
create trigger budget_lists
  before insert on public.lists
  for each row execute function public.enforce_social_budget();

drop trigger if exists budget_list_items on public.list_items;
create trigger budget_list_items
  before insert on public.list_items
  for each row execute function public.enforce_social_budget();

-- ── daily picks (v2's For You; v1's `recommendations` table is untouched) ───
create table if not exists public.daily_picks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);

alter table public.daily_picks enable row level security;

drop policy if exists "own picks read"   on public.daily_picks;
drop policy if exists "own picks insert" on public.daily_picks;
drop policy if exists "own picks update" on public.daily_picks;
drop policy if exists "own picks delete" on public.daily_picks;

create policy "own picks read" on public.daily_picks for select
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own picks insert" on public.daily_picks for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "own picks update" on public.daily_picks for update
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own picks delete" on public.daily_picks for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

-- ── feedback (the "Message Favorite" bubble) ─────────────────────────────────
-- Write-only from the app; read in the dashboard. The route also emails it.
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  email      text check (email is null or char_length(email) <= 200),
  topic      text not null check (topic in ('bug', 'idea', 'submission', 'other')),
  message    text not null check (char_length(btrim(message)) between 1 and 2000),
  page       text check (page is null or char_length(page) <= 300),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
drop policy if exists "anyone sends feedback" on public.feedback;
create policy "anyone sends feedback" on public.feedback for insert
  with check (profile_id is null
              or exists (select 1 from public.profiles p
                         where p.id = profile_id and p.user_id = auth.uid()));

-- ── reserved usernames: v2's top-level routes ───────────────────────────────
create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql immutable as $$
  select p_name = any (array[
    'add','explore','welcome','signin','signup','profile','settings','privacy',
    'terms','auth','api','home','favorites','favorite','admin','about',
    'help','item','items','notifications','search','import','landing','recap',
    'extension',
    -- v2
    'feed','lists','list','activity','saved','today','login','logout',
    'discover','archive','new'
  ]);
$$;

-- ── the feed: one row per distinct work, with who favorited / saved it ──────
-- Grouping key: canonical id when known; rows without one adopt the canonical
-- id another row of the same type + title carries; else type + title.
-- Invoker rights: items are public, and only PUBLIC list saves are counted
-- (explicitly, so a signed-in caller's own private lists never leak in).
drop function if exists public.feed_works(uuid, text[], boolean, int, int);
create or replace function public.feed_works(
  p_viewer         uuid    default null,
  p_types          text[]  default null,
  p_following_only boolean default false,
  p_limit          int     default 30,
  p_offset         int     default 0
)
returns table (
  work_key      text,
  media_type    text,
  title         text,
  creator       text,
  image_url     text,
  view_url      text,
  year          text,
  canonical_id  text,
  item_id       uuid,
  item_profile_id uuid,
  first_at      timestamptz,
  last_at       timestamptz,
  fav_count     int,
  save_count    int,
  favoriter_ids uuid[],
  saver_ids     uuid[],
  top_profiles  jsonb,
  friend_hits   int,
  mine          boolean
)
language sql stable set search_path = public as $$
  with canon as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2
  ),
  -- items.media_type is an enum; everything downstream works in text
  fav as (
    select coalesce(i.canonical_id, canon.c,
                    i.media_type::text || '|' || lower(btrim(i.title))) k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator,
           i.image_url, i.view_url, i.metadata, i.canonical_id, i.created_at
      from items i
      left join canon on canon.mt = i.media_type::text and canon.t = lower(btrim(i.title))
     where i.media_type::text <> 'photo'
  ),
  -- one row per (work, person): someone with two copies counts once
  fav_people as (
    select distinct on (k, profile_id) k, profile_id, created_at
      from fav
     order by k, profile_id, created_at desc
  ),
  saves as (
    select distinct on (li.work_key, li.profile_id) li.work_key k, li.profile_id, li.created_at
      from list_items li
      join lists l on l.id = li.list_id and l.is_public
     order by li.work_key, li.profile_id, li.created_at desc
  ),
  -- the card shows the newest copy that has artwork (covers improve over time)
  rep as (
    select distinct on (k) k, id, profile_id, media_type, title, creator, image_url, view_url,
           metadata ->> 'year' as year, canonical_id
      from fav
     order by k, (image_url is null), created_at desc
  ),
  agg as (
    select fp.k,
           min(fp.created_at) first_at,
           max(fp.created_at) last_at,
           count(*)::int fav_count,
           (array_agg(fp.profile_id order by fp.created_at desc))[1:100] favoriter_ids
      from fav_people fp
     group by fp.k
  ),
  sagg as (
    select s.k, count(*)::int save_count,
           (array_agg(s.profile_id order by s.created_at desc))[1:100] saver_ids
      from saves s
     group by s.k
  ),
  following as (
    select followee_id from follows where follower_id = p_viewer
  ),
  scored as (
    select r.k, r.media_type, r.title, r.creator, r.image_url, r.view_url, r.year,
           r.canonical_id, r.id item_id, r.profile_id item_profile_id, a.first_at, a.last_at, a.fav_count,
           coalesce(s.save_count, 0) save_count, a.favoriter_ids,
           coalesce(s.saver_ids, '{}') saver_ids,
           (select count(*)::int from (
              select unnest(a.favoriter_ids) x
              union
              select unnest(coalesce(s.saver_ids, '{}'))
            ) u where u.x in (select followee_id from following)) friend_hits,
           (p_viewer is not null and p_viewer = any (a.favoriter_ids)) mine,
           -- when someone you follow last favorited OR saved it
           (select max(t.created_at) from (
              select fp.created_at from fav_people fp
               where fp.k = r.k and fp.profile_id in (select followee_id from following)
              union all
              select sv.created_at from saves sv
               where sv.k = r.k and sv.profile_id in (select followee_id from following)
            ) t) friend_last
      from rep r
      join agg a on a.k = r.k
      left join sagg s on s.k = r.k
     where (p_types is null or r.media_type = any (p_types))
  ),
  -- bursts: one person adding 40 albums in an afternoon shouldn't own the top
  -- of everyone's feed. Each further work from the same latest favoriter
  -- slides back 3 days, so the feed stays recent but interleaves people;
  -- works several people love lift a little (2 days per extra person, max 8).
  ranked as (
    select sc.*,
           coalesce(sc.friend_last, sc.last_at)
             - (row_number() over (partition by sc.favoriter_ids[1]
                                   order by coalesce(sc.friend_last, sc.last_at) desc) - 1)
               * interval '3 days'
             + (least(sc.fav_count + sc.save_count, 5) - 1) * interval '2 days' as rank_at
      from scored sc
     where (not p_following_only or sc.friend_hits > 0)
  )
  select rk.k, rk.media_type, rk.title, rk.creator, rk.image_url, rk.view_url, rk.year,
         rk.canonical_id, rk.item_id, rk.item_profile_id, rk.first_at, rk.last_at, rk.fav_count, rk.save_count,
         rk.favoriter_ids, rk.saver_ids,
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'username', p.username,
                   'display_name', p.display_name, 'avatar_url', p.avatar_url)
                 order by array_position(rk.favoriter_ids, p.id)), '[]'::jsonb)
            from profiles p
           where p.id = any (rk.favoriter_ids[1:3])) top_profiles,
         rk.friend_hits, rk.mine
    from ranked rk
   order by rk.mine asc,
            (rk.friend_hits > 0) desc,
            rk.rank_at desc,
            rk.k
   limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

grant execute on function public.feed_works(uuid, text[], boolean, int, int) to anon, authenticated;
