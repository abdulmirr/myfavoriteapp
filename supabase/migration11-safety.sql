-- launch safety: blocking, social write budgets, in-app account deletion,
-- username history (old links redirect), reserved usernames.

-- ── 1) blocks ─────────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "own blocks read"   on public.blocks;
drop policy if exists "own blocks write"  on public.blocks;
drop policy if exists "own blocks delete" on public.blocks;

create policy "own blocks read" on public.blocks for select
  using (exists (select 1 from public.profiles p
                 where p.id = blocker_id and p.user_id = auth.uid()));
create policy "own blocks write" on public.blocks for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = blocker_id and p.user_id = auth.uid()));
create policy "own blocks delete" on public.blocks for delete
  using (exists (select 1 from public.profiles p
                 where p.id = blocker_id and p.user_id = auth.uid()));

-- policy subqueries would trip blocks' own RLS — a definer helper sidesteps it
create or replace function public.is_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.blocks
                 where blocker_id = p_blocker and blocked_id = p_blocked);
$$;

revoke all on function public.is_blocked(uuid, uuid) from public;
grant execute on function public.is_blocked(uuid, uuid) to anon, authenticated;

-- blocked users can no longer follow you
drop policy if exists "follow as yourself" on public.follows;
create policy "follow as yourself" on public.follows for insert
  with check (
    exists (select 1 from public.profiles p
            where p.id = follower_id and p.user_id = auth.uid())
    and not public.is_blocked(followee_id, follower_id)
  );

-- one call does the whole block: row + severed follows + retracted notifications
create or replace function public.block_profile(p_target uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  select id into me from public.profiles where user_id = auth.uid();
  if me is null then raise exception 'no profile'; end if;
  if me = p_target then raise exception 'cannot block yourself'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_target)
  on conflict do nothing;
  delete from public.follows
   where (follower_id = me and followee_id = p_target)
      or (follower_id = p_target and followee_id = me);
  delete from public.notifications where profile_id = me and actor_id = p_target;
end $$;

create or replace function public.unblock_profile(p_target uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  select id into me from public.profiles where user_id = auth.uid();
  if me is null then raise exception 'no profile'; end if;
  delete from public.blocks where blocker_id = me and blocked_id = p_target;
end $$;

revoke all on function public.block_profile(uuid)   from public, anon;
revoke all on function public.unblock_profile(uuid) from public, anon;
grant execute on function public.block_profile(uuid)   to authenticated;
grant execute on function public.unblock_profile(uuid) to authenticated;

-- notification triggers respect blocks (belt to the policy's suspenders)
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blocked(new.followee_id, new.follower_id) then
    insert into public.notifications (profile_id, type, actor_id)
    values (new.followee_id, 'follow', new.follower_id);
  end if;
  return new;
end $$;

create or replace function public.notify_favorited()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.via_profile_id is not null and new.via_profile_id <> new.profile_id
     and not public.is_blocked(new.via_profile_id, new.profile_id) then
    insert into public.notifications (profile_id, type, actor_id, item_id)
    values (new.via_profile_id, 'favorited', new.profile_id, new.id);
  end if;
  return new;
end $$;

-- ── 2) social write budgets (mass-follow / library-flood protection) ─────────
create or replace function public.enforce_social_budget()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- server-side/seed paths
  if tg_table_name = 'follows' then
    if not public.bump_api_usage('w:follows', 100) then
      raise exception 'daily follow limit reached';
    end if;
  else
    if not public.bump_api_usage('w:items', 300) then
      raise exception 'daily favorite limit reached';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists budget_follows on public.follows;
create trigger budget_follows
  before insert on public.follows
  for each row execute function public.enforce_social_budget();

drop trigger if exists budget_items on public.items;
create trigger budget_items
  before insert on public.items
  for each row execute function public.enforce_social_budget();

-- ── 3) in-app account deletion ────────────────────────────────────────────────
-- profiles.user_id is `on delete set null`, so the profile must go first or a
-- ghost page survives the account.
create or replace function public.delete_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.profiles where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ── 4) username history: old links redirect instead of 404 ──────────────────
create table if not exists public.username_history (
  old_username text primary key,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  changed_at   timestamptz not null default now()
);

alter table public.username_history enable row level security;
drop policy if exists "history is public" on public.username_history;
create policy "history is public" on public.username_history for select using (true);

create or replace function public.record_username_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.username is distinct from new.username then
    insert into public.username_history (old_username, profile_id)
    values (old.username, new.id)
    on conflict (old_username)
      do update set profile_id = excluded.profile_id, changed_at = now();
    -- someone reclaiming a historical name ends its redirect
    delete from public.username_history where old_username = new.username;
  end if;
  return new;
end $$;

drop trigger if exists on_username_change on public.profiles;
create trigger on_username_change
  after update of username on public.profiles
  for each row execute function public.record_username_change();

-- fresh signups also invalidate a matching redirect
create or replace function public.clear_username_history()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.username_history where old_username = new.username;
  return new;
end $$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.clear_username_history();

-- ── 5) reserved usernames (routes must not be shadowable) ────────────────────
create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql immutable as $$
  select p_name = any (array[
    'explore','welcome','signin','signup','profile','settings','privacy',
    'terms','auth','api','home','favorites','favorite','admin','about',
    'help','item','items','notifications','search','import','landing','recap'
  ]);
$$;

alter table public.profiles
  drop constraint if exists username_not_reserved;
alter table public.profiles
  add constraint username_not_reserved
  check (not public.is_reserved_username(username));

-- the email-prefix derivation in claim_profile must dodge reserved names too
create or replace function public.claim_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  if new.email_confirmed_at is null then return new; end if;

  update public.profiles p
     set user_id = new.id
   where p.user_id is null
     and p.id = (select pp.profile_id from public.profile_private pp
                 where pp.claim_email = lower(new.email));

  if not found and not exists (select 1 from public.profiles where user_id = new.id) then
    base := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g');
    if length(base) < 2 then base := 'user'; end if;
    base := left(base, 24);
    candidate := base;
    while exists (select 1 from public.profiles where username = candidate)
          or public.is_reserved_username(candidate) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;
    insert into public.profiles (user_id, username, display_name)
    values (new.id, candidate, split_part(new.email, '@', 1));
  end if;

  insert into public.profile_private (profile_id)
  select p.id from public.profiles p where p.user_id = new.id
  on conflict (profile_id) do nothing;

  return new;
end $$;
