// Gemini for the AI Advisor. The request is built here (with live store data) and
// sent through POST /api/ai, which adds the API key on the server (server/api.js),
// so the key never reaches the browser.
import { stockStatus, suggestedQty } from '../store/AppStore';
import { UPCOMING, MARGIN_TARGET } from '../data/config';
import { addDays, dayShort, localToday, longDate, mondayOf } from './format';
import { api } from './api';

// A compact snapshot of the live store so answers match what the app shows.
function shopContext(store) {
  const { products, salesFor, reorder, shop } = store;
  const today = localToday();
  const monday = mondayOf(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    .filter((d) => d <= today)
    .map((d) => `${dayShort(d)} ${d}: RM ${salesFor(d).sales.toFixed(0)}`)
    .join(', ');
  const rows = products
    .map((p) => {
      const margin = p.price ? ` margin ${Math.round(((p.price - p.cost) / p.price) * 100)}%` : '';
      return `- ${p.name} [${p.category}] stock ${p.stock} ${p.unit} (min ${p.min}, ${stockStatus(p)}), cost RM ${p.cost.toFixed(2)}, ${p.price ? `price RM ${p.price.toFixed(2)}` : 'not sold'}${margin}, supplier ${p.supplier}${p.expiry ? `, expires ${p.expiry}` : ''}`;
    })
    .join('\n');
  const restock = reorder.map((p) => `${p.name}: order ${suggestedQty(p)} ${p.unit} ≈ RM ${(suggestedQty(p) * p.cost).toFixed(2)}`).join('; ');

  return `You are Bijak Advisor, the AI assistant inside "Bijak AI", an inventory and sales app for small Malaysian businesses.
You are talking to ${shop.owner}, owner of ${shop.name} (${shop.type}). Today is ${today} (${longDate(today).split(',')[0]}).

Rules:
- Answer in the same language the user writes in (English, Bahasa Melayu or Chinese).
- Be short and practical: 2–5 sentences or a few bullet points. Plain text, no markdown tables or headings.
- Use RM for money. Only use numbers from the data below; if something is not in the data, say so instead of guessing.
- Margin target is ${Math.round(MARGIN_TARGET * 100)}%. Upcoming: ${UPCOMING.map((u) => `${u.title} ${u.date}`).join(', ')}.

Sales this week so far (RM 0 = not recorded yet): ${week}.
Items needing restock: ${restock || 'none'}.
Inventory:
${rows}`;
}

/**
 * @param {{role: 'user'|'ai', text?: string}[]} history  chat so far, oldest first
 * @param {object} store  value from useStore()
 * @returns {Promise<string>}
 */
export async function askGemini(history, store) {
  // Gemini expects alternating user/model turns starting with the user.
  const contents = history
    .filter((m) => m.text)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
    .slice(-12); // keep requests small
  while (contents.length && contents[0].role !== 'user') contents.shift();

  const { text } = await api('POST', '/ai', { system: shopContext(store), contents });
  return text;
}
