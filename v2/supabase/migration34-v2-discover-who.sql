-- Migration 34 (v2, 2026-10-28): Discover shows who loves each work, and
-- the same work from two catalogs is one work there. Additive: one new
-- read-only function, and discover_for (same signature) returning more per
-- work. discover_public stays, unused by the page now.
--
--   discover_for(p_viewer)   as migration 33, plus who has each work in the
--                            "Because you love" rows: fav_count, the people
--                            (favoriter_ids, newest first) and the newest
--                            three as profiles — the page names the ones the
--                            viewer follows; and "friends": what the people
--                            they follow favorited, newest first
--   discover_works(...)      "Most loved": every work, those favorited most in
--                            the last 30 days first, then the rest by favorites
--                            of all time, people interleaved within a count;
--                            with this month's people and all time's. p_exclude leaves out one person's
--                            favorites (the viewer's; they're public anyway)

create or replace function public.discover_for(p_viewer uuid)
returns jsonb
language sql stable set search_path = public as $$
  with canon as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2
  ),
  -- catalogs disagree (the same album on Apple and on Deezer), so copies with
  -- the same type, title and creator are one work, under the smallest id
  canon_by as (
    select media_type::text mt, lower(btrim(title)) t, lower(btrim(creator)) cr, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2, 3
  ),
  fav as (
    select coalesce(cb.c, i.canonical_id, canon.c, i.media_type::text || '|' || lower(btrim(i.title))) k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator, i.image_url, i.view_url,
           i.metadata ->> 'year' as year, coalesce(i.canonical_id, canon.c) canonical_id, i.created_at
      from items i
      left join canon_by cb
        on cb.mt = i.media_type::text and cb.t = lower(btrim(i.title)) and cb.cr = lower(btrim(i.creator))
      left join canon on canon.mt = i.media_type::text and canon.t = lower(btrim(i.title))
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
  mine as (
    select k from held where profile_id = p_viewer
    union
    select coalesce(cb.c, li.canonical_id, canon.c, li.media_type::text || '|' || lower(btrim(li.title)))
      from list_items li
      join lists l on l.id = li.list_id and l.is_public
      left join canon_by cb
        on cb.mt = li.media_type::text and cb.t = lower(btrim(li.title)) and cb.cr = lower(btrim(li.creator))
      left join canon on canon.mt = li.media_type::text and canon.t = lower(btrim(li.title))
     where li.profile_id = p_viewer
  ),
  seed_fans as (
    select h.k seed, h.profile_id fan
      from held h
     where h.profile_id <> p_viewer
       and h.k in (select k from held where profile_id = p_viewer)
  ),
  co as (
    select sf.seed, h.k, count(*)::int n
      from seed_fans sf
      join held h on h.profile_id = sf.fan
      join rep r on r.k = h.k and r.image_url is not null
     where h.k <> sf.seed
       and h.k not in (select k from mine)
     group by sf.seed, h.k
  ),
  seeds as (
    select c.seed, count(*)::int breadth, (count(*) filter (where c.n >= 2))::int strong,
           (select count(distinct sf.fan) from seed_fans sf where sf.seed = c.seed)::int people
      from co c
     group by c.seed
    having count(*) >= 6
     order by strong desc, breadth desc, c.seed
     limit 12
  ),
  overlap as (
    select h.profile_id, count(*)::int shared
      from held h
     where h.profile_id <> p_viewer
       and h.k in (select k from held where profile_id = p_viewer)
     group by h.profile_id
  ),
  taste as (
    select o.profile_id, o.shared
      from overlap o
     where o.profile_id not in (select followee_id from follows where follower_id = p_viewer)
     order by o.shared desc, o.profile_id
     limit 8
  ),
  -- what the people they follow favorited (their own copy, so a favorite
  -- from here credits them), newest first
  circle as (
    select distinct on (f.k) f.*
      from fav f
     where f.profile_id in (select followee_id from follows where follower_id = p_viewer)
       and f.k not in (select k from mine)
     order by f.k, f.created_at desc
  )
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(w.j order by w.at desc)
        from (
          select jsonb_build_object(
                   'work_key', c.k, 'media_type', c.media_type, 'title', c.title, 'creator', c.creator,
                   'image_url', coalesce(c.image_url, r.image_url), 'view_url', coalesce(c.view_url, r.view_url),
                   'year', c.year, 'canonical_id', c.canonical_id, 'item_id', c.id,
                   'item_profile_id', c.profile_id,
                   'fav_count', wh.n, 'favoriter_ids', wh.ids,
                   'top_profiles', (
                     select coalesce(jsonb_agg(jsonb_build_object(
                              'id', p.id, 'username', p.username,
                              'display_name', p.display_name, 'avatar_url', p.avatar_url)
                            order by array_position(wh.ids, p.id)), '[]'::jsonb)
                       from profiles p
                      where p.id = any (wh.ids[1:3]))) j,
                 c.created_at at
            from circle c
            join rep r on r.k = c.k
            join who wh on wh.k = c.k
           where coalesce(c.image_url, r.image_url) is not null
           order by c.created_at desc
           limit 24
        ) w
    ), '[]'::jsonb),
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
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profile', jsonb_build_object(
                 'id', p.id, 'user_id', p.user_id, 'username', p.username,
                 'display_name', p.display_name, 'bio', p.bio, 'avatar_url', p.avatar_url,
                 'socials', p.socials, 'header_url', p.header_url),
               'shared', t.shared,
               'count', (select count(*) from held h where h.profile_id = t.profile_id),
               'works', coalesce((
                 select jsonb_agg(w.j order by w.at desc)
                   from (
                     select x.j, x.at
                       from (
                         select distinct on (f.k)
                                jsonb_build_object(
                                  'work_key', f.k, 'media_type', f.media_type, 'title', f.title,
                                  'creator', f.creator, 'image_url', f.image_url, 'view_url', f.view_url,
                                  'year', f.year, 'canonical_id', f.canonical_id, 'item_id', f.id,
                                  'item_profile_id', f.profile_id) j,
                                f.created_at at
                           from fav f
                          where f.profile_id = t.profile_id
                            and f.image_url is not null
                            and f.k not in (select k from mine)
                          order by f.k, f.created_at desc
                       ) x
                      order by x.at desc
                      limit 6
                   ) w
               ), '[]'::jsonb))
             order by t.shared desc, t.profile_id)
        from taste t
        join profiles p on p.id = t.profile_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.discover_works(
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
  this_month      int,
  month_ids       uuid[],
  month_profiles  jsonb,
  fav_count       int,
  favoriter_ids   uuid[],
  top_profiles    jsonb
)
language sql stable set search_path = public as $$
  with canon as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2
  ),
  -- catalogs disagree (the same album on Apple and on Deezer), so copies with
  -- the same type, title and creator are one work, under the smallest id
  canon_by as (
    select media_type::text mt, lower(btrim(title)) t, lower(btrim(creator)) cr, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2, 3
  ),
  fav as (
    select coalesce(cb.c, i.canonical_id, canon.c, i.media_type::text || '|' || lower(btrim(i.title))) k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator, i.image_url, i.view_url,
           i.metadata ->> 'year' as year, coalesce(i.canonical_id, canon.c) canonical_id, i.created_at
      from items i
      left join canon_by cb
        on cb.mt = i.media_type::text and cb.t = lower(btrim(i.title)) and cb.cr = lower(btrim(i.creator))
      left join canon on canon.mt = i.media_type::text and canon.t = lower(btrim(i.title))
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
           max(at) last_at,
           (count(*) filter (where at > now() - interval '30 days'))::int this_month,
           coalesce((array_agg(profile_id order by at desc) filter (where at > now() - interval '30 days'))[1:50], '{}') month_ids
      from held
     group by k
  ),
  -- one person's burst shouldn't fill the grid: among works with the same
  -- count, each person's second comes after everyone's first (by whoever
  -- favorited it last — this month's, or all time's)
  pool as (
    select r.k, r.media_type, r.title, r.creator, r.image_url, r.view_url, r.year, r.canonical_id,
           r.id, r.profile_id, a.this_month, a.month_ids, a.fav_count, a.favoriter_ids, a.last_at,
           row_number() over (
             partition by (case when a.this_month > 0 then a.this_month else -a.fav_count end),
                          (case when a.this_month > 0 then a.month_ids[1] else a.favoriter_ids[1] end)
             order by a.fav_count desc, a.last_at desc, r.k) turn
      from rep r
      join agg a on a.k = r.k
     where (p_types is null or r.media_type = any (p_types))
       and (p_exclude is null or not (p_exclude = any (a.favoriter_ids)))
  ),
  ranked as (
    select *
      from pool
     order by this_month desc, (case when this_month = 0 then fav_count end) desc nulls first,
              turn, fav_count desc, last_at desc, k
     limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset)
  )
  select rk.k, rk.media_type, rk.title, rk.creator, rk.image_url, rk.view_url, rk.year, rk.canonical_id,
         rk.id, rk.profile_id, rk.this_month, rk.month_ids,
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
                 order by array_position(rk.month_ids, p.id)), '[]'::jsonb)
            from profiles p
           where p.id = any (rk.month_ids[1:3])),
         rk.fav_count, rk.favoriter_ids,
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
                 order by array_position(rk.favoriter_ids, p.id)), '[]'::jsonb)
            from profiles p
           where p.id = any (rk.favoriter_ids[1:3]))
    from ranked rk
   order by rk.this_month desc, (case when rk.this_month = 0 then rk.fav_count end) desc nulls first,
            rk.turn, rk.fav_count desc, rk.last_at desc, rk.k;
$$;

grant execute on function public.discover_works(text[], uuid, int, int) to anon, authenticated;
