# Move QR logos & raffle gallery images to Supabase Storage

## Problem

1. **QR logo bug** (`/qr-ref`, the "QR Reference Manager"): the center logo shown/embedded on a QR code lives only in a single React state variable (`logoUrl`, default `/images/Bandit.png`), populated via `FileReader.readAsDataURL()`. It is never persisted, and never reset when the selected QR code changes. Result: switching between QR codes shows whichever logo was last uploaded in the browser session, not the logo that belongs to that QR code, and a page reload always reverts to `Bandit.png`.
2. **Raffle gallery images require a code push** (`/raffle`): the "raining logos" carousel is sourced from files committed under `public/images/`, scanned at build time by `scripts/generate-image-manifest.mjs` into `src/lib/placeholder-images.json`. The page also calls `fetch('/api/images')`, but no such API route exists in this statically-exported app, so that call always fails and silently falls back to the build-time manifest. Adding or removing a gallery image today means committing a file and redeploying.

## Goal

Move image storage off the local filesystem / component state and onto Supabase (already used for `qr_refs`, `participants`, etc.):

- Each QR code's logo is saved per-record and reloads correctly.
- Raffle gallery images can be uploaded and deleted from the web UI, no deploy required.

## Architecture

- **Object storage**: two public Supabase Storage buckets, `qr-logos` and `raffle-images`. Public read + public write (anon key), matching the existing open RLS posture of `qr_refs`/`participants` — this is a personal/internal tool with no real auth layer (the password gates on `/qr-ref` and `/raffle` are client-side only), so storage policies follow the same pattern rather than introducing new access control.
- **Metadata**: the DB stores only the resulting public URL (and storage path, for deletion), not raw image bytes. Standard approach for images — avoids Postgres row-size bloat and slow reads that come with storing base64/bytea in table rows.

## Manual Supabase setup (done by you, not by code)

Nothing here can be scripted from the repo — it requires the Supabase dashboard for this project. Do these before/alongside the code changes:

1. **Storage → New bucket** → name `qr-logos` → toggle **Public bucket: ON**. Repeat for a second bucket named `raffle-images`.
2. **SQL Editor** → run the schema migration for each feature (SQL given in each section below).
3. **SQL Editor** → run the Storage RLS policies below. The "Public bucket" toggle only lets anyone *read* objects via their public URL — insert/delete still go through Row Level Security on `storage.objects`, so without these, uploads/deletes from the app will fail with a 403.

```sql
-- qr-logos bucket
create policy "Public read qr-logos" on storage.objects for select using (bucket_id = 'qr-logos');
create policy "Public upload qr-logos" on storage.objects for insert with check (bucket_id = 'qr-logos');
create policy "Public delete qr-logos" on storage.objects for delete using (bucket_id = 'qr-logos');

-- raffle-images bucket
create policy "Public read raffle-images" on storage.objects for select using (bucket_id = 'raffle-images');
create policy "Public upload raffle-images" on storage.objects for insert with check (bucket_id = 'raffle-images');
create policy "Public delete raffle-images" on storage.objects for delete using (bucket_id = 'raffle-images');
```

## 1. QR logo persistence

### Schema change (`docs/qr_logo_migration.sql`, applied manually via Supabase SQL editor, same convention as `docs/qr_refs_schema.sql`)

```sql
alter table qr_refs add column if not exists logo_url text;
```

