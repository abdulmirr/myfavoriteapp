// Resources (2026-10-30): antislop's whole archive, against the dev server
// (:3000). A visitor finds it in the bar (Home · Discover · Resources, no
// tabs); a member inside Discover (Media · Resources tabs, Discover lit) —
// the member is a stand-in session, no account. Then, as a visitor: the
// whole catalog (backlog too)
// with every pick filed under a topic, topic × format filters whose counts
// agree with the grid, tweets as quotes, search, the grid growing on scroll,
// every card opening where it lives, phones. Then an item page's "Favorited
// by", which counts people once. No account needed. Screenshots land in $SHOTS.
//   node scripts/_e2e-resources.mjs
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "/tmp/fav-v2-resources";
mkdirSync(SHOTS, { recursive: true });
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};

// every card on the page: its kind line ("Essay · 8 min"), where it goes, and whether it shows something
const cards = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("article")].map((a) => ({
      medium: a.querySelector("p.mt-0\\.5")?.textContent.split(" · ")[0] ?? "",
      text: a.textContent,
      href: a.querySelector("a")?.getAttribute("href") ?? "",
      blank: a.querySelector("a")?.getAttribute("target") === "_blank",
      shows: !!a.querySelector("img, .bg-black, .whitespace-pre-line"),
      quote: !!a.querySelector(".whitespace-pre-line") && !a.querySelector("h3"),
    }))
  );
