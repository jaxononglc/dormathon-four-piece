// Demo rows from src/data/mockData.js as [sql, params] pairs. ON CONFLICT DO NOTHING,
// so running them again never overwrites edits. Used by db/setup.mjs and POST /api/reset.
import { CATEGORIES, SUPPLIERS, PRODUCTS, SALES_RECORDS } from '../src/data/mockData.js';

export function seedQueries() {
  const q = [];
  for (const name of CATEGORIES) q.push(['INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]]);
  for (const name of SUPPLIERS) q.push(['INSERT INTO suppliers (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]]);
  for (const p of PRODUCTS) {
    q.push([
      `INSERT INTO products (id, name, sku, category, supplier, location, stock, min_stock, unit, cost, price, expiry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
      [p.id, p.name, p.sku, p.category, p.supplier, p.location, p.stock, p.min, p.unit, p.cost, p.price, p.expiry || null],
    ]);
  }
  for (const [date, lines] of Object.entries(SALES_RECORDS)) {
    for (const [productId, units] of Object.entries(lines)) {
      q.push(['INSERT INTO sales (sale_date, product_id, units) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [date, productId, units]]);
    }
  }
  // The pinned "Today's advice" chat always exists (Dashboard chats are created per day).
  q.push([`INSERT INTO chats (id, kind, title) VALUES ('advice', 'advice', 'Today’s advice') ON CONFLICT DO NOTHING`, []]);
  return q;
}
