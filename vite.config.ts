import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

// Read package.json once at config-load time so we can use its version as
// the local-dev fallback. CI sets VITE_APP_VERSION explicitly from the
// GitHub Release tag (see .github/workflows/deploy.yml) so the displayed
// version always reflects what was actually shipped.
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = process.env.VITE_APP_VERSION || `v${pkg.version}-dev`;

export default defineConfig({
  // Site is hosted at hosca.com/chromafall/ — base prefixes all asset
  // URLs (script src, CSS hrefs, etc.) so they resolve correctly under
  // that subpath instead of the server root. Local `npm run dev` honors
  // this too, so the dev URL is http://localhost:5173/chromafall/.
  base: '/chromafall/',
  // __APP_VERSION__ is replaced at build time with a literal string. See
  // src/types/global.d.ts for the ambient declaration that lets TS use it.
  define: {
    __APP_VERSION__: JSON.stringify(version)
  }
  // Manifest is served from public/ as a static asset.
  // Service worker / offline support will be added back when Node is upgraded to 20+
  // (vite-plugin-pwa + workbox currently require Node 20+).
});
