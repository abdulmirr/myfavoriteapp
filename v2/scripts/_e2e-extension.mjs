// e2e for the Chrome extension (v1.2) against v2 on :3000 and the real DB.
//   1. the connect handshake on /extension, then the real popup page (tab APIs
//      stubbed, real RPCs): starter, keyboard, new lists, the undo window, a
//      favorite and its thought, reopening, failures rolling back, a revoked
//      token.
//   2. a REAL toolbar popup (chrome.action.openPopup on a copy of the extension
//      with a test hook and production's CORS), closed the moment an action
//      lands: clicking away must lose nothing. And Chrome shows a popup only
//      once its page stops loading, so a slow cover must not hold the window.
// Throwaway user, cleaned up after.
//   node scripts/_e2e-extension.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const EXT_DIR = new URL("../../extension", import.meta.url).pathname.replace(/\/$/, "");
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "fav-v2-e2e");
const email = `delivered+v2ext${Date.now().toString(36)}@resend.dev`;
const password = "v2-ext-" + Math.random().toString(36).slice(2);
const PAGE_URL = "https://example.org/essays/how-to-do-great-work";
const UNDO_MS = 4000; // popup.js

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failed = [];
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) failed.push(n);
};
const scratch = mkdtempSync(join(tmpdir(), "fav-ext-"));

