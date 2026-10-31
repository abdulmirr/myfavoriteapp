-- Migration 37 (v2, 2026-10-31): Discover's "Because you love" rows load again.
--
-- discover_for ran with the caller's rights, so every read went through row
-- security, and with its viewer as a parameter the planner turned the
-- fan-of-a-fan join into nested loops over the whole library: 89s as anon
-- (0.3s as the owner), cancelled by anon's 3s statement timeout every time.
-- It reads only public data (favorites, profiles, saves on public lists,
-- filtered explicitly in the function), so it runs with its owner's rights.

alter function public.discover_for(uuid) security definer;
