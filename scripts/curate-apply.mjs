// Applies one curation batch to @abdulmir's library: deletes the named items,
// then appends the resolved rows from curate-resolve.mts, skipping anything
// already in the library (canonical id, or media_type + title).
// Usage: node scripts/curate-apply.mjs <resolved.json> [--commit]
import { readFileSync } from "node:fs";
import { client } from "./db.mjs";

const COMMIT = process.argv.includes("--commit");
const { out } = JSON.parse(readFileSync(process.argv[2], "utf8"));

// Bad upstream matches replaced by hand-verified ids (see session notes):
//  - Creativity, Inc. fell through to an unrelated 2001 Open Library work
//  - How to Win Friends matched a 2026 reprint over the Simon & Schuster ed.
//  - Either/Or matched the expanded reissue; the 1997 original is on iTunes
//  - Actual Life matched the 5-track EP, not the April 14–December 17 2020 LP
//  - Conditions and The Girl, The Cat and The Tree are iTunes-only (the latter
//    found via the collection behind the "Motor City" track already saved)
const OVERRIDES = {
  "Creativity, Inc.": {
    title: "Creativity, Inc. (The Expanded Edition)", creator: "Ed Catmull & Amy Wallace",
    image_url: "https://is1-ssl.mzstatic.com/image/thumb/Publication116/v4/be/83/88/be8388e1-8eed-0403-49e9-12ed154db17f/9780679644507.d.jpg/600x600bb.jpg",
    view_url: "https://books.apple.com/us/book/creativity-inc-the-expanded-edition/id733503589?uo=4",
    year: "2014", canonical_id: "itunes:733503589", media_type: "book",
  },
  "How to Win Friends and Influence People": {
    title: "How to Win Friends and Influence People", creator: "Dale Carnegie",
    image_url: "https://is1-ssl.mzstatic.com/image/thumb/Publication126/v4/0c/08/06/0c080625-18d4-ba37-d2e5-2cd4d5fc006c/9781982171476.jpg/600x600bb.jpg",
    view_url: "https://books.apple.com/us/book/how-to-win-friends-and-influence-people/id1595609149?uo=4",
    year: "2022", canonical_id: "itunes:1595609149", media_type: "book",
  },
  "Either/Or — Elliott Smith": {
    title: "Either/Or", creator: "Elliott Smith",
    image_url: null, view_url: null, year: "1997",
    canonical_id: "itunes:313302066", media_type: "music", _lookup: 313302066,
  },
  "Actual Life — Fred again..": {
    title: "Actual Life (April 14 - December 17 2020)", creator: "Fred again..",
    image_url: null, view_url: "https://www.deezer.com/album/219209462", year: "2021",
    canonical_id: "deezer:album:219209462", media_type: "music", _deezer: 219209462,
  },
};

// Neither of these survived the resolver (Deezer has no Temper Trap back
// catalogue, and Lausse the Cat's album is iTunes-only), so they are appended
// rather than overridden — both ids verified by hand against iTunes lookup.
const EXTRA = [
  {
    media_type: "music", title: "Conditions", creator: "The Temper Trap",
    image_url: null, view_url: null, year: "2009",
    canonical_id: "itunes:1771693599", _lookup: 1771693599,
    _q: "Conditions — The Temper Trap",
  },
  {
    media_type: "music", title: "The Girl, The Cat and The Tree", creator: "LAUSSE THE CAT",
    image_url: null, view_url: null, year: "2018",
    canonical_id: "itunes:1400922790", _lookup: 1400922790,
    _q: "The Girl, The Cat and The Tree — Lausse The Cat",
  },
];

// Not resolvable, deliberately left out (reported at the end):
const SKIPPED = [
  '"minari" under books — no such book exists upstream (only a 1967 novel by ' +
    "Nergis Dalal and Minari Endou's manga); the film's soundtrack is already saved",
  '"man on the moon" — a track by that exact title is already in the library, ' +
    "so the already-exists rule caught it (say the word for the full album)",
];

const DELETE = [
  ["podcast", "Lex Fridman Podcast"],
  ["photo", "Abdul's pfp"],
  ["video", "Apple Steve Jobs Heres To The Crazy Ones"],
  ["video", "How We Lose Our Iman - Khutbah by Nouman Ali Khan"],
  ["video", "The Value of Mentorship"],
];

