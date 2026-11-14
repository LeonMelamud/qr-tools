import type { Participant } from '../types';

/**
 * The list a winner is drawn from: always freshly fetched, minus past winners.
 *
 * The local list can be stale while live updates are paused (people join after
 * the pause), and the click that starts a draw also resumes polling before the
 * click handler runs, so "were we paused?" can't be trusted at click time.
 * One extra request per draw is the price of never drawing from a stale list.
 */
export async function drawPool(opts: { refetch: () => Promise<Participant[]> }): Promise<Participant[]> {
  const fresh = await opts.refetch();
  return fresh.filter(p => !p.won);
}
