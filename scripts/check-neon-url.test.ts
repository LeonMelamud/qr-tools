// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 2026-11-14 branch review, finding 5: db.ts turns a bad NEXT_PUBLIC_NEON_URL into
// "Database not configured" at runtime, so without this check a missing or mistyped
// secret builds green and deploys a site where every query fails.
const SCRIPT = fileURLToPath(new URL('./check-neon-url.mjs', import.meta.url));

function check(value?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NEXT_PUBLIC_NEON_URL;
  if (value !== undefined) env.NEXT_PUBLIC_NEON_URL = value;
  return spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
}

describe('scripts/check-neon-url.mjs', () => {
  it('fails when the value is missing or blank', () => {
    for (const value of [undefined, '', '   ']) {
      const r = check(value);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('NEXT_PUBLIC_NEON_URL is not set');
    }
  });

  it('fails when the Neon SDK rejects the value', () => {
    const r = check('https://example.invalid/neondb');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NEXT_PUBLIC_NEON_URL is not a valid Neon URL');
  });

  it('passes a well-formed Neon base URL', () => {
    const r = check('https://ep-example-123456.c-1.eu-central-1.aws.neon.tech/neondb');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('NEXT_PUBLIC_NEON_URL is a valid Neon URL');
  });
});
