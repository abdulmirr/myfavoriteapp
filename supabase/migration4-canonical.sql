-- canonical cross-library identity for search-sourced items (book/movie/tv/
-- music/podcast). Source-prefixed so ids never collide across databases:
-- tmdb:movie:603, tmdb:tv:1396, itunes:12345, ol:/works/OL45883W.
-- URL/photo/manual items stay null — matching falls back to title.

alter table public.items add column if not exists canonical_id text;

create index if not exists items_canonical_idx
  on public.items (canonical_id) where canonical_id is not null;
