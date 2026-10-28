-- Favorite v2, third batch (2026-10-27): the Friends page's timeline.
-- What the people you follow have been doing, grouped the way the page shows
-- it: one group per person, per (UTC) day, per kind — their favorites, or
-- their saves to one public list — newest first, carrying the group's newest
-- four works. A bulk import collapses into one group instead of flooding the
-- page. Invoker rights: items are public and only public lists' saves are
-- visible through RLS, so this shows nothing a profile page doesn't.
-- Additive and idempotent: safe to re-run.
create or replace function public.friends_activity(
  p_viewer uuid,
  p_limit  int default 20,
  p_offset int default 0
)
returns table (
  profile_id      uuid,
  username        text,
  display_name    text,
  avatar_url      text,
  kind            text,
  list_id         uuid,
  list_title      text,
  list_slug       text,
  list_created_at timestamptz,
  day             date,
  n               int,
  last_at         timestamptz,
  items           jsonb
)
language sql stable set search_path = public as $$
  with following as (
    select f.followee_id from follows f where f.follower_id = p_viewer
  ),
  ev as (
    select i.profile_id, 'favorite'::text as kind, null::uuid as list_id, i.created_at,
           jsonb_build_object(
             'id', i.id, 'profile_id', i.profile_id, 'media_type', i.media_type, 'title', i.title,
             'creator', i.creator, 'image_url', i.image_url, 'view_url', i.view_url,
             'canonical_id', i.canonical_id, 'metadata', i.metadata, 'note', i.description,
             'created_at', i.created_at) as j
      from items i
     where i.profile_id in (select followee_id from following)
       and i.media_type::text <> 'photo'
    union all
    select li.profile_id, 'save'::text, li.list_id, li.created_at,
           jsonb_build_object(
             'id', li.id, 'profile_id', li.profile_id, 'media_type', li.media_type, 'title', li.title,
             'creator', li.creator, 'image_url', li.image_url, 'view_url', li.view_url,
             'canonical_id', li.canonical_id, 'metadata', li.metadata, 'note', li.note,
             'created_at', li.created_at)
      from list_items li
      join lists l on l.id = li.list_id and l.is_public
     where li.profile_id in (select followee_id from following)
  ),
  g as (
    select ev.profile_id, ev.kind, ev.list_id,
           (ev.created_at at time zone 'utc')::date as day,
           count(*)::int as n,
           max(ev.created_at) as last_at,
           to_jsonb((array_agg(ev.j order by ev.created_at desc))[1:4]) as items
      from ev
     group by 1, 2, 3, 4
  )
  select g.profile_id, p.username, p.display_name, p.avatar_url,
         g.kind, g.list_id, l.title, l.slug, l.created_at,
         g.day, g.n, g.last_at, g.items
    from g
    join profiles p on p.id = g.profile_id
    left join lists l on l.id = g.list_id
   order by g.last_at desc, g.profile_id, g.kind, g.list_id
   limit greatest(1, least(p_limit, 50))
  offset greatest(0, p_offset);
$$;

grant execute on function public.friends_activity(uuid, int, int) to anon, authenticated;
