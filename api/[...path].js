// Vercel serverless function: serves every /api/* request with the same code the Vite dev
// server uses (vite.config.js → server/api.js), so the app behaves the same online.
// DATABASE_URL and GEMINI_API_KEY come from the Vercel project's environment variables.
import { handleApi } from '../server/api.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/^\/api/, '') || '/';

  let body = {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : req.body ?? {};
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const out = await handleApi(req.method, path, url.searchParams, body);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(out.status).json(out.body);
}
