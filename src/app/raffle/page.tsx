"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Participant, RaffleImage } from '../../types';
import { Button } from '../../components/ui/button';
import { PasswordGate } from '../../components/auth/PasswordGate';
import { Header } from '../../components/layout/Header';
import { SlotMachine } from '../../components/raffle/SlotMachine';
import { SessionIndicator } from '../../components/raffle/SessionIndicator';
import { ParticipantsList } from '../../components/raffle/ParticipantsList';
import { secureRandom } from '../../lib/utils';
import { useToast } from '../../hooks/use-toast';
import { Trophy, ServerCrash, ChevronLeft, ChevronRight, RefreshCw, ImagePlus, Trash2 } from 'lucide-react';
import { useParticipants } from '../../context/ParticipantsContext';
import { useSessionContext } from '../../context/SessionContext';
import { Confetti } from '../../components/raffle/Confetti';
import { LivePausedBadge } from '../../components/raffle/LivePausedBadge';
import { drawPool } from '../../lib/draw-pool';
import Image from 'next/image';
import { db } from '../../lib/db';
import { fileToDataUrl } from '../../lib/image-data-url';
import placeholderData from '../../lib/placeholder-images.json';

interface AvailableImage {
  id: string;
  src: string;
  alt: string;
}

export default function Home() {
  const {
    allParticipants,
    setAllParticipants,
    availableParticipants,
    setAvailableParticipants,
    loading,
    error,
    refetch,
    isLivePaused,
    resumeLive
  } = useParticipants();

  const { sessionId } = useSessionContext();

  const [winner, setWinner] = useState<Participant | null>(null);
  const [isRaffling, setIsRaffling] = useState(false);
  const [spinHasEnded, setSpinHasEnded] = useState(false);
  const [isRainingLogos, setIsRainingLogos] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [availableImages, setAvailableImages] = useState<AvailableImage[]>(
    placeholderData.images || [{ id: 'linkedin-qr-leon', src: '/images/linkedin-qr-leon.svg', alt: 'LinkedIn QR Code' }]
  );
  const [imagesLoading, setImagesLoading] = useState(false);
  // True while Start Raffle waits for the fresh list (label and disabled button)
  const [isDrawing, setIsDrawing] = useState(false);
  // Locks the draw from the click until the round ends, so a second click can't pick a second winner
  const drawingRef = useRef(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryFileInputRef = useRef<HTMLInputElement>(null);

  // A started draw keeps the lock until the round ends (next round, reset, or a new session)
  useEffect(() => {
    if (!isRaffling) drawingRef.current = false;
  }, [isRaffling]);

  // Reset raffle state when session changes
  useEffect(() => {
    setWinner(null);
    setIsRaffling(false);
    setSpinHasEnded(false);
    setIsRainingLogos(false);
  }, [sessionId]);

  // Fetch gallery images from the database (with fallback to the static placeholder list)
  const fetchImages = async () => {
    setImagesLoading(true);
    try {
      const { data, error } = await db
        .from<RaffleImage>('raffle_images')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setAvailableImages((data as RaffleImage[]).map(img => ({ id: img.id, src: img.url, alt: img.alt || 'Raffle image' })));
      } else {
        setAvailableImages(placeholderData.images || []);
      }
      setCurrentImageIndex(0);
    } catch (err) {
      console.error('Failed to load gallery images, using static list:', err);
      setAvailableImages(placeholderData.images || []);
    } finally {
      setImagesLoading(false);
    }
  };

  // Load the gallery on mount
  useEffect(() => {
    fetchImages();
  }, []);

  // Upload a new image to the gallery (stored in the database, no deploy needed)
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // The image is stored in the row itself as a downscaled data: URL
    let url: string;
    try {
      url = await fileToDataUrl(file);
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : 'Could not read this image', variant: "destructive" });
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
      return;
    }

    const { error: insertError } = await db.from('raffle_images').insert({
      url,
      alt: file.name.replace(/\.[^.]+$/, ''),
    });

    if (insertError) {
      toast({ title: "Upload failed", description: "Could not save the image to the gallery.", variant: "destructive" });
      return;
    }

    toast({ title: "Image added", description: "Uploaded to the raffle gallery." });
    if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    await fetchImages();
  };

  // Remove the currently displayed gallery image
  const handleDeleteCurrentImage = async () => {
    const current = availableImages[currentImageIndex];
    if (!current) return;

    const { error: deleteError } = await db.from('raffle_images').delete().eq('id', current.id);
    if (deleteError) {
      toast({ title: "Error", description: "Could not remove the image.", variant: "destructive" });
      return;
    }

    toast({ title: "Image removed" });
    await fetchImages();
  };

  // Computed logo URL - use custom if set, otherwise use current image from array
  const logoUrl = customLogoUrl || availableImages[currentImageIndex]?.src;
  const logoAlt = customLogoUrl ? 'Custom Logo' : availableImages[currentImageIndex]?.alt;

  const handlePrevImage = () => {
    setCustomLogoUrl(null); // Clear custom logo when navigating
    setCurrentImageIndex((prev) => (prev === 0 ? availableImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCustomLogoUrl(null); // Clear custom logo when navigating
    setCurrentImageIndex((prev) => (prev === availableImages.length - 1 ? 0 : prev + 1));
  };
  const handleParticipantsLoad = async (newParticipants: Participant[]) => {

    // Client-side filtering logic from original code
    const existingDisplayNames = new Set(allParticipants.map(p => p.display_name));
    const uniqueNew = newParticipants.filter(p => !existingDisplayNames.has(p.display_name));

    if (uniqueNew.length > 0) {
      if (!sessionId) {
        toast({
          title: "Session Error",
          description: "No active session. Please refresh the page.",
          variant: "destructive"
        });
        return;
      }

      try {
        // Map to the participants table shape, including session_id
        // Note: id is generated by the database (gen_random_uuid())
        const participantsToInsert = uniqueNew.map(participant => ({
          name: participant.name,
          last_name: participant.last_name,
          display_name: participant.display_name,
          session_id: sessionId,
          email: participant.email,
        }));

        const { error: insertError } = await db.from('participants').insert(participantsToInsert);

        if (insertError) throw insertError;

        // Refresh participants list immediately
        await refetch();

        toast({
          title: "Participants Added",
          description: `${uniqueNew.length} new participants added to session ${sessionId?.substring(0, 8).toUpperCase()}.`,
        });

      } catch (error) {
        console.error("Error adding participants: ", error);
        toast({
          title: "Import Error",
          description: "Could not save participants to the database.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "No New Participants",
        description: "The imported participants are already in the raffle.",
      });
    }
  };

  const handleLogoChange = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const newUrl = e.target?.result as string;
      setCustomLogoUrl(newUrl);
      toast({
        title: "Logo Updated",
        description: "The custom logo has been applied.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoChange(file);
    }
  };

  const handleStartRaffle = async () => {
    if (drawingRef.current) return;
    drawingRef.current = true;
    setIsDrawing(true);
    let started = false;
    try {
      // Always draw from a freshly fetched list: the one on screen may be stale
      // (live updates paused, or someone joined since the last poll)
      const pool = await drawPool({ refetch });
      if (pool === null) {
        toast({
          title: "Could not refresh the list",
          description: "No winner was drawn. Check the connection and try again.",
          variant: "destructive"
        });
        return;
      }
      if (pool.length === 0) {
        toast({
          title: "Raffle is empty!",
          description: "Please add participants or reset the raffle.",
          variant: "destructive"
        });
        return;
      }
      // The reel shows exactly the list the winner is drawn from
      setAvailableParticipants(pool);
      setSpinHasEnded(false);
      setIsRaffling(true);
      setWinner(pool[secureRandom(pool.length)]);
      started = true;
    } finally {
      setIsDrawing(false);
      if (!started) drawingRef.current = false;
    }
  };

  const handleSpinEnd = async () => {
    setSpinHasEnded(true);

    if (winner) {
      // Send webhook notification
      const webhookUrl = process.env.NEXT_PUBLIC_WINNER_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: winner.name,
              last_name: winner.last_name,
              email: winner.email
            })
          });
        } catch (err) {
          console.error('Webhook failed:', err);
          toast({
            title: 'Webhook Error',
            description: 'Failed to send winner notification.',
            variant: 'destructive'
          });
        }
      }
    }
  };

  const handleNextRound = async () => {
    setSpinHasEnded(false);
    setIsRaffling(false);
    if (winner) {
      // Mark winner in database
      try {
        const { error: updateError } = await db
          .from('participants')
          .update({ won: true })
          .eq('id', winner.id);

        if (updateError) {
          console.error('Failed to mark winner in DB:', updateError);
        }
      } catch (err) {
        console.error('Failed to mark winner in DB:', err);
      }

      const remaining = availableParticipants.filter(p => p.id !== winner.id);
      setAvailableParticipants(remaining);

      // If that was the last participant, reset available to all for the next major round
      if (remaining.length === 0 && allParticipants.length > 0) {
        toast({
          title: 'Round Complete!',
          description: 'All participants have been chosen. Resetting for a new round.',
        });
        // Reset all winners in DB
        try {
          await db
            .from('participants')
            .update({ won: false })
            .eq('session_id', sessionId!);
        } catch (err) {
          console.error('Failed to reset winners in DB:', err);
        }
        setAvailableParticipants(allParticipants);
      }
    }
    setWinner(null);
  };

  const handleLogoRain = () => {
    if (isRainingLogos) {
      setIsRainingLogos(false);
    } else {
      setIsRainingLogos(true);
      setTimeout(() => setIsRainingLogos(false), 20000); // Stop the rain after 20 seconds
    }
  };

  const handleResetRaffle = async () => {
    // Reset all winners in DB
    try {
      await db
        .from('participants')
        .update({ won: false })
        .eq('session_id', sessionId!);
    } catch (err) {
      console.error('Failed to reset winners in DB:', err);
    }
    setAvailableParticipants(allParticipants);
    setWinner(null);
    setIsRaffling(false);
    setSpinHasEnded(false);
    toast({
      title: 'Raffle Reset',
      description: 'All participants are now available for the next round.',
    });
  }

  const participantCount = useMemo(() => allParticipants.length, [allParticipants]);
  const availableCount = useMemo(() => availableParticipants.length, [availableParticipants]);

  const getLoadingMessage = () => {
    if (loading) return "Loading Participants...";
    return "Start Raffle";
  }

  return (
    <PasswordGate>
      <Confetti isCelebrating={spinHasEnded || isRainingLogos} image={logoUrl} />
      <LivePausedBadge paused={isLivePaused} onResume={resumeLive} />
      <SessionIndicator />
      <ParticipantsList />
      <main className="flex flex-col items-center justify-start min-h-screen w-full p-4 md:p-8 pt-20 md:pt-24 relative">
        <Header
          onParticipantsLoad={handleParticipantsLoad}
          isRaffling={isRaffling}
          onLogoRain={handleLogoRain}
        />

        <div className="w-full max-w-2xl mx-auto flex-grow flex flex-col items-center justify-start gap-8">

          <div className="w-full max-w-lg flex flex-col items-center gap-2">
            <div className="relative w-full">
              {logoUrl ? (
                <button onClick={handleLogoClick} className="cursor-pointer group relative w-full flex justify-center">
                  <Image
                    src={logoUrl}
                    alt={logoAlt || "Raffle Logo"}
                    width={480}
                    height={240}
                    className="object-contain group-hover:opacity-80 transition-opacity"
                  />
                  <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-bold">Upload Custom</span>
                  </div>
                </button>
              ) : (
                <div className="w-full h-[240px] flex items-center justify-center border-2 border-dashed border-primary/30 rounded-lg">
                  <span className="text-muted-foreground">No images loaded</span>
                </div>
              )}

              {availableImages.length > 1 && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors z-30"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6 text-white" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors z-30"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-6 w-6 text-white" />
                  </button>
                </>
              )}

              <div className="absolute top-2 right-2 flex gap-1.5 z-30">
                <button
                  onClick={() => galleryFileInputRef.current?.click()}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                  aria-label="Add image to gallery"
                  title="Upload a new gallery image"
                >
                  <ImagePlus className="h-4 w-4 text-white" />
                </button>
                {availableImages.length > 0 && (
                  <button
                    onClick={handleDeleteCurrentImage}
                    className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                    aria-label="Delete this gallery image"
                    title="Delete this gallery image"
                  >
                    <Trash2 className="h-4 w-4 text-white" />
                  </button>
                )}
                <button
                  onClick={fetchImages}
                  disabled={imagesLoading}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors disabled:opacity-50"
                  aria-label="Refresh images"
                  title="Refresh gallery"
                >
                  <RefreshCw className={`h-4 w-4 text-white ${imagesLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={galleryFileInputRef}
            onChange={handleGalleryUpload}
            accept="image/*"
            className="hidden"
          />

          <SlotMachine
            participants={availableParticipants}
            winner={winner}
            isSpinning={isRaffling}
            onSpinEnd={handleSpinEnd}
            loading={loading && allParticipants.length === 0}
            error={error}
          />
          <div className="flex flex-wrap gap-4 items-center justify-center">
            {!isRaffling && !spinHasEnded ? (
              <Button
                onClick={handleStartRaffle}
                disabled={isRaffling || isDrawing || loading || availableParticipants.length === 0 || !!error}
                size="lg"
                className="font-bold text-lg"
                variant={error ? "destructive" : "default"}
              >
                {error ? <ServerCrash className="mr-2 h-5 w-5" /> : <Trophy className="mr-2 h-5 w-5" />}
                {error ? "Connection Failed" : isDrawing ? "Refreshing list…" : getLoadingMessage()}
              </Button>
            ) : spinHasEnded ? (
              <Button onClick={handleNextRound} size="lg" className="font-bold text-lg">
                Prepare Next Round
              </Button>
            ) : null}

            {availableCount === 0 && participantCount > 0 && !isRaffling && (
              <Button onClick={handleResetRaffle} size="lg" variant="secondary">
                Reset Raffle
              </Button>
            )}

          </div>

          {spinHasEnded && winner && (
            <div className="w-full text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                {winner.email || winner.display_name}
              </p>
            </div>
          )}
        </div>

        <footer className="text-center text-foreground/80 mt-8">
          <p>Total Participants: {participantCount} | Available this round: {availableCount}</p>
        </footer>
      </main>
    </PasswordGate>
  );
}
