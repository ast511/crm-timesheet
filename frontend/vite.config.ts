import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_PROXY_TARGET = 'http://localhost:3000';

/**
 * https://vite.dev/config/
 *
 * The dev proxy is the reason `VITE_API_BASE_URL` defaults to the relative
 * `/api/v1`: the browser talks to the Vite origin, Vite forwards `/api` to the
 * NestJS process, and no cross-origin request is ever made. That keeps CORS out
 * of local development entirely and makes development match production, where a
 * reverse proxy serves both applications from one origin.
 *
 * `/api` is proxied rather than `/api/v1`, so `/api/docs` and `/api/docs-json`
 * (which live outside the versioned API — see backend Feature 038) are reachable
 * through the dev server too.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || DEFAULT_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },
  };
});
