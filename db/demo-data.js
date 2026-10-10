// Demo rows for an empty database: loaded by `npm run db:setup` and Settings → Reset
// (server/seed.js). The app itself reads everything from the database.
// Product ids are the database Item_IDs.

export const SHOP = {
  name: 'Kedai Kak Ros',
  owner: 'Ros',
  type: 'Home bakery',
};

export const CATEGORIES = ['Ingredients', 'Packaging', 'Baked goods'];

export const SUPPLIERS = [
  'Syarikat Maju',
  'Dairy Fresh Sdn Bhd',
  'Ladang Telur Ah Kow',
  'Kedai Runcit Pak Ali',
  'Pek & Pak Packaging',
  'Own kitchen',
];

// price === null means the item is not sold directly (ingredients, packaging).
export const PRODUCTS = [
  { id: '1', name: 'Tepung gandum', sku: 'ING-TP-01', category: 'Ingredients', supplier: 'Syarikat Maju', location: 'Store room · Rack 1', stock: 6, min: 15, unit: 'kg', cost: 2.8, price: null, expiry: '' },
  { id: '2', name: 'Gula kastor', sku: 'ING-GL-02', category: 'Ingredients', supplier: 'Syarikat Maju', location: 'Store room · Rack 1', stock: 30, min: 20, unit: 'kg', cost: 3.6, price: null, expiry: '' },
  { id: '3', name: 'Mentega (250g)', sku: 'ING-MT-03', category: 'Ingredients', supplier: 'Dairy Fresh Sdn Bhd', location: 'Fridge 1', stock: 64, min: 20, unit: 'block', cost: 12, price: null, expiry: '2026-12-20' },
  { id: '4', name: 'Telur gred A', sku: 'ING-TL-04', category: 'Ingredients', supplier: 'Ladang Telur Ah Kow', location: 'Fridge 2', stock: 240, min: 180, unit: 'pcs', cost: 0.45, price: null, expiry: '2026-10-24' },
  { id: '5', name: 'Serbuk koko', sku: 'ING-KK-05', category: 'Ingredients', supplier: 'Syarikat Maju', location: 'Store room · Rack 2', stock: 2, min: 3, unit: 'kg', cost: 18, price: null, expiry: '' },
  { id: '6', name: 'Santan (1L)', sku: 'ING-SN-06', category: 'Ingredients', supplier: 'Kedai Runcit Pak Ali', location: 'Fridge 1', stock: 0, min: 6, unit: 'pack', cost: 6.5, price: null, expiry: '' },
  { id: '7', name: 'Kotak kek 8"', sku: 'PKG-KK-01', category: 'Packaging', supplier: 'Pek & Pak Packaging', location: 'Store room · Rack 3', stock: 35, min: 50, unit: 'pcs', cost: 0.8, price: null, expiry: '' },
  { id: '8', name: 'Tin biskut', sku: 'PKG-TB-02', category: 'Packaging', supplier: 'Pek & Pak Packaging', location: 'Store room · Rack 3', stock: 40, min: 30, unit: 'pcs', cost: 3.2, price: null, expiry: '' },
  { id: '9', name: 'Kotak hadiah (besar)', sku: 'PKG-GB-03', category: 'Packaging', supplier: 'Pek & Pak Packaging', location: 'Display shelf', stock: 12, min: 5, unit: 'pcs', cost: 15, price: 35, expiry: '' },
  { id: '10', name: 'Kek Lapis Sarawak', sku: 'BKD-KL-01', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf A', stock: 18, min: 10, unit: 'loaf', cost: 8.1, price: 15, expiry: '2026-10-17' },
  { id: '11', name: 'Butter cookies (tin)', sku: 'BKD-BC-02', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf A', stock: 22, min: 12, unit: 'tin', cost: 10.35, price: 15, expiry: '2026-11-30' },
  { id: '12', name: 'Brownies (box of 9)', sku: 'BKD-BR-03', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf B', stock: 15, min: 8, unit: 'box', cost: 6.72, price: 12, expiry: '2026-10-15' },
  { id: '13', name: 'Kuih bangkit (jar)', sku: 'BKD-KB-04', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf B', stock: 26, min: 10, unit: 'jar', cost: 4.8, price: 10, expiry: '2026-12-01' },
  { id: '14', name: 'Cupcakes (6 pcs)', sku: 'BKD-CC-05', category: 'Baked goods', supplier: 'Own kitchen', location: 'Fridge 3', stock: 0, min: 8, unit: 'box', cost: 9.15, price: 15, expiry: '' },
  { id: '15', name: 'Red velvet slice', sku: 'BKD-RV-06', category: 'Baked goods', supplier: 'Own kitchen', location: 'Fridge 3', stock: 20, min: 5, unit: 'slice', cost: 7, price: 12, expiry: '2026-10-14' },
  { id: '16', name: 'Pandan chiffon', sku: 'BKD-PC-07', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf B', stock: 8, min: 4, unit: 'whole', cost: 11.25, price: 18, expiry: '2026-10-13' },
];

// Inventory → Log history (see lib/stockLog.js). Sales are not listed here — the Log
// reads them from SALES_RECORDS. Each product's entries + sales add up to its stock above.
const at = (date, time) => new Date(`${date}T${time}:00+08:00`).getTime();
export const STOCK_LOG = [
  { id: 'seed-11-cost', productId: '11', at: at('2026-10-02', '09:40'), kind: 'edit', delta: 0, stockAfter: null, note: 'Unit cost: RM 9.10 → RM 10.35 (butter price up 14%)' },
  { id: 'seed-6-1', productId: '6', at: at('2026-10-02', '11:05'), kind: 'edit', delta: 12, stockAfter: 12, note: 'Delivery from Kedai Runcit Pak Ali' },
  { id: 'seed-1-1', productId: '1', at: at('2026-10-03', '10:15'), kind: 'edit', delta: 20, stockAfter: 26, note: 'Delivery from Syarikat Maju' },
  { id: 'seed-10-1', productId: '10', at: at('2026-10-04', '16:30'), kind: 'edit', delta: 100, stockAfter: 160, note: 'Baked a new batch for the week' },
  { id: 'seed-11-1', productId: '11', at: at('2026-10-04', '17:10'), kind: 'edit', delta: 60, stockAfter: 118, note: 'Baked a new batch for the week' },
  { id: 'seed-14-1', productId: '14', at: at('2026-10-08', '15:45'), kind: 'edit', delta: 10, stockAfter: 10, note: 'Baked a new batch' },
  { id: 'seed-16-1', productId: '16', at: at('2026-10-10', '06:40'), kind: 'edit', delta: 8, stockAfter: 8, note: 'Baked a new batch' },
];

// Units sold per product, per day. Totals: Mon 720, Tue 640, Wed 810,
// Thu 760, Fri 1,120, Sat (today) 1,480 → RM 5,530 this week.
// Sunday 4 Oct was never recorded, so it shows as "Missing".
export const SALES_RECORDS = {
  '2026-10-05': { '10': 20, '11': 12, '12': 10, '13': 12 },
  '2026-10-06': { '10': 16, '11': 10, '12': 10, '13': 13 },
  '2026-10-07': { '10': 22, '11': 14, '12': 10, '13': 15 },
  '2026-10-08': { '10': 20, '11': 14, '12': 10, '13': 13 },
  '2026-10-09': { '10': 30, '11': 20, '12': 15, '13': 16, '14': 2 },
  '2026-10-10': { '10': 34, '11': 26, '12': 20, '13': 22, '14': 8 },
};

