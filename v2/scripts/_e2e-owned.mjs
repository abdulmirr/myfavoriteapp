// Home never recommends what you already have (2026-10-28). Against the dev
// server (:3000) and the real DB, with no Claude call: today's and tomorrow's
// AI sets are seeded by hand (so nothing generates), one of today's AI picks
// is already on the user's wall, and two of today's community picks are
// theirs too (one favorited, one saved to a list). Home must show none of
// them — and still five cards. Throwaway user, deleted afterwards.
//   node scripts/_e2e-owned.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const db = client();
await db.connect();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const email = `delivered+v2own${Date.now().toString(36)}@resend.dev`;
const password = "own-" + Math.random().toString(36).slice(2);
let uid = null;
let pid = null;
let browser = null;
try {
  // today's community five, as a visitor sees them on the landing page
  browser = await chromium.launch();
  const anon = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await anon.goto(`${APP}/`, { waitUntil: "networkidle" });
  const five = await anon
    .locator("section")
    .filter({ hasText: "Today's five." })
    .locator("li p.truncate.font-semibold")
    .allInnerTexts();
  await anon.close();
  check("read today's community five", five.length === 5, five.join(" | "));
  const [favTitle, saveTitle] = five;
  const rowFor = async (title) =>
    (await q("select media_type::text, title, creator, image_url, canonical_id from items where title = $1 and image_url is not null limit 1", [title]))[0];
  const favRow = await rowFor(favTitle);
  const saveRow = await rowFor(saveTitle);

  await sb.auth.signUp({ email, password });
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !pid; i++) {
    pid = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!pid) await wait(700);
  }
  await q("insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()", [pid]);

  // three albums unlock music picks; "Blonde" is one of them
  for (const [i, t] of ["Blonde", "Test Owned Two", "Test Owned Three"].entries()) {
    await q("insert into items (profile_id, media_type, title, creator, sort_order) values ($1, 'music', $2, 'Test', $3)", [pid, t, i]);
  }
  // one community pick favorited, another saved
  await q(
    "insert into items (profile_id, media_type, title, creator, image_url, canonical_id, sort_order) values ($1, $2, $3, $4, $5, $6, 10)",
    [pid, favRow.media_type, favRow.title, favRow.creator, favRow.image_url, favRow.canonical_id]
  );
  const list = (await q("insert into lists (profile_id, title, slug, is_public) values ($1, 'Check later', 'check-later', false) returning id", [pid]))[0].id;
  await q(
    "insert into list_items (list_id, profile_id, media_type, title, creator, image_url, canonical_id) values ($1, $2, $3, $4, $5, $6, $7)",
    [list, pid, saveRow.media_type, saveRow.title, saveRow.creator, saveRow.image_url, saveRow.canonical_id]
  );

  // today's and tomorrow's AI sets, seeded (no generation): one owned, one new
  const pick = (title) => ({ media_type: "music", title, creator: "Test", year: "2020", hook: "A test hook.", reason: "A test reason.", image_url: null, view_url: null, canonical_id: null });
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  for (const day of [today, tomorrow]) {
    await q("insert into daily_picks (profile_id, day, items) values ($1, $2, $3)", [pid, day, JSON.stringify([pick("Blonde"), pick("A Brand New Album")])]);
  }

  const { data: si } = await sb.auth.signInWithPassword({ email, password });
  const s = si.session;

  // the API: the owned pick is gone, the new one stays
  const res = await fetch(`${APP}/api/picks`, { method: "POST", headers: { Authorization: `Bearer ${s.access_token}`, "x-tz-offset": "0" } });
  const json = await res.json();
  const titles = (json.picks ?? []).map((p) => p.title);
  check("the API drops an AI pick already on the wall", res.ok && !titles.includes("Blonde") && titles.includes("A Brand New Album"), `${res.status} ${JSON.stringify(titles)}`);

  // Home
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [
    sbKey,
    JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: "bearer", user: s.user }),
  ]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/`, { waitUntil: "networkidle" });
  await page.getByText("A Brand New Album").first().waitFor({ timeout: 20000 });
  await wait(1500);
  const cards = page.locator("article h2");
  const shown = (await cards.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  check("Home shows five", shown.length === 5, shown.join(" | "));
  check("…not the favorited community pick", !shown.includes(favTitle), favTitle);
  check("…not the saved one", !shown.includes(saveTitle), saveTitle);
  check("…not the owned AI pick", !shown.includes("Blonde"));
  await page.screenshot({ path: "/tmp/fav-v2-e2e-owned.png", fullPage: true }).catch(() => {});
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser?.close().catch(() => {});
  if (pid) {
    for (const sql of [
      "delete from daily_picks where profile_id = $1",
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
