-- migration38 — v2: the morning email carries each member's own picks, the
-- same five Home shows them, instead of the community's five. Additive only.
-- The send runs on the server with the anon key, so everything it reads or
-- writes of a member's goes through these functions, guarded by
-- app_secrets' newsletter_key like the rest of the newsletter (migration29).

-- who gets today's issue, and whose taste it's chosen from: the profile it
-- was subscribed under, else the account the address belongs to (a visitor
-- who subscribed, then made a page). No profile: the community's five.
create or replace function public.newsletter_audience(p_key text)
returns table (email text, token text, profile_id uuid, display_name text, username text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  return query
    select s.email, s.token, p.id, p.display_name, p.username
      from public.newsletter_subscribers s
      left join public.profiles p on p.id = coalesce(
        s.profile_id,
        (select pr.id from public.profiles pr join auth.users u on u.id = pr.user_id
          where lower(u.email) = lower(s.email) limit 1))
     where s.status = 'active'
     order by s.created_at;
end $$;

-- everything /api/picks reads to choose and show a member's day, in one
-- round trip (same limits as the route)
create or replace function public.newsletter_taste(p_key text, p_profile uuid, p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'today', (select jsonb_build_object('items', d.items, 'created_at', d.created_at)
                from public.daily_picks d where d.profile_id = p_profile and d.day = p_day),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc)
                from (select * from public.items where profile_id = p_profile
                       order by created_at desc limit 1000) i), '[]'::jsonb),
    'taste_note', coalesce((select pp.taste_note from public.profile_private pp where pp.profile_id = p_profile), ''),
    'dismissed', coalesce((select jsonb_agg(jsonb_build_object('media_type', r.media_type, 'title', r.title, 'creator', r.creator)
                                    order by r.created_at desc)
                from (select * from public.rec_dismissals where profile_id = p_profile
                       order by created_at desc limit 40) r), '[]'::jsonb),
    -- passed on lately: gone from the day's set (PASS_WINDOW_MS)
    'passed', coalesce((select jsonb_agg(jsonb_build_object('media_type', r.media_type, 'title', r.title))
                from public.rec_dismissals r
               where r.profile_id = p_profile and r.created_at >= now() - interval '2 days'), '[]'::jsonb),
    'saved', coalesce((select jsonb_agg(jsonb_build_object('media_type', l.media_type, 'title', l.title, 'creator', l.creator)
                                order by l.created_at desc)
                from (select * from public.list_items where profile_id = p_profile
                       order by created_at desc limit 200) l), '[]'::jsonb),
    'owned', coalesce((select jsonb_agg(jsonb_build_object('media_type', o.media_type, 'title', o.title, 'canonical_id', o.canonical_id))
                from ((select media_type::text, title, canonical_id from public.items where profile_id = p_profile limit 5000)
                      union all
                      (select media_type, title, canonical_id from public.list_items where profile_id = p_profile limit 5000)) o),
                '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(e)
                from public.daily_picks d, jsonb_array_elements(d.items) e
               where d.profile_id = p_profile and d.day >= p_day - 7 and d.day <> p_day), '[]'::jsonb)
  );
end $$;

-- the day's set is claimed and stored the way /api/picks does it, so a
-- member opening Home while the email is choosing waits for the same set
-- instead of choosing a second one
create or replace function public.newsletter_picks_claim(p_key text, p_profile uuid, p_day date)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  -- an empty claim older than three minutes is one whose chooser died
  delete from public.daily_picks
   where profile_id = p_profile and day = p_day and items = '[]'::jsonb
     and created_at < now() - interval '3 minutes';
  insert into public.daily_picks (profile_id, day) values (p_profile, p_day)
  on conflict do nothing;
  return found;
end $$;

-- store the chosen set (two weeks of history, as /api/picks keeps); an empty
-- set frees the claim so Home can choose later
create or replace function public.newsletter_picks_store(p_key text, p_profile uuid, p_day date, p_items jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.newsletter_key_ok(p_key) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    delete from public.daily_picks
     where profile_id = p_profile and day = p_day and items = '[]'::jsonb;
    return;
  end if;
  update public.daily_picks set items = p_items where profile_id = p_profile and day = p_day;
  delete from public.daily_picks where profile_id = p_profile and day < p_day - 14;
end $$;
