"use client";

interface LivePausedBadgeProps {
  paused: boolean;
  onResume: () => void;
}

/** Tells the host why new joiners stopped appearing, and brings live updates back. */
export function LivePausedBadge({ paused, onResume }: LivePausedBadgeProps) {
  if (!paused) return null;
  return (
    <button
      type="button"
      onClick={onResume}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-black/85"
    >
      Live updates paused, click to resume
    </button>
  );
}
