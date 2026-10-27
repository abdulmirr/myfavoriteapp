// e2e for Home's AI picks against the dev server (:3000) and the real DB +
// Anthropic API (two small calls: today, then tomorrow's pre-generation).
// A throwaway user with three albums unlocks exactly one category.
//   node scripts/_e2e-picks.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "fav-v2-e2e");
const stamp = Date.now().toString(36);
const email = `delivered+v2picks${stamp}@resend.dev`;
const password = "v2-picks-" + Math.random().toString(36).slice(2);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = client();
await db.connect();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
let fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let uid = null;
let profileId = null;
try {
  const { error: suErr } = await sb.auth.signUp({ email, password });
  if (suErr) throw suErr;
  await q("update auth.users set email_confirmed_at = now() where email = $1", [email]);
  uid = (await q("select id from auth.users where email = $1", [email]))[0].id;
  for (let i = 0; i < 15 && !profileId; i++) {
    profileId = (await q("select id from profiles where user_id = $1", [uid]))[0]?.id ?? null;
    if (!profileId) await sleep(700);
  }
  if (!profileId) throw new Error("profile never appeared");
  await q(
    "insert into profile_private (profile_id, onboarded_at) values ($1, now()) on conflict (profile_id) do update set onboarded_at = now()",
    [profileId]
  );
  const albums = [
    ["Blonde", "Frank Ocean", "The quietest loud record I own."],
    ["In Rainbows", "Radiohead", ""],
    ["Currents", "Tame Impala", "Summer 2015 on repeat."],
  ];
  for (const [i, [title, creator, description]] of albums.entries()) {
    await q(
      "insert into items (profile_id, media_type, title, creator, description, sort_order) values ($1, 'music', $2, $3, $4, $5)",
      [profileId, title, creator, description, i]
    );
  }
  const { data: signin, error: siErr } = await sb.auth.signInWithPassword({ email, password });
  if (siErr) throw siErr;
  const s = signin.session;

  const t0 = Date.now();
  const res = await fetch(`${APP}/api/picks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.access_token}`, "x-tz-offset": String(new Date().getTimezoneOffset()) },
  });
  const json = await res.json();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check("POST /api/picks → 200", res.status === 200, `${res.status} in ${secs}s`);
  const picks = json.picks ?? [];
  check("exactly one pick (music only)", picks.length === 1 && picks[0].media_type === "music", JSON.stringify(picks.map((p) => [p.media_type, p.title, p.creator])));
  if (picks[0]) {
    const p = picks[0];
    console.log(`     hook:   ${p.hook}\n     reason: ${p.reason}\n     art:    ${p.image_url}`);
    check("pick has hook + reason", !!p.hook && !!p.reason);
    check("pick isn't already a favorite", !albums.some(([t]) => t.toLowerCase() === p.title.toLowerCase()));
    check("pick has artwork", !!p.image_url);
  }

  const again = await fetch(`${APP}/api/picks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.access_token}`, "x-tz-offset": String(new Date().getTimezoneOffset()) },
  }).then((r) => r.json());
  // (stored as jsonb, so compare content, not key order)
  const sig = (l) => (l ?? []).map((p) => `${p.media_type}|${p.title}|${p.hook}`).join(";");
  check("second request serves the stored set", sig(again.picks) === sig(picks));

  // Home renders it (from the cache the first visit writes)
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sbKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await ctx.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    [sbKey, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in, token_type: "bearer", user: s.user })]
  );
  const page = await ctx.newPage();
  await page.goto(`${APP}/`, { waitUntil: "load" });
  await sleep(6000);
  const body = (await page.textContent("main, body")) ?? "";
  check("Home shows the AI pick", !!picks[0] && body.includes(picks[0].title));
  await page.screenshot({ path: join(SHOTS, "picks-home.png") });
  await browser.close();

  // tomorrow's set brews in after() — give it time, then confirm
  let tomorrow = [];
  for (let i = 0; i < 30 && !tomorrow.length; i++) {
    await sleep(3000);
    // today + tomorrow, both filled (days are the viewer's local dates)
    tomorrow = await q("select day, jsonb_array_length(items) as n from daily_picks where profile_id = $1 and jsonb_array_length(items) > 0 order by day", [profileId]);
    if (tomorrow.length < 2) tomorrow = [];
  }
  check("tomorrow's picks pre-generated", tomorrow.length >= 2, JSON.stringify(tomorrow));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  if (profileId) {
    for (const sql of [
      "delete from daily_picks where profile_id = $1",
      "delete from items where profile_id = $1",
      "delete from rec_dismissals where profile_id = $1",
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
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
