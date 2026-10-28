// e2e for the third batch (2026-10-27) against the dev server (:3000) and the
// real DB: the save dialog shows list names again, the header's Friends pill
// (with the unread badge) and 🔖 lists panel, the Friends page (notifications,
// your people, the grouped timeline), the playlist-style list page (drag to
// reorder, finish + "Loved it", notes, remove + undo, Add from search), the
// item page's "You" line, and the retired Activity tab / Following filter.
// Two throwaway users who only ever follow each other — no real person is
// followed, favorited from, or notified. Everything is deleted afterwards.
//   node scripts/_e2e-batch3.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "fav-v2-e2e");
const stamp = Date.now().toString(36);
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await wait(400);
  }
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const users = [];
async function makeUser(tag) {
  const email = `delivered+v2b3${tag}${stamp}@resend.dev`;
  const password = "v2-b3-" + Math.random().toString(36).slice(2);
  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  const uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  let pid = null;
  for (let i = 0; i < 15 && !pid; i++) {
    pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!pid) await wait(700);
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [pid]);
  const username = (await q("select username from profiles where id = $1", [pid]))[0].username;
  const u = { email, password, uid, pid, username };
  users.push(u);
  return u;
}

// real works with real covers (their item pages exist)
const ORANGE = { title: "channel ORANGE", creator: "Frank Ocean", canonical: "deezer:album:9908666", type: "music" };
const art = (await q("select image_url from items where canonical_id = $1 and image_url is not null limit 1", [ORANGE.canonical]))[0]?.image_url ?? null;

