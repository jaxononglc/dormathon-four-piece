// All demo data lives here. There is no backend — the app keeps state in
// memory and mirrors it to localStorage so a page refresh keeps your edits.

// The demo is pinned to one "today" so the numbers in every screen agree.
export const TODAY = '2026-10-10'; // Saturday

export const SHOP = {
  name: 'Kedai Kak Ros',
  owner: 'Ros',
  initials: 'KR',
  type: 'Home bakery',
};

export const CATEGORIES = ['Ingredients', 'Packaging', 'Baked goods'];
export const UNITS = ['kg', 'g', 'pcs', 'pack', 'block', 'box', 'tin', 'jar', 'loaf', 'slice', 'whole'];

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
  { id: 'p1', name: 'Tepung gandum', sku: 'ING-TP-01', category: 'Ingredients', supplier: 'Syarikat Maju', location: 'Store room · Rack 1', stock: 6, min: 15, unit: 'kg', cost: 2.8, price: null, expiry: '' },
  { id: 'p2', name: 'Gula kastor', sku: 'ING-GL-02', category: 'Ingredients', supplier: 'Syarikat Maju', location: 'Store room · Rack 1', stock: 30, min: 20, unit: 'kg', cost: 3.6, price: null, expiry: '' },
  { id: 'p3', name: 'Mentega (250g)', sku: 'ING-MT-03', category: 'Ingredients', supplier: 'Dairy Fresh Sdn Bhd', location: 'Fridge 1', stock: 64, min: 20, unit: 'block', cost: 12, price: null, expiry: '2026-12-20' },
  { id: 'p4', name: 'Telur gred A', sku: 'ING-TL-04', category: 'Ingredients', supplier: 'Ladang Telur Ah Kow', location: 'Fridge 2', stock: 240, min: 180, unit: 'pcs', cost: 0.45, price: null, expiry: '2026-10-24' },
  { id: 'p5', name: 'Serbuk koko', sku: 'ING-KK-05', category: 'Ingredients', supplier: 'Syarikat Maju', location: 'Store room · Rack 2', stock: 2, min: 3, unit: 'kg', cost: 18, price: null, expiry: '' },
  { id: 'p6', name: 'Santan (1L)', sku: 'ING-SN-06', category: 'Ingredients', supplier: 'Kedai Runcit Pak Ali', location: 'Fridge 1', stock: 0, min: 6, unit: 'pack', cost: 6.5, price: null, expiry: '' },
  { id: 'p7', name: 'Kotak kek 8"', sku: 'PKG-KK-01', category: 'Packaging', supplier: 'Pek & Pak Packaging', location: 'Store room · Rack 3', stock: 35, min: 50, unit: 'pcs', cost: 0.8, price: null, expiry: '' },
  { id: 'p8', name: 'Tin biskut', sku: 'PKG-TB-02', category: 'Packaging', supplier: 'Pek & Pak Packaging', location: 'Store room · Rack 3', stock: 40, min: 30, unit: 'pcs', cost: 3.2, price: null, expiry: '' },
  { id: 'p9', name: 'Kotak hadiah (besar)', sku: 'PKG-GB-03', category: 'Packaging', supplier: 'Pek & Pak Packaging', location: 'Display shelf', stock: 12, min: 5, unit: 'pcs', cost: 15, price: 35, expiry: '' },
  { id: 'p10', name: 'Kek Lapis Sarawak', sku: 'BKD-KL-01', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf A', stock: 18, min: 10, unit: 'loaf', cost: 8.1, price: 15, expiry: '2026-10-17' },
  { id: 'p11', name: 'Butter cookies (tin)', sku: 'BKD-BC-02', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf A', stock: 22, min: 12, unit: 'tin', cost: 10.35, price: 15, expiry: '2026-11-30' },
  { id: 'p12', name: 'Brownies (box of 9)', sku: 'BKD-BR-03', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf B', stock: 15, min: 8, unit: 'box', cost: 6.72, price: 12, expiry: '2026-10-15' },
  { id: 'p13', name: 'Kuih bangkit (jar)', sku: 'BKD-KB-04', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf B', stock: 26, min: 10, unit: 'jar', cost: 4.8, price: 10, expiry: '2026-12-01' },
  { id: 'p14', name: 'Cupcakes (6 pcs)', sku: 'BKD-CC-05', category: 'Baked goods', supplier: 'Own kitchen', location: 'Fridge 3', stock: 0, min: 8, unit: 'box', cost: 9.15, price: 15, expiry: '' },
  { id: 'p15', name: 'Red velvet slice', sku: 'BKD-RV-06', category: 'Baked goods', supplier: 'Own kitchen', location: 'Fridge 3', stock: 20, min: 5, unit: 'slice', cost: 7, price: 12, expiry: '2026-10-14' },
  { id: 'p16', name: 'Pandan chiffon', sku: 'BKD-PC-07', category: 'Baked goods', supplier: 'Own kitchen', location: 'Display shelf B', stock: 8, min: 4, unit: 'whole', cost: 11.25, price: 18, expiry: '2026-10-13' },
];

// Units sold per product, per day. Totals: Mon 720, Tue 640, Wed 810,
// Thu 760, Fri 1,120, Sat (today) 1,480 → RM 5,530 this week.
// Sunday 4 Oct was never recorded, so it shows as "Missing".
export const SALES_RECORDS = {
  '2026-10-05': { p10: 20, p11: 12, p12: 10, p13: 12 },
  '2026-10-06': { p10: 16, p11: 10, p12: 10, p13: 13 },
  '2026-10-07': { p10: 22, p11: 14, p12: 10, p13: 15 },
  '2026-10-08': { p10: 20, p11: 14, p12: 10, p13: 13 },
  '2026-10-09': { p10: 30, p11: 20, p12: 15, p13: 16, p14: 2 },
  '2026-10-10': { p10: 34, p11: 26, p12: 20, p13: 22, p14: 8 },
};

// AI forecast for tomorrow (Sunday), shown as the dashed bar.
export const SUNDAY_FORECAST = 1300;

// Previous-week totals used for the "vs last week" deltas.
export const LAST_WEEK = { sales: 4937, stockValue: 2113 };

// ---- Sales analysis (pre-aggregated, as a real backend would serve it) ----
const TOP_PRODUCTS_6W = [
  { productId: 'p10', units: 512, trend: [3, 4, 4, 5, 6, 7] },
  { productId: 'p11', units: 384, trend: [5, 6, 4, 6, 5, 6] },
  { productId: 'p12', units: 296, trend: [3, 4, 4, 5, 5, 6] },
  { productId: 'p13', units: 248, trend: [3, 3, 4, 4, 5, 6] },
  { productId: 'p14', units: 154, trend: [7, 6, 6, 5, 4, 3] },
];

export const ANALYSIS = {
  '7d': {
    label: '7 days',
    range: '4 – 10 Oct 2026',
    compare: 'compared with the 7 days before',
    revenue: 5530, revenuePrev: 4937,
    orders: 274, ordersPrev: 251,
    margin: 0.38, marginPrev: 0.392,
    trendTitle: 'Daily revenue in RM',
    trend: [
      { label: '4 Oct', value: 0 },
      { label: '5 Oct', value: 720 },
      { label: '6 Oct', value: 640 },
      { label: '7 Oct', value: 810 },
      { label: '8 Oct', value: 760 },
      { label: '9 Oct', value: 1120 },
      { label: '10 Oct', value: 1480 },
    ],
    previous: [610, 690, 580, 700, 640, 890, 827],
    topFactor: 0.15,
  },
  '30d': {
    label: '30 days',
    range: '11 Sep – 10 Oct 2026',
    compare: 'compared with the 30 days before',
    revenue: 18660, revenuePrev: 15640,
    orders: 852, ordersPrev: 796,
    margin: 0.38, marginPrev: 0.391,
    trendTitle: 'Weekly revenue in RM',
    trend: [
      { label: '11 Sep', value: 3870 },
      { label: '18 Sep', value: 3780 },
      { label: '25 Sep', value: 4120 },
      { label: '2 Oct', value: 4290 },
      { label: '9 Oct', value: 2600 }, // partial week: 9–10 Oct only
    ],
    previous: [3300, 3520, 3600, 3240, 1980],
    topFactor: 0.7,
  },
  '6w': {
    label: '6 weeks',
    range: '1 Sep – 10 Oct 2026',
    compare: 'compared with the 6 weeks before',
    revenue: 23840, revenuePrev: 20411,
    orders: 1186, ordersPrev: 1118,
    margin: 0.38, marginPrev: 0.392,
    trendTitle: 'Weekly revenue in RM',
    trend: [
      { label: '1 Sep', value: 3420 },
      { label: '8 Sep', value: 3610 },
      { label: '15 Sep', value: 4050 },
      { label: '22 Sep', value: 3780 },
      { label: '29 Sep', value: 4120 },
      { label: '6 Oct', value: 4860 },
    ],
    previous: [3300, 3150, 3520, 3600, 3240, 3601],
    topFactor: 1,
  },
};
export const TOP_PRODUCTS = TOP_PRODUCTS_6W;

export const MARGIN_TARGET = 0.35;

export const SLOW_MOVERS = [
  { productId: 'p15', note: '6 sold in 6 weeks', action: 'Bundle it' },
  { productId: 'p16', note: '11 sold · 8 expire in 3 days', action: 'Discount 20%' },
  { productId: 'p9', note: '3 sold', action: 'Promote it' },
];

export const UPCOMING = [
  { title: 'Payday', date: '25 Oct', note: 'in 15 days', color: 'green' },
  { title: 'Deepavali', date: '8 Nov', note: 'in 4 weeks', color: 'amber' },
];
