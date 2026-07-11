import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const artworks = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/artworks' }),
  schema: z.object({
    title: z.string(),
    category: z.string(),
    project: z.string().optional(),
    description: z.string().optional(),
    year: z.number().optional(),
    // Basename of the source image inside src/content/artworks/media/
    // (e.g. "01-cyber-sentinel.jpg"). Optimized by astro:assets at build.
    // This is the cover shown in the mosaic.
    image: z.string(),
    // Optional extra images for this piece (wireframe, texture breakdown,
    // alternate angles, …). Each is a basename in media/, just like `image`.
    // The lightbox shows [image, ...gallery] as a browsable set.
    gallery: z.array(z.string()).optional(),
    // Optional turntable / demo-reel clip. Either a self-hosted path served
    // from /public (e.g. "/videos/01-cyber-sentinel.mp4") or a full URL.
    video: z.string().optional(),
    featured: z.boolean().optional(),
    order: z.number().optional(),
  }),
});

export const collections = { artworks };
