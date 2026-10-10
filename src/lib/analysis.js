// Sales analysis worked out from the store (sales records, damaged goods and products,
// all loaded from the database). Pure code, no AI: instant, exact and free.
import { addDays, daysBetween, dayNum, dayShort, pct, rm, shortDate, signedPct } from './format';

export const PERIODS = {
  '7d': { label: '7 days', days: 7, bucket: 1, name: 'the previous 7 days', trendTitle: 'Daily revenue in RM' },
  '30d': { label: '30 days', days: 30, bucket: 6, name: 'the previous 30 days', trendTitle: 'Revenue per 6 days in RM' },
  '6w': { label: '6 weeks', days: 42, bucket: 7, name: 'the 6 weeks before', trendTitle: 'Weekly revenue in RM' },
};

const inRange = (d, from, to) => d >= from && d <= to;

/**
 * @param {'7d'|'30d'|'6w'} period
 * @param {string} today  yyyy-mm-dd
 * @param {{ sales: object, damage: object, products: object[], productsById: object, marginTarget: number }} data
 *   sales / damage: { 'yyyy-mm-dd': { productId: units } }
 */
export function analyse(period, today, { sales, damage, products, productsById, marginTarget }) {
  const P = PERIODS[period];
  const start = addDays(today, 1 - P.days);
  const prevStart = addDays(start, -P.days);
  const prevEnd = addDays(start, -1);
  const buckets = Array.from({ length: P.days / P.bucket }, (_, i) => {
    const from = addDays(start, i * P.bucket);
    const to = addDays(from, P.bucket - 1);
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

  const sold = unitsIn(sales, start, today);
  const soldPrev = unitsIn(sales, prevStart, prevEnd);
  const dam = unitsIn(damage, start, today);
  const damPrev = unitsIn(damage, prevStart, prevEnd);
  const now = totals(sold);
  const prev = totals(soldPrev);
  const damagedCost = Object.entries(dam).reduce((s, [id, u]) => s + u * (productsById[id]?.cost || 0), 0);
  const sum = (o) => Object.values(o).reduce((s, u) => s + u, 0);

  const trend = buckets.map((b) => ({
    label: b.label,
    value: totals(unitsIn(sales, b.from, b.to)).revenue,
    previous: totals(unitsIn(sales, b.prevFrom, b.prevTo)).revenue,
  }));
  const productTrend = (id) => buckets.map((b) => unitsIn(sales, b.from, b.to)[id] || 0);

  const soldProducts = Object.keys(sold).map((id) => productsById[id]).filter(Boolean);
  const topProducts = soldProducts
    .map((p) => ({ productId: p.id, p, units: sold[p.id], revenue: sold[p.id] * (p.price || 0), margin: margin(p), damaged: dam[p.id] || 0, trend: productTrend(p.id) }))
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
      const note = `${n} sold in ${P.label}${expiring ? ` · ${p.stock} expire in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : before ? ` (${before} before)` : ''}`;
      const action = expiring && daysLeft <= 3 ? 'Discount 20%' : n === 0 ? 'Promote it' : 'Bundle it';
      return { productId: p.id, p, note, action, daysLeft: expiring ? daysLeft : Infinity, tied: p.stock * p.cost };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft || b.tied - a.tied)
    .slice(0, 3);

  const daysRecorded = Object.keys(sales).filter((d) => inRange(d, start, today) && sum(sales[d]) > 0).length;
  const damagedUnits = sum(dam);
  const range = `${shortDate(start)} – ${shortDate(today)} ${today.slice(0, 4)}`;

  return {
    period, range, compare: `compared with ${P.name}`, trendTitle: P.trendTitle,
    revenue: now.revenue, revenuePrev: prev.revenue,
    unitsSold: now.units, unitsSoldPrev: prev.units,
    grossProfit: now.profit, grossProfitPrev: prev.profit,
    margin: now.margin, marginPrev: prev.margin,
    damagedUnits, damagedUnitsPrev: sum(damPrev), damagedCost,
    daysRecorded, totalDays: P.days,
    trend, topProducts, marginByProduct, slowMovers,
    summary: summarise({ now, prev, daysRecorded, P, damagedUnits, damagedCost, dam, topProducts, marginByProduct, slowMovers, productsById, marginTarget }),
  };
}

// A few plain sentences built from the numbers above.
function summarise({ now, prev, daysRecorded, P, damagedUnits, damagedCost, dam, topProducts, marginByProduct, slowMovers, productsById, marginTarget }) {
  if (!now.units) return `No sales were recorded in the last ${P.label}. Record your daily sales to see how the shop is doing.`;
  const out = [];
  const change = prev.revenue ? `, ${signedPct(now.revenue / prev.revenue - 1)} vs ${P.name}` : '';
  const gaps = daysRecorded < P.days ? ` Sales were recorded on ${daysRecorded} of ${P.days} days, so missing days count as no sales.` : '';
  out.push(`Revenue was ${rm(now.revenue)} from ${now.units} units${change}.${gaps}`);

  const worst = marginByProduct[marginByProduct.length - 1];
  if (now.margin < marginTarget) out.push(`Gross margin is ${pct(now.margin)}, below your ${pct(marginTarget)} target.`);
  else out.push(`Gross margin is ${pct(now.margin)}, above your ${pct(marginTarget)} target.`);
  if (worst && worst.margin < marginTarget) out.push(`${worst.p.name} earns only ${pct(worst.margin)}, so consider raising its price.`);

  if (damagedUnits) {
    const [topId] = Object.entries(dam).sort((a, b) => b[1] - a[1])[0];
    out.push(`${damagedUnits} unit${damagedUnits === 1 ? ' was' : 's were'} damaged (${rm(damagedCost, 2)} lost), mostly ${productsById[topId]?.name ?? 'one item'}.`);
  }

  const expiring = slowMovers.find((s) => s.daysLeft !== Infinity);
  const best = topProducts[0];
  if (expiring) out.push(`Clear ${expiring.p.name} soon: ${expiring.p.stock} expire in ${expiring.daysLeft} day${expiring.daysLeft === 1 ? '' : 's'}.`);
  else if (best && best.p.stock < best.p.min) out.push(`${best.p.name} is your best seller but is low on stock, so restock it.`);
  else if (best) out.push(`${best.p.name} is your best seller this period.`);
  return out.join(' ');
}
