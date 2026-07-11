-- migration24: Chrome extension — personal save tokens + anon-callable save RPC.
--
-- The extension can't share the web session (Supabase refresh-token rotation
-- would make the two clients revoke each other), so /extension mints a
-- long-lived personal token instead. Only its sha256 lands in the DB; the
-- extension calls extension_save() through PostgREST with the anon key and
-- the plaintext token, and the RPC does its own auth, budget, and dedupe —
-- the w:items trigger skips anon (auth.uid() is null), so the budget is
-- charged here explicitly against the token owner's user_id.

create extension if not exists pgcrypto;

-- ── 1) tokens ────────────────────────────────────────────────────────────────
create table if not exists public.extension_tokens (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists extension_tokens_profile_idx
  on public.extension_tokens (profile_id);

alter table public.extension_tokens enable row level security;

-- owners can see (connected-state UI) and revoke; only the mint RPC inserts
drop policy if exists "own tokens select" on public.extension_tokens;
create policy "own tokens select" on public.extension_tokens for select
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "own tokens delete" on public.extension_tokens;
create policy "own tokens delete" on public.extension_tokens for delete
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

-- ── 2) mint (signed-in web app only) ─────────────────────────────────────────
create or replace function public.create_extension_token()
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  me  uuid;
  tok text;
begin
  select id into me from public.profiles where user_id = auth.uid();
  if me is null then raise exception 'no profile'; end if;

  tok := encode(gen_random_bytes(32), 'hex');
  insert into public.extension_tokens (profile_id, token_hash)
  values (me, encode(digest(tok, 'sha256'), 'hex'));

  -- a few browsers per person is plenty; oldest tokens age out
  delete from public.extension_tokens
   where profile_id = me
     and id not in (
       select id from public.extension_tokens
        where profile_id = me
        order by created_at desc
        limit 5
     );

  return tok;
end $$;

revoke all on function public.create_extension_token() from public;
revoke all on function public.create_extension_token() from anon;
grant execute on function public.create_extension_token() to authenticated;

-- ── 3) save (extension, anon key + token) ────────────────────────────────────
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

revoke all on function public.extension_save(text, text, text, text, text, text) from public;
grant execute on function public.extension_save(text, text, text, text, text, text) to anon;
grant execute on function public.extension_save(text, text, text, text, text, text) to authenticated;

-- ── 4) /extension is a live route now — reserve the username ────────────────
create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql immutable as $$
  select p_name = any (array[
    'add','explore','welcome','signin','signup','profile','settings','privacy',
    'terms','auth','api','home','favorites','favorite','admin','about',
    'help','item','items','notifications','search','import','landing','recap',
    'extension'
  ]);
$$;
