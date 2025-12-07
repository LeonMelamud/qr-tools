"use client";

import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';
import type { Participant } from '@/types';

interface ParticipantsContextType {
  allParticipants: Participant[];
  setAllParticipants: Dispatch<SetStateAction<Participant[]>>;
  availableParticipants: Participant[];
  setAvailableParticipants: Dispatch<SetStateAction<Participant[]>>;
}

const ParticipantsContext = createContext<ParticipantsContextType | undefined>(undefined);

export function ParticipantsProvider({ children }: { children: ReactNode }) {
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [availableParticipants, setAvailableParticipants] = useState<Participant[]>([]);

  return (
    <ParticipantsContext.Provider value={{ allParticipants, setAllParticipants, availableParticipants, setAvailableParticipants }}>
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
