# Favorite v2 — redesign plan

Status: **approved, building** (answers 2026-10-26).
Design base: [antislop.xyz](https://antislop.xyz). The current site at the repo root stays exactly as it is; all new work happens in this `v2/` folder.

## Decisions (Abdul, 2026-10-26) — these override anything below

1. **Daily picks:** one AI pick per unlocked category (album, book, film/show, read/listen), topped up to five with community picks.
2. **Lists are playlists.** Expect lists like "Fiction books that made me cry" or "10/10 albums".
   - Every list can be public or private; the choice lives on the create control and in Edit list.
   - New lists default to public, since they're made to share. The auto-created "Check later" list and migrated Saved-for-later default to private.
   - Lists keep an owner-controlled order (rankings matter).
   - Item pages show the public lists a work appears in.
3. **Object frames:** keep the vinyl and page-edge looks if they sit well in the new design; drop them only if they clash. Judge visually against flat covers.
4. **Preview:** localhost first. v2 runs at `http://localhost:3000`. Since 2026-10-27 there is also a Vercel preview at https://myfavoriteapp-v2.vercel.app (see "Swapping v2 in" below).
5. **AI picks model (2026-10-27):** Sonnet 5.5, because cost matters.
6. **Sounds stay.** Load them lazily so they never compete with covers.
7. **Three pages (2026-10-27, third batch):** Home · Feed · **Friends**. Feed is discovery; Friends is your people — their activity, your notifications (the bell is gone), people with your taste, and Invite a friend. The profile keeps two tabs (Favorites, Lists); the Activity tab folded into Friends, and the Feed's Following filter went with it.
8. **Lists are playlists and queues (2026-10-27):** numbered rows, drag to reorder (no Reorder button), ○ to mark something finished with "Favorite?" to favorite it, and + Add on your own list.
9. **One link, one work (2026-10-28):** two people saving the same address (any spelling of it) are saving the same work. The database owns the rule (`url_work_key`, migration32).
10. **Header (2026-10-28):** Home · Feed · Friends centered; on the right ＋, your avatar (→ your page) and antislop's arrow, which opens your lists, Settings, the theme and Log out.

Environment notes:
- The Xcode license is accepted (2026-10-27, through a macOS admin dialog), so git works.
- The Vercel CLI is logged into `abdulmirr`; the `.env.local` VERCEL_TOKEN is dead (403).

---

## 0. The short version

- **Look:** antislop's design system, copied faithfully:
  - a light gray page (`gray-100`) with white rounded cards (hairline border, 4% shadow), the Inter typeface, and dark/gray pill navigation
  - gray square icon buttons
  - antislop's signature "tab" strips that tuck under the top of a card (a one-line note) or under its bottom (navigation, people)
  - full dark mode
  - logo: the gold ★ next to a `favorite` wordmark.
- **Shape of the product:** Favorite stops being a page you fill once and becomes a place you come back to:
  - **Home** is today's picks in antislop's daily-links layout. It shows one pick per category instead of three.
  - **Feed** is antislop's Archive. It's a masonry of everything people love on Favorite, and each card ends with the people you follow who favorited or saved it.
  - **Lists** work like antislop's lists: a "Check later" list plus your own lists. They replace Saved-for-later.
  - **Profile** is antislop's account page with a third tab, your **Favorites** wall, so friends' libraries stay front and center.
- **Two verbs on every card:** 🔖 **Save** (to a list: "I want to check this out") and ★ **Favorite** (to your wall: "this is me"). Lists feed the library. You save something, watch, read or listen, then tap ★.
- **Speed:** today's site feels slow mostly because of things it does on purpose:
  - 700 ms fade-ins on every page
  - an intro animation on profiles
  - a home page rendered fresh on every request
  - a client-side chain of auth → profile → feed before anything shows
  - a third-party font stylesheet that blocks rendering.

  v2 fixes this in four ways:
  - pages ship as cached static shells from the edge
  - covers come straight from their CDNs with the first row prioritized
  - repeat visits paint instantly from a local cache
  - the last pages stay alive, so Back is instant.

---

## 1. What I learned from antislop

Scraped and rendered in real Chromium: Home, Archive, Newsletter, Login, your profile `/builtbyabdul`, its Lists tab, and both list pages. I captured desktop and phone, light and dark, plus the hydrated DOM, network logs and JS bundles. The logged-in UI (save dialog, list editor, account menu) was read out of their bundles.

### 1.1 Page anatomy

| Surface | What it is |
|---|---|
| **Header** (every page) | Sticky, same color as the page. Wordmark on the left. Pills on the right: `Home · Archive · Newsletter`, then `Log in` or your avatar menu. The active pill is `gray-900`/white; the others are `gray-200`. Pills are `rounded-xl px-3 py-1.5 text-sm font-semibold`. Phones hide the Home pill (the logo is home). |
| **Home** `/` | Centered `max-w-xl` column. **Headline** (typewriter, 75 ms per character): "Happy Monday, {first name, or 'thinker'}!" **Subtitle** (typewriter, 55 ms): "Here are today's handpicked links..." On Saturday it's "…the best links from this week..." and on Sunday "…five links from the archive...". On phones the headline shrinks to fit one line. **Five cards** follow; each has these parts: <br>• a **note tab** (gray-50 strip tucked 16 px under the card's top) with a one-line curator blurb <br>• a 16:9 image <br>• the title with a ↗ icon <br>• "Creator · Mon YYYY" / "Type · N mins" with a bookmark button <br>• a divider, then "**Key highlight:**" and a quote in a yellow highlight. <br>Tweets render as tweet cards. **Closing line:** "That's it. No algorithm. No infinite feed. / Five links. Here today, gone tomorrow." |
| **Archive** `/archive` | `max-w-[1400px]`. Typewriter headline "Looking for something?" over a search field ("Let us know what's on your mind...", dark square submit), which searches server-side via `/api/archive/search`. **Masonry:** items are dealt round-robin into N columns, so nothing ever reflows across columns. **Card:** white, `rounded-lg shadow-sm p-4`, with the image at its **natural aspect ratio** (`width:100%; height:auto`, nothing cropped) on a gray-200 placeholder. With no image it shows a black 16:9 title card ("Title / by Creator"). Plus a "New" badge, the title (underlined on hover), meta lines and a bookmark. **Loading:** infinite scroll with a 400 px look-ahead, and the number of pages loaded is remembered in sessionStorage so Back returns you to the same depth. The skeleton is pulsing cards of varied heights. |
| **Profile** `/{user}` | `max-w-2xl`. **Header card:** squircle avatar (`rounded-[30%]`, 64 px), name (2xl semibold), @handle. Under it, a **nav drawer** (gray-50 strip tucked under the card's bottom) holds a segmented control: `⟲ Activity · ☰ Lists`. **Activity** is a stack of cards. Each has a tab ("‹avatar› Abdul added to Check Later… · 8 Oct 2026") and a horizontal card (thumbnail left, title and meta right, bookmark bottom-right). It infinite-scrolls via `/api/profiles/{u}/activity?before=`. |
| **Lists** `/{user}/lists` | A 2-column grid of list cards: a 16:9 cover (uploaded, or the latest item's), the title, "1 link · Public", "Updated 8 Oct 2026". |
| **List** `/{user}/lists/{slug}` | **Header card:** title, "by @user", "1 link · Public", "Last updated…", and a Share button top-right that flips to "Copied". **Owner tools:** an *Edit list* dialog (title, description, URL slug, cover image ≤2 MB, Private switch, "show when added" switch, Delete with confirmation) and *Add link*. Items render as activity cards ("Abdul added on 8 Oct 2026…"). The empty state reads "This list is empty." |
| **Save dialog** | Title: "Save ‘Title’ to…". An inline "+ New list" control (name, lock toggle, create). Each row shows a 16:9 list thumbnail, the list name, "N links · Public/Private · Add note" and a checkbox (gray-900 when on). There's an optional note per list (280 characters, with a counter). Changes are staged and committed together. |
| **Account menu** | Avatar ▾ → Profile, Settings, Dark/Light mode, Log out. |
| **Message bubble** | A fixed dark circle at the bottom-right. It opens a small form: Topic (Bug / Idea / Submission / Other), Message ("A link, a bug, or an idea"), email. Confirmation: "We'll reply via email shortly." |
| **Login** | A card titled "Welcome back": Continue with Google, *or*, Email, Password (Forgot?), Cloudflare Turnstile, Log in. Footer: "Don't have an account? Sign up". |

### 1.2 Design tokens (exact values from their CSS)

- **Page:** `bg-gray-100` (#f3f4f6). Dark: `neutral-900` (#171717).
- **Card:** `bg-white border border-gray-200 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.04)]`. Dark: `bg-neutral-800 border-neutral-700`.
- **Tabs and drawers:** `bg-gray-50 border-gray-200`.
  - Top tab: `mx-2 -mb-4 rounded-t-2xl border-b-0 px-4 pt-2.5 pb-[26px]`.
  - Bottom drawer: `-mt-4 rounded-b-2xl border-t-0 px-2 pt-6 pb-2`.
- **Type:** Inter (variable), with Geist Mono available.
  - Headlines: 32→40 px, semibold, `tracking-tight`, gray-900.
  - Card titles: base→lg semibold.
  - Meta text: sm/xs gray-500. Body text: sm gray-600.
- **Controls:**
  - Pills (above).
  - Icon buttons: `size-9 rounded-lg bg-gray-200 hover:bg-gray-300` with 14 px lucide icons.
  - Fields: `h-10 rounded-lg bg-gray-200 border-0 text-sm font-medium`, gray-900 focus ring.
  - Labels: `text-xs font-semibold text-gray-500`.
  - Primary button: `h-10 rounded-lg bg-gray-900 text-white`. Quiet button: `bg-gray-200`.
  - Dialog: the card style with a `text-lg font-semibold` title.
- **Media:** `rounded-md` on a `bg-gray-200` placeholder. Avatars are squircles. Highlights use `bg-yellow-200 px-0.5`.
- **Motion:** almost none: 150 ms color transitions, the typewriter headlines and pulsing skeletons. No page fades.
- **Stack:** Next.js on Vercel, Tailwind v4 with shadcn/Radix primitives, lucide icons, SWR, Supabase.

### 1.3 Why antislop feels instant (measured, one cold run each from this Mac)

| | First paint | Notes |
|---|---|---|
| antislop Home | **0.31 s** | Static HTML from Vercel's edge cache (`x-vercel-cache: HIT`). |
| antislop Archive | **0.48 s** | Skeleton immediately. The first covers arrive around 0.9 s. |
| antislop Profile | **0.50 s** | Rendered per request; the data is in the HTML. |

1. **HTML from the edge.** Pages are prerendered and served from Vercel's CDN (60–160 ms to first byte). Fonts are self-hosted and preloaded; no third-party CSS sits on the critical path.
2. **Nothing animates in.** Content paints the moment it arrives. While waiting, skeletons already have the real layout's shape. The typewriter headline never blocks the cards below it.
3. **Prefetch plus cache.** Every visible link is prefetched, so clicks render immediately. Data lives in an SWR cache, so coming back to a page is instant.
4. **Covers are plain `<img>` from their source CDN** (no image-proxy hop). The first four load at high priority, the rest lazily, each on a gray placeholder at its natural ratio.
5. **The whole archive is one cached query.** It's rendered progressively, and your scroll depth is restored on Back.

---

## 2. What I found in Favorite today

### 2.1 Surfaces

- **`/` signed out:** the landing page ("Your taste, in one place.").
- **`/` signed in:** Home with three feeds.
  - **For You:** AI picks, *three per unlocked category* (Music, Books, Film & TV, Reading), plus "From your wall".
  - **Friends:** follows' favorites merged with notifications.
  - **Explore:** search, people, recent favorites.
- **`/{user}`, the wall.**
  - **Sidebar:** identity, Follow, Approve taste, socials, share, search, categories, Grid/Freeform, size slider, Favorite button.
  - **Grid:** Top four, then the grid with the object frames (vinyl, book page edges, poster frame, polaroid, TV bezel) and drag-to-reorder.
  - **DetailOverlay:** favorite with thoughts, save for later, pin, copy link, report, "Favorited by…".
  - **Saved shelf** (`?shelf=saved`, private).
- **Other pages:**
  - **`/item/…`:** everyone who favorited a work.
  - **`/add`**
  - **`/welcome`:** claim → picks → import → people → reveal.
  - **`/profile`:** settings — profile, links, taste note, email, appearance, import/export, extension, danger zone.
  - **`/signin`** and **`/auth/*`**
  - **`/extension`**, **`/privacy`**, **`/terms`**
  - **`/recap`:** unlinked.

### 2.2 Why it feels slow (measured, then confirmed in the code)

| | First paint | What happens next |
|---|---|---|
| `/` (landing / Home) | **~1.8 s** | `force-dynamic`, so it's rendered on every request and never served from the edge cache. |
| `/abdulmir` | 0.58 s | The wall is in the HTML but **invisible until JS loads**. Then it fades in over 0.7 s, after a ~2.8 s intro animation on the first visit. |
| `/explore` | 0.36 s | Data is fetched after hydration (covers start at 1.1 s), then a 0.7 s fade. |

1. **Fades on every page.** Home, Explore and the Library start at `opacity-0` and fade in over **700 ms**, even when everything is ready.
2. **Intro and morph animations.** Profiles play an intro overlay of about 2.8 s (10 cover flashes). Opening any item runs a 560 ms morph.
3. **Signed-in Home waterfall.** It renders a **blank white screen** until a serial client chain finishes: session → profile → onboarding check. Then it fades in. Then follows → feed query → covers.
4. **For You blocks on generation.** It asks `/api/recommendations` on every visit. The first load each day waits on a 20–60 s AI generation ("the first load takes a minute…").
5. **Covers pop in.** They have no placeholder, and a profile renders all of its tiles (~210 for yours) up front.
6. **Extra page-load weight.** A third-party font stylesheet (Fontshare) blocks rendering, and **5 sound files** download on every page.

### 2.3 Data today

- **People:** 102 profiles and 72 follows.
- **Favorites:** 1,119 favorites covering 818 distinct works, 132 of them favorited by two or more people.
- **Thoughts:** 373 favorites carry a thought, about 300 of them one-liners. That's perfect antislop-style note material ("The split psyche as an office job.").
- **Saved-for-later:** 86 rows from 4 people.
- **Collections:** 0.

At this size the entire feed fits in one cached response, which is antislop's trick.

---

## 3. The new Favorite

### 3.1 Two verbs and the loop

- 🔖 **Save → lists.** This is the everyday, low-commitment action. "Check later" is created automatically on your first save; make more ("Watchlist", "Summer reads"), public or private, with an optional note per item.
- ★ **Favorite → your wall.** This is the identity verb, and still the only social verb (no likes). Thoughts are optional. Provenance ("via @sam") and the notifications keep working exactly as today.
- **The loop:** discover on Home or Feed → 🔖 Save → watch, read or listen → ★ Favorite. On a list, ★ is the "loved it" button. That's how the library stays alive instead of being filled once and forgotten.
- **Placement:** every card everywhere carries both buttons, bottom-right: **[🔖] [★]**.
  - Tap ★ and the piece is favorited instantly. The star turns gold and a small toast offers "Add a thought". Tapping again removes it, with Undo.
  - Tap 🔖 to open the Save dialog.

### 3.2 Header and navigation

```
desktop  ★ favorite                     [Home] [Feed]  [＋] [🔔•] [◐ ▾]
signed out ★ favorite                   [Home] [Feed]  [Log in]
phones   ★ favorite             [Feed] [＋] [🔔] [◐]       (logo = home, like antislop)
```
- **＋ Add:** search books, films, music and podcasts, or paste a link, add a video or upload a photo. It ends in ★ Favorite or 🔖 Save to….
- **🔔 Notifications popover:** follows, "favorited via you" and taste approvals, with an unread dot. This replaces the Friends tab's notification stream.
- **Avatar menu ▾:** Your profile · Your lists · Settings · Dark mode · Log out.
- **Message bubble** (bottom-right): feedback that lands in your inbox.

### 3.3 Home: today's picks

- **Headline:** "Happy Monday, Abdul!" Signed out, it reads "Happy Monday, friend!" Typewritten, auto-fit on phones.
- **Subtitle** (typewriter, varies by day):

  | Day | Signed in | Signed out |
  |---|---|---|
  | Weekdays | "Here are today's picks, chosen for you..." | "Here are today's favorites from the community..." |
  | Saturday | "Here's something for the weekend..." | |
  | Sunday | "Here are today's picks — take your time..." | |
- **Five cards**, matching antislop's five links:
  - **Signed in:** **one AI pick per unlocked category** (an album, a book, a film or show, a read or listen). That's the "3 → 1" change. The set is topped up to five with community picks. *(Confirm Q1.)*
  - **Signed out, or not enough favorites yet:** five **community picks**. These are real favorites with real thoughts, rotated daily, one per medium where possible. The current landing page retires; the product itself is the pitch, like antislop.
- **Card anatomy** (antislop's, adapted):
  - **Tab:** for AI picks, a one-line hook written by the model ("Quiet devastation, perfectly paced."). For community picks, the person's thought: “The split psyche as an office job.” — @handle. A small ✕ at the tab's right edge means *Not for me* (AI picks only; it feeds the engine like today's "pass").
  - **Media:** antislop's 16:9 box, but **covers are never cropped**. The cover sits centered at full height over a soft blurred enlargement of itself. Images that are already wide (videos, articles) fill the box.
  - **Title and meta:** title + ↗ (opens the source: Apple Music, TMDB…), "Creator · Year", "Album"/"Book"/"Film"…, and **[🔖] [★]**.
  - **Bottom section:** "**Why it's for you:**" + the model's reason in the yellow highlight (antislop's "Key highlight:"). Community picks show "Favorited by sam, alex and 3 others" instead.
- **Closing line:** "That's it. Five picks, chosen for you. / Here today, gone tomorrow."
- **Engine:**
  - A new `daily_picks` table; v1's `recommendations` is untouched.
  - The model returns a hook and a reason per pick.
  - **Tomorrow's set is generated in the background right after today's loads,** so mornings open instantly instead of waiting a minute.
  - Model: the latest Sonnet. I'll verify the id and params against the Claude API reference before touching the code.

### 3.4 Feed (antislop's Archive)

- **Search:** the headline "Looking for something?" (typewriter) sits over a search field ("Search books, films, music, people…"). Results render in the same masonry, in this order: people, matching favorites, catalog results.
- **Filters:** quiet type pills under the search: All · Music · Books · Film & TV · Podcasts · Links · Videos.
- **Contents and order:** **every work people have favorited on Favorite**, one card per work (818 today; personal photos stay on profiles).
  1. What people you follow favorited or saved recently comes first.
  2. Then everything else, by most recent favorite.
  3. Works you've already favorited sink to the bottom.
- **Card:** antislop's archive card.
  - The cover is shown at its **natural aspect ratio**, so posters, albums and book jackets are never cropped.
  - "New" badge (first favorited in the last 3 days), title, "Creator · Year", type, **[🔖] [★]**.
  - With no image, antislop's black title card.
- **New, the people drawer:** under every card sits the same tucked-under strip antislop uses below its profile header. It shows stacked avatars plus the people you follow who have it: "Favorited by sam, alex & 2 more you follow" / "Saved by jo".
  - If none of your follows have it, the drawer falls back to "Favorited by @ali" or "Favorited by 4 people". That way its height never jumps once your follows load.
  - Names link to profiles.
- **Columns:** 4 on wide screens, then 3 → 2 down to phones. On phones I'll test 2 columns against 1; covers may read better at 2.
- **Scrolling:** infinite scroll, with your depth restored on Back.
- **People row:** if you follow fewer than 5 people, a "People with taste like yours" row sits above the masonry. It uses today's taste-overlap ranking.

### 3.5 Profile (antislop's account page plus your library)

- **Header card:**
  - squircle avatar, name, @handle, bio
  - **social icons** (X, Instagram, Spotify/Apple Music, Pinterest, website)
  - one stats line: "213 favorites · 16 followers · 17 following" (the counts open a people dialog)
  - visitors also see "You share 12 favorites — mostly music".
- **Actions** (top-right, like antislop's Share):
  - Your profile: **[Edit profile] [Share]**.
  - Someone else's: **[Follow]** (dark) / [Following] (gray), **[Share]**, and **[⋯]** for Approve their taste, Block and Report.
- **Tab drawer:** **★ Favorites · ☰ Lists · ⟲ Activity**. Favorites is the default; a profile is still a library first.
- **Favorites tab**, where the library blends in:
  - The **Top four** row.
  - Type pills: All · Music · Books · Film & TV · ….
  - **The wall:** a masonry of covers that **keeps today's object frames** (vinyl peeking from the sleeve, book page edges, the poster in its snap frame, polaroid, TV bezel) on the new page, with title and creator under each.
  - Owners can drag to reorder on desktop, using today's logic.
  - Clicking opens the item page with that person's thought first. *(Q3)*
- **Lists tab:** antislop's 2-column list cards. Visitors see public lists only.
- **Activity tab:** antislop's activity cards for both verbs, in one newest-first stream:
  - "Abdul favorited · 8 Oct", with their thought shown in the card.
  - "Abdul added to Check later… · 8 Oct", public lists only.
- **URLs:** `/abdulmir`, `/abdulmir/lists`, `/abdulmir/lists/check-later`, `/abdulmir/activity`. Old `?item=` and `?shelf=saved` links redirect.

### 3.6 Lists and the Save dialog (antislop's, adapted)

- **Save dialog:** identical behavior to antislop's: staged changes, inline New list with the lock, a per-list note.
- **List page:**
  - The header card + Share.
  - Owners get the *Edit list* dialog (title, description, URL, cover image, Private switch, show-added-dates switch, delete) and **+ Add** (search or paste a link).
  - Items are antislop's horizontal activity cards with the note inside and **[🔖] [★]**.
- **Migration and privacy:**
  - Today's Saved-for-later migrates into each owner's **private** "Saved for later" list.
  - New lists default to **Public**, like antislop, so friends' cards can say "Saved by…". The lock makes a list private. *(Q2)*

### 3.7 Item page

- **Route:** `/item/…` already exists and gets restyled.
- **Layout:**
  - **Header card:** cover, title ↗, meta, **[★ Favorite] [🔖 Save] [Share]**.
  - **Drawer:** who you follow that has it.
  - **Below:** everyone's thoughts as activity cards ("@sam favorited · 8 Oct" with their thought).
- **Links:** card covers and titles link here (prefetched, so it opens instantly). The ↗ beside a title goes straight to the source, like antislop.
- **Your own favorite:** edit your thought, pin it to Top four or remove it, right on this page. This replaces the full-screen overlay.
- **Works without a canonical id** (links, photos, videos) live at `/item/fav/{id}`.

### 3.8 Everything else

- **Add dialog (＋):** today's add flow (catalog search, link, video, photo upload, manual entry) in antislop's dialog style.
- **Settings:** moves to `/settings`, and the old `/profile` redirects there. Same sections as today, in antislop's form style.
- **Sign in:** antislop's "Welcome back" card (Google + email/password, Forgot?). The auth flow itself is unchanged.
- **Onboarding `/welcome`:** the same five beats, restyled. Finishing also creates "Check later" and lands on Home.
- **Feedback bubble:** Topic + message (+ email if signed out) → a `feedback` table → emailed to you through the existing Resend setup.
- **Privacy, terms, extension, 404, error:** restyled. OG share images and emails stay unchanged for now.

### 3.9 Phones and dark mode

- **Phones:**
  - Every page is designed at 390 px first.
  - The Home pill hides and headlines auto-fit.
  - Cards stack, activity cards put the thumbnail on top, and the tab and drawer strips keep their tuck.
- **Dark mode:** antislop's neutral-900/800 palette, following the system by default with a toggle in the avatar menu. It applies before paint, so there's no flash.

### 3.10 What v2 leaves behind (it all stays in v1)

- **Library tools:** Freeform view, the size slider, the intro overlay, the morph overlay.
- **Pages and polish:** the landing page and sound effects.
- **Home tabs:** For You, Friends and Explore fold into Home, Feed, profiles and the bell.
- **Shelves:** Collections, replaced by lists.
- **Rediscover:** "From your wall" is gone.

---

## 4. Architecture

### 4.1 Folder and isolation

- **What's in `v2/`:** a complete Next.js app. I copy the root app in, then rebuild every page and component. The root app is untouched and keeps serving myfavoriteapp.com.
- **Keeping v1's build safe:** `v2/` goes into the root `tsconfig.json` exclude, the `eslint.config.mjs` ignore list and `.vercelignore`. The repo-wide TypeScript include broke a prod deploy once before; v1's build must never type-check v2.
- **Running locally:** v2 has its own `node_modules` and runs on **:3000**. Supabase Auth's redirect allowlist has `localhost:3000` but not `:3001`, so on `:3001` Google sign-in sent people to the live site.
- **Deploying:** a second Vercel project with Root Directory `v2` → a preview URL → domain swap when you say so *(Q4)*.
  - Sessions live in localStorage per domain, so the preview needs its own sign-in. At the swap, users stay signed in.

### 4.2 Database (additive only, so v1 keeps working)

- **`lists`:** title, slug, description, public/private, cover image, show-added-dates.
- **`list_items`:** a snapshot of the work (type, title, creator, image, link, canonical id), a note of up to 280 characters, and provenance. Owners write; public lists are world-readable. Both tables get the existing daily write-budget triggers.
- **`daily_picks`:** per profile, per local day, with a hook and reason per pick.
- **`feedback`.**
- **Feed function:** one SQL function that returns each distinct work with the ids of its favoriters and its public-list savers. Personalization (your follows) is applied on the client from that public data, so the cached response is the same for everyone.
- **Backfill:** Saved-for-later → private "Saved for later" lists. It's idempotent, and I'll re-run it at launch so saves made in v1 meanwhile come along.
- **Reserved usernames:** add `feed`, `lists`, `list`, `activity`, `saved`, `today`, `login`… None of these are taken today.

### 4.3 Performance

1. **Next 16 Cache Components.**
   - Public data (profiles, walls, lists, item pages, the feed, community picks) is cached on the server with tags, so pages ship as static shells from the edge, with covers in the HTML.
   - Writes refresh the affected cached pages right away.
   - Every route exports Next's `unstable_instant` check, so a slow navigation fails the build instead of reaching users.
2. **A personal layer loaded once.** Who you follow, what you've favorited and saved, and your unread count load once per session into a client store kept in localStorage. Repeat visits paint instantly. Cards render with public data first and light up without layout shift.
3. **No entrance fades, intros or morphs.** Skeletons are shaped like the real layout.
4. **Covers:**
   - plain `<img>` straight from the source CDNs
   - right-sized variants (the existing `coverSrcSet`)
   - the first row preloaded at high priority, the rest lazy
   - a reserved aspect-ratio box per medium on a gray placeholder, so nothing pops or shifts.
5. **Fonts and sound:** Inter and Geist Mono are self-hosted via next/font; Fontshare is gone. No sound files.
6. **Prefetch and instant Back:** links prefetch, and Next keeps the last 3 pages alive, so Back is instant with scroll intact.
7. **A small bundle:** Radix dialog/menu primitives plus lucide icons (antislop's stack). No framer-motion.
8. **Target:**
   - first paint under 0.5 s
   - first cover under 1 s
   - in-app navigation that feels immediate.

   I'll measure against antislop with the same Playwright harness used for this analysis.

### 4.4 Reused vs rebuilt

- **Reused** (copied as-is, then adapted where the plan says):
  - the Supabase schema and RLS
  - auth flows
  - search sources and `/api/search`
  - `/api/og`
  - the importers
  - the recommendation engine core
  - the social layer (follow, block, approve, provenance, notifications)
  - the extension backend
  - emails.
- **Rebuilt:** every page and component.

---

## 5. Build order and how I'll verify it

1. **Foundation:** set up v2, the design tokens, and the primitives (header, pills, cards, tabs and drawers, dialogs, fields, avatars, covers, skeletons, icon buttons), plus dark mode.
2. **Data:** migrations, the cached data layer, the viewer store and revalidation, and the backfill.
3. **Pages:**
   1. Feed
   2. Profile (three tabs)
   3. Lists + Save dialog
   4. Item page
   5. Home (AI + community picks)
   6. Add, notifications, settings, auth, onboarding, feedback, legal.
4. **Performance pass,** measured against antislop.
5. **Verification:**
   - Typecheck, lint and a production build.
   - Playwright end-to-end runs, signed out and signed in (with a throwaway test user I clean up afterwards), on desktop and phone, in light and dark. The flow: save → list → favorite → profile → item page → follow → notification.
   - Side-by-side screenshots against antislop.
   - A final review pass for anything missed before I hand it over.

---

## 6. Questions (my default in brackets)

1. **Daily picks.** One per category (album, book, film/show, read), topped up to five with community picks **[default]**, or literally a single pick per day?
2. **Lists public by default** like antislop, so friends' cards can show "Saved by…" **[default]**, with migrated Saved-for-later kept private. OK?
3. **The Favorites wall.** Keep the object frames (vinyl, page edges, poster frame, polaroid, TV bezel) inside the new design **[default]**, or go flat rounded covers like antislop everywhere?
4. **Launch.** A preview URL first via a separate Vercel project **[default]**, or swap myfavoriteapp.com directly when done?

**Needed from you:**
- ~~**Git is blocked on this Mac** until the Xcode license is accepted.~~ Done 2026-10-27.
- **For the preview deploy:** done 2026-10-27 with the CLI (logged in as abdulmirr). The preview URL still has to be added to Supabase Auth's redirect allowlist (dashboard → Authentication → URL Configuration), because the stored management token is expired.

**Smaller calls I'm making** (veto any):
- a lowercase `favorite` wordmark beside the gold star
- Inter everywhere
- signed-out Home shows community picks (the landing page retires)
- feed drawers fall back to people you don't follow
- the feedback bubble ships
- Approve taste moves into the ⋯ menu
- sounds are dropped.

---

## Build log (kept current while building)

- [x] v2/ scaffolded (copy of v1 app; old UI removed inside v2 only). Root tsconfig/eslint/.vercelignore exclude v2.
- [x] Next 16.4.3 in v2 (16.2.10 has critical advisories — v1 prod still on 16.2.10, flag to Abdul). radix-ui 1.6.7, lucide-react 1.53.0 pinned.
- [x] DB: migration26 (lists, list_items, daily_picks, feedback, feed_works(), budgets, reserved names) + migration27 (radar → private "Saved for later" lists) APPLIED to prod DB.
- [x] Foundation: next.config (cacheComponents + partialPrefetching), globals.css (antislop tokens + object frames), layout (Inter/Geist Mono via next/font, pre-paint theme + data-auth), viewer store (lib/viewer.ts), data layer (lib/data.ts, `use cache` + tags), /api/revalidate, /api/feedback, /api/feed.
- [x] UI kit: styles.ts recipes, Dialog, Menu, Toast, Avatar, Star, Logo, Header (+ AccountMenu, NotificationsButton), FeedbackBubble.
- [x] Cards: Cover (natural/stage/title card), WorkCard + PeopleLine drawer, FavoriteButton (+ ThoughtDialog), SaveButton + SaveDialog, ListCover.
- [x] Feed page (/feed): typed hero + search + filter pills + masonry (2 cols phones, 3 lg, 4 xl) + infinite scroll; personal order for members (cached), SSR for visitors.
- [x] Profile (/[username]): header card + Favorites/Lists/Activity tabs; the wall keeps the object frames (vinyl, page edges, poster, polaroid, screen).
- [x] List page (/[username]/lists/[slug]) + edit list + private-list client loader (ListGate).
- [x] Item page (/item/...): everyone who loves a work, with their thoughts.
- [x] Home (/): community picks for visitors; members get one AI pick per unlocked category (/api/picks, hook + reason, tomorrow pre-generated in after()), topped up to five from the community.
- [x] Add dialog (full AddFavorite port) — header ＋, and /add opens it as a page.
- [x] Settings, sign-in/auth, legal (/privacy, /terms), /extension handshake, 404 + error boundaries, redirects (/explore, /friends → /feed, /profile → /settings), sitemap (no segment revalidate; lists + /feed added), robots, manifest.
- [x] Onboarding (/welcome): claim → picks wall (tap to favorite, tray, thought nudge, background canonical enrichment) → import → people → reveal; finishing stamps onboarded_at and creates the private "Check later" list. Home sends un-onboarded members there; a reload resumes the same beat.
- [x] migration28: reserve "friends" (now a redirect). No existing profile used it.
- [x] Perf: every page is a static shell (○/◐ in the build); root share image cached (was rendering per request). Avatars and uploaded photos (phone originals up to 5MB) now go through Supabase's resize endpoint — ~3KB per avatar.
- [x] QA: tsc + eslint clean (0 warnings), `next build` clean. `scripts/_e2e-v2.mjs` (onboarding, favorites, thoughts, lists, privacy, add dialog — 23 checks) and `scripts/_e2e-picks.mjs` (AI picks end to end — 9 checks) pass against the real DB with throwaway users that clean up after themselves. Found + fixed on the way: a typed thought could be wiped by the dialog's late load; iOS zoomed into 14px fields (now 16px on phones).

### Measured (cold load, desktop, median of 3)

| | first paint | largest paint | covers in view loaded |
|---|---|---|---|
| antislop.xyz (remote) | 180–330ms | 490–850ms | 310–530ms |
| v1 myfavoriteapp.com (remote, signed out) | 260–660ms | 420–740ms | 650–690ms |
| v2 production build (local) | 160–170ms | 180–370ms | 360–870ms |

v2's server time is ~0 locally; on Vercel its static shells come from the edge like antislop's. The remaining image time is the cover CDNs themselves (tmdb, mzstatic, deezer) — same as antislop.

### 2026-10-27

- [x] Dev port moved to :3000. Google sign-in on :3001 fell back to the live site, because :3001 isn't on Supabase's redirect allowlist.
- [x] Daily picks run on Sonnet 5.5 at medium effort. Measured on a real 150-favorite library:

  | Model | Time | Cost per set | Picks |
  |---|---|---|---|
  | Opus 5.5 | 14.4s | 4.7¢ | — |
  | Sonnet 5.5, medium | 6.2s | 1.7¢ | — |
  | Sonnet 5.5, low | — | 1.7¢ (same as medium) | the obvious next thing |

  `_e2e-picks.mjs` passes 9/9 on Sonnet.
- [x] The privacy policy now covers lists and saves, feedback messages, activity emails, imports and Deezer. Its date is October 27, 2026.
- [x] v1 (repo root) is on Next 16.4.3 and deployed to production (commit 76cf319). That fixes 5 critical advisories, and `npm audit` reports 0.
- [x] Preview deployed from `v2/` with the CLI, as a **preview** deployment of the `myfavoriteapp` project. It is aliased to https://myfavoriteapp-v2.vercel.app; the project has Vercel login protection, so you have to be logged in to view it. Checked in a browser, signed out and signed in, with no errors.
- [x] `RESEND_API_KEY` added to Production env so v2's feedback emails send. v1 never reads it.
- To redeploy the preview: `cd v2 && vercel deploy --yes -e RESEND_API_KEY=… && vercel alias set <new-url> myfavoriteapp-v2.vercel.app`. Never run `--prod` from here unless it's the swap.

### Swapping v2 in

1. **Check v1 routes v2 doesn't have.** Only these are missing:
   - `/recap`, `/api/recap`: unlinked, and their cron is off.
   - `/api/recommendations`: replaced by `/api/picks`.
   - `/explore`, `/profile`: these redirect. `/friends` is a real page again, and v1's `/?feed=following` link redirects to it. `/<user>/activity` redirects to the profile.

   Email unsubscribe links, `/auth/callback`, `/auth/reset`, the Spotify callback, `/extension` and `/item` all exist in v2.
2. **Add the preview to Supabase's redirect allowlist.** Do this first so Google sign-in can be tested on the preview. Production (`https://myfavoriteapp.com/**`) is already allowed.
3. **Swap.** In one go:
   - Set Vercel → myfavoriteapp → Settings → Build and Deployment → Root Directory to `v2`.
   - Push a commit that drops the `v2` line from the root `.vercelignore`.

   Production env already has every variable v2 reads.
4. **Roll back if needed.** Use Vercel → Deployments → the last v1 deployment → Instant Rollback, then set Root Directory back to `.`.

### 2026-10-27, second batch (Abdul's design notes)

- [x] The header avatar links straight to your profile. The account menu is deleted; Settings already had Appearance and Log out, and its footer now links Privacy and Terms.
- [x] Your own profile card shows Share plus a settings gear. Edit profile is gone, because it also opened /settings.
- [x] Profile header: banner, then the avatar over its edge, then name, @handle, bio, counts (bold numbers) and links at the bottom.
  - The banner is `profiles.header_url` (migration29), uploaded in place ("Add header" on your banner) or in Settings → Profile → Header.
  - Without one, the banner is your top three covers, blurred into a glow.
- [x] The profile is 1024px wide (was 672px).
  - The wall drops its cards. Top four is large: 2×2 on phones, four across on desktop. When fewer than four are pinned on a wall of 8+, it fills from the wall's order, and the owner sees "Pin yours from any favorite's page".
  - The grid is 3/4/5 columns. Lists grow to 3 columns; Activity stays a 672px reading column.
- [x] Save and Favorite on cards are bare icons. To revert, set `CARD_ACTIONS` in `ui/styles.ts` to `"boxed"`.
- [x] Search is 0.1–0.5s, measured. It was at least 3s for books (Open Library takes 2.5–6s and had a 3s timeout) and up to 6s when iTunes throttled.
  - Every catalog has a 1.2s deadline.
  - Open Library only runs when Apple Books finds fewer than 4.
  - /api/search checks the JWT locally (ES256 `getClaims`) instead of a round trip to the auth server.
  - The add dialog's code preloads after the page settles.
- [x] Feedback emails builtbyabdul@gmail.com (lands in Gmail's Updates tab) and retries once.
- [x] Newsletter: Home's five daily community picks, emailed each morning.
  - The call to action sits at the bottom of Home. Visitors confirm by email (double opt-in); members subscribe in one click, or with the Settings → Email → Daily picks switch. Subscribers never see it.
  - Sent by `/api/newsletter/send` from Vercel Cron at 13:00 UTC (v2/vercel.json), so it only runs once v2 is production. Each day is claimed once, and `?to=` / `?html` give previews (both need CRON_SECRET).
  - Gmail's one-click unsubscribe headers are included.
  - The community picks now skip anything picked in the last 14 days, on Home and in the email.
- [x] Chrome extension v1.1.0. The popup lists your lists: tick to save, untick to remove, "New list" creates a list and saves the page into it, and one click favorites.
  - It's in the v2 look (Inter, light and dark).
  - It uses migration29's `extension_*` RPCs.
  - Store screenshots and tiles were regenerated, and `favorite-extension-v1.1.0.zip` is built.
- [x] Share cards are in the v2 look.
  - The default card: "Find your next favorite." beside the cover wall.
  - Profile card: avatar, name, counts and your Top four in their frames.
  - **Fixed a bug:** profile pages had no og:image (the page's own `openGraph` replaced the inherited image), so the image moved into `(tabs)`. List pages fall back to their newest cover.
- [x] Photo uploads are retired from the add dialog (17 photos from 3 people, 2 in the last 60 days). The existing ones still show. The line to restore them is in `lib/categories.ts`.
- [x] QA, all against the real DB with throwaway users that clean up after themselves:
  - `_e2e-v2`: 23 checks
  - `_e2e-picks`: 9 checks
  - `_e2e-profile`: 13 checks
  - `_e2e-extension`: 14 checks
  - the newsletter flow: 19 checks
  - The preview was browser-checked signed out and signed in. tsc and eslint are clean, and `next build` produced 387 pages.

### 2026-10-27, third batch (lists, Friends, the item page)

- [x] **Fixed:** the save dialog's list names were invisible. `cn` joins classes without merging, so ListCover's `w-full` beat the caller's `w-auto` and the thumbnail filled the row. The width now lives inside ListCover (`small` = 86px).
- [x] Header: Home · Feed · **Friends** (members; the unread badge moved onto it), then ＋, **🔖 Your lists** (a panel of your lists, newest first, plus New list) and your avatar. The bell is deleted. On phones the wordmark steps down a size under 390px and hides under 370px so everything fits.
- [x] **Friends** (`/friends`):
  - What the people you follow favorited and saved to public lists, grouped per person, per day, per list (`friends_activity`, migration31) — a bulk import is one line with "+ N more". Favoriting from it credits the friend.
  - Your notifications (Follow back, Approve back, your reach), marked read after a beat.
  - "Your people" faces, with gold rings on whoever was active in the last three days.
  - People with your taste (shared favorites), with their covers and a Follow chip.
  - Invite a friend: Messages on Apple devices, the share sheet on phones, a copied message elsewhere; the link is your own page.
  - Desktop has a right rail (notifications, suggestions); phones stack them.
- [x] **List page**, playlist-style: the cover, its color as a glow, the title big, owner · count · updated, then numbered rows (cover, title, "Creator · Year · Type", the note).
  - Owner: drag handles (on hover; always on touch screens; arrow keys work too), ○ marks finished (`list_items.done_at`, migration30) with a "Loved it" toast, a Finished section with "Loved it?" on each row, ⋯ for note / move to top / save to another list / remove (with Undo), and + Add (search straight into the list).
  - Visitors: 🔖 ★ on every row; signed-out visitors get "Make your own lists".
  - New share card for lists (title, owner, count, the first covers in their frames, or the list's own image).
- [x] **Item page**, Letterboxd-style: the work on the left (cover, type, title, creator, Listen on…, ★ 🔖 and Share as round icons), the people on the right: **You** first (your thought or "Add your thought", Pin to Top four — replacing the "On your wall" bar), then everyone's thoughts (people you follow first), then the rest as faces, then the lists it's in.
- [x] QA: `_e2e-batch3` (41 checks) plus `_e2e-v2` (23) and `_e2e-profile` (13), all against the real DB; tsc, eslint and `next build` clean.

### 2026-10-28, fourth batch (header, profile, add dialog, one link = one work)

- [x] **Header:** the pills sit dead center (a three-column grid from tablet width; phones keep the right-hugging row). The 🔖 button moved into antislop's arrow beside your avatar: a menu with you, your lists (newest five, thumbnails, lock, counts; "See all"), New list, Settings, Dark/Light mode, Log out. The avatar still goes straight to your page.
- [x] "Loved it?" → **"Favorite?"** (finished rows and the toast).
- [x] **Add dialog**, rebuilt: one big field that searches the chosen catalog or takes a pasted link (videos detected), six light chips on one row (Videos folded into Links), a fixed-height middle (empty state, skeleton rows, results with real covers), ↑↓ ↵ esc, and a roomier pick screen. It had been stuck at 448px because `cn` can't override a width — `Dialog` takes a `size` now.
- [x] **Friends rail:** no boxes. Notifications are plain rows; "See all" opens them in their own window instead of stretching the column. People with your taste: name, "N in common", a slim outlined Follow, and four covers spanning the row.
- [x] **Profile:** the banner runs edge to edge and fades into the page; the avatar sits over its edge; name, handle, bio, counts and links straight on the page (no card); Favorites · Lists as underlined tabs; list tiles without boxes (cover, title, count; a dashed "New list" tile). The wall's ＋ Add is a pill the size of the filters. The gear and ⋯ got a proper square icon button (`quietIcon`).
- [x] Item and list pages: ★ 🔖 ⤴ are bare icons (the round backgrounds are gone).
- [x] **One link, one work** (migration32): `url_work_key()` maps a URL to the id search would give it (themoviedb.org/movie/77 → tmdb:movie:77, Apple/Deezer/Open Library too), YouTube/Vimeo/Spotify to their own ids, anything else to `url:` + a hash of the address without scheme, www., trailing slash, fragment or tracking parameters. A trigger applies it on every write (v2, v1, the extension); links take any key, catalog-typed rows only catalog ids. Backfilled: 10 links merged (Paul Graham's Essays across 5 people, Playfighter across Abdul and Ali…), every catalog favorite with a catalog link now carries its id. The extension's RPCs match by the key. `lib/url-key.ts` mirrors the function for instant matching; `scripts/_e2e-url-key.mjs` checks the two agree on all 830 stored addresses and doubles as the migration's dry run.
- [x] QA: `_e2e-batch4` (25 checks), `_e2e-url-key` (22), `_e2e-batch3` (41), `_e2e-v2` (23), `_e2e-profile` (13), `_e2e-extension` (14) — all against the real DB.

### 2026-10-28, fifth batch (landing, onboarding, polish)

- [x] **Landing page, take two** (Abdul: "way too repetitive… present the purpose in the simplest way possible"): one screen — "Your taste, in one place.", three short sentences (keep a page / save what's next / find new favorites), **Start your library** + "See an example page", and one example of the product (Maya's page with her Top four, a "Saved to Check later" toast). Underneath, one quiet line for the not-ready ("five picks by email every morning") and Privacy · Terms. The message bubble is for members only now.
- [x] ~~Landing page, take one~~ (replaced, kept here for the record) for visitors at `/` (members still get Home; `HomeSwitch` picks before paint from the pre-paint auth flag, so neither flashes):
  - Hero: "Your taste, in one place." with the old landing's real covers drifting in their frames around it, "Start your library" and "See an example page".
  - Favorite · Save · Discover, each with a live-looking demo (a wall corner, a ticking list, a morning pick).
  - Today's five, live from the community, with the newsletter signup under them.
  - A slice of Friends; "Walls already up" (three real pages, rotated daily — `getLandingWalls`); "Taste is meant to be shared." + one "Start your library" button and a rolling cover strip.
  - "Start your library" opens sign-up directly (`/signin?mode=signup`).
- [x] **Onboarding** rebuilt in the new look: bigger type; Claim has a live preview of your page beside the form; Picks without boxes; People ranked by the favorites you now share, with cover strips and Invite a friend; the reveal shows your page with its glow and Top four, the three verbs, and a "Today's picks, by email" switch.
- [x] Friends rail: a hairline under each heading, hairlines between rows, a red count badge; people with your taste as compact six-cover strips.
- [x] Profile: "N favorites in common · mostly films" and "N approve their taste" became pills under the social links.
- [x] **Home never recommends what you already have** (favorited or saved), checked three times:
  - AI picks: the whole library goes into the prompt (the newest 150 in full, the rest as a do-not-suggest list), generated picks matching anything you own are dropped, and every `/api/picks` response is re-checked against your library as it is now (so something favorited since this morning, on any device, stops being a pick).
  - Community fill: `getCommunityPicks` ranks twelve; the first five are still the day's five (visitors, landing, email), the rest are backups so a member's Home skips their own favorites and saves and still shows five.
  - On the page, a snapshot taken as Home opens, so a pick you favorite right there stays on screen.
  - Matching is by catalog id and by normalized title within a shelf (films and shows together). `_e2e-owned` covers it without an AI call; `_e2e-picks` still passes with a real one.

### 2026-10-28, sixth batch (landing take three, Discover)

- [x] **Landing page, take three** (Abdul: "I really liked the previous hero with the text in the middle and the floating media all around… the profile preview looks too cheap… I don't like how the rectangles have such big radius corners"): the centered line again, with fourteen covers floating around it in the wall's frames at three depths — near ones larger and leaning furthest from the mouse (`Drift`; off for touch screens and reduced motion), far ones smaller and fainter. Phones and tablets get five as a band above the words. One screen, one button; the button and the email line have tighter corners; no product mock. The covers go through the image optimizer (Currents: 209KB → 41KB). `book-east-of-eden.jpg` was actually *River of Shadows* (onboarding showed it too); replaced in v2 only. `_e2e-landing` checks eight screen sizes, light and dark: one screen tall, no cover ever touching the words, every cover on screen, the parallax.
- [x] **Discover** (direction A) takes the feed's place in the nav, reversibly: set `DISCOVER = false` in `lib/discover.ts` and the nav, the 404 pages and the sitemap go back to the feed. `/feed` itself is untouched. Rows, each with its reason, never anything you already have (favorited, or saved to any list, private ones included):
  - **Because you love X**: three a day, rotating among your twelve strongest favorites, different kinds of things where possible. What the other people who love X also love: works several of them share first, discounted by how common they are everywhere. No work in two rows.
  - **People with your taste**: people you don't follow, by favorites in common, each with six things they love that you don't have, and Follow.
  - **Loved most this month** (favorites and public saves, 30 days), **Fresh thoughts** (the newest favorites with a note, quote first), **Browse everything** (the feed's pages as a dense grid of frames, by medium).
  - Visitors, and members with nothing to pick from yet, get the shared rows and a nudge. Search sits at the top (people, works, catalog finds) and shows tiles.
  - Tiles are the wall's frames. 🔖 ★ show on hover and stay once used; on phones a tap opens the work's page.
  - Data: migration33 adds `discover_public()` and `discover_for(viewer)` (read-only, public data only, the same work grouping as `feed_works`), cached like the feed (`getDiscoverPublic`, and `getDiscoverFor` through `/api/discover`). Private saves and blocks are filtered in the browser, so they never reach the API. Home and Discover share `useOwned()`.
  - On phones under 414px, a member's header shows the star alone (Discover · Friends · ＋ · you fill the bar); visitors keep the wordmark.
- [x] QA: `_e2e-discover` (24 checks), `_e2e-landing`, `_e2e-owned`, `_e2e-batch4`, `_e2e-v2` — all against the real DB; tsc, eslint and `next build` clean.

### 2026-10-28, seventh batch (Discover: who loves it)

Abdul: "under or over the items… put which friends you follow also favorited it"; "Loved most this month… how many favorites each item got and by who"; "fresh thoughts… cleaner or removed"; "browse everything is just a collection of random items with no reason" — merge it with Loved most, "without overwhelming the items". Then a second analysis (a review agent stopped on the usage limit; its read-only replay of six members' Discover was the useful part).
- [x] **Every tile says who loves it** (`Who`): ★ count, up to three faces, and by name the people you follow — they come first. Everyone's name is in the hover title; names give way on narrow tiles (a container query), the count and faces stay.
- [x] **"Most loved"** replaces "Loved most this month" and "Browse everything": the same dense grid and filters, ordered by favorites this month, then by favorites of all time, under "This month" / "All time" labels; each count and its faces belong to the period. Within a count, people interleave (one person's burst doesn't fill a screen). Works already on a shelf above are skipped, and the viewer's own favorites are left out server-side so pages stay full.
- [x] **"From people you follow"** leads for members who follow anyone: what those people favorited, newest first, each named. The replay showed why it matters and why it's not enough: 4 of 6 sampled members follow nobody, so for most people the names appear only once they follow someone ("People with your taste" is the way in, and a new follow names them immediately).
- [x] "Because you love" works that people you follow love move to the front of their row; at most three personal shelves (the third "Because you love" gives way to the friends row).
- [x] **Fresh thoughts removed** (thoughts stay on item pages and Friends). `discover_public()` stays in the DB, unused.
- [x] **One work across catalogs:** copies with the same type, title and creator are one work on Discover (Graduation on Apple and on Deezer was showing twice, with its favorites split 3 + 2). Applies to the rows, the grid, and "what you already have".
- [x] Fixed: on phones the who line's screen-reader text escaped the sideways-scrolling shelves and made a member's page 1,822px wide (now `relative`).
- [x] Data: migration34 — `discover_works(types, exclude, limit, offset)` and a new `discover_for` (same signature) with who-data and friends. `/api/discover/works`; `MOST_LOVED_PAGE` = 48.
- [x] Known limit: 11–12 of most members' 12 seeds are onboarding picks, so "Because you love" leans on classics until people add their own favorites.
- [x] QA: `_e2e-discover` (34 checks, with a second throwaway member as the friend), `_e2e-batch4`, `_e2e-v2`; tsc, eslint, `next build`.

### 2026-10-28, eighth batch (Discover and Friends, simpler)

Abdul: drop the star and the names ("just number and the profile pictures"); "From people you follow" is what Friends is for; "Because you love" rows should hold the same type; keep "People with your taste" in one place; merge Friends' "Latest" with the notifications; Most loved of all time only.
- [x] **Who line** = the number, then faces (people you follow first). No star, no names on the page; names are in the hover title.
- [x] **Discover** = "Because you love X" rows + "Most loved". Each row holds X's own type: albums for an album, films for a film, shows for a show (`discover_for` compares media types). "From people you follow" and "People with your taste" are gone from Discover; people live on Friends.
- [x] **Most loved** is all time: by favorites, people interleaved within a count. No month block.
- [x] One work across catalogs, take two: a title only one creator carries (blank creators don't count) is one work. *Modern Wisdom* saved with and without "Chris Williamson" now has 3 favorites. Creator spelling variants (Viktor Frankl / Viktor E. Frankl) stay two works in the data, and the page shows a title once per kind.
- [x] **Friends** = one "Latest" timeline: what your people favorited and saved, and what happened to you (follows, favorites from your wall, taste approvals, with Follow back / Approve back), newest first. While older activity is still loading, older notifications wait so the order never jumps. The notifications box and its "See all" window are gone. People with your taste and your reach sit in the rail (on phones: below the timeline, or first if you follow nobody yet).
- [x] The onboarding already asks to follow people (beat 4, "People whose walls look like yours"). Today's members came through v1's onboarding, which never did.
- [x] Data: migration35 — `discover_for` (seeds only, same-type rows) and `discover_works` (all time, without the month columns).
- [x] QA: `_e2e-discover` (34 checks), `_e2e-batch3`, `_e2e-batch4`; tsc, eslint, `next build`.

### Left for Abdul

- Add `https://myfavoriteapp-v2.vercel.app/**` to Supabase → Authentication → URL Configuration → Redirect URLs. Without it, Google sign-in on the preview lands on the live site.
- Say when to swap. Submit `favorite-extension-v1.1.0.zip` to the Chrome Web Store with automatic publishing unchecked, then press Publish after the swap — its lists only show in v2.
- Newsletter: Resend's free plan sends 100 emails a day. Past roughly 90 subscribers, the daily send needs a paid plan.
- Test accounts share Supabase's sign-up email limit with real people (one project for v1 and v2). On 2026-10-28 the e2e runs used it up, so sign-ups on the live site got "email rate limit exceeded" for up to an hour. Either raise the limit (Supabase → Authentication → Rate Limits → emails per hour) or put a service-role key in `v2/.env.local` so tests create confirmed accounts without sending email.

### Found, not yet fixed

- In a production build, a signed-in page that lists works (/feed, /friends, list pages) prefetches their item pages, and one prefetch (e.g. `/item/itunes:476023633`) can stay open indefinitely. The page itself renders in 0.5s and pages work normally, but the network never goes idle. Pre-existing (item pages are unchanged since batch 4); worth checking whether a click on that work waits on the open prefetch.
