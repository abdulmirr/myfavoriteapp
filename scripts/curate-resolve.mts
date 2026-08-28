// Resolves a batch of titles to app-shaped item rows using the SAME upstream
// sources as /api/search, so canonical ids and artwork match what the UI
// would have produced had each one been added by hand.
// Writes JSON to the path in argv[2]; inserting is curate-apply.mjs's job.
import { readFileSync, writeFileSync } from "node:fs";
// extensionless: tsconfig includes **/*.mts, so `next build` typechecks this
// file and a ".ts" specifier fails without allowImportingTsExtensions
import { tmdb, books } from "../src/lib/search-sources";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
process.env.TMDB_READ_TOKEN = env.TMDB_READ_TOKEN;

const norm = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

type Row = {
  media_type: string;
  title: string;
  creator: string;
  image_url: string | null;
  view_url: string | null;
  year: string;
  canonical_id: string | null;
  _q: string;
};

const out: Row[] = [];
const failed: string[] = [];

// ── movies ────────────────────────────────────────────────────────────────
// TMDB search only; creator stays "" exactly like /api/search leaves it, so
// these sit consistently beside the 30 movies already in the library.
const MOVIES: [string, string?][] = [
  ["Memento", "2000"], ["Akira", "1988"], ["Interstellar", "2014"], ["Moonlight", "2016"],
  ["1917", "2019"], ["Soul", "2020"], ["Parasite", "2019"], ["Baby Driver", "2017"],
  ["Train to Busan", "2016"], ["About Time", "2013"], ["Project X", "2012"],
  ["The Place Beyond the Pines", "2012"], ["The Hangover", "2009"],
  ["500 Days of Summer", "2009"], ["Up", "2009"], ["Inglourious Basterds", "2009"],
  ["WALL·E", "2008"], ["The Pursuit of Happyness", "2006"], ["Superbad", "2007"],
  ["The Terminal", "2004"], ["Lost in Translation", "2003"], ["Trainspotting", "1996"],
  ["Se7en", "1995"], ["Léon: The Professional", "1994"], ["Goodfellas", "1990"],
  ["Dazed and Confused", "1993"], ["Taxi Driver", "1976"], ["Forrest Gump", "1994"],
  ["Slumdog Millionaire", "2008"],
];

for (const [title, year] of MOVIES) {
  const hits = await tmdb("movie", title).catch(() => []);
  // year is the tiebreak, not the filter: TMDB's own ranking is good, but
  // "Up"/"Soul"/"Akira" all collide with newer same-name films.
  const pick =
    (year && hits.find((h) => h.year === year)) ??
    hits.find((h) => norm(h.title) === norm(title)) ??
    hits[0];
  if (!pick) { failed.push(`movie: ${title}`); continue; }
  out.push({ ...pick, creator: "", _q: title } as Row);
}

// ── books ─────────────────────────────────────────────────────────────────
const BOOKS: [string, string][] = [
  ["Brave New World", "Aldous Huxley"],
  ["Kitchen Confidential", "Anthony Bourdain"],
  ["How to Win Friends and Influence People", "Dale Carnegie"],
  ["The Courage to Be Disliked", "Ichiro Kishimi"],
  ["Man's Search for Meaning", "Viktor Frankl"],
  ["Creativity, Inc.", "Ed Catmull"],
  ["The 4-Hour Workweek", "Timothy Ferriss"],
  ["Red Rising", "Pierce Brown"],
  ["Surely You're Joking, Mr. Feynman!", "Richard Feynman"],
  ["Dopamine Nation", "Anna Lembke"],
  ["The Sealed Nectar", "Safiur Rahman Mubarakpuri"],
  ["Minari", ""],
];

for (const [title, author] of BOOKS) {
  const hits = await books(`${title} ${author}`.trim()).catch(() => []);
  const nt = norm(title);
  const na = norm(author);
  const pick =
    hits.find((h) => norm(h.title) === nt && (!na || norm(h.creator).includes(na.split(" ").pop()!))) ??
    hits.find((h) => norm(h.title).startsWith(nt) && (!na || norm(h.creator).includes(na.split(" ").pop()!))) ??
    hits.find((h) => !na || norm(h.creator).includes(na.split(" ").pop()!)) ??
    hits[0];
  if (!pick) { failed.push(`book: ${title}`); continue; }
  out.push({ ...pick, _q: title } as Row);
}

