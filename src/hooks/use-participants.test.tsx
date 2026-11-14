import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { Participant } from '../types';

const state = vi.hoisted(() => ({ data: [] as unknown[], calls: 0 }));

vi.mock('@/lib/db', () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => {
            state.calls++;
            return Promise.resolve({ data: state.data, error: null });
          },
        }),
      }),
    }),
  },
}));

import { useParticipants } from './use-participants';

const p = (id: string): Participant => ({ id, name: id, last_name: 'X', display_name: id, won: false });

let visibility: DocumentVisibilityState = 'visible';

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  state.data = [];
  state.calls = 0;
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useParticipants live polling', () => {
  it('polls every 2000 ms while active', async () => {
    renderHook(() => useParticipants({ sessionId: 's1' }));
    await advance(0);
    await advance(6000);
    expect(state.calls).toBe(4);
  });

  it('stops polling after idleMs with no change and no input', async () => {
    const { result } = renderHook(() => useParticipants({ sessionId: 's1', idleMs: 10_000 }));
    await advance(12_000);
    expect(result.current.isPaused).toBe(true);
    const frozen = state.calls;
    await advance(10_000);
    expect(state.calls).toBe(frozen);
  });

  it('a change in participants resets the idle clock', async () => {
    const { result } = renderHook(() => useParticipants({ sessionId: 's1', idleMs: 10_000 }));
    await advance(7000);
    state.data = [p('a')];
    await advance(5000); // t = 12s: the 8s poll saw the change
    const before = state.calls;
    await advance(2000); // t = 14s
    expect(state.calls).toBe(before + 1);
    expect(result.current.isPaused).toBe(false);
  });

  it('pointerdown resumes with an immediate fetch', async () => {
    const { result } = renderHook(() => useParticipants({ sessionId: 's1', idleMs: 10_000 }));
    await advance(12_000);
    expect(result.current.isPaused).toBe(true);
    const before = state.calls;
    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(state.calls).toBe(before + 1);
    expect(result.current.isPaused).toBe(false);
  });

  it('pauses while hidden and resumes on visibilitychange', async () => {
    renderHook(() => useParticipants({ sessionId: 's1' }));
    await advance(0);
    visibility = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    const hiddenStart = state.calls;
    await advance(6000);
    expect(state.calls).toBe(hiddenStart);

    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(state.calls).toBe(hiddenStart + 1);
  });

  it('refetch returns the fetched list', async () => {
    state.data = [p('a'), p('b')];
    const { result } = renderHook(() => useParticipants({ sessionId: 's1' }));
    let list: Participant[] = [];
    await act(async () => { list = await result.current.refetch(); });
    expect(list.map(x => x.id)).toEqual(['a', 'b']);
  });
});
