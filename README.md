# Asal Sadeghinia — Portfolio

An elegant, fast, static portfolio for 3D artist Asal Sadeghinia. Built with
[Astro](https://astro.build). No database, no server, free to host.

- **Content** lives in `src/content/artworks/*.json` (one file per piece),
  validated by a schema in `src/content.config.ts`.
- **Images** are optimized at build time by `astro:assets` (responsive WebP),
  so heavy 3D renders load fast. Source images live in
  `src/content/artworks/media/`.
- **Video** (turntables / reels) is supported via an optional `video` field.
- **Editing** is done through a small local admin app — no code required.

## Commands

| Command | Action |
| :------ | :----- |
| `npm install` | Install dependencies (once) |
| `npm run dev` | Local dev server at `localhost:4321` |
| `npm run build` | Production build to `./dist/` |
| `npm run preview` | Preview the production build |
| `npm run admin` | Local content admin at `localhost:4322` (see `ADMIN.md`) |

## Project layout

```
src/
  pages/index.astro           # the site (bento mosaic + filter + lightbox)
  content/artworks/*.json     # one entry per artwork
  content/artworks/media/*    # source images (optimized at build)
  content.config.ts           # content schema
  lib/media.ts                # maps a JSON image name -> optimized asset
public/videos/                # self-hosted turntable / reel clips
admin/server.mjs              # local-only content admin (not deployed)
.github/workflows/deploy.yml  # build + deploy to GitHub Pages on push
```

## Docs

- **`ADMIN.md`** — how to add/remove artwork and publish.
- **`DEPLOY.md`** — hosting options, the GitHub Action, and pointing the domain.
