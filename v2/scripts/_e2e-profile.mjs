// e2e for the profile redesign (2026-10-27) against the dev server (:3000)
// and the real DB: avatar → profile (no account menu), the settings gear, the
// banner (upload in place, remove in settings), the big Top four, and the
// Daily picks switch. Throwaway user with a seeded wall; cleaned up after.
//   node scripts/_e2e-profile.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "fav-v2-e2e");
const email = `delivered+v2prof${Date.now().toString(36)}@resend.dev`;
const password = "v2-prof-" + Math.random().toString(36).slice(2);
const HEADER_PNG = new URL("../public/icon-512.png", import.meta.url).pathname;

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};

let uid = null;
let pid = null;
let browser = null;
try {
  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !pid; i++) {
    pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!pid) await new Promise((r) => setTimeout(r, 700));
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [pid]);
  const username = (await q("select username from profiles where id = $1", [pid]))[0].username;
  // a full wall (8+) so the Top four tops up from it; one pinned
  const art = "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/bb/45/68/bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/600x600bb.jpg";
  for (let i = 0; i < 9; i++) {
    await q(
      "insert into items (profile_id, media_type, title, creator, image_url, sort_order, pinned_order) values ($1, 'music', $2, 'Test Artist', $3, $4, $5)",
      [pid, `Album ${i + 1}`, art, i, i === 0 ? 1 : null]
    );
  }
  const { data: si } = await sb.auth.signInWithPassword({ email, password });
  const s = si.session;

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [
    sbKey,
    JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user }),
  ]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/feed`, { waitUntil: "networkidle" });
  const you = page.getByRole("link", { name: "Your profile" });
  await you.waitFor({ timeout: 15000 });
  check("header avatar links to your profile", (await you.getAttribute("href")) === `/${username}`);
  check("account menu is gone", (await page.getByRole("button", { name: "Account menu" }).count()) === 0);

  await you.click();
  await page.waitForURL(`**/${username}`, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const gear = page.getByRole("link", { name: "Settings" }).first();
  check("gear on your own card → /settings", (await gear.getAttribute("href")) === "/settings");
  check("no Edit profile button", (await page.getByText("Edit profile").count()) === 0);
  const four = page.locator("section[aria-labelledby=top-four] a");
  check("Top four shows four (1 pinned + 3 from the wall)", (await four.count()) === 4, String(await four.count()));
  check("owner sees the pin hint", (await page.getByText(/Pin yours from any favorite/).count()) === 1);

  // header: upload in place from the banner
  check("banner offers Add header to the owner", (await page.getByRole("button", { name: "Add header" }).count()) === 1);
  await page.locator('input[type=file][accept="image/jpeg,image/png,image/webp"]').first().setInputFiles(HEADER_PNG);
  let headerUrl = null;
  for (let i = 0; i < 20 && !headerUrl; i++) {
    await page.waitForTimeout(500);
    headerUrl = (await q("select header_url from profiles where id = $1", [pid]))[0].header_url;
  }
  check("header uploaded + saved", !!headerUrl && headerUrl.includes(`/media/${pid}/header-`), headerUrl ?? "null");
  await page.waitForTimeout(1500);
  check("banner flips to Change header", (await page.getByRole("button", { name: "Change header" }).count()) === 1);
  await page.screenshot({ path: join(SHOTS, "profile-owner.png") });

  // settings: header removal, Daily picks switch, legal links
  await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });
  await page.getByText("Daily picks").first().waitFor({ timeout: 15000 });
  check("settings has the Daily picks switch", (await page.getByText("Daily picks").count()) >= 1);
  check("settings links Privacy + Terms", (await page.getByRole("link", { name: "Privacy" }).count()) === 1 && (await page.getByRole("link", { name: "Terms" }).count()) === 1);
  await page.getByRole("button", { name: "Remove" }).click();
  let cleared = false;
  for (let i = 0; i < 20 && !cleared; i++) {
    await page.waitForTimeout(400);
    cleared = (await q("select header_url from profiles where id = $1", [pid]))[0].header_url === null;
  }
  check("Remove clears the header", cleared);

  // a visitor sees no owner controls
  const anon = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await anon.goto(`${APP}/${username}`, { waitUntil: "networkidle" });
  await anon.waitForTimeout(1500);
  check("visitor sees no header button or gear", (await anon.getByRole("button", { name: /header/i }).count()) === 0 && (await anon.getByRole("link", { name: "Settings" }).count()) === 0);
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser?.close().catch(() => {});
  if (pid) {
    const files = await sb.storage.from("media").list(pid).catch(() => ({ data: [] }));
    const headers = (files.data ?? []).filter((f) => f.name.startsWith("header-")).map((f) => `${pid}/${f.name}`);
    if (headers.length) await sb.storage.from("media").remove(headers).catch(() => {});
    for (const sql of [
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
