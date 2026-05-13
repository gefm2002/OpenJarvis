import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Puerto del dev server. Por defecto 5183 para no chocar con otra app en 5173. */
const devPort = Number.parseInt(process.env.VITE_DEV_PORT ?? '5183', 10);

const proxyTarget = process.env.VITE_DEV_PROXY || 'http://127.0.0.1:8000';

try {
  const u = new URL(proxyTarget);
  const targetPort = u.port || (u.protocol === 'https:' ? '443' : '80');
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (loopback && String(targetPort) === String(devPort)) {
    throw new Error(
      `[vite] VITE_DEV_PROXY (${proxyTarget}) no puede usar el mismo puerto (${devPort}) que el UI; ` +
        'deja VITE_DEV_PROXY sin definir o apunta a `jarvis serve` (p. ej. http://127.0.0.1:8000).',
    );
  }
} catch (e) {
  if (e instanceof Error && e.message.startsWith('[vite]')) throw e;
}

/** Mismo proxy en `vite dev` y `vite preview` (preview no hereda `server.proxy` por defecto). */
const apiDevProxy: Record<string, { target: string; changeOrigin: boolean }> = {
  '/v1': { target: proxyTarget, changeOrigin: true },
  '/health': { target: proxyTarget, changeOrigin: true },
  '/api': { target: proxyTarget, changeOrigin: true },
};

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    {
      name: 'openjarvis-log-dev-proxy',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const addr = server.httpServer?.address();
          const port =
            addr && typeof addr === 'object' && 'port' in addr ? String(addr.port) : String(devPort);
          // eslint-disable-next-line no-console -- ayuda a depurar 404 cuando :8000 es otro servicio
          console.info(`[openjarvis] dev proxy /v1,/health,/api → ${proxyTarget} (UI :${port})`);
        });
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Evita que un service worker viejo sirva JS obsoleto en `npm run dev`
      // (síntomas: imports a archivos que ya no existen, ej. MainLayout/Footer).
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: 'OpenJarvis',
        short_name: 'Jarvis',
        description: 'On-device AI assistant',
        theme_color: '#161618',
        background_color: '#161618',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallbackDenylist: [/^\/v1\//, /^\/health/, /^\/dashboard/],
      },
    }),
  ],
  build: {
    outDir: '../src/openjarvis/server/static',
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          markdown: ['react-markdown', 'rehype-highlight', 'remark-gfm'],
          charts: ['recharts'],
          router: ['react-router'],
        },
      },
    },
  },
  server: {
    port: devPort,
    strictPort: false,
    host: 'localhost',
    hmr: {
      host: 'localhost',
    },
    // El proxy del servidor de desarrollo debe apuntar siempre a `jarvis serve`
    // (p. ej. :8000). `VITE_API_URL` es solo para el *cliente* (import.meta.env)
    // y a veces apunta a otro servicio (AgentKit, producción) — reutilizarlo aquí
    // rompe `/v1/*` con 404. Override: `VITE_DEV_PROXY=http://127.0.0.1:9000 npm run dev`.
    proxy: apiDevProxy,
  },
  preview: {
    port: devPort,
    strictPort: false,
    host: 'localhost',
    // Sin esto, `npm run preview` no reenvía `/v1` → 404 en todas las rutas del API.
    proxy: apiDevProxy,
  },
});
