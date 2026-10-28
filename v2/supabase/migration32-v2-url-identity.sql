-- Favorite v2, fourth batch (2026-10-28): one link, one work.
--
-- Catalog works carry an id from search (tmdb:movie:77, itunes:123,
-- deezer:album:9, ol:/works/OL1W). Links didn't: two people favoriting the
-- same essay were two unrelated works, told apart only by whatever title
-- each page happened to give. Now a URL is an identity:
--
--   * a catalog page's URL maps to the id search would have given it
--     (themoviedb.org/movie/77 → tmdb:movie:77), so older rows join their works
--   * YouTube / Vimeo / Spotify → youtube:<id>, vimeo:<id>, spotify:<type>:<id>
--   * anything else → url:<hash of the normalized address> — scheme, www.,
--     trailing slash, #fragment and tracking parameters (utm_*, fbclid, si…)
--     dropped
--
-- A trigger applies the rule on every write — the v2 app, v1, the browser
-- extension — so there is exactly one place it lives. Links, videos and
-- typed-in works take any key; catalog-typed rows only ever take a catalog id
-- (never a url: hash), so the feed's same-title grouping still covers them.
-- The client (lib/url-key.ts) mirrors this function for instant matching;
-- this one is the source of truth. Additive and idempotent: safe to re-run.

create or replace function public.url_work_key(p_url text)
returns text
language plpgsql stable set search_path = public as $$
declare
  m     text[];
  host  text;
  path  text;
  query text;
  id    text;
  kept  text[] := '{}';
  kv    text;
  k     text;
  norm  text;
begin
  if p_url is null then return null; end if;
  m := regexp_match(btrim(p_url), '^https?://([^/?#[:space:]]+)([^?#[:space:]]*)(?:\?([^#[:space:]]*))?', 'i');
  if m is null then return null; end if;
  host := lower(m[1]);
  host := regexp_replace(host, '^[^@]*@', '');
  host := regexp_replace(host, ':[0-9]+$', '');
  host := regexp_replace(host, '^(www|m|mobile|amp)\.', '');
  path := coalesce(m[2], '');
  query := coalesce(m[3], '');

  -- the catalogs' own pages → the ids search gives them
  if host = 'themoviedb.org' then
    m := regexp_match(path, '^/(movie|tv)/([0-9]+)');
    if m is not null then return 'tmdb:' || m[1] || ':' || m[2]; end if;
  elsif host = 'deezer.com' then
    m := regexp_match(path, '^/(?:[a-z]{2}/)?(album|track|show)/([0-9]+)');
    if m is not null then
      return 'deezer:' || case m[1] when 'show' then 'podcast' else m[1] end || ':' || m[2];
    end if;
  elsif host in ('music.apple.com', 'itunes.apple.com', 'books.apple.com', 'podcasts.apple.com') then
    id := substring(query from '(?:^|&)i=([0-9]+)');
    if id is null then id := substring(path from '/id([0-9]+)'); end if;
    if id is null then id := substring(path from '/([0-9]{5,})/?$'); end if;
    if id is not null then return 'itunes:' || id; end if;
  elsif host = 'openlibrary.org' then
    id := substring(path from '^/works/(OL[0-9]+W)');
    if id is not null then return 'ol:/works/' || id; end if;
  -- video and audio hosts → their own ids, whichever way the link was copied
  elsif host in ('youtube.com', 'music.youtube.com', 'youtube-nocookie.com') then
    id := substring(query from '(?:^|&)v=([A-Za-z0-9_-]{11})');
    if id is null then id := substring(path from '^/(?:shorts|embed|live|v)/([A-Za-z0-9_-]{11})'); end if;
    if id is not null then return 'youtube:' || id; end if;
  elsif host = 'youtu.be' then
    id := substring(path from '^/([A-Za-z0-9_-]{11})');
    if id is not null then return 'youtube:' || id; end if;
  elsif host in ('vimeo.com', 'player.vimeo.com') then
    id := substring(path from '/([0-9]{5,})(?:/|$)');
    if id is not null then return 'vimeo:' || id; end if;
  elsif host = 'open.spotify.com' then
    m := regexp_match(path, '^/(?:intl-[a-z-]+/)?(track|album|episode|show|playlist|artist)/([A-Za-z0-9]+)');
    if m is not null then return 'spotify:' || m[1] || ':' || m[2]; end if;
  end if;

  -- everything else: host + path + whatever query isn't tracking, hashed
  if host = 'twitter.com' then host := 'x.com'; end if;
  path := regexp_replace(path, '/{2,}', '/', 'g');
  path := regexp_replace(path, '/(index\.(html?|php))?$', '');
  if query <> '' and host !~ '(^|\.)substack\.com$'
     and host not in ('x.com', 'instagram.com', 'tiktok.com', 'open.spotify.com', 'pin.it', 'linkedin.com') then
    foreach kv in array string_to_array(query, '&') loop
      k := lower(split_part(kv, '=', 1));
      continue when kv = '' or k ~ '^(utm_|mc_|_hs|pk_|mtm_)' or k = any (array[
        'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'igsh', 'ref', 'ref_src', 'ref_url',
        'si', 'feature', 'share', 'source', 'spm', 'trk', 'cmpid', 's_cid', '_ga', 'mkt_tok', 'yclid']);
      kept := kept || kv;
    end loop;
  end if;
  norm := host || path;
  if coalesce(array_length(kept, 1), 0) > 0 then
    norm := norm || '?' || array_to_string(array(select x from unnest(kept) x order by x collate "C"), '&');
  end if;
  return 'url:' || left(encode(sha256(convert_to(norm, 'UTF8')), 'hex'), 24);
