import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Serves /api/* from server/api.js during `npm run dev`, so no separate backend
// process is needed. Server-only secrets (DATABASE_URL, GEMINI_API_KEY) are read
// from .env here and never reach the browser bundle (only VITE_* vars do).
function api() {
  return {
    name: 'bijak-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        let body = {};
        if (req.method !== 'GET') {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          try {
            body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
          }
        }
        // Loaded per request so edits to server/ apply without restarting Vite.
        const { handleApi } = await server.ssrLoadModule('/server/api.js');
        const out = await handleApi(req.method, url.pathname, url.searchParams, body);
        res.statusCode = out.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), api()],
});
