/**
 * Decides whether live participant polling should run.
 *
 * Neon's free plan meters compute hours, and every poll keeps the database
 * awake. Polling therefore stops when nobody is looking (hidden tab) or when
 * nothing has happened for a while (no input and no participant change), and
 * resumes on the next input. Both helpers fail closed: bad input means
 * "don't poll", which costs one click to undo.
 */

export const DEFAULT_POLL_IDLE_MS = 600_000; // 10 minutes

/** Reads NEXT_PUBLIC_POLL_IDLE_MS; anything but a positive integer gives the default. */
export function parseIdleMs(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_POLL_IDLE_MS;
  const ms = Number(raw.trim());
  return Number.isSafeInteger(ms) && ms > 0 ? ms : DEFAULT_POLL_IDLE_MS;
}

export function isPollingPaused(s: {
  now: number;
  lastActivityAt: number;
  lastChangeAt: number;
  hidden: boolean;
  idleMs: number;
}): boolean {
  if (s.hidden) return true;
  if (![s.now, s.lastActivityAt, s.lastChangeAt, s.idleMs].every(Number.isFinite)) return true;
  return s.now - Math.max(s.lastActivityAt, s.lastChangeAt) >= s.idleMs;
}
