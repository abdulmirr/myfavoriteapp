-- Migration 36 (v2, 2026-10-31): new lists hide when each thing was added.
-- Only the column default changes, so every way a list is born (the web's
-- New list, the extension's extension_create_list) starts with dates off.
-- Existing lists keep whatever they have; the toggle lives in Edit list.

alter table public.lists alter column show_added set default false;
