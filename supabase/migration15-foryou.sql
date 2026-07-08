-- For You feedback loop: "not for me" dismissals. A dismissed pick disappears
-- from today's set and is excluded from future generations, giving the taste
-- engine its first negative signal. Idempotent.

create table if not exists public.rec_dismissals (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  media_type text not null,
  title      text not null,
  creator    text not null default '',
  created_at timestamptz not null default now(),
  -- natural key: passing on the same pick twice is a no-op, not a new row
  primary key (profile_id, media_type, title)
);

create index if not exists rec_dismissals_recency_idx
  on public.rec_dismissals (profile_id, created_at desc);

alter table public.rec_dismissals enable row level security;

-- taste feedback is private to its owner — nobody else can read or write it
drop policy if exists "own dismissals read"   on public.rec_dismissals;
drop policy if exists "own dismissals insert" on public.rec_dismissals;
drop policy if exists "own dismissals delete" on public.rec_dismissals;

create policy "own dismissals read" on public.rec_dismissals for select
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
create policy "own dismissals insert" on public.rec_dismissals for insert
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.user_id = auth.uid()));
create policy "own dismissals delete" on public.rec_dismissals for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));
