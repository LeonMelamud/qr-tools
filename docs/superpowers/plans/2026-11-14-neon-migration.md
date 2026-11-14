# Supabase → Neon Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the QR Tools / HypnoRaffle static site off Supabase onto a new Neon project, with all data, open anonymous access, images stored in Postgres, and polling that sleeps when nobody is using the page.

**Architecture:** The browser talks to the Neon Data API (PostgREST-compatible) through `@neon/neon-js`, using short-lived anonymous JWTs from Neon's managed auth. Postgres RLS policies and grants for the `anonymous` role replace Supabase's open policies. Images become `data:` URLs in their rows. Participant polling pauses after 10 idle minutes or while the tab is hidden, and any input resumes it.

**Tech Stack:** Next.js 15.5.29 (static export on GitHub Pages), React 19, TypeScript, `@neon/neon-js` 0.10.2, Vitest 3.2.4 + jsdom 26.1.0 + @testing-library/react 16.3.0.

**Spec:** `docs/superpowers/specs/2026-11-14-neon-migration-design.md`, approved by Leon on 2026-11-14 (commit `d2c06bd`).

## Global Constraints

- **SDK:** `@neon/neon-js` is pinned exact at `0.10.2`. The client is `createClient(<NEXT_PUBLIC_NEON_URL>, { auth: { allowAnonymous: true } })`.
- **Env var:** `NEXT_PUBLIC_NEON_URL` holds the Neon base URL (`https://<endpoint>.<cell>.eu-central-1.aws.neon.tech/neondb`). It replaces `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Allowed origins:** production `https://qr.ai-know.org`, development `http://localhost:9002`. No others.
- **Polling:** the interval stays at `2000` ms. Idle stop is `600000` ms (10 min), overridable only through `NEXT_PUBLIC_POLL_IDLE_MS`. The paused badge text is exactly `Live updates paused, click to resume`.
- **Images:** the long side is at most `800` px. A `data:` URL is capped at `1_000_000` characters (my call). Images are stored in `raffle_images.url` and `qr_refs.logo_url`.
- **Unchanged:** QR URL formats (`/qr-ref?go=<slug>`, `/raffle/qr?session=<id>`), `PasswordGate`, `src/middleware.ts`, `src/components/ui/*`.
- **Typecheck:** must stay at 0 errors. Baseline 2026-11-14: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- **No network in tests:** `vitest.setup.ts` replaces `fetch` with a rejecting stub, and tests mock `@/lib/db` or inject a fake client.
- **Controller-only:** steps marked **(controller)** are never given to an implementer subagent. That covers every write to Neon or Supabase, GitHub secrets, pushes, `.env.local`, the tracker and memory.

## Review Focus

1. **Late joiners while paused.** The host clicks Start Raffle while polling is paused and people joined after the pause. The draw must use a fresh list, not the stale one. Pinned in Task 3: `drawPool fetches before picking when paused`.
2. **Projector tab left open overnight.** The tab stays visible and gets no input. Polling must stop after the idle limit. Pinned in Task 3: `stops polling after idleMs with no change and no input`.
3. **Bad upload file.** Uploading a non-image, an undecodable image, or one still too large after resizing must give a clear error and write nothing. Pinned in Task 2's rejection tests.
4. **Garbage idle override.** A value like `abc`, `0`, `-5` or `Infinity` in `NEXT_PUBLIC_POLL_IDLE_MS` must fall back to `600000` and not disable the guardrail. Pinned in Task 3: `parseIdleMs falls back on invalid input`.
5. **Logo in PNG export.** A logo stored as a `data:` URL must export in the QR PNG without a canvas taint error. Pinned in Task 7, step 4 (manual, since jsdom has no canvas).

---

### Task 1: Test harness and Neon database client