let uid = null;
let pid = null;
let ctx = null;
let ctx2 = null;
try {
  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !pid; i++) {
    pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!pid) await sleep(700);
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [pid]);
  const { data: si } = await sb.auth.signInWithPassword({ email, password });
  const s = si.session;

  ctx = await chromium.launchPersistentContext(join(scratch, "one"), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await ctx.addInitScript(
    ([k, v, origin]) => {
      if (location.origin === origin) localStorage.setItem(k, v);
    },
    [sbKey, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user }), new URL(APP).origin]
  );

  // ── 1) connect ─────────────────────────────────────────────────────────
  const page = await ctx.newPage();
  await page.goto(`${APP}/extension?connect=1`);
  let connected = true;
  await page.getByText(/connected/i).first().waitFor({ timeout: 20000 }).catch(() => (connected = false));
  check("connect handshake", connected);
  check("token minted", (await q("select count(*)::int n from extension_tokens where profile_id = $1", [pid]))[0].n === 1);

  // ── the popup: the real code, tab APIs stubbed (Playwright can't click the toolbar)
  const extId = [...createHash("sha256").update(EXT_DIR).digest("hex").slice(0, 32)]
    .map((c) => "abcdefghijklmnop"[parseInt(c, 16)])
    .join("");
  // the page-refresh call goes to the live app; answer it from the one under test
  const refreshes = [];
  await ctx.route("https://myfavoriteapp.com/api/revalidate/extension", async (r) => {
    const response = await r.fetch({ url: `${APP}/api/revalidate/extension` });
    refreshes.push(response.status());
    await r.fulfill({ response });
  });

  const openPopup = async (url = PAGE_URL, found = { title: "(3) How to Do Great Work | paulgraham.com", site: "paulgraham.com", image: "" }) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => check("no page errors", false, e.message));
    await p.setViewportSize({ width: 368, height: 600 });
    await p.addInitScript(([url, found]) => {
      if (location.protocol !== "chrome-extension:") return;
      chrome.tabs.query = async () => [{ id: 1, url, title: found.title, favIconUrl: "" }];
      chrome.scripting = { executeScript: async () => [{ result: found }] };
    }, [url, found]);
    await p.goto(`chrome-extension://${extId}/popup.html`);
    await p.waitForSelector("#form:not([hidden])", { timeout: 10000 });
    await p.waitForSelector(".row", { timeout: 10000 });
    return p;
  };
  const row = (p, name) => p.locator(".row:not(.create)", { hasText: name });
  const ticked = (p, name) => p.locator(".row.on", { hasText: name });
  const inList = async (id) => (await q("select id from list_items where list_id = $1 and view_url = $2", [id, PAGE_URL]))[0]?.id ?? null;
  const fav = async () => (await q("select id, description from items where profile_id = $1 and view_url = $2", [pid, PAGE_URL]))[0] ?? null;
  const until = async (test, ms = 8000) => {
    for (let t = 0; t < ms; t += 150) {
      if (await test()) return true;
      await sleep(150);
    }
    return false;
  };

  const popup = await openPopup();
  check("title arrives clean", (await popup.textContent("#title")) === "How to Do Great Work", await popup.textContent("#title"));
  const starter = row(popup, "Check later");
  check("no lists yet → private Check later starter", (await starter.count()) === 1 && (await starter.textContent()).includes("Private"));
  await popup.screenshot({ path: join(SHOTS, "ext-1-popup.png") });

  await starter.click();
  check("tick lands at once", (await ticked(popup, "Check later").count()) === 1);
  await until(async () => (await q("select id from lists where profile_id = $1", [pid])).length === 1);
  const cl = (await q("select id, is_public from lists where profile_id = $1 and title = 'Check later'", [pid]))[0];
  check("Check later created private", !!cl && cl.is_public === false);
  await until(async () => !!(await inList(cl?.id)));
  check("page saved into Check later", !!(await inList(cl?.id)));
  check("count rolls to 1 item", await until(async () => (await starter.textContent()).includes("1 item")));

  // ── find or create, keyboard only
  await popup.fill("#q", "Essays");
  await popup.keyboard.press("Enter");
  await until(async () => (await q("select id from lists where profile_id = $1 and title = 'Essays'", [pid])).length === 1);
  const essays = (await q("select id, is_public from lists where profile_id = $1 and title = 'Essays'", [pid]))[0];
  check("typed name + Enter makes a public list", !!essays && essays.is_public === true);
  await until(async () => !!(await inList(essays?.id)));
  check("new list holds the page", !!(await inList(essays?.id)));
  check("field clears for the next one", (await popup.inputValue("#q")) === "");

  await popup.fill("#q", "Secret stash");
  await popup.click(".private");
  await popup.click(".row.create");
  await until(async () => (await q("select id from lists where profile_id = $1 and title = 'Secret stash'", [pid])).length === 1);
  check("the lock makes it private", (await q("select is_public from lists where profile_id = $1 and title = 'Secret stash'", [pid]))[0]?.is_public === false);

  await popup.fill("#q", "chec");
  check("typing narrows the rows", (await popup.locator(".row:not(.create):visible").count()) === 1);
  check("no match offers create", await popup.locator(".row.create:visible").count() === 1);
  await popup.fill("#q", "check later");
  check("exact name hides create", (await popup.locator(".row.create:visible").count()) === 0);
  await popup.fill("#q", "");

  // ── removals wait: a second tap is the undo
  const before = await inList(essays?.id);
  await row(popup, "Essays").click();
  check("untick lands at once", (await ticked(popup, "Essays").count()) === 0);
  await sleep(600);
  await row(popup, "Essays").click();
  await sleep(UNDO_MS + 700);
  check("tap again inside the window: same row, nothing touched", (await inList(essays?.id)) === before && !!before);

  await row(popup, "Essays").click();
  check("row stays until the window passes", !!(await inList(essays?.id)));
  await sleep(UNDO_MS + 900);
  check("then it's removed", !(await inList(essays?.id)));

  // ── favorite, then a thought
  await popup.click("#fav");
  check("favorite lands at once", (await popup.textContent("#fav-label")) === "Favorited");
  await until(async () => !!(await fav()));
  check("favorite saved, with the clean title", (await q("select title from items where profile_id = $1 and view_url = $2", [pid, PAGE_URL]))[0]?.title === "How to Do Great Work");
  await popup.waitForTimeout(1200);
  await popup.screenshot({ path: join(SHOTS, "ext-2-saved.png") });

  await popup.click("#thought-toggle");
  await popup.fill("#thought", "  The best thing on the subject.  ");
  await popup.keyboard.press("Enter");
  await until(async () => (await fav())?.description === "The best thing on the subject.");
  check("thought saved, trimmed", (await fav())?.description === "The best thing on the subject.", (await fav())?.description);
  check("the action now reads Your thought", (await popup.textContent("#thought-toggle")) === "Your thought");

  // ── reopening
  const again = await openPopup();
  await until(async () => (await again.textContent("#fav-label")) === "Favorited");
  check("reopen: favorited", (await again.textContent("#fav-label")) === "Favorited");
  check("reopen: the thought is there", (await again.inputValue("#thought")) === "The best thing on the subject.");
  check("reopen: Check later ticked, Essays not", (await ticked(again, "Check later").count()) === 1 && (await ticked(again, "Essays").count()) === 0);
  await again.close();

  const variant = await openPopup(`${PAGE_URL}?utm_source=newsletter&fbclid=x`);
  await until(async () => (await ticked(variant, "Check later").count()) === 1);
  check("same page through a tracking link: still marked", (await ticked(variant, "Check later").count()) === 1 && (await variant.textContent("#fav-label")) === "Favorited");
  await variant.close();

  // ── take the favorite back
  const third = await openPopup();
  await until(async () => (await third.textContent("#fav-label")) === "Favorited");
  const item = await fav();
  await third.click("#fav");
  check("unfavorite lands at once", (await third.textContent("#fav-label")) === "Favorite");
  await sleep(500);
  await third.click("#fav");
  await sleep(UNDO_MS + 700);
  const kept = await fav();
  check("tap again inside the window: same favorite, thought intact", kept?.id === item?.id && kept?.description === item?.description);
  await third.click("#fav");
  await sleep(UNDO_MS + 900);
  check("then it's gone", !(await fav()));

  // ── a failed write rolls back and says so
  await third.route("**/rest/v1/rpc/extension_save_to_list", (r) => r.abort());
  await row(third, "Essays").click();
  await third.locator(".sub-line.bad", { hasText: "Couldn't save" }).waitFor({ timeout: 8000 });
  check("failed save unticks the row", (await ticked(third, "Essays").count()) === 0);
  await sleep(800); // past the count's roll and the flight's landing
  check("and the row keeps saying why", (await third.locator(".sub-line.bad").count()) === 1);
  check("and nothing was written", !(await inList(essays?.id)));
  await third.unroute("**/rest/v1/rpc/extension_save_to_list");
  await third.close();
  await popup.close();

  // ── a video is a video, in a list and on the wall; anything else stays a link
  const VIDEO = "https://www.youtube.com/watch?v=UF8uR6Z6KLc&t=12";
  const typed = async (sql) => (await q(sql, [pid, VIDEO]))[0]?.media_type ?? null;
  const video = await openPopup(VIDEO, { title: "(2) Stanford Commencement Address - YouTube", site: "YouTube", image: "" });
  check("a video's title arrives clean", (await video.textContent("#title")) === "Stanford Commencement Address", await video.textContent("#title"));
  await row(video, "Check later").click();
  await video.click("#fav");
  await until(async () => !!(await typed("select media_type from list_items where profile_id = $1 and view_url = $2")) && !!(await typed("select media_type from items where profile_id = $1 and view_url = $2")));
  check("saved to a list as a video", (await typed("select media_type from list_items where profile_id = $1 and view_url = $2")) === "video");
  check("favorited as a video", (await typed("select media_type from items where profile_id = $1 and view_url = $2")) === "video");
  await video.close();
  check("a page without a video id stays a link", (await q("select media_type from list_items where list_id = $1 and view_url = $2", [cl?.id, PAGE_URL]))[0]?.media_type === "article");

  // ── brackets that belong to the title stay
  const film = await openPopup("https://example.org/film", { title: "(500) Days of Summer", tagged: true, site: "example.org", image: "" });
  check("a title from the share tags keeps its brackets", (await film.textContent("#title")) === "(500) Days of Summer", await film.textContent("#title"));
  await film.close();

  // ── every write asked the app to refresh your pages, and it agreed
  await until(async () => refreshes.length >= 8, 10000);
  check("each write refreshes your public pages", refreshes.length >= 8 && refreshes.every((s) => s === 200), `${refreshes.length} calls: ${[...new Set(refreshes)]}`);
  await ctx.unroute("https://myfavoriteapp.com/api/revalidate/extension");

  // ── 2) a real toolbar popup, closed the instant an action lands ──────────
  // production's permissions (no host access, so every RPC is CORS-preflighted
  // from a cold cache) plus `tabs`, because only a real click grants activeTab
  const ext2 = join(scratch, "ext");
  cpSync(EXT_DIR, ext2, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext2, "manifest.json"), "utf8"));
  manifest.permissions.push("tabs");
  manifest.background = { service_worker: "sw.js" };
  writeFileSync(join(ext2, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(ext2, "sw.js"), "");
  writeFileSync(
    join(ext2, "popup.js"),
    `document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") chrome.storage.local.set({ shownIn: Math.round(performance.now()) });
}, { once: true });\n` + readFileSync(join(ext2, "popup.js"), "utf8")
  );
  appendFileSync(
    join(ext2, "popup.js"),
    `
;(async () => {
  const { scenario } = await chrome.storage.local.get("scenario");
  if (!scenario) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rowOf = (name) => [...document.querySelectorAll(".row")].find((b) => b.textContent.includes(name));
  for (let i = 0; i < 160 && !(rowOf(scenario.list) && tab && me); i++) await wait(50);
  await wait(500);
  if (scenario.act === "seed-slow-covers") {
    const cache = JSON.parse(localStorage.getItem("fav:cache"));
    for (const l of cache.lists) l.covers = [1, 2, 3].map((n) => scenario.cover + "?" + l.id + n);
    localStorage.setItem("fav:cache", JSON.stringify(cache));
  }
  if (scenario.act === "tick") rowOf(scenario.list).click();
  if (scenario.act === "favorite" || scenario.act === "unfavorite") $("fav").click();
  if (scenario.act === "thought") {
    $("thought-toggle").click();
    $("thought").value = scenario.text;
    $("thought").dispatchEvent(new Event("input", { bubbles: true }));
  }
  chrome.tabs.create({ url: "about:blank", active: true }); // what a click-away does to a popup
})();`
  );

  const token = randomBytes(32).toString("hex");
  await q("insert into extension_tokens (profile_id, token_hash) values ($1, encode(extensions.digest($2, 'sha256'), 'hex'))", [pid, token]);
  ctx2 = await chromium.launchPersistentContext(join(scratch, "two"), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1000, height: 700 },
    args: [`--disable-extensions-except=${ext2}`, `--load-extension=${ext2}`],
  });
  const sw = ctx2.serviceWorkers()[0] ?? (await ctx2.waitForEvent("serviceworker", { timeout: 10000 }));
  const realUrl = `https://example.org/?fav-e2e=${Date.now()}`;
  const site = ctx2.pages()[0] ?? (await ctx2.newPage());
  await site.goto(realUrl);
  const run = async (scenario) => {
    await site.bringToFront();
    await sw.evaluate(async ([token, scenario]) => {
      await chrome.storage.local.set({ favToken: token, scenario });
      await chrome.action.openPopup();
    }, [token, scenario]);
    await sleep(3600); // open, act, close, and whatever made it out lands
  };
  const inCL = async () => (await q("select id from list_items where list_id = $1 and view_url = $2", [cl?.id, realUrl]))[0]?.id ?? null;
  const favReal = async () => (await q("select id, description from items where profile_id = $1 and view_url = $2", [pid, realUrl]))[0] ?? null;

  await run({ act: "tick", list: "Check later" });
  check("real popup: tick, close at once → saved", !!(await inCL()));
  await run({ act: "tick", list: "Check later" });
  check("real popup: untick, close at once → removed", !(await inCL()));
  await run({ act: "favorite", list: "Check later" });
  check("real popup: favorite, close at once → saved", !!(await favReal()));
  await run({ act: "thought", list: "Check later", text: "Typed, then clicked away." });
  check("real popup: thought typed, close at once → saved", (await favReal())?.description === "Typed, then clicked away.", (await favReal())?.description);
  await run({ act: "unfavorite", list: "Check later" });
  check("real popup: unfavorite, close at once → removed", !(await favReal()));

  const slow = http.createServer((_, res) => setTimeout(() => res.end(), 3000));
  await new Promise((r) => slow.listen(0, "127.0.0.1", r));
  await run({ act: "seed-slow-covers", list: "Check later", cover: `http://127.0.0.1:${slow.address().port}/cover.jpg` });
  await run({ act: "none", list: "Check later" });
  const shownIn = await sw.evaluate(async () => (await chrome.storage.local.get("shownIn")).shownIn);
  check("real popup: slow covers can't hold the window shut", shownIn < 1000, `shown in ${shownIn}ms`);
  slow.closeAllConnections();
  slow.close();
  await ctx2.close();
  ctx2 = null;

  // ── a revoked token is the connect screen, and the cache goes with it
  await q("delete from extension_tokens where profile_id = $1", [pid]);
  const gone = await ctx.newPage();
  await gone.setViewportSize({ width: 368, height: 600 });
  await gone.addInitScript((url) => {
    if (location.protocol !== "chrome-extension:") return;
    chrome.tabs.query = async () => [{ id: 1, url, title: "Page", favIconUrl: "" }];
    chrome.scripting = { executeScript: async () => [{ result: null }] };
  }, PAGE_URL);
  await gone.goto(`chrome-extension://${extId}/popup.html`);
  await gone.waitForSelector("#connect:not([hidden])", { timeout: 10000 });
  check("revoked token → connect", await gone.isVisible("#connect-btn"));
  check("cached lists cleared", (await gone.evaluate(() => localStorage.getItem("fav:cache"))) === null);
} catch (e) {
  failed.push(`threw: ${e.message}`);
  console.log("FAIL threw:", e.message);
} finally {
  await ctx?.close().catch(() => {});
  await ctx2?.close().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
  if (pid) {
    for (const sql of [
      "delete from list_items where profile_id = $1",
      "delete from lists where profile_id = $1",
      "delete from items where profile_id = $1",
      "delete from extension_tokens where profile_id = $1",
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
console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED:\n- ${failed.join("\n- ")}` : "\nALL CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
