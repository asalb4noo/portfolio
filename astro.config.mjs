// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Used for absolute URLs (sitemap, canonical, og tags).
  // ▶ Change this to Asal's real domain once it's pointed at the host.
  //   Custom domain (apex or www): keep `base: '/'`.
  //   GitHub Pages WITHOUT a custom domain (https://<user>.github.io/<repo>):
  //     set `site: 'https://<user>.github.io'` and `base: '/<repo>'`.
  site: 'https://asalsadeghinia.com',
  base: '/',
});