// ── albums ────────────────────────────────────────────────────────────────
// The app's music() merges songs + albums and can't tell them apart once
// mapped (both become itunes:<id>). These are albums, so search the album
// entities directly: iTunes first (existing library uses itunes: ids), Deezer
// where Apple filters or lacks the release (NFR!, indie, instrumentals).
async function itunesAlbum(title: string, artist: string) {
  const term = `${title} ${artist}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=12`;
  let res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) FavoriteApp/1.0" },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
  }
  if (!res?.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((a: Record<string, string | number>) => ({
    media_type: "music",
    title: String(a.collectionName ?? ""),
    creator: String(a.artistName ?? ""),
    image_url: a.artworkUrl100
      ? String(a.artworkUrl100).replace("100x100", "600x600")
      : null,
    view_url: String(a.collectionViewUrl ?? ""),
    year: String(a.releaseDate ?? "").slice(0, 4),
    canonical_id: `itunes:${a.collectionId}`,
  }));
}

async function deezerAlbum(title: string, artist: string) {
  const q = artist ? `artist:"${artist}" album:"${title}"` : title;
  const res = await fetch(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=10`,
    { signal: AbortSignal.timeout(8000) }
  ).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json();
  let rows = data.data ?? [];
  if (!rows.length) {
    const r2 = await fetch(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(`${title} ${artist}`)}&limit=10`,
      { signal: AbortSignal.timeout(8000) }
    ).catch(() => null);
    rows = r2?.ok ? ((await r2.json()).data ?? []) : [];
  }
  return rows.map((a: Record<string, string | number | { name: string }>) => ({
    media_type: "music",
    title: String(a.title ?? ""),
    creator: String((a.artist as { name: string })?.name ?? ""),
    image_url: (a.cover_big as string) ?? null,
    view_url: String(a.link ?? ""),
    year: "",
    canonical_id: `deezer:album:${a.id}`,
  }));
}

// last name / distinctive token is enough — "Kanye West" vs "Ye", "Freddie
// Gibbs & The Alchemist" vs "Freddie Gibbs"
function artistMatches(got: string, want: string) {
  const g = norm(got);
  const w = norm(want);
  if (!w) return true;
  if (g === w || g.includes(w) || w.includes(g)) return true;
  const wt = w.split(" ").filter((t) => t.length > 2);
  return wt.length > 0 && wt.every((t) => g.includes(t));
}

function scoreAlbum(hit: { title: string; creator: string }, title: string, artist: string) {
  const t = norm(hit.title);
  const nt = norm(title);
  if (!artistMatches(hit.creator, artist)) return -1;
  if (t === nt) return 100;
  if (t.startsWith(`${nt} `)) return 80; // "…(Deluxe)", "…Anniversary Edition"
  if (t.includes(nt)) return 60;
  if (nt.includes(t) && t.length > 4) return 50;
  return -1;
}

