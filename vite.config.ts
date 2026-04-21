import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Chromafall',
        short_name: 'Chromafall',
        description: 'A neon cascade puzzle — tap color clusters, watch them fall.',
        theme_color: '#0a0a14',
        background_color: '#0a0a14',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ]
});
