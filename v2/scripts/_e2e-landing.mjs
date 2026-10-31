// The landing page (2026-10-28; tightened 2026-10-31), as a visitor, at the
// sizes people use: one screen tall, one sign-up button and nothing else to
// click in the middle (no example link, no email box), the line under the
// headline on two lines, the bar (Home · Discover · Resources · Log in)
// fitting at every width, covers floating around the words without ever
// touching them, the band above the words on phones — and the covers
// following the mouse smoothly: moving while it moves, never lurching when it
// stops. No account needed. Screenshots land in $SHOTS.
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
  [360, 740, 0],
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
        const line = h1.nextElementSibling;
        const words = [h1, line, ...h1.parentElement.querySelectorAll("a")].map(box);
        // the bar, left to right: the logo, the visible pills, Log in
        const bar = [...document.querySelectorAll("header a")].filter((a) => a.getClientRects().length);
        const pad = parseFloat(getComputedStyle(document.querySelector("header").parentElement).paddingRight);
        const floats = [...document.querySelectorAll(".landing-depth")].filter((el) => el.getClientRects().length > 0);
        const imgs = floats.map((el) => el.querySelector("img"));
        return {
          scroll: document.documentElement.scrollHeight,
          wide: document.documentElement.scrollWidth,
          words,
          links: h1.parentElement.querySelectorAll("a").length,
          email: document.querySelectorAll("input[type=email]").length,
          lines: Math.round(line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight)),
          bar: bar.map((a) => ({ ...box(a), name: a.getAttribute("aria-label")?.startsWith("Favorite") ? "logo" : a.textContent.trim(), lit: a.getAttribute("aria-current") === "page" })),
          pad,
          covers: imgs.map((img) => ({ ...box(img), done: img.complete && img.naturalWidth > 0, alt: img.alt })),
        };
      });

      // a short phone may scroll to the footer, but never to the button
      if (height >= 800) check(`${tag}: one screen tall`, m.scroll <= height + 1, `${m.scroll}px`);
      else check(`${tag}: the button is on the first screen`, m.words.at(-1).b <= height, `${Math.round(m.words.at(-1).b)}px`);
      check(`${tag}: no sideways scroll`, m.wide <= width, `${m.wide}px`);
      check(`${tag}: one thing to click in the middle, no email box`, m.links === 1 && m.email === 0, `${m.links} links, ${m.email} email`);
      check(`${tag}: the line under the headline on two lines`, m.lines === 2, `${m.lines} lines`);
      const names = m.bar.map((b) => b.name);
      const pills = width >= 640 ? ["Home", "Discover", "Resources"] : ["Discover", "Resources"];
      const tight = m.bar.filter((b, i) => b.l < -0.5 || b.r > width - m.pad + 0.5 || (i && b.l < m.bar[i - 1].r));
      check(`${tag}: the bar — logo, ${pills.join(" · ")}, Log in — fits`, names.join("|") === ["logo", ...pills, "Log in"].join("|") && tight.length === 0 && m.bar.find((b) => b.name === "Home")?.lit !== false, `${names.join(" · ")}${tight.length ? " | tight: " + tight.map((b) => b.name).join(", ") : ""}`);
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

  // …smoothly: a near cover's left edge, every frame, while the mouse crosses
  // the screen over 0.6s and after it stops
  const trace = (ms) =>
    page.evaluate(
      (ms) =>
        new Promise((done) => {
          const el = [...document.querySelectorAll(".landing-depth")].find((e) => e.style.getPropertyValue("--d") === "1" && e.getClientRects().length);
          const out = [];
          const start = performance.now();
          const tick = (t) => {
            out.push([t, el.getBoundingClientRect().left]);
            if (t - start < ms) requestAnimationFrame(tick);
            else done(out);
          };
          requestAnimationFrame(tick);
        }),
      ms
    );
  const mark = () => page.evaluate(() => performance.now());
  await page.mouse.move(10, 450);
  await page.waitForTimeout(1800);
  const crossing = trace(2400);
  const t0 = await mark();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(10 + (1420 * i) / 30, 450);
    await page.waitForTimeout(20);
  }
  const t1 = await mark();
  const path = await crossing;
  const speed = (from, to) => {
    let top = 0;
    for (let i = 1; i < path.length; i++) {
      const [t, x] = path[i];
      if (t > from && t <= to) top = Math.max(top, Math.abs(x - path[i - 1][1]) / (t - path[i - 1][0]));
    }
    return top;
  };
  const x0 = path.find(([t]) => t >= t0)?.[1] ?? path[0][1];
  const xStop = path.filter(([t]) => t <= t1).at(-1)[1];
  const xEnd = path.at(-1)[1];
  const moving = speed(t0, t1);
  const settling = speed(t1, Infinity);
  check("…it moves while the mouse moves", Math.abs(xStop - x0) >= 0.25 * Math.abs(xEnd - x0), `${Math.abs(xStop - x0).toFixed(1)} of ${Math.abs(xEnd - x0).toFixed(1)}px by the stop`);
  check("…and settles without a lurch when it stops", settling <= moving * 1.25, `fastest ${(moving * 1000).toFixed(0)}px/s moving, ${(settling * 1000).toFixed(0)}px/s after`);

  // a pointer that jumps (entering the window, say) glides the scene there
  await page.mouse.move(720, 450);
  await page.waitForTimeout(1800);
  const jumping = trace(1300);
  const j0 = await mark();
  await page.mouse.move(1430, 450);
  const jump = await jumping;
  const base = jump.filter(([t]) => t <= j0).at(-1)?.[1] ?? jump[0][1];
  const goal = jump.at(-1)[1] - base;
  const early = (jump.find(([t]) => t >= j0 + 60)?.[1] ?? base) - base;
  const over = Math.max(...jump.map(([, x]) => Math.sign(goal) * (x - base) - Math.abs(goal)));
  check("a jump glides: a gentle start, no overshoot", Math.abs(goal) > 8 && Math.abs(early) < 0.2 * Math.abs(goal) && over <= 1, `${Math.abs(early).toFixed(1)}px in the first 60ms of ${Math.abs(goal).toFixed(1)}px, overshoot ${Math.max(0, over).toFixed(1)}px`);
  await ctx.close();
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  await browser.close().catch(() => {});
}
console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
