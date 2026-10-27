// e2e for the Chrome extension (v1.1: lists) against v2 on :3000 and the real
// DB: connect handshake on /extension, then the real popup (tab APIs stubbed)
// — starter "Check later", a new list, remove, one-click favorite, reopen.
// Throwaway user, cleaned up after.
//   node scripts/_e2e-extension.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const EXT_DIR = new URL("../../extension", import.meta.url).pathname.replace(/\/$/, "");
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "fav-v2-e2e");
const email = `delivered+v2ext${Date.now().toString(36)}@resend.dev`;
const password = "v2-ext-" + Math.random().toString(36).slice(2);
const PAGE_URL = "https://example.org/essays/how-to-do-great-work";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};
const profileDir = mkdtempSync(join(tmpdir(), "fav-ext-"));

let uid = null;
let pid = null;
let ctx = null;
try {
  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !pid; i++) {
    pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!pid) await new Promise((r) => setTimeout(r, 700));
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [pid]);
  const { data: si } = await sb.auth.signInWithPassword({ email, password });
  const s = si.session;

  ctx = await chromium.launchPersistentContext(profileDir, {
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

  // 1) connect
  const page = await ctx.newPage();
  await page.goto(`${APP}/extension?connect=1`);
  let connected = true;
  await page.getByText(/connected/i).first().waitFor({ timeout: 20000 }).catch(() => (connected = false));
  check("connect handshake", connected);
  check("token minted", (await q("select count(*)::int n from extension_tokens where profile_id = $1", [pid]))[0].n === 1);

  // 2) popup — the real code, with the tab APIs stubbed (Playwright can't click the toolbar)
  const extId = [...createHash("sha256").update(EXT_DIR).digest("hex").slice(0, 32)]
    .map((c) => "abcdefghijklmnop"[parseInt(c, 16)])
    .join("");
  const openPopup = async () => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 360, height: 600 });
    await p.addInitScript((url) => {
      if (location.protocol !== "chrome-extension:") return;
      chrome.tabs.query = async () => [{ id: 1, url, title: "How to Do Great Work", favIconUrl: "" }];
      chrome.scripting = {
        executeScript: async () => [{ result: { title: "How to Do Great Work", site: "paulgraham.com", image: "" } }],
      };
    }, PAGE_URL);
    await p.goto(`chrome-extension://${extId}/popup.html`);
    await p.waitForSelector("#form:not([hidden])", { timeout: 10000 });
    return p;
  };
  const popup = await openPopup();
  check("popup shows the page", (await popup.inputValue("#title")) === "How to Do Great Work");
  const starter = popup.locator(".row", { hasText: "Check later" });
  check("no lists yet → private Check later starter", (await starter.count()) === 1 && (await starter.locator(".lock").count()) === 1);
  await popup.screenshot({ path: join(SHOTS, "ext-1-popup.png") });

  await starter.click();
  await popup.getByText("Saved to Check later.").waitFor({ timeout: 10000 });
  const cl = (await q("select id, is_public from lists where profile_id = $1 and title = 'Check later'", [pid]))[0];
  check("Check later created private", !!cl && cl.is_public === false);
  check("page saved into Check later", (await q("select count(*)::int n from list_items where list_id = $1 and view_url = $2", [cl?.id, PAGE_URL]))[0].n === 1);
  check("row shows ticked", (await popup.locator(".row.on", { hasText: "Check later" }).count()) === 1);

  await popup.fill("#new-title", "Essays");
  await popup.click("#new button[type=submit]");
  await popup.getByText("Saved to Essays.").waitFor({ timeout: 10000 });
  const essays = (await q("select id, is_public from lists where profile_id = $1 and title = 'Essays'", [pid]))[0];
  check("new list created public", !!essays && essays.is_public === true);
  check("new list holds the page", (await q("select count(*)::int n from list_items where list_id = $1", [essays?.id]))[0].n === 1);

  await popup.locator(".row", { hasText: "Essays" }).click();
  await popup.getByText("Removed from Essays.").waitFor({ timeout: 10000 });
  check("untick removes it", (await q("select count(*)::int n from list_items where list_id = $1", [essays?.id]))[0].n === 0);

  await popup.click("#fav");
  await popup.getByText("Added to your favorites.").waitFor({ timeout: 10000 });
  check("one-click favorite saved", (await q("select count(*)::int n from items where profile_id = $1 and view_url = $2", [pid, PAGE_URL]))[0].n === 1);
  await popup.screenshot({ path: join(SHOTS, "ext-2-saved.png") });

  const again = await openPopup();
  check("reopen: favorite shows done", ((await again.textContent("#fav-label")) ?? "").includes("In your favorites"));
  check("reopen: Check later ticked, Essays not", (await again.locator(".row.on", { hasText: "Check later" }).count()) === 1 && (await again.locator(".row.on", { hasText: "Essays" }).count()) === 0);
  check("lists most-recent first", ((await again.locator(".row .name").first().textContent()) ?? "").length > 0);
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await ctx?.close().catch(() => {});
  rmSync(profileDir, { recursive: true, force: true });
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
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
