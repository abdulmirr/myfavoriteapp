// e2e: Chrome extension connect handshake + popup save, against the prod
// bundle on :3000 and the real prod DB. Creates a throwaway user, drives a
// real Chromium with the unpacked extension, cleans everything up.
//   node scripts/_ext-e2e.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { client, env } from "./db.mjs";

const APP = "http://localhost:3000";
const EXT_DIR = new URL("../extension", import.meta.url).pathname;
const SHOTS = "/private/tmp/claude-501/-Users-abdulmir-Desktop-GitHub-myfavoriteapp-com/82e1c306-46e3-468b-98c7-5493330958a3/scratchpad";
const email = `delivered+ext${Date.now()}@resend.dev`;
const password = "ext-e2e-" + Math.random().toString(36).slice(2);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = client();
await db.connect();

const step = (s) => console.log("··", s);
let fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fail++;
};

// ── throwaway user ────────────────────────────────────────────────────────────
step("signUp " + email);
const { error: suErr } = await sb.auth.signUp({ email, password });
if (suErr) throw suErr;
await db.query("update auth.users set email_confirmed_at = now() where email = $1", [email]);
const uid = (await db.query("select id from auth.users where email = $1", [email])).rows[0].id;

let profileId = null;
for (let i = 0; i < 15 && !profileId; i++) {
  const r = await db.query("select id from profiles where user_id = $1", [uid]);
  profileId = r.rows[0]?.id ?? null;
  if (!profileId) await new Promise((r2) => setTimeout(r2, 700));
}
if (!profileId) throw new Error("profile never appeared");
step("profile " + profileId);

const { data: signin, error: siErr } = await sb.auth.signInWithPassword({ email, password });
if (siErr) throw siErr;
const session = signin.session;

// ── browser with the unpacked extension ──────────────────────────────────────
step("launching chromium with extension");
const ctx = await chromium.launchPersistentContext(SHOTS + "/ext-profile", {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});

const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const stored = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});
await ctx.addInitScript(
  ([k, v]) => {
    if (location.origin === "http://localhost:3000") localStorage.setItem(k, v);
  },
  [sbKey, stored],
);

// ── 1) connect handshake ─────────────────────────────────────────────────────
const page = await ctx.newPage();
await page.goto(`${APP}/extension?connect=1`);
let connected = true;
try {
  await page.getByText("Connected.").waitFor({ timeout: 15000 });
} catch {
  connected = false;
}
await page.screenshot({ path: `${SHOTS}/1-connect.png` });
check("connect handshake → Connected.", connected);

const tokRows = await db.query("select count(*)::int c from extension_tokens where profile_id = $1", [profileId]);
check("token row minted", tokRows.rows[0].c === 1, `rows=${tokRows.rows[0].c}`);

// ── 2) popup: real code, stubbed tab APIs, real save ─────────────────────────
// unpacked extension id = first 32 hex of sha256(path), mapped 0..f → a..p
const cryptoMod = await import("node:crypto");
const extId = [...cryptoMod.createHash("sha256").update(EXT_DIR).digest("hex").slice(0, 32)]
  .map((c) => "abcdefghijklmnop"[parseInt(c, 16)])
  .join("");
step("extension id " + extId);

const popup = await ctx.newPage();
await popup.addInitScript(() => {
  if (location.protocol !== "chrome-extension:") return;
  const fakeTab = {
    id: 1,
    url: "https://example.org/tools/cool-tool",
    title: "Cool Tool",
    favIconUrl: "",
  };
  chrome.tabs.query = async () => [fakeTab];
  chrome.scripting = {
    executeScript: async () => [
      { result: { title: "Cool Tool — build things faster", site: "example.org", image: "" } },
    ],
  };
});
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForSelector("#form:not([hidden])", { timeout: 5000 });
check("popup renders form", true);
check(
  "popup title prefilled from og:title",
  (await popup.inputValue("#title")) === "Cool Tool — build things faster",
);
await popup.screenshot({ path: `${SHOTS}/2-popup-form.png` });

await popup.fill("#thoughts", "the kind of tool you keep coming back to");
await popup.click("#save");
await popup.getByText("Added to your library.").waitFor({ timeout: 10000 });
await popup.screenshot({ path: `${SHOTS}/3-popup-saved.png` });

const item = await db.query(
  "select media_type, title, creator, description, view_url from items where profile_id = $1",
  [profileId],
);
check("item saved via popup", item.rows.length === 1, JSON.stringify(item.rows[0] ?? null));
check(
  "item fields correct",
  item.rows[0]?.media_type === "article" &&
    item.rows[0]?.creator === "example.org" &&
    item.rows[0]?.description === "the kind of tool you keep coming back to",
);

// ── 3) duplicate + copy checks on /add ───────────────────────────────────────
const popup2 = await ctx.newPage();
await popup2.addInitScript(() => {
  if (location.protocol !== "chrome-extension:") return;
  const fakeTab = { id: 1, url: "https://example.org/tools/cool-tool", title: "Cool Tool", favIconUrl: "" };
  chrome.tabs.query = async () => [fakeTab];
  chrome.scripting = { executeScript: async () => [{ result: { title: "Cool Tool — build things faster", site: "example.org", image: "" } }] };
});
await popup2.goto(`chrome-extension://${extId}/popup.html`);
await popup2.waitForSelector("#form:not([hidden])");
await popup2.click("#save");
let dup = true;
try {
  await popup2.getByText("Already in your library.").waitFor({ timeout: 8000 });
} catch {
  dup = false;
}
check("duplicate save → Already in your library.", dup);

const add = await ctx.newPage();
await add.goto(`${APP}/add`);
await add.waitForTimeout(1500);
const bodyText = await add.textContent("body");
check("/add shows 'link' type", /\blink\b/i.test(bodyText));
check("/add has no 'article' label", !/article/i.test(bodyText));
check("nudge line removed", !bodyText.includes("Optional — a line on why makes it yours."));
await add.screenshot({ path: `${SHOTS}/4-add-page.png` });

await ctx.close();

// ── cleanup ──────────────────────────────────────────────────────────────────
step("cleanup");
await db.query("delete from items where profile_id = $1", [profileId]);
await db.query("delete from extension_tokens where profile_id = $1", [profileId]);
await db.query("delete from profile_private where profile_id = $1", [profileId]);
await db.query("delete from api_usage where user_id = $1", [uid]);
await db.query("delete from profiles where id = $1", [profileId]);
await db.query("delete from auth.users where id = $1", [uid]);
await db.end();

console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
