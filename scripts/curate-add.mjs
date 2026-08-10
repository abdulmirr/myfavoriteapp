// Small follow-up additions to @abdulmir's library — one TMDB film and two
// iTunes podcasts, resolved the same way /api/search would.
// Usage: node scripts/curate-add.mjs [--commit]
import { client, env } from "./db.mjs";

const COMMIT = process.argv.includes("--commit");

async function movie(q, year) {
  const r = await (
    await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${env.TMDB_READ_TOKEN}` },
    })
  ).json();
  const m = (r.results ?? []).find((x) => (x.release_date ?? "").startsWith(year)) ?? r.results?.[0];
  if (!m) throw new Error(`TMDB miss: ${q}`);
  return {
    media_type: "movie",
    title: m.title,
    creator: "", // matches how /api/search leaves TMDB rows
    image_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    view_url: `https://www.themoviedb.org/movie/${m.id}`,
    year: (m.release_date ?? "").slice(0, 4),
    canonical_id: `tmdb:movie:${m.id}`,
  };
}

async function podcast(q) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast&limit=10`;
  let res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) FavoritesApp/1.0" },
      signal: AbortSignal.timeout(8000),
    });
  }
  const hits = (await res.json()).results ?? [];
  const nq = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const p =
    hits.find((h) => (h.collectionName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === nq) ??
    hits[0];
  if (!p) throw new Error(`iTunes miss: ${q}`);
  return {
    media_type: "podcast",
    title: p.collectionName,
    creator: p.artistName ?? "",
    image_url: p.artworkUrl600 ?? ((p.artworkUrl100 ?? "").replace("100x100", "600x600") || null),
    view_url: p.collectionViewUrl ?? null,
    year: (p.releaseDate ?? "").slice(0, 4),
    canonical_id: `itunes:${p.collectionId}`,
  };
}

const rows = [
  await movie("Minari", "2020"),
  await podcast("Huberman Lab"),
  await podcast("The Tim Ferriss Show"),
];

const db = client();
await db.connect();
try {
  await db.query("begin");
  const { rows: [me] } = await db.query("select id from profiles where username = 'abdulmir'");
  const { rows: existing } = await db.query(
    "select media_type, title, canonical_id from items where profile_id = $1",
    [me.id]
  );
  const haveKey = new Set(existing.map((e) => `${e.media_type}|${e.title.toLowerCase().trim()}`));
  const haveCanon = new Set(existing.map((e) => e.canonical_id).filter(Boolean));
  const { rows: [{ mx }] } = await db.query(
    "select coalesce(max(sort_order), -1) as mx from items where profile_id = $1",
    [me.id]
  );
  let order = Number(mx) + 1;

  for (const r of rows) {
    if (haveCanon.has(r.canonical_id) || haveKey.has(`${r.media_type}|${r.title.toLowerCase().trim()}`)) {
      console.log(`skipped (already saved) ${r.media_type}: ${r.title}`);
      continue;
    }
    await db.query(
      `insert into items (profile_id, media_type, title, creator, description,
                          image_url, view_url, metadata, sort_order, canonical_id)
       values ($1,$2,$3,$4,'',$5,$6,$7,$8,$9)`,
      [me.id, r.media_type, r.title, r.creator, r.image_url, r.view_url,
       JSON.stringify(r.year ? { year: r.year } : {}), order++, r.canonical_id]
    );
    console.log(`added ${r.media_type}: ${r.title}${r.creator ? ` — ${r.creator}` : ""} (${r.year}) ${r.canonical_id}`);
  }

  if (COMMIT) {
    await db.query("commit");
    console.log("COMMITTED");
  } else {
    await db.query("rollback");
    console.log("DRY RUN — rolled back.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
