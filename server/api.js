// Bijak AI API. Framework-free: handleApi(method, path, query, body) → { status, body },
// so the same code runs inside the Vite dev server (vite.config.js) and can later be
// wrapped as a serverless function wherever the app is deployed.
//
// Reads/writes the tables in db/schema.sql and returns the shapes the front end uses
// (src/data/mockData.js), so the app does not need to know the table layout.
// Needs DATABASE_URL (Neon) and, for the AI Advisor, GEMINI_API_KEY — both server-only.
import { neon } from '@neondatabase/serverless';
import { SHOP_ID, baseQueries, demoQueries, updateTotals } from './seed.js';

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

const num = (v) => (v == null ? null : Number(v));
const blank = (v) => (v === '' || v === undefined ? null : v);
const ms = (col) => `(extract(epoch FROM ${col}) * 1000)::float8`;
const itemId = (id) => {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `Bad product id: ${id}`);
  return n;
};

// Category / supplier names → ids, creating them when new (the app works with names).
const ensureCategory = (sql, name) => sql.query(
  'INSERT INTO Category (Shop_ID, Category_Name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [SHOP_ID, name]);
const ensureSupplier = (sql, name) => sql.query(
  'INSERT INTO Supplier (Shop_ID, Supplier_Name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [SHOP_ID, name]);
const categoryId = '(SELECT Category_ID FROM Category WHERE Shop_ID = $2 AND Category_Name = $%)';
const supplierId = '(SELECT Supplier_ID FROM Supplier WHERE Shop_ID = $2 AND Supplier_Name = $%)';

async function getState(today) {
  const sql = db();
  const [products, categories, suppliers, sales, chats, messages, dismissed, logs] = await sql.transaction([
    sql.query(`
      SELECT i.Item_ID AS id, i.Item_Name AS name, i.Item_SKU AS sku, c.Category_Name AS category,
             s.Supplier_Name AS supplier, inv.Inventory_Location AS location, inv.Inventory_Stock AS stock,
             inv.Inventory_Min AS min, i.Item_Unit AS unit, i.Item_CostPrice AS cost, i.Item_UnitPrice AS price,
             inv.Inventory_Expiry::text AS expiry
      FROM Item i
      JOIN Inventory inv ON inv.Item_ID = i.Item_ID AND inv.Shop_ID = i.Shop_ID
      LEFT JOIN Category c ON c.Category_ID = i.Category_ID
      LEFT JOIN Supplier s ON s.Supplier_ID = i.Supplier_ID
      WHERE i.Shop_ID = $1 AND i.Item_Active
      ORDER BY i.Item_CreatedAt, i.Item_ID`, [SHOP_ID]),
    sql.query('SELECT Category_Name AS name FROM Category WHERE Shop_ID = $1 ORDER BY Category_CreatedAt DESC, Category_ID DESC', [SHOP_ID]),
    sql.query('SELECT Supplier_Name AS name FROM Supplier WHERE Shop_ID = $1 ORDER BY Supplier_CreatedAt DESC, Supplier_ID DESC', [SHOP_ID]),
    // Units per item per day, all sources (daily entries and any POS sales).
    sql.query(`
      SELECT s.Sales_Date::text AS date, si.Item_ID AS item_id, sum(si.SalesItem_Quantity)::int AS units
      FROM Sales s JOIN SalesItem si ON si.Sales_ID = s.Sales_ID
      WHERE s.Shop_ID = $1 GROUP BY 1, 2`, [SHOP_ID]),
    sql.query(`SELECT Chat_ID AS id, Chat_Kind AS kind, Chat_Day::text AS day, Chat_Title AS title,
                 ${ms('Chat_CreatedAt')} AS created_at, ${ms('Chat_UpdatedAt')} AS updated_at
               FROM Chat WHERE Shop_ID = $1`, [SHOP_ID]),
    sql.query(`SELECT m.Message_ID AS id, m.Chat_ID AS chat_id, m.Message_Role AS role, m.Message_Text AS text, ${ms('m.Message_CreatedAt')} AS at
               FROM Message m JOIN Chat c ON c.Chat_ID = m.Chat_ID
               WHERE c.Shop_ID = $1 ORDER BY m.Message_CreatedAt, m.Message_ID`, [SHOP_ID]),
    sql.query('SELECT Advice_ID AS id FROM DismissedAdvice WHERE Shop_ID = $1', [SHOP_ID]),
    sql.query(`SELECT StockLog_ID AS id, Item_ID AS item_id, StockLog_Kind AS kind, StockLog_Delta AS delta,
                 StockLog_StockAfter AS stock_after, StockLog_Note AS note, ${ms('StockLog_CreatedAt')} AS at
               FROM StockLog WHERE Shop_ID = $1 ORDER BY StockLog_CreatedAt, StockLog_ID`, [SHOP_ID]),
  ], { readOnly: true });

  const salesMap = {};
  for (const r of sales) (salesMap[r.date] ||= {})[String(r.item_id)] = r.units;

  const byChat = {};
  for (const m of messages) (byChat[m.chat_id] ||= []).push({ id: m.id, role: m.role, text: m.text, at: m.at });

  const todayId = `dashboard-${today}`;
  return {
    products: products.map((r) => ({
      id: String(r.id), name: r.name, sku: r.sku, category: r.category ?? '', supplier: r.supplier ?? '',
      location: r.location, stock: Number(r.stock), min: Number(r.min), unit: r.unit,
      cost: Number(r.cost), price: num(r.price), expiry: r.expiry ?? '',
    })),
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
    dismissedRecs: dismissed.map((r) => r.id),
    stockLog: logs.map((l) => ({ id: l.id, productId: String(l.item_id), at: l.at, kind: l.kind, delta: Number(l.delta), stockAfter: num(l.stock_after), note: l.note })),
    aiEnabled: Boolean(process.env.GEMINI_API_KEY),
  };
}

async function addProduct(p) {
  const sql = db();
  const id = itemId(p.id);
  // Same check as the form (StockForm.jsx), in case another device added it meanwhile.
  const [dup] = await sql.query(
    `SELECT Item_Name AS name, lower(Item_SKU) = lower($3) AS same_sku FROM Item
     WHERE Shop_ID = $1 AND Item_Active
       AND (lower(regexp_replace(trim(Item_Name), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($2), '\\s+', ' ', 'g'))
            OR lower(Item_SKU) = lower($3))
     LIMIT 1`,
    [SHOP_ID, String(p.name || ''), String(p.sku || '')]
  );
  if (dup) throw new HttpError(409, dup.same_sku ? `SKU ${p.sku} is already used by ${dup.name}` : `${dup.name} is already in your inventory`);
  await sql.transaction([
    ...(p.category ? [ensureCategory(sql, p.category)] : []),
    ...(p.supplier ? [ensureSupplier(sql, p.supplier)] : []),
    sql.query(
      `INSERT INTO Item (Item_ID, Shop_ID, Category_ID, Supplier_ID, Item_Name, Item_SKU, Item_Unit, Item_CostPrice, Item_UnitPrice)
       VALUES ($1, $2, ${categoryId.replace('%', '3')}, ${supplierId.replace('%', '4')}, $5, $6, $7, $8, $9)`,
      [id, SHOP_ID, blank(p.category), blank(p.supplier), p.name, p.sku, p.unit, p.cost || 0, p.price ?? null]
    ),
    sql.query(
      `INSERT INTO Inventory (Shop_ID, Item_ID, Inventory_Stock, Inventory_Min, Inventory_Location, Inventory_Expiry)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [SHOP_ID, id, p.stock || 0, p.min || 0, p.location || '', blank(p.expiry)]
    ),
  ]);
}

// App field → [table, column]. category/supplier are names resolved to ids.
const ITEM_FIELDS = { name: 'Item_Name', sku: 'Item_SKU', unit: 'Item_Unit', cost: 'Item_CostPrice', price: 'Item_UnitPrice' };
const INV_FIELDS = { stock: 'Inventory_Stock', min: 'Inventory_Min', location: 'Inventory_Location', expiry: 'Inventory_Expiry' };

async function updateProduct(id, patch = {}) {
  const sql = db();
  const n = itemId(id);
  const q = [];
  const itemSets = [];
  const itemVals = [n, SHOP_ID];
  for (const [k, col] of Object.entries(ITEM_FIELDS)) {
    if (k in patch) { itemVals.push(k === 'price' ? patch[k] ?? null : patch[k]); itemSets.push(`${col} = $${itemVals.length}`); }
  }
  if ('category' in patch) {
    if (patch.category) q.push(ensureCategory(sql, patch.category));
    itemVals.push(blank(patch.category)); itemSets.push(`Category_ID = ${categoryId.replace('%', itemVals.length)}`);
  }
  if ('supplier' in patch) {
    if (patch.supplier) q.push(ensureSupplier(sql, patch.supplier));
    itemVals.push(blank(patch.supplier)); itemSets.push(`Supplier_ID = ${supplierId.replace('%', itemVals.length)}`);
  }
  if (itemSets.length) {
    q.push(sql.query(`UPDATE Item SET ${itemSets.join(', ')}, Item_UpdatedAt = now() WHERE Item_ID = $1 AND Shop_ID = $2`, itemVals));
  }
  const invSets = [];
  const invVals = [n, SHOP_ID];
  for (const [k, col] of Object.entries(INV_FIELDS)) {
    if (k in patch) { invVals.push(k === 'expiry' ? blank(patch[k]) : k === 'location' ? patch[k] || '' : patch[k]); invSets.push(`${col} = $${invVals.length}`); }
  }
  if (invSets.length) {
    q.push(sql.query(`UPDATE Inventory SET ${invSets.join(', ')}, Inventory_UpdatedAt = now() WHERE Item_ID = $1 AND Shop_ID = $2`, invVals));
  }
  if (q.length) await sql.transaction(q);
}

async function saveSales(date, lines) {
  const sql = db();
  // Only real item ids; quantities must be whole and positive.
  const clean = Object.fromEntries(
    Object.entries(lines || {}).filter(([, u]) => Number(u) > 0).map(([id, u]) => [String(itemId(id)), Math.floor(Number(u))])
  );
  const json = JSON.stringify(clean);
  // The day's daily_entry sale: move stock by the difference from what was saved
  // before (so editing a day never double-counts), then replace its lines.
  await sql.transaction([
    sql.query(
      `INSERT INTO Sales (Shop_ID, Sales_Date, Sales_Source) VALUES ($1, $2, 'daily_entry')
       ON CONFLICT (Shop_ID, Sales_Date) WHERE Sales_Source = 'daily_entry' DO NOTHING`,
      [SHOP_ID, date]
    ),
    sql.query(
      `WITH sale AS (SELECT Sales_ID FROM Sales WHERE Shop_ID = $1 AND Sales_Date = $2 AND Sales_Source = 'daily_entry'),
            new AS (SELECT key::bigint AS item_id, value::int AS units FROM jsonb_each_text($3::jsonb)),
            old AS (SELECT Item_ID AS item_id, SalesItem_Quantity AS units FROM SalesItem WHERE Sales_ID = (SELECT Sales_ID FROM sale)),
            d AS (SELECT item_id, COALESCE(new.units, 0) - COALESCE(old.units, 0) AS delta FROM new FULL JOIN old USING (item_id))
       UPDATE Inventory inv SET Inventory_Stock = GREATEST(0, inv.Inventory_Stock - d.delta), Inventory_UpdatedAt = now()
       FROM d WHERE inv.Shop_ID = $1 AND inv.Item_ID = d.item_id AND d.delta <> 0`,
      [SHOP_ID, date, json]
    ),
    sql.query(
      `DELETE FROM SalesItem WHERE Sales_ID = (SELECT Sales_ID FROM Sales WHERE Shop_ID = $1 AND Sales_Date = $2 AND Sales_Source = 'daily_entry')`,
      [SHOP_ID, date]
    ),
    sql.query(
      `INSERT INTO SalesItem (Sales_ID, Item_ID, SalesItem_Quantity, SalesItem_UnitPrice)
       SELECT s.Sales_ID, i.Item_ID, n.value::int, COALESCE(i.Item_UnitPrice, 0)
       FROM jsonb_each_text($3::jsonb) n
       JOIN Item i ON i.Item_ID = n.key::bigint AND i.Shop_ID = $1
       JOIN Sales s ON s.Shop_ID = $1 AND s.Sales_Date = $2 AND s.Sales_Source = 'daily_entry'`,
      [SHOP_ID, date, json]
    ),
    sql.query(updateTotals, [SHOP_ID]),
    // A day with nothing left on it disappears, like in the app.
    sql.query(
      `DELETE FROM Sales s WHERE s.Shop_ID = $1 AND s.Sales_Date = $2 AND s.Sales_Source = 'daily_entry'
       AND NOT EXISTS (SELECT 1 FROM SalesItem si WHERE si.Sales_ID = s.Sales_ID)`,
      [SHOP_ID, date]
    ),
  ]);
}

async function callGemini({ system, contents, generationConfig }) {
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
      generationConfig,
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
  return text;
}

async function askGemini({ system, contents }) {
  const text = await callGemini({ system, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } });
  return { text };
}

// ---- Scan a photo of a handwritten sales record ----
// The photo is resized in the browser (src/lib/scan.js), so it stays well under this.
// HEIC that the browser cannot decode is sent as is (Gemini reads HEIC/HEIF itself).
const MAX_IMAGE_CHARS = 4_000_000; // base64 ≈ 3 MB
const SCAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    date: { type: 'STRING', nullable: true, description: 'Date written on the record as yyyy-mm-dd, or null if none' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          productId: { type: 'STRING', description: 'id from the product list' },
          rawText: { type: 'STRING', description: 'the line exactly as written' },
          units: { type: 'INTEGER' },
          confidence: { type: 'NUMBER', description: '0–1: how sure you are of both the product and the number' },
        },
        required: ['productId', 'rawText', 'units', 'confidence'],
      },
    },
    unmatched: { type: 'ARRAY', items: { type: 'STRING' }, description: 'lines that look like sales but match no product, as written' },
  },
  required: ['items', 'unmatched'],
};

async function scanSales({ image, products, today }) {
  if (!image?.data || !/^image\/(jpeg|png|webp|heic|heif)$/.test(image.mimeType || '')) throw new HttpError(400, 'Send a JPEG, PNG, WebP or HEIC image');
  if (image.data.length > MAX_IMAGE_CHARS) throw new HttpError(413, 'Image is too large');
  const list = (products || []).map((p) => ({ id: String(p.id), name: String(p.name), sku: String(p.sku || ''), unit: String(p.unit || '') }));
  if (!list.length) throw new HttpError(400, 'No products to match against');

  const system = `You read photos of handwritten daily sales records for a small Malaysian shop and turn them into data.
The writing may be in English, Bahasa Melayu or Chinese, with abbreviations, short forms and messy handwriting.
Today is ${today || 'unknown'}.

Rules:
- Only use productId values from this list. Match by meaning, not spelling (e.g. "choc chip ckie" → Chocolate Chip Cookie, "kek" → cake).
- units is the number of units sold, as a whole number. If a line shows a tally (e.g. 正 or ||||), count it.
- If the same product appears on several lines, return one item with the total.
- If you cannot tell which product a line is, put it in unmatched instead of guessing.
- Lower confidence when the number or the product is hard to read.
- Ignore prices, totals and crossed-out lines. If the page is not a sales record, return empty lists.

Products (id | name | sku | unit):
${list.map((p) => `${p.id} | ${p.name} | ${p.sku} | ${p.unit}`).join('\n')}`;

  const text = await callGemini({
    system,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: 'Read this sales record.' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: SCAN_SCHEMA },
  });
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'Gemini returned data the app could not read');
  }

  // Never trust the ids or numbers blindly: keep known products and whole positive units.
  const known = new Set(list.map((p) => p.id));
  const items = new Map();
  const unmatched = (out.unmatched || []).map(String).filter(Boolean);
  for (const it of out.items || []) {
    const id = String(it.productId);
    const units = Math.floor(Number(it.units));
    if (!known.has(id)) { if (it.rawText) unmatched.push(String(it.rawText)); continue; }
    if (!(units > 0)) continue;
    const confidence = Math.max(0, Math.min(1, Number(it.confidence) || 0));
    const prev = items.get(id);
    items.set(id, prev
      ? { ...prev, units: prev.units + units, rawText: `${prev.rawText}; ${it.rawText}`, confidence: Math.min(prev.confidence, confidence) }
      : { productId: id, rawText: String(it.rawText || ''), units, confidence });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(out.date || '') ? out.date : null;
  return { date, items: [...items.values()], unmatched };
}

// ---- Router ----
const ok = { ok: true };
const routes = [
  ['GET', /^\/state$/, (_, q) => getState(q.get('today') || new Date().toISOString().slice(0, 10))],

  ['POST', /^\/products$/, async (_, __, { product }) => { await addProduct(product); return ok; }],
  ['PATCH', /^\/products\/([^/]+)$/, async ([id], _, { patch }) => { await updateProduct(id, patch); return ok; }],
  // Deactivate, never delete: past sales and the log keep pointing at the item.
  ['DELETE', /^\/products\/([^/]+)$/, async ([id]) => {
    await db().query('UPDATE Item SET Item_Active = false, Item_UpdatedAt = now() WHERE Item_ID = $1 AND Shop_ID = $2', [itemId(id), SHOP_ID]);
    return ok;
  }],

  ['POST', /^\/options$/, async (_, __, { list, name }) => {
    const n = String(name || '').trim();
    if (!['categories', 'suppliers'].includes(list)) throw new HttpError(400, 'list must be categories or suppliers');
    if (n) await (list === 'categories' ? ensureCategory : ensureSupplier)(db(), n);
    return ok;
  }],

  ['PUT', /^\/sales\/(\d{4}-\d{2}-\d{2})$/, async ([date], _, { lines }) => { await saveSales(date, lines); return ok; }],

  // Upsert, so re-sending an entry never duplicates it.
  ['POST', /^\/stock-logs$/, async (_, __, { logs }) => {
    const sql = db();
    await sql.transaction((logs || []).map((l) => sql.query(
      `INSERT INTO StockLog (StockLog_ID, Shop_ID, Item_ID, StockLog_Kind, StockLog_Delta, StockLog_StockAfter, StockLog_Note, StockLog_CreatedAt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
       ON CONFLICT (StockLog_ID) DO UPDATE SET StockLog_Delta = EXCLUDED.StockLog_Delta,
         StockLog_StockAfter = EXCLUDED.StockLog_StockAfter, StockLog_Note = EXCLUDED.StockLog_Note,
         StockLog_CreatedAt = EXCLUDED.StockLog_CreatedAt`,
      [l.id, SHOP_ID, itemId(l.productId), l.kind, l.delta || 0, l.stockAfter ?? null, l.note || '', l.at]
    )));
    return ok;
  }],

  ['POST', /^\/dismissed$/, async (_, __, { id }) => {
    await db().query('INSERT INTO DismissedAdvice (Shop_ID, Advice_ID) VALUES ($1, $2) ON CONFLICT DO NOTHING', [SHOP_ID, id]);
    return ok;
  }],
  ['DELETE', /^\/dismissed$/, async () => {
    await db().query('DELETE FROM DismissedAdvice WHERE Shop_ID = $1', [SHOP_ID]);
    return ok;
  }],

  ['POST', /^\/chats$/, async (_, __, { chat }) => {
    await db().query(
      `INSERT INTO Chat (Chat_ID, Shop_ID, Chat_Kind, Chat_Day, Chat_Title, Chat_CreatedAt, Chat_UpdatedAt)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), to_timestamp($6 / 1000.0)) ON CONFLICT (Chat_ID) DO NOTHING`,
      [chat.id, SHOP_ID, chat.kind || 'chat', chat.day || null, chat.title, chat.createdAt || Date.now()]
    );
    return ok;
  }],
  ['DELETE', /^\/chats\/([^/]+)$/, async ([id]) => {
    await db().query("DELETE FROM Chat WHERE Chat_ID = $1 AND Shop_ID = $2 AND Chat_Kind <> 'advice'", [id, SHOP_ID]);
    return ok;
  }],
  // `chat` (optional) creates the chat first — used for each day's Dashboard chat.
  ['POST', /^\/chats\/([^/]+)\/messages$/, async ([id], _, { message: m, chat }) => {
    const sql = db();
    await sql.transaction([
      ...(chat
        ? [sql.query(
            `INSERT INTO Chat (Chat_ID, Shop_ID, Chat_Kind, Chat_Day, Chat_Title, Chat_CreatedAt)
             VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0)) ON CONFLICT (Chat_ID) DO NOTHING`,
            [id, SHOP_ID, chat.kind || 'chat', chat.day || null, chat.title || 'Chat', m.at]
          )]
        : []),
      sql.query(
        `INSERT INTO Message (Message_ID, Chat_ID, Message_Role, Message_Text, Message_CreatedAt)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0)) ON CONFLICT (Message_ID) DO NOTHING`,
        [m.id, id, m.role, m.text, m.at]
      ),
      sql.query('UPDATE Chat SET Chat_UpdatedAt = to_timestamp($2 / 1000.0) WHERE Chat_ID = $1', [id, m.at]),
    ]);
    return ok;
  }],
  ['DELETE', /^\/chats\/([^/]+)\/messages$/, async ([id]) => {
    await db().query('DELETE FROM Message WHERE Chat_ID = $1 AND Chat_ID IN (SELECT Chat_ID FROM Chat WHERE Shop_ID = $2)', [id, SHOP_ID]);
    return ok;
  }],

  // Settings → "Reset demo data": wipe everything and load the demo rows again.
  ['POST', /^\/reset$/, async () => {
    const sql = db();
    await sql.transaction([
      sql.query('TRUNCATE StockLog, Restocklog, Message, Chat, DismissedAdvice, SalesItem, Sales, Inventory, Item, Category, Supplier, Users, Shop RESTART IDENTITY'),
      ...[...baseQueries(), ...demoQueries()].map(([text, params]) => sql.query(text, params)),
    ]);
    return ok;
  }],

  ['POST', /^\/ai$/, (_, __, body) => askGemini(body || {})],
  ['POST', /^\/scan$/, (_, __, body) => scanSales(body || {})],
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
