// Seeds Abdul's favorites with real metadata from TMDB / Open Library / iTunes.
// Idempotent: skips items whose title already exists for the profile.
import { client, env } from "./db.mjs";

const TMDB = "https://api.themoviedb.org/3";
const tmdbHeaders = { Authorization: `Bearer ${env.TMDB_READ_TOKEN}` };

async function movie(query, year) {
  const url = `${TMDB}/search/movie?query=${encodeURIComponent(query)}${year ? `&year=${year}` : ""}`;
  const r = await (await fetch(url, { headers: tmdbHeaders })).json();
  const m = r.results?.[0];
  if (!m) throw new Error(`TMDB: no result for ${query}`);
  // director from credits
  const credits = await (await fetch(`${TMDB}/movie/${m.id}/credits`, { headers: tmdbHeaders })).json();
  const director = credits.crew?.find((c) => c.job === "Director")?.name ?? "";
  return {
    media_type: "movie",
    title: m.title,
    creator: director,
    image_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    view_url: `https://www.themoviedb.org/movie/${m.id}`,
    metadata: { year: (m.release_date ?? "").slice(0, 4), tmdb_id: m.id },
  };
}

async function book(query, author) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query + " " + author)}&limit=5`;
  const r = await (await fetch(url)).json();
  const b = r.docs?.find((d) => d.cover_i) ?? r.docs?.[0];
  if (!b) throw new Error(`OpenLibrary: no result for ${query}`);
  return {
    media_type: "book",
    title: b.title,
    creator: b.author_name?.[0] ?? author,
    image_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : null,
    view_url: `https://openlibrary.org${b.key}`,
    metadata: { year: b.first_publish_year, ol_key: b.key },
  };
}

async function itunes(query, entity, mediaType) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=5`;
  const r = await (await fetch(url)).json();
  const s = r.results?.[0];
  if (!s) throw new Error(`iTunes: no result for ${query}`);
  return {
    media_type: mediaType,
    title: s.trackName ?? s.collectionName,
    creator: s.artistName,
    image_url: (s.artworkUrl100 ?? "").replace("100x100", "600x600") || null,
    view_url: s.trackViewUrl ?? s.collectionViewUrl,
    metadata: { year: (s.releaseDate ?? "").slice(0, 4), itunes_id: s.trackId ?? s.collectionId },
  };
}

const fetchers = [
  () => movie("The Social Network"),
  () => movie("Her", 2013),
  () => movie("Nightcrawler", 2014),
  () => movie("Obsession", 1976),
  () => book("Endurance Shackleton's Incredible Voyage", "Alfred Lansing"),
  () => book("Shoe Dog", "Phil Knight"),
  () => book("Steve Jobs", "Walter Isaacson"),
  () => itunes("Runaway Kanye West", "song", "music"),
  () => itunes("My Way Frank Sinatra", "song", "music"),
  () => itunes("Random Access Memories Daft Punk", "album", "music"),
];

const db = client();
await db.connect();
try {
  const { rows: [profile] } = await db.query(
    "select id from profiles where username = 'abdulmir'"
  );
  if (!profile) throw new Error("profile abdulmir not found — run migrate first");

  let order = 0;
  for (const f of fetchers) {
    const item = await f();
    order += 1;
    const { rowCount } = await db.query(
      "select 1 from items where profile_id = $1 and title = $2",
      [profile.id, item.title]
    );
    if (rowCount) { console.log(`skip (exists): ${item.title}`); continue; }
    await db.query(
      `insert into items (profile_id, media_type, title, creator, image_url, view_url, metadata, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [profile.id, item.media_type, item.title, item.creator, item.image_url,
       item.view_url, JSON.stringify(item.metadata), order]
    );
    console.log(`seeded: ${item.title} — ${item.creator} (${item.media_type})`);
  }
} finally {
  await db.end();
}
