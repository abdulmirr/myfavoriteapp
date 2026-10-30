// Discover → Resources (2026-10-30): antislop's archive inside Discover, as a
// visitor, against the dev server (:3000). The two tabs, the Discover pill
// lit on both, counts that add up, filters by kind, search, the grid growing
// on scroll, every card opening where it lives, no tweets, phones. No
// account needed. Screenshots land in $SHOTS.
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
      shows: !!a.querySelector("img, .bg-black"),
    }))
  );
const pill = (page, name) => page.getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
const countOf = async (page, name) => Number((await pill(page, name).textContent()).replace(/\D/g, ""));

const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${APP}/discover`, { waitUntil: "load" });
  const tabs = page.getByRole("navigation", { name: "Discover" });
  await tabs.waitFor({ timeout: 20000 });
  check("Discover has two tabs, For you lit", (await tabs.getByRole("link").allInnerTexts()).join("|") === "For you|Resources" && (await tabs.getByRole("link", { name: "For you" }).getAttribute("aria-current")) === "page");
  await tabs.getByRole("link", { name: "Resources" }).click();
  await page.waitForURL("**/discover/resources", { timeout: 15000 });
  await page.getByRole("heading", { name: "Worth your time." }).waitFor({ timeout: 15000 });
  check("Resources opens from the tab", true);
  check("…its tab lit, and Discover in the bar", (await tabs.getByRole("link", { name: "Resources" }).getAttribute("aria-current")) === "page" && (await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Discover" }).getAttribute("aria-current")) === "page");
  check("…credited to antislop", (await page.getByRole("link", { name: "antislop", exact: true }).getAttribute("href")) === "https://antislop.xyz");

  await page.waitForTimeout(1200);
  const [all, essays, talks, videos] = await Promise.all(["All", "Essays", "Talks", "Videos"].map((n) => countOf(page, n)));
  check("the archive is here", all >= 100, `${all} resources`);
  check("…and the kinds add up", essays + talks + videos === all, `${essays} + ${talks} + ${videos} = ${all}`);
  let shown = await cards(page);
  check("the first 24 show", shown.length === 24, `${shown.length}`);
  check("…each opens where it lives, in a new tab", shown.every((c) => /^https?:\/\//.test(c.href) && c.blank));
  check("…each with a picture or a title card", shown.every((c) => c.shows));
  check("…no tweets", shown.every((c) => c.medium !== "Tweet"));
  for (let y = 0; y < 5000; y += 900) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(800);
  shown = await cards(page);
  check("more arrive as you scroll", shown.length >= 48, `${shown.length}`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(SHOTS, "resources-1440.png") });

  await pill(page, "Talks").click();
  await page.waitForTimeout(400);
  shown = await cards(page);
  check("Talks: speeches and lectures only", shown.length > 0 && shown.every((c) => ["Speech", "Lecture"].includes(c.medium)), [...new Set(shown.map((c) => c.medium))].join(", "));
  await pill(page, "Videos").click();
  await page.waitForTimeout(400);
  shown = await cards(page);
  check("Videos: videos only", shown.length > 0 && shown.every((c) => c.medium === "Video"), [...new Set(shown.map((c) => c.medium))].join(", "));
  await pill(page, "All").click();

  const search = page.getByRole("textbox", { name: "Search resources" });
  await search.fill("paul graham");
  await page.waitForTimeout(400);
  shown = await cards(page);
  check("search finds by author", shown.length >= 1 && shown.every((c) => /paul graham/i.test(c.text)), `${shown.length} found`);
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
  await pp.screenshot({ path: join(SHOTS, "resources-390.png") });
  await phone.close();

  const map = await (await fetch(`${APP}/sitemap.xml`)).text();
  check("in the sitemap", map.includes("/discover/resources"));
  check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser.close().catch(() => {});
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
