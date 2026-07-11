// Local-only admin for Asal's portfolio.
//
//   npm install      (once)
//   npm run admin    -> http://localhost:4322
//
// It writes directly into the site's content:
//   - optimizes & stores images in  src/content/artworks/media/
//   - stores videos in              public/videos/
//   - writes one JSON entry in      src/content/artworks/
//   - edits the site-wide copy in   src/data/site.json  ("Site text")
// Then the normal build (local or the GitHub Action) picks the files up.
// This never ships to the deployed site — only ./dist is deployed.

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src/content/artworks');
const MEDIA_DIR = path.join(CONTENT_DIR, 'media');
const VIDEO_DIR = path.join(ROOT, 'public/videos');
const SITE_FILE = path.join(ROOT, 'src/data/site.json');
const PORT = Number(process.env.ADMIN_PORT) || 4322;

await fs.mkdir(MEDIA_DIR, { recursive: true });
await fs.mkdir(VIDEO_DIR, { recursive: true });
await fs.mkdir(path.dirname(SITE_FILE), { recursive: true });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(MEDIA_DIR));
app.use('/videos', express.static(VIDEO_DIR));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300 MB ceiling for a raw upload
});
// Same field layout for both Add and Edit forms.
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'gallery', maxCount: 20 },
  { name: 'video', maxCount: 1 },
]);

// ---------- helpers ----------
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

const pad = (n) => String(n).padStart(2, '0');
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Multer/qs give a single value as a string and repeats as an array; normalize.
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const cleanId = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '');

async function readArtworks() {
  const files = (await fs.readdir(CONTENT_DIR)).filter((f) => f.endsWith('.json'));
  const list = [];
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.join(CONTENT_DIR, f), 'utf8'));
    list.push({ id: f.replace(/\.json$/, ''), file: f, data });
  }
  return list.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
}

async function nextOrder(list) {
  const max = list.reduce((m, a) => Math.max(m, a.data.order ?? 0), 0);
  return max + 1;
}

