// Bijak AI API. Framework-free: handleApi(method, path, query, body) → { status, body },
// so the same code runs inside the Vite dev server (vite.config.js) and can later be
// wrapped as a serverless function wherever the app is deployed.
//
// Needs DATABASE_URL (Neon) and, for the AI Advisor, GEMINI_API_KEY — both server-only.
import { neon } from '@neondatabase/serverless';
import { seedQueries } from './seed.js';

let client;
const db = () => {
  if (!process.env.DATABASE_URL) throw new HttpError(503, 'DATABASE_URL is not set');
  return (client ||= neon(process.env.DATABASE_URL));
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- Row ↔ app shapes (match src/data/mockData.js) ----
const PRODUCT_COLS = `id, name, sku, category, supplier, location, stock, min_stock, unit, cost, price, expiry::text AS expiry`;
const toProduct = (r) => ({
  id: r.id,
  name: r.name,
  sku: r.sku ?? '',
  category: r.category ?? '',
  supplier: r.supplier ?? '',
  location: r.location,
  stock: Number(r.stock),
  min: Number(r.min_stock),
  unit: r.unit,
  cost: Number(r.cost),
  price: r.price == null ? null : Number(r.price),
  expiry: r.expiry ?? '',
});
// App field → column. Empty strings become NULL so foreign keys and dates accept them.
const FIELDS = { name: 'name', sku: 'sku', category: 'category', supplier: 'supplier', location: 'location', stock: 'stock', min: 'min_stock', unit: 'unit', cost: 'cost', price: 'price', expiry: 'expiry' };
const dbValue = (v) => (v === '' || v === undefined ? null : v);

// Category / supplier must exist before a product points at it.
const ensureOptions = (sql, p) => [
  ...(p.category ? [sql.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [p.category])] : []),
  ...(p.supplier ? [sql.query('INSERT INTO suppliers (name) VALUES ($1) ON CONFLICT DO NOTHING', [p.supplier])] : []),
];

async function getState(today) {
  const sql = db();
  const [products, categories, suppliers, sales, chats, messages, dismissed] = await sql.transaction([
    sql.query(`SELECT ${PRODUCT_COLS} FROM products ORDER BY created_at, length(id), id`),
    sql.query('SELECT name FROM categories ORDER BY created_at DESC, name'),
    sql.query('SELECT name FROM suppliers ORDER BY created_at DESC, name'),
    sql.query('SELECT sale_date::text AS date, product_id, units FROM sales'),
    sql.query(`SELECT id, kind, day::text AS day, title,
                 (extract(epoch FROM created_at) * 1000)::float8 AS created_at,
                 (extract(epoch FROM updated_at) * 1000)::float8 AS updated_at
               FROM chats`),
    sql.query(`SELECT id, chat_id, role, text, (extract(epoch FROM created_at) * 1000)::float8 AS at
               FROM messages ORDER BY created_at, id`),
    sql.query('SELECT advice_id FROM dismissed_advice'),
  ], { readOnly: true });

  const salesMap = {};
  for (const r of sales) (salesMap[r.date] ||= {})[r.product_id] = r.units;

  const byChat = {};
  for (const m of messages) (byChat[m.chat_id] ||= []).push({ id: m.id, role: m.role, text: m.text, at: m.at });

  const todayId = `dashboard-${today}`;
  return {
    products: products.map(toProduct),
    categories: categories.map((r) => r.name),
    suppliers: suppliers.map((r) => r.name),
    sales: salesMap,
    // Normal chats plus past days' Dashboard chats (empty ones are skipped).
    chats: chats
      .filter((c) => c.kind === 'chat' || (c.kind === 'dashboard' && c.id !== todayId && byChat[c.id]))
      .map((c) => ({ id: c.id, kind: c.kind, day: c.day, title: c.title, createdAt: c.created_at, updatedAt: c.updated_at, messages: byChat[c.id] || [] })),
    dashboardChat: byChat[todayId] || [],
    dashboardDate: today,
    adviceChat: byChat.advice || [],
    dismissedRecs: dismissed.map((r) => r.advice_id),
    aiEnabled: Boolean(process.env.GEMINI_API_KEY),
  };
}

async function saveSales(date, lines) {
  const sql = db();
  const json = JSON.stringify(lines || {});
  // Move stock by the difference from what was saved before, so editing a day
  // never double-counts (same rule as the 'saveSales' reducer).
  await sql.transaction([
    sql.query(
      `WITH new AS (SELECT key AS product_id, value::int AS units FROM jsonb_each_text($2::jsonb) WHERE value::int > 0),
            old AS (SELECT product_id, units FROM sales WHERE sale_date = $1),
            d AS (SELECT product_id, coalesce(new.units, 0) - coalesce(old.units, 0) AS delta FROM new FULL JOIN old USING (product_id))
       UPDATE products p SET stock = GREATEST(0, p.stock - d.delta), updated_at = now()
       FROM d WHERE p.id = d.product_id AND d.delta <> 0`,
      [date, json]
    ),
    sql.query('DELETE FROM sales WHERE sale_date = $1', [date]),
    sql.query(
      `INSERT INTO sales (sale_date, product_id, units)
       SELECT $1, key, value::int FROM jsonb_each_text($2::jsonb) WHERE value::int > 0`,
      [date, json]
    ),
  ]);
}

async function askGemini({ system, contents }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  // Gemini can stall; give up after 45 s so the app falls back to the offline answer.
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: String(system || '') }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch((err) => {
    throw new HttpError(504, err.name === 'TimeoutError' ? 'Gemini took too long to answer' : err.message);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, data.error?.message || `Gemini error ${res.status}`);
  const text = (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) throw new HttpError(502, 'Gemini returned an empty answer');
  return { text };
}

