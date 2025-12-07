"use client";

import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction, useEffect } from 'react';
import type { Participant } from '@/types';
import { useCollection } from '@/firebase/firestore/use-collection';

interface ParticipantsContextType {
  allParticipants: Participant[];
  setAllParticipants: Dispatch<SetStateAction<Participant[]>>;
  availableParticipants: Participant[];
  setAvailableParticipants: Dispatch<SetStateAction<Participant[]>>;
  loading: boolean;
}

const ParticipantsContext = createContext<ParticipantsContextType | undefined>(undefined);

export function ParticipantsProvider({ children }: { children: ReactNode }) {
  const { data: firestoreParticipants, loading } = useCollection<Participant>('participants');
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [availableParticipants, setAvailableParticipants] = useState<Participant[]>([]);
  
  useEffect(() => {
    if (firestoreParticipants) {
        setAllParticipants(firestoreParticipants);
        // On initial load or full refresh, set available to all
        // To prevent losing the "available" list on hot-reloads, we check if it's empty
        if (availableParticipants.length === 0) {
            setAvailableParticipants(firestoreParticipants);
        } else {
            // Reconcile available participants with the main list
            const firestoreIds = new Set(firestoreParticipants.map(p => p.id));
            setAvailableParticipants(prev => prev.filter(p => firestoreIds.has(p.id)));
        }
    }
  }, [firestoreParticipants]);


  return (
    <ParticipantsContext.Provider value={{ allParticipants, setAllParticipants, availableParticipants, setAvailableParticipants, loading }}>
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
