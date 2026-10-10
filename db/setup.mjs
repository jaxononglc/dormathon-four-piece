// Creates the tables in db/schema.sql, the shop + owner, and (on an empty database)
// the demo data from src/data/mockData.js. Run with: npm run db:setup
// (reads DATABASE_URL from .env). To move data from the old tables, use db/migrate.mjs.
//
// Safe to re-run: tables use IF NOT EXISTS and seed rows use ON CONFLICT DO NOTHING,
// so existing rows (and anything edited since) are left alone.
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { baseQueries, demoQueries } from '../server/seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing — add it to .env (see .env.example).');
  process.exit(1);
}

// Neon's driver talks Postgres over a WebSocket on port 443, so it also works on
// networks that block the usual Postgres port 5432.
neonConfig.webSocketConstructor = globalThis.WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const TABLES = ['Shop', 'Users', 'Category', 'Supplier', 'Item', 'Inventory', 'Sales', 'SalesItem', 'Restocklog', 'StockLog', 'Chat', 'Message', 'DismissedAdvice'];

try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  for (const [text, params] of baseQueries()) await client.query(text, params);
  const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM Item');
  if (n === 0) {
    for (const [text, params] of demoQueries()) await client.query(text, params);
    console.log('Empty database — loaded the demo data.');
  }
  await client.query('COMMIT');

  const { rows } = await client.query(TABLES.map((t) => `SELECT '${t}' AS table, count(*)::int AS rows FROM ${t}`).join(' UNION ALL '));
  console.table(rows);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Setup failed, nothing was changed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
