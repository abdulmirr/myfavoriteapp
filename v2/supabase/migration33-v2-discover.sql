-- Migration 33 (v2, 2026-10-28): Discover — the rows of the Discover page,
-- each with its reason. Additive: two read-only functions over public data
-- (favorites and public lists); no table changes, and v1 never calls them.
--
--   discover_public(p_limit)  what's loved most this month, and fresh thoughts
--   discover_for(p_viewer)    for one person: the favorites of theirs that
--                             others love too ("seeds", each with what those
--                             people also love), and the people who share the
--                             most of their taste (each with six things they
--                             love that this person doesn't have)
--
-- Works group the way feed_works groups them: the canonical id, else a tagged
-- sibling's id (same type + title), else "type|title". Photos never show.
-- Security invoker, called with the anon key: RLS keeps private lists out.

create or replace function public.discover_public(p_limit int default 30)
returns jsonb
language sql stable set search_path = public as $$
  with canon as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2
  ),
  fav as (
    select coalesce(i.canonical_id, canon.c, i.media_type::text || '|' || lower(btrim(i.title))) k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator, i.image_url, i.view_url,
           i.metadata ->> 'year' as year, coalesce(i.canonical_id, canon.c) canonical_id,
           btrim(coalesce(i.description, ''), E' \t\r\n') thought, i.created_at
      from items i
      left join canon on canon.mt = i.media_type::text and canon.t = lower(btrim(i.title))
     where i.media_type::text <> 'photo'
  ),
  -- the card shows the newest copy that has artwork
  rep as (
    select distinct on (k) *
      from fav
     order by k, (image_url is null), created_at desc
  ),
  fans as (
    select k, count(distinct profile_id)::int n from fav group by k
  ),
  -- the last 30 days: favorites and public-list saves, one per (work, person)
  recent as (
    select k, profile_id, max(at) at
      from (
        select k, profile_id, created_at at from fav where created_at > now() - interval '30 days'
        union all
        select coalesce(li.canonical_id, canon.c, li.media_type::text || '|' || lower(btrim(li.title))),
               li.profile_id, li.created_at
          from list_items li
          join lists l on l.id = li.list_id and l.is_public
          left join canon on canon.mt = li.media_type::text and canon.t = lower(btrim(li.title))
         where li.created_at > now() - interval '30 days' and li.media_type::text <> 'photo'
      ) x
     group by k, profile_id
  ),
  -- most people this month, then most people ever, then newest
  loved as (
    select r.k, count(*)::int n, max(r.at) at, f.n ever
      from recent r
      join fans f on f.k = r.k
     group by r.k, f.n
     order by n desc, ever desc, at desc
     limit greatest(1, least(p_limit, 60))
  ),
  -- the newest thoughts, two per person at most
  said as (
    select f.*, row_number() over (partition by f.profile_id order by f.created_at desc) nth
      from fav f
     where length(f.thought) between 12 and 280
  )
  select jsonb_build_object(
    'loved', coalesce((
      select jsonb_agg(jsonb_build_object(
               'work_key', r.k, 'media_type', r.media_type, 'title', r.title, 'creator', r.creator,
               'image_url', r.image_url, 'view_url', r.view_url, 'year', r.year,
               'canonical_id', r.canonical_id, 'item_id', r.id, 'item_profile_id', r.profile_id,
               'n', l.n)
             order by l.n desc, l.ever desc, l.at desc)
        from loved l
        join rep r on r.k = l.k
    ), '[]'::jsonb),
    'thoughts', coalesce((
      select jsonb_agg(t.j order by t.created_at desc)
        from (
          select jsonb_build_object(
                   'work', jsonb_build_object(
                     'work_key', s.k, 'media_type', s.media_type, 'title', s.title, 'creator', s.creator,
                     'image_url', coalesce(s.image_url, r.image_url), 'view_url', coalesce(s.view_url, r.view_url),
                     'year', s.year, 'canonical_id', s.canonical_id, 'item_id', s.id,
                     'item_profile_id', s.profile_id),
                   'by', jsonb_build_object('id', p.id, 'username', p.username,
                                            'display_name', p.display_name, 'avatar_url', p.avatar_url),
                   'text', s.thought,
                   'at', s.created_at) j,
                 s.created_at
            from said s
            join profiles p on p.id = s.profile_id
            join rep r on r.k = s.k
           where s.nth <= 2
           order by s.created_at desc
           limit greatest(1, least(p_limit, 60))
        ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.discover_for(p_viewer uuid)
returns jsonb
language sql stable set search_path = public as $$
  with canon as (
    select media_type::text mt, lower(btrim(title)) t, min(canonical_id) c
      from items
     where canonical_id is not null
     group by 1, 2
  ),
  fav as (
    select coalesce(i.canonical_id, canon.c, i.media_type::text || '|' || lower(btrim(i.title))) k,
           i.id, i.profile_id, i.media_type::text media_type, i.title, i.creator, i.image_url, i.view_url,
           i.metadata ->> 'year' as year, coalesce(i.canonical_id, canon.c) canonical_id, i.created_at
      from items i
      left join canon on canon.mt = i.media_type::text and canon.t = lower(btrim(i.title))
     where i.media_type::text <> 'photo'
  ),
  rep as (
    select distinct on (k) *
      from fav
     order by k, (image_url is null), created_at desc
  ),
  -- one row per (work, person)
  held as (
    select distinct k, profile_id from fav
  ),
  fans as (
    select k, count(*)::int n from held group by k
  ),
  -- everything that's already theirs: favorites and public-list saves (the
  -- page also hides their private saves, which only their browser can see)
  mine as (
    select k from held where profile_id = p_viewer
    union
    select coalesce(li.canonical_id, canon.c, li.media_type::text || '|' || lower(btrim(li.title)))
      from list_items li
      join lists l on l.id = li.list_id and l.is_public
      left join canon on canon.mt = li.media_type::text and canon.t = lower(btrim(li.title))
     where li.profile_id = p_viewer
  ),
  -- their favorites that other people love too, and those people
  seed_fans as (
    select h.k seed, h.profile_id fan
      from held h
     where h.profile_id <> p_viewer
       and h.k in (select k from held where profile_id = p_viewer)
  ),
  -- what each seed's people love that they don't have yet (with artwork)
  co as (
    select sf.seed, h.k, count(*)::int n
      from seed_fans sf
      join held h on h.profile_id = sf.fan
      join rep r on r.k = h.k and r.image_url is not null
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
  ),
  overlap as (
    select h.profile_id, count(*)::int shared
      from held h
     where h.profile_id <> p_viewer
       and h.k in (select k from held where profile_id = p_viewer)
     group by h.profile_id
  ),
  -- people they don't follow yet, by how much they share
  taste as (
    select o.profile_id, o.shared
      from overlap o
     where o.profile_id not in (select followee_id from follows where follower_id = p_viewer)
     order by o.shared desc, o.profile_id
     limit 8
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
                              'item_profile_id', cr.profile_id, 'n', c.n) j,
                            (c.n >= 2) shared, c.n / sqrt(f.n) score, c.n, c.k
                       from co c
                       join rep cr on cr.k = c.k
                       join fans f on f.k = c.k
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

grant execute on function public.discover_public(int) to anon, authenticated;
grant execute on function public.discover_for(uuid) to anon, authenticated;
