// Chrome Web Store listing assets:
//   node scripts/ext-store-shots.mjs
// Renders the real popup (real popup.css + fonts, state forced per shot)
// inside a minimal browser-window scene, and the promo tiles — all in the
// app's v2 look (Inter, gray page, white cards, the gold star). Outputs
// extension/store/screenshot-{1,2}.jpg (1280×800), tile.jpg (440×280) and
// marquee.jpg (1400×560) — rendered @2x, downscaled via sips, JPEG because
// the store forbids alpha.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const store = join(root, "extension", "store");
mkdirSync(store, { recursive: true });
const tmp = join(tmpdir(), "fav-store-shots");
mkdirSync(tmp, { recursive: true });

const css = `file://${root}extension/popup.css`;
const star = `file://${root}extension/star.svg`;
const inter = `file://${root}extension/fonts/Inter-Latin.woff2`;
const cover = `file://${root}public/landing/covers/blog-paul-graham.svg`;

const CHECK =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const LOCK =
  '<svg class="lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';

// ---- popup states (real markup + real stylesheet, no scripts) ----
const LISTS = [
  { title: "Check later", priv: true, n: 12 },
  { title: "Essays that rewired me", priv: false, n: 9 },
  { title: "10/10 albums", priv: false, n: 24 },
  { title: "Watch this weekend", priv: true, n: 5 },
];
const popupBody = (state) => {
  const saved = state === "saved";
  const rows = LISTS.map((l, i) => {
    const on = i === 0 || (saved && i === 1);
    return `<li><button class="row${on ? " on" : ""}"><span class="box">${CHECK}</span><span class="name">${l.title}</span>${l.priv ? LOCK : ""}<span class="n">${l.n + (on ? 1 : 0)}</span></button></li>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${css}"></head><body>
<header><img src="${star}" alt="" class="mark"><span class="wordmark">favorite</span></header>
<section id="form">
  <div class="card page">
    <div class="thumb"><img src="${cover}"></div>
    <div class="meta">
      <input id="title" type="text" value="How to Do Great Work" spellcheck="false">
      <div class="site">paulgraham.com</div>
    </div>
  </div>
  <div class="fav">
    <button id="fav" class="primary wide${saved ? " done" : ""}"${saved ? " disabled" : ""}>
      <img src="${star}" alt="" class="btn-mark"><span>${saved ? "In your favorites" : "Favorite"}</span>
    </button>
    ${saved ? "" : '<button type="button" class="link">Add a thought</button>'}
  </div>
  <div class="card lists">
    <p class="label">Save to a list</p>
    <ul class="rows">${rows}</ul>
    <form class="new"><input type="text" placeholder="New list"><button type="button" class="quiet">Create</button></form>
  </div>
  <p id="status" class="ok">${saved ? "Added to your favorites." : "Saved to Check later."}</p>
</section>
</body></html>`;
};

// ---- the 1280×800 scene ----
const scene = (popupSrc, popupH, h1, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Inter"; src: url("${inter}") format("woff2"); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { width: 1280px; height: 800px; background: #f3f4f6; overflow: hidden;
  font-family: Inter, sans-serif; display: flex; align-items: center; -webkit-font-smoothing: antialiased; }
.copy { width: 470px; padding: 0 0 0 84px; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 36px; }
.brand img { width: 30px; height: 30px; }
.brand span { font-size: 32px; font-weight: 700; letter-spacing: -0.055em; color: #111827; line-height: 1; }
h1 { font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -0.035em; color: #111827; }
.sub { margin-top: 18px; font-size: 17px; line-height: 1.6; color: #6b7280; }
.stage { flex: 1; display: flex; justify-content: center; }
.window { width: 620px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;
  box-shadow: 0 40px 80px -24px rgba(17,24,39,.18); }
.bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f3f4f6; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #e5e7eb; }
.url { flex: 1; margin: 0 12px; background: #f3f4f6; border-radius: 999px; font-size: 12px; color: #9ca3af; padding: 7px 14px; }
.bar img { height: 17px; }
.page { position: relative; height: 640px; padding: 48px 52px; }
.line { height: 11px; border-radius: 999px; background: #f3f4f6; margin-bottom: 15px; }
.popup { position: absolute; top: 10px; right: 12px; width: 360px; height: ${popupH}px; border-radius: 14px; overflow: hidden;
  border: 1px solid #e5e7eb; box-shadow: 0 28px 56px -12px rgba(17,24,39,.28); background: #f3f4f6; }
.popup iframe { width: 100%; height: 100%; border: 0; }
</style></head><body>
  <div class="copy">
    <div class="brand"><img src="${star}" alt=""><span>favorite</span></div>
    <h1>${h1}</h1>
    <p class="sub">${sub}</p>
  </div>
  <div class="stage">
    <div class="window">
      <div class="bar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="url">paulgraham.com/greatwork.html</span>
        <img src="${star}" alt="">
      </div>
      <div class="page">
        <div class="line" style="width:42%;height:18px;margin-bottom:28px"></div>
        ${Array.from({ length: 15 }, (_, i) => `<div class="line" style="width:${[92, 88, 95, 60, 0, 90, 94, 86, 91, 55, 0, 93, 89, 64, 80][i]}%"></div>`).join("")}
        <div class="popup"><iframe src="${popupSrc}"></iframe></div>
      </div>
    </div>
  </div>
</body></html>`;

// ---- the promo tiles (440×280 small, 1400×560 marquee) ----
const promo = ({ w, h, star: starH, word, tag, gap, text }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Inter"; src: url("${inter}") format("woff2"); font-weight: 100 900; }
* { margin: 0; }
body { width: ${w}px; height: ${h}px; background: #f3f4f6; overflow: hidden; -webkit-font-smoothing: antialiased;
  font-family: Inter, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${gap}px; }
.brand { display: flex; align-items: center; gap: ${Math.round(starH * 0.28)}px; }
.brand img { width: ${starH}px; height: ${starH}px; }
.brand span { font-size: ${word}px; font-weight: 700; letter-spacing: -0.055em; color: #111827; line-height: 1; }
.tag { font-size: ${tag}px; color: #6b7280; letter-spacing: -0.01em; }
</style></head><body>
  <div class="brand"><img src="${star}" alt=""><span>favorite</span></div>
  <div class="tag">${text}</div>
</body></html>`;

const PROMOS = [
  { out: "tile", w: 440, h: 280, star: 40, word: 46, tag: 15, gap: 16, text: "Save anything to your lists" },
  { out: "marquee", w: 1400, h: 560, star: 84, word: 96, tag: 26, gap: 30,
    text: "Save the page you're on to any list, or favorite it, in one click." },
];

const SHOTS = [
  {
    out: "screenshot-1",
    state: "lists",
    h1: "Save anything you find to a list.",
    sub: "Read-later, watch-later, 10/10 albums. Tick a list and the page is in it, with its title and artwork.",
  },
  {
    out: "screenshot-2",
    state: "saved",
    h1: "Or make it a favorite, in one click.",
    sub: "⌘⇧F opens it from any page. Everything lands on your page at myfavoriteapp.com.",
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });

const jpeg = (png, out, w, h) => {
  execFileSync("sips", ["-z", String(h), String(w), "-s", "format", "jpeg", "-s", "formatOptions", "95", png, "--out", out], { stdio: "ignore" });
};

for (const s of SHOTS) {
  const stateFile = join(tmp, `popup-${s.state}.html`);
  writeFileSync(stateFile, popupBody(s.state));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`file://${stateFile}`);
  await page.waitForTimeout(300);
  const popupH = await page.evaluate(() => document.body.scrollHeight);

  const sceneFile = join(tmp, `scene-${s.out}.html`);
  writeFileSync(sceneFile, scene(`file://${stateFile}`, popupH, s.h1, s.sub));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`file://${sceneFile}`);
  await page.waitForTimeout(600); // fonts + iframe
  const png = join(tmp, `${s.out}.png`);
  await page.screenshot({ path: png });
  jpeg(png, join(store, `${s.out}.jpg`), 1280, 800);
  console.log(`${s.out}.jpg`);
}

for (const p of PROMOS) {
  const file = join(tmp, `${p.out}.html`);
  writeFileSync(file, promo(p));
  await page.setViewportSize({ width: p.w, height: p.h });
  await page.goto(`file://${file}`);
  await page.waitForTimeout(300);
  const png = join(tmp, `${p.out}.png`);
  await page.screenshot({ path: png });
  jpeg(png, join(store, `${p.out}.jpg`), p.w, p.h);
  console.log(`${p.out}.jpg`);
}

await browser.close();
