// e2e for v2 against the dev server (:3000) and the real DB: onboarding,
// favorites, lists, profile, settings. Creates a throwaway user and always
// deletes it. It never follows anyone and never favorites with provenance —
// both notify (and email) a real person.
//   node scripts/_e2e-v2.mjs            (SHOTS=<dir> to keep screenshots elsewhere)
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, env } from "./db.mjs";

// localhost, not 127.0.0.1 — Next blocks dev assets for other origins
const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "fav-v2-e2e");
mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
const email = `delivered+v2e2e${stamp}@resend.dev`;
const password = "v2-e2e-" + Math.random().toString(36).slice(2);
const handle = `e2e${stamp}`.slice(0, 30);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = client();
await db.connect();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;

const step = (s) => console.log("··", s);
let fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fail++;
};
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`[${tag}] PAGEERROR ${e.message.slice(0, 240)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // a 404 for a deliberately missing thing is not a bug
    if (/Failed to load resource.*404/.test(t)) return;
    errors.push(`[${tag}] ${t.slice(0, 240)}`);
  });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let uid = null;
let profileId = null;
let browser = null;
try {
  // ── throwaway user ──────────────────────────────────────────────────────────
  step("signUp " + email);
  const { error: suErr } = await sb.auth.signUp({ email, password });
  if (suErr) throw suErr;
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !profileId; i++) {
    profileId = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!profileId) await sleep(700);
  }
  if (!profileId) throw new Error("profile never appeared");
  const { data: signin, error: siErr } = await sb.auth.signInWithPassword({ email, password });
  if (siErr) throw siErr;
  const s = signin.session;
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const stored = JSON.stringify({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: "bearer",
    user: s.user,
  });
  step(`profile ${profileId}`);

  browser = await chromium.launch();
  const context = async (opts, beat) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(
      ([k, v, beatKey, b]) => {
        localStorage.setItem(k, v);
        if (b) sessionStorage.setItem(beatKey, String(b));
      },
      [sbKey, stored, `fav2:welcome:${profileId}`, beat ?? 0]
    );
    return ctx;
  };
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  // ── onboarding on a phone, beat by beat (look only — nothing is clicked) ────
  for (const beat of [1, 2, 3, 4]) {
    const ctx = await context(phone, beat);
    const p = await ctx.newPage();
    watch(p, `phone-beat${beat}`);
    await p.goto(`${APP}/welcome`, { waitUntil: "load" });
    await sleep(beat === 2 ? 3500 : 2500);
    await p.screenshot({ path: join(SHOTS, `m-welcome-${beat}.png`) });
    if (beat === 2) await p.screenshot({ path: join(SHOTS, `m-welcome-2-full.png`), fullPage: true });
    await ctx.close();
  }

  // ── onboarding on desktop, for real ────────────────────────────────────────
  const ctx = await context({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  watch(page, "desktop");

  step("home → /welcome");
  await page.goto(`${APP}/`, { waitUntil: "load" });
  await page.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => {});
  check("un-onboarded member is sent to /welcome", page.url().endsWith("/welcome"), page.url());

  step("beat 1: claim");
  await page.getByRole("heading", { name: "Claim your page" }).waitFor({ timeout: 15000 });
  await page.getByLabel("Name", { exact: true }).fill("E2E Tester");
  await page.getByLabel(/^Username/).fill("explore");
  await page.getByText("Reserved — try another.").waitFor({ timeout: 4000 }).then(
    () => check("reserved username is refused live", true),
    () => check("reserved username is refused live", false)
  );
  await page.getByLabel(/^Username/).fill(handle);
  await page.getByText("Available").waitFor({ timeout: 8000 }).then(
    () => check("fresh username shows Available", true),
    () => check("fresh username shows Available", false)
  );
  await page.screenshot({ path: join(SHOTS, "d-welcome-1.png") });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "What do you love?" }).waitFor({ timeout: 15000 });
  const prof = (await q("select username, display_name from profiles where id = $1", [profileId]))[0];
  check("claim saved", prof.username === handle && prof.display_name === "E2E Tester", JSON.stringify(prof));

  step("beat 2: picks");
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "d-welcome-2.png") });
  for (const t of ["Blonde", "In Rainbows", "1984", "The Secret History"]) {
    await page.getByRole("button", { name: `Favorite ${t}`, exact: true }).click();
    await sleep(500);
  }
  await page.getByText("4 favorites", { exact: true }).waitFor({ timeout: 8000 }).then(
    () => check("tray counts 4", true),
    () => check("tray counts 4", false)
  );
  await sleep(1200);
  check("4 items written", Number((await q("select count(*) from items where profile_id = $1", [profileId]))[0].count) === 4);

  await page.getByRole("button", { name: /Add a thought/ }).click();
  await page.getByRole("textbox", { name: "Your thought" }).fill("Read it twice in one summer.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sleep(1500);
  const thought = await q("select title from items where profile_id = $1 and description = $2", [profileId, "Read it twice in one summer."]);
  check("thought saved on the latest pick", thought[0]?.title === "The Secret History", JSON.stringify(thought));

  await page.getByRole("textbox", { name: "Search" }).fill("Arrival");
  const hit = page.getByRole("button", { name: /^Arrival[\s\S]*Film/ }).first();
  await hit.waitFor({ timeout: 15000 }).then(
    () => check("search finds Arrival (film)", true),
    () => check("search finds Arrival (film)", false)
  );
  await page.screenshot({ path: join(SHOTS, "d-welcome-2-search.png") });
  await hit.click();
  await sleep(1500);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "In Rainbows — on your page", exact: true }).click();
  await sleep(2500);
  const items = await q("select title, media_type, canonical_id, image_url from items where profile_id = $1 order by sort_order", [profileId]);
  check("search add + toggle off → 4 items", items.length === 4, items.map((i) => i.title).join(", "));
  check("In Rainbows removed", !items.some((i) => i.title === "In Rainbows"));
  await sleep(4000);
  const enriched = await q("select title, canonical_id, image_url from items where profile_id = $1 and media_type in ('music','book')", [profileId]);
  check(
    "wall picks enriched with a canonical id + hosted art",
    enriched.every((i) => i.canonical_id && /^https?:/.test(i.image_url ?? "")),
    enriched.map((i) => `${i.title}: ${i.canonical_id ?? "∅"}`).join(" | ")
  );
  await page.screenshot({ path: join(SHOTS, "d-welcome-2-done.png") });
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  step("beat 3: import");
  await page.getByRole("heading", { name: "Bring your library" }).waitFor({ timeout: 10000 });
  check("Spotify hidden in onboarding", (await page.getByText("Connect Spotify").count()) === 0);
  await page.screenshot({ path: join(SHOTS, "d-welcome-3.png") });
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  step("beat 4: people (no follows — they'd notify real people)");
  await page
    .getByRole("heading", { name: /Taste is better shared|Your page is live/ })
    .waitFor({ timeout: 15000 });
  if (await page.getByRole("heading", { name: "Taste is better shared" }).count()) {
    await sleep(1500);
    await page.screenshot({ path: join(SHOTS, "d-welcome-4.png") });
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  }

  step("beat 5: reveal");
  await page.getByRole("heading", { name: "Your page is live" }).waitFor({ timeout: 10000 });
  const go = page.getByRole("button", { name: "Start exploring" });
  await go.waitFor();
  for (let i = 0; i < 20 && !(await go.isEnabled()); i++) await sleep(300);
  await sleep(1200);
  await page.screenshot({ path: join(SHOTS, "d-welcome-5.png") });
  const priv = await q("select onboarded_at from profile_private where profile_id = $1", [profileId]);
  check("onboarded_at stamped", !!priv[0]?.onboarded_at);
  const lists0 = await q("select title, slug, is_public from lists where profile_id = $1", [profileId]);
  check("private 'Check later' created", lists0.length === 1 && lists0[0].slug === "check-later" && !lists0[0].is_public, JSON.stringify(lists0));
  await go.click();
  await page.waitForURL(`${APP}/`, { timeout: 10000 }).catch(() => {});
  check("lands on Home", new URL(page.url()).pathname === "/", page.url());
  await sleep(6000);
  const homeText = await page.textContent("body");
  check("Home gates AI picks until 3 in a category", /Favorite 3 albums, books or films/.test(homeText ?? ""));
  check("Home does not bounce back to /welcome", new URL(page.url()).pathname === "/");
  await page.screenshot({ path: join(SHOTS, "d-home.png") });

  step("feed: save to Check later, then a new public list");
  await page.goto(`${APP}/feed`, { waitUntil: "load" });
  const save = page.locator('button[aria-label^="Save "]').first();
  await save.waitFor({ timeout: 20000 });
  const savedTitle = (await save.getAttribute("aria-label")).replace(/^Save /, "");
  await page.screenshot({ path: join(SHOTS, "d-feed.png") });
  await save.click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Check later", exact: true }).click();
  await page.screenshot({ path: join(SHOTS, "d-save-dialog.png") });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await sleep(2000);
  const li = await q(
    "select l.slug, li.title from list_items li join lists l on l.id = li.list_id where li.profile_id = $1",
    [profileId]
  );
  check("saved into Check later", li.length === 1 && li[0].slug === "check-later" && li[0].title === savedTitle, JSON.stringify(li));

  await page.locator(`button[aria-label="${savedTitle} is in your lists"]`).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByLabel("List name").fill("E2E shelf");
  await page.getByRole("button", { name: "Create list" }).click();
  await sleep(1500);
  // a list made here is selected for this work already
  check("new list is pre-selected", (await page.getByRole("button", { name: "E2E shelf", exact: true }).getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await sleep(2000);
  const shelf = await q(
    "select l.is_public, count(li.*) as n from lists l left join list_items li on li.list_id = l.id where l.profile_id = $1 and l.title = 'E2E shelf' group by l.id",
    [profileId]
  );
  check("new list created public and holds the save", shelf[0]?.is_public === true && Number(shelf[0]?.n) === 1, JSON.stringify(shelf));

  step("profile, lists, activity, list page, settings");
  for (const [path, name] of [
    [`/${handle}`, "d-profile"],
    [`/${handle}/lists`, "d-profile-lists"],
    [`/${handle}/activity`, "d-profile-activity"],
    [`/${handle}/lists/check-later`, "d-list-private"],
    [`/${handle}/lists/e2e-shelf`, "d-list-public"],
    ["/settings", "d-settings"],
  ]) {
    await page.goto(`${APP}${path}`, { waitUntil: "load" });
    await sleep(3000);
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: name === "d-profile" });
  }
  const privText = await (async () => {
    await page.goto(`${APP}/${handle}/lists/check-later`, { waitUntil: "load" });
    await sleep(3000);
    return page.textContent("main");
  })();
  check("owner sees their private list", (privText ?? "").includes(savedTitle), (privText ?? "").slice(0, 120));

  step("header: add dialog + notifications");
  await page.goto(`${APP}/feed`, { waitUntil: "load" });
  await sleep(1500);
  await page.getByRole("button", { name: "Add a favorite" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 8000 }).then(
    () => check("＋ opens the add dialog", true),
    () => check("＋ opens the add dialog", false)
  );
  await sleep(800);
  await page.screenshot({ path: join(SHOTS, "d-add.png") });
  await page.keyboard.press("Escape");

  step("signed-out visitor can't see the private list");
  const anon = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const ap = await anon.newPage();
  watch(ap, "anon");
  await ap.goto(`${APP}/${handle}/lists/check-later`, { waitUntil: "load" });
  await sleep(3000);
  const anonText = (await ap.textContent("main")) ?? "";
  check("visitor gets private-or-missing", /private or doesn.t exist/.test(anonText) && !anonText.includes(savedTitle));
  await ap.goto(`${APP}/${handle}`, { waitUntil: "load" });
  await sleep(2500);
  await ap.screenshot({ path: join(SHOTS, "anon-profile.png") });
  await anon.close();
  await ctx.close();
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  if (browser) await browser.close();
  // ── cleanup ────────────────────────────────────────────────────────────────
  step("cleanup");
  if (profileId) {
    for (const sql of [
      "delete from list_items where profile_id = $1",
      "delete from lists where profile_id = $1",
      "delete from notifications where profile_id = $1 or actor_id = $1",
      "delete from follows where follower_id = $1 or followee_id = $1",
      "delete from items where profile_id = $1",
      "delete from daily_picks where profile_id = $1",
      "delete from rec_dismissals where profile_id = $1",
      "delete from feedback where profile_id = $1",
      "delete from email_log where profile_id = $1",
      "delete from username_history where profile_id = $1",
      "delete from profile_private where profile_id = $1",
      "delete from profiles where id = $1",
    ]) {
      await db.query(sql, [profileId]).catch((e) => console.log("cleanup:", sql, e.message));
    }
  }
  if (uid) {
    await db.query("delete from api_usage where user_id = $1", [uid]).catch(() => {});
    await db.query("delete from auth.users where id = $1", [uid]).catch((e) => console.log("cleanup user:", e.message));
  }
  await db.end();
}

if (errors.length) console.log("\nCONSOLE/PAGE ERRORS:\n" + [...new Set(errors)].join("\n"));
console.log(`\nshots: ${SHOTS}`);
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
