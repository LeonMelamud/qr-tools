# Move raffle-qr from Supabase to Neon: design

Date: 2026-11-14. Status: draft, waiting for Leon's approval.

## Why

The app's Supabase project ("HypnoRaffle Web", ref `tichmtlfhilvrhnjaraf`, region ap-south-1) is on the free tier, which pauses a project after a week without activity. The last raffle activity was 2026-07-26 (`select max(created_at) from sessions` → `2026-07-26 17:26:40+00`). While it was paused, session creation failed. It was restored on 2026-11-14, and an anonymous call to `rpc/create_session_with_qr` then returned HTTP 200 (the test row was deleted).

Leon asked (chat, 2026-11-14) to restore it and then move to Neon. Neon's free compute scales to zero when idle and wakes on the next request instead of going offline.

## Goals

- The deployed site (static export on GitHub Pages at `qr.ai-know.org`) reads and writes only Neon, through the Neon Data API with anonymous tokens.
- All live app data moves with nothing lost. Row counts on 2026-11-14 (Supabase SQL): `sessions` 344, `participants` 227, `raffle_qr_refs` 10, `qr_refs` 9, `raffle_images` 0.
- Printed QR codes keep working with their scan counts. They encode `${window.location.origin}/qr-ref?go=<slug>` (`src/app/qr-ref/page.tsx:381`, `:695`), which is the site's own domain, not Supabase. Raffle join codes encode `/raffle/qr?session=<id>` (`src/components/raffle/SessionIndicator.tsx:108`), so moved session ids must stay the same.
- Gallery images and QR logos can still be uploaded and removed from the UI without a deploy.
- Access stays as open as it is today: anonymous users can read and write every app table. The Supabase policies prove this: `pg_policies` shows `qual true` / `with_check true` for role `public` on `participants`, `sessions`, `raffle_qr_refs`, `qr_refs` and `raffle_images`.

## Non-goals

