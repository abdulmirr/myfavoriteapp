// Chrome Web Store listing assets:
//   node scripts/ext-store-shots.mjs
// Runs the real popup (popup.html/js/css, with chrome.* and its RPCs stubbed
// and made-up lists) and photographs it inside a minimal browser-window scene,
// plus the promo tiles, all in the app's v2 look (Inter, neutral dark, the gold
// star). Outputs extension/store/screenshot-{1,2}.jpg (1280×800), tile.jpg
// (440×280) and marquee.jpg (1400×560) — rendered @2x, downscaled via sips,
// JPEG because the store forbids alpha.
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

const star = `file://${root}extension/star.svg`;
const inter = `file://${root}extension/fonts/Inter-Latin.woff2`;
const cover = (name) => `file://${root}v2/public/landing/covers/${name}`;

// ---- the popup, for real ----
const PAGE = { title: "How to Do Great Work", site: "paulgraham.com", image: cover("blog-paul-graham.svg"), icon: "" };
const list = (id, title, is_public, count, covers, has = false) => ({
  id,
  title,
  is_public,
  count,
  has,
  cover_image_url: null,
  covers: covers.map(cover),
});
const lists = (saved) => [
  list("1", "Check later", false, 12 + saved.includes(1), ["blog-stratechery.svg", "video-do-more.jpg", "blog-wait-but-why.svg"], saved.includes(1)),
  list("2", "Essays that rewired me", true, 9 + saved.includes(2), ["blog-farnam-street.svg", "blog-marginalian.svg", "blog-pmarca.svg"], saved.includes(2)),
  list("3", "10/10 albums", true, 24, ["album-in-rainbows.jpg", "album-blonde.jpg", "album-rumours.jpg"]),
  list("4", "Watch this weekend", false, 5, ["film-parasite.jpg", "film-whiplash.jpg", "film-her.jpg"]),
  list("5", "Long drives", true, 7, ["podcast-acquired.jpg", "podcast-founders.jpg", "podcast-hardcore-history.jpg"]),
  list("6", "Books to reread", true, 14, ["book-dune.jpg", "book-east-of-eden.jpg", "book-meditations.jpg"]),
];

async function popupShot(browser, name, { saved, favorited }) {
  const ctx = await browser.newContext({ viewport: { width: 368, height: 600 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ PAGE, lists, favorited }) => {
      window.chrome = {
        storage: { local: { get: async () => ({ favToken: "f".repeat(64) }), set: async () => {}, remove: async () => {} } },
        tabs: { query: async () => [{ id: 1, url: "https://paulgraham.com/greatwork.html", title: PAGE.title, favIconUrl: "" }], create() {} },
        scripting: { executeScript: async () => [{ result: PAGE }] },
      };
      const me = { username: "you", name: "You", avatar_url: "" };
      window.fetch = async () => new Response(JSON.stringify({ status: "ok", me, favorited, thought: "", lists }));
    },
    { PAGE, lists: lists(saved), favorited }
  );
  await page.goto(`file://${root}extension/popup.html`);
  await page.waitForTimeout(900); // fonts, covers, the glow's fade
  await page.evaluate(() => document.activeElement?.blur());
  const height = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  const path = join(tmp, `${name}.png`);
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 368, height } });
  await ctx.close();
  return { src: `file://${path}`, height };
}

// ---- the 1280×800 scene ----
const scene = (popup, h1, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Inter"; src: url("${inter}") format("woff2"); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { width: 1280px; height: 800px; background: #171717; overflow: hidden;
  font-family: Inter, sans-serif; display: flex; align-items: center; -webkit-font-smoothing: antialiased; }
.copy { width: 470px; padding: 0 0 0 84px; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 36px; }
.brand img { width: 30px; height: 30px; }
.brand span { font-size: 32px; font-weight: 700; letter-spacing: -0.055em; color: #fff; line-height: 1; }
h1 { font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -0.035em; color: #f5f5f5; }
.sub { margin-top: 18px; font-size: 17px; line-height: 1.6; color: #a3a3a3; }
.stage { flex: 1; display: flex; justify-content: center; }
.window { width: 640px; background: #262626; border: 1px solid #404040; border-radius: 16px; overflow: hidden;
  box-shadow: 0 40px 80px -24px rgba(0,0,0,.6); }
.bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #333; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #404040; }
.url { flex: 1; margin: 0 12px; background: #171717; border-radius: 999px; font-size: 12px; color: #737373; padding: 7px 14px; }
.bar img { height: 17px; }
.page { position: relative; height: 660px; padding: 48px 52px; }
.line { height: 11px; border-radius: 999px; background: #333; margin-bottom: 15px; }
.popup { position: absolute; top: 10px; right: 12px; width: 368px; height: ${popup.height}px; border-radius: 14px; overflow: hidden;
  border: 1px solid #404040; box-shadow: 0 28px 56px -12px rgba(0,0,0,.7); }
.popup img { display: block; width: 100%; }
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
        <div class="popup"><img src="${popup.src}" alt=""></div>
      </div>
    </div>
  </div>
</body></html>`;

// ---- the promo tiles (440×280 small, 1400×560 marquee) ----
const promo = ({ w, h, star: starH, word, tag, gap, text }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Inter"; src: url("${inter}") format("woff2"); font-weight: 100 900; }
* { margin: 0; }
body { width: ${w}px; height: ${h}px; background: #171717; overflow: hidden; -webkit-font-smoothing: antialiased;
  font-family: Inter, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${gap}px; }
.brand { display: flex; align-items: center; gap: ${Math.round(starH * 0.28)}px; }
.brand img { width: ${starH}px; height: ${starH}px; }
.brand span { font-size: ${word}px; font-weight: 700; letter-spacing: -0.055em; color: #fff; line-height: 1; }
.tag { font-size: ${tag}px; color: #a3a3a3; letter-spacing: -0.01em; }
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
    saved: [1],
    favorited: false,
    h1: "Save anything you find to a list.",
    sub: "Read-later, watch-later, 10/10 albums. One click and the page is in, with its title and artwork.",
  },
  {
    out: "screenshot-2",
    saved: [1, 2],
    favorited: true,
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
  const popup = await popupShot(browser, `popup-${s.out}`, s);
  const sceneFile = join(tmp, `scene-${s.out}.html`);
  writeFileSync(sceneFile, scene(popup, s.h1, s.sub));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`file://${sceneFile}`);
  await page.waitForTimeout(400); // fonts
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
