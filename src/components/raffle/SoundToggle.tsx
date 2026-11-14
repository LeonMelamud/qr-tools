"use client";

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '../ui/button';

interface SoundToggleProps {
  muted: boolean;
  onToggle: () => void;
}

/** Speaker button: turns the drum roll and applause off or back on. */
export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  const label = muted ? 'Turn sounds on' : 'Mute sounds';
  return (
    <Button variant="outline" size="icon" onClick={onToggle} aria-label={label} aria-pressed={muted} title={label}>
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </Button>
  );
}
