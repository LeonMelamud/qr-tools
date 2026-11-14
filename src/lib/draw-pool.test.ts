import { describe, it, expect, vi } from 'vitest';
import { drawPool } from './draw-pool';
import type { Participant } from '../types';

const p = (id: string, won: boolean): Participant => ({ id, name: id, last_name: 'X', display_name: id, won });

describe('drawPool', () => {
  // The click that starts a draw also resumes paused polling (pointerdown fires first),
  // so "was it paused?" can't be trusted at click time: every draw fetches first.
  it('drawPool fetches before picking', async () => {
    const a = p('a', false);
    const refetch = vi.fn().mockResolvedValue([a]);
    const result = await drawPool({ refetch });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([a]);
  });

  it('drawPool leaves out people who already won', async () => {
    const a = p('a', false);
    const b = p('b', true);
    const result = await drawPool({ refetch: vi.fn().mockResolvedValue([a, b]) });
    expect(result).toEqual([a]);
  });
});
