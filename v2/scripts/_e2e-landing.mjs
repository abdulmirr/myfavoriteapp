// The landing page (2026-10-28), as a visitor, at the sizes people use: one
// screen tall, one sign-up button, covers floating around the words without
// ever touching them, the band above the words on phones. No account needed.
// Screenshots land in $SHOTS.
//   node scripts/_e2e-landing.mjs
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const APP = process.env.APP ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "/tmp/fav-v2-landing";
mkdirSync(SHOTS, { recursive: true });
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${x ? " — " + x : ""}`);
  if (!ok) fail++;
};

const SIZES = [
  // [width, height, floats expected around the words (0 = the phone band)]
  [1920, 1080, 14],
  [1536, 864, 14],
  [1440, 900, 14],
  [1280, 800, 14],
  [1024, 768, 11],
  [768, 1024, 0],
  [390, 844, 0],
  [375, 667, 0],
];

const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    for (const [width, height, around] of SIZES) {
      if (scheme === "dark" && ![1440, 390].includes(width)) continue;
      const tag = `${width}x${height}${scheme === "dark" ? " dark" : ""}`;
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${APP}/`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: /Your taste,\s*in one place\./ }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(1600); // the covers fade in

      const m = await page.evaluate(() => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        };
        const h1 = document.querySelector("h1");
        const words = [h1, h1.nextElementSibling, ...h1.parentElement.querySelectorAll("a")].map(box);
        const floats = [...document.querySelectorAll(".landing-depth")].filter((el) => el.getClientRects().length > 0);
        const imgs = floats.map((el) => el.querySelector("img"));
        return {
          scroll: document.documentElement.scrollHeight,
          wide: document.documentElement.scrollWidth,
          words,
          covers: imgs.map((img) => ({ ...box(img), done: img.complete && img.naturalWidth > 0, alt: img.alt })),
        };
      });

      // a short phone may scroll to the email line, but never to the button
      if (height >= 800) check(`${tag}: one screen tall`, m.scroll <= height + 1, `${m.scroll}px`);
      else check(`${tag}: the button is on the first screen`, m.words.at(-2).b <= height, `${Math.round(m.words.at(-2).b)}px`);
      check(`${tag}: no sideways scroll`, m.wide <= width, `${m.wide}px`);
      check(`${tag}: every cover loaded`, m.covers.every((c) => c.done), m.covers.filter((c) => !c.done).map((c) => c.alt).join(", "));
      if (around) {
        check(`${tag}: ${around} covers around the words`, m.covers.length === around, `${m.covers.length}`);
        const gap = 10;
        const hits = m.covers.filter((c) =>
          m.words.some((w) => c.l < w.r + gap && c.r > w.l - gap && c.t < w.b + gap && c.b > w.t - gap)
        );
        check(`${tag}: no cover touches the words`, hits.length === 0, hits.map((c) => c.alt).join(", "));
        const inside = m.covers.filter((c) => c.l < 0 || c.r > width || c.t < 64 || c.b > height);
        check(`${tag}: every cover fully on screen`, inside.length === 0, inside.map((c) => c.alt).join(", "));
      } else {
        check(`${tag}: five covers above the words`, m.covers.length === 5, `${m.covers.length}`);
        const h1 = m.words[0];
        check(`${tag}: …and above the headline`, m.covers.every((c) => c.b <= h1.t), "");
      }
      const starts = page.getByRole("link", { name: "Start your library" });
      check(`${tag}: one sign-up button`, (await starts.count()) === 1 && (await starts.getAttribute("href")) === "/signin?mode=signup");
      check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
      await page.screenshot({ path: join(SHOTS, `landing-${width}x${height}-${scheme}.png`) });
      await ctx.close();
    }
  }

  // the mouse moves the near covers further than the far ones
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${APP}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const at = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".landing-depth")]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({ d: Number(el.style.getPropertyValue("--d")), x: el.getBoundingClientRect().left }))
    );
  await page.mouse.move(720, 450);
  await page.waitForTimeout(1500);
  const before = await at();
  await page.mouse.move(1430, 450, { steps: 8 });
  await page.waitForTimeout(1600);
  const after = await at();
  const moved = (d) => {
    const shifts = after.filter((a) => a.d === d).map((a) => before[after.indexOf(a)].x - a.x);
    return shifts.reduce((s, v) => s + v, 0) / shifts.length;
  };
  const [near, far] = [moved(1), moved(0.3)];
  check("the mouse leans the scene, near covers most", near > 8 && far > 1 && near > far * 2, `near ${near.toFixed(1)}px, far ${far.toFixed(1)}px`);
  await ctx.close();
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser.close().catch(() => {});
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