No default is set in SQL. The "Bandit.png as default logo" behavior is instead handled by seeding: after the `qr-logos` bucket exists, the existing `public/images/Bandit.png` is uploaded to it once, and its public URL is used as the default value for `logoUrl` state when creating a *new* QR code in the UI (not a DB column default) — keeps the DB schema simple and the default logic in one place (the form's `EMPTY_FORM`/create flow).

### Code changes (`src/app/qr-ref/page.tsx`)

- Remove the standalone `logoUrl` / `setLogoUrl` state that currently persists across QR selections.
- Logo now comes from `selectedQr.logo_url` (falls back to the seeded Bandit URL when null, matching current default behavior for codes that have never had a logo set).
- `handleLogoUpload`: upload the selected file to the `qr-logos` bucket (path like `{qr.id}-{Date.now()}.{ext}`), get the public URL, `update qr_refs set logo_url = <url> where id = selectedQr.id`, update `selectedQr`/`qrRefs` state from the DB response — same pattern already used by `handleUpdate`.
- `removeLogo`: `update qr_refs set logo_url = null where id = selectedQr.id`. The old Storage object is not deleted (orphaned files just sit unused in the bucket — fine at this scale; a cleanup pass can be added later if the bucket grows large).
- `handleSelectQr` / `resetForm`: no longer need to manage `logoUrl` separately — it falls out of `selectedQr` automatically, which is the actual bug fix.
- The 500KB client-side file size check stays as-is.

### Type change (`src/types/index.ts`)

Add `logo_url?: string;` to the `QrRef` interface.

## 2. Raffle gallery images

### Schema change (`docs/raffle_images_schema.sql`)

```sql
create table if not exists raffle_images (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  storage_path text not null,
  alt text,
  created_at timestamptz default now()
);

alter table raffle_images enable row level security;

create policy "Public can view raffle images" on raffle_images for select using (true);
create policy "Public can insert raffle images" on raffle_images for insert with check (true);
create policy "Public can delete raffle images" on raffle_images for delete using (true);
```

### Code changes (`src/app/raffle/page.tsx`)

- `fetchImages` no longer calls the nonexistent `/api/images`; it queries `db.from('raffle_images').select('*').order('created_at')` directly and maps rows to `AvailableImage` (`{ id, src: url, alt }`).
- Add an upload control next to the existing carousel controls (alongside the refresh button): file input → upload to `raffle-images` bucket → insert a `raffle_images` row → refetch.
- Add a delete control (e.g. a trash icon shown on the currently displayed image) that deletes the Storage object and its `raffle_images` row, then refetches.
- The static `placeholderData.images` fallback stays as the last-resort default (e.g. first run before any images are uploaded, or if Supabase is unreachable) — same role it plays today.
- The existing "click image to upload a temporary Custom Logo for this round" feature (`handleLogoChange` / `customLogoUrl` / `handleFileChange`) is unchanged — it's an intentionally ephemeral per-round override, not part of the persistent gallery, and is out of scope here.

### Cleanup

- Delete `scripts/generate-image-manifest.mjs`.
- Remove the `predev`, `prebuild`, and `images:manifest` entries from `package.json`.
- Remove the `images` array from `src/lib/placeholder-images.json` (keep it as an empty array, or drop the key — the unrelated `placeholderImages` field in the same file stays untouched, it's used by `src/lib/placeholder-images.ts` for something else).

## 3. Migrating the existing 7 images

No migration script. Once the raffle upload UI and the QR logo upload path both exist, the existing files in `public/images/` (`Bandit.png`, `ail_logo.png`, `ai lead.png`, `linkedin_profile.jpeg`, `linkedin-qr-leon.svg`, `mcp_community.svg`, `n8n_LinkedIn_Profile_Cover.png`) are re-uploaded once through the browser:

- `Bandit.png` → uploaded to `qr-logos` bucket, its URL becomes the new-QR default.
- All 7 → uploaded to `raffle-images` bucket via the new raffle upload button, seeding the gallery.

This doubles as manual end-to-end testing of both upload paths. Once done, `public/images/*` can be deleted from the repo and `next/image`/`<Image>` references to local paths are gone.

## Testing / verification

No automated test suite exists for this app — `AGENTS.md` only calls for `npm run typecheck`, `npm run lint`, and `npm run build`. Beyond those, verification is manual:

- Create QR code A, upload a logo, switch to QR code B (no logo set) — B must show no logo (or the default), not A's logo. Switch back to A — A's logo must still be there. Reload the page — both must persist.
- Upload an image to the raffle gallery, confirm it appears in the carousel without a rebuild/redeploy. Delete it, confirm it disappears and the Storage object is gone.
- Confirm `npm run build` / `npm run dev` still work with the manifest script removed.
