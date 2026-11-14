import { describe, it, expect } from 'vitest';
import { QR_REDIRECT_COLUMNS } from './qr-redirect';

const columns = () => QR_REDIRECT_COLUMNS.split(',').map(c => c.trim());

describe('QR_REDIRECT_COLUMNS', () => {
  it('does not load the logo', () => {
    expect(columns()).not.toContain('logo_url');
  });

  it('has every field the redirect reads', () => {
    for (const c of ['id', 'slug', 'target_url', 'is_active', 'expires_at', 'scan_count']) {
      expect(columns()).toContain(c);
    }
  });
});
