-- Taste match: how much of two libraries is the same thing, by canonical id.
-- The relationship primitive that needs no content — "you share 12 favorites"
-- turns any profile visit into a compatibility read. Items are public, so the
-- function is invoker-rights; it only aggregates what anyone could read.

create or replace function public.taste_match(p_a uuid, p_b uuid)
returns json
language sql stable as $$
  select json_build_object(
    'shared', count(distinct a.canonical_id)::int,
    'top_type', mode() within group (order by a.media_type)
  )
  from public.items a
  join public.items b
    on b.canonical_id = a.canonical_id and b.profile_id = p_b
  where a.profile_id = p_a
    and a.canonical_id is not null;
$$;

grant execute on function public.taste_match(uuid, uuid) to anon, authenticated;
