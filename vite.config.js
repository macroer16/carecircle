import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (not the default generateSW) because reminders need
      // real push-event handling code — see src/sw.js. generateSW only
      // auto-builds caching logic, it can't add custom event listeners.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: {
        name: 'CareCircle',
        short_name: 'CareCircle',
        description: "Your family's shared place for care coordination",
        theme_color: '#FAF8F3',
        background_color: '#FAF8F3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        // Supabase requests are dynamic (auth'd API calls) — not suitable
        // for precaching, they're handled at runtime by the app itself.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
    }),
  ],
});
