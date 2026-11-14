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
  /** Every update the page sent: table, new values, and its .eq() filters. */
  updates: [] as { table: string; values: unknown; eq: [string, unknown][] }[],
  failUpdate: false,
  toast: vi.fn(),
  secureRandom: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const participantsQuery = async () => {
    if (h.hold) await h.hold;
    return h.fail ? { data: null, error: { message: 'down' } } : { data: h.rows, error: null };
  };
  const query = (table: string, result: () => Promise<unknown>) => {
    const q: Record<string, unknown> = {};
    const eq: [string, unknown][] = [];
    let values: unknown;
    for (const m of ['select', 'insert', 'delete']) q[m] = () => q;
    q.update = (v: unknown) => { values = v; return q; };
    q.eq = (col: string, val: unknown) => { eq.push([col, val]); return q; };
    q.order = result;
    q.then = (ok: (v: unknown) => unknown) => {
      if (values === undefined) return Promise.resolve({ data: null, error: null }).then(ok);
      h.updates.push({ table, values, eq });
      return Promise.resolve(h.failUpdate ? { data: null, error: { message: 'down' } } : { data: null, error: null }).then(ok);
    };
    return q;
  };
  return {
    db: {
      from: (table: string) => query(table, table === 'participants' ? participantsQuery : async () => ({ data: [], error: null })),
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
  h.updates = [];
  h.failUpdate = false;
  h.toast.mockReset();
  h.secureRandom.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** The updates that marked this participant as a winner. */
const wonWrites = (id: string) =>
  h.updates.filter(u => u.table === 'participants' && JSON.stringify(u.values) === '{"won":true}' && u.eq.some(([c, v]) => c === 'id' && v === id));

/** Draw the participant at `index` of the pool and let the reel stop on them. */
async function drawAndReveal(start: HTMLElement, index: number) {
  h.secureRandom.mockReturnValue(index);
  await press(start);
  await act(async () => {
    fireEvent.transitionEnd(reel());
    await new Promise(r => setTimeout(r, 0));
  });
}

describe('raffle draw', () => {
  it('a late joiner who is drawn makes the reel spin to them', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.rows = [p('a'), p('b'), p('c')]; // c joined after the last poll
    h.secureRandom.mockReturnValue(2); // pool [a, b, c]

    await press(start);

    expect(reel().textContent).toContain('c');
    expect(reel().style.transform).toMatch(/^translateY\(-\d+px\)$/);
    fireEvent.transitionEnd(reel());
    expect(await screen.findByRole('button', { name: /start raffle/i })).toBeTruthy();
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
    expect(reel().style.transform).not.toMatch(/translateY\(-/);
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

// Leon, 2026-11-14: the winner was saved only on "Prepare Next Round", so closing or
// reloading the page after a spin left them in the draw and they could win again.
describe('saving the winner', () => {
  it('saves the winner as soon as the reel reveals them', async () => {
    const start = await renderRaffle([p('a'), p('b')]);

    await drawAndReveal(start, 1);

    expect(wonWrites('b')).toHaveLength(1);
  });

  it('saves the winner while the winner webhook is still waiting for an answer', async () => {
    vi.stubEnv('NEXT_PUBLIC_WINNER_WEBHOOK_URL', 'https://hooks.example.test/winner');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const start = await renderRaffle([p('a'), p('b')]);

    await drawAndReveal(start, 0);

    expect(wonWrites('a')).toHaveLength(1);
  });

  it('does not draw the next winner while the last one cannot be saved', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.failUpdate = true;
    await drawAndReveal(start, 0);

    await press(await screen.findByRole('button', { name: /start raffle/i }));

    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Could not save the winner' })
    );
    expect(h.secureRandom).toHaveBeenCalledTimes(1);
    expect(reel().style.transform).toMatch(/^translateY\(-\d+px\)$/); // still on the last winner
  });

  it('a save that failed at the reveal is retried before the next draw', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    h.failUpdate = true;
    await drawAndReveal(start, 0);
    h.failUpdate = false;
    h.rows = [p('a', true), p('b')];

    h.secureRandom.mockReturnValue(0);
    await press(await screen.findByRole('button', { name: /start raffle/i }));

    expect(wonWrites('a').length).toBeGreaterThanOrEqual(2);
    expect(h.secureRandom).toHaveBeenCalledTimes(2);
  });

  // Saved at the reveal, the next poll (2 s) drops the winner from the available list while
  // their name is still on screen. When they were the last one, the reel must not go blank.
  it('the last participant stays on the reel after the poll sees them as a winner', async () => {
    const start = await renderRaffle([p('amy')]);
    await drawAndReveal(start, 0);
    h.rows = [p('amy', true)];

    await new Promise(r => setTimeout(r, 2500));

    expect(reel().textContent).toContain('amy');
    expect(reel().textContent).not.toMatch(/add participants/i);
    expect(screen.getByRole('button', { name: /start new round/i })).toBeTruthy();
  }, 10_000);
});

// Leon, 2026-11-14: one button. Start Raffle on the winner screen draws the next winner;
// there is no "Prepare Next Round" step.
describe('next draw from the winner screen', () => {
  it('Start Raffle on the winner screen draws the next winner in one click', async () => {
    const start = await renderRaffle([p('a'), p('b')]);
    await drawAndReveal(start, 0);
    expect(screen.queryByRole('button', { name: /prepare next round/i })).toBeNull();
    h.rows = [p('a', true), p('b'), p('c')]; // a is saved, c joined during the reveal

    h.secureRandom.mockReturnValue(1); // pool [b, c]
    await press(await screen.findByRole('button', { name: /start raffle/i }));

    expect(h.secureRandom).toHaveBeenCalledTimes(2);
    expect(reelNames()).toEqual(['b', 'c']);
    expect(reel().style.transform).toMatch(/^translateY\(-\d+px\)$/);
    fireEvent.transitionEnd(reel());
    expect(await screen.findByRole('button', { name: /start raffle/i })).toBeTruthy();
    expect(wonWrites('c')).toHaveLength(1);
  });

  it('a double click on the winner screen draws one next winner', async () => {
    const start = await renderRaffle([p('a'), p('b'), p('c')]);
    await drawAndReveal(start, 0);
    h.rows = [p('a', true), p('b'), p('c')];

    await press(await screen.findByRole('button', { name: /start raffle/i }), 2);

    expect(h.secureRandom).toHaveBeenCalledTimes(2);
  });

  it('when the last participant has won, Start New Round puts everyone back without drawing', async () => {
    const start = await renderRaffle([p('amy')]);
    await drawAndReveal(start, 0);
    expect(screen.queryByRole('button', { name: /start raffle/i })).toBeNull();

    await press(await screen.findByRole('button', { name: /start new round/i }));

    const reset = h.updates.findIndex(u => JSON.stringify(u.values) === '{"won":false}' && u.eq.some(([c, v]) => c === 'session_id' && v === 's1'));
    expect(reset).toBeGreaterThan(h.updates.indexOf(wonWrites('amy')[0]));
    expect(h.secureRandom).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /start raffle/i })).toBeTruthy();
  });
});
