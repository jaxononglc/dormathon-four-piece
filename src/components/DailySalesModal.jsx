import { useMemo, useRef, useState } from 'react';
import { Receipt, ChevronLeft, ChevronRight, CalendarDays, Search, Check, Minus, Plus, CircleDashed, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import { useStore, dayTotals } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { TODAY, CATEGORIES } from '../data/mockData';
import { addDays, dayLabel, dayNum, dayShort, rm, rm2, weekStart } from '../lib/format';

export default function DailySalesModal({ onClose, initialDate = TODAY }) {
  const { products, productsById, sales, dispatch } = useStore();
  const toast = useToast();
  const dateInput = useRef(null);

  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState(() => ({ ...(sales[initialDate] || {}) }));
  const [query, setQuery] = useState('');
  const [onlySold, setOnlySold] = useState(false);

  const saved = sales[date] || {};
  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(clean(saved));
  const isToday = date === TODAY;

  function clean(lines) {
    return Object.fromEntries(Object.entries(lines).filter(([, u]) => u > 0).sort());
  }

  function goTo(next) {
    if (next > TODAY || next === date) return;
    if (dirty && !window.confirm('You have unsaved sales for this day. Discard them?')) return;
    setDate(next);
    setDraft({ ...(sales[next] || {}) });
  }

  // What can be sold on this day = stock now + what this day already took out.
  const available = (p) => p.stock + (saved[p.id] || 0);

  const setUnits = (p, value) => {
    const n = Math.max(0, Math.min(available(p), Math.floor(Number(value) || 0)));
    setDraft((d) => ({ ...d, [p.id]: n }));
  };

  const sellable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.price != null)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .filter((p) => !onlySold || (draft[p.id] || 0) > 0);
  }, [products, query, onlySold, draft]);

  const groups = [...CATEGORIES].reverse().map((c) => ({ category: c, items: sellable.filter((p) => p.category === c).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);

  const totals = dayTotals(draft, productsById);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));

  function save() {
    dispatch({ type: 'saveSales', date, lines: draft });
    toast(`Saved ${totals.units} units (${rm2(totals.sales)}) for ${isToday ? 'today' : dayLabel(date)}`);
    onClose();
  }

  let status;
  if (dirty) status = <span className="chip chip--amber"><CircleDashed size={14} />Unsaved changes</span>;
  else if (Object.keys(clean(saved)).length) status = <span className="chip chip--green"><CheckCircle2 size={14} />Saved · {rm(dayTotals(saved, productsById).sales)}</span>;
  else status = <span className="chip chip--amber"><CircleDashed size={14} />Nothing entered yet</span>;

  return (
    <Modal
      className="sales-modal"
      title="Record daily sales"
      subtitle="Type how many of each product you sold. Stock updates when you save."
      icon={<Receipt size={22} />}
      onClose={onClose}
      width={1100}
      footer={
        <>
          <div className="sales-totals">
            <span>Units <b>{totals.units}</b></span>
            <span>Sales <b>{rm2(totals.sales)}</b></span>
            <span>Profit <b className="text-green">{rm2(totals.profit)}</b></span>
          </div>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={!dirty}>
            <Check size={18} strokeWidth={2.5} />
            Save sales for {isToday ? 'today' : dayLabel(date)}
          </button>
        </>
      }
    >
      <div className="sales-dates">
        <div className="sales-dates__controls">
          <div className="day-stepper">
            <button className="icon-btn icon-btn--sm" onClick={() => goTo(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
            <b>{isToday ? `Today, ${dayLabel(date)}` : dayLabel(date)}</b>
            <button className="icon-btn icon-btn--sm" onClick={() => goTo(addDays(date, 1))} disabled={date >= TODAY} aria-label="Next day"><ChevronRight size={16} /></button>
          </div>
          <button className="btn btn--outline btn--sm" onClick={() => {
            const el = dateInput.current;
            if (el?.showPicker) el.showPicker(); else el?.focus();
          }}>
            <CalendarDays size={16} />Pick a date
          </button>
          <input
            ref={dateInput}
            type="date"
            className="visually-hidden"
            max={TODAY}
            value={date}
            onChange={(e) => e.target.value && goTo(e.target.value)}
            tabIndex={-1}
          />
          {status}
        </div>
        <div className="week-strip">
          {week.map((d) => {
            const t = dayTotals(sales[d], productsById);
            const future = d > TODAY;
            const recorded = t.units > 0;
            return (
              <button
                key={d}
                className={`day-chip${d === date ? ' day-chip--selected' : ''}`}
                disabled={future}
                onClick={() => goTo(d)}
              >
                <span className="day-chip__day">{d === TODAY ? 'Today' : dayShort(d)}</span>
                <span className="day-chip__num">{dayNum(d)}</span>
                <span className={`day-chip__status ${future ? '' : recorded ? 'text-green' : 'text-amber'}`}>
                  {future ? '—' : recorded ? rm(t.sales) : 'Missing'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="modal__body sales-body">
        <div className="sales-tools">
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product…" />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={onlySold} onChange={(e) => setOnlySold(e.target.checked)} />
            Only show items with sales
          </label>
        </div>

        <div className="table-wrap">
          <table className="table sales-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="center">Units sold</th>
                <th className="right">Price each</th>
                <th className="right">Sales</th>
                <th className="right">Stock after</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={5} className="empty">No products match.</td></tr>
              )}
              {groups.map((g) => (
                <GroupRows key={g.category} group={g} draft={draft} available={available} setUnits={setUnits} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function GroupRows({ group, draft, available, setUnits }) {
  return (
    <>
      <tr className="group-row"><td colSpan={5}>{group.category}</td></tr>
      {group.items.map((p) => {
        const units = draft[p.id] || 0;
        const avail = available(p);
        return (
          <tr key={p.id} className={units > 0 ? 'row--active' : ''}>
            <td>
              <div className="cell-title">{p.name}</div>
              <div className="cell-sub mono">{p.sku} · {avail} available</div>
            </td>
            <td className="center">
              <div className={`stepper${units > 0 ? ' stepper--active' : ''}${avail === 0 ? ' stepper--disabled' : ''}`}>
                <button onClick={() => setUnits(p, units - 1)} disabled={units === 0} aria-label={`Fewer ${p.name}`}><Minus size={14} /></button>
                <input
                  inputMode="numeric"
                  value={units}
                  disabled={avail === 0}
                  onChange={(e) => setUnits(p, e.target.value.replace(/\D/g, ''))}
                  onFocus={(e) => e.target.select()}
                  aria-label={`Units of ${p.name} sold`}
                />
                <button onClick={() => setUnits(p, units + 1)} disabled={units >= avail} aria-label={`More ${p.name}`}><Plus size={14} /></button>
              </div>
            </td>
            <td className="right muted">{rm2(p.price)}</td>
            <td className="right">{units > 0 ? <b>{rm2(units * p.price)}</b> : <span className="dash">—</span>}</td>
            <td className={`right ${units > 0 ? 'strong' : 'muted'}`}>{avail - units}</td>
          </tr>
        );
      })}
    </>
  );
}
