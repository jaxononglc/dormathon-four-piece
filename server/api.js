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

// "Reset demo data" is for local development; on Vercel it needs ALLOW_RESET=true.
const resetAllowed = () => !process.env.VERCEL || process.env.ALLOW_RESET === 'true';

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
  const [shop, products, categories, suppliers, sales, chats, messages, dismissed, logs, damaged] = await sql.transaction([
    sql.query(`SELECT Shop_Name AS name, Shop_Type AS type,
                 (SELECT User_Name FROM Users u WHERE u.Shop_ID = s.Shop_ID AND User_Role = 'owner' ORDER BY User_ID LIMIT 1) AS owner
               FROM Shop s WHERE Shop_ID = $1`, [SHOP_ID]),
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
    // Every sale (daily entries and any POS sales) with its units per item.
    sql.query(`
      SELECT s.Sales_ID AS id, s.Sales_Date::text AS date, ${ms('s.Sales_CreatedAt')} AS at,
             jsonb_object_agg(si.Item_ID::text, si.SalesItem_Quantity) AS lines
      FROM Sales s JOIN SalesItem si ON si.Sales_ID = s.Sales_ID
      WHERE s.Shop_ID = $1 GROUP BY s.Sales_ID ORDER BY s.Sales_CreatedAt, s.Sales_ID`, [SHOP_ID]),
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
    sql.query(`SELECT "DamageLog_Date"::text AS date, item_id, sum("DamageLog_Quantity")::int AS units
               FROM "DamageLog" WHERE shop_id = $1 GROUP BY 1, 2`, [SHOP_ID]),
  ], { readOnly: true });

  const damage = {};
  for (const r of damaged) (damage[r.date] ||= {})[String(r.item_id)] = r.units;

  const byChat = {};
  for (const m of messages) (byChat[m.chat_id] ||= []).push({ id: m.id, role: m.role, text: m.text, at: m.at });

  const todayId = `dashboard-${today}`;
  if (!shop[0]) throw new HttpError(503, `Shop ${SHOP_ID} is missing — run npm run db:setup`);
  return {
    shop: { name: shop[0].name, type: shop[0].type ?? '', owner: shop[0].owner ?? '' },
    products: products.map((r) => ({
      id: String(r.id), name: r.name, sku: r.sku, category: r.category ?? '', supplier: r.supplier ?? '',
      location: r.location, stock: Number(r.stock), min: Number(r.min), unit: r.unit,
      cost: Number(r.cost), price: num(r.price), expiry: r.expiry ?? '',
    })),
    categories: categories.map((r) => r.name),
    suppliers: suppliers.map((r) => r.name),
    salesRecords: sales.map((r) => ({ id: String(r.id), date: r.date, at: r.at, lines: r.lines })),
    // Normal chats plus past days' Dashboard chats (empty ones are skipped).
    chats: chats
      .filter((c) => c.kind === 'chat' || (c.kind === 'dashboard' && c.id !== todayId && byChat[c.id]))
      .map((c) => ({ id: c.id, kind: c.kind, day: c.day, title: c.title, createdAt: c.created_at, updatedAt: c.updated_at, messages: byChat[c.id] || [] })),
    dashboardChat: byChat[todayId] || [],
    dashboardDate: today,
    adviceChat: byChat.advice || [],
    dismissedRecs: dismissed.map((r) => r.id),
    damage,
    stockLog: logs.map((l) => ({ id: l.id, productId: String(l.item_id), at: l.at, kind: l.kind, delta: Number(l.delta), stockAfter: num(l.stock_after), note: l.note })),
    aiEnabled: Boolean(process.env.GEMINI_API_KEY),
    canReset: resetAllowed(),
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

// Only real item ids; quantities must be whole and positive.
const cleanLines = (lines) => JSON.stringify(Object.fromEntries(
  Object.entries(lines || {}).filter(([, u]) => Number(u) > 0).map(([id, u]) => [String(itemId(id)), Math.floor(Number(u))])
));
const saleId = (id) => {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `Bad sale id: ${id}`);
  return n;
};

