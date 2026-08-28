// Build the Chrome Web Store zip:
//   node scripts/ext-zip.mjs
// Copies extension/ to a temp dir, strips the dev-only localhost matches from
// manifest.json (the repo copy keeps them so "Load unpacked" still works
// against next dev), and zips to favorite-extension-v<version>.zip at the
// repo root. Store listing assets in extension/store/ are excluded.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "extension");

const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
for (const cs of manifest.content_scripts ?? []) {
  cs.matches = cs.matches.filter((m) => !/localhost|127\.0\.0\.1/.test(m));
}

const tmp = mkdtempSync(join(tmpdir(), "fav-ext-"));
const dir = join(tmp, "favorite-extension");
cpSync(src, dir, {
  recursive: true,
  filter: (p) => !/\.DS_Store$|extension\/store(\/|$)|extension\/README\.md$/.test(p),
});
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const out = join(root, `favorite-extension-v${manifest.version}.zip`);
rmSync(out, { force: true });
execFileSync("zip", ["-r", out, "."], { cwd: dir, stdio: "ignore" });
rmSync(tmp, { recursive: true, force: true });
console.log(out);
