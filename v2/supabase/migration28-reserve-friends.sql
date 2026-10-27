-- v2: /friends now redirects to /feed, so the name can never be a profile.
-- (v1 also routed /friends without reserving it.) Additive: only new claims
-- are affected; no existing profile uses it (checked 2026-10-26).
create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql immutable as $$
  select p_name = any (array[
    'add','explore','welcome','signin','signup','profile','settings','privacy',
    'terms','auth','api','home','favorites','favorite','admin','about',
    'help','item','items','notifications','search','import','landing','recap',
    'extension',
    -- v2
    'feed','lists','list','activity','saved','today','login','logout',
    'discover','archive','new','friends'
  ]);
$$;
