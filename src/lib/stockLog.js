// Per-product change history for Inventory → Log.
// Entries: { id, productId, at, kind: 'created' | 'edit', delta, stockAfter, note }
// Sales are not logged here: the log view reads them from store.sales, so editing
// a past day's sales never leaves stale entries behind.
import { rm2 } from './format';

const LABELS = {
  name: 'Name', sku: 'SKU', category: 'Category', supplier: 'Supplier', location: 'Location',
  min: 'Minimum', unit: 'Unit', cost: 'Unit cost', price: 'Price', expiry: 'Expiry',
};
const show = (key, v) => {
  if (v === null || v === undefined || v === '') return key === 'price' ? 'not sold' : '—';
  return key === 'cost' || key === 'price' ? rm2(v) : String(v);
};

function detailChanges(before, patch) {
  return Object.keys(LABELS)
    .filter((k) => k in patch && String(patch[k] ?? '') !== String(before[k] ?? ''))
    .map((k) => `${LABELS[k]}: ${show(k, before[k])} → ${show(k, patch[k])}`);
}

// Returns `next` with log entries for whatever this action changed.
// Pure (ids and times come from action.meta) so the store can replay it safely.
export function withStockLog(prev, next, action) {
  const meta = action.meta;
  if (!meta) return next;
  const log = prev.stockLog || [];
  const entry = (productId, fields) => ({ id: `${meta.id}-${productId}`, productId, at: meta.at, ...fields });

  switch (action.type) {
    case 'addProduct': {
      const p = action.product;
      return { ...next, stockLog: [...log, entry(p.id, { kind: 'created', delta: p.stock, stockAfter: p.stock, note: 'Added to inventory' })] };
    }
    case 'updateProduct': {
      const before = prev.products.find((p) => p.id === action.id);
      const after = next.products.find((p) => p.id === action.id);
      if (!before || !after) return next;
      const delta = after.stock - before.stock;
      const details = detailChanges(before, action.patch);
      if (!delta && !details.length) return next;
      return { ...next, stockLog: [...log, entry(action.id, { kind: 'edit', delta, stockAfter: after.stock, note: details.join(' · ') })] };
    }
    default:
      return next;
  }
}

// Entries that are new in `next` — what needs saving.
export function changedLogs(prev, next) {
  if (prev.stockLog === next.stockLog) return [];
  const old = new Map((prev.stockLog || []).map((l) => [l.id, l]));
  return (next.stockLog || []).filter((l) => old.get(l.id) !== l);
}