// Highest existing "-gNN" index among a piece's gallery files, so newly added
// gallery images continue the numbering instead of colliding.
async function nextGalleryIndex(base) {
  const files = await fs.readdir(MEDIA_DIR);
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-g(\\d+)\\.`);
  let max = 0;
  for (const f of files) {
    const m = f.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// Optimize one uploaded image into MEDIA_DIR: honor EXIF rotation, cap size,
// keep alpha as PNG else JPEG. Returns the written basename. `suffix` lets
// gallery images share the piece's base name (e.g. "-g01").
async function optimizeImage(buffer, base, suffix = '') {
  const meta = await sharp(buffer).metadata();
  const resized = sharp(buffer).rotate().resize({ width: 1920, withoutEnlargement: true });
  let ext, pipeline;
  if (meta.hasAlpha) {
    ext = 'png';
    pipeline = resized.png({ compressionLevel: 9 });
  } else {
    ext = 'jpg';
    pipeline = resized.jpeg({ quality: 85, mozjpeg: true });
  }
  const name = `${base}${suffix}.${ext}`;
  await pipeline.toFile(path.join(MEDIA_DIR, name));
  return name;
}

const rmMedia = async (name) => {
  if (name && existsSync(path.join(MEDIA_DIR, name))) await fs.rm(path.join(MEDIA_DIR, name));
};
// Only delete self-hosted clips (under /videos/), never external URLs.
const rmVideo = async (url) => {
  if (url && url.startsWith('/videos/')) {
    const vp = path.join(VIDEO_DIR, path.basename(url));
    if (existsSync(vp)) await fs.rm(vp);
  }
};

// Store an uploaded video verbatim under public/videos/ using the piece's base
// name; returns the "/videos/..." URL.
async function saveVideo(file, base) {
  const vext = (path.extname(file.originalname) || '.mp4').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const videoName = `${base}${vext}`;
  await fs.writeFile(path.join(VIDEO_DIR, videoName), file.buffer);
  return `/videos/${videoName}`;
}

// ---------- site-wide copy ----------
// Every user-facing string on the site. index.astro imports src/data/site.json
// and renders from it, so editing these here changes the live site copy.
const SITE_FIELDS = [
  { key: 'siteTitle', label: 'Browser tab title', type: 'text', hint: 'Shown in the browser tab and search results.' },
  { key: 'metaDescription', label: 'Search-engine description', type: 'area', hint: 'One or two sentences describing the site (for Google / link previews).' },
  { key: 'brand', label: 'Name (top-left)', type: 'text' },
  { key: 'role', label: 'Role (top-right)', type: 'text', hint: 'e.g. 3D Artist' },
  { key: 'heroEyebrow', label: 'Hero label', type: 'text', hint: 'The small pill above the big heading.' },
  { key: 'heroHeading', label: 'Hero heading', type: 'area', hint: 'The big gradient headline. Press Enter for a line break.' },
  { key: 'heroText', label: 'Hero paragraph', type: 'area' },
  { key: 'footerText', label: 'Footer line', type: 'text' },
  { key: 'contactEmail', label: 'Contact email', type: 'text', hint: 'Shown in the footer and used for the mailto link.' },
];
const SITE_DEFAULTS = {
  siteTitle: 'Asal Sadeghinia — 3D Artist',
  metaDescription: 'Portfolio of Asal Sadeghinia, 3D artist for film, television and games.',
  brand: 'Asal Sadeghinia',
  role: '3D Artist',
  heroEyebrow: 'Character · Creature · Environment · Vehicle',
  heroHeading: 'Modeling the\nworlds you play in.',
  heroText:
    'Portfolio of 3D work for film, television and games — sculpted, textured and built for real-time and cinematic pipelines.',
  footerText: '© Asal Sadeghinia — 3D Artist',
  contactEmail: 'hello@example.com',
};

async function readSite() {
  let stored = {};
  if (existsSync(SITE_FILE)) {
    try {
      stored = JSON.parse(await fs.readFile(SITE_FILE, 'utf8'));
    } catch {
      stored = {};
    }
  }
  return { ...SITE_DEFAULTS, ...stored };
}

async function writeSite(body) {
  const out = {};
  for (const { key } of SITE_FIELDS) {
    const v = body[key];
    // Normalize CRLF from browser textareas to plain "\n".
    out[key] = (v == null ? SITE_DEFAULTS[key] : String(v)).replace(/\r\n/g, '\n');
  }
  await fs.writeFile(SITE_FILE, JSON.stringify(out, null, 2) + '\n');
}

// ---------- shared UI ----------
const STYLES = `
  :root{--accent:#e05a3a;--ink:#2a2320;--muted:#8a7d70;--line:#e6ddd2;--bg:#fdf6ee}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Segoe UI',-apple-system,sans-serif;color:var(--ink);background:var(--bg)}
  a{color:var(--accent)}
  header{padding:1.5rem 2rem;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
  header h1{font-size:1.2rem;margin:0}
  .nav-links{display:flex;gap:1.25rem;align-items:center}
  .nav-links a{font-weight:600;text-decoration:none;color:var(--muted)}
  .nav-links a.on{color:var(--ink);text-decoration:underline}
  .wrap{max-width:1100px;margin:0 auto;padding:2rem}
  .msg{background:#e7f6e7;border:1px solid #b9e0b9;padding:.75rem 1rem;border-radius:8px;margin-bottom:1.5rem}
  .msg.err{background:#fbeaea;border-color:#e2b4b4}
  form.add{display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#fff;border:1px solid var(--line);border-radius:12px;padding:1.5rem;margin-bottom:2.5rem}
  form.add .full{grid-column:1/3}
  label{display:block;font-size:.8rem;font-weight:600;color:var(--muted);margin-bottom:.3rem}
  input[type=text],input[type=email],input[type=number],textarea,select{width:100%;padding:.55rem .7rem;border:1px solid var(--line);border-radius:8px;font:inherit;background:#fff}
  textarea{min-height:70px;resize:vertical}
  .row-inline{display:flex;gap:1.5rem;align-items:center}
  button{cursor:pointer;font:inherit}
  .submit{grid-column:1/3;background:var(--accent);color:#fff;border:none;padding:.7rem 1.2rem;border-radius:8px;font-weight:700}
  .publish{background:none;border:1px solid var(--accent);color:var(--accent);padding:.5rem 1rem;border-radius:8px;font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1.25rem}
  .card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .card img{width:100%;aspect-ratio:4/5;object-fit:cover;background:#eee}
  .cardbody{padding:.75rem;display:flex;flex-direction:column;gap:.2rem}
  .ctag{font-size:.7rem;text-transform:uppercase;letter-spacing:.03em;color:var(--accent);font-weight:700}
  .proj{font-size:.8rem;color:var(--muted)}
  .cardactions{display:flex;gap:.5rem;margin-top:.5rem}
  .cardactions form{flex:1;display:flex}
  .btn-edit{flex:1;text-align:center;text-decoration:none;background:var(--accent);color:#fff;border-radius:6px;padding:.35rem;font-size:.78rem;font-weight:700}
  .del{flex:1;background:none;border:1px solid var(--line);color:#b23;border-radius:6px;padding:.3rem;font-size:.75rem}
  .hint{font-size:.75rem;color:var(--muted);margin-top:.2rem}
  .back{display:inline-block;margin-bottom:1rem;text-decoration:none}
  .panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:1.5rem}
  .field{margin-bottom:1.1rem}
  .cover-current{width:120px;aspect-ratio:4/5;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:#eee}
  .gallery-edit{list-style:none;margin:.5rem 0 0;padding:0;display:flex;flex-wrap:wrap;gap:.75rem}
  .gallery-edit li{width:120px;background:#faf4ec;border:1px solid var(--line);border-radius:8px;padding:.4rem;display:flex;flex-direction:column;gap:.35rem}
  .gallery-edit img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:6px;background:#eee}
  .galbtns{display:flex;gap:.25rem}
  .galbtns button{flex:1;border:1px solid var(--line);background:#fff;border-radius:5px;padding:.2rem;font-size:.72rem}
  .galbtns button[data-act=rm]{color:#b23;border-color:#e2b4b4}
  .vid-current{width:100%;max-width:320px;border-radius:8px;border:1px solid var(--line);background:#000;display:block;margin-bottom:.5rem}
`;

function layout(title, inner, { msg, active } = {}) {
  const nav = (href, text) =>
    `<a href="${href}" class="${active === href ? 'on' : ''}">${text}</a>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<style>${STYLES}</style></head><body>
<header>
  <h1>Asal Portfolio — Admin</h1>
  <div class="nav-links">
    ${nav('/', 'Artwork')}
    ${nav('/settings', 'Site text')}
    <form method="post" action="/publish" onsubmit="return confirm('Commit &amp; push all changes to GitHub? This triggers a deploy.')">
      <button class="publish">Publish to site ↗</button>
    </form>
  </div>
</header>
<div class="wrap">
  ${msg ? `<div class="msg ${msg.err ? 'err' : ''}">${esc(msg.text)}</div>` : ''}
  ${inner}
</div>
</body></html>`;
}

const catDatalist = (categories) =>
  `<datalist id="cats">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;

// ---------- pages ----------
function homePage(list, categories, msg) {
  const cards = list
    .map(
      (a) => `
      <div class="card">
        <img src="/media/${esc(a.data.image)}" alt="" loading="lazy" />
        <div class="cardbody">
          <div class="ctag">${esc(a.data.category)}${a.data.video ? ' · 🎬' : ''}${Array.isArray(a.data.gallery) && a.data.gallery.length ? ` · ⧉ ${a.data.gallery.length + 1}` : ''}</div>
          <strong>${esc(a.data.title)}</strong>
          <span class="proj">${esc(a.data.project ?? '')}</span>
          <div class="cardactions">
            <a class="btn-edit" href="/edit/${esc(a.id)}">Edit</a>
            <form method="post" action="/delete" onsubmit="return confirm('Delete &ldquo;${esc(a.data.title)}&rdquo;?')">
              <input type="hidden" name="id" value="${esc(a.id)}" />
              <button class="del">Delete</button>
            </form>
          </div>
        </div>
      </div>`
    )
    .join('');

  const inner = `
  <form class="add" method="post" action="/add" enctype="multipart/form-data">
    <div><label>Title *</label><input type="text" name="title" required /></div>
    <div><label>Category *</label><input type="text" name="category" list="cats" required />${catDatalist(categories)}</div>
    <div><label>Project / show</label><input type="text" name="project" placeholder="e.g. Neon Horizon (TV Series)" /></div>
    <div><label>Year</label><input type="number" name="year" min="1990" max="2100" /></div>
    <div class="full"><label>Description</label><textarea name="description"></textarea></div>
    <div><label>Cover image *</label><input type="file" name="image" accept="image/*" required />
      <div class="hint">Resized to max 1920px &amp; optimized automatically. Shown in the mosaic.</div></div>
    <div><label>Video (optional)</label><input type="file" name="video" accept="video/*" />
      <div class="hint">Turntable / reel. Keep it small &amp; compressed.</div></div>
    <div class="full"><label>Extra images (optional)</label><input type="file" name="gallery" accept="image/*" multiple />
      <div class="hint">Wireframe, texture breakdown, alternate angles… Browsable as a set in the lightbox, after the cover.</div></div>
    <div class="full row-inline"><label style="margin:0"><input type="checkbox" name="featured" /> Featured</label></div>
    <button class="submit" type="submit">Add artwork</button>
  </form>

  <h2>Current work (${list.length})</h2>
  <div class="grid">${cards || '<p>No artwork yet.</p>'}</div>`;

  return layout('Asal Portfolio — Admin', inner, { msg, active: '/' });
}

function editPage(a, categories, msg) {
  const d = a.data;
  const galleryItems = (Array.isArray(d.gallery) ? d.gallery : [])
    .map(
      (g) => `
        <li>
          <img src="/media/${esc(g)}" alt="" loading="lazy" />
          <div class="galbtns">
            <button type="button" data-act="up" title="Move earlier">↑</button>
            <button type="button" data-act="down" title="Move later">↓</button>
            <button type="button" data-act="rm" title="Remove">✕</button>
          </div>
          <input type="hidden" name="gallery" value="${esc(g)}" />
        </li>`
    )
    .join('');

  const hasLocalVideo = d.video && d.video.startsWith('/videos/');
  const videoBlock = d.video
    ? `${hasLocalVideo ? `<video class="vid-current" src="${esc(d.video)}" controls playsinline muted></video>` : `<div class="hint">External video: <a href="${esc(d.video)}" target="_blank" rel="noreferrer">${esc(d.video)}</a></div>`}
       <label style="margin:.4rem 0 0"><input type="checkbox" name="remove_video" /> Remove this video</label>`
    : `<div class="hint">No video on this piece yet.</div>`;

  const inner = `
  <a class="back" href="/">← Back to all artwork</a>
  <h2>Edit “${esc(d.title)}”</h2>
  <form class="add" method="post" action="/edit" enctype="multipart/form-data">
    <input type="hidden" name="id" value="${esc(a.id)}" />

    <div><label>Title *</label><input type="text" name="title" value="${esc(d.title)}" required /></div>
    <div><label>Category *</label><input type="text" name="category" list="cats" value="${esc(d.category)}" required />${catDatalist(categories)}</div>
    <div><label>Project / show</label><input type="text" name="project" value="${esc(d.project ?? '')}" /></div>
    <div><label>Year</label><input type="number" name="year" min="1990" max="2100" value="${d.year ?? ''}" /></div>
    <div class="full"><label>Description</label><textarea name="description">${esc(d.description ?? '')}</textarea></div>

    <div class="full"><label>Cover image</label>
      <div class="row-inline">
        <img class="cover-current" src="/media/${esc(d.image)}" alt="" />
        <div>
          <input type="file" name="image" accept="image/*" />
          <div class="hint">Leave empty to keep the current cover. Upload to replace it.</div>
        </div>
      </div>
    </div>

    <div class="full"><label>Extra images (gallery)</label>
      <ol class="gallery-edit" id="gal">${galleryItems || ''}</ol>
      ${galleryItems ? '<div class="hint">Reorder with ↑ ↓, or ✕ to remove. Removals delete the file when you save.</div>' : '<div class="hint">No extra images yet.</div>'}
      <div style="margin-top:.6rem"><input type="file" name="gallery" accept="image/*" multiple />
        <div class="hint">Add more images — they are appended to the set.</div></div>
    </div>

    <div class="full"><label>Video</label>
      ${videoBlock}
      <div style="margin-top:.6rem"><input type="file" name="video" accept="video/*" />
        <div class="hint">Upload to add / replace a self-hosted clip.</div></div>
      <div style="margin-top:.6rem"><input type="text" name="video_url" placeholder="…or paste a URL (Vimeo/YouTube/…)" value="${hasLocalVideo ? '' : esc(d.video ?? '')}" />
        <div class="hint">A URL is used only if no file is uploaded above.</div></div>
    </div>

    <div><label>Sort order</label><input type="number" name="order" value="${d.order ?? ''}" />
      <div class="hint">Lower numbers appear first in the mosaic.</div></div>
    <div class="row-inline"><label style="margin:0"><input type="checkbox" name="featured" ${d.featured ? 'checked' : ''} /> Featured (larger tile)</label></div>

    <button class="submit" type="submit">Save changes</button>
  </form>

  <script>
    const gal = document.getElementById('gal');
    gal && gal.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const li = btn.closest('li'); const act = btn.dataset.act;
      if (act === 'rm') li.remove();
      else if (act === 'up' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
      else if (act === 'down' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    });
  </script>`;

  return layout(`Edit ${d.title} — Admin`, inner, { msg, active: '/' });
}

function settingsPage(site, msg) {
  const fields = SITE_FIELDS.map(({ key, label, type, hint }) => {
    const val = esc(site[key] ?? '');
    const control =
      type === 'area'
        ? `<textarea name="${key}">${val}</textarea>`
        : `<input type="${key === 'contactEmail' ? 'email' : 'text'}" name="${key}" value="${val}" />`;
    return `<div class="field"><label>${esc(label)}</label>${control}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
  }).join('');

  const inner = `
  <h2>Site text</h2>
  <p class="hint" style="margin-top:-.5rem">These are the words shown on the public site — the title, hero, footer and contact email. Edit and save, then Publish to push them live.</p>
  <form class="panel" method="post" action="/settings">
    ${fields}
    <button class="submit" style="grid-column:auto" type="submit">Save site text</button>
  </form>`;

  return layout('Site text — Admin', inner, { msg, active: '/settings' });
}

const msgFrom = (req) => (req.query.msg ? { text: req.query.msg, err: req.query.err === '1' } : null);

// ---------- routes ----------
app.get('/', async (req, res) => {
  const list = await readArtworks();
  const categories = [...new Set(list.map((a) => a.data.category))];
  res.send(homePage(list, categories, msgFrom(req)));
});

app.get('/settings', async (req, res) => {
  res.send(settingsPage(await readSite(), msgFrom(req)));
});

app.post('/settings', async (req, res) => {
  try {
    await writeSite(req.body);
    res.redirect(`/settings?msg=${encodeURIComponent('Site text saved. Publish to push it live.')}`);
  } catch (e) {
    res.redirect(`/settings?err=1&msg=${encodeURIComponent(e.message)}`);
  }
});

app.get('/edit/:id', async (req, res) => {
  const id = cleanId(req.params.id);
  const jsonPath = path.join(CONTENT_DIR, `${id}.json`);
  if (!id || !existsSync(jsonPath)) {
    return res.redirect(`/?err=1&msg=${encodeURIComponent('That artwork was not found.')}`);
  }
  const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const list = await readArtworks();
  const categories = [...new Set(list.map((a) => a.data.category))];
  res.send(editPage({ id, data }, categories, msgFrom(req)));
});

app.post('/add', uploadFields, async (req, res) => {
  try {
    const { title, category } = req.body;
    const imageFile = req.files?.image?.[0];
    if (!title || !category || !imageFile) throw new Error('Title, category and image are all required.');

    const list = await readArtworks();
    const order = await nextOrder(list);
    const base = `${pad(order)}-${slugify(title)}`;

    // Cover image.
    const imageName = await optimizeImage(imageFile.buffer, base);

    // Optional extra images -> gallery, sharing the piece's base name.
    const galleryFiles = req.files?.gallery ?? [];
    const gallery = [];
    for (let i = 0; i < galleryFiles.length; i++) {
      gallery.push(await optimizeImage(galleryFiles[i].buffer, base, `-g${pad(i + 1)}`));
    }

    // Optional video: stored verbatim.
    let videoUrl;
    const videoFile = req.files?.video?.[0];
    if (videoFile) videoUrl = await saveVideo(videoFile, base);

    const entry = { title, category };
    if (req.body.project) entry.project = req.body.project;
    if (req.body.description) entry.description = req.body.description;
    if (req.body.year) entry.year = Number(req.body.year);
    entry.image = imageName;
    if (gallery.length) entry.gallery = gallery;
    if (videoUrl) entry.video = videoUrl;
    if (req.body.featured) entry.featured = true;
    entry.order = order;

    await fs.writeFile(path.join(CONTENT_DIR, `${base}.json`), JSON.stringify(entry, null, 2) + '\n');
    res.redirect(`/?msg=${encodeURIComponent(`Added “${title}”.`)}`);
  } catch (e) {
    res.redirect(`/?err=1&msg=${encodeURIComponent(e.message)}`);
  }
});

// Edit keeps the piece's id and existing file names stable (no rename cascade
// when the title changes); only the JSON content and any explicitly changed
// media are touched.
app.post('/edit', uploadFields, async (req, res) => {
  const id = cleanId(req.body.id);
  try {
    const jsonPath = path.join(CONTENT_DIR, `${id}.json`);
    if (!id || !existsSync(jsonPath)) throw new Error('That artwork was not found.');
    const prev = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

    const { title, category } = req.body;
    if (!title || !category) throw new Error('Title and category are required.');
    const base = id; // stable base name for any new media on this piece

    // Cover: replace only if a new file was uploaded.
    let imageName = prev.image;
    const imageFile = req.files?.image?.[0];
    if (imageFile) {
      imageName = await optimizeImage(imageFile.buffer, base);
      if (imageName !== prev.image) await rmMedia(prev.image); // drop old (e.g. ext change)
    }

    // Gallery: the form submits the kept basenames in their new order (validated
    // against the piece's known files); anything missing was removed -> delete it.
    const prevGallery = Array.isArray(prev.gallery) ? prev.gallery : [];
    const kept = asArray(req.body.gallery).filter((g) => prevGallery.includes(g));
    const keptSet = new Set(kept);
    for (const g of prevGallery) if (!keptSet.has(g)) await rmMedia(g);

    // Add any newly uploaded gallery images, continuing the -gNN numbering.
    const gallery = [...kept];
    const newGalleryFiles = req.files?.gallery ?? [];
    let gi = await nextGalleryIndex(base);
    for (const gf of newGalleryFiles) {
      gallery.push(await optimizeImage(gf.buffer, base, `-g${pad(gi++)}`));
    }

    // Video: uploaded file wins; else a pasted URL; else remove-checkbox; else keep.
    let videoUrl = prev.video;
    const videoFile = req.files?.video?.[0];
    const videoUrlInput = (req.body.video_url || '').trim();
    if (videoFile) {
      await rmVideo(prev.video);
      videoUrl = await saveVideo(videoFile, base);
    } else if (videoUrlInput) {
      if (videoUrlInput !== prev.video) await rmVideo(prev.video);
      videoUrl = videoUrlInput;
    } else if (req.body.remove_video) {
      await rmVideo(prev.video);
      videoUrl = undefined;
    }

    const entry = { title, category };
    if (req.body.project) entry.project = req.body.project;
    if (req.body.description) entry.description = req.body.description;
    if (req.body.year) entry.year = Number(req.body.year);
    entry.image = imageName;
    if (gallery.length) entry.gallery = gallery;
    if (videoUrl) entry.video = videoUrl;
    if (req.body.featured) entry.featured = true;
    entry.order = req.body.order ? Number(req.body.order) : prev.order ?? 0;

    await fs.writeFile(jsonPath, JSON.stringify(entry, null, 2) + '\n');
    res.redirect(`/?msg=${encodeURIComponent(`Saved “${title}”.`)}`);
  } catch (e) {
    const back = id ? `/edit/${id}` : '/';
    res.redirect(`${back}?err=1&msg=${encodeURIComponent(e.message)}`);
  }
});

app.post('/delete', async (req, res) => {
  try {
    const id = cleanId(req.body.id);
    if (!id) throw new Error('Missing id.');
    const jsonPath = path.join(CONTENT_DIR, `${id}.json`);
    const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    await rmMedia(data.image);
    if (Array.isArray(data.gallery)) for (const g of data.gallery) await rmMedia(g);
    await rmVideo(data.video);
    await fs.rm(jsonPath);
    res.redirect(`/?msg=${encodeURIComponent(`Deleted “${data.title ?? id}”.`)}`);
  } catch (e) {
    res.redirect(`/?err=1&msg=${encodeURIComponent(e.message)}`);
  }
});

app.post('/publish', async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync(
      'git add -A && git commit -m "content: update artworks via admin" && git push',
      { cwd: ROOT }
    );
    res.redirect(`/?msg=${encodeURIComponent('Published. ' + (stdout || stderr).trim().split('\n').pop())}`);
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || e.message || '');
    const nothing = /nothing to commit/.test(out);
    res.redirect(`/?err=${nothing ? 0 : 1}&msg=${encodeURIComponent(nothing ? 'Nothing new to publish.' : 'Publish failed: ' + out.trim().split('\n').pop())}`);
  }
});

app.listen(PORT, () => {
  console.log(`\n  Asal Portfolio admin running:  http://localhost:${PORT}\n`);
});
