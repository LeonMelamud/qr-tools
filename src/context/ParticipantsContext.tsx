'use client';

import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction, useEffect } from 'react';
import type { Participant } from '@/types';
import { useParticipants as useParticipantsHook } from '@/hooks/use-participants';
import { useSessionContext } from './SessionContext';
import { parseIdleMs } from '@/lib/poll-gate';
import { byDisplayName } from '@/lib/draw-pool';

// Optional override for testing; anything invalid falls back to 10 minutes.
const POLL_IDLE_MS = parseIdleMs(process.env.NEXT_PUBLIC_POLL_IDLE_MS);

interface ParticipantsContextType {
  allParticipants: Participant[];
  setAllParticipants: Dispatch<SetStateAction<Participant[]>>;
  availableParticipants: Participant[];
  setAvailableParticipants: Dispatch<SetStateAction<Participant[]>>;
  loading: boolean;
  error: Error | null;
  /** The fresh list, or null when it could not be fetched. */
  refetch: () => Promise<Participant[] | null>;
  /** True while live updates are stopped (idle or hidden tab). */
  isLivePaused: boolean;
  resumeLive: () => void;
}

const ParticipantsContext = createContext<ParticipantsContextType | undefined>(undefined);

export function ParticipantsProvider({ children }: { children: ReactNode }) {
  const { sessionId, loading: sessionLoading } = useSessionContext();
  const { participants, loading: participantsLoading, error, refetch, isPaused, resume } = useParticipantsHook({ sessionId, idleMs: POLL_IDLE_MS });
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [availableParticipants, setAvailableParticipants] = useState<Participant[]>([]);

  const loading = sessionLoading || participantsLoading;

  useEffect(() => {
    if (participants) {
      // Sort participants once when they are loaded/updated
      const sortedParticipants = [...participants].sort(byDisplayName);
      
      // Filter available based on won status from DB
      const available = sortedParticipants.filter(p => !p.won);
      
      // Only update if data actually changed
      setAllParticipants(prev => {
        if (JSON.stringify(prev) === JSON.stringify(sortedParticipants)) {
          return prev;
        }
        return sortedParticipants;
      });
      setAvailableParticipants(prev => {
        if (JSON.stringify(prev) === JSON.stringify(available)) {
          return prev;
        }
        return available;
      });
    }
  }, [participants]);

  // Reset participants when session changes
  useEffect(() => {
    setAllParticipants([]);
    setAvailableParticipants([]);
  }, [sessionId]);

  const value = {
    allParticipants,
    setAllParticipants,
    availableParticipants,
    setAvailableParticipants,
    loading,
    error,
    refetch,
    isLivePaused: isPaused,
    resumeLive: resume,
  };

  return (
    <ParticipantsContext.Provider value={value}>
      {children}
    </ParticipantsContext.Provider>
  );
}

export function useParticipants() {
  const context = useContext(ParticipantsContext);
  if (context === undefined) {
    throw new Error('useParticipants must be used within a ParticipantsProvider');
  }
  return context;
}

