import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LivePausedBadge } from './LivePausedBadge';

afterEach(cleanup);

describe('LivePausedBadge', () => {
  it('renders nothing while live', () => {
    const { container } = render(<LivePausedBadge paused={false} onResume={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the paused text and resumes on click', () => {
    const onResume = vi.fn();
    render(<LivePausedBadge paused onResume={onResume} />);
    const button = screen.getByRole('button', { name: 'Live updates paused, click to resume' });
    fireEvent.click(button);
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
