// One-off move to the merged schema (db/schema.sql). Run with: npm run db:migrate
//
// In one transaction (any error → nothing changes):
//   1. Stops if the team's earlier "Category"/"Item"/… tables have rows (they should be empty).
//   2. Renames the app's old tables (products, sales, chats, …) to legacy_* — kept as a backup.
//   3. Drops the team's earlier empty tables (replaced by the new ones).
//   4. Creates the new tables and copies the data across (product ids 'p1' → Item_ID 1).
// After checking the app, remove the backup with: npm run db:migrate -- --drop-legacy
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { SHOP_ID, baseQueries, fixSequences, updateTotals } from '../server/seed.js';
import { CATEGORIES, STOCK_LOG } from '../src/data/mockData.js';

const OLD_APP = ['products', 'categories', 'suppliers', 'sales', 'chats', 'messages', 'dismissed_advice', 'stock_logs'];
const OLD_TEAM = ['Category', 'Inventory', 'Item', 'Restocklog', 'Sales', 'SalesItem', 'Shop', 'Supplier', 'User']; // quoted names

// `db` is any client with query(text, params) → { rows } (pg / Neon Pool client, PGlite).
// Runs inside the caller's transaction; throws on any problem.
export async function migrate(db, { dropLegacy = false } = {}) {
  const exists = async (name) => (await db.query('SELECT to_regclass($1) IS NOT NULL AS ok', [name])).rows[0].ok;
  const count = async (name) => (await db.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n;

  if (dropLegacy) {
    for (const t of OLD_APP) await db.query(`DROP TABLE IF EXISTS legacy_${t} CASCADE`);
    return 'Dropped the legacy_* backup tables.';
  }
  // Unquoted Item is `item`; the team's earlier table is "Item" (capital, quoted).
  if (await exists('item')) throw new Error('Already migrated (table item exists).');

  // 1. The team's earlier tables must be empty.
  for (const t of OLD_TEAM) {
    if (await exists(`"${t}"`) && (await count(`"${t}"`)) > 0) throw new Error(`"${t}" has rows — move them by hand first.`);
  }

  // 2. Old app tables → legacy_*, indexes/constraints too (their names are schema-wide,
  //    e.g. sales_pkey would clash with the new Sales table).
  const before = {};
  for (const t of OLD_APP) {
    if (!(await exists(t))) continue;
    before[t] = await count(t);
    await db.query(`ALTER TABLE ${t} RENAME TO legacy_${t}`);
  }
  await db.query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
             AND tablename LIKE 'legacy\\_%' AND indexname NOT LIKE 'legacy\\_%' LOOP
      EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, 'legacy_' || r.indexname);
    END LOOP; END $$`);

  // 3. The team's earlier (empty) tables.
  for (const t of OLD_TEAM) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);

  // 4. New tables + shop/owner, then copy.
  await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  for (const [text, params] of baseQueries()) await db.query(text, params);

  if (before.products !== undefined) {
    const bad = (await db.query("SELECT id FROM legacy_products WHERE id !~ '^p?[0-9]+$'")).rows;
    if (bad.length) throw new Error(`Product ids that are not numbers: ${bad.map((r) => r.id).join(', ')}`);
    const idOf = "regexp_replace(id, '^p', '')::bigint";

    await db.query(
      `INSERT INTO Category (Shop_ID, Category_Name)
       SELECT $1::bigint, name FROM (SELECT unnest($2::text[]) AS name UNION SELECT DISTINCT category FROM legacy_products WHERE category <> '') c
       ON CONFLICT DO NOTHING`, [SHOP_ID, CATEGORIES]);
    await db.query(
      `INSERT INTO Supplier (Shop_ID, Supplier_Name)
       SELECT $1::bigint, name FROM (${before.suppliers !== undefined ? 'SELECT name FROM legacy_suppliers UNION ' : ''}SELECT DISTINCT supplier FROM legacy_products WHERE supplier <> '') s(name)
       ON CONFLICT DO NOTHING`, [SHOP_ID]);
    await db.query(
      `INSERT INTO Item (Item_ID, Shop_ID, Category_ID, Supplier_ID, Item_Name, Item_SKU, Item_Unit, Item_CostPrice, Item_UnitPrice, Item_CreatedAt, Item_UpdatedAt)
       SELECT ${idOf}, $1::bigint, c.Category_ID, s.Supplier_ID, p.name, COALESCE(p.sku, 'SKU-' || ${idOf}), p.unit, p.cost, p.price, p.created_at, p.updated_at
       FROM legacy_products p
       LEFT JOIN Category c ON c.Shop_ID = $1 AND c.Category_Name = p.category
       LEFT JOIN Supplier s ON s.Shop_ID = $1 AND s.Supplier_Name = p.supplier`, [SHOP_ID]);
    await db.query(
      `INSERT INTO Inventory (Shop_ID, Item_ID, Inventory_Stock, Inventory_Min, Inventory_Location, Inventory_Expiry)
       SELECT $1::bigint, ${idOf}, stock, min_stock, location, expiry FROM legacy_products`, [SHOP_ID]);

    if (before.sales !== undefined) {
      await db.query(
        `INSERT INTO Sales (Shop_ID, Sales_Date, Sales_Source) SELECT DISTINCT $1::bigint, sale_date, 'daily_entry' FROM legacy_sales`, [SHOP_ID]);
      await db.query(
        `INSERT INTO SalesItem (Sales_ID, Item_ID, SalesItem_Quantity, SalesItem_UnitPrice)
         SELECT s.Sales_ID, i.Item_ID, ls.units, COALESCE(i.Item_UnitPrice, 0)
         FROM legacy_sales ls
         JOIN Item i ON i.Item_ID = regexp_replace(ls.product_id, '^p', '')::bigint
         JOIN Sales s ON s.Shop_ID = $1 AND s.Sales_Date = ls.sale_date AND s.Sales_Source = 'daily_entry'`, [SHOP_ID]);
      await db.query(updateTotals, [SHOP_ID]);
    }
  }

  if (before.chats !== undefined) {
    await db.query(
      `INSERT INTO Chat (Chat_ID, Shop_ID, Chat_Kind, Chat_Day, Chat_Title, Chat_CreatedAt, Chat_UpdatedAt)
       SELECT id, $1::bigint, kind, day, title, created_at, updated_at FROM legacy_chats ON CONFLICT DO NOTHING`, [SHOP_ID]);
    if (before.messages !== undefined) {
      await db.query(
        `INSERT INTO Message (Message_ID, Chat_ID, Message_Role, Message_Text, Message_CreatedAt)
         SELECT id, chat_id, role, text, created_at FROM legacy_messages`);
    }
  }
  if (before.dismissed_advice !== undefined) {
    // Advice ids contain product ids ('p6', 'expiry-p16') → '6', 'expiry-16'.
    await db.query(
      `INSERT INTO DismissedAdvice (Shop_ID, Advice_ID, DismissedAdvice_At)
       SELECT $1::bigint, regexp_replace(advice_id, '(^|-)p([0-9]+)$', '\\1\\2'), dismissed_at FROM legacy_dismissed_advice
       ON CONFLICT DO NOTHING`, [SHOP_ID]);
  }
  // Demo history for the Log (the old tables had none).
  for (const l of STOCK_LOG) {
    await db.query(
      `INSERT INTO StockLog (StockLog_ID, Shop_ID, Item_ID, StockLog_Kind, StockLog_Delta, StockLog_StockAfter, StockLog_Note, StockLog_CreatedAt)
       SELECT $1, $2::bigint, $3::bigint, $4, $5::numeric, $6::numeric, $7, to_timestamp($8 / 1000.0) WHERE EXISTS (SELECT 1 FROM Item WHERE Item_ID = $3)
       ON CONFLICT DO NOTHING`,
      [l.id, SHOP_ID, Number(l.productId), l.kind, l.delta, l.stockAfter, l.note, l.at]);
  }
  for (const [text, params] of fixSequences()) await db.query(text, params);

  // Check: same numbers before and after.
  const after = {
    products: await count('Item'),
    sales: (await db.query('SELECT count(*)::int AS n FROM SalesItem')).rows[0].n,
    chats: await count('Chat'),
    messages: await count('Message'),
  };
  console.table(Object.keys(after).map((k) => ({ table: k, before: before[k] ?? '—', after: after[k] })));
  if (before.products !== undefined && before.products !== after.products) throw new Error('Product count changed — rolled back.');
  if (before.sales !== undefined && before.sales !== after.sales) throw new Error('Sales row count changed — rolled back.');
  if (before.messages !== undefined && before.messages !== after.messages) throw new Error('Message count changed — rolled back.');
  return 'Migrated. Old tables kept as legacy_*; remove them with: npm run db:migrate -- --drop-legacy';
}

// CLI: npm run db:migrate [-- --drop-legacy]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const msg = await migrate(db, { dropLegacy: process.argv.includes('--drop-legacy') });
    await db.query('COMMIT');
    console.log(msg);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Migration failed, nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
}
