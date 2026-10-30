// e2e for the fourth batch (2026-10-28) against the dev server (:3000) and
// the real DB: the centered header and antislop's account menu (lists,
// settings, theme, log out), the add dialog (chips on one row, keyboard
// picks, a pasted link), one link = one work (a pasted address joins
// everyone's copy), "Favorite?" on finished rows, Friends (notifications in
// the one timeline; the rail), and the boxless profile (banner, underline tabs,
// list tiles, the Add pill). Two throwaway users who only follow each other;
// everything is deleted afterwards. Screenshots land in $SHOTS.
//   node scripts/_e2e-batch4.mjs
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
  const email = `delivered+v2b4${tag}${stamp}@resend.dev`;
  const password = "v2-b4-" + Math.random().toString(36).slice(2);
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

// a link several real people already have
const PG = "https://paulgraham.com/greatwork.html";
const pgKey = (await q("select public.url_work_key($1) k", [PG]))[0].k;
const pgBefore = (await q("select count(distinct profile_id)::int n from items where canonical_id = $1", [pgKey]))[0].n;
const art = (await q("select image_url from items where canonical_id = 'deezer:album:9908666' and image_url is not null limit 1"))[0]?.image_url ?? null;

let browser = null;
try {
  const A = await makeUser("a");
  const B = await makeUser("b");
  await q("update profiles set display_name = 'Bea Test' where id = $1", [B.pid]);
  await q("insert into follows (follower_id, followee_id) values ($1, $2), ($2, $1)", [A.pid, B.pid]);
  // six more notifications for A, so "See all" has something to open
  for (let i = 0; i < 6; i++) {
    await q("insert into notifications (profile_id, actor_id, type, created_at) values ($1, $2, 'follow', now() - ($3 || ' hours')::interval)", [A.pid, B.pid, String(i + 1)]);
  }
  for (const [i, t] of ["Wall One", "Wall Two"].entries()) {
    await q("insert into items (profile_id, media_type, title, creator, image_url, sort_order) values ($1, 'music', $2, 'Test Artist', $3, $4)", [A.pid, t, art, i]);
  }
  const al = (await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Check later', 'check-later', false) returning id", [A.pid]))[0].id;
  await q("insert into list_items (list_id, profile_id, media_type, title, creator, done_at) values ($1, $2, 'book', 'Done Book', 'Someone', now())", [al, A.pid]);
  await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Ten out of ten', 'ten-out-of-ten', true)", [A.pid]);

  const { data: si } = await sb.auth.signInWithPassword({ email: A.email, password: A.password });
  const s = si.session;
  const session = JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user });
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  browser = await chromium.launch();
  const context = async (opts = {}) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await c.addInitScript(([k, v]) => {
      localStorage.setItem(k, v);
      localStorage.removeItem("fav:theme");
    }, [sbKey, session]);
    return c;
  };
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  /* ── header ─────────────────────────────────────────────────────────────── */
  await page.goto(`${APP}/feed`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Account menu" }).waitFor({ timeout: 15000 });
  const nav = await page.locator('nav[aria-label="Main"]').boundingBox();
  const mid = nav.x + nav.width / 2;
  check("Home · Discover · Friends sit centered", Math.abs(mid - 640) <= 6, `center ${Math.round(mid)} of 640`);
  check("the 🔖 header button is gone", (await page.getByRole("button", { name: "Your lists" }).count()) === 0);
  check("avatar still goes to your profile", (await page.getByRole("link", { name: "Your profile" }).getAttribute("href")) === `/${A.username}`);
  await page.getByRole("button", { name: "Account menu" }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor({ timeout: 5000 });
  check("menu lists your lists", (await menu.getByRole("menuitem", { name: /Check later/ }).count()) === 1 && (await menu.getByRole("menuitem", { name: /Ten out of ten/ }).count()) === 1);
  check("…links straight to them", (await menu.getByRole("menuitem", { name: /Check later/ }).getAttribute("href")) === `/${A.username}/lists/check-later`);
  check("menu has Settings, New list and Log out", (await menu.getByRole("menuitem", { name: "Settings" }).count()) === 1 && (await menu.getByRole("menuitem", { name: "New list" }).count()) === 1 && (await menu.getByRole("menuitem", { name: "Log out" }).count()) === 1);
  await page.screenshot({ path: join(SHOTS, "b4-menu.png") });
  const darkBefore = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await menu.getByRole("menuitem", { name: /Dark mode|Light mode/ }).click();
  const darkAfter = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  check("the theme switch flips the page", darkBefore !== darkAfter);
  await page.screenshot({ path: join(SHOTS, "b4-menu-dark.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("fav:theme");
  });

  /* ── the add dialog ─────────────────────────────────────────────────────── */
  await page.getByRole("button", { name: "Add a favorite" }).click();
  const add = page.getByRole("dialog");
  await add.getByRole("heading", { name: "Add something" }).waitFor({ timeout: 8000 });
  const chips = add.getByRole("tab");
  const tops = new Set();
  for (let i = 0; i < (await chips.count()); i++) tops.add(Math.round((await chips.nth(i).boundingBox()).y));
  check("all six chips on one row", (await chips.count()) === 6 && tops.size === 1, `${await chips.count()} chips, ${tops.size} row(s)`);
  const dw = (await add.boundingBox()).width;
  check("the dialog is the wide one", dw > 540, `${Math.round(dw)}px`);
  await page.screenshot({ path: join(SHOTS, "b4-add-empty.png") });
  await add.getByRole("tab", { name: "Music" }).click();
  await add.getByRole("combobox").fill("Blonde Frank Ocean");
  await add.getByRole("option").first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: join(SHOTS, "b4-add-results.png") });
  await page.keyboard.press("ArrowDown");
  check("arrow keys move the highlight", (await add.getByRole("option").nth(1).getAttribute("aria-selected")) === "true");
  await page.keyboard.press("Enter");
  await add.getByRole("button", { name: "Back" }).waitFor({ timeout: 5000 });
  check("↵ picks it", (await add.getByRole("button", { name: /Favorite/ }).count()) >= 1);
  await page.screenshot({ path: join(SHOTS, "b4-add-draft.png") });
  await add.getByRole("button", { name: "Back" }).click();

  // a pasted link: same address as other people's copies → the same work
  await add.getByRole("combobox").fill("www.paulgraham.com/greatwork.html?utm_source=e2e");
  const linkRow = add.getByRole("button", { name: /Add this link/ });
  await linkRow.waitFor({ timeout: 5000 });
  await page.screenshot({ path: join(SHOTS, "b4-add-link.png") });
  await page.keyboard.press("Enter");
  await add.getByRole("button", { name: "Back" }).waitFor({ timeout: 15000 });
  await add.getByRole("button", { name: /Favorite/ }).click();
  const mine = await until(async () => (await q("select canonical_id from items where profile_id = $1 and view_url ilike '%greatwork%'", [A.pid]))[0]);
  check("a pasted link joins everyone's copy", mine?.canonical_id === pgKey, mine?.canonical_id ?? "not saved");
  const pgAfter = (await q("select count(distinct profile_id)::int n from items where canonical_id = $1", [pgKey]))[0].n;
  check("…so the work counts one more person", pgAfter === pgBefore + 1, `${pgBefore} → ${pgAfter}`);
  await page.keyboard.press("Escape");
  await page.goto(`${APP}/item/${encodeURIComponent(pgKey)}`, { waitUntil: "networkidle" });
  await page.getByText(/Favorited by \d+ people/).waitFor({ timeout: 15000 });
  check("the link has one shared page", (await page.getByText("You", { exact: true }).count()) === 1, (await page.getByText(/Favorited by \d+ people/).innerText()));
  const glass = await page.getByRole("button", { name: "Share", exact: true }).evaluate((el) => getComputedStyle(el).borderTopWidth);
  check("★ 🔖 ⤴ have no circles behind them", glass === "0px", glass);
  await page.screenshot({ path: join(SHOTS, "b4-item-link.png"), fullPage: true });

  /* ── finished rows say "Favorite?" ──────────────────────────────────────── */
  await page.goto(`${APP}/${A.username}/lists/check-later`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Finished/ }).waitFor({ timeout: 15000 });
  check("finished rows ask “Favorite?”", (await page.getByRole("button", { name: "Favorite?" }).count()) === 1 && (await page.getByText("Loved it").count()) === 0);

  /* ── Friends: one timeline, the rail ───────────────────────────────────── */
  await page.goto(`${APP}/friends`, { waitUntil: "networkidle" });
  const latest = page.locator('section[aria-label="Latest"]');
  await latest.getByText("followed you").first().waitFor({ timeout: 15000 });
  const follows = await latest.getByText("followed you").count();
  check("notifications sit in the timeline", follows === 7, `${follows} rows`);
  check("…no separate box, no See all", (await page.locator("section[aria-label=Notifications]").count()) === 0 && (await page.getByRole("button", { name: /See all/ }).count()) === 0);
  const rail = page.locator("aside");
  const people = rail.locator("section[aria-label='People with your taste'] li").first();
  if (await people.count()) {
    // their covers sit small under the name: never bigger than their face
    const sizes = await people.evaluate((li) => ({
      face: li.querySelector("a > *")?.getBoundingClientRect().height ?? 0,
      cover: Math.max(0, ...[...li.querySelectorAll("a[aria-hidden] img")].map((i) => i.getBoundingClientRect().height)),
    }));
    check("taste covers stay smaller than the face", sizes.cover > 0 && sizes.cover < sizes.face, JSON.stringify(sizes));
  }
  await page.screenshot({ path: join(SHOTS, "b4-friends.png"), fullPage: true });

  /* ── profile ────────────────────────────────────────────────────────────── */
  await page.goto(`${APP}/${A.username}`, { waitUntil: "networkidle" });
  const tabs = page.locator('nav[aria-label="Profile"] a');
  await tabs.first().waitFor({ timeout: 15000 });
  const banner = await page.locator("header").filter({ has: page.locator("h1") }).first().locator("> div").first().boundingBox();
  check("banner runs edge to edge", banner && banner.width >= 1270, banner ? `${Math.round(banner.width)}px` : "none");
  check("no card around the profile", (await page.locator("main .rounded-2xl.border").count()) === 0);
  const addPill = await page.getByRole("button", { name: "Add a favorite" }).last().boundingBox();
  const allPill = await page.getByRole("button", { name: /^All/ }).boundingBox();
  check("wall Add matches the filter pills", Math.abs(addPill.height - allPill.height) <= 1 && Math.abs(addPill.y - allPill.y) <= 1, `${addPill.height}/${allPill.height}px`);
  await page.screenshot({ path: join(SHOTS, "b4-profile.png"), fullPage: true });
  await tabs.nth(1).click();
  await page.waitForURL(`**/${A.username}/lists`, { timeout: 10000 });
  await page.getByText("Ten out of ten").first().waitFor({ timeout: 15000 });
  check("list tiles have no card", (await page.locator("main ul .rounded-2xl").count()) === 0);
  await page.screenshot({ path: join(SHOTS, "b4-profile-lists.png"), fullPage: true });

  // phones: the header still fits, the profile reads well
  const phone = await context({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const pp = await phone.newPage();
  for (const [name, path] of [["feed", "/feed"], ["profile", `/${A.username}`], ["lists", `/${A.username}/lists`], ["friends", "/friends"]]) {
    await pp.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    await pp.waitForTimeout(1500);
    if (name === "feed") {
      const fit = await pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth }));
      check("phone header fits", fit.sw <= fit.vw, JSON.stringify(fit));
    }
    await pp.screenshot({ path: join(SHOTS, `b4-phone-${name}.png`), fullPage: name !== "feed" });
  }
  await pp.getByRole("button", { name: "Add a favorite" }).click();
  await pp.getByRole("dialog").getByRole("tab").first().waitFor({ timeout: 8000 });
  await pp.screenshot({ path: join(SHOTS, "b4-phone-add.png") });
  await phone.close();

  // dark: the profile and the menu
  const dark = await context({ colorScheme: "dark" });
  const dp = await dark.newPage();
  await dp.goto(`${APP}/${A.username}`, { waitUntil: "networkidle" });
  await dp.waitForTimeout(1500);
  await dp.screenshot({ path: join(SHOTS, "b4-dark-profile.png") });
  await dp.goto(`${APP}/friends`, { waitUntil: "networkidle" });
  await dp.waitForTimeout(2000);
  await dp.screenshot({ path: join(SHOTS, "b4-dark-friends.png"), fullPage: true });
  await dark.close();

  // the landing page, for visitors only — one screen, one button
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await anon.newPage();
  lp.on("pageerror", (e) => errors.push(e.message));
  await lp.goto(`${APP}/`, { waitUntil: "networkidle" });
  await lp.getByRole("heading", { name: /Your taste,\s*in one place\./ }).waitFor({ timeout: 15000 });
  const starts = lp.getByRole("link", { name: "Start your library" });
  check("one “Start your library”, to sign-up", (await starts.count()) === 1 && (await starts.getAttribute("href")) === "/signin?mode=signup");
  check("a quiet email line for the not-ready", (await lp.getByRole("textbox", { name: /email/i }).count()) === 1);
  check("no message bubble for visitors", (await lp.getByRole("button", { name: /message/i }).count()) === 0);
  const fold = await lp.evaluate(() => document.documentElement.scrollHeight);
  check("the landing is about one screen", fold <= 1100, `${fold}px tall`);
  await starts.click();
  await lp.waitForURL("**/signin?mode=signup", { timeout: 10000 });
  await lp.getByRole("heading", { name: "Join Favorite" }).waitFor({ timeout: 10000 }).then(
    () => check("…which opens on sign-up", true),
    () => check("…which opens on sign-up", false)
  );
  await anon.close();
  await page.goto(`${APP}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("members get Home, not the landing", (await page.getByRole("heading", { name: /Your taste,\s*in one place\./ }).isVisible().catch(() => false)) === false);

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
