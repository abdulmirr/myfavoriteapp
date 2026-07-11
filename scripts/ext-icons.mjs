// rasterize the star mark into the extension's icon sizes:
//   node scripts/ext-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const sizes = [16, 32, 48, 128];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">${svg.replace(
      "<svg ",
      `<svg width="${size}" height="${size}" `,
    )}</div></body>`,
  );
  await page.screenshot({
    path: new URL(`../extension/icons/icon${size}.png`, import.meta.url).pathname,
    omitBackground: true,
  });
  console.log(`icon${size}.png`);
}
await browser.close();
