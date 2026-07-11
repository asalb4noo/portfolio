import type { ImageMetadata } from 'astro';

// Eagerly import every source image in the artworks media folder so astro:assets
// can optimize them (resize + WebP/AVIF) at build time. The artwork JSON stores
// only the basename (e.g. "01-cyber-sentinel.jpg"); this maps that back to the
// imported ImageMetadata. Keeping the JSON as a plain string is what lets the
// local admin app write entries without touching any TypeScript.
const images = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/artworks/media/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG}',
  { eager: true }
);

export function getArtworkImage(file: string): ImageMetadata {
  const key = `/src/content/artworks/media/${file}`;
  const mod = images[key];
  if (!mod) {
    throw new Error(
      `Artwork image "${file}" not found. Expected it at ${key}. ` +
        `Available: ${Object.keys(images).join(', ') || '(none)'}`
    );
  }
  return mod.default;
}
