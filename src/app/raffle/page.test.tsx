/**
 * The raffle page with the real ParticipantsProvider: the draw, the reel and the Start button.
 * Found in the 2026-11-14 branch review (findings 1-3). Database, session, toast and the
 * random pick are mocked; layout pieces that don't take part in a draw render nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Participant } from '@/types';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  fail: false,
  hold: null as null | Promise<void>,
  toast: vi.fn(),
  secureRandom: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const participantsQuery = async () => {
    if (h.hold) await h.hold;
    return h.fail ? { data: null, error: { message: 'down' } } : { data: h.rows, error: null };
  };
  const query = (result: () => Promise<unknown>) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'update', 'insert', 'delete']) q[m] = () => q;
    q.order = result;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return q;
  };
  return {
    db: {
      from: (table: string) => query(table === 'participants' ? participantsQuery : async () => ({ data: [], error: null })),
      rpc: async () => ({ data: null, error: null }),
      isConfigured: () => true,
    },
  };
});

vi.mock('@/context/SessionContext', () => ({
  useSessionContext: () => ({ sessionId: 's1', session: null, shortCode: null, loading: false, error: null }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  secureRandom: h.secureRandom,
}));
vi.mock('@/components/auth/PasswordGate', () => ({ PasswordGate: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/raffle/SessionIndicator', () => ({ SessionIndicator: () => null }));
vi.mock('@/components/raffle/ParticipantsList', () => ({ ParticipantsList: () => null }));
vi.mock('@/components/raffle/Confetti', () => ({ Confetti: () => null }));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));

import { ParticipantsProvider } from '@/context/ParticipantsContext';
import Home from './page';

const p = (id: string, won = false): Participant => ({ id, name: id, last_name: 'X', display_name: id, won });

async function renderRaffle(rows: Participant[]) {
  h.rows = rows;
  render(
    <ParticipantsProvider>
      <Home />
    </ParticipantsProvider>
  );
  const start = await screen.findByRole('button', { name: /start raffle/i });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  return start;
}

/** A real click: pointerdown (which resumes live updates) then click, and the draw's fetch, in one batch. */
async function press(button: HTMLElement, times = 1) {
  await act(async () => {
    for (let i = 0; i < times; i++) {
      fireEvent.pointerDown(button);
      fireEvent.click(button);
    }
    await new Promise(r => setTimeout(r, 0));
  });
}

const reel = () => document.querySelector('ul')!;
const reelNames = () => [...new Set([...reel().querySelectorAll('li')].map(li => li.textContent))].sort();

beforeEach(() => {
  h.rows = [];
  h.fail = false;
  h.hold = null;
  h.toast.mockReset();
  h.secureRandom.mockReset();
});

afterEach(cleanup);

describe('raffle draw', () => {
  it('a late joiner who is drawn makes the reel spin to them', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.rows = [p('a'), p('b'), p('c')]; // c joined after the last poll
    h.secureRandom.mockReturnValue(2); // pool [a, b, c]

    await press(start);

    expect(reel().textContent).toContain('c');
    expect(reel().style.transform).toMatch(/^translateY\(-\d+px\)$/);
    fireEvent.transitionEnd(reel());
    expect(await screen.findByRole('button', { name: /prepare next round/i })).toBeTruthy();
  });

  it('the reel shows exactly the pool the winner was drawn from', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.rows = [p('a', true), p('b'), p('c')]; // a won meanwhile, c joined
    h.secureRandom.mockReturnValue(1); // pool [b, c]

    await press(start);

    expect(reelNames()).toEqual(['b', 'c']);
  });

  it('a double click during the refresh draws once', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    let release!: () => void;
    h.hold = new Promise<void>(r => { release = r; });
    h.secureRandom.mockReturnValue(0);

    await press(start, 2);
    const waiting = screen.getByRole('button', { name: /refreshing list/i }) as HTMLButtonElement;
    expect(waiting.disabled).toBe(true);

    await act(async () => {
      release();
      await new Promise(r => setTimeout(r, 0));
    });
    expect(h.secureRandom).toHaveBeenCalledTimes(1);
  });

  it('does not draw when the list cannot be refreshed', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.fail = true;
    h.secureRandom.mockReturnValue(0);

    await press(start);

    expect(h.secureRandom).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Could not refresh the list' })
    );
    expect(screen.queryByRole('button', { name: /prepare next round/i })).toBeNull();
  });

  it('after a failed refresh, the next click can still draw', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.fail = true;
    await press(start);
    h.fail = false;
    h.secureRandom.mockReturnValue(0);

    // The next poll (2 s) clears the connection error and re-enables the button
    const again = await screen.findByRole('button', { name: /start raffle/i }, { timeout: 4000 });
    await waitFor(() => expect((again as HTMLButtonElement).disabled).toBe(false), { timeout: 4000 });
    await press(again);

    expect(h.secureRandom).toHaveBeenCalledTimes(1);
    expect(reel().style.transform).toMatch(/^translateY\(-\d+px\)$/);
  }, 10_000);
});
