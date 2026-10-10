// "What I'd do today" suggestions, shown on the Dashboard panel (top one only)
// and in the pinned "Today's advice" chat in AI Advisor (all of them).
// Each item: { id, tone, tag, title, body, action, ask } — `ask` is the question
// sent to the advisor when the action button is pressed.
import { stockStatus, suggestedQty } from '../store/AppStore';
import { UPCOMING } from '../data/config';
import { daysBetween, localToday, rm2, shortDate } from './format';

export function buildAdvice(store) {
  const { products, reorder, dismissedRecs } = store;
  const urgency = (a, b) => a.stock / a.min - b.stock / b.min;
  const items = [];

  // 1. Buy from suppliers, most urgent first.
  reorder
    .filter((p) => p.supplier !== 'Own kitchen')
    .sort(urgency)
    .forEach((p) => {
      const out = stockStatus(p) === 'out';
      const qty = suggestedQty(p);
      items.push({
        id: p.id,
        tone: out ? 'red' : 'amber',
        tag: out ? 'Out of stock' : 'Running low',
        title: `Reorder ${p.name} today`,
        body: `${out ? `You’ve run out of ${p.name}.` : `Only ${p.stock} ${p.unit} left — your minimum is ${p.min} ${p.unit}.`} Order ${qty} ${p.unit} from ${p.supplier} (≈ ${rm2(qty * p.cost)}) so you don’t run out.`,
        action: 'Draft order',
        ask: `Draft a WhatsApp order to ${p.supplier} for ${qty} ${p.unit} of ${p.name}`,
      });
    });

  // 2. Own-kitchen items to bake.
  reorder
    .filter((p) => p.supplier === 'Own kitchen')
    .sort(urgency)
    .forEach((p) => {
      const out = stockStatus(p) === 'out';
      items.push({
        id: p.id,
        tone: out ? 'red' : 'amber',
        tag: out ? 'Out of stock' : 'Running low',
        title: `Bake more ${p.name}`,
        body: `${out ? `${p.name} is sold out.` : `Only ${p.stock} ${p.unit} left.`} Bake ${suggestedQty(p)} ${p.unit} before tomorrow — weekend orders are busy.`,
        action: 'Plan the bake',
        ask: `How many ${p.name} should I bake for tomorrow?`,
      });
    });

  // 3. Sellable stock that expires within 3 days.
  products
    .filter((p) => p.price && p.stock > 0 && p.expiry && daysBetween(localToday(), p.expiry) >= 0 && daysBetween(localToday(), p.expiry) <= 3)
    .forEach((p) => {
      items.push({
        id: `expiry-${p.id}`,
        tone: 'amber',
        tag: 'Expiring soon',
        title: `Discount ${p.name}`,
        body: `${p.stock} ${p.unit} expire on ${shortDate(p.expiry)}. 20% off (${rm2(p.price)} → ${rm2(p.price * 0.8)}) helps sell them before then.`,
        action: 'Write a promo',
        ask: `Write a WhatsApp promo for ${p.name} at 20% off`,
      });
    });

  // 4. Next festival.
  const festival = UPCOMING.find((u) => u.title === 'Deepavali');
  if (festival) {
    items.push({
      id: 'festival-deepavali',
      tone: 'indigo',
      tag: 'Coming up',
      title: `Prepare for ${festival.title}`,
      body: `${festival.title} is on ${festival.date}. Orders usually jump in the 2 weeks before, so restock flour, butter, sugar and cake boxes by 25 Oct (payday).`,
      action: 'Make a plan',
      ask: `Should I stock up for ${festival.title}?`,
    });
  }

  return items.filter((a) => !dismissedRecs.includes(a.id));
}
