// Discover → Resources (2026-10-30): antislop's whole archive inside Discover,
// as a visitor, against the dev server (:3000). The two tabs (Media ·
// Resources), the Discover pill lit on both, the whole catalog (backlog too)
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
const pill = (page, name) => page.getByRole("group", { name: "Topic" }).getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
const countOf = async (page, name) => Number((await pill(page, name).textContent()).replace(/\D/g, ""));
const format = (page, name) => page.getByRole("group", { name: "Format" }).getByRole("button", { name, exact: true });
const settle = (page) => page.waitForTimeout(400);

const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${APP}/discover`, { waitUntil: "load" });
  const tabs = page.getByRole("navigation", { name: "Discover" });
  await tabs.waitFor({ timeout: 20000 });
  check("Discover has two tabs, Media lit", (await tabs.getByRole("link").allInnerTexts()).join("|") === "Media|Resources" && (await tabs.getByRole("link", { name: "Media" }).getAttribute("aria-current")) === "page");
  await tabs.getByRole("link", { name: "Resources" }).click();
  await page.waitForURL("**/discover/resources", { timeout: 15000 });
  await page.getByRole("heading", { name: "Worth your time." }).waitFor({ timeout: 15000 });
  check("Resources opens from the tab", true);
  check("…its tab lit, and Discover in the bar", (await tabs.getByRole("link", { name: "Resources" }).getAttribute("aria-current")) === "page" && (await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Discover" }).getAttribute("aria-current")) === "page");
  check("…with its line", (await page.getByText("Some of the greatest resources on the internet", { exact: true }).count()) === 1);

  await page.waitForTimeout(1200);
  const names = (await page.getByRole("group", { name: "Topic" }).getByRole("button").allInnerTexts()).map((t) => t.replace(/\s*\d+$/, ""));
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
  check("formats: All formats first, lit", (await page.getByRole("group", { name: "Format" }).getByRole("button").allInnerTexts()).join("|") === "All formats|Essays|Talks|Videos|Tweets" && (await format(page, "All formats").getAttribute("aria-pressed")) === "true");
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
  await format(page, "Talks").click();
  await settle(page);
  shown = await cards(page);
  const writingTalks = await countOf(page, "Writing");
  check("Writing × Talks: talks only, as many as Writing now counts", shown.length > 0 && shown.length === Math.min(writingTalks, 24) && shown.every((c) => TALKS.includes(c.medium)), `${shown.length} shown, Writing ${writingTalks}`);
  check("…and the counts are of talks", (await countOf(page, "All")) < all && writingTalks < per.Writing);
  await pill(page, "All").click();
  await settle(page);
  shown = await cards(page);
  check("Talks: speeches, lectures and podcasts only", shown.length > 0 && shown.every((c) => TALKS.includes(c.medium)), [...new Set(shown.map((c) => c.medium))].join(", "));
  await format(page, "Videos").click();
  await settle(page);
  shown = await cards(page);
  check("Videos: videos only", shown.length > 0 && shown.every((c) => c.medium === "Video"), [...new Set(shown.map((c) => c.medium))].join(", "));
  await format(page, "Tweets").click();
  await settle(page);
  shown = await cards(page);
  check("Tweets: as quotes (who, then the words), no title line", shown.length > 0 && shown.every((c) => c.medium === "Tweet" && c.quote), `${shown.length} shown`);
  await page.screenshot({ path: join(SHOTS, "resources-tweets.png") });
  await format(page, "All formats").click();
  await settle(page);
  check("All formats: back to the whole count", (await countOf(page, "All")) === all);

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
  const rows = await pp.evaluate(() =>
    ["Topic", "Format"].map((n) => {
      const g = document.querySelector(`[role=group][aria-label=${n}]`);
      return { n, scrolls: g.scrollWidth > g.clientWidth, tall: g.getBoundingClientRect().height };
    })
  );
  check("…topics slide sideways in one row, formats fit in one", rows[0].scrolls && rows[0].tall < 40 && !rows[1].scrolls && rows[1].tall < 30, JSON.stringify(rows));
  await pp.screenshot({ path: join(SHOTS, "resources-390.png") });
  await phone.close();

  const map = await (await fetch(`${APP}/sitemap.xml`)).text();
  check("in the sitemap", map.includes("/discover/resources"));

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