// Create (or, with the same id, re-save) a day's sale and take its units out of stock.
// The id comes from the app (lib/api.js) so it can edit the sale before this call returns.
// One per day (sales_one_daily_entry): a day that already has one must be edited instead.
async function addSale({ id, date, at, lines }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'Bad date');
  const n = saleId(id);
  const sql = db();
  const [exists] = await sql.query('SELECT 1 FROM Sales WHERE Sales_ID = $1', [n]);
  if (exists) return editSale(n, lines);
  const [taken] = await sql.query(
    "SELECT 1 FROM Sales WHERE Shop_ID = $1 AND Sales_Date = $2 AND Sales_Source = 'daily_entry'", [SHOP_ID, date]);
  if (taken) throw new HttpError(409, `Sales for ${date} are already saved. Reload and use Edit to change them.`);
  const json = cleanLines(lines);
  await sql.transaction([
    sql.query(
      `INSERT INTO Sales (Sales_ID, Shop_ID, Sales_Date, Sales_Source, Sales_CreatedAt)
       VALUES ($1, $2, $3, 'daily_entry', to_timestamp($4 / 1000.0))`,
      [n, SHOP_ID, date, at || Date.now()]
    ),
    sql.query(
      `INSERT INTO SalesItem (Sales_ID, Item_ID, SalesItem_Quantity, SalesItem_UnitPrice)
       SELECT $1, i.Item_ID, n.value::int, COALESCE(i.Item_UnitPrice, 0)
       FROM jsonb_each_text($3::jsonb) n JOIN Item i ON i.Item_ID = n.key::bigint AND i.Shop_ID = $2`,
      [n, SHOP_ID, json]
    ),
    sql.query(
      `UPDATE Inventory inv SET Inventory_Stock = GREATEST(0, inv.Inventory_Stock - n.value::int), Inventory_UpdatedAt = now()
       FROM jsonb_each_text($2::jsonb) n WHERE inv.Shop_ID = $1 AND inv.Item_ID = n.key::bigint`,
      [SHOP_ID, json]
    ),
    sql.query(updateTotals, [SHOP_ID]),
  ]);
}

// Replace a day's damaged goods ("DamageLog", one row per item). Damaged units leave
// stock, so stock moves by the difference from what the day had before.
async function saveDamage(date, lines) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'Bad date');
  const json = cleanLines(lines);
  const sql = db();
  await sql.transaction([
    sql.query(
      `WITH new AS (SELECT key::bigint AS item_id, value::int AS units FROM jsonb_each_text($3::jsonb)),
            old AS (SELECT item_id::bigint, sum("DamageLog_Quantity")::int AS units FROM "DamageLog"
                    WHERE shop_id = $1 AND "DamageLog_Date" = $2::date GROUP BY 1),
            d AS (SELECT item_id, COALESCE(new.units, 0) - COALESCE(old.units, 0) AS delta FROM new FULL JOIN old USING (item_id))
       UPDATE Inventory inv SET Inventory_Stock = GREATEST(0, inv.Inventory_Stock - d.delta), Inventory_UpdatedAt = now()
       FROM d WHERE inv.Shop_ID = $1 AND inv.Item_ID = d.item_id AND d.delta <> 0`,
      [SHOP_ID, date, json]
    ),
    sql.query('DELETE FROM "DamageLog" WHERE shop_id = $1 AND "DamageLog_Date" = $2::date', [SHOP_ID, date]),
    sql.query(
      `INSERT INTO "DamageLog" (shop_id, item_id, "DamageLog_Quantity", "DamageLog_Reason", "DamageLog_Date")
       SELECT $1, i.Item_ID, n.value::int, 'Daily sales record', $2::date
       FROM jsonb_each_text($3::jsonb) n JOIN Item i ON i.Item_ID = n.key::bigint AND i.Shop_ID = $1`,
      [SHOP_ID, date, json]
    ),
  ]);
}

