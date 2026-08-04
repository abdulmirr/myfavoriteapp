# Chrome Web Store listing — paste-ready

Everything below maps 1:1 to fields in the developer console
(https://chrome.google.com/webstore/devconsole). Upload
`favorites-extension-v1.0.0.zip` from the repo root, then fill these in.

## Store listing tab

**Name** (comes from the manifest): Favorites

**Summary** (from manifest description): One click and the page you're on
becomes a favorite in your library.

**Detailed description:**

```
Favorites is a home for everything you love — the films, books, albums,
podcasts, and pages that are actually yours. This extension is the fastest
way in: hit the star on any page and it lands in your library.

— One click (or ⌘⇧F / Ctrl+Shift+F) saves the page you're on
— Title, site, and artwork come along on their own
— Add a line on why it's a favorite — that's what makes it yours
— Everything appears instantly in your library at myfavoriteapp.com

The extension does one thing and nothing else. It reads a page only when
you click it, sends nothing until you act, and never sees your browsing
history. Connect it to your Favorites account once; disconnect every
browser at any time from myfavoriteapp.com/extension.
```

**Category:** Productivity → Tools
**Language:** English

**Graphics:**
- Screenshots (1280×800): `extension/store/screenshot-1.jpg`, `extension/store/screenshot-2.jpg`
- Small promo tile (440×280): `extension/store/tile.jpg`

## Privacy tab

**Single purpose description:**

```
Save the page the user is currently viewing to their Favorites library
(myfavoriteapp.com) with one click.
```

**Permission justifications:**

- `activeTab`:

```
Read the URL and title of the tab the user is saving, only at the moment
they click the extension or press its shortcut.
```

- `scripting`:

```
Read the page's own share metadata (og:title, og:image, og:site_name) from
the tab being saved, so the saved item carries the right title and artwork.
Runs only on user action, on the active tab only.
```

- `storage`:

```
Store the personal access token that links this browser to the user's
Favorites account, created when the user explicitly connects the extension.
```

- Host permission `https://myfavoriteapp.com/extension*` (content script):

```
The extension's own connect page. A content script runs only on this page
to receive the account token the user mints there, via postMessage. No
other site is matched.
```

**Remote code:** No, I am not using remote code. (All JS is packaged; the
extension only makes REST calls to our backend.)

**Data usage — check exactly these:**
- ✅ Website content — the URL, title, site name, and preview-image address
  of a page the user explicitly saves, plus the note they type.
- ✅ Authentication information — the personal access token that connects
  the browser to the user's account.
- Everything else: unchecked (no location, history, user activity,
  personal communications, financial/health info, etc.)

**Certifications (check all three):**
- I do not sell or transfer user data to third parties, outside of the
  approved use cases
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes

**Privacy policy URL:** https://myfavoriteapp.com/privacy
(has a "The browser extension" section)

## Distribution tab

- Visibility: Public
- Distribution: all regions

## Account (one-time, if not done)

- Verify the publisher contact email under Account → it must be confirmed
  before you can publish.
