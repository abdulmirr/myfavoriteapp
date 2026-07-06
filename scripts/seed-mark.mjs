// Seeds a test user "Mark Delaney" with a library of real-metadata items and a
// friendship with abdulmir, for exercising the social features locally.
// Idempotent: profile, friendship, and items are all skipped if present.
import { client, env } from "./db.mjs";

const TMDB = "https://api.themoviedb.org/3";
const tmdbHeaders = { Authorization: `Bearer ${env.TMDB_READ_TOKEN}` };

async function movie(query, year) {
  const url = `${TMDB}/search/movie?query=${encodeURIComponent(query)}${year ? `&year=${year}` : ""}`;
  const r = await (await fetch(url, { headers: tmdbHeaders })).json();
  const m = r.results?.[0];
  if (!m) throw new Error(`TMDB: no result for ${query}`);
  const credits = await (await fetch(`${TMDB}/movie/${m.id}/credits`, { headers: tmdbHeaders })).json();
  const director = credits.crew?.find((c) => c.job === "Director")?.name ?? "";
  return {
    media_type: "movie",
    title: m.title,
    creator: director,
    image_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    view_url: `https://www.themoviedb.org/movie/${m.id}`,
    metadata: { year: (m.release_date ?? "").slice(0, 4), tmdb_id: m.id },
    canonical_id: `tmdb:movie:${m.id}`,
  };
}

async function tv(query) {
  const url = `${TMDB}/search/tv?query=${encodeURIComponent(query)}`;
  const r = await (await fetch(url, { headers: tmdbHeaders })).json();
  const s = r.results?.[0];
  if (!s) throw new Error(`TMDB: no tv result for ${query}`);
  const detail = await (await fetch(`${TMDB}/tv/${s.id}`, { headers: tmdbHeaders })).json();
  return {
    media_type: "tv",
    title: s.name,
    creator: detail.created_by?.[0]?.name ?? "",
    image_url: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
    view_url: `https://www.themoviedb.org/tv/${s.id}`,
    metadata: { year: (s.first_air_date ?? "").slice(0, 4), tmdb_id: s.id },
    canonical_id: `tmdb:tv:${s.id}`,
  };
}

// books come from iTunes ebook search (matches src/lib/search-sources.ts:
// Apple artwork loads reliably, canonical id is itunes:<trackId>)
async function itunes(query, entity, mediaType) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=5`;
  const r = await (await fetch(url)).json();
  const s = r.results?.[0];
  if (!s) throw new Error(`iTunes: no result for ${query}`);
  const id = s.trackId ?? s.collectionId;
  return {
    media_type: mediaType,
    title: s.trackName ?? s.collectionName,
    creator: s.artistName,
    image_url: (s.artworkUrl100 ?? "").replace("100x100", "600x600") || null,
    view_url: s.trackViewUrl ?? s.collectionViewUrl,
    metadata: { year: (s.releaseDate ?? "").slice(0, 4), itunes_id: id },
    canonical_id: id ? `itunes:${id}` : null,
  };
}

// Mark's taste: overlaps with abdulmir on The Social Network and Random Access
// Memories (to exercise the "Favorited by" overlap UI), plus his own picks.
const fetchers = [
  () => movie("Heat", 1995),
  () => movie("Blade Runner 2049"),
  () => movie("Whiplash", 2014),
  () => movie("The Social Network"),
  () => tv("Breaking Bad"),
  () => itunes("The Martian Andy Weir", "ebook", "book"),
  () => itunes("Zero to One Peter Thiel", "ebook", "book"),
  () => itunes("The Slow Rush Tame Impala", "album", "music"),
  () => itunes("Money Trees Kendrick Lamar", "song", "music"),
  () => itunes("Random Access Memories Daft Punk", "album", "music"),
  () => itunes("Lex Fridman Podcast", "podcast", "podcast"),
];

const db = client();
await db.connect();
try {
  const { rows: [mark] } = await db.query(
    `insert into profiles (claim_email, username, display_name, bio)
     values ('mark.delaney.test@gmail.com', 'markdelaney', 'Mark Delaney',
             'test user. collects movies and reads too much sci-fi.')
     on conflict (username) do update set username = excluded.username
     returning id`
  );
  console.log(`profile markdelaney: ${mark.id}`);

  const { rows: [abdul] } = await db.query(
    "select id from profiles where username = 'abdulmir'"
  );
  if (abdul) {
    await db.query(
      `insert into friendships (a, b)
       values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))
       on conflict do nothing`,
      [abdul.id, mark.id]
    );
    console.log("friendship abdulmir <-> markdelaney ensured");
  } else {
    console.log("abdulmir profile not found — skipped friendship");
  }

  let order = 0;
  for (const f of fetchers) {
    const item = await f();
    order += 1;
    const { rowCount } = await db.query(
      "select 1 from items where profile_id = $1 and title = $2",
      [mark.id, item.title]
    );
    if (rowCount) { console.log(`skip (exists): ${item.title}`); continue; }
    await db.query(
      `insert into items (profile_id, media_type, title, creator, image_url,
                          view_url, metadata, sort_order, canonical_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [mark.id, item.media_type, item.title, item.creator, item.image_url,
       item.view_url, JSON.stringify(item.metadata), order, item.canonical_id]
    );
    console.log(`seeded: ${item.title} — ${item.creator} (${item.media_type})`);
  }
} finally {
  await db.end();
}
