-- migration40 — extension saves, finished: a video is saved as a video, and
-- public pages can show a save straight away.
--   1. extension_save / extension_save_to_list always wrote media_type
--      'article', so YouTube and Vimeo pages landed under Links. The type now
--      follows the same URL identity as everything else (migration32): a page
--      with a video id is a video. These are the live bodies with that one
--      value changed, so every extension build gets it, the store's included.
--   2. extension_pages: what /api/revalidate/extension needs to expire your
--      cached pages after a save. The token proves who's asking and the tags
--      come from here, so a caller can only expire their own pages; it charges
--      the app's 600/day "revalidate" budget.

create or replace function public.extension_media_type(p_url text)
returns text
language sql stable set search_path = public as $$
  select case when public.url_work_key(p_url) ~ '^(youtube|vimeo):' then 'video' else 'article' end
$$;

create or replace function public.extension_save(
  p_token       text,
  p_url         text,
  p_title       text,
  p_description text default '',
  p_site        text default '',
  p_image_url   text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_profile uuid;
  v_user    uuid;
  v_hits    int;
  v_id      uuid;
  v_url     text := trim(coalesce(p_url, ''));
  v_title   text := left(trim(coalesce(p_title, '')), 300);
  v_img     text := nullif(trim(coalesce(p_image_url, '')), '');
begin
  select t.profile_id into v_profile
    from public.extension_tokens t
   where t.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_profile is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  if v_url !~* '^https?://' or length(v_url) > 2048 or v_title = '' then
    return jsonb_build_object('status', 'error', 'message', 'Missing or invalid page URL/title.');
  end if;
  if v_img is not null and (v_img !~* '^https?://' or length(v_img) > 2048) then
    v_img := null; -- a bad og:image shouldn't sink the save
  end if;

  -- same 300/day favorites budget as the app, charged to the token's owner
  select user_id into v_user from public.profiles where id = v_profile;
  if v_user is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  insert into public.api_usage as u (user_id, day, route, hits)
  values (v_user, current_date, 'w:items', 1)
  on conflict (user_id, day, route) do update set hits = u.hits + 1
  returning u.hits into v_hits;
  if v_hits > 300 then
    return jsonb_build_object('status', 'error', 'message', 'Daily favorite limit reached.');
  end if;

  if exists (
    select 1 from public.items i
     where i.profile_id = v_profile
       and (i.view_url = v_url
            or i.canonical_id = public.url_work_key(v_url)
            or (i.media_type = 'article' and lower(i.title) = lower(v_title)))
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  update public.extension_tokens
     set last_used_at = now()
   where profile_id = v_profile
     and token_hash = encode(digest(p_token, 'sha256'), 'hex');

  insert into public.items
    (profile_id, media_type, title, creator, description, image_url, view_url, sort_order)
  values
    (v_profile, public.extension_media_type(v_url)::public.media_type, v_title,
     left(trim(coalesce(p_site, '')), 120),
     left(trim(coalesce(p_description, '')), 2000),
     v_img, v_url,
     coalesce((select max(sort_order) + 1 from public.items where profile_id = v_profile), 0))
  returning id into v_id;

  return jsonb_build_object('status', 'added', 'id', v_id);
end 
$$;

create or replace function public.extension_save_to_list(
  p_token     text,
  p_list_id   uuid,
  p_url       text,
  p_title     text,
  p_site      text default '',
  p_image_url text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := trim(coalesce(p_url, ''));
  v_title   text := left(trim(coalesce(p_title, '')), 300);
  v_img     text := nullif(trim(coalesce(p_image_url, '')), '');
  v_id      uuid;
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if not exists (select 1 from public.lists where id = p_list_id and profile_id = v_profile) then
    return jsonb_build_object('status', 'error', 'message', 'That list is gone.');
  end if;
  if v_url !~* '^https?://' or length(v_url) > 2048 or v_title = '' then
    return jsonb_build_object('status', 'error', 'message', 'Missing or invalid page URL/title.');
  end if;
  if v_img is not null and (v_img !~* '^https?://' or length(v_img) > 2048) then
    v_img := null;
  end if;
  if exists (
    select 1 from public.list_items li
     where li.list_id = p_list_id
       and (li.view_url = v_url
            or li.work_key = public.url_work_key(v_url)
            or li.work_key = 'article|' || lower(btrim(v_title)))
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if not public.extension_charge(v_profile, 'w:saves', 500) then
    return jsonb_build_object('status', 'error', 'message', 'Daily save limit reached.');
  end if;
  update public.extension_tokens set last_used_at = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  insert into public.list_items (list_id, profile_id, media_type, title, creator, image_url, view_url)
  values (p_list_id, v_profile, public.extension_media_type(v_url), v_title, left(trim(coalesce(p_site, '')), 120), v_img, v_url)
  returning id into v_id;
  return jsonb_build_object('status', 'added', 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('status', 'duplicate');
end 
$$;

create or replace function public.extension_pages(p_token text, p_url text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_profile uuid := public.extension_profile(p_token);
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if not public.extension_charge(v_profile, 'revalidate', 600) then
    return jsonb_build_object('status', 'limit');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'profile_id', v_profile,
    'work_key', public.url_work_key(p_url),
    'lists', coalesce((select jsonb_agg(l.id) from public.lists l where l.profile_id = v_profile), '[]'::jsonb));
end $$;

revoke all on function public.extension_pages(text, text) from public;
grant execute on function public.extension_pages(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
