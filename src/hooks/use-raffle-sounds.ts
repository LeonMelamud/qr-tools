"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createYouTubeSound, type YouTubeSound } from '../lib/youtube-sound';

/** "Drum Roll Sound Effect [High Quality]" (SoundEffectsFactory), 53 s: plays while the reel spins. */
export const DRUM_ROLL_VIDEO_ID = 'mzAfTmC3It0';
/** "Audience Cheering And Clapping Sound Effect" (SoundEffectsFactory), 20 s: plays when the winner is revealed. */
export const APPLAUSE_VIDEO_ID = 'xiG2xO-4Y-s';

const MUTED_STORAGE_KEY = 'hypnoraffle_sounds_muted';

export interface RaffleSounds {
  /** Stops the applause and starts the drum roll from the beginning. */
  drumRoll(): void;
  /** Stops the drum roll and plays the applause. */
  applause(): void;
  stopAll(): void;
  /** True while the speaker button has the sounds off (remembered in this browser). */
  muted: boolean;
  toggleMute(): void;
}

/** Runs a sound call without ever letting a broken player interrupt the raffle. */
function safely(fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error('Sound error:', err);
  }
}

export function useRaffleSounds(): RaffleSounds {
  const sounds = useRef<{ drum: YouTubeSound; applause: YouTubeSound } | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  // The choice from the last visit (read after mount: the page is prerendered without storage)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
      mutedRef.current = stored;
      setMuted(stored);
    } catch {
      // storage unavailable: sounds stay on
    }
  }, []);

  useEffect(() => {
    let created: { drum: YouTubeSound; applause: YouTubeSound } | null = null;
    safely(() => {
      created = { drum: createYouTubeSound(DRUM_ROLL_VIDEO_ID), applause: createYouTubeSound(APPLAUSE_VIDEO_ID) };
    });
    sounds.current = created;
    return () => {
      const s = sounds.current;
      sounds.current = null;
      if (s) {
        safely(() => s.drum.destroy());
        safely(() => s.applause.destroy());
      }
    };
  }, []);

  const stopAll = useCallback(() => {
    const s = sounds.current;
    if (!s) return;
    safely(() => s.drum.stop());
    safely(() => s.applause.stop());
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) stopAll();
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, String(next));
    } catch {
      // storage unavailable: the choice lasts until the page is reloaded
    }
  }, [stopAll]);

  return useMemo(() => ({
    drumRoll() {
      const s = sounds.current;
      if (!s || mutedRef.current) return;
      safely(() => s.applause.stop());
      safely(() => s.drum.play());
    },
    applause() {
      const s = sounds.current;
      if (!s || mutedRef.current) return;
      safely(() => s.drum.stop());
      safely(() => s.applause.play());
    },
    stopAll,
    muted,
    toggleMute,
  }), [stopAll, muted, toggleMute]);
}
