import { describe, it, expect } from 'vitest';
import { parseIdleMs, isPollingPaused, DEFAULT_POLL_IDLE_MS } from './poll-gate';

describe('parseIdleMs', () => {
  it('parseIdleMs falls back on invalid input', () => {
    for (const raw of [undefined, '', 'abc', '0', '-5', 'Infinity', '1e400', '12.5']) {
      expect(parseIdleMs(raw)).toBe(DEFAULT_POLL_IDLE_MS);
    }
    expect(DEFAULT_POLL_IDLE_MS).toBe(600_000);
  });

  it('parseIdleMs accepts a positive integer', () => {
    expect(parseIdleMs('30000')).toBe(30_000);
  });
});

describe('isPollingPaused', () => {
  const base = { now: 100_000, lastActivityAt: 95_000, lastChangeAt: 90_000, hidden: false, idleMs: 10_000 };

  it('pauses while the tab is hidden', () => {
    expect(isPollingPaused({ ...base, hidden: true })).toBe(true);
  });

  it('fails closed on non-finite numbers', () => {
    expect(isPollingPaused({ ...base, now: NaN })).toBe(true);
    expect(isPollingPaused({ ...base, idleMs: Infinity })).toBe(true);
    expect(isPollingPaused({ ...base, lastActivityAt: NaN })).toBe(true);
  });

  it('pauses exactly at the idle limit and not before', () => {
    expect(isPollingPaused({ ...base, now: 105_000 })).toBe(true); // 105_000 - 95_000 === idleMs
    expect(isPollingPaused({ ...base, now: 104_999 })).toBe(false);
  });

  it('counts the most recent of activity and change', () => {
    expect(isPollingPaused({ ...base, now: 108_000, lastActivityAt: 90_000, lastChangeAt: 99_000 })).toBe(false);
    expect(isPollingPaused({ ...base, now: 108_000, lastActivityAt: 99_000, lastChangeAt: 90_000 })).toBe(false);
    expect(isPollingPaused({ ...base, now: 110_000, lastActivityAt: 99_000, lastChangeAt: 90_000 })).toBe(true);
  });
});
