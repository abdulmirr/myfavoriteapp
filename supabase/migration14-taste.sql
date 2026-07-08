-- Approve taste: the person-level appreciation gesture. One tap on someone's
-- library ("sam approves your taste"), an optional short note, trigger-written
-- notification, reciprocity handled by simply approving back. Idempotent.

-- ── 1) taste_approvals ────────────────────────────────────────────────────────
create table if not exists public.taste_approvals (
  giver_id    uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  -- the ice-breaker; short by design, empty until (if ever) the giver adds one
  note        text not null default '' check (char_length(note) <= 140),
  created_at  timestamptz not null default now(),
  primary key (giver_id, receiver_id),
  check (giver_id <> receiver_id)
);

create index if not exists taste_approvals_receiver_idx
  on public.taste_approvals (receiver_id);

alter table public.taste_approvals enable row level security;

-- Notes are a private message to the receiver, not public comments — so rows
-- are visible only to the two people involved. The public-facing count goes
-- through the definer function below instead.
drop policy if exists "own taste approvals read"   on public.taste_approvals;
drop policy if exists "approve as yourself"        on public.taste_approvals;
drop policy if exists "edit own approval note"     on public.taste_approvals;
drop policy if exists "unapprove as yourself"      on public.taste_approvals;

create policy "own taste approvals read" on public.taste_approvals for select
  using (exists (select 1 from public.profiles p
                 where p.id in (giver_id, receiver_id) and p.user_id = auth.uid()));
create policy "approve as yourself" on public.taste_approvals for insert
  with check (
    exists (select 1 from public.profiles p
            where p.id = giver_id and p.user_id = auth.uid())
    and not public.is_blocked(receiver_id, giver_id)
  );
create policy "edit own approval note" on public.taste_approvals for update
  using (exists (select 1 from public.profiles p
                 where p.id = giver_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.profiles p
                      where p.id = giver_id and p.user_id = auth.uid()));
create policy "unapprove as yourself" on public.taste_approvals for delete
  using (exists (select 1 from public.profiles p
                 where p.id = giver_id and p.user_id = auth.uid()));

-- public count for the profile sidebar (rows themselves stay private)
create or replace function public.taste_approval_count(p_profile uuid)
returns integer
language sql security definer set search_path = public stable as $$
  select count(*)::integer from public.taste_approvals where receiver_id = p_profile;
$$;

revoke all on function public.taste_approval_count(uuid) from public;
grant execute on function public.taste_approval_count(uuid) to anon, authenticated;

-- ── 2) notifications: new 'taste' type ────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'favorited', 'taste'));

create or replace function public.notify_taste()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blocked(new.receiver_id, new.giver_id) then
    insert into public.notifications (profile_id, type, actor_id)
    values (new.receiver_id, 'taste', new.giver_id);
  end if;
  return new;
end $$;

drop trigger if exists notify_on_taste on public.taste_approvals;
create trigger notify_on_taste
  after insert on public.taste_approvals
  for each row execute function public.notify_taste();

-- un-approving retracts its notification (same anti-ping-abuse rule as unfollow)
create or replace function public.denotify_taste()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
   where profile_id = old.receiver_id and actor_id = old.giver_id and type = 'taste';
  return old;
end $$;

drop trigger if exists denotify_on_untaste on public.taste_approvals;
create trigger denotify_on_untaste
  after delete on public.taste_approvals
  for each row execute function public.denotify_taste();

-- ── 3) write budget (mass-approval protection, same shape as follows) ────────
create or replace function public.enforce_social_budget()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- server-side/seed paths
  if tg_table_name = 'follows' then
    if not public.bump_api_usage('w:follows', 100) then
      raise exception 'daily follow limit reached';
    end if;
  elsif tg_table_name = 'taste_approvals' then
    if not public.bump_api_usage('w:taste', 100) then
      raise exception 'daily approval limit reached';
    end if;
  else
    if not public.bump_api_usage('w:items', 300) then
      raise exception 'daily favorite limit reached';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists budget_taste on public.taste_approvals;
create trigger budget_taste
  before insert on public.taste_approvals
  for each row execute function public.enforce_social_budget();

-- ── 4) blocking severs taste approvals both ways ─────────────────────────────
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
  -- taste rows go both ways too; the delete trigger retracts their notification
  delete from public.taste_approvals
   where (giver_id = me and receiver_id = p_target)
      or (giver_id = p_target and receiver_id = me);
  delete from public.notifications where profile_id = me and actor_id = p_target;
end $$;
