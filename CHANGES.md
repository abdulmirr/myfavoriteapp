# The Stickiness Release — July 2026

Everything shipped in the four-day push from July 7–8, 2026 (commit `631b5c2`),
built from a deep product audit plus research across Letterboxd, Goodreads,
StoryGraph, Beli, Are.na, Last.fm, Spotify Wrapped, and the retention
literature. The strategy in one line: **Favorites had built the right asset
(a curated taste identity) but no gravity — nothing pulled people back.**
This release is the gravity.

Full strategy doc: `~/.claude/plans/i-want-you-to-ancient-locket.md` (local).

---

## What's new

### Email — the outbound channel (was: none)
- **Activity emails, on by default**: your first follower, "X favorited *Y*
  from your library," and taste approvals. Hard-capped at one per person per
  day; every email carries a signed one-click unsubscribe; a failure can never
  break the action that triggered it.
- **Weekly digest, rebuilt**: real names, titles, and links (who followed you,
  what spread from your library, what people you follow favorited) instead of
  bare counts. Quiet weeks send nothing.
- **Monthly recap email**: on the 1st, anyone with a card-worthy month gets
  "your recap is ready."
- All emails share one visual shell (star mark, clean type, hosted logo) and
  send from `Favorites <hello@myfavoriteapp.com>` via Resend, straight from
  Postgres (pg_cron + pg_net). Settings has separate toggles for activity
  emails and the digest.

### For You — a closed loop (was: a dead end)
- Every pick now has **favorite** (one tap into your library), **radar**
  (private "looks interesting" shelf), and **pass** (never again — and the
  engine reads it as taste signal).
- Picks unlock at **3 favorites in any category** (the old 12-total wall is
  gone); the gated state shows per-category progress.
- **Taste note**: a settings field with standing instructions for the engine
  ("more quiet literary fiction, no self-help").
- **Radar strip**: your private shelf on For You; each row resolves to
  favorite (keeping the via-credit) or let-go. Deliberately never numbered.
- **Rediscover**: one favorite from 30+ days back resurfaces daily —
  "still one of yours?" (starts appearing as libraries age).
- Failures are graceful: a failed refresh restores the old picks instead of
  blanking the page; passing on the whole set says so instead of pretending
  the library is empty.

### Shareable artifacts (was: unbuilt)
- **`/username/four`** — the cross-media Four Favorites page (Letterboxd's
  four, but for everything). Own link-preview card + downloadable 9:16 story
  render. Linked from every library sidebar.
- **`/recap`** — monthly story cards from real numbers: the month's covers,
  the breakdown, and the one stat nobody else can make — how many favorites
  spread from your library. Unlocks at 3 saves/month; December doubles as the
  year's wrap.
- Both artifacts are human-templated from real data. No AI voice, ever
  (the Wrapped-2024 / Fable lesson).

### The network layer
- **Taste match** on every profile: "You share 12 favorites — mostly books,"
  computed from canonical-work overlap.
- **`/item/…` pages**: every canonical work has a public page listing everyone
  who loves it, with their thoughts — reachable from any item overlay
  ("Favorited by 4 people · everyone →"). Also the long-tail search surface;
  all item and four pages are in the sitemap.
- **Collections**: named shelves ("2026 canon") that filter the grid, with
  shareable `?c=` links. Create/assign from the sidebar or the item overlay;
  deleting a shelf never touches the favorites on it.
- **Drag-to-reorder**: owners rearrange their wall by dragging; the grid
  live-reshuffles and the order persists. (Desktop pointer only.)
- **Better follow suggestions**: people-your-follows-follow ranks first.
- **Landing page**: a "Walls already up." section showing real live libraries
  with cover strips — visitors get doors to walk through.

### Importers
- **Spotify** (Settings → Import): OAuth connect pulls your saved albums and
  all-time top-track albums into a review wall — you pick what becomes a
  favorite. Read-only scopes; the token is never stored. *Spotify keeps new
  apps invite-only (owner + ~4 added testers, 250k-MAU business requirement
  for public access), so this is limited until their policy changes.*
- **Last.fm**: type any username, get their 200 most-played albums (top 24
  pre-checked). Works for everyone, no restrictions.
- Both feed the existing enrichment pipeline (real cover art, canonical ids,
  dedupe against the library).

### Quality, safety, polish
- Rate-limit errors speak human ("You've hit today's favoriting limit").
- The bell only marks notifications read after deliberate attention (1.5s
  dwell or clicking a row) — accidental opens keep the badge.
- Mobile ✕ no longer discards an in-progress edit; edit-cancel is one code path.
- CSV exports defuse spreadsheet formula injection; avatar re-picks no longer
  leak memory; failed follows/blocks say why.
- Web manifest + real app icons — "add to home screen" gives a proper tile.
- An 8-angle adversarial review of the whole diff found 15 real issues
  (data-loss path in recs regen, a taste-approval retargeting hole, email
  race conditions, unbounded RPC inputs, drag edge cases) — all fixed and
  re-verified before this shipped.

### Database (migrations 14–23, all applied to prod)
taste approvals (14) · rec dismissals (15) · email system (16) · recap email
(17) · radar (18) · taste match (19) · collections (20) · reorder RPC (21) ·
hardening: advisory locks, retarget guard, input caps, idempotent senders
(22) · email visual shell (23).

---

## What's left / known limitations

**Needs Abdul:**
- **Spotify public access** — blocked by Spotify policy (registered business +
  250k MAU since 2025; dev mode now capped at ~5 test users). Add testers in
  the developer dashboard (User Management) meanwhile.
- **TV Time importer** — needs a real export file to build against; the
  service (25M users) shuts down **July 15, 2026** and exports stop then.
- **Guest favorites editorial** — the proven growth ritual in this category
  (PI.FYI's newsletter, Letterboxd's Four Favorites interviews): a weekly
  micro-interview; every guest's `/four` page is the artifact.
- **Rotate keys someday**: ANTHROPIC_API_KEY (leaked in chat at deploy time),
  and the Spotify/Last.fm creds were also pasted in chat (low stakes).

**Deliberately deferred:**
- **Monetization** — until retention data exists. The researched model:
  Letterboxd Pro (core free forever; paid tier = depth of stats + wrapped
  extras + patron badge).
- **Annual Wrapped (December)** — the recap machinery is built; the December
  card should get persona labels and year-scale stats when the data exists.
- **Push notifications / PWA re-engagement** — email first was the right
  order; revisit if/when there's a mobile habit to protect.

**Known small limitations (reviewed, accepted):**
- Taste-approval emails can't include the note (it's written moments after
  the event that sends the email; the note shows in the bell).
- Recap/story image endpoints are public with CDN caching only — fine at
  current scale, add a budget if they get hammered.
- The digest sender loops per-user — fine to ~1k subscribers, then batch it.
- ~7 near-duplicate media-type→label maps across files (cleanup debt).
- Drag-to-reorder is desktop-only (touch drag fights scrolling).

**North star to watch:** Weekly Active Favoriters — people who favorite ≥1
thing in a week. Activation hypothesis: ~10 favorites + 3 follows in week one.
Judge email re-engagement over 90 days, not first-send opens.