end $$;

grant execute on function public.url_work_key(text) to anon, authenticated;

-- ── the rule, on every write ─────────────────────────────────────────────────
create or replace function public.apply_work_identity()
returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if new.view_url is null then return new; end if;
  -- an id search gave stays; ids derived from a URL are always re-derived here
  if new.canonical_id is not null and new.canonical_id !~ '^(url|youtube|vimeo|spotify):' then
    return new;
  end if;
  k := public.url_work_key(new.view_url);
  if k is null then return new; end if;
  if new.media_type::text in ('article', 'video', 'other') or k !~ '^(url|youtube|vimeo|spotify):' then
    new.canonical_id := k;
  end if;
  return new;
end $$;

drop trigger if exists items_work_identity on public.items;
create trigger items_work_identity
  before insert or update of view_url, canonical_id, media_type on public.items
  for each row execute function public.apply_work_identity();

drop trigger if exists list_items_work_identity on public.list_items;
create trigger list_items_work_identity
  before insert or update of view_url, canonical_id, media_type on public.list_items
  for each row execute function public.apply_work_identity();

-- ── backfill ─────────────────────────────────────────────────────────────────
-- favorites: no uniqueness on canonical_id, one statement does it
update public.items i
   set canonical_id = k.key
  from (select id, media_type::text as mt, public.url_work_key(view_url) as key
          from public.items
         where view_url is not null and canonical_id is null) k
 where i.id = k.id
   and k.key is not null
   and (k.mt in ('article', 'video', 'other') or k.key !~ '^(url|youtube|vimeo|spotify):');

-- list rows: (list_id, work_key) is unique, so a list holding the same page
-- twice keeps its second copy as it was; the lists' "updated" dates don't move
alter table public.list_items disable trigger touch_list_on_item;
do $$
declare
  r record;
  k text;
begin
  for r in select id, media_type, view_url from public.list_items
            where view_url is not null and canonical_id is null loop
    k := public.url_work_key(r.view_url);
    continue when k is null
      or not (r.media_type in ('article', 'video', 'other') or k !~ '^(url|youtube|vimeo|spotify):');
    begin
      update public.list_items set canonical_id = k where id = r.id;
    exception when unique_violation then
      null;
    end;
  end loop;
end $$;
alter table public.list_items enable trigger touch_list_on_item;

-- ── the browser extension matches by the same key ────────────────────────────
create or replace function public.extension_lists(p_token text, p_url text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := nullif(trim(coalesce(p_url, '')), '');
  v_key     text := public.url_work_key(p_url);
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  return jsonb_build_object(
    'status', 'ok',
    'favorited', v_url is not null and exists (
      select 1 from public.items i
       where i.profile_id = v_profile and (i.view_url = v_url or i.canonical_id = v_key)),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'title', l.title,
               'is_public', l.is_public,
               'count', (select count(*) from public.list_items c where c.list_id = l.id),
               'has', v_url is not null and exists (
                 select 1 from public.list_items h
                  where h.list_id = l.id and (h.view_url = v_url or h.work_key = v_key)))
             order by l.updated_at desc)
        from public.lists l
       where l.profile_id = v_profile), '[]'::jsonb));
end $$;

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
  values (p_list_id, v_profile, 'article', v_title, left(trim(coalesce(p_site, '')), 120), v_img, v_url)
  returning id into v_id;
  return jsonb_build_object('status', 'added', 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('status', 'duplicate');
end $$;

create or replace function public.extension_remove_from_list(p_token text, p_list_id uuid, p_url text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_profile uuid := public.extension_profile(p_token);
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  delete from public.list_items
   where list_id = p_list_id and profile_id = v_profile
     and (view_url = trim(coalesce(p_url, '')) or work_key = public.url_work_key(p_url));
  return jsonb_build_object('status', 'removed');
end $$;

-- extension_save (migration24) — the same function, its duplicate check by key
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
    (v_profile, 'article', v_title,
     left(trim(coalesce(p_site, '')), 120),
     left(trim(coalesce(p_description, '')), 2000),
     v_img, v_url,
     coalesce((select max(sort_order) + 1 from public.items where profile_id = v_profile), 0))
  returning id into v_id;

  return jsonb_build_object('status', 'added', 'id', v_id);
end $$;
