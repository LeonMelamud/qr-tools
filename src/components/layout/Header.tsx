import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';
import { QrCode } from 'lucide-react';
import React from 'react';

const logo = PlaceHolderImages.find(img => img.id === 'mcp-logo');

export function Header({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="py-6 px-4 flex justify-between items-center w-full">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-primary font-headline">
          HypnoRaffle
        </h1>
      <div className="flex items-center gap-4">
        {children}
        <Button variant="secondary" onClick={() => router.push('/qr')}>
          <QrCode className="mr-2 h-4 w-4" />
          Scan QR
        </Button>
         {logo && (
            <Image
              src={logo.imageUrl}
              alt={logo.description}
              width={56}
              height={56}
              className="rounded-full shadow-lg border-2 border-primary"
              data-ai-hint={logo.imageHint}
            />
          )}
      </div>
    </header>
  );
}
