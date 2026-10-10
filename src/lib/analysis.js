// Sales analysis worked out from the store (sales records, damaged goods and products,
// all loaded from the database). Pure code, no AI: instant, exact and free.
import { addDays, daysBetween, dayNum, dayShort, shortDate } from './format';

// days = length of the period, bucket = days per chart point. The previous period is the
// same number of days right before it. `recent` fills sentences ("sold … in the last week").
export const PERIODS = {
  '7d': { label: '1 week', days: 7, bucket: 1, name: 'the previous week', recent: 'in the last week', trendTitle: 'Daily revenue in RM' },
  '30d': { label: '1 month', days: 30, bucket: 6, name: 'the previous 30 days', recent: 'in the last month', trendTitle: 'Revenue per 6 days in RM' },
  '90d': { label: '3 months', days: 91, bucket: 7, name: 'the previous 3 months', recent: 'in the last 3 months', trendTitle: 'Weekly revenue in RM' },
  '365d': { label: '1 year', days: 364, bucket: 28, name: 'the previous year', recent: 'in the last year', trendTitle: 'Revenue per 4 weeks in RM' },
};

const inRange = (d, from, to) => d >= from && d <= to;

/**
 * @param {'7d'|'30d'|'90d'|'365d'|'custom'} period
 * @param {string} today  yyyy-mm-dd (a preset period ends today; today is also what expiry is measured from)
 * @param {{ sales: object, damage: object, products: object[], productsById: object }} data
 *   sales / damage: { 'yyyy-mm-dd': { productId: units } }
 * @param {{ from: string, to: string }} [custom]  the exact range when period is 'custom'
 */
export function analyse(period, today, { sales, damage, products, productsById }, custom) {
  let P = PERIODS[period];
  let end = today;
  if (period === 'custom') {
    // Compared with the same number of days right before the range; about 12 chart points at most.
    end = custom.to;
    const days = daysBetween(custom.from, custom.to) + 1;
    const bucket = days <= 14 ? 1 : Math.ceil(days / 12);
    P = {
      label: 'Custom', days, bucket, name: `the previous ${days} day${days === 1 ? '' : 's'}`, recent: 'in this period',
      trendTitle: bucket === 1 ? 'Daily revenue in RM' : bucket === 7 ? 'Weekly revenue in RM' : `Revenue per ${bucket} days in RM`,
    };
  }
  const start = addDays(end, 1 - P.days);
  const prevStart = addDays(start, -P.days);
  const prevEnd = addDays(start, -1);
  const buckets = Array.from({ length: Math.ceil(P.days / P.bucket) }, (_, i) => {
    const from = addDays(start, i * P.bucket);
    const to = [addDays(from, P.bucket - 1), end].sort()[0]; // the last block may be shorter
    return { label: P.bucket === 1 ? `${dayShort(from)} ${dayNum(from)}` : shortDate(from), from, to, prevFrom: addDays(from, -P.days), prevTo: addDays(to, -P.days) };
  });

  // Units per product over a date range, from a { date: { id: units } } map.
  const unitsIn = (map, from, to) => {
    const out = {};
    for (const [d, lines] of Object.entries(map)) {
      if (!inRange(d, from, to)) continue;
      for (const [id, u] of Object.entries(lines)) out[id] = (out[id] || 0) + u;
    }
    return out;
  };
  const totals = (units) => {
    let revenue = 0, cost = 0, count = 0;
    for (const [id, u] of Object.entries(units)) {
      const p = productsById[id];
      if (!p) continue;
      revenue += u * (p.price || 0);
      cost += u * p.cost;
      count += u;
    }
    return { revenue, cost, units: count, profit: revenue - cost, margin: revenue ? (revenue - cost) / revenue : 0 };
  };
  const margin = (p) => (p.price ? (p.price - p.cost) / p.price : 0);

  const sold = unitsIn(sales, start, end);
  const soldPrev = unitsIn(sales, prevStart, prevEnd);
  const dam = unitsIn(damage, start, end);
  const damPrev = unitsIn(damage, prevStart, prevEnd);
  const now = totals(sold);
  const prev = totals(soldPrev);
  const damagedCost = Object.entries(dam).reduce((s, [id, u]) => s + u * (productsById[id]?.cost || 0), 0);
  const sum = (o) => Object.values(o).reduce((s, u) => s + u, 0);

  const trend = buckets.map((b) => ({
    label: b.label,
    previousLabel: P.bucket === 1 ? `${dayShort(b.prevFrom)} ${dayNum(b.prevFrom)}` : shortDate(b.prevFrom), // the matching day / block last period
    value: totals(unitsIn(sales, b.from, b.to)).revenue,
    previous: totals(unitsIn(sales, b.prevFrom, b.prevTo)).revenue,
  }));

  const soldProducts = Object.keys(sold).map((id) => productsById[id]).filter(Boolean);
  const topProducts = soldProducts
    .map((p) => ({ productId: p.id, p, units: sold[p.id], revenue: sold[p.id] * (p.price || 0), margin: margin(p), damaged: dam[p.id] || 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const marginByProduct = soldProducts.map((p) => ({ productId: p.id, p, margin: margin(p) })).sort((a, b) => b.margin - a.margin);

  // Slow movers: sellable stock that sold under half of last period, nothing at all,
  // or expires within a week. Expiring first, then most money tied up.
  const slowMovers = products
    .filter((p) => p.price != null && p.stock > 0)
    .map((p) => {
      const n = sold[p.id] || 0;
      const before = soldPrev[p.id] || 0;
      const daysLeft = p.expiry ? daysBetween(today, p.expiry) : null;
      const expiring = daysLeft != null && daysLeft >= 0 && daysLeft <= 7;
      const slow = n === 0 || (before > 0 && n < before / 2);
      if (!expiring && !slow) return null;
      const note = `${n} sold ${P.recent}${expiring ? ` · ${p.stock} expire in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : before ? ` (${before} before)` : ''}`;
      const action = expiring && daysLeft <= 3 ? 'Discount 20%' : n === 0 ? 'Promote it' : 'Bundle it';
      return { productId: p.id, p, note, action, daysLeft: expiring ? daysLeft : Infinity, tied: p.stock * p.cost };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft || b.tied - a.tied)
    .slice(0, 3);

  const daysRecorded = Object.keys(sales).filter((d) => inRange(d, start, end) && sum(sales[d]) > 0).length;
  const damagedUnits = sum(dam);
  // The start gets its year too when the period began in an earlier year ("12 Oct 2025 – 10 Oct 2026").
  const startYear = start.slice(0, 4) !== end.slice(0, 4) ? ` ${start.slice(0, 4)}` : '';
  const range = start === end
    ? `${shortDate(end)} ${end.slice(0, 4)}`
    : `${shortDate(start)}${startYear} – ${shortDate(end)} ${end.slice(0, 4)}`;

  return {
    period, start, end, range, compare: `compared with ${P.name}`, trendTitle: P.trendTitle,
    revenue: now.revenue, revenuePrev: prev.revenue,
    unitsSold: now.units, unitsSoldPrev: prev.units,
    grossProfit: now.profit, grossProfitPrev: prev.profit,
    margin: now.margin, marginPrev: prev.margin,
    damagedUnits, damagedUnitsPrev: sum(damPrev), damagedCost,
    daysRecorded, totalDays: P.days,
    trend, topProducts, marginByProduct, slowMovers,
  };
}
