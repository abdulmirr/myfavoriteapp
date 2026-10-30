// Discover (2026-10-28), against the dev server (:3000) and the real DB. A
// visitor gets "Most loved" — everything by favorites, each tile saying how
// many, their faces a hover away — and a nudge to start a library. A member who loves a
// few widely-loved things gets "Because you love …" rows, each holding works
// of its favorite's own kind, a friend they follow first among the faces,
// and nowhere on the page anything that's already theirs (a private save
// included) or anything twice. /feed still stands. Two throwaway members (one
// follows the other), deleted afterwards; nothing here follows or favorites
// a real person.
//   node scripts/_e2e-discover.mjs
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "/tmp/fav-v2-discover";
mkdirSync(SHOTS, { recursive: true });
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// widely-loved works: enough shared taste for seeds and people
const LOVES = ["deezer:album:344137457", "movie|fight club", "deezer:album:9908666", "tv|breaking bad", "movie|the dark knight", "itunes:1545953110"];
const FRIEND = "Testfriend Zed";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const made = [];
let browser = null;
const errors = [];

async function throwaway(tag) {
  const email = `delivered+v2${tag}${Date.now().toString(36)}@resend.dev`;
  const password = `${tag}-${Math.random().toString(36).slice(2)}`;
  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  const uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  const who = { email, password, uid, pid: null };
  made.push(who);
  for (let i = 0; i < 15 && !who.pid; i++) {
    who.pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!who.pid) await wait(700);
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [who.pid]);
  return who;
}
// a copy of a work's newest row with artwork, as a favorite of `pid`
async function favorite(pid, key, i) {
  const [r] = await q(
    `select media_type, title, creator, image_url, view_url, canonical_id, metadata from items
      where coalesce(canonical_id, media_type::text || '|' || lower(btrim(title))) = $1 and image_url is not null
      order by created_at desc limit 1`,
    [key]
  );
  await q(
    "insert into items (profile_id, media_type, title, creator, image_url, view_url, canonical_id, metadata, sort_order) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [pid, r.media_type, r.title, r.creator, r.image_url, r.view_url, r.canonical_id, r.metadata, i]
  );
  return r.title;
}

// every work picture on the page (avatars and decoration carry no alt), as
// "title" or, with `framed`, "title (frame)" — one work per title and medium
const workAlts = (page, sections, framed = false) =>
  page.evaluate(
    ([names, framed]) =>
      [...document.querySelectorAll("section")]
        .filter((s) => !names || names.some((n) => (s.querySelector("h2")?.textContent ?? "").startsWith(n)))
        .flatMap((s) => [...s.querySelectorAll("img[alt]")])
        .filter((i) => i.alt && i.getClientRects().length > 0)
        .map((i) => (framed ? `${i.alt} (${i.closest("[class*=frame]")?.className.split(" ")[0] ?? "bare"})` : i.alt)),
    [sections ?? null, framed]
  );
const sectionOf = (page, name) => page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
// the grid in DOM order: a divider's label, or a tile's favorites count
// the grid's tiles in order, each as its "12 favorites" count (0 if missing)
const gridCounts = (section) =>
  section.evaluate((s) =>
    [...s.querySelector(".grid").children].map((c) => {
      const line = [...c.querySelectorAll("p")].find((p) => /^\d+ favorites?$/.test(p.textContent.trim()));
      return line ? parseInt(line.textContent, 10) : 0;
    })
  );
// the count line under the tile showing `title`, to hover
const lineOf = async (page, title) =>
  (
    await page.evaluateHandle((t) => {
      const img = [...document.querySelectorAll("img[alt]")].find((i) => i.alt === t && i.getClientRects().length > 0);
      return [...(img?.closest("div.min-w-0")?.querySelectorAll("p") ?? [])].find((p) => /^\d+ favorites?$/.test(p.textContent.trim())) ?? null;
    }, title)
  ).asElement();
