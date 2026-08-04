// Chrome Web Store listing assets:
//   node scripts/ext-store-shots.mjs
// Renders the real popup (real popup.css + fonts, state forced per shot)
// inside a minimal browser-window scene, and the promo tile. Outputs
// extension/store/screenshot-{1,2}.jpg (1280×800) and tile.jpg (440×280) —
// rendered @2x, downscaled via sips, JPEG because the store forbids alpha.
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
const cover = `file://${root}public/landing/covers/blog-paul-graham.svg`;

// ---- popup states (real markup + real stylesheet, no scripts) ----
const popupBody = (state) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${css}"></head><body>
<header><img src="${star}" alt="" class="mark"><span class="wordmark">Favorites</span></header>
<section id="form">
  <div class="preview">
    <div class="thumb"><img src="${cover}"></div>
    <div class="meta">
      <input id="title" type="text" value="How to Do Great Work" spellcheck="false">
      <div class="site">paulgraham.com</div>
    </div>
  </div>
  <textarea id="thoughts" rows="3" placeholder="Your thoughts — why is this a favorite?">${
    state === "saved" ? "The essay I send to everyone who is starting something." : ""
  }</textarea>
  <div class="actions">
    <button id="save" class="primary"${state === "saved" ? " disabled" : ""}>
      <img src="${star}" alt="" class="btn-mark">
      <span>${state === "saved" ? "Favorited" : "Favorite"}</span>
    </button>
    <span id="status"${state === "saved" ? ' class="ok"' : ""}>${
      state === "saved" ? "Added to your library." : ""
    }</span>
  </div>
</section>
</body></html>`;

// ---- the 1280×800 scene ----
const scene = (popupSrc, popupH, h1, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Geist Mono"; src: url("file://${root}extension/fonts/GeistMono-Regular.ttf"); font-weight: 400; }
@font-face { font-family: "Geist Mono"; src: url("file://${root}extension/fonts/GeistMono-SemiBold.ttf"); font-weight: 600; }
* { margin: 0; box-sizing: border-box; }
body { width: 1280px; height: 800px; background: #f4f4f5; overflow: hidden;
  font-family: "Geist Mono", monospace; display: flex; align-items: center; }
.copy { width: 460px; padding: 0 0 0 84px; flex-shrink: 0; }
.copy img { height: 30px; margin-bottom: 28px; }
h1 { font-size: 36px; line-height: 1.35; font-weight: 600; color: #18181b; }
.sub { margin-top: 18px; font-size: 13px; line-height: 1.7; color: #71717a; }
.stage { flex: 1; display: flex; justify-content: center; }
.window { width: 600px; background: #fff; border: 1px solid #e4e4e7;
  box-shadow: 0 32px 64px rgba(24,24,27,.08); }
.bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f4f4f5; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #e4e4e7; }
.url { flex: 1; margin: 0 12px; background: #f4f4f5; font-size: 11px; color: #a1a1aa;
  padding: 6px 12px; }
.bar img { height: 15px; }
.page { position: relative; height: 620px; padding: 44px 48px; }
.line { height: 11px; background: #f4f4f5; margin-bottom: 14px; }
.popup { position: absolute; top: 10px; right: 10px; width: 340px; height: ${popupH}px;
  border: 1px solid #e4e4e7; box-shadow: 0 24px 48px rgba(24,24,27,.16); background: #fff; }
.popup iframe { width: 100%; height: 100%; border: 0; }
</style></head><body>
  <div class="copy">
    <img src="${star}" alt="">
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
        <div class="line" style="width:38%;height:16px;margin-bottom:26px"></div>
        ${Array.from({ length: 14 }, (_, i) => `<div class="line" style="width:${[92, 88, 95, 60, 0, 90, 94, 86, 91, 55, 0, 93, 89, 64][i]}%"></div>`).join("")}
        <div class="popup"><iframe src="${popupSrc}"></iframe></div>
      </div>
    </div>
  </div>
</body></html>`;

// ---- the 440×280 tile ----
const tile = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Geist Mono"; src: url("file://${root}extension/fonts/GeistMono-Regular.ttf"); font-weight: 400; }
@font-face { font-family: "Geist Mono"; src: url("file://${root}extension/fonts/GeistMono-SemiBold.ttf"); font-weight: 600; }
* { margin: 0; }
body { width: 440px; height: 280px; background: #101010; overflow: hidden;
  font-family: "Geist Mono", monospace; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px; }
img { height: 54px; }
.word { font-size: 15px; font-weight: 600; letter-spacing: .22em; color: #fbfbfa; }
.tag { font-size: 10px; letter-spacing: .04em; color: #a1a1aa; }
</style></head><body>
  <img src="${star}" alt="">
  <div class="word">FAVORITES</div>
  <div class="tag">One-click save to your library</div>
</body></html>`;

const SHOTS = [
  {
    out: "screenshot-1",
    state: "form",
    h1: "One click, and the page you're on becomes a favorite.",
    sub: "Hit the star on anything worth keeping. Title and artwork come along on their own.",
  },
  {
    out: "screenshot-2",
    state: "saved",
    h1: "Add your why. It's what makes it yours.",
    sub: "⌘⇧F opens it from any page. Everything lands in your library at myfavoriteapp.com.",
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
  await page.goto(`file://${stateFile}`);
  const popupH = await page.evaluate(() => document.body.scrollHeight);

  const sceneFile = join(tmp, `scene-${s.out}.html`);
  writeFileSync(sceneFile, scene(`file://${stateFile}`, popupH, s.h1, s.sub));
  await page.goto(`file://${sceneFile}`);
  await page.waitForTimeout(400); // fonts + iframe
  const png = join(tmp, `${s.out}.png`);
  await page.screenshot({ path: png });
  jpeg(png, join(store, `${s.out}.jpg`), 1280, 800);
  console.log(`${s.out}.jpg`);
}

const tileFile = join(tmp, "tile.html");
writeFileSync(tileFile, tile);
await page.setViewportSize({ width: 440, height: 280 });
await page.goto(`file://${tileFile}`);
await page.waitForTimeout(300);
const tilePng = join(tmp, "tile.png");
await page.screenshot({ path: tilePng });
jpeg(tilePng, join(store, "tile.jpg"), 440, 280);
console.log("tile.jpg");

await browser.close();
