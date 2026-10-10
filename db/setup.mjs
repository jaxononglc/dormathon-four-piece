// Creates the tables in db/schema.sql and fills them with the demo data from
// src/data/mockData.js (server/seed.js). Run with: npm run db:setup  (reads DATABASE_URL from .env)
//
// Safe to re-run: tables use IF NOT EXISTS and seed rows use ON CONFLICT DO NOTHING,
// so existing rows (and anything edited since) are left alone.
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { seedQueries } from '../server/seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing — add it to .env (see .env.example).');
  process.exit(1);
}

// Neon's driver talks Postgres over a WebSocket on port 443, so it also works on
// networks that block the usual Postgres port 5432.
neonConfig.webSocketConstructor = globalThis.WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));

  for (const [text, params] of seedQueries()) await client.query(text, params);

  await client.query('COMMIT');

  const { rows } = await client.query(`
    SELECT 'categories' AS table, count(*)::int AS rows FROM categories
    UNION ALL SELECT 'suppliers', count(*)::int FROM suppliers
    UNION ALL SELECT 'products', count(*)::int FROM products
    UNION ALL SELECT 'sales', count(*)::int FROM sales
    UNION ALL SELECT 'chats', count(*)::int FROM chats
    UNION ALL SELECT 'messages', count(*)::int FROM messages
    UNION ALL SELECT 'dismissed_advice', count(*)::int FROM dismissed_advice`);
  console.table(rows);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Setup failed, nothing was changed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
