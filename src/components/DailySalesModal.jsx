import { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, ChevronLeft, ChevronRight, CalendarDays, Search, Check, Minus, Plus, CircleDashed, CheckCircle2, Camera, Loader2, ScanText, X } from 'lucide-react';
import Modal from './Modal';
import { useStore, dayTotals } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { TODAY } from '../data/mockData';
import { addDays, dayLabel, dayNum, dayShort, rm, rm2, weekStart } from '../lib/format';
import { scanSalesRecord, SURE } from '../lib/scan';

export default function DailySalesModal({ onClose, initialDate = TODAY }) {
  const { products, productsById, sales, categories, aiEnabled, dispatch } = useStore();
  const toast = useToast();
  const dateInput = useRef(null);
  const photoInput = useRef(null);

  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState(() => ({ ...(sales[initialDate] || {}) }));
  const [query, setQuery] = useState('');
  const [onlySold, setOnlySold] = useState(false);
  // Last photo read by AI: { result, photo (object URL), marks: { [productId]: { rawText, confidence, wanted, units } } }
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Free the photo when it is replaced or the modal closes.
  const photoUrl = scan?.photo;
  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

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
    setScan(null);
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

  // Baked goods first (they are what gets sold), then the rest in saved order.
  const order = ['Baked goods', ...categories.filter((c) => c !== 'Baked goods')];
  const groups = order.map((c) => ({ category: c, items: sellable.filter((p) => p.category === c).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);

  // Fill the table from a scan. Nothing is saved until the user presses Save.
  function applyScan(result, photo, forDate) {
    const savedFor = sales[forDate] || {};
    const next = forDate === date ? { ...draft } : { ...savedFor };
    const marks = {};
    for (const it of result.items) {
      const p = productsById[it.productId];
      if (!p || p.price == null) continue;
      const units = Math.min(it.units, p.stock + (savedFor[p.id] || 0));
      next[p.id] = units;
      marks[p.id] = { rawText: it.rawText, confidence: it.confidence, wanted: it.units, units };
    }
    setDate(forDate);
    setDraft(next);
    setScan({ result, photo, marks });
    setQuery('');
    setOnlySold(Object.keys(marks).length > 0);
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same photo can be picked again
    if (!file) return;
    setScanning(true);
    try {
      const result = await scanSalesRecord(file, products.filter((p) => p.price != null), TODAY);
      applyScan(result, URL.createObjectURL(file), date);
      const n = result.items.length;
      toast(n ? `Read ${n} product${n === 1 ? '' : 's'} from the photo. Check them, then save` : 'No sales found in the photo');
    } catch (err) {
      toast(`Could not read the photo: ${err.message}`);
    } finally {
      setScanning(false);
    }
  }

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
          <button
            className="btn btn--outline btn--sm scan-btn"
            onClick={() => photoInput.current?.click()}
            disabled={!aiEnabled || scanning}
            title={aiEnabled ? 'Take or upload a photo of a handwritten sales record' : 'Needs Gemini (GEMINI_API_KEY on the server)'}
          >
            {scanning ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
            {scanning ? 'Reading photo…' : 'Scan paper record'}
          </button>
          <input ref={photoInput} type="file" accept="image/*,.heic,.heif" className="visually-hidden" onChange={onPhoto} tabIndex={-1} />
        </div>

        {scan && (
          <ScanNote
            key={scan.photo}
            scan={scan}
            date={date}
            onMoveDate={(d) => applyScan(scan.result, scan.photo, d)}
            onClose={() => setScan(null)}
          />
        )}

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
                <GroupRows key={g.category} group={g} draft={draft} available={available} setUnits={setUnits} marks={scan?.marks} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function ScanNote({ scan, date, onMoveDate, onClose }) {
  const { result, photo, marks } = scan;
  const filled = Object.keys(marks).length;
  const toCheck = Object.values(marks).filter((m) => m.confidence < SURE || m.units < m.wanted).length;
  const otherDay = result.date && result.date !== date && result.date <= TODAY ? result.date : null;
  // Desktop Chrome cannot show HEIC, so fall back to an icon.
  const [noPreview, setNoPreview] = useState(false);
  return (
    <div className="scan-note">
      {noPreview ? (
        <span className="scan-note__photo scan-note__photo--none" title="Preview not available for this photo format"><ScanText size={24} /></span>
      ) : (
        <a href={photo} target="_blank" rel="noreferrer" className="scan-note__photo" title="Open the photo">
          <img src={photo} alt="Scanned sales record" onError={() => setNoPreview(true)} />
        </a>
      )}
      <div className="scan-note__text">
        <b><ScanText size={16} />Filled {filled} product{filled === 1 ? '' : 's'} from the photo</b>
        <span>
          {toCheck > 0 && <span className="text-amber">{toCheck} highlighted row{toCheck === 1 ? '' : 's'} need a check. </span>}
          Compare with the photo, fix anything wrong, then save. Nothing is saved yet.
        </span>
        {result.unmatched.length > 0 && (
          <span className="muted">Could not match: {result.unmatched.map((t) => `“${t}”`).join(', ')}. Add these by hand.</span>
        )}
        {otherDay && (
          <span>
            The paper is dated <b>{dayLabel(otherDay)}</b>.{' '}
            <button className="link-btn" onClick={() => onMoveDate(otherDay)}>Record it on that day instead</button>
          </span>
        )}
        {result.date > TODAY && <span className="text-amber">The paper is dated {result.date}, which is in the future. Check the date.</span>}
      </div>
      <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Hide scan result"><X size={16} /></button>
    </div>
  );
}

function GroupRows({ group, draft, available, setUnits, marks }) {
  return (
    <>
      <tr className="group-row"><td colSpan={5}>{group.category}</td></tr>
      {group.items.map((p) => {
        const units = draft[p.id] || 0;
        const avail = available(p);
        const mark = marks?.[p.id];
        const check = mark && (mark.confidence < SURE || mark.units < mark.wanted);
        return (
          <tr key={p.id} className={check ? 'row--check' : units > 0 ? 'row--active' : ''}>
            <td>
              <div className="cell-title">{p.name}</div>
              <div className="cell-sub mono">{p.sku} · {avail} available</div>
              {mark && (
                <div className={`scan-read${check ? ' text-amber' : ''}`}>
                  Paper: “{mark.rawText}”
                  {mark.units < mark.wanted ? ` · says ${mark.wanted}, only ${avail} in stock` : check ? ' · hard to read, please check' : ''}
                </div>
              )}
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