// fill artwork/links the override table left null, straight from the source APIs
async function hydrate(row) {
  if (row._lookup) {
    const r = (await (await fetch(`https://itunes.apple.com/lookup?id=${row._lookup}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) FavoritesApp/1.0" },
    })).json()).results?.[0];
    if (r) {
      row.image_url = (r.artworkUrl100 ?? "").replace("100x100", "600x600") || null;
      row.view_url = r.collectionViewUrl ?? null;
    }
  }
  if (row._deezer) {
    const a = await (await fetch(`https://api.deezer.com/album/${row._deezer}`)).json();
    row.image_url = a.cover_big ?? null;
    row.view_url = a.link ?? row.view_url;
  }
  delete row._lookup;
  delete row._deezer;
  return row;
}

// resolver matched these to the wrong work — better nothing than a wrong cover
const DROP = new Set(["Minari"]);

const rows = [];
for (const r of out) {
  if (DROP.has(r._q)) continue;
  const o = OVERRIDES[r._q];
  rows.push(o ? await hydrate({ ...r, ...o }) : r);
}
for (const e of EXTRA) rows.push(await hydrate({ ...e }));

const key = (t, title) => `${t}|${(title ?? "").toLowerCase().trim()}`;

const db = client();
await db.connect();
try {
  await db.query("begin");
  const { rows: [me] } = await db.query(
    "select id from profiles where username = 'abdulmir'"
  );
  if (!me) throw new Error("abdulmir profile not found");

  // ── deletes ─────────────────────────────────────────────────────────────
  for (const [mt, title] of DELETE) {
    const { rows: hit } = await db.query(
      "delete from items where profile_id = $1 and media_type = $2 and title = $3 returning id, title",
      [me.id, mt, title]
    );
    console.log(hit.length ? `deleted  ${mt}: ${title}` : `MISSING  ${mt}: ${title}`);
  }

  // ── inserts ─────────────────────────────────────────────────────────────
  const { rows: existing } = await db.query(
    "select media_type, title, canonical_id, view_url from items where profile_id = $1",
    [me.id]
  );
  const haveKey = new Set(existing.map((e) => key(e.media_type, e.title)));
  const haveCanon = new Set(existing.map((e) => e.canonical_id).filter(Boolean));
  const haveUrl = new Set(existing.map((e) => e.view_url).filter(Boolean));

  const { rows: [{ mx }] } = await db.query(
    "select coalesce(max(sort_order), -1) as mx from items where profile_id = $1",
    [me.id]
  );
  let order = Number(mx) + 1;

  let added = 0;
  const dupes = [];
  for (const r of rows) {
    if (
      haveCanon.has(r.canonical_id) ||
      haveKey.has(key(r.media_type, r.title)) ||
      (r.view_url && haveUrl.has(r.view_url))
    ) {
      dupes.push(`${r.media_type}: ${r.title}`);
      continue;
    }
    await db.query(
      `insert into items (profile_id, media_type, title, creator, description,
                          image_url, view_url, metadata, sort_order, canonical_id)
       values ($1,$2,$3,$4,'',$5,$6,$7,$8,$9)`,
      [me.id, r.media_type, r.title, r.creator ?? "", r.image_url, r.view_url,
       JSON.stringify(r.year ? { year: r.year } : {}), order++, r.canonical_id]
    );
    haveKey.add(key(r.media_type, r.title));
    if (r.canonical_id) haveCanon.add(r.canonical_id);
    added += 1;
    console.log(`added    ${r.media_type}: ${r.title}${r.creator ? ` — ${r.creator}` : ""}`);
  }

  const { rows: [{ c }] } = await db.query(
    "select count(*)::int as c from items where profile_id = $1",
    [me.id]
  );
  console.log(`\nadded ${added}, already there ${dupes.length}, library now ${c} items`);
  for (const d of dupes) console.log(`  skipped (already saved) ${d}`);
  for (const s of SKIPPED) console.log(`  not added: ${s}`);

  if (COMMIT) {
    await db.query("commit");
    console.log("\nCOMMITTED");
  } else {
    await db.query("rollback");
    console.log("\nDRY RUN — rolled back. Re-run with --commit to apply.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
