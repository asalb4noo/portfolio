# CLAUDE.md

Context for AI agents working in this repo. Read this before making changes.

## What this is

A portfolio website for **Asal Sadeghinia**, a 3D artist (characters, creatures,
environments, vehicles) who has worked on TV series and games. It replaces an
old, expensive WordPress/GoDaddy site.

Goals that drive every decision here:

- **Elegant and fast** — it's a showcase for image/video-heavy 3D renders.
- **No database, no server** — content is flat files; the site is fully static.
- **Free to host** — static output deploys to GitHub Pages (or Cloudflare Pages).
- **Easy to update** — a non-technical artist can add work via a local admin app,
  no code required.

## Stack

- **[Astro](https://astro.build)** (v7) — static site generator. Zero client JS
  except the small inline island in `index.astro` (filter + lightbox).
- **Content Collections** — artworks live as JSON, validated by a Zod schema.
- **`astro:assets`** — build-time image optimization (responsive WebP).
- **Node 22**, **npm** as the package manager (see the warning below).
- Local admin: **Express + Multer + Sharp** (dev-only, never deployed).

## ⚠️ Package manager: npm ONLY

This project uses **npm**. The devcontainer runs `npm install`, there is a
`package-lock.json`, and `package.json` pins `"packageManager": "npm@..."`.

Do **not** use `pnpm` or `yarn` here — pnpm will hijack `node_modules`, write its
own lockfile, and fail on blocked build scripts. If someone tries, pnpm now exits
with "This project is configured to use npm". Always run `npm ...`.

## Commands

```sh
npm install       # once
npm run dev       # dev server — see the daemon note below
npm run build     # production build -> ./dist
npm run preview   # preview the built site
npm run admin     # local content admin at http://localhost:4322
```

### Dev server is a background daemon

This Astro version runs `astro dev` detached. `npm run dev` returns immediately;
the server keeps running in the background. Manage it with:

- `npx astro dev status` — is it running? which URL?
- `npx astro dev logs` — request log / errors
- `npx astro dev stop` — stop it

The `dev` script uses `astro dev --host` (binds `0.0.0.0`) so the forwarded port
is reachable from the host browser inside the Docker/devcontainer setup. The site
is at **http://localhost:4321/**.

## Architecture & directory map

```
src/
  pages/index.astro         # THE site — single page: bento mosaic + filter + lightbox
  content/artworks/*.json    # one file per artwork (the "database")
  content/artworks/media/*   # source images (raster: jpg/png), optimized at build
  content.config.ts          # Zod schema for the artworks collection
  data/site.json             # site-wide copy (title, hero, footer, email) — edited via admin
  lib/media.ts               # resolves a JSON image basename -> optimized asset
public/
  videos/                    # self-hosted turntable / reel clips (referenced by URL)
  favicon.ico                # placeholder tab icon (replace with Asal's branding)
  CNAME.example              # rename to CNAME with the real domain when deploying
admin/server.mjs             # local-only content admin (Express) — add/edit/delete + site text — NOT deployed
.github/workflows/deploy.yml # build + deploy to GitHub Pages on push to main
astro.config.mjs             # `site` = the eventual domain (update before launch)
```

Docs: **README.md** (overview), **ADMIN.md** (editing content), **DEPLOY.md**
(hosting + domain).

## Content model

Each artwork is a JSON file in `src/content/artworks/`. Schema
(`src/content.config.ts`):

```jsonc
{
  "title": "Cyber Sentinel",           // required
  "category": "Character",              // required — becomes a filter chip
  "project": "Neon Horizon (TV Series)",// optional
  "description": "...",                 // optional
  "year": 2024,                         // optional
  "image": "01-cyber-sentinel.jpg",     // required — BASENAME of a file in media/ (the cover)
  "gallery": ["01-...-g01.jpg", ...],   // optional — extra images (basenames); lightbox shows [image, ...gallery]
  "video": "/videos/01-....mp4",        // optional — turntable/reel (path or URL)
  "featured": true,                     // optional — renders larger in the mosaic
  "order": 1                            // optional — sort order (ascending)
}
```

### The image pattern (important, non-obvious)

`image` is a plain **basename string**, not an import. `astro:assets` normally
needs a static import, so `src/lib/media.ts` bridges the gap: it eagerly
`import.meta.glob`s everything in `content/artworks/media/` and maps
`basename -> ImageMetadata`. Pages call `getArtworkImage(name)` and pass the
result to `<Image>` / `getImage()`.

Why: it keeps the JSON editable by tools (the admin app) with no TypeScript,
while still getting full build-time optimization. **When adding artwork, always
put the source image in `media/` and reference it by basename** — never point at
`/public`, or it won't be optimized. Gallery images work identically: each entry
in the optional `gallery` array is a basename in `media/`. `index.astro` builds a
per-artwork slide set `[image, ...gallery]` (each with a 1600px `full` + 200px
`thumb` variant); the lightbox browses that set (arrows, keyboard, thumbnail
strip) and appends the `video`, if any, as the last item.

Video is not processed by `astro:assets`; it's served verbatim from
`public/videos/` and played in the lightbox.

## Editing content

Prefer the admin app (`npm run admin`) — it optimizes images, stores files in the
right places, writes the JSON, and has a Publish button (git commit + push). It
can **add**, **edit** (title/category/…, cover, gallery reorder+add+remove,
video) and **delete** pieces, and edit the site copy under **Site text**. See
`ADMIN.md`. Editing the JSON by hand works too; keep `image` a basename that
exists in `media/`.

Edit keeps a piece's id and existing media filenames stable (no rename cascade
when the title changes) — only the JSON content and any explicitly changed media
are touched. New gallery uploads continue the `-gNN` numbering.

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push
to `main`. For a custom domain: rename `public/CNAME.example` -> `public/CNAME`,
set it in repo Settings, point DNS, and update `site` in `astro.config.mjs`. Full
steps in `DEPLOY.md`. Cloudflare Pages is the recommended alternative if videos
push past GitHub's bandwidth/file limits.

## Conventions & gotchas

- **Single page.** The whole site is `src/pages/index.astro`. Its `<script>` uses
  `define:vars` to hand data to the client (hence the "inline script" hint from
  `astro check` — that's expected, not an error).
- **Site copy is data, not markup.** All user-facing strings (tab title, meta
  description, brand/role, hero eyebrow/heading/paragraph, footer, contact email)
  live in `src/data/site.json`, imported at the top of `index.astro`. Don't
  hard-code these back into the markup — edit `site.json` (or the admin's "Site
  text" form). `heroHeading` may contain `\n`; the page renders each line with a
  `<br>`. Adding a new field means adding it to `site.json`, the `SITE_FIELDS`
  list in `admin/server.mjs`, and wherever `index.astro` should render it.
- **Design.** Dark "bento" mosaic (`Design F`): sticky nav, gradient hero, cursor
  spotlight, category filter chips, per-category accent hues, and a full-screen
  lightbox with keyboard nav. The lightbox is per-piece: its arrows/thumbnails browse
  that artwork's own image set (cover + `gallery` + `video`), and closing returns to
  the grid — it does not page across artworks. Earlier design drafts were removed.
- **Categories** come straight from the artworks' `category` values — add a new
  category just by using it; a filter chip appears automatically. Accent hues per
  category are in the `hues` map in `index.astro` (falls back to purple).
- **`admin/` and `dist/` are excluded** from the TS/`astro check` config.
- Don't commit `node_modules/`, `dist/`, or `.astro/` (all gitignored).
