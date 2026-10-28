-- Migration 35 (v2, 2026-10-28): Discover, simpler. Two v2-only read
-- functions change shape; nothing else does, and v1 calls neither.
--
--   discover_for(p_viewer)   seeds only: each "Because you love X" row holds
--                            works of X's own type (albums for an album,
--                            films for a film). The friends and people parts
--                            are gone — the Friends page has them.
--   discover_works(...)      "Most loved" of all time (the month ordering and
--                            its columns are gone), people interleaved within
--                            a count.
--
-- Both now treat a title only one creator carries (blanks don't count) as one
-- work across catalogs — a podcast saved with and without its host's name.

create or replace function public.discover_for(p_viewer uuid)
returns jsonb
language sql stable set search_path = public as $$
  with titles as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c,
           count(distinct nullif(lower(btrim(creator)), '')) creators
      from items
     group by 1, 2
  ),
  -- catalogs disagree (the same album on Apple and on Deezer, a podcast with
  -- and without its host's name), so a title only one creator carries is one
  -- work, under its smallest id; where creators differ, each creator's is
  canon_by as (
    select media_type::text mt, lower(btrim(title)) t, lower(btrim(creator)) cr, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2, 3
  ),
  fav as (
    select case when tt.creators <= 1
                then coalesce(tt.c, i.media_type::text || '|' || lower(btrim(i.title)))
                else coalesce(cb.c, i.canonical_id, tt.c, i.media_type::text || '|' || lower(btrim(i.title)))
           end k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator, i.image_url, i.view_url,
           i.metadata ->> 'year' as year, coalesce(i.canonical_id, tt.c) canonical_id, i.created_at
      from items i
      join titles tt on tt.mt = i.media_type::text and tt.t = lower(btrim(i.title))
      left join canon_by cb
        on cb.mt = i.media_type::text and cb.t = lower(btrim(i.title)) and cb.cr = lower(btrim(i.creator))
     where i.media_type::text <> 'photo'
  ),
  rep as (
    select distinct on (k) *
      from fav
     order by k, (image_url is null), created_at desc
  ),
  -- one row per (work, person): their newest copy
  held as (
    select distinct on (k, profile_id) k, profile_id, created_at at
      from fav
     order by k, profile_id, created_at desc
  ),
  -- who has each work, newest first
  who as (
    select k, count(*)::int n, (array_agg(profile_id order by at desc))[1:50] ids
      from held
     group by k
  ),
  -- everything that's already theirs: favorites and public-list saves (the
  -- page also hides their private saves, which only their browser can see)
  mine as (
    select k from held where profile_id = p_viewer
    union
    select case when coalesce(tt.creators, 0) <= 1
                then coalesce(tt.c, li.canonical_id, li.media_type::text || '|' || lower(btrim(li.title)))
                else coalesce(cb.c, li.canonical_id, tt.c, li.media_type::text || '|' || lower(btrim(li.title)))
           end
      from list_items li
      join lists l on l.id = li.list_id and l.is_public
      left join titles tt on tt.mt = li.media_type::text and tt.t = lower(btrim(li.title))
      left join canon_by cb
        on cb.mt = li.media_type::text and cb.t = lower(btrim(li.title)) and cb.cr = lower(btrim(li.creator))
     where li.profile_id = p_viewer
  ),
  -- their favorites that other people love too, and those people
  seed_fans as (
    select h.k seed, h.profile_id fan
      from held h
     where h.profile_id <> p_viewer
       and h.k in (select k from held where profile_id = p_viewer)
  ),
  -- what each seed's people love of the seed's own type, that they don't
  -- have yet (with artwork)
  co as (
    select sf.seed, h.k, count(*)::int n
      from seed_fans sf
      join rep s on s.k = sf.seed
      join held h on h.profile_id = sf.fan
      join rep r on r.k = h.k and r.image_url is not null and r.media_type = s.media_type
     where h.k <> sf.seed
       and h.k not in (select k from mine)
     group by sf.seed, h.k
  ),
  -- a seed needs six works to fill a row; the strongest twelve (most works
  -- that several of its people share) go out, and the page picks a few a day
  seeds as (
    select c.seed, count(*)::int breadth, (count(*) filter (where c.n >= 2))::int strong,
           (select count(distinct sf.fan) from seed_fans sf where sf.seed = c.seed)::int people
      from co c
     group by c.seed
    having count(*) >= 6
     order by strong desc, breadth desc, c.seed
     limit 12
  )
  select jsonb_build_object(
    'seeds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seed', jsonb_build_object(
                 'work_key', r.k, 'media_type', r.media_type, 'title', r.title, 'creator', r.creator,
                 'image_url', r.image_url, 'view_url', r.view_url, 'year', r.year,
                 'canonical_id', r.canonical_id, 'item_id', r.id, 'item_profile_id', r.profile_id),
               'people', s.people,
               'strong', s.strong,
               -- what several of the seed's people share comes first, and a
               -- work everyone has counts for less than one only they share
               'works', (
                 select jsonb_agg(w.j order by w.shared desc, w.score desc, w.n desc, w.k)
                   from (
                     select jsonb_build_object(
                              'work_key', cr.k, 'media_type', cr.media_type, 'title', cr.title,
                              'creator', cr.creator, 'image_url', cr.image_url, 'view_url', cr.view_url,
                              'year', cr.year, 'canonical_id', cr.canonical_id, 'item_id', cr.id,
                              'item_profile_id', cr.profile_id, 'n', c.n,
                              'fav_count', wh.n, 'favoriter_ids', wh.ids,
                              'top_profiles', (
                                select coalesce(jsonb_agg(jsonb_build_object(
                                         'id', p.id, 'username', p.username,
                                         'display_name', p.display_name, 'avatar_url', p.avatar_url)
                                       order by array_position(wh.ids, p.id)), '[]'::jsonb)
                                  from profiles p
                                 where p.id = any (wh.ids[1:3]))) j,
                            (c.n >= 2) shared, c.n / sqrt(wh.n) score, c.n, c.k
                       from co c
                       join rep cr on cr.k = c.k
                       join who wh on wh.k = c.k
                      where c.seed = s.seed
                      order by shared desc, score desc, c.n desc, c.k
                      limit 24
                   ) w
               ))
             order by s.strong desc, s.breadth desc, s.seed)
        from seeds s
        join rep r on r.k = s.seed
    ), '[]'::jsonb)
  );
