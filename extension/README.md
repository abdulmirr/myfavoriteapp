# Favorite — Chrome extension

Save the page you're on to any of your lists, or favorite it, in one click.

## How it works

- **Connect** (once per browser): the popup opens `myfavoriteapp.com/extension?connect=1`;
  the page mints a personal save token (`create_extension_token` RPC, sha256-hashed
  in `extension_tokens`) and hands it to `content.js` over `window.postMessage`.
  The token lands in `chrome.storage.local`. The web session is never shared —
  Supabase refresh-token rotation would let the two clients sign each other out.
- **Open** (v1.2, migration39): the popup paints from what it remembers
  (`fav:cache` in its localStorage: your lists, and the last page's ticks) before
  anything async answers, so the window opens at its final size with no network
  wait. `extension_state` then refreshes it: you, this page's favorite and
  thought, your lists (newest first, with covers, each marked if this page is in
  it). Rows don't move once painted; a new order shows on the next open.
- **Nothing remote before `load`.** Chrome keeps a popup's window hidden until its
  page stops loading, and any image in flight counts, so one slow cover host
  would hold the popup shut. Every image waits on the `loaded` promise.
- **The page**: the popup reads the active tab (`activeTab`) and pulls its title
  and art from the live page (`scripting`, `grabMeta`). Single-page apps keep the
  head they first loaded with, so tags only count if `og:url` moved with the page;
  YouTube's thumbnail comes from the video id; with no share image, the biggest
  picture on the page. `cleanTitle` drops the site's own name, and unread counts
  from tab titles (never from share tags: "(500) Days of Summer" is the film).
- **Saving** is optimistic: the UI lands first, the RPC follows, and a failure
  rolls back and says so. Writes use `keepalive`, so clicking away (which destroys
  the popup) loses nothing, and they queue per target so a quick tick-untick
  reaches the server in order. Favorite is `extension_save` (the same 300/day
  budget as the app), then a thought via `extension_set_thought`. A list tick is
  `extension_save_to_list` (500/day), and a name typed into "Find or create" is
  `extension_create_list` (public unless you flip the lock, like the app). No
  lists yet → a private "Check later" starter, made on first tick. The database
  sets the type (migration40): a page with a YouTube or Vimeo id is a `video`,
  anything else an `article`, shown as "link".
- **Removals wait 4 seconds**: a second tap is the undo and the row (its Top-four
  pin, its list note) was never touched. Closing the popup sends them. They're
  `extension_unfavorite` and `extension_remove_from_list`.
- **Public pages** are cached, so every write also calls
  `/api/revalidate/extension`. The token proves who's asking, the tags come from
  `extension_pages`, and the route waits 1.5s for the write to land before
  expiring them: the popup may already be gone, and expiring first would only
  cache the old page again.
- Keyboard: ⌘⇧F opens it, type to narrow, ↑↓ to move, ↵ to save, ⌘↵ favorites,
  Esc closes.
- Disconnect every browser at once at `myfavoriteapp.com/extension`.
- Look: the app's v2 design (Inter, neutral dark, the gold star), dark only:
  `StageCover` for the page, `ListCover` for the lists, `CoverGlow` behind it, and
  the app's confirm chime (the speaker in the header turns it off).
- Test: `cd v2 && node scripts/_e2e-extension.mjs`. It ends in a real toolbar
  popup, because a tab can't show Chrome's popup lifecycle: closing mid-save, the
  window's real size, slow covers.

## Install (unpacked, for now)

1. `chrome://extensions` → enable Developer mode
2. "Load unpacked" → pick this `extension/` folder
3. Pin it, hit the star on any page (⌘⇧F / Ctrl+Shift+F also opens it)

## Publishing to the Chrome Web Store

1. `node scripts/ext-zip.mjs` builds the upload zip at the repo root, without
   the dev-only `localhost` matches.
2. Upload it at https://chrome.google.com/webstore/devconsole. Paste-ready listing
   copy is in `store/listing.md`.

Listing images regenerate from the real popup with `node scripts/ext-store-shots.mjs`,
icons from the app mark with `node scripts/ext-icons.mjs`.
