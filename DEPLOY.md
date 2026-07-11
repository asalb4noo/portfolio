# Deploying Asal's portfolio

The site is a **static** Astro build (`npm run build` → `./dist`). There is no
server and no database — content lives in `src/content/artworks/*.json` and is
edited with the local admin app (see `ADMIN.md`). That's what makes hosting
free.

## TL;DR

1. Push this repo to GitHub (branch `main`).
2. GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on
   every push. Done — the site is live at `https://<user>.github.io/<repo>`.
4. Point the custom domain (below) and update `site` in `astro.config.mjs`.

Every time new artwork is committed (by you or by the admin app's *Publish*
button), the Action rebuilds and redeploys automatically.

## First push

```sh
git init            # already done if this is a repo
git add -A
git commit -m "Initial portfolio"
git branch -M main
git remote add origin git@github.com:<user>/<repo>.git
git push -u origin main
```

Then set **Settings → Pages → Source → GitHub Actions** once. After that it's
fully automatic.

## Where to host (all free)

| Host | Bandwidth | Per-file limit | Custom domain | Notes |
|------|-----------|----------------|---------------|-------|
| **GitHub Pages** (set up here) | ~100 GB/mo soft | 100 MB (git) | ✅ free SSL | One account, zero extra setup — the workflow does it. |
| **Cloudflare Pages** *(recommended if videos get heavy)* | **unlimited** | 25 MB | ✅ free SSL | Best free tier. Connect the GitHub repo in the Cloudflare dashboard — it auto-builds on push, so you don't even need the Action. |
| **Netlify** | 100 GB/mo | large | ✅ free SSL | Also connects to the repo directly; nice drag-drop fallback. |

**Recommendation:** start with **GitHub Pages** (already wired). If Asal adds
many/large turntable videos, move to **Cloudflare Pages** for unlimited
bandwidth — keep each clip under 25 MB there, or host big reels on Vimeo/YouTube
and embed them instead (see "Video" in `ADMIN.md`).

> Large videos in git: GitHub warns at 50 MB and blocks at 100 MB per file. Keep
> turntables short and compressed, or use Git LFS / external video hosting.

## Pointing Asal's domain

You keep the domain (registrar doesn't matter — GoDaddy was expensive for
*hosting*, not the ~$12/yr domain). Just repoint DNS.

### GitHub Pages
1. Rename `public/CNAME.example` → `public/CNAME` and put the real domain in it
   (e.g. `asalsadeghinia.com`). It gets copied into every build.
2. GitHub → **Settings → Pages → Custom domain** → enter the domain → **Save**,
   then tick **Enforce HTTPS**.
3. At the DNS provider:
   - **Apex** (`asalsadeghinia.com`) — four `A` records:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     (optionally the matching `AAAA` records for IPv6).
   - **www** — a `CNAME` record → `<user>.github.io`.
4. Set `site: 'https://asalsadeghinia.com'` in `astro.config.mjs`.

### Cloudflare Pages
Add the domain under the Pages project → **Custom domains**. If the domain's DNS
is already on Cloudflare it configures itself; otherwise add a `CNAME` →
`<project>.pages.dev`. SSL is automatic.

DNS changes take anywhere from minutes to a few hours to propagate.
