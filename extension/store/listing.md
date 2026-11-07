# Chrome Web Store listing — paste-ready

Everything below maps 1:1 to fields in the developer console
(https://chrome.google.com/webstore/devconsole). Upload
`favorite-extension-v1.2.1.zip` from the repo root (v1.2.1 is the redesigned popup — upload it as a new version of the existing item; its permissions haven't changed), then fill these in.

## Store listing tab

**Name** (comes from the manifest): Favorite

**Summary** (from manifest description): Save the page you are on to any of
your lists, or favorite it, in one click.

**Detailed description:**

```
Favorite is where you keep what's worth your time — the films, books,
albums, podcasts, and pages you find. This extension is the fastest way
in: open it on any page and save it to a list, or make it a favorite.

— Opens instantly on your lists, covers and all (⌘⇧F / Ctrl+Shift+F)
— One click drops the page into a list (Check later, Watch this weekend,
  10/10 albums…); one more takes it out
— Type to find a list, or name a new one and press Enter
— One click favorites the page, then add a thought if you like
— Title, site, and artwork come along on their own, tidied up
— Everything lands on your page at myfavoriteapp.com

The extension does one thing and nothing else. It reads a page only when
you click it, sends nothing until you act, and never sees your browsing
history. Connect it to your Favorite account once; disconnect every
browser at any time from myfavoriteapp.com/extension.
```

**Category:** Productivity → Tools
**Language:** English

**Graphics:**
- Store icon (128×128): `extension/store/store-icon.png` (96px star centered,
  transparent — Chrome's recommended 16px padding)
- Screenshots (1280×800): `extension/store/screenshot-1.jpg`, `extension/store/screenshot-2.jpg`
- Small promo tile (440×280): `extension/store/tile.jpg`
- Marquee promo tile (1400×560): `extension/store/marquee.jpg`
- Promo video: leave blank (optional; only used if the store features the item)

**Additional fields:**
- Official URL: pick `myfavoriteapp.com` if it's verified in Google Search
  Console on this account; otherwise leave "None" (it's optional)
- Homepage URL: `https://myfavoriteapp.com`
- Support URL: `https://myfavoriteapp.com/extension`

## Privacy tab

**Single purpose description:**

```
Save the page the user is currently viewing to their Favorite account
(myfavoriteapp.com) — into one of their lists, or as a favorite — with one
click.
```

**Permission justifications:**

- `activeTab`:

```
Read the URL and title of the tab the user is saving, only at the moment
they click the extension or press its shortcut.
```

- `scripting`:

```
Read the title and preview image of the tab being saved (its share metadata,
or the largest image on the page if it has none), so the saved item carries
the right title and artwork. Runs only on user action, on the active tab only.
```

- `storage`:

```
Store the personal access token that links this browser to the user's
Favorite account, created when the user explicitly connects the extension.
The token is also what lets the popup show the user's own lists.
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
