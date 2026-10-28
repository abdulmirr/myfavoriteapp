-- Favorite v2, third batch (2026-10-27): finishing what you saved.
-- A list item can be marked finished (watched, read, listened to). Finished
-- items sink into a "Finished" section on the list page; nothing else reads
-- the column, so v1 and the browser extension are unaffected. Additive and
-- idempotent: safe to re-run. The existing owner-only update policy on
-- list_items already covers writing it.
alter table public.list_items add column if not exists done_at timestamptz;
