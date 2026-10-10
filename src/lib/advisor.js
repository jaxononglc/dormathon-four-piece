// Mock "AI". Picks a canned answer by keyword and fills it with live store data,
// so replies stay consistent with what the rest of the app shows.
import { stockStatus, suggestedQty } from '../store/AppStore';
import { rm, rm2 } from './format';

export function advisorReply(text, store) {
  const q = text.toLowerCase();
  const { reorder, products, salesFor } = store;

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
  if (/(deepavali|festival|plan)/.test(q)) {
    return { type: 'text', text: 'Deepavali is on 8 Nov. Orders usually jump in the 2 weeks before festivals, so restock flour, butter, sugar and cake boxes by 25 Oct. Connect Gemini for a detailed plan.' };
  }
  return {
    type: 'text',
    text: 'I can help with stock levels, reorders, sales trends, margins and festival planning. Try “What is low on stock?” or “Which items lose money?”.',
  };
}
