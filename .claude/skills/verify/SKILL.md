---
name: verify
description: Build/launch/drive recipe for verifying changes to the Favorites app (Next.js + Supabase) end-to-end.
---

# Verifying Favorites (myfavoriteapp.com)

## Build & run
- `npm run build` — typecheck + prod build.
- Abdul usually has `npm run dev` already running on **localhost:3000** (check before starting your own; a second `next dev` exits with "Another next dev server is already running"). Fall back to `npm run dev -- --port 3100`.

## Auth handle (no UI login needed)
Auth is client-side Supabase (localStorage). To drive signed-in flows:
1. Create a throwaway user with `supabase.auth.signUp()` (anon key from `.env.local`). If no session returned, confirm the email directly in the DB (`update auth.users set email_confirmed_at = now()`) via `scripts/db.mjs` (pooler connection — direct host doesn't resolve on this network), then `signInWithPassword`.
2. A DB trigger auto-creates a profile; seed `public.items` for it via direct pg (bypasses RLS).
3. API routes: pass `Authorization: Bearer <access_token>`.
4. Browser: inject localStorage key `sb-bvpruvuenqdwilysgojy-auth-token` with `{access_token, refresh_token, expires_at, token_type:"bearer", user:{id,aud:"authenticated",email,role:"authenticated"}}` via Playwright `addInitScript`, then load the page.
5. **Always clean up**: delete friendships/recommendations/items/profile rows and the `auth.users` row for the test user.

## Gotchas
- Scripts importing project deps must live under the repo (e.g. `scripts/_tmp.mjs`), not the scratchpad — module resolution.
- Playwright browsers may need `npx playwright install chromium` first.
- Remote images (mzstatic/TMDB) load slowly — wait for `networkidle` + a few seconds before screenshots.
- `/api/recommendations` first call per week hits Claude (~20s); repeat calls must return in <1s (DB cache).

## Flows worth driving
- `/` signed out → landing page (`src/components/Landing.tsx`); signed in → For You + Following tabs, notifications bell, dark-mode toggle.
- Email confirmation is ON: `signUp` returns no session; the profile is created only once `auth.users.email_confirmed_at` is set (confirm via DB for tests). Use `delivered@resend.dev` as the throwaway address — real emails go out through Resend SMTP.
- `/abdulmir?item=<uuid>` → detail overlay opens on load (permalink); `curl /abdulmir | grep og:` → per-profile metadata + `/abdulmir/opengraph-image` card.
- `POST /api/recommendations` — 401 without token; parallel first calls must produce exactly ONE `recommendations` row (claim-row); cached call <1s. `/api/search` and `/api/og` also require a bearer token (per-user daily budgets via `bump_api_usage`).
- Social: `follows` insert → `notifications` row for the followee (trigger); item insert with `via_profile_id` → 'favorited' notification; unfollow retracts its notification.
- `/api/recap?u=<username>&m=YYYY-MM` → 1080×1920 PNG when the month has ≥3 saves, 404 otherwise.
- Weekly digest: `select public.send_weekly_digests()` then check `net._http_response` for Resend's 200 (opt-in: `profile_private.digest_opt_in`).
