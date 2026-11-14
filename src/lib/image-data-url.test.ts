import { describe, it, expect, vi, afterEach } from 'vitest';
import { scaledSize, outputMimeFor, fileToDataUrl, MAX_DATA_URL_LENGTH } from './image-data-url';

const g = globalThis as unknown as { createImageBitmap?: unknown };

afterEach(() => {
  vi.restoreAllMocks();
  delete g.createImageBitmap;
});

function stubCanvas(dataUrl: string | ((type?: string) => string)) {
  const ctx = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '', globalCompositeOperation: 'source-over' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    typeof dataUrl === 'function' ? (type?: string) => dataUrl(type) : () => dataUrl
  );
  return ctx;
}

const overCap = (mime: string) => `data:${mime};base64,` + 'A'.repeat(MAX_DATA_URL_LENGTH + 1);

function stubBitmap(width: number, height: number) {
  g.createImageBitmap = vi.fn().mockResolvedValue({ width, height, close() {} });
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });

describe('scaledSize', () => {
  it('scales the long side down to the max and keeps the aspect ratio', () => {
    expect(scaledSize(1600, 800)).toEqual({ width: 800, height: 400 });
    expect(scaledSize(400, 1200)).toEqual({ width: 267, height: 800 });
  });

  it('never upscales', () => {
    expect(scaledSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('keeps each side at least 1px', () => {
    expect(scaledSize(1, 5000)).toEqual({ width: 1, height: 800 });
  });

  it('rejects non-finite or non-positive sizes', () => {
    for (const bad of [NaN, Infinity, 0, -1]) {
      expect(() => scaledSize(bad, 100)).toThrow(RangeError);
      expect(() => scaledSize(100, bad)).toThrow(RangeError);
    }
  });
});

describe('outputMimeFor', () => {
  it('keeps jpeg, webp and svg', () => {
    expect(outputMimeFor('image/jpeg')).toBe('image/jpeg');
    expect(outputMimeFor('image/webp')).toBe('image/webp');
    expect(outputMimeFor('image/svg+xml')).toBe('image/svg+xml');
  });

  it('turns other images into png', () => {
    expect(outputMimeFor('image/gif')).toBe('image/png');
    expect(outputMimeFor('image/png')).toBe('image/png');
  });

  it('rejects non-image types', () => {
    expect(() => outputMimeFor('text/plain')).toThrow('Not an image file');
    expect(() => outputMimeFor('')).toThrow('Not an image file');
  });
});

describe('fileToDataUrl', () => {
  it('rejects non-image files', async () => {
    await expect(fileToDataUrl(new File(['hi'], 'a.txt', { type: 'text/plain' }))).rejects.toThrow('Not an image file');
  });

  it('passes SVG through unchanged', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', { type: 'image/svg+xml' });
    const url = await fileToDataUrl(svg);
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('rejects undecodable images', async () => {
    g.createImageBitmap = vi.fn().mockRejectedValue(new Error('bad'));
    await expect(fileToDataUrl(png())).rejects.toThrow('Could not read this image');
  });

  it('rejects results over the cap', async () => {
    stubBitmap(800, 800);
    stubCanvas('data:image/png;base64,' + 'A'.repeat(MAX_DATA_URL_LENGTH + 1));
    await expect(fileToDataUrl(png())).rejects.toThrow('Image is too large after resizing');
  });

  it('resizes to the max dimension', async () => {
    stubBitmap(1600, 800);
    stubCanvas('data:image/png;base64,AAAA');
    const createSpy = vi.spyOn(document, 'createElement');

    await expect(fileToDataUrl(png())).resolves.toBe('data:image/png;base64,AAAA');

    const canvasCall = createSpy.mock.calls.findIndex(([tag]) => tag === 'canvas');
    expect(canvasCall).toBeGreaterThanOrEqual(0);
    const canvas = createSpy.mock.results[canvasCall].value as HTMLCanvasElement;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png', 0.9);
  });

  // 2026-11-14 branch review, finding 4: an 800 px photo saved as PNG is often well over
  // 1M characters, and the user had no way forward in the app.
  it('re-encodes a PNG that is over the cap as JPEG on a white background', async () => {
    stubBitmap(800, 800);
    const order: string[] = [];
    const ctx = stubCanvas(type => {
      order.push(`encode ${type}`);
      return type === 'image/jpeg' ? 'data:image/jpeg;base64,AAAA' : overCap('image/png');
    });
    ctx.fillRect.mockImplementation(() => order.push(`fill ${ctx.fillStyle} ${ctx.globalCompositeOperation}`));

    await expect(fileToDataUrl(png())).resolves.toBe('data:image/jpeg;base64,AAAA');

    expect(order).toEqual(['encode image/png', 'fill #ffffff destination-over', 'encode image/jpeg']);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 800);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenLastCalledWith('image/jpeg', 0.85);
  });

  it('falls back to JPEG when the browser encoded a format it does not support as PNG', async () => {
    // e.g. toDataURL('image/webp') returns PNG on browsers without a WebP encoder
    stubBitmap(800, 800);
    stubCanvas(type => (type === 'image/jpeg' ? 'data:image/jpeg;base64,AAAA' : overCap('image/png')));
    const webp = new File([new Uint8Array([1])], 'a.webp', { type: 'image/webp' });
    await expect(fileToDataUrl(webp)).resolves.toBe('data:image/jpeg;base64,AAAA');
  });

  it('keeps a PNG that fits as PNG, so transparency survives', async () => {
    stubBitmap(800, 800);
    const ctx = stubCanvas(type => (type === 'image/png' ? 'data:image/png;base64,AAAA' : 'data:image/jpeg;base64,BBBB'));
    await expect(fileToDataUrl(png())).resolves.toBe('data:image/png;base64,AAAA');
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