**Files:**
- Modify: `package.json` (deps, `"test": "vitest run"` script), `package-lock.json`
- Create: `vitest.config.ts`, `vitest.setup.ts`, `src/lib/db.ts`, `src/lib/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`src/lib/db.ts`):
  ```ts
  export interface PostgrestError { message: string; details: string; hint: string; code: string }
  export interface PostgrestResponse<T> { data: T | null; error: PostgrestError | null }
  export type ClientFactory = (url: string, opts: { auth: { allowAnonymous: true } }) => NeonLikeClient;
  export class DatabaseClient {
    from<T = unknown>(table: string): ReturnType<NeonLikeClient['from']>; // throws Error('Database not configured') when unconfigured
    rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<PostgrestResponse<T>>;
    isConfigured(): boolean;
  }
  export function createDatabaseClient(url: string, factory?: ClientFactory): DatabaseClient; // default factory: createClient from '@neon/neon-js'
  export const db: DatabaseClient; // createDatabaseClient(process.env.NEXT_PUBLIC_NEON_URL ?? '')
  export default db;
  ```
  `NeonLikeClient` is the minimal `{ from(table: string): any; rpc(fn: string, params?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> }`.

- [ ] **Step 1: Install pinned packages and add the script.**
  Run `npm i -E @neon/neon-js@0.10.2 && npm i -D -E vitest@3.2.4 jsdom@26.1.0 @testing-library/react@16.3.0 @testing-library/dom@10.4.0`, then add `"test": "vitest run"` to `scripts`.
  Expected: `node -e 'console.log(require("@neon/neon-js/package.json").version)'` prints `0.10.2`.

- [ ] **Step 2: Create the harness.**
  - `vitest.config.ts`: environment `jsdom`; `setupFiles: ['./vitest.setup.ts']`; `include: ['src/**/*.test.{ts,tsx}']`; resolve alias `@` → `<root>/src` (it must match `tsconfig.json` `paths`).
  - `vitest.setup.ts`: sets `globalThis.fetch = () => Promise.reject(new Error('network disabled in tests'))`.

- [ ] **Step 3: Write failing tests in `src/lib/db.test.ts`.** The fake factory is `vi.fn(() => fake)`, where `fake = { from: vi.fn(() => 'builder'), rpc: vi.fn() }`.
  - `reports not configured when url is empty`: for both `''` and `'   '`, `isConfigured()` is `false`, `from('sessions')` throws `'Database not configured'`, and `await rpc('x')` equals `{ data: null, error: { message: 'Database not configured', details: '', hint: '', code: 'NOT_CONFIGURED' } }`. The factory is not called.
  - `creates the Neon client with anonymous access`: the factory is called once with `('https://ep-x.c-8.eu-central-1.aws.neon.tech/neondb', { auth: { allowAnonymous: true } })`.
  - `delegates from() to the Neon client`: `from('participants')` returns `'builder'`, and `fake.from` is called with `'participants'`.
  - `returns rpc data on success`: `fake.rpc` resolves `{ data: [{ session_id: 's1', short_code: 'ABC234' }], error: null }`. The result equals `{ data: [...same], error: null }`, and `fake.rpc` is called with `('create_session_with_qr', { session_name: null })`.
  - `maps rpc errors`: a `{ message: 'boom', code: '42501' }` error gives code `'42501'`, and a missing code gives `'RPC_ERROR'`. Both have `details: ''` and `hint: ''`.
  - `maps thrown rpc errors`: `fake.rpc` rejects `new Error('down')`, and the result is `{ data: null, error: { message: 'down', details: '', hint: '', code: 'RPC_ERROR' } }`.

- [ ] **Step 4: Run the tests and confirm they fail.**
  Run: `npx vitest run src/lib/db.test.ts`
  Expected: FAIL with a resolve error for `./db`. Quote that output in the report.

- [ ] **Step 5: Implement `src/lib/db.ts`** to the interface above. The URL is trimmed before the empty check.

- [ ] **Step 6: Run the gates.**
  Run: `npx vitest run src/lib/db.test.ts && npm run typecheck`
  Expected: 6 passed, and tsc prints no errors.

- [ ] **Step 7: Commit.**
  `git add package.json package-lock.json vitest.config.ts vitest.setup.ts src/lib/db.ts src/lib/db.test.ts && git commit -m "Add Vitest harness and Neon Data API client"`

---

### Task 2: Image file → `data:` URL helper

**Files:**
- Create: `src/lib/image-data-url.ts`, `src/lib/image-data-url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const MAX_IMAGE_DIMENSION = 800;
  export const MAX_DATA_URL_LENGTH = 1_000_000;
  export function scaledSize(width: number, height: number, maxDim?: number): { width: number; height: number };
  export function outputMimeFor(inputType: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
  export function fileToDataUrl(file: File, maxDim?: number): Promise<string>; // rejects with Error(user-facing message)
  ```

**Behaviour:**
- `scaledSize` keeps the aspect ratio and never upscales. It rounds to integers of at least 1, and throws `RangeError` for a non-finite or ≤ 0 input.
- `outputMimeFor` keeps jpeg, webp and svg+xml as they are and maps any other `image/*` to `image/png`. A non-image type throws `Error('Not an image file')`.
- `fileToDataUrl`:
  - A non-image file rejects `'Not an image file'`.
  - SVG is read with `FileReader.readAsDataURL` and returned unchanged.
  - Anything else is decoded with `createImageBitmap(file)`, which rejects `'Could not read this image'` on failure. It is then drawn on a canvas at `scaledSize` and returned via `canvas.toDataURL(mime, 0.9)`.
  - A result longer than `MAX_DATA_URL_LENGTH` rejects `'Image is too large after resizing'`.

- [ ] **Step 1: Write failing tests.**
  - `scaledSize`:
    - `(1600, 800)` → `{width: 800, height: 400}`;
    - `(400, 1200)` → `{267, 800}`;
    - `(300, 200)` → `{300, 200}`;
    - `(1, 5000)` → `{1, 800}`;
    - each of `NaN`, `Infinity`, `0` and `-1` in either argument throws `RangeError`.
  - `outputMimeFor`:
    - `image/jpeg` → `image/jpeg`;
    - `image/webp` → `image/webp`;
    - `image/svg+xml` → `image/svg+xml`;
    - `image/gif` and `image/png` → `image/png`;
    - `text/plain` and `''` throw `'Not an image file'`.
  - `rejects non-image files`: `fileToDataUrl(new File(['hi'], 'a.txt', { type: 'text/plain' }))` rejects `'Not an image file'`.
  - `passes SVG through`: an SVG `File` resolves to a string starting `data:image/svg+xml;base64,`.
  - `rejects undecodable images`: `globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('bad'))` → rejects `'Could not read this image'`.
  - `rejects results over the cap`: `createImageBitmap` resolves `{ width: 800, height: 800, close() {} }`. Stub `HTMLCanvasElement.prototype.getContext` → `{ drawImage: vi.fn() }`, and `toDataURL` → `'data:image/png;base64,' + 'A'.repeat(1_000_001)`. The call rejects `'Image is too large after resizing'`.
  - `resizes to the max dimension`: the bitmap is 1600×800, and `toDataURL` returns `'data:image/png;base64,AAAA'`. It resolves that string, and the canvas created via `document.createElement('canvas')` (spy) has width 800 and height 400.

- [ ] **Step 2: Run and confirm failure.** `npx vitest run src/lib/image-data-url.test.ts` → FAIL (module missing). Quote it.
- [ ] **Step 3: Implement** to the behaviour above.
- [ ] **Step 4: Run the gates.** `npx vitest run src/lib/image-data-url.test.ts && npm run typecheck` → all pass, 0 tsc errors.
- [ ] **Step 5: Commit.** `git add src/lib/image-data-url.ts src/lib/image-data-url.test.ts && git commit -m "Add image to data URL helper with 800px downscale"`

---

### Task 3: Live updates that pause when idle or hidden

**Files:**
- Create:
  - `src/lib/poll-gate.ts`, `src/lib/poll-gate.test.ts`
  - `src/lib/draw-pool.ts`, `src/lib/draw-pool.test.ts`
  - `src/components/raffle/LivePausedBadge.tsx`, `src/components/raffle/LivePausedBadge.test.tsx`
  - `src/hooks/use-participants.test.tsx`
- Modify:
  - `src/hooks/use-participants.ts`
  - `src/context/ParticipantsContext.tsx`
  - `src/app/raffle/page.tsx` (`handleStartRaffle`, badge)
  - `src/app/raffle/qr-display/page.tsx` (badge)

**Interfaces:**
- Consumes: `db` from `@/lib/db` (Task 1). `use-participants.ts` switches its import to `@/lib/db` in this task, and its tests `vi.mock('@/lib/db')`.
- Produces:
  ```ts
  // poll-gate.ts
  export const DEFAULT_POLL_IDLE_MS = 600_000;
  export function parseIdleMs(raw: string | undefined): number;
  export function isPollingPaused(s: { now: number; lastActivityAt: number; lastChangeAt: number; hidden: boolean; idleMs: number }): boolean;
  // draw-pool.ts
  export function drawPool(opts: { isPaused: boolean; available: Participant[]; refetch: () => Promise<Participant[]> }): Promise<Participant[]>;
  // use-participants.ts — options gain idleMs?: number (default DEFAULT_POLL_IDLE_MS) and now?: () => number (default Date.now)
  //   return gains isPaused: boolean, resume: () => void; refetch becomes () => Promise<Participant[]>
  // ParticipantsContext value gains isLivePaused: boolean, resumeLive: () => void; refetch: () => Promise<Participant[]>
  // LivePausedBadge.tsx
  export function LivePausedBadge(props: { paused: boolean; onResume: () => void }): JSX.Element | null;
  ```

**Behaviour:**
- `parseIdleMs` fails closed, toward the default. Anything that isn't a finite integer > 0 returns `600000`.
- `isPollingPaused` returns `true` in any of these cases; otherwise it returns `false`:
  - `hidden` is true;
  - any number input is non-finite (fail closed: no polling; one click resumes);
  - `now - max(lastActivityAt, lastChangeAt) >= idleMs`.
- **The hook:**
  - Each 2000 ms tick evaluates the gate. If paused, it sets `isPaused = true` and skips the fetch; otherwise it fetches.
  - A fetch whose result differs (JSON compare) from the previous one updates `lastChangeAt`.
  - `pointerdown`, `keydown` and `touchstart` on `window` update `lastActivityAt`. If polling was paused, that input also triggers an immediate fetch and sets `isPaused = false`.
  - `visibilitychange` to visible counts as activity.
- **The context** passes `idleMs = parseIdleMs(process.env.NEXT_PUBLIC_POLL_IDLE_MS)`.
- **`drawPool`:** when paused, it awaits `refetch()` and returns the rows with `!won`; otherwise it returns `available` without calling `refetch`.
- **`handleStartRaffle`** becomes async and picks with `secureRandom` from `await drawPool({ isPaused: isLivePaused, available: availableParticipants, refetch })`. An empty pool shows the existing "Raffle is empty!" toast.
- **The badge** renders nothing when not paused. When paused, it renders a button with exactly the text `Live updates paused, click to resume`, which calls `onResume`. It is placed top-centre on `/raffle` and `/raffle/qr-display`.

- [ ] **Step 1: Write failing tests.**
  - `poll-gate.test.ts`:
    - `parseIdleMs falls back on invalid input`: `undefined`, `''`, `'abc'`, `'0'`, `'-5'`, `'Infinity'`, `'1e400'` and `'12.5'` each → `600000`.
    - `parseIdleMs accepts a positive integer`: `'30000'` → `30000`.
    - `isPollingPaused`:
      - hidden → `true`;
      - `now: NaN` → `true`;
      - `now - last === idleMs` → `true`;
      - `now - last === idleMs - 1` → `false`;
      - the most recent of the two timestamps counts.
  - `draw-pool.test.ts`:
    - `drawPool fetches before picking when paused`: `refetch` resolves `[a(won:false), b(won:true)]`, and the result is `[a]`.
    - `drawPool uses the current list when live`: the result `===` `available`, and `refetch` was not called.
  - `use-participants.test.tsx`, using `renderHook`, `vi.useFakeTimers()` and a mocked db chain `from().select().eq().order()` that resolves `{ data, error: null }` and counts calls:
    - `polls every 2000 ms while active`: after `advanceTimersByTime(6000)` there are 4 fetches.
    - `stops polling after idleMs with no change and no input`: with `idleMs: 10_000`, after 12 s `isPaused` is `true`, and the fetch count stays unchanged across a further 10 s.
    - `a change in participants resets the idle clock`: data changes at 8 s, so fetches still happen at 14 s.
    - `pointerdown resumes with an immediate fetch`: while paused, `window.dispatchEvent(new Event('pointerdown'))` causes one fetch before any timer advance, and `isPaused` becomes `false`.
    - `pauses while hidden and resumes on visibilitychange`: stub `document.visibilityState` to `'hidden'` and dispatch, then confirm no fetches over 6 s. Set it to `'visible'` and dispatch, and confirm an immediate fetch.
    - `refetch returns the fetched list`.
  - `LivePausedBadge.test.tsx`:
    - with `paused: false` it renders nothing;
    - with `paused: true` it shows the exact text, and a click calls `onResume` once.

- [ ] **Step 2: Run and confirm failure.** `npx vitest run src/lib/poll-gate.test.ts src/lib/draw-pool.test.ts src/hooks/use-participants.test.tsx src/components/raffle/LivePausedBadge.test.tsx` → FAIL. Quote it.
- [ ] **Step 3: Implement** the modules, hook, context, badge and page wiring to the behaviour above.
- [ ] **Step 4: Run the gates.** `npx vitest run && npm run typecheck` → all pass, 0 tsc errors.
- [ ] **Step 5: Commit.** `git add -A src && git commit -m "Pause participant polling when idle or hidden; fetch before drawing"`

---

### Task 4: Images in Postgres, and every page on the Neon client

**Files:**
- Create: `src/lib/qr-redirect.ts`, `src/lib/qr-redirect.test.ts`
- Modify: `src/app/raffle/page.tsx`, `src/app/qr-ref/page.tsx`, `src/app/raffle/qr/page.tsx`, `src/hooks/use-session.ts`, `src/types/index.ts`

**Interfaces:**
- Consumes: `db` (Task 1), and `fileToDataUrl` with its rejection messages (Task 2).
- Produces: `export const QR_REDIRECT_COLUMNS = 'id,slug,target_url,is_active,expires_at,scan_count';`. `RaffleImage` loses `storage_path`.

**Behaviour:**
- **Imports.** Every `lib/supabase` import except `src/app/admin/*` (deleted in Task 5) becomes `@/lib/db` (or the matching relative path).
- **Gallery upload.**
  1. `const url = await fileToDataUrl(file)`. On rejection, show a destructive toast titled "Upload failed" with the error message, and write nothing.
  2. `db.from('raffle_images').insert({ url, alt: file.name.replace(/\.[^.]+$/, '') })`.
  3. Show the existing "Image added" toast, then refetch.
- **Gallery delete** is `db.from('raffle_images').delete().eq('id', current.id)` only.
- **QR logo upload.** The 500 KB pre-check goes, and `fileToDataUrl` errors are toasted instead. Then `.update({ logo_url: dataUrl })` as today.
- **QR redirect** selects `QR_REDIRECT_COLUMNS` instead of `'*'`. The rest of the redirect is unchanged.

- [ ] **Step 1: Write failing tests** in `qr-redirect.test.ts`:
  - `does not load the logo`: the column list split on `,` doesn't include `logo_url`.
  - `has every field the redirect reads`: it includes `id`, `slug`, `target_url`, `is_active`, `expires_at` and `scan_count`.
- [ ] **Step 2: Run** `npx vitest run src/lib/qr-redirect.test.ts` → FAIL. Quote it.
- [ ] **Step 3: Implement** the constant and the page, hook and type changes above.
- [ ] **Step 4: Run the gates.**
  - `npx vitest run && npm run typecheck` → all pass, 0 errors.
  - `grep -rnE "lib/supabase|getSupabaseClient|supabaseAuth|storage\.from" src --include='*.ts' --include='*.tsx' | grep -v "^src/app/admin/\|^src/lib/supabase.ts"` → no output.
- [ ] **Step 5: Commit.** `git commit -am "Store gallery images and QR logos as data URLs; use the Neon client"` (plus `git add` for the new files).

---

### Task 5: Remove admin login and Supabase; update config and docs

**Files:**
- Delete:
  - `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`
  - `src/app/login/page.tsx`, `src/app/auth/callback/page.tsx`
  - `src/hooks/use-user-profile.ts`, `src/components/auth/user-profile.tsx`
  - `src/lib/supabase.ts`
- Modify:
  - `src/app/page.tsx`: drop the `UserProfile` import and its `absolute top-4 right-4` wrapper.
  - `package.json`, `package-lock.json`
  - `.github/workflows/deploy.yml`: replace the two `NEXT_PUBLIC_SUPABASE_*` lines with `NEXT_PUBLIC_NEON_URL: ${{ secrets.NEXT_PUBLIC_NEON_URL }}`.
  - `.env.example`, `AGENTS.md`, `README.md`: Supabase setup becomes Neon setup (Data API with anonymous access, `NEXT_PUBLIC_NEON_URL`, `docs/neon/schema.sql`).
- Unchanged: `Dockerfile` and `docker-compose.yml`, which have no Supabase references (`grep -n SUPABASE Dockerfile docker-compose.yml` → no output on 2026-11-14).

- [ ] **Step 1: Delete the files and uninstall the packages.**
  `npm uninstall @supabase/supabase-js @supabase/auth-helpers-nextjs @supabase/auth-helpers-react`
- [ ] **Step 2: Make the config and docs edits** listed above.
- [ ] **Step 3: Run the gates.**
  - `grep -rni supabase src package.json .github/workflows` → no output.
  - `npx vitest run && npm run typecheck` → pass, 0 errors.
  - `GITHUB_PAGES=true NEXT_PUBLIC_NEON_URL=https://example.invalid/neondb npm run build`:
    - exits `0`;
    - its route table lists `/`, `/qr-ref`, `/raffle`, `/raffle/qr`, `/raffle/qr-display` and `/_not-found`;
    - it has no `/admin`, `/login` or `/auth/callback`.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Remove unused admin login and Supabase; configure Neon"`

---

### Task 6 (controller): Provision Neon `hypnoraffle`, apply the schema, copy data and logos

All of these are live writes, done by the controller with the Neon and Supabase MCP tools. Org is `org-shy-heart-18150620` (ai.dream.influencers). Never touch project `odd-heart-99080089`.

- [ ] **Step 1: Create the project.** `create_project` with name `hypnoraffle`, region `aws-eu-central-1`, `pg_version` 17. Then `get_default_branch` → BRANCH.
- [ ] **Step 2: Enable the Data API.** `provision_neon_data_api` with:
  - `database_name: neondb`, `auth_provider: neon_auth`, `add_default_grants: false`;
  - settings `{ db_anon_role: 'anonymous', server_cors_allowed_origins: 'https://qr.ai-know.org,http://localhost:9002' }`.
  Record the returned URL. BASE_URL is that URL without `.apirest` and without the trailing `/rest/v1`.
- [ ] **Step 3: Lock down Neon Auth.**
  - `add_auth_trusted_domain` for `https://qr.ai-know.org`.
  - Turn off email/password sign-up (`update_auth_email_and_password`).
  - `delete_auth_oauth_provider` for `google`.
  - Gate: `get_neon_auth_config` shows that trusted origin, email/password sign-up off and `oauth_providers: []`.
- [ ] **Step 4: Write and apply the schema.** Write `docs/neon/schema.sql`, transcribed from the live Supabase catalogs (queries in the spec session: `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_get_functiondef`). It contains:
  - the 5 tables with their columns, defaults, PKs, FKs, uniques and indexes;
  - `generate_short_code`, and `create_session_with_qr` (SECURITY DEFINER, `set search_path = public`);
  - `update_qr_refs_updated_at` and its trigger;
  - RLS enabled on all 5 tables, each with one policy `for all to anonymous using (true) with check (true)`;
  - grants: usage on schema public, `select, insert, update, delete` on the 5 tables, and `execute` on `create_session_with_qr` to `anonymous`.

  Apply it with `run_sql_transaction`, then refresh the schema cache with `update_data_api`. Gates on Neon:
  - `select table_name from information_schema.tables where table_schema='public' order by 1` → `participants, qr_refs, raffle_images, raffle_qr_refs, sessions`.
  - `select table_name, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee='anonymous' group by 1 order by 1` → each of the 5 tables shows `DELETE,INSERT,SELECT,UPDATE`.
  - `select count(*) from pg_policies where schemaname='public'` → `5`.

  Commit `docs/neon/schema.sql` on the migration branch.
- [ ] **Step 5: Check CORS and anonymous access.**
  - `curl -s -D - -o /dev/null -X OPTIONS '<DATA_API>/sessions' -H 'Origin: https://qr.ai-know.org' -H 'Access-Control-Request-Method: GET'` shows `access-control-allow-origin: https://qr.ai-know.org`. Repeat with `http://localhost:9002`.
  - `curl -s '<BASE_URL host with .neonauth>/neondb/auth/token/anonymous' -H 'Origin: http://localhost:9002'` returns JSON with `token`. A GET of `sessions?select=id&limit=1` with that bearer token returns `200`, and without a token `401`.
- [ ] **Step 6: Copy the data.**
  1. Record `COPY_TS` with `select now()` on Supabase.
  2. For `sessions`, `raffle_qr_refs`, `participants` and `qr_refs`, in that order, take Supabase `select json_agg(t) from (select * from <table>) t`.
  3. Insert into Neon with `insert into public.<table> select * from json_populate_recordset(null::public.<table>, $j$<json>$j$)`.
- [ ] **Step 7: Verify the copy.** Run this fingerprint on both databases; the outputs must be identical:
  ```sql
  select 'sessions' t, count(*)::text c, max(created_at)::text m, md5(string_agg(id::text, ',' order by id)) h from sessions
  union all select 'participants', count(*)::text, max(created_at)::text, md5(string_agg(id::text||coalesce(won::text,''), ',' order by id)) from participants
  union all select 'raffle_qr_refs', count(*)::text, max(created_at)::text, md5(string_agg(id::text||short_code, ',' order by id)) from raffle_qr_refs
  union all select 'qr_refs', count(*)::text, sum(scan_count)::text, md5(string_agg(id::text||slug||target_url, ',' order by id)) from qr_refs;
  ```
  Supabase counts on 2026-11-14 were 344, 227, 10 and 9.
- [ ] **Step 8: Convert the logos.** Take each Supabase `qr_refs` row whose `logo_url like '%supabase.co%'`:
  1. Fetch it with `curl -sf <url>`, and take the content type from `curl -sI`.
  2. Run `update qr_refs set logo_url = 'data:<type>;base64,<b64>' where id = '<id>'` on Neon.

  Gate on Neon: `select count(*) filter (where logo_url like 'data:image/%'), count(*) filter (where logo_url like '%supabase.co%') from qr_refs` → `5 | 0`.

---

### Task 7 (controller): Local end-to-end check against Neon

- [ ] **Step 1: Point local at Neon.** Set `NEXT_PUBLIC_NEON_URL=<BASE_URL>` in `.env.local` (gitignored). Record `T_START` with `select now()` on Neon. Start the dev server, without the password gate and without the winner webhook:
  `SITE_AUTH_USERNAME= SITE_AUTH_PASSWORD= NEXT_PUBLIC_SITE_PASSWORD_HASH= NEXT_PUBLIC_WINNER_WEBHOOK_URL= NEXT_PUBLIC_POLL_IDLE_MS=60000 npx next dev -p 9002`
- [ ] **Step 2: Sessions and draws** (in Island at `http://localhost:9002`):
  - On `/raffle`, a new session is created.
  - Two joins via `/raffle/qr?session=<id>` appear on `/raffle` within 4 s.
  - A draw picks one of them.
  - "Prepare Next Round" sets `won = true` on that row in Neon.
- [ ] **Step 3: Gallery.** On `/raffle`, upload a 1600 px PNG to the gallery. A row appears with `url like 'data:image/png%'` and `length(url) < 1000000`, and the carousel shows it. Delete it, and the row is gone and the static list is back.
- [ ] **Step 4: QR codes.** On `/qr-ref`:
  1. Create a temporary QR `claude-e2e-<ts>` targeting `https://example.com`.
  2. Upload a logo, and confirm `logo_url like 'data:%'`.
  3. Download the PNG, and confirm the file has the logo and no console `SecurityError` (Review Focus 5).
  4. Open `/qr-ref?go=claude-e2e-<ts>`: it lands on example.com and `scan_count` becomes 1.
  5. Delete the temporary QR.
- [ ] **Step 5: Network check.** Over 60 s on `/raffle` with the mouse moving, `performance.getEntriesByType('resource')` shows about 30 `.apirest.` requests and at most 2 `.neonauth.` requests.
- [ ] **Step 6: Idle stop.**
  1. With no input for 62 s, the badge reads `Live updates paused, click to resume`.
  2. No `.apirest.` request appears for the next 10 s.
  3. One click gives an immediate request, and the badge disappears.
- [ ] **Step 7: Clean up.** Delete the test rows (`participants`, `raffle_qr_refs`, `sessions` with `created_at > T_START`, ids listed in the report), then re-run the Task 6 fingerprint. `qr_refs` must match its Task 6 output. Stop the dev server.

---

### Task 8 (controller, needs Leon's explicit yes): Cutover

- [ ] **Step 1: Ask Leon** for one yes covering:
  - setting repo secret `NEXT_PUBLIC_NEON_URL=<BASE_URL>` on `LeonMelamud/qr-tools`;
  - fast-forwarding `main` to the migration branch;
  - `git push personal main`, which deploys `37e81fa` (logo), `1c72d0c` (Next bump), `d2c06bd` (spec), this plan and the migration commits.
- [ ] **Step 2: Catch-up copy before the push.**
  - On Supabase, count rows with `created_at > COPY_TS` in `sessions`, `raffle_qr_refs` and `participants`, and copy any into Neon (`on conflict (id) do nothing`).
  - For `qr_refs`, compare `scan_count` per id and add the difference on Neon.
  - Re-run the fingerprint.
- [ ] **Step 3: Deploy.**
  1. `gh secret set NEXT_PUBLIC_NEON_URL -R LeonMelamud/qr-tools --body '<BASE_URL>'`
  2. `git checkout main && git merge --ff-only <branch> && git push personal main`
  3. `gh run list -R LeonMelamud/qr-tools --workflow deploy.yml -L 1` → `completed success`.
- [ ] **Step 4: Production checks.**
  - A temporary QR inserted on Neon redirects from `https://qr.ai-know.org/qr-ref?go=<slug>` and its `scan_count` becomes 1; delete it after.
  - Leon unlocks `/raffle` in Island (site password; Claude never types it). A session is created, and Leon joins from his phone via the QR.
  - The browser network log shows `.neon.tech` requests and no `supabase.co`.
- [ ] **Step 5: Second catch-up copy.** About 15 min after the deploy, repeat Step 2.
- [ ] **Step 6: Close out.**
  - Tracker sweep and any row update.
  - Memory note: Neon project id, org, and that Supabase is kept as a paused backup.
  - Remove the worktree once merged.
