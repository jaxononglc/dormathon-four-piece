// Gemini client for the AI Advisor.
//
// ⚠️ There is no backend, so the API key is bundled into the front end and anyone
// who opens the site can read it in DevTools. Fine for local demos; before
// deploying publicly, move this call behind a small server/serverless function.
// TODO(backend): POST /api/advisor { messages } and keep the key on the server.
import { stockStatus, suggestedQty } from '../store/AppStore';
import { SHOP, TODAY, UPCOMING, MARGIN_TARGET } from '../data/mockData';
import { addDays, dayShort } from './format';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.8-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const geminiEnabled = Boolean(API_KEY);

// A compact snapshot of the live store so answers match what the app shows.
function shopContext(store) {
  const { products, salesFor, reorder } = store;
  const week = Array.from({ length: 6 }, (_, i) => addDays('2026-10-05', i))
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
You are talking to ${SHOP.owner}, owner of ${SHOP.name} (${SHOP.type}). Today is ${TODAY} (Saturday).

Rules:
- Answer in the same language the user writes in (English, Bahasa Melayu or Chinese).
- Be short and practical: 2–5 sentences or a few bullet points. Plain text, no markdown tables or headings.
- Use RM for money. Only use numbers from the data below; if something is not in the data, say so instead of guessing.
- Margin target is ${Math.round(MARGIN_TARGET * 100)}%. Upcoming: ${UPCOMING.map((u) => `${u.title} ${u.date}`).join(', ')}.

Sales this week: ${week} (Sunday not recorded yet).
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
  if (!API_KEY) throw new Error('Missing VITE_GEMINI_API_KEY');

  // Gemini expects alternating user/model turns starting with the user.
  const contents = history
    .filter((m) => m.text)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
    .slice(-12); // keep requests small
  while (contents.length && contents[0].role !== 'user') contents.shift();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: shopContext(store) }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`);

  const text = (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned an empty answer');
  return text;
}
