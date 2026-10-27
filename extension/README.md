# Favorite — Chrome extension

Save the page you're on to any of your lists, or favorite it, in one click.

## How it works

- **Connect** (once per browser): the popup opens `myfavoriteapp.com/extension?connect=1`;
  the page mints a personal save token (`create_extension_token` RPC, sha256-hashed
  in `extension_tokens`) and hands it to `content.js` over `window.postMessage`.
  The token lands in `chrome.storage.local`. The web session is never shared —
  Supabase refresh-token rotation would let the two clients sign each other out.
- **Save**: the popup reads the active tab (`activeTab`), pulls og:title /
  og:image / og:site_name from the live page (`scripting`), and calls the
  `extension_save` RPC through PostgREST with the anon key + the personal token.
  The RPC validates the token, charges the same 300/day favorites budget as the
  app, dedupes against the library, and inserts a `media_type: "article"` item
  (shown as "link" in the UI).
- **Lists** (v1.1, migration29): on open the popup calls `extension_lists`
  (your lists, newest first, each marked if this URL is already in it, plus
  whether it's already a favorite). Ticking a row calls
  `extension_save_to_list`, unticking `extension_remove_from_list`, and
  "New list" calls `extension_create_list` (public, like the app) and saves
  the page into it. No lists yet → a private "Check later" starter, made on
  first tick, same as the app. Saves charge the app's 500/day save budget.
- Disconnect every browser at once at `myfavoriteapp.com/extension`.
- Look: the app's v2 design (Inter, gray page, white cards), light and dark.
  Test: `cd v2 && node scripts/_e2e-extension.mjs`.

## Install (unpacked, for now)

1. `chrome://extensions` → enable Developer mode
2. "Load unpacked" → pick this `extension/` folder
3. Pin it, hit the star on any page (⌘⇧F / Ctrl+Shift+F also opens it)

## Publishing to the Chrome Web Store

1. Remove the `localhost` / `127.0.0.1` entries from `content_scripts.matches`
   in `manifest.json` (dev-only).
2. Zip the folder: `cd extension && zip -r ../favorites-extension.zip . -x '*.DS_Store'`
3. Upload at https://chrome.google.com/webstore/devconsole ($5 one-time
   developer fee). Listing needs 1–2 screenshots (1280×800) and a 440×280 tile.
4. Justify permissions in the listing: `activeTab`/`scripting` (read the page
   being saved), `storage` (keep the connection token).

Icons regenerate from the app mark with `node scripts/ext-icons.mjs`.
