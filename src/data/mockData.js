// Placeholder numbers for the analysis screens (Sales analysis, Dashboard comparisons
// and forecast). Not in the database yet — replace with values computed from real sales.

// Previous-week totals used for the "vs last week" deltas.
export const LAST_WEEK = { sales: 4937, stockValue: 2113 };

// ---- Sales analysis (pre-aggregated, as a real backend would serve it) ----
const TOP_PRODUCTS_6W = [
  { productId: '10', units: 512, trend: [3, 4, 4, 5, 6, 7] },
  { productId: '11', units: 384, trend: [5, 6, 4, 6, 5, 6] },
  { productId: '12', units: 296, trend: [3, 4, 4, 5, 5, 6] },
  { productId: '13', units: 248, trend: [3, 3, 4, 4, 5, 6] },
  { productId: '14', units: 154, trend: [7, 6, 6, 5, 4, 3] },
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

export const SLOW_MOVERS = [
  { productId: '15', note: '6 sold in 6 weeks', action: 'Bundle it' },
  { productId: '16', note: '11 sold · 8 expire in 3 days', action: 'Discount 20%' },
  { productId: '9', note: '3 sold', action: 'Promote it' },
];
