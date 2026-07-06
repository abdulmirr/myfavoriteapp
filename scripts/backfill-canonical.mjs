// Backfill items.canonical_id for search-sourced media types.
//
// Two passes per row:
//   1. metadata.source_id (written briefly before canonical_id existed) maps
//      directly: movie/tv → tmdb:<type>:<id>; book "/works/…" → ol:<key>;
//      book/music/podcast numeric → itunes:<id>.
//   2. otherwise re-search /api/search by title and accept only a
//      high-confidence hit: exact normalized title, plus either a real
//      creator match on both sides (year ignored — editions/remasters shift
//      it) or, when a creator is missing, agreeing years to disambiguate
//      same-titled works.
//
// Needs the dev server running (default http://localhost:3000).
// Usage: node scripts/backfill-canonical.mjs [--dry]

import { client } from "./db.mjs";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const DRY = process.argv.includes("--dry");
const SEARCHABLE = ["book", "movie", "tv", "music", "podcast"];

const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, " ");

// strong: both creators present and agreeing. weak: one side missing.
const creatorsAgree = (a, b) => {
  const [x, y] = [norm(a), norm(b)];
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};
const confident = (hit, row) => {
  if (norm(hit.title) !== norm(row.title)) return false;
  if (creatorsAgree(hit.creator ?? "", row.creator ?? "")) return true;
  if (norm(hit.creator ?? "") && norm(row.creator ?? "")) return false; // both present, disagree
  // creator missing on a side — fall back to year to tell same-titled works apart
  return !!row.year && !!hit.year && String(hit.year) === String(row.year);
};

function fromSourceId(mediaType, sid) {
  if (!sid) return null;
  if (mediaType === "movie" || mediaType === "tv") return `tmdb:${mediaType}:${sid}`;
  if (sid.startsWith("/")) return `ol:${sid}`;
  return `itunes:${sid}`;
}

const db = client();
await db.connect();
const { rows } = await db.query(
  `select id, media_type, title, creator,
          metadata->>'source_id' as source_id, metadata->>'year' as year
     from public.items
    where canonical_id is null and media_type = any($1)
    order by created_at`,
  [SEARCHABLE]
);

let mapped = 0, matched = 0, skipped = 0;
for (const row of rows) {
  let canonical = fromSourceId(row.media_type, row.source_id);
  let how = "source_id";

  if (!canonical) {
    how = "re-search";
    try {
      const res = await fetch(
        `${BASE}/api/search?type=${row.media_type}&q=${encodeURIComponent(row.title)}`
      );
      const { results = [] } = await res.json();
      const hit = results.find((r) => r.canonical_id && confident(r, row));
      canonical = hit?.canonical_id ?? null;
    } catch (e) {
      console.error(`  search failed for "${row.title}": ${e.message}`);
    }
  }

  if (!canonical) {
    skipped++;
    console.log(`SKIP   ${row.media_type}  "${row.title}" — no confident match`);
    continue;
  }
  if (!DRY) {
    await db.query("update public.items set canonical_id = $1 where id = $2", [
      canonical,
      row.id,
    ]);
  }
  how === "source_id" ? mapped++ : matched++;
  console.log(`${DRY ? "WOULD " : "SET   "} ${row.media_type}  "${row.title}" → ${canonical} (${how})`);
}

console.log(
  `\n${rows.length} candidates: ${mapped} mapped from source_id, ${matched} matched by re-search, ${skipped} skipped${DRY ? " (dry run)" : ""}`
);
await db.end();
