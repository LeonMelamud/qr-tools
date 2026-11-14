/**
 * Turns an uploaded image file into a `data:` URL small enough to store in a
 * Postgres row (raffle_images.url, qr_refs.logo_url).
 *
 * Raster images are downscaled in the browser so the long side is at most
 * MAX_IMAGE_DIMENSION, and re-encoded as JPEG when the result would be over
 * MAX_DATA_URL_LENGTH. SVGs are kept as-is. Every failure rejects with an
 * Error whose message can be shown to the user directly.
 */

export const MAX_IMAGE_DIMENSION = 800;
export const MAX_DATA_URL_LENGTH = 1_000_000; // a 1,000,000-char row round-trips through the Data API (checked 2026-11-14)
const JPEG_FALLBACK_QUALITY = 0.85;

type OutputMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';

export function scaledSize(
  width: number,
  height: number,
  maxDim: number = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  for (const v of [width, height, maxDim]) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`Invalid image size: ${v}`);
  }
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function outputMimeFor(inputType: string): OutputMime {
  if (!inputType.startsWith('image/')) throw new Error('Not an image file');
  if (inputType === 'image/jpeg' || inputType === 'image/webp' || inputType === 'image/svg+xml') return inputType;
  return 'image/png';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read this image'));
    reader.readAsDataURL(file);
  });
}

function withinCap(url: string): string {
  if (url.length > MAX_DATA_URL_LENGTH) throw new Error('Image is too large after resizing');
  return url;
}

export async function fileToDataUrl(file: File, maxDim: number = MAX_IMAGE_DIMENSION): Promise<string> {
  const mime = outputMimeFor(file.type);
  if (mime === 'image/svg+xml') return withinCap(await readAsDataUrl(file));

  let bitmap: ImageBitmap;
  let size: { width: number; height: number };
  try {
    bitmap = await createImageBitmap(file);
    size = scaledSize(bitmap.width, bitmap.height, maxDim);
  } catch {
    throw new Error('Could not read this image');
  }

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read this image');
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close?.();

  let url = canvas.toDataURL(mime, 0.9);
  // A photo saved as PNG (or a type this browser can't encode, which comes back as PNG) is
  // often over the cap: re-encode as JPEG, on white because JPEG has no transparency.
  if (url.length > MAX_DATA_URL_LENGTH && !url.startsWith('data:image/jpeg')) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    url = canvas.toDataURL('image/jpeg', JPEG_FALLBACK_QUALITY);
  }
  return withinCap(url);
}