// Change a recorded sale: stock moves by the difference, so units taken off go back
// into stock. No lines left → the sale is deleted.
async function editSale(id, lines) {
  const n = saleId(id);
  const json = cleanLines(lines);
  const sql = db();
  await sql.transaction([
    sql.query(
      `WITH new AS (SELECT key::bigint AS item_id, value::int AS units FROM jsonb_each_text($3::jsonb)),
            old AS (SELECT si.Item_ID AS item_id, si.SalesItem_Quantity AS units FROM SalesItem si
                    JOIN Sales s ON s.Sales_ID = si.Sales_ID WHERE s.Sales_ID = $2 AND s.Shop_ID = $1),
            d AS (SELECT item_id, COALESCE(new.units, 0) - COALESCE(old.units, 0) AS delta FROM new FULL JOIN old USING (item_id))
       UPDATE Inventory inv SET Inventory_Stock = GREATEST(0, inv.Inventory_Stock - d.delta), Inventory_UpdatedAt = now()
       FROM d WHERE inv.Shop_ID = $1 AND inv.Item_ID = d.item_id AND d.delta <> 0`,
      [SHOP_ID, n, json]
    ),
    sql.query('DELETE FROM SalesItem WHERE Sales_ID = (SELECT Sales_ID FROM Sales WHERE Sales_ID = $1 AND Shop_ID = $2)', [n, SHOP_ID]),
    sql.query(
      `INSERT INTO SalesItem (Sales_ID, Item_ID, SalesItem_Quantity, SalesItem_UnitPrice)
       SELECT s.Sales_ID, i.Item_ID, n.value::int, COALESCE(i.Item_UnitPrice, 0)
       FROM Sales s, jsonb_each_text($3::jsonb) n JOIN Item i ON i.Item_ID = n.key::bigint AND i.Shop_ID = $2
       WHERE s.Sales_ID = $1 AND s.Shop_ID = $2`,
      [n, SHOP_ID, json]
    ),
    sql.query(updateTotals, [SHOP_ID]),
    sql.query(
      `DELETE FROM Sales s WHERE s.Sales_ID = $1 AND s.Shop_ID = $2
       AND NOT EXISTS (SELECT 1 FROM SalesItem si WHERE si.Sales_ID = s.Sales_ID)`,
      [n, SHOP_ID]
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

// ---- Sales forecast (Dashboard "Daily sales" chart) ----
// Gemini predicts revenue for the given future dates from the shop's daily revenue
// (last 8 weeks, one line per day, so the prompt stays small) and upcoming events.
const FORECAST_SCHEMA = {
  type: 'OBJECT',
  properties: {
    forecasts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          revenue: { type: 'NUMBER' },
          reason: { type: 'STRING', description: 'max 15 words, plain English' },
        },
        required: ['date', 'revenue', 'reason'],
      },
    },
  },
  required: ['forecasts'],
};
const forecastCache = new Map();
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-MY', { timeZone: 'UTC', weekday: 'short' });

async function forecastSales({ today, dates, events = [] }) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(today || '')) throw new HttpError(400, 'Bad today');
  const days = (dates || []).filter((d) => iso.test(d) && d > today).slice(0, 7);
  if (!days.length) return { forecasts: [] };

  const rows = await db().query(
    `SELECT s.Sales_Date::text AS date, sum(si.SalesItem_Quantity * si.SalesItem_UnitPrice)::float8 AS revenue
     FROM Sales s JOIN SalesItem si ON si.Sales_ID = s.Sales_ID
     WHERE s.Shop_ID = $1 AND s.Sales_Date BETWEEN $2::date - 55 AND $2::date
     GROUP BY 1 ORDER BY 1`,
    [SHOP_ID, today]
  );
  if (!rows.length) return { forecasts: [] }; // nothing to base a forecast on

  const history = rows.map((r) => `${r.date} ${weekday(r.date)} | ${Math.round(r.revenue)}`);
  const eventLines = (events || []).slice(0, 5).map((e) => `${String(e.title)}: ${String(e.date)}`);
  const key = JSON.stringify([today, days, history, eventLines]);
  if (forecastCache.has(key)) return forecastCache.get(key);

  const system = `You forecast daily revenue for a small Malaysian home bakery.
Today is ${today} (${weekday(today)}). Dates missing from the history had no sales recorded (not necessarily zero sales).
Use weekday patterns, the recent trend and upcoming events. Be realistic: stay close to similar past days unless there is a reason.
Return one forecast per requested date, revenue in RM rounded to the nearest 10, and a short reason.

Daily revenue history (date weekday | RM):
${history.join('\n')}
${eventLines.length ? `\nUpcoming events:\n${eventLines.join('\n')}` : ''}

Forecast these dates: ${days.map((d) => `${d} (${weekday(d)})`).join(', ')}`;

  const text = await callGemini({
    system,
    contents: [{ role: 'user', parts: [{ text: 'Return the forecast.' }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: FORECAST_SCHEMA },
  });
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'Gemini returned data the app could not read');
  }
  const byDate = new Map((out.forecasts || []).map((f) => [String(f.date), f]));
  const result = {
    forecasts: days
      .filter((d) => Number.isFinite(Number(byDate.get(d)?.revenue)))
      .map((d) => ({ date: d, revenue: Math.max(0, Math.round(Number(byDate.get(d).revenue))), reason: String(byDate.get(d).reason || '') })),
  };
  forecastCache.set(key, result);
  return result;
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

  ['POST', /^\/sales$/, async (_, __, { sale }) => { await addSale(sale || {}); return ok; }],
  ['PUT', /^\/sales\/(\d+)$/, async ([id], _, { lines }) => { await editSale(id, lines); return ok; }],
  ['PUT', /^\/damage\/(\d{4}-\d{2}-\d{2})$/, async ([date], _, { lines }) => { await saveDamage(date, lines); return ok; }],

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
  // Off on the live site (Vercel) so nobody can wipe the shop; set ALLOW_RESET=true there to turn it on.
  ['POST', /^\/reset$/, async () => {
    if (!resetAllowed()) throw new HttpError(403, 'Reset is turned off on the live site');
    const sql = db();
    await sql.transaction([
      sql.query('TRUNCATE "DamageLog", StockLog, Restocklog, Message, Chat, DismissedAdvice, SalesItem, Sales, Inventory, Item, Category, Supplier, Users, Shop RESTART IDENTITY'),
      ...[...baseQueries(), ...demoQueries()].map(([text, params]) => sql.query(text, params)),
    ]);
    return ok;
  }],

  ['POST', /^\/ai$/, (_, __, body) => askGemini(body || {})],
  ['POST', /^\/forecast$/, (_, __, body) => forecastSales(body || {})],
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
