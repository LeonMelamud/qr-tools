// Auto-generates the `images` list in src/lib/placeholder-images.json by scanning
// public/images/. Runs as a `prebuild`/`predev` hook so dropping a file into
// public/images/ is enough — no manual JSON edits, and it works for the static
// export (this runs at build time, where the filesystem is available).
//
// The separate `placeholderImages` array is preserved untouched.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const imagesDir = join(root, 'public', 'images');
const manifestPath = join(root, 'src', 'lib', 'placeholder-images.json');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif']);

// Build a human-friendly alt text from a filename, e.g.
// "n8n_LinkedIn_Profile_Cover" -> "n8n LinkedIn Profile Cover".
function toAlt(name) {
  return name
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const files = readdirSync(imagesDir)
  .filter((f) => IMAGE_EXTS.has(parse(f).ext.toLowerCase()))
  .sort((a, b) => a.localeCompare(b)); // deterministic order

const images = files.map((file) => {
  const base = parse(file).name;
  return {
    id: base,
    src: `/images/${file}`,
    alt: toAlt(base),
  };
});

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.images = images;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`[image-manifest] wrote ${images.length} images to placeholder-images.json`);