const ALBUMS: [string, string][] = [
  ["The College Dropout", "Kanye West"],
  ["Late Registration", "Kanye West"],
  ["808s & Heartbreak", "Kanye West"],
  ["My Beautiful Dark Twisted Fantasy", "Kanye West"],
  ["Donda", "Kanye West"],
  ["Whatever People Say I Am, That's What I'm Not", "Arctic Monkeys"],
  ["The Velvet Underground & Nico", "The Velvet Underground"],
  ["Trilogy", "The Weeknd"],
  ["Take Care", "Drake"],
  ["Sunburn", "Dominic Fike"],
  ["The Suburbs", "Arcade Fire"],
  ["The Social Network", "Trent Reznor and Atticus Ross"],
  ["Her", "Arcade Fire"],
  ["Discovery", "Daft Punk"],
  ["Punisher", "Phoebe Bridgers"],
  ["Pray for Paris", "Westside Gunn"],
  ["Plastic Beach", "Gorillaz"],
  ["Oracular Spectacular", "MGMT"],
  ["Oppenheimer", "Ludwig Göransson"],
  ["Nothing Was the Same", "Drake"],
  ["Norman Fucking Rockwell!", "Lana Del Rey"],
  ["Never Enough", "Daniel Caesar"],
  ["Modal Soul", "Nujabes"],
  ["The Melodic Blue", "Baby Keem"],
  ["Madvillainy", "Madvillain"],
  ["Love & Hate", "Michael Kiwanuka"],
  ["LONG.LIVE.A$AP", "A$AP Rocky"],
  ["Licensed to Ill", "Beastie Boys"],
  ["Jesus Is King", "Kanye West"],
  ["In Waves", "Jamie xx"],
  ["In the Aeroplane Over the Sea", "Neutral Milk Hotel"],
  ["IGOR", "Tyler, The Creator"],
  ["good kid, m.A.A.d city", "Kendrick Lamar"],
  ["The Girl, The Cat and The Tree", "Lausse The Cat"],
  ["Funeral", "Arcade Fire"],
  ["For Emma, Forever Ago", "Bon Iver"],
  ["Either/Or", "Elliott Smith"],
  ["Die for My Bitch", "Baby Keem"],
  ["Conditions", "The Temper Trap"],
  ["Case Study 01", "Daniel Caesar"],
  ["Bo Jackson", "Boldy James"],
  ["The Bends", "Radiohead"],
  ["BALLADS 1", "Joji"],
  ["Awaken, My Love!", "Childish Gambino"],
  ["ASTROWORLD", "Travis Scott"],
  ["Alfredo", "Freddie Gibbs"],
  ["Actual Life", "Fred again.."],
  ["1999", "Joey Bada$$"],
];

for (const [title, artist] of ALBUMS) {
  const [ap, dz] = await Promise.all([
    itunesAlbum(title, artist).catch(() => []),
    deezerAlbum(title, artist).catch(() => []),
  ]);
  const ranked = [...ap, ...dz]
    .map((h, i) => ({ h, s: scoreAlbum(h, title, artist) - i * 0.4 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const pick = ranked[0]?.h;
  if (!pick) { failed.push(`album: ${title} — ${artist}`); continue; }
  out.push({ ...pick, _q: `${title} — ${artist}` } as Row);
}

// ── links ─────────────────────────────────────────────────────────────────
// Mirrors /api/og: og:title / <title>, og:image, og:site_name — media_type
// "article", which the UI labels "link".
function metaTag(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i"
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();

const LINKS = [
  "https://pmarchive.com/",
  "https://drive.google.com/file/d/1YaG9xpu-WQKBPUi8yQ4HaDYQLUSa7Y3J/view",
  "https://www.henrikkarlsson.xyz/p/good-ideas",
  "https://paragraph.com/@npc-788/unhinged-curiosity-as-ambition",
  "https://x.com/benln/status/2018035287851704556",
  "https://farza.substack.com/",
  "https://www.paulgraham.com/love.html",
  "https://paulgraham.com/cities.html",
  "https://blog.samaltman.com/how-to-be-successful",
];

for (const url of LINKS) {
  const u = new URL(url);
  let title = "";
  let image: string | null = null;
  let site = u.hostname.replace(/^www\./, "");
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = (await res.text()).slice(0, 300_000);
    title = decode(
      metaTag(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ""
    );
    const img = metaTag(html, "og:image");
    image = img ? decode(img) : null;
    const sn = metaTag(html, "og:site_name");
    if (sn) site = decode(sn);
  } catch {
    /* fall through to the URL-derived defaults below */
  }
  out.push({
    media_type: "article",
    title: title || u.hostname.replace(/^www\./, ""),
    creator: site,
    image_url: image,
    view_url: url,
    year: "",
    canonical_id: null,
    _q: url,
  });
}

writeFileSync(process.argv[2], JSON.stringify({ out, failed }, null, 2));
console.log(`resolved ${out.length}, failed ${failed.length}`);
for (const f of failed) console.log(`  FAILED ${f}`);
