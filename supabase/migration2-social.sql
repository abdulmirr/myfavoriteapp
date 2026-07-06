-- social layer: friendships + auto-profile creation for new sign-ups

-- ── friendships ──────────────────────────────────────────────────────────────
-- one row per pair, normalized so a < b (uuid order); friendship is mutual
create table if not exists public.friendships (
  a          uuid not null references public.profiles (id) on delete cascade,
  b          uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

create index if not exists friendships_b_idx on public.friendships (b);

alter table public.friendships enable row level security;

drop policy if exists "friendships are public"      on public.friendships;
drop policy if exists "members add friendships"     on public.friendships;
drop policy if exists "members remove friendships"  on public.friendships;

create policy "friendships are public" on public.friendships for select using (true);
create policy "members add friendships" on public.friendships for insert
  with check (exists (select 1 from public.profiles p
                      where (p.id = a or p.id = b) and p.user_id = auth.uid()));
create policy "members remove friendships" on public.friendships for delete
  using (exists (select 1 from public.profiles p
                 where (p.id = a or p.id = b) and p.user_id = auth.uid()));

-- ── every new auth user gets a profile ───────────────────────────────────────
-- first tries to claim a pre-seeded profile by email; otherwise creates one
-- with a unique username derived from the email prefix
create or replace function public.claim_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  update public.profiles
     set user_id = new.id
   where claim_email = lower(new.email) and user_id is null;

  if not found and not exists (select 1 from public.profiles where user_id = new.id) then
    base := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g');
    if length(base) < 2 then base := 'user'; end if;
    base := left(base, 24);
    candidate := base;
    while exists (select 1 from public.profiles where username = candidate) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;
    insert into public.profiles (user_id, username, display_name)
    values (new.id, candidate, split_part(new.email, '@', 1));
  end if;

  return new;
end $$;