- **Admin Google login** (`/admin`, `/login`, `/auth/callback`, `use-user-profile`, `components/auth/user-profile.tsx`), and the tables `people`, `profiles` and `admin_whitelist`. These are removed from the app and not carried over. Supabase has 0 rows in `auth.users`, `profiles` and `people`. Leon picked "drop it for now" on 2026-11-14; it can come back later on Neon Auth.
- **`qr_scans` and `increment_qr_scan()`.** No code reads them: grep for `qr_scans|increment_qr_scan` in `src` finds nothing, and `qr_scans` has 0 rows. Not carried over.
- **Seeding the `raffle_images` gallery.** It stays empty, so the page keeps serving the static list in `src/lib/placeholder-images.json` (fallback in `src/app/raffle/page.tsx` `fetchImages`).
- **Real authentication.** The client-side password gate (`PasswordGate`, SHA-256 hash) and basic-auth middleware (`src/middleware.ts`, which doesn't run on a static export) stay as they are.
- **The Docker / self-hosted PostgREST path.** It only gets the env var rename so it still builds; it is not deployed or tested.
- **The Firebase App Hosting backend** (`apphosting.yaml`, last changed 2026-01-28). Leon confirmed on 2026-11-14 that it's not used any more. `qr.ai-know.org` resolves to GitHub Pages: `dig +short qr.ai-know.org` → `leonmelamud.github.io.` and 185.199.108-111.153. So `https://qr.ai-know.org` is the only production origin.

## Anti-goals (a failure even if it "works")

- A printed QR code stops redirecting, or loses its `scan_count`.
- The live site points at a backend that's not ready, or data written during the cutover is lost.
- The app burns through Neon's free quota, Neon suspends the compute, and the raffle breaks again, which is the failure this move exists to fix. The free plan allows 100 CU-hours of compute per project per month and 5 GB of public network transfer (neon.com/docs/introduction/plans).

## Constraints

- **No server.** The GitHub Pages build is a static export: `next.config.ts:9` sets `output: isGitHubPages ? 'export' : ...`, and `.github/workflows/deploy.yml` sets `GITHUB_PAGES: 'true'`. So no API routes or server code: everything runs in the browser.
- **Config is baked in at build time** from GitHub Actions secrets (`deploy.yml:23-26` passes `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **The app polls constantly.** `src/hooks/use-participants.ts:77` polls every 2000 ms. It is mounted for every page through `ParticipantsProvider` in `src/app/layout.tsx:29`, and runs whenever a session id is stored in localStorage.
- **Anonymous access on Neon was proven on 2026-11-14** (scratch project `twilight-math-17346746`, aws-eu-central-1, since deleted):
  - `@neon/neon-js@0.10.2` was loaded in the browser at origin `http://localhost:9002` with `createClient(<base url>, { auth: { allowAnonymous: true } })`.
  - It ran `rpc('create_session_with_qr')` (a SECURITY DEFINER function), insert, update, select and delete on RLS-enabled tables, all with `error: null`. One insert carried a 200 KB `data:` URL.
  - The anonymous token comes from `GET <auth>/token/anonymous` and has claims `role: anonymous`, `sub: anonymous`, and a 3600 s lifetime.
  - A Data API request with no token gets `401 PGRST302`, so every request must go through the SDK, or fetch a token first.
  - The SDK caches the token until the JWT expires, then fetches a new one: `@neon/auth` `dist/adapter-core.js`, `AnonymousTokenCacheManager` and `getJWTToken`.
- **A new Neon Auth branch starts with email/password sign-up enabled and the shared Google OAuth provider on.** Seen with `get_neon_auth_config` on the scratch project.

## Approaches considered

**Images** (Leon picked A on 2026-11-14):

- **A. Store images in Postgres as `data:` URLs (picked).** Uploads are shrunk in the browser and written to the row through the same Data API. Nothing else needs deploying, and QR-to-PNG export draws a same-origin `data:` image, so canvas export has no cross-origin problems. The cost is heavier rows, which is fine at this scale: 6 logos totalling 245,334 bytes today.
- **B. Neon Object Storage plus a Neon Function** that hands out presigned upload URLs. Rejected: it adds a second deployable and an open write endpoint, and both are newer Neon features (Storage and Functions are only in 4 regions).
- **C. Keep images in Supabase Storage.** Rejected: Supabase pausing is what we're escaping.

**Admin login:** drop for now (picked), or port to Neon Auth with Google (later, if ever needed).

## Design

### Neon project

- A new project, `hypnoraffle`, in org "ai dream influencers" (`org-shy-heart-18150620`, free plan, account ai.dream.influencers; Leon confirmed this account on 2026-11-14). The org's existing project `odd-heart-99080089` belongs to another site and is not touched. Region `aws-eu-central-1` (Frankfurt, closest to Israel), Postgres 17, database `neondb`.
- Data API enabled with Managed Better Auth (`auth_provider: neon_auth`). Settings:
  - CORS allowed origins: `https://qr.ai-know.org`, `http://localhost:9002`.
  - Anonymous role: `anonymous`.
- Neon Auth: add `https://qr.ai-know.org` as a trusted origin, keep localhost allowed, and turn off email/password sign-up, so the only tokens are anonymous ones.

### Schema on Neon

Copied from the live Supabase catalogs, not the repo's `.sql` files, which are stale. Same columns, defaults, constraints and indexes:

- `sessions` (id uuid pk default gen_random_uuid(), created_at, is_active default true, name)
- `participants`
  - Columns: id, name, last_name, display_name (all not null), created_at, session_id → sessions on delete cascade, email, won default false.
  - Indexes: `idx_participants_session_id`, and a unique `(email, session_id) where email is not null`.
- `raffle_qr_refs`: session_id → sessions on delete cascade, `short_code` unique, two indexes.
- `qr_refs`
  - Columns: name varchar(100), slug varchar(50) unique, target_url, description, category default 'personal', scan_count default 0, last_scanned_at, is_active default true, expires_at, created_at, updated_at, display_title, display_message, logo_url.
  - Indexes: `idx_qr_refs_active`, `idx_qr_refs_slug`.
- `raffle_images`: id, url, alt, created_at. `storage_path` is dropped, because no storage objects exist any more.
- Functions:
  - `generate_short_code(int)`.
  - `create_session_with_qr(text)`: SECURITY DEFINER with `set search_path = public` added.
  - `update_qr_refs_updated_at()` plus its BEFORE UPDATE trigger on `qr_refs`.

**Access:** RLS on for every table, with one policy each: `for all to anonymous using (true) with check (true)`. Grants for `anonymous`: `usage` on schema public, `select, insert, update, delete` on the five tables, and `execute` on `create_session_with_qr`.

### Data copy

- **Tables.** Export each table from Supabase as JSON (Supabase MCP SQL) and insert it into Neon with `json_populate_recordset`, keeping the original ids and timestamps. Order: `sessions`, `raffle_qr_refs`, `participants`, `qr_refs`. Verify every table's count, `max(created_at)` and, for `qr_refs`, `sum(scan_count)` against the source.
- **QR logos.** 5 `qr_refs` rows have `logo_url` pointing at Supabase Storage. Download each object and write it back to `logo_url` as a `data:` URL, keeping its content type.

### App changes

- **Database client.** `src/lib/supabase.ts` becomes a Neon client: `createClient(process.env.NEXT_PUBLIC_NEON_URL, { auth: { allowAnonymous: true } })` from `@neon/neon-js`, pinned to an exact version. Keep the `db.from()` / `db.rpc()` surface the hooks and pages use, and remove `getSupabaseClient()`.
- **Uploads.**
  - New helper: file → `data:` URL, downscaled in the browser so the long side is at most 800 px.
  - Raffle gallery upload inserts `{ url: dataUrl, alt }`; delete just deletes the row.
  - QR logo upload sets `qr_refs.logo_url = dataUrl`.
- **Remove** the admin/login/callback pages, `use-user-profile`, `user-profile.tsx`, and the `@supabase/*` packages.
- **Free-quota guardrail.** Polling must not keep Neon awake when nobody is using the page; Leon proposed this on 2026-11-14 ("if there is no movement for x time ... spin it by refresh").
  - **Idle stop.** Participant polling stops after 10 minutes with no change in the participant list and no user input (click, key, touch) on the page. The 10 minutes is my call; Leon can change it.
  - **Hidden tab.** Polling also pauses while `document.hidden`.
  - **Resume.** Any input, the tab becoming visible again, or a page refresh restarts polling with an immediate fetch. Neon wakes its compute on that request.
  - **Indicator.** While paused, a small "Live updates paused, click to resume" badge is shown, so the host knows why new joiners aren't appearing.
  - **Effect.** Neon suspends the compute about 5 minutes after the last query (free plan), so an idle open tab costs about 15 minutes of compute, not hours.
- **Config.** `NEXT_PUBLIC_NEON_URL` replaces `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, `.env.example`, `deploy.yml`, the Dockerfile build args, `AGENTS.md` and `README.md`.

### Behaviour details (my calls, from the design review)

- **QR redirect.** The `?go=<slug>` lookup selects only the columns it needs (`id, slug, target_url, is_active, expires_at, scan_count`), so a scan doesn't download the logo `data:` URL.
- **Draw while paused.** Starting a draw while polling is paused fetches the participant list first, so a winner is never picked from a stale list.
- **Sign-in methods.** Neon Auth's shared Google OAuth provider and email/password sign-up are both turned off; only anonymous tokens are issued.

### Before the migration branch

- **Commit the pending edits first.** The uncommitted Next `^15.5.9` → `^15.5.29` bump (`package.json`, `package-lock.json`) and the Dockerfile `ENV DOCKER_BUILD=true` line get their own commit on `main`, after `npm ci` and `GITHUB_PAGES=true npm run build` pass. Leon chose this on 2026-11-14.
- **The migration starts from that commit**, on its own branch.
- **What ships with the migration deploy.** Local `main` also carries `37e81fa` (the AI Leaders gallery logo), which goes out with it.

### Cutover

1. Build the Neon project, copy the data, and verify the counts (above).
2. Run the app locally against Neon. Check:
   - session creation;
   - joining via `/raffle/qr?session=<id>`;
   - a draw, plus marking the winner;
   - a gallery upload and delete;
   - a QR logo upload, and PNG export with the logo;
   - `/qr-ref?go=<slug>` redirects and increments `scan_count`;
   - the network tab while polling, to confirm one Data API call per poll with no auth call each time;
   - polling stops after the idle limit (shortened for the test), and a click resumes it.
3. With Leon's yes: set the repo secret `NEXT_PUBLIC_NEON_URL`, merge, and push `personal main` (GitHub Pages deploys on push).
4. Just before that push, copy across any `sessions`, `participants`, `raffle_qr_refs` or `qr_refs` changes Supabase received after the first copy, using `created_at > <copy time>` and `scan_count` / `updated_at` for `qr_refs`.
5. Production checks on `qr.ai-know.org`, with the participant join done from a phone (iOS Safari if available):
   - a QR redirect, plus its scan count;
   - a new session;
   - a participant join.
6. Run a second catch-up copy after the deploy, for writes that reached Supabase from browsers still holding the old page. For `qr_refs`, add Supabase's `scan_count` increase since the first copy, rather than overwriting.
7. Supabase stays untouched as a backup and will pause again on its own. Deleting it is Leon's call, later.

## Left to the builder

- **Upload details.** Image output format (keep PNG for transparency, or WebP) and the size cap per upload.
- **Data-copy mechanics.** Use MCP SQL batches or a local script; the file layout for the client and image helper is also the builder's choice.
- **Delta step.** Whether step 4 needs to run at all; skip it if Supabase saw no writes after the copy.
