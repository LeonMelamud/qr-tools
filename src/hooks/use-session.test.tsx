import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));

vi.mock('@/lib/db', () => ({
  db: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.single = async () => h.result;
      return q;
    },
  },
}));

import { useSession } from './use-session';

const KEY = 'hypnoraffle_session_id';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('useSession: loading the stored session on page load', () => {
  // 2026-11-14 branch review: a refresh during a passing failure (Neon Auth token, cold
  // compute, network) dropped the stored session id, and the host had to find and
  // re-enter it mid-event. Refreshing is the documented way to wake live updates.
  it('keeps the stored session id when loading fails for a passing reason', async () => {
    localStorage.setItem(KEY, 's1');
    h.result = { data: null, error: { message: 'Failed to fetch', code: '' } };
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('Failed to fetch');
    expect(localStorage.getItem(KEY)).toBe('s1');
  });

  // Guard (passes before the fix too): the Neon Data API answers .single() on zero rows
  // with 200 and a null body (probed 2026-11-14), which means the session is gone.
  it('forgets the stored session id when the session no longer exists', async () => {
    localStorage.setItem(KEY, 'gone');
    h.result = { data: null, error: null };
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
