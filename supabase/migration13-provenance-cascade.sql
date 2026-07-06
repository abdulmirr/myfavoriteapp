-- Fix: deleting an item that others have favorited raised 'invalid provenance'.
-- Idempotent — re-run any time.
--
-- items.source_item_id and via_profile_id are both ON DELETE SET NULL. When an
-- item (or a profile) is deleted, Postgres fires an UPDATE on every row that
-- referenced it to null the pointer — and that UPDATE hit validate_item_provenance
-- (migration12), which rejected the now half-null provenance as forged. The
-- cascade update aborted, so the ORIGINAL delete failed with 'invalid provenance'.
--
-- A cascade nulling a pointer is never a forgery attempt (notify_on_favorited
-- fires on INSERT only, so no UPDATE can spawn a fake notification). Tolerate it:
--   • source item deleted  → keep via_profile_id so reach ("via @user") survives
--   • via profile deleted  → provenance is meaningless; drop the dangling source
create or replace function public.validate_item_provenance()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- provenance untouched (a normal edit: description, position, pin…) — allow
    if new.via_profile_id is not distinct from old.via_profile_id
       and new.source_item_id is not distinct from old.source_item_id then
      return new;
    end if;

    -- source item deleted (ON DELETE SET NULL): keep via for the reach stat
    if new.source_item_id is null and old.source_item_id is not null
       and new.via_profile_id is not distinct from old.via_profile_id then
      return new;
    end if;

    -- via profile deleted: no attribution possible — clear the dangling source
    if new.via_profile_id is null and old.via_profile_id is not null then
      new.source_item_id := null;
      return new;
    end if;
  end if;

  -- INSERT, or an UPDATE that genuinely sets/changes provenance: it must be real.
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

-- trigger binding unchanged from migration12; re-assert for standalone re-runs
drop trigger if exists validate_provenance on public.items;
create trigger validate_provenance
  before insert or update on public.items
  for each row execute function public.validate_item_provenance();
