import type { Participant } from '../types';

/** The order the raffle shows names in (ParticipantsContext sorts the same way). */
export const byDisplayName = (a: Participant, b: Participant) => a.display_name.localeCompare(b.display_name);

/**
 * The list a winner is drawn from: always freshly fetched, minus past winners, in screen order.
 * Resolves null when the list could not be refreshed: never draw from a stale list.
 *
 * The local list can be stale while live updates are paused (people join after
 * the pause), and the click that starts a draw also resumes polling before the
 * click handler runs, so "were we paused?" can't be trusted at click time.
 */
export async function drawPool(opts: { refetch: () => Promise<Participant[] | null> }): Promise<Participant[] | null> {
  const fresh = await opts.refetch();
  if (fresh === null) return null;
  return fresh.filter(p => !p.won).sort(byDisplayName);
}
