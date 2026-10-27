-- Favorite v2: carry v1's private "Saved for later" shelf (radar_items) into
-- lists. Each owner gets a PRIVATE "Saved for later" list holding copies of
-- their radar rows (newest on top, provenance kept). radar_items itself is
-- left untouched — v1 still reads it. Idempotent: re-run at launch to pick up
-- anything saved in v1 meanwhile (existing list rows are skipped by the
-- (list_id, work_key) unique key).

insert into public.lists (profile_id, title, slug, description, is_public)
select distinct r.profile_id, 'Saved for later', 'saved-for-later', '', false
  from public.radar_items r
on conflict (profile_id, slug) do nothing;

insert into public.list_items (
  list_id, profile_id, media_type, title, creator, image_url, view_url,
  metadata, canonical_id, position, via_profile_id, source_item_id, created_at
)
select l.id, r.profile_id, r.media_type, r.title, coalesce(r.creator, ''), r.image_url,
       r.view_url, coalesce(r.metadata, '{}'::jsonb), r.canonical_id,
       -extract(epoch from r.created_at), r.via_profile_id, r.source_item_id, r.created_at
  from public.radar_items r
  join public.lists l on l.profile_id = r.profile_id and l.slug = 'saved-for-later'
on conflict (list_id, work_key) do nothing;
