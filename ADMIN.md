# The local admin app

A tiny app for adding, editing and removing artwork — and for editing the site's
own text — without touching code. It runs **only on your machine** and never gets
deployed — it just edits the files in this repo.

## Run it

```sh
npm install     # once
npm run admin   # → http://localhost:4322
```

Open the URL in a browser. Two areas, switchable from the links in the header:

- **Artwork** (the home page) — the "Add artwork" form plus every current piece,
  each with **Edit** and **Delete** buttons.
- **Site text** — the words shown on the public site (title, hero, footer,
  contact email). See "Editing the site text" below.

## Adding a piece

Fill in the form and pick a **cover image** (and optionally a video and any
number of **extra images**), then **Add artwork**. Behind the scenes it:

- resizes the cover to max 1920px and optimizes it into
  `src/content/artworks/media/` (keeps transparency as PNG, otherwise JPEG),
- does the same for each extra image and records them as the piece's `gallery`,
- stores a video (if any) in `public/videos/`,
- writes one JSON entry in `src/content/artworks/`.

## Editing a piece

Click **Edit** on any card. You get the same fields as the Add form, pre-filled,
where you can change:

- **Title, category, project, year, description, Featured, sort order** — just
  edit and save.
- **Cover image** — the current cover is shown; pick a file only if you want to
  replace it (leave it empty to keep the current one).
- **Extra images (gallery)** — each existing image has **↑ ↓** to reorder and
  **✕** to remove it. Removing deletes that image file when you save. The "Add
  more images" picker appends new images to the set.
- **Video** — upload a file to add or replace a self-hosted clip, tick "Remove
  this video" to drop it, or paste a URL (Vimeo/YouTube/…) instead. An uploaded
  file wins over a pasted URL.

Then **Save changes**. Editing never renames files or the piece's id, so links
stay stable even if you change the title; only what you actually changed is
touched. Publish afterward to push it live.

## Editing the site text

Open **Site text** in the header. These are the words on the public site — the
browser-tab title, the search-engine description, your name and role, the hero
label/heading/paragraph, the footer line and the contact email. Edit them, click
**Save site text**, then **Publish**. (The hero heading keeps your line breaks —
press Enter to wrap it onto two lines like the default does.)

Under the hood this writes `src/data/site.json`, which the site reads at build
time — so there's still no database, just a flat file.

## Pieces with multiple images

Use **Extra images** to attach more views to one piece — a wireframe, a texture
breakdown, alternate angles. On the site the cover still shows in the mosaic; a
`⧉ N` badge marks that it has a set, and clicking it opens a lightbox you can
step through with the arrows, the arrow keys, or the thumbnail strip. The video,
if any, sits at the end of the set. (You can also add/reorder gallery images by
editing the artwork's JSON `gallery` array by hand — each value is an image
basename in `media/`.)

The real build (`astro:assets`) then generates responsive WebP versions
automatically — so you can hand it huge renders and the live site stays fast.

## Publishing

Click **Publish to site ↗** in the header. It runs `git add / commit / push`,
which triggers the GitHub Action and redeploys the live site in a couple of
minutes.

> First-time setup for Publish to work: the repo must be cloned locally with a
> git remote and push credentials configured (`git remote -v` should show your
> GitHub repo; `git push` should work without prompting). If it doesn't, commit
> and push manually — the files the admin wrote are ready to go.

## Video

- **Self-hosted** (uploaded through the form): keep clips short and compressed.
  On Cloudflare Pages each file must be < 25 MB; GitHub blocks files > 100 MB.
- **External** (recommended for long reels): upload to Vimeo/YouTube and, for
  now, put the piece in without a video — embeds can be added to the `video`
  field later (it accepts a full URL as well as a `/videos/...` path).

## Categories

The Category box suggests existing categories (Character, Environment,
Creature, Prop, …) but you can type a new one — it becomes a new filter chip on
the site automatically.

## Removing a piece

Use the **Delete** button on any card. It removes the JSON entry and its image
and video files. Publish afterward to push the change live.