let browser = null;
try {
  const A = await makeUser("a"); // the viewer
  const B = await makeUser("b"); // their friend
  await q("update profiles set display_name = 'Bea Test' where id = $1", [B.pid]);

  // B: three favorites today (one group), a new public list with two saves
  for (const [i, t] of ["Test Album One", "Test Album Two", "Test Album Three"].entries()) {
    await q(
      "insert into items (profile_id, media_type, title, creator, description, image_url, sort_order) values ($1, 'music', $2, 'Test Artist', $3, $4, $5)",
      [B.pid, t, i === 0 ? "a quiet masterpiece" : "", art, i]
    );
  }
  const bl = (await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Summer test reads', 'summer-test-reads', true) returning id", [B.pid]))[0].id;
  for (const t of ["Test Book A", "Test Book B"]) {
    await q("insert into list_items (list_id, profile_id, media_type, title, creator) values ($1, $2, 'book', $3, 'Test Writer')", [bl, B.pid, t]);
  }
  // A follows B; B follows A (→ one unread "followed you" for A)
  await q("insert into follows (follower_id, followee_id) values ($1, $2), ($2, $1)", [A.pid, B.pid]);

  // A: a private "Check later" with four things, and a public list
  const al = (await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Check later', 'check-later', false) returning id", [A.pid]))[0].id;
  const seeded = [
    { title: ORANGE.title, creator: ORANGE.creator, canonical: ORANGE.canonical, type: "music", image: art },
    { title: "Row Two", creator: "Someone", canonical: null, type: "book", image: null },
    { title: "Row Three", creator: "Someone", canonical: null, type: "movie", image: null },
    { title: "Row Four", creator: "Someone", canonical: null, type: "podcast", image: null },
  ];
  for (const [i, s] of seeded.entries()) {
    await q(
      "insert into list_items (list_id, profile_id, media_type, title, creator, canonical_id, image_url, position) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [al, A.pid, s.type, s.title, s.creator, s.canonical, s.image, i + 1]
    );
  }
  await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Ten out of ten', 'ten-out-of-ten', true)", [A.pid]);

  const { data: si } = await sb.auth.signInWithPassword({ email: A.email, password: A.password });
  const s = si.session;
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [
    sbKey,
    JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user }),
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  /* ── header ─────────────────────────────────────────────────────────────── */
  await page.goto(`${APP}/feed`, { waitUntil: "networkidle" });
  const friendsPill = page.getByRole("link", { name: /^Friends/ });
  await friendsPill.waitFor({ timeout: 15000 });
  check("Friends pill in the header", (await friendsPill.getAttribute("href")) === "/friends");
  check("Friends pill carries the unread badge", /1 new/.test((await friendsPill.getAttribute("aria-label")) ?? ""), (await friendsPill.getAttribute("aria-label")) ?? "no label");
  check("bell is gone", (await page.getByRole("button", { name: /Notifications/ }).count()) === 0);
  check("feed has no Following filter", (await page.getByRole("button", { name: "Following", exact: true }).count()) === 0);

  // your lists live in the account menu (batch 4)
  await page.getByRole("button", { name: "Account menu" }).click();
  const panel = page.getByRole("menu");
  await panel.getByText("Check later").waitFor({ timeout: 5000 });
  check("the menu lists your lists", (await panel.getByRole("menuitem", { name: /Check later|Ten out of ten/ }).count()) === 2);
  check("…and links to the list", (await panel.getByRole("menuitem", { name: /Check later/ }).getAttribute("href")) === `/${A.username}/lists/check-later`);
  await page.keyboard.press("Escape");

  /* ── save dialog: list names are back ───────────────────────────────────── */
  await page.locator('button[aria-label^="Save "]').first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 5000 });
  const rowName = dialog.getByText("Ten out of ten", { exact: true });
  await rowName.waitFor({ timeout: 5000 });
  const box = await rowName.boundingBox();
  check("save dialog shows list names", !!box && box.width > 40, box ? `${Math.round(box.width)}px wide` : "not visible");
  const thumb = await dialog.locator("button[aria-pressed]").first().evaluate((el) => el.parentElement.querySelector(".aspect-video")?.getBoundingClientRect().width ?? 0);
  check("…and the list thumbnail is thumbnail-sized", thumb > 60 && thumb < 100, `${Math.round(thumb)}px`);
  await page.screenshot({ path: join(SHOTS, "b3-save-dialog.png") });
  await page.keyboard.press("Escape");

  /* ── Friends ────────────────────────────────────────────────────────────── */
  await friendsPill.click();
  await page.waitForURL("**/friends", { timeout: 10000 });
  // notifications render twice (phone column / desktop rail) — use the visible one
  const followed = page.getByText("followed you").filter({ visible: true });
  await followed.first().waitFor({ timeout: 15000 });
  check("Friends shows the notification", (await followed.count()) === 1);
  await page.getByText(/favorited 3 things/).first().waitFor({ timeout: 15000 });
  check("timeline groups B's three favorites", (await page.getByText(/favorited 3 things/).count()) >= 1);
  check("timeline shows B's new list", (await page.getByText(/made a new list/).count()) >= 1);
  check("B's thought rides along", (await page.getByText("“a quiet masterpiece”").count()) >= 1);
  check("Your people shows B", (await page.locator('section[aria-label="Your people"] a', { hasText: "Bea" }).count()) === 1);
  check("Invite a friend button", (await page.getByRole("button", { name: /Invite a friend/ }).count()) === 1);
  await wait(2500);
  const unread = (await q("select count(*)::int n from notifications where profile_id = $1 and read_at is null", [A.pid]))[0].n;
  check("visiting Friends marks notifications read", unread === 0, `${unread} unread`);
  check("badge clears", !/new/.test((await friendsPill.getAttribute("aria-label")) ?? ""));
  await page.screenshot({ path: join(SHOTS, "b3-friends.png"), fullPage: true });

  /* ── the list page, as its owner ────────────────────────────────────────── */
  await page.goto(`${APP}/${A.username}/lists/check-later`, { waitUntil: "networkidle" });
  const rows = page.locator('section[aria-label="In this list"] ol > li');
  await rows.first().waitFor({ timeout: 15000 });
  check("four numbered rows", (await rows.count()) === 4);
  check("no Reorder button", (await page.getByRole("button", { name: /^Reorder$/ }).count()) === 0);
  const order = async () => (await q("select title from list_items where list_id = $1 and done_at is null order by position", [al])).map((r) => r.title);

  // drag Row Three to the top
  const grip = rows.nth(2).getByRole("button", { name: /^Reorder Row Three/ });
  await rows.nth(2).hover();
  const g = await grip.boundingBox();
  const top = await rows.nth(0).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - ((g.y - top.y + 10) * i) / 12);
  await page.mouse.up();
  const dragged = await until(async () => (await order())[0] === "Row Three" && (await order()));
  check("drag to reorder saves the order", !!dragged, JSON.stringify(await order()));
  check("the page shows it too", (await rows.first().innerText()).includes("Row Three"));

  // keyboard: ArrowDown on the focused handle moves Row Three back down one
  await rows.first().getByRole("button", { name: /^Reorder Row Three/ }).focus();
  await page.keyboard.press("ArrowDown");
  const kb = await until(async () => (await order())[1] === "Row Three");
  check("arrow keys move a row", !!kb, JSON.stringify(await order()));

  // finish channel ORANGE, then "Loved it" from the toast
  await page.getByRole("button", { name: `Mark ${ORANGE.title} as finished` }).click();
  const done = await until(async () => (await q("select done_at from list_items where list_id = $1 and title = $2", [al, ORANGE.title]))[0].done_at);
  check("○ marks it finished", !!done);
  check("it moves to Finished", (await rows.count()) === 3 && (await page.getByRole("button", { name: /^Finished/ }).count()) === 1);
  await page.getByRole("button", { name: "Favorite?", exact: true }).click();
  const fav = await until(async () => (await q("select id from items where profile_id = $1 and canonical_id = $2", [A.pid, ORANGE.canonical]))[0]);
  check("Loved it favorites it", !!fav);
  await page.getByRole("button", { name: /^Finished/ }).click();
  await page.getByRole("button", { name: `Mark ${ORANGE.title} as not finished` }).waitFor({ timeout: 5000 });
  await page.screenshot({ path: join(SHOTS, "b3-list-owner.png"), fullPage: true });
  await page.getByRole("button", { name: `Mark ${ORANGE.title} as not finished` }).click();
  const undone = await until(async () => (await q("select done_at from list_items where list_id = $1 and title = $2", [al, ORANGE.title]))[0].done_at === null);
  check("✓ un-finishes it", !!undone);

  // ⋯ → Add a note
  await page.getByRole("button", { name: "More for Row Two" }).click();
  await page.getByRole("menuitem", { name: /Add a note/ }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("for a rainy day");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  const noted = await until(async () => (await q("select note from list_items where list_id = $1 and title = 'Row Two'", [al]))[0].note === "for a rainy day");
  check("⋯ Add a note saves it", !!noted);
  check("the note shows on the row", (await page.getByText("“for a rainy day”").count()) === 1);

  // ⋯ → Remove, then Undo
  await page.getByRole("button", { name: "More for Row Four" }).click();
  await page.getByRole("menuitem", { name: /Remove from list/ }).click();
  const gone = await until(async () => (await q("select count(*)::int n from list_items where list_id = $1 and title = 'Row Four'", [al]))[0].n === 0);
  check("⋯ Remove takes it out", !!gone);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const back = await until(async () => (await q("select count(*)::int n from list_items where list_id = $1 and title = 'Row Four'", [al]))[0].n === 1);
  check("Undo puts it back", !!back);

  // + Add, straight from search into this list
  const before = (await q("select count(*)::int n from list_items where list_id = $1", [al]))[0].n;
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const add = page.getByRole("dialog");
  await add.getByRole("heading", { name: "Add to ‘Check later’" }).waitFor({ timeout: 8000 });
  await add.getByRole("tab", { name: "Music" }).click();
  await add.getByRole("combobox", { name: "Search" }).fill("Blonde Frank Ocean");
  const hit = add.locator("button", { hasText: "Blonde" }).first();
  await hit.waitFor({ timeout: 15000 });
  await hit.click();
  await add.getByRole("button", { name: "Add to list" }).click();
  const added = await until(async () => (await q("select count(*)::int n from list_items where list_id = $1", [al]))[0].n === before + 1);
  check("+ Add puts a search result straight in the list", !!added);
  await page.keyboard.press("Escape");
  check("…and it shows at the top", (await rows.first().innerText()).toLowerCase().includes("blonde"));

  /* ── item page: your own line ───────────────────────────────────────────── */
  await page.goto(`${APP}/item/${ORANGE.canonical}`, { waitUntil: "networkidle" });
  await page.getByText("You", { exact: true }).waitFor({ timeout: 15000 });
  check("item page puts you first", (await page.getByText("You", { exact: true }).count()) === 1);
  check("…with Add your thought", (await page.getByRole("button", { name: /Add your thought/ }).count()) === 1);
  check("…and Pin to Top four", (await page.getByRole("button", { name: "Pin to Top four" }).count()) === 1);
  check("no On your wall bar", (await page.getByText("On your wall").count()) === 0);
  check("share is an icon", (await page.getByRole("button", { name: "Share", exact: true }).innerText()).trim() === "");
  await page.screenshot({ path: join(SHOTS, "b3-item.png"), fullPage: true });

  /* ── profile: two tabs; old addresses redirect ──────────────────────────── */
  await page.goto(`${APP}/${A.username}`, { waitUntil: "networkidle" });
  const tabs = page.locator('nav[aria-label="Profile"] a');
  await tabs.first().waitFor({ timeout: 15000 });
  check("profile tabs: Favorites + Lists", (await tabs.count()) === 2, (await tabs.allInnerTexts()).join(", "));
  const r1 = await fetch(`${APP}/${A.username}/activity`, { redirect: "manual" });
  check("/activity redirects to the profile", r1.status === 308 && r1.headers.get("location")?.endsWith(`/${A.username}`), `${r1.status} ${r1.headers.get("location")}`);
  const r2 = await fetch(`${APP}/?feed=following`, { redirect: "manual" });
  check("v1's /?feed=following goes to Friends", r2.status === 308 && new URL(r2.headers.get("location") ?? "", APP).pathname === "/friends", `${r2.status} ${r2.headers.get("location")}`);

  /* ── phones: the header fits ────────────────────────────────────────────── */
  for (const w of [360, 375, 390]) {
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width: w, height: 800 });
    // "load", not "networkidle": in a production build the feed's cards prefetch
    // item pages, and one prefetch can stay open — the header is what's tested
    await p2.goto(`${APP}/feed`, { waitUntil: "load" });
    await p2.getByRole("link", { name: "Your profile" }).waitFor({ timeout: 15000 });
    const fit = await p2.evaluate(() => {
      const r = document.querySelector('a[aria-label="Your profile"]').getBoundingClientRect();
      return { right: r.right, sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    check(`header fits at ${w}px`, fit.right <= fit.vw && fit.sw <= fit.vw, JSON.stringify(fit));
    await p2.screenshot({ path: join(SHOTS, `b3-header-${w}.png`) });
    await p2.close();
  }

  // for the eye: phone + dark views of the new pages
  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [["friends", "/friends"], ["list", `/${A.username}/lists/check-later`]]) {
    await phone.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    await phone.waitForTimeout(2000);
    await phone.screenshot({ path: join(SHOTS, `b3-phone-${name}.png`), fullPage: true });
  }
  await phone.close();
  // a real touch screen: no hover, so the owner's rows show their drag handles
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await touch.addInitScript(([k, v]) => localStorage.setItem(k, v), [
    sbKey,
    JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user }),
  ]);
  const tp = await touch.newPage();
  await tp.goto(`${APP}/${A.username}/lists/check-later`, { waitUntil: "networkidle" });
  const handle = tp.getByRole("button", { name: /^Reorder / }).first();
  await handle.waitFor({ timeout: 15000 });
  check("touch screens show the drag handle", (await handle.evaluate((el) => getComputedStyle(el).opacity)) === "1");
  await tp.screenshot({ path: join(SHOTS, "b3-touch-list.png") });
  await touch.close();
  const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  await dark.addInitScript(([k, v]) => localStorage.setItem(k, v), [
    sbKey,
    JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user }),
  ]);
  const dp = await dark.newPage();
  for (const [name, path] of [["friends", "/friends"], ["list", `/${A.username}/lists/check-later`], ["item", `/item/${ORANGE.canonical}`]]) {
    await dp.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    await dp.waitForTimeout(2000);
    await dp.screenshot({ path: join(SHOTS, `b3-dark-${name}.png`), fullPage: true });
  }
  await dark.close();

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser?.close().catch(() => {});
  for (const u of users) {
    for (const sql of [
      "delete from notifications where profile_id = $1 or actor_id = $1",
      "delete from follows where follower_id = $1 or followee_id = $1",
      "delete from list_items where profile_id = $1",
      "delete from lists where profile_id = $1",
      "delete from items where profile_id = $1",
      "delete from username_history where profile_id = $1",
      "delete from profile_private where profile_id = $1",
      "delete from profiles where id = $1",
    ]) await db.query(sql, [u.pid]).catch((e) => console.log("cleanup:", e.message));
    await db.query("delete from api_usage where user_id = $1", [u.uid]).catch(() => {});
    await db.query("delete from auth.users where id = $1", [u.uid]).catch(() => {});
  }
  await db.end();
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
