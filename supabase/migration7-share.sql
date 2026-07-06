-- share surface: pinned Top 4 — the profile's identity row and OG-card centerpiece
alter table public.items
  add column if not exists pinned_order int
  check (pinned_order is null or pinned_order between 1 and 4);

create index if not exists items_pinned_idx
  on public.items (profile_id, pinned_order) where pinned_order is not null;