$$;

drop function if exists public.discover_works(text[], uuid, int, int);
create function public.discover_works(
  p_types   text[] default null,
  p_exclude uuid   default null,
  p_limit   int    default 30,
  p_offset  int    default 0
)
returns table (
  work_key        text,
  media_type      text,
  title           text,
  creator         text,
  image_url       text,
  view_url        text,
  year            text,
  canonical_id    text,
  item_id         uuid,
  item_profile_id uuid,
  fav_count       int,
  favoriter_ids   uuid[],
  top_profiles    jsonb
)
language sql stable set search_path = public as $$
  with titles as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c,
           count(distinct nullif(lower(btrim(creator)), '')) creators
      from items
     group by 1, 2
  ),
  canon_by as (
    select media_type::text mt, lower(btrim(title)) t, lower(btrim(creator)) cr, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2, 3
  ),
  fav as (
    select case when tt.creators <= 1
                then coalesce(tt.c, i.media_type::text || '|' || lower(btrim(i.title)))
                else coalesce(cb.c, i.canonical_id, tt.c, i.media_type::text || '|' || lower(btrim(i.title)))
           end k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator, i.image_url, i.view_url,
           i.metadata ->> 'year' as year, coalesce(i.canonical_id, tt.c) canonical_id, i.created_at
      from items i
      join titles tt on tt.mt = i.media_type::text and tt.t = lower(btrim(i.title))
      left join canon_by cb
        on cb.mt = i.media_type::text and cb.t = lower(btrim(i.title)) and cb.cr = lower(btrim(i.creator))
     where i.media_type::text <> 'photo'
  ),
  rep as (
    select distinct on (k) *
      from fav
     order by k, (image_url is null), created_at desc
  ),
  held as (
    select distinct on (k, profile_id) k, profile_id, created_at at
      from fav
     order by k, profile_id, created_at desc
  ),
  agg as (
    select k,
           count(*)::int fav_count,
           (array_agg(profile_id order by at desc))[1:50] favoriter_ids,
           max(at) last_at
      from held
     group by k
  ),
  -- one person's burst shouldn't fill the grid: among works with the same
  -- count, each person's second comes after everyone's first (by whoever
  -- favorited it last)
  pool as (
    select r.k, r.media_type, r.title, r.creator, r.image_url, r.view_url, r.year, r.canonical_id,
           r.id, r.profile_id, a.fav_count, a.favoriter_ids, a.last_at,
           row_number() over (partition by a.fav_count, a.favoriter_ids[1] order by a.last_at desc, r.k) turn
      from rep r
      join agg a on a.k = r.k
     where (p_types is null or r.media_type = any (p_types))
       and (p_exclude is null or not (p_exclude = any (a.favoriter_ids)))
  ),
  ranked as (
    select *
      from pool
     order by fav_count desc, turn, last_at desc, k
     limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset)
  )
  select rk.k, rk.media_type, rk.title, rk.creator, rk.image_url, rk.view_url, rk.year, rk.canonical_id,
         rk.id, rk.profile_id, rk.fav_count, rk.favoriter_ids,
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
                 order by array_position(rk.favoriter_ids, p.id)), '[]'::jsonb)
            from profiles p
           where p.id = any (rk.favoriter_ids[1:3]))
    from ranked rk
   order by rk.fav_count desc, rk.turn, rk.last_at desc, rk.k;
$$;

grant execute on function public.discover_works(text[], uuid, int, int) to anon, authenticated;
