// e2e for the morning email's own picks against the dev server (:3000) and the
// real DB + Anthropic API: a throwaway member who subscribed before making a
// page and hasn't opened Home today. The email must choose their day, and
// Home must then show that same set.
//   node scripts/_e2e-newsletter.mjs
import { createClient } from "@supabase/supabase-js";
import { client, env } from "./db.mjs";

const APP = process.env.APP ?? "http://localhost:3000";
const stamp = Date.now().toString(36);
const email = `delivered+v2news${stamp}@resend.dev`;
const password = "v2-news-" + Math.random().toString(36).slice(2);
const day = new Date().toISOString().slice(0, 10);
const cron = { Authorization: `Bearer ${env.CRON_SECRET}` };

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
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const stored = async () =>
  (await q("select items from daily_picks where profile_id = $1 and day = $2", [profileId, day]))[0]?.items ?? null;

let uid = null;
let profileId = null;
try {
  // subscribed first, with no account (no profile_id on the row)
  await q("insert into newsletter_subscribers (email, status, confirmed_at) values ($1, 'active', now())", [email]);

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
  check("no set for today yet", (await stored()) === null);

  // the email chooses their day
  const t0 = Date.now();
  const res = await fetch(`${APP}/api/newsletter/send?html=${encodeURIComponent(email)}`, { headers: cron });
  const html = await res.text();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check("preview → 200 html", res.status === 200 && /^<!doctype html>/i.test(html), `${res.status} in ${secs}s`);
  const set = (await stored()) ?? [];
  check("…stored the day's set where Home reads it", set.length === 5, `${set.length} picks`);
  for (const p of set) console.log(`     ${p.title} — ${p.creator}\n       reason: ${p.reason}`);
  check("…the email carries every one", set.length > 0 && set.every((p) => html.includes(esc(p.title))));
  check("…each with why it's for them", (html.match(/Why it&rsquo;s for you/g) ?? []).length === set.length);
  check("…every reason in the email", set.every((p) => html.includes(esc(p.reason))));
  check("…as their own issue, not the community's", html.includes("Fresh picks tomorrow morning") && !html.includes("from the community"));
  check("…none already a favorite", !set.some((p) => albums.some(([t]) => t.toLowerCase() === p.title.toLowerCase())));

  // a second render reuses it (no second model call)
  const t1 = Date.now();
  const html2 = await fetch(`${APP}/api/newsletter/send?html=${encodeURIComponent(email)}`, { headers: cron }).then((r) => r.text());
  check("second render serves the stored set", set.every((p) => html2.includes(esc(p.title))) && Date.now() - t1 < 15000, `${((Date.now() - t1) / 1000).toFixed(1)}s`);

  // Home, on the same date, shows exactly that set
  const { data: signin, error: siErr } = await sb.auth.signInWithPassword({ email, password });
  if (siErr) throw siErr;
  const home = await fetch(`${APP}/api/picks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${signin.session.access_token}`, "x-tz-offset": "0" },
  }).then((r) => r.json());
  const sig = (l) => (l ?? []).map((p) => `${p.media_type}|${p.title}|${p.reason}`).join(";");
  check("Home shows the email's five, in order", sig(home.picks) === sig(set), (home.picks ?? []).map((p) => p.title).join(" | "));

  // a pass on Home drops it from the email too
  const gone = set[0];
  await q("insert into rec_dismissals (profile_id, media_type, title, creator) values ($1, $2, $3, $4)", [profileId, gone.media_type, gone.title, gone.creator]);
  const html3 = await fetch(`${APP}/api/newsletter/send?html=${encodeURIComponent(email)}`, { headers: cron }).then((r) => r.text());
  check("a pick passed on Home is gone from the email", !html3.includes(esc(gone.title)) && set.slice(1).every((p) => html3.includes(esc(p.title))));

  // Home pre-chooses tomorrow in after(); let it land before cleaning up
  for (let i = 0; i < 30; i++) {
    const n = (await q("select count(*)::int as n from daily_picks where profile_id = $1 and jsonb_array_length(items) > 0", [profileId]))[0].n;
    if (n >= 2) break;
    await sleep(3000);
  }
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await db.query("delete from newsletter_subscribers where email = $1", [email]).catch((e) => console.log("cleanup sub:", e.message));
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
