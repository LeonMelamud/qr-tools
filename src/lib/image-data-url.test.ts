import { describe, it, expect, vi, afterEach } from 'vitest';
import { scaledSize, outputMimeFor, fileToDataUrl, MAX_DATA_URL_LENGTH } from './image-data-url';

const g = globalThis as unknown as { createImageBitmap?: unknown };

afterEach(() => {
  vi.restoreAllMocks();
  delete g.createImageBitmap;
});

function stubCanvas(dataUrl: string) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
}

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
});
