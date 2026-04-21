import { defineConfig } from 'vite';

export default defineConfig({
  // Manifest is served from public/ as a static asset.
  // Service worker / offline support will be added back when Node is upgraded to 20+
  // (vite-plugin-pwa + workbox currently require Node 20+).
});
