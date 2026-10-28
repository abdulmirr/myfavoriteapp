// One link, one work (migration32): the database's url_work_key and the
// client's lib/url-key.ts must agree on every address in the database, and
// the obvious variants of a link must land on the same key. Runs the
// migration inside a transaction and ROLLS BACK unless --apply is passed —
// so this doubles as the migration's dry run (what would merge, what a list's
// uniqueness would skip).
//   node scripts/_e2e-url-key.mjs            dry run + parity
//   node scripts/_e2e-url-key.mjs --apply    the same, then COMMIT
import { readFileSync } from "node:fs";
import { client } from "./db.mjs";
import { urlWorkKey } from "../src/lib/url-key.ts";

const apply = process.argv.includes("--apply");
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};

await db.query("begin");
try {
  await db.query(readFileSync(new URL("../supabase/migration32-v2-url-identity.sql", import.meta.url), "utf8"));

  // 1. variants of one link → one key (SQL), and the client agrees
  const same = [
    ["https://playfighter.substack.com/", "http://www.playfighter.substack.com", "https://playfighter.substack.com/?r=2abc&utm_source=x#top"],
    ["https://youtu.be/q7E2swfnuzs?si=sfcp0l3akgVDXXWX", "https://www.youtube.com/watch?v=q7E2swfnuzs&list=RDq7E2swfnuzs&start_radio=1", "https://m.youtube.com/shorts/q7E2swfnuzs"],
    ["https://www.paulgraham.com/greatwork.html", "http://paulgraham.com/greatwork.html#f1n", "https://paulgraham.com/greatwork.html?utm_campaign=x&fbclid=y"],
    ["https://example.com/read?b=2&a=1", "https://example.com/read/?a=1&b=2"],
    ["https://twitter.com/naval/status/1002103360646823936?s=20", "https://x.com/naval/status/1002103360646823936"],
    ["https://www.themoviedb.org/movie/77-memento", "https://www.themoviedb.org/movie/77"],
  ];
  for (const group of same) {
    const keys = [];
    for (const u of group) keys.push([(await q("select public.url_work_key($1) k", [u]))[0].k, await urlWorkKey(u)]);
    const sql = new Set(keys.map((k) => k[0]));
    check(`one key for ${group[0]}`, sql.size === 1 && keys.every(([s, t]) => s === t), [...sql].join(" | "));
  }
  const apart = await q("select public.url_work_key('https://example.com/page?id=1') a, public.url_work_key('https://example.com/page?id=2') b");
  check("different pages stay apart", apart[0].a !== apart[0].b);
  const known = {
    "https://www.themoviedb.org/tv/1396": "tmdb:tv:1396",
    "https://www.deezer.com/album/701132071": "deezer:album:701132071",
    "https://www.deezer.com/show/1234567": "deezer:podcast:1234567",
    "https://music.apple.com/us/album/u-me-3/6779097512?i=6779097540&uo=4": "itunes:6779097540",
    "https://music.apple.com/us/album/in-rainbows/1109714933?uo=4": "itunes:1109714933",
    "https://books.apple.com/us/book/atomic-habits/id1384286945?uo=4": "itunes:1384286945",
    "https://openlibrary.org/works/OL19650409W": "ol:/works/OL19650409W",
    "https://vimeo.com/channels/staffpicks/123456789": "vimeo:123456789",
    "https://open.spotify.com/intl-de/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc": "spotify:episode:4rOoJ6Egrf8K2IrywzwOMk",
  };
  for (const [u, want] of Object.entries(known)) {
    const s = (await q("select public.url_work_key($1) k", [u]))[0].k;
    check(`catalog id for ${u.slice(8, 48)}…`, s === want && (await urlWorkKey(u)) === want, s);
  }

  // 2. parity on every address in the database
  const urls = (await q("select distinct view_url u from (select view_url from items union all select view_url from list_items) x where view_url is not null")).map((r) => r.u);
  const sqlKeys = new Map((await q("select u, public.url_work_key(u) k from unnest($1::text[]) u", [urls])).map((r) => [r.u, r.k]));
  const mismatches = [];
  for (const u of urls) {
    const t = await urlWorkKey(u);
    if (t !== sqlKeys.get(u)) mismatches.push(`${u} → sql ${sqlKeys.get(u)} / ts ${t}`);
  }
  check(`client and database agree on all ${urls.length} stored addresses`, mismatches.length === 0, mismatches.slice(0, 3).join(" ; "));

  // 3. what the backfill did (inside this transaction)
  const merged = await q(`
    select canonical_id, count(*)::int copies, count(distinct profile_id)::int people, min(title) title
      from items where canonical_id ~ '^(url|youtube|vimeo|spotify):'
     group by 1 having count(distinct profile_id) > 1 order by 3 desc, 2 desc`);
  console.log(`\n${merged.length} links now shared by 2+ people:`);
  for (const m of merged.slice(0, 12)) console.log(`  ${m.people} people  ${m.title.slice(0, 60)}  (${m.canonical_id})`);
  const pf = await q("select p.username, i.canonical_id from items i join profiles p on p.id = i.profile_id where i.view_url ilike '%playfighter.substack.com%'");
  check("Playfighter is one work (Abdul + Ali)", pf.length >= 2 && new Set(pf.map((r) => r.canonical_id)).size === 1 && !!pf[0].canonical_id, JSON.stringify(pf));
  const catalog = (await q(`select count(*)::int n from items where canonical_id ~ '^(tmdb|itunes|deezer|ol):' and media_type::text in ('movie','tv','music','book','podcast')`))[0].n;
  console.log(`catalog-typed favorites with a catalog id now: ${catalog}`);
  const leftovers = await q(`select media_type::text t, count(*)::int n from items where canonical_id is null and view_url is not null group by 1 order by 2 desc`);
  console.log("still without an id (catalog rows whose link isn't a catalog page):", JSON.stringify(leftovers));
  const skipped = (await q("select count(*)::int n from list_items where canonical_id is null and view_url is not null and media_type in ('article','video','other')"))[0].n;
  console.log(`list rows left as they were (duplicate page in the same list): ${skipped}`);
  const urlCatalogType = (await q(`select count(*)::int n from items where canonical_id ~ '^url:' and media_type::text not in ('article','video','other')`))[0].n;
  check("catalog-typed rows never get a url: hash", urlCatalogType === 0, String(urlCatalogType));

  // 4. the trigger on new writes
  const someone = (await q("select id from profiles where username = 'abdulmir'"))[0].id;
  const ins = await q(
    "insert into items (profile_id, media_type, title, creator, view_url, sort_order) values ($1, 'article', 'trigger test', '', 'https://www.Example.com/Essay/?utm_medium=x', 99999) returning canonical_id",
    [someone]
  );
  check("new link favorites get the key on insert", ins[0].canonical_id === (await urlWorkKey("https://example.com/Essay")), ins[0].canonical_id);
  const spoof = await q(
    "insert into items (profile_id, media_type, title, creator, view_url, canonical_id, sort_order) values ($1, 'article', 'spoof test', '', 'https://example.com/a', 'url:deadbeef', 99999) returning canonical_id",
    [someone]
  );
  check("a client-sent url: key is re-derived", spoof[0].canonical_id === (await urlWorkKey("https://example.com/a")), spoof[0].canonical_id);
  const keep = await q(
    "insert into items (profile_id, media_type, title, creator, view_url, canonical_id, sort_order) values ($1, 'music', 'keep test', '', 'https://music.apple.com/us/album/x/111111', 'deezer:album:1', 99999) returning canonical_id",
    [someone]
  );
  check("a catalog id from search is kept", keep[0].canonical_id === "deezer:album:1", keep[0].canonical_id);
  await q("delete from items where profile_id = $1 and sort_order = 99999", [someone]);
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
}

if (apply && !fail) {
  await db.query("commit");
  console.log("\nCOMMITTED (migration32 applied)");
} else {
  await db.query("rollback");
  console.log(apply ? "\nROLLED BACK (failures above)" : "\nrolled back (dry run)");
}
await db.end();
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
