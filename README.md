# Favorites — myfavoriteapp.com

A personal media curation library: books, movies, TV, music, podcasts, videos,
articles, and photos, curated on one profile. Design replicates
[naturalselection.so](https://www.naturalselection.so/) (mirror in
`natural-selection/`, reference only — not shipped).

## Stack

- Next.js (App Router, TypeScript, Tailwind v4, framer-motion)
- Supabase: Postgres + Auth (magic link) + Storage (`media` bucket)
- Media search: TMDB (movies/TV), iTunes (music/podcasts/book covers),
  Open Library (book metadata fallback), oEmbed/OpenGraph for videos & links

## Run

```bash
npm install
npm run dev        # http://localhost:3000 → redirects to /abdulmir
```

Secrets live in `.env.local` (gitignored): Supabase URL + anon key, TMDB keys,
and `SUPABASE_DB_URL` (used only by `scripts/`).

## How it works

- **Onboarding** (`/welcome`) — first sign-in routes here (Home checks
  `profile_private.onboarded_at`): claim your page (username picker with live
  availability), add first favorites (curated wall + search; thoughts required
  for each), import from Goodreads/Letterboxd, follow suggestions, then a
  reveal into the live library. Every beat is skippable.
- `/[username]` — public profile library. Sidebar: search-as-you-type filter,
  category buckets (Books/Movies/Music/Other), Latest/Oldest sort,
  Grid ⇄ Freeform view toggle.
- **Grid** view: NS-style tiles — hover lifts artwork, caption rises in below;
  FLIP re-layout on sort changes; click morphs into the full-screen detail view.
- **Freeform** view: drag items anywhere (owner only); positions persist.
- **Add a favorite** (owner): searches TMDB/iTunes/Open Library, or paste a
  URL (YouTube/article), or upload a photo (rendered as a polaroid).
- **Editing** (owner): every item's title/creator/thoughts editable + deletable
  from the detail view; profile (name, bio, avatar, links) editable via
  "Edit profile".
- **Sound** (`src/lib/sfx.ts`) — a whisper-level layer with two voices sharing
  one AudioContext: recorded foley per medium on tile presses (page turn,
  needle drop, shutter…) and two synthesized micro-cues — a warm rising pair
  (D5→A5, detune-doubled) when a favorite or follow lands, and one soft
  C-major arpeggio at the onboarding "your page is live" reveal. Deliberately
  silent everywhere else (overlay close, copy link, pin, search picks, tabs,
  sort) so the cues stay meaningful. All sounds obey the Sounds toggle in
  Settings → Appearance (`fav:sounds` in localStorage, default on).

## Ownership / auth

Sign in via magic link (sidebar → "Sign in"). The `claim_profile` DB trigger
links the first sign-in from `claim_email` to the profile, after which
row-level security allows writes only to the owner. Everyone else sees a
read-only profile.

## Database

Schema in `supabase/migration.sql` (idempotent — re-run any time):

- `profiles` — username, display name, bio, avatar, socials (jsonb)
- `items` — media_type enum, title/creator/description, image/view URLs,
  metadata jsonb, sort_order, freeform position (pos_x/pos_y/pos_rot)

Scripts (need `SUPABASE_DB_URL`):

```bash
node scripts/migrate.mjs   # apply schema
node scripts/seed.mjs      # seed favorites (idempotent by title)
```

## Deploying

1. Push to a git repo → import in Vercel → add env vars from `.env.local`
   (everything except `SUPABASE_DB_URL` if you prefer).
2. In Supabase → Authentication → URL Configuration: set Site URL to the
   production domain so magic links redirect there.

## Later (multiplayer)

The schema already supports many profiles. Remaining work: a richer
following page and profile search.