const TOPICS = ["Mindset", "Worldview", "Career", "Greatness", "Creativity", "Writing", "Thinking", "Learning", "Productivity"];
const TALKS = ["Speech", "Lecture", "Podcast"];
// a topic chip says how many it holds (in the format picked) when you hover it
const pill = (page, name) => page.getByRole("group", { name: "Topic" }).getByRole("button", { name, exact: true });
const countOf = async (page, name) => Number((await pill(page, name).getAttribute("title")).replace(/\D/g, ""));
// the format is a menu: open it, pick one (its items read "Talks 63")
const format = async (page, name) => {
  await page.getByRole("button", { name: /^Format:/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\s*\\d+$`) }).click();
};
const settle = (page) => page.waitForTimeout(400);

const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${APP}/discover`, { waitUntil: "load" });
  const bar = page.getByRole("navigation", { name: "Main" });
  const lit = async (scope, name) => (await scope.getByRole("link", { name, exact: true }).getAttribute("aria-current")) === "page";
  await bar.getByRole("link", { name: "Resources" }).waitFor({ timeout: 20000 });
  check("visitors: Home · Discover · Resources in the bar, Discover lit", (await bar.getByRole("link").allInnerTexts()).join("|") === "Home|Discover|Resources" && (await lit(bar, "Discover")));
  check("…and no Media · Resources tabs", !(await page.getByRole("navigation", { name: "Discover" }).isVisible()));
  await bar.getByRole("link", { name: "Resources" }).click();
  await page.waitForURL("**/discover/resources", { timeout: 15000 });
  await page.getByRole("heading", { name: "Worth your time." }).waitFor({ timeout: 15000 });
  check("Resources opens from the bar, its own pill lit (not Discover)", (await lit(bar, "Resources")) && !(await lit(bar, "Discover")));
  check("…no tabs here either", !(await page.getByRole("navigation", { name: "Discover" }).isVisible()));
  check("…with its line", (await page.getByText("Some of the greatest resources on the internet", { exact: true }).count()) === 1);

  await page.waitForTimeout(1200);
  const names = await page.getByRole("group", { name: "Topic" }).getByRole("button").allInnerTexts();
  check("topics, in order", names.join("|") === ["All", ...TOPICS].join("|"), names.join(" · "));
  const all = await countOf(page, "All");
  const per = Object.fromEntries(await Promise.all(TOPICS.map(async (t) => [t, await countOf(page, t)])));
  check("the whole catalog is here, backlog too", all >= 700, `${all} resources`);
  check("…every topic has picks", TOPICS.every((t) => per[t] > 0), TOPICS.map((t) => `${t} ${per[t]}`).join(", "));
  // what the page was sent: every pick carries at least one topic
  const html = await (await fetch(`${APP}/discover/resources`)).text();
  const filed = html.match(/\\?"topics\\?":\[/g)?.length ?? 0;
  const unfiled = html.match(/\\?"topics\\?":\[\]/g)?.length ?? 0;
  check("…and every pick is filed under one", filed >= all && unfiled === 0, `${filed} sent, ${unfiled} unfiled`);
  const trigger = page.getByRole("button", { name: /^Format:/ });
  check("one row: the format menu first, then the topics", (await trigger.textContent()).trim() === "Format" && (await page.evaluate(() => document.querySelector("[role=group][aria-label=Topic]").parentElement.firstElementChild.getAttribute("aria-label"))) === "Format: Any format");
  await trigger.click();
  const items = (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const kinds = items.map((t) => Number(t.match(/\d+$/)?.[0]));
  check("…which lists Any format · Essays · Talks · Videos · Tweets with what each holds", items.map((t) => t.replace(/\s*\d+$/, "")).join("|") === "Any format|Essays|Talks|Videos|Tweets" && kinds[0] === all && kinds.slice(1).reduce((s, n) => s + n, 0) === all, items.join(" · "));
  await page.keyboard.press("Escape");
  let shown = await cards(page);
  check("the first 24 show", shown.length === 24, `${shown.length}`);
  check("…each opens where it lives, in a new tab", shown.every((c) => /^https?:\/\//.test(c.href) && c.blank));
  check("…each with a picture or a title card", shown.every((c) => c.shows));

  for (let y = 0; y < 5000; y += 900) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(800);
  shown = await cards(page);
  check("more arrive as you scroll", shown.length >= 48, `${shown.length}`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(SHOTS, "resources-1440.png") });

  // a topic: just what's in it
  await pill(page, "Writing").click();
  await settle(page);
  shown = await cards(page);
  check("Writing: as many as it counts", shown.length === Math.min(per.Writing, 24), `${shown.length} shown of ${per.Writing}`);
  check("…Orwell and Graham among them", ["Why I Write", "Write Like You Talk"].every((t) => shown.some((c) => c.text.includes(t))));
  await page.screenshot({ path: join(SHOTS, "resources-writing.png") });
  // …narrowed by format: the topic counts follow, the grid agrees
  await format(page, "Talks");
  await settle(page);
  shown = await cards(page);
  const writingTalks = await countOf(page, "Writing");
  check("…the menu's button says Talks once picked", (await page.getByRole("button", { name: /^Format:/ }).textContent()).trim() === "Talks");
  check("Writing × Talks: talks only, as many as Writing now counts", shown.length > 0 && shown.length === Math.min(writingTalks, 24) && shown.every((c) => TALKS.includes(c.medium)), `${shown.length} shown, Writing ${writingTalks}`);
  check("…and the counts are of talks", (await countOf(page, "All")) < all && writingTalks < per.Writing);
  await pill(page, "All").click();
  await settle(page);
  shown = await cards(page);
  check("Talks: speeches, lectures and podcasts only", shown.length > 0 && shown.every((c) => TALKS.includes(c.medium)), [...new Set(shown.map((c) => c.medium))].join(", "));
  await format(page, "Videos");
  await settle(page);
  shown = await cards(page);
  check("Videos: videos only", shown.length > 0 && shown.every((c) => c.medium === "Video"), [...new Set(shown.map((c) => c.medium))].join(", "));
  await format(page, "Tweets");
  await settle(page);
  shown = await cards(page);
  check("Tweets: as quotes (who, then the words), no title line", shown.length > 0 && shown.every((c) => c.medium === "Tweet" && c.quote), `${shown.length} shown`);
  await page.screenshot({ path: join(SHOTS, "resources-tweets.png") });
  await format(page, "Any format");
  await settle(page);
  check("Any format: back to the whole count", (await countOf(page, "All")) === all);

  const search = page.getByRole("textbox", { name: "Search resources" });
  await search.fill("paul graham");
  await page.waitForTimeout(400);
  shown = await cards(page);
  check("search finds by author", shown.length >= 1 && shown.every((c) => /paul graham/i.test(c.text)), `${shown.length} found`);
  await pill(page, "Writing").click();
  await settle(page);
  shown = await cards(page);
  check("…and within a topic", shown.length >= 2 && shown.length < 10 && shown.every((c) => /paul graham/i.test(c.text)), shown.map((c) => c.text.split("Paul Graham")[0].trim()).join(" · "));
  await pill(page, "All").click();
  await search.fill("zzqxj nothing like this");
  await page.waitForTimeout(300);
  check("…and says when nothing matches", (await page.getByText(/^Nothing matches/).count()) === 1);
  await ctx.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await phone.newPage();
  pp.on("pageerror", (e) => errors.push(e.message));
  await pp.goto(`${APP}/discover/resources`, { waitUntil: "load" });
  await pp.getByRole("heading", { name: "Worth your time." }).waitFor({ timeout: 20000 });
  await pp.waitForTimeout(1500);
  const wide = await pp.evaluate(() => document.documentElement.scrollWidth);
  check("phones: no sideways scroll", wide <= 390, `${wide}px`);
  const row = await pp.evaluate(() => {
    const r = document.querySelector("[role=group][aria-label=Topic]").parentElement;
    const first = r.firstElementChild.getBoundingClientRect();
    return { scrolls: r.scrollWidth > r.clientWidth, tall: Math.round(r.getBoundingClientRect().height), format: first.left >= 0 && first.right <= innerWidth };
  });
  check("…the format and topics in one row that slides sideways, the format in view", row.scrolls && row.tall < 40 && row.format, JSON.stringify(row));
  await pp.screenshot({ path: join(SHOTS, "resources-390.png") });
  await phone.close();

  const map = await (await fetch(`${APP}/sitemap.xml`)).text();
  check("in the sitemap", map.includes("/discover/resources"));

  // a member — a stand-in session in storage (no account; Supabase calls
  // answered 401) — still finds Resources inside Discover
  const REF = "bvpruvuenqdwilysgojy";
  const fake = { access_token: "e2e.stand-in.token", refresh_token: "e2e-stand-in", expires_at: Math.floor(Date.now() / 1000) + 86400, expires_in: 86400, token_type: "bearer", user: { id: "00000000-0000-4000-8000-00000000e2e0", aud: "authenticated", role: "authenticated", email: "e2e@example.com" } };
  const member = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await member.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(fake)]);
  await member.route(`https://${REF}.supabase.co/**`, (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  const mp = await member.newPage();
  await mp.goto(`${APP}/discover`, { waitUntil: "load" });
  const mbar = mp.getByRole("navigation", { name: "Main" });
  await mbar.getByRole("link", { name: "Friends" }).waitFor({ timeout: 20000 });
  check("members: Home · Discover · Friends in the bar, no Resources pill", (await mbar.getByRole("link").allInnerTexts()).join("|") === "Home|Discover|Friends");
  const mtabs = mp.getByRole("navigation", { name: "Discover" });
  check("…Media · Resources tabs on Discover, Media lit", (await mtabs.isVisible()) && (await mtabs.getByRole("link").allInnerTexts()).join("|") === "Media|Resources" && (await lit(mtabs, "Media")));
  // this stand-in's profile never loads (Supabase says 401): no rows are coming, so no placeholder waits for them
  await mp.waitForTimeout(4500);
  const waiting = await mp.locator("section[aria-hidden='true'] .animate-pulse").count();
  check("…a member whose profile didn't load isn't left on a placeholder", waiting === 0, `${waiting} placeholder bones`);
  await mtabs.getByRole("link", { name: "Resources" }).click();
  await mp.waitForURL("**/discover/resources", { timeout: 15000 });
  await mp.getByRole("heading", { name: "Worth your time." }).waitFor({ timeout: 15000 });
  check("…Resources from the tab: its tab lit, Discover lit in the bar", (await lit(mtabs, "Resources")) && (await lit(mbar, "Discover")));
  await mp.screenshot({ path: join(SHOTS, "resources-member.png") });
  await member.close();

  // an item page counts the people who love it once: the heading says how
  // many; the faces under it don't say it again
  const item = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ip = await item.newPage();
  ip.on("pageerror", (e) => errors.push(e.message));
  const people = async (path) => {
    await ip.goto(`${APP}${path}`, { waitUntil: "load" });
    const h = ip.locator("#favorited-by");
    await h.waitFor({ timeout: 20000 });
    await ip.waitForTimeout(1000);
    const box = ip.locator("section[aria-labelledby=favorited-by]");
    return {
      heading: (await h.textContent()).trim(),
      said: await box.locator("article").count(),
      faces: await box.locator("div.py-4 a[href^='/']").count(),
      text: await box.textContent(),
    };
  };
  const quiet = await people("/item/tmdb%3Amovie%3A687163");
  check("item page: Favorited by N people, said once", /^Favorited by \d+ people$/.test(quiet.heading) && !/walls?\b|more/.test(quiet.text.replace(quiet.heading, "")), `${quiet.heading} | ${quiet.text.replace(quiet.heading, "").slice(0, 80)}`);
  check("…then just the faces", quiet.said === 0 && quiet.faces === Number(quiet.heading.match(/\d+/)[0]), `${quiet.faces} faces`);
  await ip.screenshot({ path: join(SHOTS, "item-quiet.png") });
  const mixed = await people("/item/itunes%3A1109714933");
  const n = Number(mixed.heading.match(/\d+/)[0]);
  check("with thoughts above: the rest as \"And N more\"", mixed.said > 0 && mixed.text.includes(`And ${n - mixed.said} more`) && !/walls?\b/.test(mixed.text), `${mixed.heading}, ${mixed.said} said, ${mixed.faces} faces`);
  await item.close();
  check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser.close().catch(() => {});
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
