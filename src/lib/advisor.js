// Mock "AI". Picks a canned answer by keyword and fills it with live store data,
// so replies stay consistent with what the rest of the app shows.
import { stockStatus, suggestedQty } from '../store/AppStore';
import { addDays, localToday, rm, rm2 } from './format';

export function advisorReply(text, store) {
  const q = text.toLowerCase();
  const { reorder, products, salesFor } = store;

  // Buttons on the advice cards (lib/advice.js).
  const order = text.match(/draft a whatsapp order to (.+) for (\d+) (\S+) of (.+)$/i);
  if (order) {
    const [, supplier, qty, unit, item] = order;
    return { type: 'text', text: `Here’s a draft for ${supplier}:\n\n“Salam, ini ${store.shop.owner} dari ${store.shop.name}. Saya nak order ${qty} ${unit} ${item}. Boleh hantar esok? Terima kasih!”\n\nCopy it into WhatsApp — sending is not connected in this demo.` };
  }
  const promo = text.match(/write a whatsapp promo for (.+) at 20% off/i);
  if (promo) {
    const p = products.find((x) => x.name === promo[1]);
    return { type: 'text', text: `“🎉 Promo hujung minggu! ${promo[1]}${p?.price ? ` kini ${rm2(p.price * 0.8)} sahaja (biasa ${rm2(p.price)})` : ' 20% off'}. Stok terhad — WhatsApp kami untuk tempah!”\n\nPost it to your status or customer groups.` };
  }
  const bake = text.match(/how many (.+) should i bake/i);
  if (bake) {
    const p = products.find((x) => x.name === bake[1]);
    return { type: 'text', text: p ? `Bake ${suggestedQty(p)} ${p.unit} of ${p.name}. That brings you to twice your minimum (${p.min} ${p.unit}), which covers a busy Sunday.` : 'Bake enough to get back to twice your minimum level.' };
  }
  if (/(deepavali|festival)/.test(q)) {
    return { type: 'text', text: 'Deepavali is on 8 Nov. Orders usually jump in the 2 weeks before festivals, so restock flour, butter, sugar and cake boxes by 25 Oct.' };
  }
  if (/(budget|money to spend|only have)/.test(q)) {
    return { type: 'text', text: 'Start with the items that are out of stock, then the low ones. Ask “What is low on stock?” to see the list with costs.' };
  }
  if (/(supplier|message)/.test(q)) {
    const bySupplier = {};
    reorder.forEach((p) => {
      (bySupplier[p.supplier] ||= []).push(`${suggestedQty(p)} ${p.unit} ${p.name}`);
    });
    const lines = Object.entries(bySupplier)
      .filter(([s]) => s !== 'Own kitchen')
      .map(([s, items]) => `• ${s}: ${items.join(', ')}`);
    return {
      type: 'text',
      text: lines.length
        ? `Here are WhatsApp drafts for each supplier:\n${lines.join('\n')}\nCopy them from here — sending is not connected in this demo.`
        : 'Nothing needs ordering from suppliers right now.',
    };
  }
  if (/remind/.test(q)) {
    return { type: 'text', text: 'Done — I’ll remind you on 25 Oct (payday) to buy the sugar and anything else left on the plan.' };
  }
  if (/(best.?sell|top sell|most popular|sell(s|ing)? (the )?most|best seller)/.test(q)) {
    // Units sold per product over the last 7 days, from the recorded sales.
    const units = {};
    for (let i = 0; i < 7; i++) {
      Object.entries(store.sales[addDays(localToday(), -i)] || {}).forEach(([id, u]) => (units[id] = (units[id] || 0) + u));
    }
    const ranked = Object.entries(units)
      .map(([id, u]) => ({ p: store.productsById[id], u }))
      .filter((x) => x.p)
      .sort((a, b) => b.u - a.u);
    if (!ranked.length) return { type: 'text', text: 'No sales were recorded in the last 7 days, so there is no best seller yet. Record your daily sales to see it.' };
    const [top, ...rest] = ranked;
    const next = rest.slice(0, 2).map((x) => `${x.p.name} (${x.u})`).join(' and ');
    return {
      type: 'text',
      text: `Your best seller in the last 7 days is ${top.p.name}: ${top.u} ${top.p.unit} sold, about ${rm(top.u * (top.p.price || 0))}.${next ? ` Next are ${next}.` : ''} You have ${top.p.stock} ${top.p.unit} left, so keep it stocked.`,
    };
  }
  if (/(lose money|margin|losing|profit)/.test(q)) {
    const margins = products
      .filter((p) => p.price)
      .map((p) => ({ p, m: (p.price - p.cost) / p.price }))
      .sort((a, b) => a.m - b.m);
    const losing = margins.filter(({ m }) => m < 0);
    const below = margins.filter(({ m }) => m >= 0 && m < 0.35);
    const name = ({ p, m }) => `${p.name} (${Math.round(m * 100)}%)`;
    const parts = [
      losing.length ? `${losing.map(name).join(', ')} sell below cost.` : 'None of your products sell below cost.',
      below.length
        ? `Below your 35% margin target: ${below.map(name).join(', ')}. Butter went up 14%, which hit the cookies hardest — raising the tin from RM 15 to RM 16.50 brings it back to about 37%.`
        : 'Everything is above your 35% margin target.',
    ];
    return { type: 'text', text: parts.join(' ') };
  }
  if (/(why.*sales|sales up|sales drop|tuesday)/.test(q)) {
    return {
      type: 'text',
      text: `Sales are up mainly because of weekend WhatsApp orders — Friday and today together brought ${rm(
        salesFor('2026-10-09').sales + salesFor('2026-10-10').sales
      )}. Tuesday is usually your quietest day (${rm(salesFor('2026-10-06').sales)} this week), so it’s a good day for baking ahead.`,
    };
  }
  if (/(low|stock|reorder|run out|habis)/.test(q)) {
    if (!reorder.length) return { type: 'text', text: 'Everything is above its minimum level right now. 👍' };
    const list = reorder
      .map((p) => `• ${p.name}: ${p.stock} ${p.unit} left (min ${p.min})${stockStatus(p) === 'out' ? ' — out of stock' : ''}`)
      .join('\n');
    const cost = reorder.reduce((s, p) => s + suggestedQty(p) * p.cost, 0);
    return {
      type: 'text',
      text: `${reorder.length} items need restocking:\n${list}\nRestocking all of them costs about ${rm2(cost)}. Ask me to “message my suppliers” and I’ll draft the orders.`,
    };
  }
  if (/plan/.test(q)) {
    return { type: 'text', text: 'Deepavali is on 8 Nov. Orders usually jump in the 2 weeks before festivals, so restock flour, butter, sugar and cake boxes by 25 Oct.' };
  }
  return {
    type: 'text',
    text: 'I can help with stock levels, reorders, sales trends, margins and festival planning. Try “What is low on stock?” or “Which items lose money?”.',
  };
}
