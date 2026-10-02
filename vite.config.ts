import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Paged.js paginates the print preview inside an iframe. It isn't an ES module
// export, so serve its polyfill build as a static file in dev and emit it on build.
const PAGED_PATH = 'vendor/paged.polyfill.js';
function pagedPolyfill(): Plugin {
  const source = fileURLToPath(new URL('./node_modules/pagedjs/dist/paged.polyfill.min.js', import.meta.url));
  return {
    name: 'pagedjs-polyfill',
    configureServer(server) {
      server.middlewares.use(`/${PAGED_PATH}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(fs.readFileSync(source));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: PAGED_PATH, source: fs.readFileSync(source) });
    },
  };
}

export default defineConfig({
  plugins: [react(), pagedPolyfill()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { chunkSizeWarningLimit: 2500 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
