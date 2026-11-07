-- migration39 — the extension's v1.2 popup: one read that paints everything
-- (you, this page's state, your lists with their covers), and the two writes
-- the app's ★ already has: taking a favorite back, and a thought added after
-- it. Additive only: three new functions. Nothing existing changes, so the
-- store's v1.1.0 keeps running on extension_lists exactly as it did.
-- Same auth as the rest (migration24/29): a personal token, hashed; matching
-- by the page's URL or its work key, like migration32.

-- ── the popup's one read ───────────────────────────────────────────────────
create or replace function public.extension_state(p_token text, p_url text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := nullif(trim(coalesce(p_url, '')), '');
  v_key     text := public.url_work_key(p_url);
  v_fav     boolean;
  v_thought text;
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;

  select true, i.description into v_fav, v_thought
    from public.items i
   where i.profile_id = v_profile and (i.view_url = v_url or i.canonical_id = v_key)
   order by i.created_at
   limit 1;

  return jsonb_build_object(
    'status', 'ok',
    'me', (select jsonb_build_object('username', p.username, 'name', p.display_name, 'avatar_url', p.avatar_url)
             from public.profiles p where p.id = v_profile),
    'favorited', coalesce(v_fav, false),
    'thought', coalesce(v_thought, ''),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'title', l.title,
               'is_public', l.is_public,
               'cover_image_url', l.cover_image_url,
               'count', s.n,
               'has', s.has,
               'covers', c.covers)
             order by l.updated_at desc)
        from public.lists l
        cross join lateral (
          select count(*) as n,
                 coalesce(bool_or(li.view_url = v_url or li.work_key = v_key), false) as has
            from public.list_items li
           where li.list_id = l.id) s
        cross join lateral (
          select coalesce(jsonb_agg(x.image_url order by x.position), '[]'::jsonb) as covers
            from (select li.image_url, li.position
                    from public.list_items li
                   where li.list_id = l.id and coalesce(li.image_url, '') <> ''
                   order by li.position
                   limit 3) x) c
       where l.profile_id = v_profile), '[]'::jsonb));
end $$;

-- ── take a favorite back ───────────────────────────────────────────────────
create or replace function public.extension_unfavorite(p_token text, p_url text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := nullif(trim(coalesce(p_url, '')), '');
  v_key     text := public.url_work_key(p_url);
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  delete from public.items
   where profile_id = v_profile and (view_url = v_url or canonical_id = v_key);
  return jsonb_build_object('status', 'removed');
end $$;

-- ── a thought, after the star ──────────────────────────────────────────────
create or replace function public.extension_set_thought(p_token text, p_url text, p_thought text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := public.extension_profile(p_token);
  v_url     text := nullif(trim(coalesce(p_url, '')), '');
  v_key     text := public.url_work_key(p_url);
  v_rows    int;
begin
  if v_profile is null then return jsonb_build_object('status', 'unauthorized'); end if;
  update public.items
     set description = left(trim(coalesce(p_thought, '')), 1000)
   where profile_id = v_profile and (view_url = v_url or canonical_id = v_key);
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('status', 'error', 'message', 'That favorite is gone.');
  end if;
  return jsonb_build_object('status', 'saved');
end $$;

revoke all on function public.extension_state(text, text) from public;
revoke all on function public.extension_unfavorite(text, text) from public;
revoke all on function public.extension_set_thought(text, text, text) from public;
grant execute on function public.extension_state(text, text) to anon, authenticated;
grant execute on function public.extension_unfavorite(text, text) to anon, authenticated;
grant execute on function public.extension_set_thought(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
