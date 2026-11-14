// Deploy guard: fails when NEXT_PUBLIC_NEON_URL is missing or not a Neon base URL.
// src/lib/db.ts turns a bad value into "Database not configured" at runtime (so pages
// still build), which would ship a site where every query fails. Failing here keeps
// the last good deploy live instead. Run by .github/workflows/deploy.yml before Build.
import { defaultDeriveNeonUrls } from '@neon/neon-js';

const value = (process.env.NEXT_PUBLIC_NEON_URL ?? '').trim();

if (!value) {
  console.error('::error::NEXT_PUBLIC_NEON_URL is not set. Add it as a repository secret (Settings > Secrets and variables > Actions).');
  process.exit(1);
}

try {
  defaultDeriveNeonUrls(value);
} catch (err) {
  console.error(`::error::NEXT_PUBLIC_NEON_URL is not a valid Neon URL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

console.log('NEXT_PUBLIC_NEON_URL is a valid Neon URL');