// hover a count line: the card of faces opens above it; returns their links
async function faces(page, line) {
  await line.scrollIntoViewIfNeeded();
  await line.hover();
  const card = page.locator(".hovercard-content");
  await card.locator("a").first().waitFor({ timeout: 8000 });
  const hrefs = await card.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  await page.mouse.move(2, 2);
  await card.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  return hrefs;
}

try {
  browser = await chromium.launch();

  /* ── a visitor ─────────────────────────────────────────────────────────── */
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const vp = await anon.newPage();
  vp.on("pageerror", (e) => errors.push(e.message));
  await vp.goto(`${APP}/discover`, { waitUntil: "networkidle" });
  await vp.getByRole("heading", { name: "Find your next favorite." }).waitFor({ timeout: 15000 });
  const nav = vp.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Discover" });
  check("the nav says Discover, here", (await nav.getAttribute("href")) === "/discover" && (await nav.getAttribute("aria-current")) === "page");
  const start = vp.getByRole("link", { name: "Start your library" });
  check("visitors get a nudge to start a library", (await start.count()) === 1 && (await start.getAttribute("href")) === "/signin?mode=signup");
  check("…and no personal rows", (await vp.getByRole("heading", { name: /^Because you love/ }).count()) === 0);
  const gone = await Promise.all(["Fresh thoughts", "Loved most this month", "Browse everything"].map((n) => vp.getByRole("heading", { name: n, exact: true }).count()));
  check("the old rows are gone", gone.every((n) => n === 0));
  const most = sectionOf(vp, "Most loved");
  const counts = await gridCounts(most);
  check("most loved, as a grid", counts.length >= 24, `${counts.length} tiles`);
  check("…every tile says how many", counts.every((n) => n >= 1));
  check("…most favorites first", counts.every((n, i) => i === 0 || n <= counts[i - 1]), counts.slice(0, 12).join(" "));
  check("…no month split", (await most.locator("h3").count()) === 0);
  check("…in words, no faces under the tiles", (await most.locator(".grid img[alt='']").count()) === 0);
  const firstLine = (await most.locator(".grid p", { hasText: /^\d+ favorites?$/ }).first().elementHandle());
  const who = await faces(vp, firstLine);
  check("…hover shows who (their faces, linked)", who.length >= 1 && who.every((h) => /^\/[^/]+$/.test(h)), `${who.length} faces`);
  await Promise.all([
    vp.waitForResponse((r) => r.url().includes("/api/discover/works") && r.url().includes("filter=books")),
    most.getByRole("button", { name: "Books", exact: true }).click(),
  ]);
  await vp.waitForTimeout(800);
  const books = await most.evaluate((s) => [...s.querySelectorAll("img[alt]:not([alt=''])")].map((i) => !!i.closest(".bookframe")));
  check("…by medium (Books → books only)", books.length > 0 && books.every(Boolean), `${books.filter(Boolean).length}/${books.length}`);
  await vp.getByRole("textbox", { name: "Search Favorite" }).fill("Godfather");
  await vp.locator("img[alt='The Godfather']").first().waitFor({ timeout: 15000 }).then(
    () => check("search finds things as tiles", true),
    () => check("search finds things as tiles", false)
  );
  await vp.goto(`${APP}/feed`, { waitUntil: "networkidle" });
  check("/feed still stands", await vp.getByRole("heading", { name: "Looking for something?" }).isVisible());
  await anon.close();

  /* ── a member, and a friend they follow ────────────────────────────────── */
  const A = await throwaway("disc");
  const owned = [];
  for (const [i, k] of LOVES.entries()) owned.push(await favorite(A.pid, k, i));
  // the friend favorites the top five of A's "Most loved"
  const B = await throwaway("discfriend");
  await q("update profiles set display_name = $2 where id = $1", [B.pid, FRIEND]);
  const picks = await q("select work_key, title from public.discover_works(null, $1, 5, 0)", [A.pid]);
  const top = picks[0];
  for (const [i, p] of picks.entries()) await favorite(B.pid, p.work_key, i);
  await q("insert into follows (follower_id, followee_id) values ($1, $2)", [A.pid, B.pid]);

  const res = await fetch(`${APP}/api/discover?viewer=${A.pid}`);
  const mine = await res.json();
  const rowWorks = (mine.because ?? []).flatMap((r) => r.works);
  check("the API: rows picked from their favorites", res.ok && mine.because?.length >= 1 && mine.because.every((r) => r.works.length >= 6), `${mine.because?.length} rows`);
  check("…never what they have", !rowWorks.some((w) => owned.includes(w.title)));
  check("…no work in two rows", new Set(rowWorks.map((w) => w.work_key)).size === rowWorks.length);
  check("…each work with who has it", rowWorks.every((w) => w.fav_count >= 1 && w.favoriter_ids?.length >= 1 && Array.isArray(w.top_profiles)));
  check("…each row one kind: its favorite's", mine.because.every((r) => r.works.every((w) => w.media_type === r.seed.media_type)), mine.because.map((r) => `${r.seed.title} (${r.seed.media_type})`).join(", "));
  check("…and no friends or people rows (Friends has those)", !("friends" in mine) && !("people" in mine));
  check("…for real ids only", (await fetch(`${APP}/api/discover?viewer=nope`)).status === 400);
  const ranked = await (await fetch(`${APP}/api/discover/works?viewer=${A.pid}`)).json();
  check("most loved leaves out their favorites", ranked.works.length > 0 && !ranked.works.some((w) => owned.includes(w.title)));

  // one of the picks, saved to a private list — only their browser knows
  const secret = rowWorks.find((w) => w.title !== top.title);
  const list = (await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Check later', 'check-later', false) returning id", [A.pid]))[0].id;
  await q(
    "insert into list_items (list_id, profile_id, media_type, title, creator, image_url, canonical_id) values ($1, $2, $3, $4, $5, $6, $7)",
    [list, A.pid, secret.media_type, secret.title, secret.creator, secret.image_url, secret.canonical_id]
  );

  const { data: si } = await sb.auth.signInWithPassword({ email: A.email, password: A.password });
  const s = si.session;
  const session = JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user });
  const member = async (viewport, colorScheme = "light") => {
    const ctx = await browser.newContext({ viewport, colorScheme });
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [sbKey, session]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    return { ctx, page };
  };

  const { ctx, page } = await member({ width: 1440, height: 900 });
  await page.goto(`${APP}/discover`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /^Because you love/ }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const absent = await Promise.all(["From people you follow", "People with your taste"].map((n) => page.getByRole("heading", { name: n, exact: true }).count()));
  check("no friends or people rows", absent.every((n) => n === 0));
  const rows = await page.getByRole("heading", { name: /^Because you love/ }).allInnerTexts();
  check("Because you love … rows", rows.length >= 1, rows.join(" | "));
  const firstRow = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Because you love/ }) }).first();
  check("…each work says how many love it", (await firstRow.locator("p", { hasText: /^\d+ favorites?$/ }).count()) >= 4);
  const kinds = await page.evaluate(() =>
    [...document.querySelectorAll("section")]
      .filter((s) => (s.querySelector("h2")?.textContent ?? "").startsWith("Because you love"))
      .map((s) => new Set([...s.querySelectorAll("img[alt]:not([alt=''])")].map((i) => i.closest("[class*=frame]")?.className.split(" ")[0] ?? "bare")).size)
  );
  check("…each row one kind of thing", kinds.length > 0 && kinds.every((n) => n === 1), kinds.join(" "));
  check("no nudges for a member with rows", (await page.getByRole("link", { name: "Start your library" }).count()) === 0 && (await page.getByText(/rows picked from your taste/).count()) === 0);
  for (let y = 0; y < 4000; y += 800) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1500);
  const shown = await workAlts(page);
  const leaks = shown.filter((t) => owned.includes(t) || t === secret.title);
  check("nothing on the page is already theirs", shown.length > 30 && leaks.length === 0, leaks.length ? leaks.join(", ") : `${shown.length} works shown`);
  check("…not even their private save", !shown.includes(secret.title), secret.title);
  const listed = await workAlts(page, ["Because you love", "Most loved"], true);
  const twice = listed.filter((t, i) => listed.indexOf(t) !== i);
  check("no work twice on the page", twice.length === 0, twice.join(", ") || `${listed.length} works`);
  const [{ username: bName }] = await q("select username from profiles where id = $1", [B.pid]);
  const friendLine = await lineOf(page, top.title);
  const lead = friendLine ? (await faces(page, friendLine))[0] : null;
  check("a friend's face comes first", lead === `/${bName}`, `${top.title}: ${lead}`);

  // 🔖 ★ wait for the mouse (nothing gets clicked — these are real people's copies)
  await page.evaluate(() => window.scrollTo(0, 0));
  const tile = firstRow.locator(".group\\/tile").first();
  const pill = tile.locator("div.absolute").first();
  const before = Number(await pill.evaluate((el) => getComputedStyle(el).opacity));
  await tile.hover();
  await page.waitForTimeout(400);
  const after = Number(await pill.evaluate((el) => getComputedStyle(el).opacity));
  check("save and favorite appear on hover", before === 0 && after === 1, `${before} → ${after}`);
  await page.mouse.move(5, 5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "discover-member-1440.png"), fullPage: true });
  await ctx.close();

  // the bigger wordmark still fits a member's header where it shows (414px up)
  for (const width of [414, 430]) {
    const m = await member({ width, height: 800 });
    await m.page.goto(`${APP}/discover`, { waitUntil: "load" });
    await m.page.getByRole("link", { name: "Your profile" }).waitFor({ timeout: 20000 });
    const fit = await m.page.evaluate(() => {
      const h = document.querySelector("header");
      const last = [...h.querySelectorAll("a,button")].filter((e) => e.getClientRects().length).at(-1);
      const logo = h.querySelector("a span");
      return { over: h.scrollWidth - h.clientWidth, right: Math.round(innerWidth - last.getBoundingClientRect().right), wordmark: getComputedStyle(logo).display !== "none" };
    });
    check(`${width}px member header fits, wordmark showing`, fit.over <= 0 && fit.right >= 12 && fit.wordmark, JSON.stringify(fit));
    await m.ctx.close();
  }

  for (const [vw, scheme] of [[{ width: 1440, height: 900 }, "dark"], [{ width: 390, height: 844 }, "light"]]) {
    const m = await member(vw, scheme);
    await m.page.goto(`${APP}/discover`, { waitUntil: "networkidle" });
    await m.page.getByRole("heading", { name: /^Because you love/ }).first().waitFor({ timeout: 20000 });
    await m.page.waitForTimeout(2000);
    const wide = await m.page.evaluate(() => document.documentElement.scrollWidth);
    check(`${vw.width}px ${scheme}: no sideways scroll`, wide <= vw.width, `${wide}px`);
    await m.page.screenshot({ path: join(SHOTS, `discover-member-${vw.width}-${scheme}.png`), fullPage: true });
    await m.ctx.close();
  }

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser?.close().catch(() => {});
  for (const m of made) {
    if (m.pid) {
      for (const sql of [
        "delete from notifications where profile_id = $1 or actor_id = $1",
        "delete from follows where follower_id = $1 or followee_id = $1",
        "delete from list_items where profile_id = $1",
        "delete from lists where profile_id = $1",
        "delete from items where profile_id = $1",
        "delete from username_history where profile_id = $1",
        "delete from profile_private where profile_id = $1",
        "delete from profiles where id = $1",
      ]) await db.query(sql, [m.pid]).catch((e) => console.log("cleanup:", e.message));
    }
    await db.query("delete from api_usage where user_id = $1", [m.uid]).catch(() => {});
    await db.query("delete from auth.users where id = $1", [m.uid]).catch(() => {});
  }
  await db.end();
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
