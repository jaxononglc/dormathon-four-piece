// Demo rows from src/data/mockData.js as [sql, params] pairs for the schema in
// db/schema.sql. ON CONFLICT DO NOTHING, so running them again never overwrites
// edits. Used by db/setup.mjs and POST /api/reset.
import { SHOP, CATEGORIES, SUPPLIERS, PRODUCTS, SALES_RECORDS, STOCK_LOG } from '../db/demo-data.js';

export const SHOP_ID = 1;

// The shop and its owner — needed before anything else can be saved.
export function baseQueries() {
  return [
    ['INSERT INTO Shop (Shop_ID, Shop_Name, Shop_Type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [SHOP_ID, SHOP.name, SHOP.type]],
    ["INSERT INTO Users (User_ID, Shop_ID, User_Name, User_Role) VALUES (1, $1, $2, 'owner') ON CONFLICT DO NOTHING", [SHOP_ID, SHOP.owner]],
    [`INSERT INTO Chat (Chat_ID, Shop_ID, Chat_Kind, Chat_Title) VALUES ('advice', $1, 'advice', 'Today’s advice') ON CONFLICT DO NOTHING`, [SHOP_ID]],
    ...fixSequences(),
  ];
}

// Explicit ids don't move the identity counters; push them past the highest id.
export const fixSequences = () =>
  [['Shop', 'Shop_ID'], ['Users', 'User_ID'], ['Item', 'Item_ID']].map(([t, c]) => [
    `SELECT setval(pg_get_serial_sequence('${t.toLowerCase()}', '${c.toLowerCase()}'), (SELECT COALESCE(max(${c}), 0) + 1 FROM ${t}), false)`,
    [],
  ]);

export function demoQueries() {
  const q = [];
  for (const name of CATEGORIES) q.push(['INSERT INTO Category (Shop_ID, Category_Name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [SHOP_ID, name]]);
  for (const name of SUPPLIERS) q.push(['INSERT INTO Supplier (Shop_ID, Supplier_Name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [SHOP_ID, name]]);
  for (const p of PRODUCTS) {
    q.push([
      `INSERT INTO Item (Item_ID, Shop_ID, Category_ID, Supplier_ID, Item_Name, Item_SKU, Item_Unit, Item_CostPrice, Item_UnitPrice)
       VALUES ($1, $2,
         (SELECT Category_ID FROM Category WHERE Shop_ID = $2 AND Category_Name = $3),
         (SELECT Supplier_ID FROM Supplier WHERE Shop_ID = $2 AND Supplier_Name = $4),
         $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [Number(p.id), SHOP_ID, p.category, p.supplier, p.name, p.sku, p.unit, p.cost, p.price],
    ]);
    q.push([
      `INSERT INTO Inventory (Shop_ID, Item_ID, Inventory_Stock, Inventory_Min, Inventory_Location, Inventory_Expiry)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [SHOP_ID, Number(p.id), p.stock, p.min, p.location, p.expiry || null],
    ]);
  }
  // One recorded sale per day (demoQueries only runs on an empty database).
  for (const [date, lines] of Object.entries(SALES_RECORDS)) {
    q.push([
      `WITH s AS (
         INSERT INTO Sales (Shop_ID, Sales_Date, Sales_Source, Sales_CreatedAt)
         VALUES ($1, $2::date, 'daily_entry', $2::date + time '12:00' AT TIME ZONE 'Asia/Kuala_Lumpur') RETURNING Sales_ID)
       INSERT INTO SalesItem (Sales_ID, Item_ID, SalesItem_Quantity, SalesItem_UnitPrice)
       SELECT s.Sales_ID, i.Item_ID, n.value::int, COALESCE(i.Item_UnitPrice, 0)
       FROM s, jsonb_each_text($3::jsonb) n JOIN Item i ON i.Item_ID = n.key::bigint AND i.Shop_ID = $1`,
      [SHOP_ID, date, JSON.stringify(lines)],
    ]);
  }
  q.push([updateTotals, [SHOP_ID]]);
  for (const l of STOCK_LOG) {
    q.push([
      `INSERT INTO StockLog (StockLog_ID, Shop_ID, Item_ID, StockLog_Kind, StockLog_Delta, StockLog_StockAfter, StockLog_Note, StockLog_CreatedAt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0)) ON CONFLICT DO NOTHING`,
      [l.id, SHOP_ID, Number(l.productId), l.kind, l.delta, l.stockAfter, l.note, l.at],
    ]);
  }
  q.push(...fixSequences());
  return q;
}

// Sales_Total = sum of its SalesItem subtotals.
export const updateTotals = `
  UPDATE Sales s SET Sales_Total = COALESCE((SELECT sum(SalesItem_Subtotal) FROM SalesItem si WHERE si.Sales_ID = s.Sales_ID), 0)
  WHERE s.Shop_ID = $1`;
