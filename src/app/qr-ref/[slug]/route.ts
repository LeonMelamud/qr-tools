import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { QrRef } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  
  if (!slug) {
    return NextResponse.redirect(new URL('/qr-ref', request.url));
  }

  try {
    // Look up the QR ref by slug
    const { data: qrRef, error } = await db
      .from<QrRef>('qr_refs')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !qrRef) {
      // QR code not found - redirect to manager page
      console.error('QR ref not found:', slug, error);
      return NextResponse.redirect(new URL('/qr-ref?error=not_found', request.url));
    }

    // Check if active
    if (!qrRef.is_active) {
      return NextResponse.redirect(new URL('/qr-ref?error=inactive', request.url));
    }

    // Check expiration
    if (qrRef.expires_at && new Date(qrRef.expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/qr-ref?error=expired', request.url));
    }

    // Increment scan count
    const currentCount = qrRef.scan_count ?? 0;
    await db
      .from('qr_refs')
      .update({ 
        scan_count: currentCount + 1,
      })
      .eq('id', qrRef.id);

    // Redirect to target URL
    const targetUrl = qrRef.target_url;
    if (!targetUrl) {
      return NextResponse.redirect(new URL('/qr-ref?error=no_target', request.url));
    }

    return NextResponse.redirect(targetUrl);
  } catch (err) {
    console.error('Error processing QR redirect:', err);
    return NextResponse.redirect(new URL('/qr-ref?error=server_error', request.url));
  }
}
