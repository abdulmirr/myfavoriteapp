// Discover (2026-10-28), against the dev server (:3000) and the real DB. A
// visitor gets the rows everyone gets (loved this month, fresh thoughts,
// everything by medium) and a nudge to start a library. A member who loves a
// few widely-loved things gets "Because you love …" rows and people with
// their taste — and nowhere on the page anything that's already theirs, a
// private save included. /feed still stands. Throwaway member, deleted
// afterwards; nothing here follows or favorites anyone.
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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const email = `delivered+v2disc${Date.now().toString(36)}@resend.dev`;
const password = "disc-" + Math.random().toString(36).slice(2);
let uid = null;
let pid = null;
let browser = null;
const errors = [];

// every work picture on the page (avatars and decoration carry no alt)
const workAlts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("img[alt]")]
      .filter((i) => i.alt && i.getClientRects().length > 0 && !i.closest("header"))
      .map((i) => i.alt)
  );
const sectionOf = (page, name) => page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });

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
  const loved = sectionOf(vp, "Loved most this month");
  check("loved most this month, in frames", (await loved.locator("img[alt]:not([alt=''])").count()) >= 4);
  check("fresh thoughts", (await sectionOf(vp, "Fresh thoughts").locator("li").filter({ visible: true }).count()) >= 3);
  const browse = sectionOf(vp, "Browse everything");
  check("everything, as a grid", (await browse.locator("img[alt]:not([alt=''])").count()) >= 12);
  await Promise.all([
    vp.waitForResponse((r) => r.url().includes("/api/feed") && r.url().includes("filter=books")),
    browse.getByRole("button", { name: "Books", exact: true }).click(),
  ]);
  await vp.waitForTimeout(800);
  const books = await browse.evaluate((s) => [...s.querySelectorAll("img[alt]:not([alt=''])")].map((i) => !!i.closest(".bookframe")));
  check("…by medium (Books → books only)", books.length > 0 && books.every(Boolean), `${books.filter(Boolean).length}/${books.length}`);
  await vp.getByRole("textbox", { name: "Search Favorite" }).fill("Godfather");
  await vp.locator("img[alt='The Godfather']").first().waitFor({ timeout: 15000 }).then(
    () => check("search finds things as tiles", true),
    () => check("search finds things as tiles", false)
  );
  await vp.goto(`${APP}/feed`, { waitUntil: "networkidle" });
  check("/feed still stands", await vp.getByRole("heading", { name: "Looking for something?" }).isVisible());
  await anon.close();

  /* ── a member ──────────────────────────────────────────────────────────── */
  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !pid; i++) {
    pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!pid) await wait(700);
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [pid]);
  const owned = [];
  for (const [i, k] of LOVES.entries()) {
    const [r] = await q(
      `select media_type, title, creator, image_url, view_url, canonical_id, metadata from items
        where coalesce(canonical_id, media_type::text || '|' || lower(btrim(title))) = $1 and image_url is not null
        order by created_at desc limit 1`,
      [k]
    );
    await q(
      "insert into items (profile_id, media_type, title, creator, image_url, view_url, canonical_id, metadata, sort_order) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [pid, r.media_type, r.title, r.creator, r.image_url, r.view_url, r.canonical_id, r.metadata, i]
    );
    owned.push(r.title);
  }

  const res = await fetch(`${APP}/api/discover?viewer=${pid}`);
  const mine = await res.json();
  const rowWorks = (mine.because ?? []).flatMap((r) => r.works);
  check("the API: rows picked from their favorites", res.ok && mine.because?.length >= 1 && mine.because.every((r) => r.works.length >= 6), `${mine.because?.length} rows`);
  check("…never what they have", !rowWorks.some((w) => owned.includes(w.title)));
  check("…no work in two rows", new Set(rowWorks.map((w) => w.work_key)).size === rowWorks.length);
  check("…and people with their taste", mine.people?.length >= 1, `${mine.people?.length}`);
  check("…for real ids only", (await fetch(`${APP}/api/discover?viewer=nope`)).status === 400);

  // one of the picks, saved to a private list — only their browser knows
  const secret = mine.because[0].works[0];
  const list = (await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Check later', 'check-later', false) returning id", [pid]))[0].id;
  await q(
    "insert into list_items (list_id, profile_id, media_type, title, creator, image_url, canonical_id) values ($1, $2, $3, $4, $5, $6, $7)",
    [list, pid, secret.media_type, secret.title, secret.creator, secret.image_url, secret.canonical_id]
  );

  const { data: si } = await sb.auth.signInWithPassword({ email, password });
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
  const rows = await page.getByRole("heading", { name: /^Because you love/ }).allInnerTexts();
  check("Because you love … rows", rows.length >= 1, rows.join(" | "));
  check("people with your taste, each with Follow", (await sectionOf(page, "People with your taste").getByRole("button", { name: "Follow" }).count()) >= 1);
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
  const shelved = await page.evaluate(() =>
    [...document.querySelectorAll("section")]
      .filter((s) => /^(Because you love|Loved most this month)/.test(s.querySelector("h2")?.textContent ?? ""))
      .flatMap((s) => [...s.querySelectorAll("img[alt]")].filter((i) => i.alt).map((i) => i.alt))
  );
  check("no work on two shelves", shelved.length >= 16 && new Set(shelved).size === shelved.length, `${shelved.length} on shelves`);

  // 🔖 ★ wait for the mouse (nothing gets clicked — these are real people's copies)
  await page.evaluate(() => window.scrollTo(0, 0));
  const tile = page.locator("section").first().locator(".group\\/tile").first();
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

  for (const [vw, scheme] of [[{ width: 1440, height: 900 }, "dark"], [{ width: 390, height: 844 }, "light"]]) {
    const m = await member(vw, scheme);
    await m.page.goto(`${APP}/discover`, { waitUntil: "networkidle" });
    await m.page.getByRole("heading", { name: /^Because you love/ }).first().waitFor({ timeout: 20000 });
    await m.page.waitForTimeout(2000);
    const wide = await m.page.evaluate(() => document.documentElement.scrollWidth);
    check(`${vw.width}px ${scheme}: no sideways scroll`, wide <= vw.width, `${wide}px`);
    await m.page.screenshot({ path: join(SHOTS, `discover-member-${vw.width}-${scheme}.png`), fullPage: vw.width > 400 });
    await m.ctx.close();
  }

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser?.close().catch(() => {});
  if (pid) {
    for (const sql of [
      "delete from list_items where profile_id = $1",
      "delete from lists where profile_id = $1",
      "delete from items where profile_id = $1",
      "delete from username_history where profile_id = $1",
      "delete from profile_private where profile_id = $1",
      "delete from profiles where id = $1",
    ]) await db.query(sql, [pid]).catch((e) => console.log("cleanup:", e.message));
  }
  if (uid) {
    await db.query("delete from api_usage where user_id = $1", [uid]).catch(() => {});
    await db.query("delete from auth.users where id = $1", [uid]).catch(() => {});
  }
  await db.end();
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
