-- Launch fixes: provenance forgery, recommendations claim release, reserved 'add'.
-- Idempotent — re-run any time.

-- ── 1) provenance must be real ────────────────────────────────────────────────
-- The items INSERT policy only checks profile ownership, so a writer could set
-- via_profile_id to anyone and notify_favorited would ping that victim with a
-- fake "favorited your item". Validate at write time: provenance is either
-- absent, or points at an existing item that genuinely belongs to via_profile.
-- Security definer so the lookup doesn't depend on the caller's row access;
-- only enforced when the provenance fields themselves change — source_item_id
-- is on-delete-set-null, and edits to such rows must keep working.
create or replace function public.validate_item_provenance()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.via_profile_id is not distinct from old.via_profile_id
     and new.source_item_id is not distinct from old.source_item_id then
    return new;
  end if;

  if new.via_profile_id is not null then
    if new.via_profile_id = new.profile_id then
      raise exception 'invalid provenance' using errcode = 'check_violation';
    end if;
    if new.source_item_id is null or not exists (
      select 1 from public.items s
       where s.id = new.source_item_id
         and s.profile_id = new.via_profile_id
    ) then
      raise exception 'invalid provenance' using errcode = 'check_violation';
    end if;
  elsif new.source_item_id is not null then
    -- source without via has no meaning; reject rather than store junk
    raise exception 'invalid provenance' using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists validate_provenance on public.items;
create trigger validate_provenance
  before insert or update on public.items
  for each row execute function public.validate_item_provenance();

-- ── 2) recommendations: owners may delete (claim release) ─────────────────────
-- The API releases a failed/empty claim row with .delete(); without a DELETE
-- policy that silently affects 0 rows, so empty-library users poll a stale
-- claim forever and failed generations block retries for 3 minutes.
drop policy if exists "own recommendations delete" on public.recommendations;
create policy "own recommendations delete" on public.recommendations for delete
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.user_id = auth.uid()));

-- ── 3) reserve 'add' (a live route) ───────────────────────────────────────────
-- /add would permanently shadow a profile claimed under that name.
create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql immutable as $$
  select p_name = any (array[
    'add','explore','welcome','signin','signup','profile','settings','privacy',
    'terms','auth','api','home','favorites','favorite','admin','about',
    'help','item','items','notifications','search','import','landing','recap'
  ]);
$$;

alter table public.profiles
  drop constraint if exists username_not_reserved;
alter table public.profiles
  add constraint username_not_reserved
  check (not public.is_reserved_username(username));
