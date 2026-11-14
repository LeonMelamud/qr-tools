import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SlotMachine } from './SlotMachine';
import type { Participant } from '../../types';

const p = (id: string): Participant => ({ id, name: id, last_name: 'X', display_name: id, won: false });

afterEach(cleanup);

describe('SlotMachine', () => {
  // Found in the 2026-11-14 branch review: a winner drawn from a fresher list than the one
  // on screen (someone who joined after the last poll) left the reel frozen, with no
  // animation and no onSpinEnd, so the host had to reload mid-event.
  it('spins to a winner who is not in the participants it was given', () => {
    const [a, b, c] = [p('a'), p('b'), p('c')];
    const onSpinEnd = vi.fn();
    const props = { participants: [a, b], onSpinEnd, loading: false, error: null };
    const { container, rerender } = render(<SlotMachine {...props} winner={null} isSpinning={false} />);

    rerender(<SlotMachine {...props} winner={c} isSpinning />);

    const reel = container.querySelector('ul')!;
    expect(reel.textContent).toContain('c');
    expect(reel.style.transform).toMatch(/^translateY\(-\d+px\)$/);
    fireEvent.transitionEnd(reel);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
  });
});
