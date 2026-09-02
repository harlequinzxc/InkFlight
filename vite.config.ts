import { defineConfig, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleApiRequest } from './api/_shared';

/**
 * InkFlight — Vite config.
 *
 * - `src/lib/sq.ts` holds the entire upstream SQ contract (server-side only).
 * - Production: /api/* are Vercel serverless functions (see /api/*.ts).
 * - Development: the plugin below mounts the same handlers on the dev server,
 *   so `npm run dev` behaves exactly like the Vercel deployment.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inkflight-dev-api',
      // Dev-only: serve /api/getcabin & /api/menu through the exact same
      // handler code that Vercel will run in production.
      configureServer(server) {
        server.middlewares.use(((req, res, next) => {
          const url = (req.url || '').split('?')[0];
          if (url === '/api/getcabin' || url === '/api/cabins' || url === '/api/menu') {
            void handleApiRequest(url === '/api/menu' ? 'menu' : 'cabins', req, res);
          } else {
            next();
          }
        }) as Connect.NextHandleFunction);
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'favicon.png'],
      manifest: {
        id: '/',
        name: 'InkFlight — Inflight Menu Studio',
        short_name: 'InkFlight',
        description:
          'Pull live Singapore Airlines inflight menus, tailor them, and export print-ready A4/A6 menu sheets.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#071b33',
        theme_color: '#071b33',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // never attempt to cache the JSON API (POST-only anyway)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {}
  }
});