// ---- Router ----
const routes = [
  ['GET', /^\/state$/, (_, q) => getState(q.get('today') || new Date().toISOString().slice(0, 10))],

  ['POST', /^\/products$/, async (_, __, { product: p }) => {
    const sql = db();
    await sql.transaction([
      ...ensureOptions(sql, p),
      sql.query(
        `INSERT INTO products (id, name, sku, category, supplier, location, stock, min_stock, unit, cost, price, expiry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [p.id, p.name, dbValue(p.sku), dbValue(p.category), dbValue(p.supplier), p.location || '', p.stock || 0, p.min || 0, p.unit, p.cost || 0, p.price ?? null, dbValue(p.expiry)]
      ),
    ]);
    return { ok: true };
  }],
  ['PATCH', /^\/products\/([^/]+)$/, async ([id], _, { patch }) => {
    const sql = db();
    const keys = Object.keys(patch || {}).filter((k) => FIELDS[k]);
    if (!keys.length) return { ok: true };
    const sets = keys.map((k, i) => `${FIELDS[k]} = $${i + 2}`).join(', ');
    await sql.transaction([
      ...ensureOptions(sql, patch),
      sql.query(`UPDATE products SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => (k === 'price' ? patch[k] ?? null : dbValue(patch[k])))]),
    ]);
    return { ok: true };
  }],
  ['DELETE', /^\/products\/([^/]+)$/, async ([id]) => {
    await db().query('DELETE FROM products WHERE id = $1', [id]);
    return { ok: true };
  }],
  ['POST', /^\/products\/([^/]+)\/adjust$/, async ([id], _, { delta }) => {
    await db().query('UPDATE products SET stock = GREATEST(0, stock + $2), updated_at = now() WHERE id = $1', [id, Number(delta) || 0]);
    return { ok: true };
  }],

  ['POST', /^\/options$/, async (_, __, { list, name }) => {
    if (!['categories', 'suppliers'].includes(list)) throw new HttpError(400, 'list must be categories or suppliers');
    const n = String(name || '').trim();
    if (n) await db().query(`INSERT INTO ${list} (name) VALUES ($1) ON CONFLICT DO NOTHING`, [n]);
    return { ok: true };
  }],

  ['PUT', /^\/sales\/(\d{4}-\d{2}-\d{2})$/, async ([date], _, { lines }) => {
    await saveSales(date, lines);
    return { ok: true };
  }],

  ['POST', /^\/dismissed$/, async (_, __, { id }) => {
    await db().query('INSERT INTO dismissed_advice (advice_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
    return { ok: true };
  }],
  ['DELETE', /^\/dismissed$/, async () => {
    await db().query('DELETE FROM dismissed_advice');
    return { ok: true };
  }],

  ['POST', /^\/chats$/, async (_, __, { chat }) => {
    await db().query(
      `INSERT INTO chats (id, kind, day, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($5 / 1000.0)) ON CONFLICT (id) DO NOTHING`,
      [chat.id, chat.kind || 'chat', chat.day || null, chat.title, chat.createdAt || Date.now()]
    );
    return { ok: true };
  }],
  ['DELETE', /^\/chats\/([^/]+)$/, async ([id]) => {
    await db().query("DELETE FROM chats WHERE id = $1 AND kind <> 'advice'", [id]);
    return { ok: true };
  }],
  // `chat` (optional) creates the chat first — used for each day's Dashboard chat.
  ['POST', /^\/chats\/([^/]+)\/messages$/, async ([id], _, { message: m, chat }) => {
    const sql = db();
    await sql.transaction([
      ...(chat
        ? [sql.query(
            `INSERT INTO chats (id, kind, day, title, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
             ON CONFLICT (id) DO NOTHING`,
            [id, chat.kind || 'chat', chat.day || null, chat.title || 'Chat', m.at]
          )]
        : []),
      sql.query(
        `INSERT INTO messages (id, chat_id, role, text, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
         ON CONFLICT (id) DO NOTHING`,
        [m.id, id, m.role, m.text, m.at]
      ),
      sql.query('UPDATE chats SET updated_at = to_timestamp($2 / 1000.0) WHERE id = $1', [id, m.at]),
    ]);
    return { ok: true };
  }],
  ['DELETE', /^\/chats\/([^/]+)\/messages$/, async ([id]) => {
    await db().query('DELETE FROM messages WHERE chat_id = $1', [id]);
    return { ok: true };
  }],

  // Settings → "Reset demo data": wipe everything and load the demo rows again.
  ['POST', /^\/reset$/, async () => {
    const sql = db();
    await sql.transaction([
      sql.query('TRUNCATE messages, chats, sales, products, categories, suppliers, dismissed_advice'),
      ...seedQueries().map(([text, params]) => sql.query(text, params)),
    ]);
    return { ok: true };
  }],

  ['POST', /^\/ai$/, (_, __, body) => askGemini(body || {})],
];

export async function handleApi(method, path, query = new URLSearchParams(), body = {}) {
  for (const [m, re, fn] of routes) {
    const match = m === method && path.match(re);
    if (match) {
      try {
        return { status: 200, body: await fn(match.slice(1).map(decodeURIComponent), query, body || {}) };
      } catch (err) {
        if (!(err instanceof HttpError)) console.error(`[api] ${method} ${path}`, err);
        return { status: err.status || 500, body: { error: err.message } };
      }
    }
  }
  return { status: 404, body: { error: `No route for ${method} ${path}` } };
}
