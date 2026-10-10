import { useState } from 'react';
import { History, PackagePlus, PencilLine, ShoppingBag } from 'lucide-react';
import Modal from './Modal';
import { useStore } from '../store/AppStore';
import { dayLabel, localToday, parseISO, rm2, toISO } from '../lib/format';

const KIND = {
  created: { icon: PackagePlus, title: 'Added to inventory' },
  edit: { icon: PencilLine, title: 'Edited' },
  sale: { icon: ShoppingBag, title: 'Sold' },
};
const FILTERS = { all: 'All', stock: 'Stock changes', sales: 'Sales' };
const signed = (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
const time = (at) => new Date(at).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });

// History of one product: logged changes (lib/stockLog.js) plus its daily sales.
export default function StockLogModal({ product: p, onClose }) {
  const { stockLog = [], sales } = useStore();
  const [filter, setFilter] = useState('all');

  const logged = stockLog
    .filter((l) => l.productId === p.id && KIND[l.kind]) // skips kinds no longer shown (old 'adjust')
    .map((l) => ({ ...l, day: toISO(new Date(l.at)), sort: l.at }));
  const sold = Object.entries(sales)
    .filter(([, lines]) => lines[p.id] > 0)
    .map(([date, lines]) => ({
      id: `sale-${date}`, kind: 'sale', day: date, delta: -lines[p.id],
      // Daily records have no time; list them at the end of their day.
      sort: parseISO(date).getTime() + 86_399_000,
      note: p.price ? `${lines[p.id]} ${p.unit} × ${rm2(p.price)} = ${rm2(lines[p.id] * p.price)}` : `${lines[p.id]} ${p.unit}`,
    }));
  const entries = [...(filter !== 'sales' ? logged : []), ...(filter !== 'stock' ? sold : [])].sort((a, b) => b.sort - a.sort);

  const days = [];
  for (const e of entries) {
    if (days[days.length - 1]?.day !== e.day) days.push({ day: e.day, items: [] });
    days[days.length - 1].items.push(e);
  }
  const today = localToday();

  return (
    <Modal
      title={`${p.name} — log`}
      subtitle={`Now ${p.stock} ${p.unit} in stock · minimum ${p.min} ${p.unit}`}
      icon={<History size={22} />}
      onClose={onClose}
      width={560}
      className="log-modal"
    >
      <div className="modal__body">
        <div className="segmented log-filter">
          {Object.entries(FILTERS).map(([k, label]) => (
            <button key={k} className={filter === k ? 'is-active' : ''} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        {days.length === 0 && (
          <p className="muted small log-empty">
            {filter === 'sales' ? 'No sales recorded for this item.' : 'No changes recorded yet. Edits made from now on will show up here.'}
          </p>
        )}
        {days.map(({ day, items }) => (
          <section key={day} className="log-day">
            <div className="eyebrow">{day === today ? 'Today' : dayLabel(day)}</div>
            {items.map((e) => {
              const { icon: Icon, title } = KIND[e.kind];
              return (
                <div key={e.id} className={`log-row log-row--${e.kind}`}>
                  <span className="log-row__icon"><Icon size={15} /></span>
                  <div className="log-row__main">
                    <div className="cell-title">{e.kind === 'sale' ? `${title} ${-e.delta} ${p.unit}` : title}</div>
                    <div className="cell-sub">{e.kind === 'sale' ? 'Daily sales record' : time(e.at)}{e.note && e.note !== title && e.kind !== 'created' ? ` · ${e.note}` : ''}</div>
                  </div>
                  <div className="log-row__qty">
                    {e.delta !== 0 && <span className={`log-delta ${e.delta > 0 ? 'log-delta--up' : 'log-delta--down'}`}>{signed(e.delta)}</span>}
                    {e.stockAfter != null && <span className="cell-sub">→ {e.stockAfter} {p.unit}</span>}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Modal>
  );
}
