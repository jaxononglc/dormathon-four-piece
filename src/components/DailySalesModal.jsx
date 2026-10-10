import { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, ChevronLeft, ChevronRight, CalendarDays, Search, Check, Minus, Plus, CircleDashed, CheckCircle2, Camera, Image as ImageIcon, Loader2, ScanText, X, Pencil, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { useStore, dayTotals, newSaleId } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { addDays, dayLabel, dayNum, dayShort, localToday, parseISO, rm, rm2 } from '../lib/format';
import { scanSalesRecord, SURE } from '../lib/scan';

// A scanned row is highlighted when the AI was unsure, or the paper wants more than the stock has.
const needsCheck = (m) => m.confidence < SURE || m.units < m.wanted || m.damaged < m.wantedDam;
const nonZero = (lines) => Object.fromEntries(Object.entries(lines).filter(([, u]) => u > 0));
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// One record per day: units sold (Sales) and damaged goods ("DamageLog"). The form
// starts at 0; a day that is already saved shows its numbers locked until Edit.
export default function DailySalesModal({ onClose, initialDate = localToday() }) {
  const { products, productsById, sales, salesRecords, damage, categories, dispatch } = useStore();
  const toast = useToast();
  const photoInput = useRef(null); // any photo (gallery / file picker)
  const cameraInput = useRef(null); // opens the camera straight away on a phone

  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState({}); // units sold
  const [damDraft, setDamDraft] = useState({}); // units damaged
  const [editingDay, setEditingDay] = useState(false);
  const [query, setQuery] = useState('');
  const [onlySold, setOnlySold] = useState(false);
  // Last photo read by AI: { result, photo (object URL), marks: { [productId]: { rawText, confidence, wanted, units } } }
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(''); // "Reading the sheet 40%" while the photo is read

  // Free the photo when it is replaced or the modal closes.
  const photoUrl = scan?.photo;
  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  const saved = sales[date] || {};
  const dayRecord = salesRecords.find((r) => r.date === date) || null;
  const savedDamage = damage[date] || {};
  const daySaved = Boolean(dayRecord) || Object.keys(savedDamage).length > 0;
  const editing = daySaved && editingDay;
  const locked = daySaved && !editingDay;
  // A saved day shows its saved numbers (read-only) until Edit is pressed.
  const shown = locked ? dayRecord?.lines || {} : draft;
  const shownDam = locked ? savedDamage : damDraft;
  // What the day had before this edit; those units count as available again.
  const base = editing ? dayRecord?.lines || {} : {};
  const baseDam = editing ? savedDamage : {};
  const entered = nonZero(draft);
  const enteredDam = nonZero(damDraft);
  const salesChanged = !same(entered, base);
  const damageChanged = !same(enteredDam, baseDam);
  const dirty = salesChanged || damageChanged;
  const isToday = date === localToday();
  const dayName = isToday ? 'today' : dayLabel(date);

  const discardOk = () => !dirty || window.confirm('You have unsaved changes. Discard them?');

  // Back to an empty form.
  function reset() {
    setEditingDay(false);
    setDraft({});
    setDamDraft({});
    setScan(null);
    setOnlySold(false);
  }

  function goTo(next) {
    if (next > localToday() || next === date || !discardOk()) return;
    setDate(next);
    reset();
  }

  function startEdit() {
    setEditingDay(true);
    setDraft({ ...(dayRecord?.lines || {}) });
    setDamDraft({ ...savedDamage });
    setScan(null);
    setQuery('');
    setOnlySold(true);
  }

  // Stock can change while the modal is open (other screens, other devices), so this
  // always reads the live stock. While editing, the day's own units count as available.
  const available = (p) => p.stock + (base[p.id] || 0) + (baseDam[p.id] || 0);

  // Sold + damaged can't be more than what is available.
  // Backspace on the last digit leaves 0; the next digit typed replaces it ("05" → 5).
  const clamp = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  const setUnits = (p, value) => {
    if (locked || p.price == null) return; // items without a selling price cannot be sold
    setDraft((d) => ({ ...d, [p.id]: clamp(value, available(p) - (damDraft[p.id] || 0)) }));
  };
  const setDamaged = (p, value) => {
    if (locked) return;
    setDamDraft((d) => ({ ...d, [p.id]: clamp(value, available(p) - (draft[p.id] || 0)) }));
  };

  const sellable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      // Everything still in stock in Inventory, plus anything already on this day's record
      // (a product that sold out today must stay visible on today's saved record).
      .filter((p) => p.stock > 0 || p.id in shown || p.id in shownDam)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      // A product stays listed once it has been touched, so clearing it to 0 doesn't hide the row.
      .filter((p) => !onlySold || p.id in shown || p.id in shownDam);
  }, [products, query, onlySold, shown, shownDam]);

  // Baked goods first (they are what gets sold), then the rest in saved order.
  const order = ['Baked goods', ...categories.filter((c) => c !== 'Baked goods')];
  const groups = order.map((c) => ({ category: c, items: sellable.filter((p) => p.category === c).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);

  // Fill the Units sold and Damaged boxes from a scan, starting from 0. On a day that is
  // already saved, the paper replaces that day's record (edit mode). Nothing is saved
  // until the user presses Save.
  function applyScan(result, photo, forDate) {
    const existing = salesRecords.find((r) => r.date === forDate) || null;
    const oldDam = damage[forDate] || {};
    const own = existing?.lines || {};
    setEditingDay(Boolean(existing) || Object.keys(oldDam).length > 0);
    const next = {};
    const nextDam = {};
    const marks = {};
    for (const it of result.items) {
      const p = productsById[it.productId];
      if (!p) continue;
      // What is on the shelf for that day: the stock now plus what that day already took out.
      const avail = p.stock + (own[p.id] || 0) + (oldDam[p.id] || 0);
      const units = p.price == null ? 0 : Math.min(it.units, avail); // items that are not for sale can only be damaged
      const damaged = Math.min(it.damaged || 0, avail - units); // sold + damaged can't exceed what there is
      next[p.id] = units;
      nextDam[p.id] = damaged;
      marks[p.id] = { rawText: it.rawText, confidence: it.confidence, wanted: it.units, units, wantedDam: it.damaged || 0, damaged, avail };
    }
    setDate(forDate);
    setDraft(next);
    setDamDraft(nextDam);
    setScan({ result, photo, marks });
    setQuery('');
    setOnlySold(Object.keys(marks).length > 0);
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same photo can be picked again
    if (!file || !discardOk()) return;
    setScanning(true);
    setScanStep('Preparing photo');
    try {
      const result = await scanSalesRecord(file, products, localToday(), (pct, step) => setScanStep(pct ? `${step} ${pct}%` : step));
      applyScan(result, URL.createObjectURL(file), date);
      const n = result.items.length;
      const dmg = result.items.filter((i) => i.damaged > 0).length;
      toast(n ? `Read ${n} product${n === 1 ? '' : 's'}${dmg ? ` (${dmg} with damaged goods)` : ''} from the photo. Check them, then save` : 'No sales found in the photo');
    } catch (err) {
      toast(`Could not read the photo: ${err.message}`);
    } finally {
      setScanning(false);
      setScanStep('');
    }
  }

  const totals = dayTotals(shown, productsById);
  const damagedUnits = Object.values(shownDam).reduce((s, u) => s + (u || 0), 0);
  // The day row shows the whole month of the selected date; the stepper above moves
  // a month at a time (to the last day you can pick in that month).
  const monthStart = `${date.slice(0, 7)}-01`;
  const [year, month] = date.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));
  const monthLabel = parseISO(date).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
  const prevMonthDay = addDays(monthStart, -1);
  const nextMonthStart = addDays(monthStart, daysInMonth);
  const nextMonthDay = nextMonthStart > localToday() ? null
    : [addDays(nextMonthStart, new Date(year, month + 1, 0).getDate() - 1), localToday()].sort()[0];

  // The month is one scrolling row (about 4 days visible on mobile, 7 on desktop)
  // with ← / → buttons.
  const stripRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ prev: false, next: false });
  const updateArrows = () => {
    const el = stripRef.current;
    if (!el) return;
    setCanScroll({ prev: el.scrollLeft > 2, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  const scrollDays = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };
  // Keep the selected day in view (centred) when the date changes or the modal opens.
  useEffect(() => {
    const el = stripRef.current;
    const chip = el?.querySelector('.day-chip--selected');
    if (chip) el.scrollLeft = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [date]);

  // Saved to the database through the store (addSale / editSale / saveDamage in lib/api.js).
  function save() {
    if (salesChanged) {
      if (dayRecord) dispatch({ type: 'editSale', id: dayRecord.id, lines: entered });
      else dispatch({ type: 'addSale', sale: { id: newSaleId(), date, at: Date.now(), lines: entered } });
    }
    if (damageChanged) dispatch({ type: 'saveDamage', date, lines: enteredDam });
    const damNote = damagedUnits ? `, ${damagedUnits} damaged` : '';
    toast(editing ? `Updated ${dayName}${damNote}. Stock adjusted` : `Saved ${totals.units} sold (${rm2(totals.sales)})${damNote} for ${dayName}`);
    reset();
  }

  function deleteRecord() {
    if (!window.confirm(`Delete all sales and damaged goods for ${dayName}? The units go back into stock.`)) return;
    if (dayRecord) dispatch({ type: 'editSale', id: dayRecord.id, lines: {} });
    if (Object.keys(savedDamage).length) dispatch({ type: 'saveDamage', date, lines: {} });
    toast(`Deleted ${dayName}'s record. Stock returned`);
    reset();
  }

  const savedSales = dayTotals(saved, productsById).sales;
  let status;
  if (dirty) status = <span className="chip chip--amber"><CircleDashed size={14} />Not saved yet</span>;
  else if (daySaved) status = <span className="chip chip--green"><CheckCircle2 size={14} />Recorded · {rm(savedSales)}</span>;
  else status = <span className="chip chip--amber"><CircleDashed size={14} />Nothing recorded yet</span>;

  return (
    <Modal
      className="sales-modal"
      title="Record daily sales"
      subtitle="Enter what you sold and save. Each day has one record, and stock updates right away."
      icon={<Receipt size={22} />}
      actions={
        <>
          {/* Phone / tablet: the button opens the camera. Computer: it opens the file picker. */}
          <button
            className="btn btn--outline btn--sm"
            onClick={() => (window.matchMedia('(pointer: coarse)').matches ? cameraInput : photoInput).current?.click()}
            disabled={scanning}
            title="Take a photo of your sales sheet. It is read on this device."
          >
            {scanning ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
            <span className="hide-sm">{scanning ? `${scanStep || 'Reading photo'}…` : 'Scan paper record'}</span>
          </button>
          {/* Phone only: pick a photo that is already in the gallery */}
          <button className="btn btn--outline btn--sm scan-gallery" onClick={() => photoInput.current?.click()} disabled={scanning} title="Choose a photo from your gallery" aria-label="Choose a photo from your gallery">
            <ImageIcon size={16} />
          </button>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={onPhoto} tabIndex={-1} />
          <input ref={photoInput} type="file" accept="image/*,.heic,.heif" className="visually-hidden" onChange={onPhoto} tabIndex={-1} />
        </>
      }
      onClose={onClose}
      width={1100}
      footer={
        <>
          <div className="sales-totals">
            <span>Units <b>{totals.units}</b></span>
            <span>Damaged <b className={damagedUnits ? 'text-red' : ''}>{damagedUnits}</b></span>
            <span>Sales <b>{rm2(totals.sales)}</b></span>
            <span>Profit <b className="text-green">{rm2(totals.profit)}</b></span>
          </div>
          {editing ? (
            <>
              <button className="btn btn--ghost text-red" onClick={deleteRecord}><Trash2 size={16} />Delete day’s record</button>
              <button className="btn btn--ghost" onClick={() => discardOk() && reset()}>Cancel edit</button>
              <button className="btn btn--primary" onClick={save} disabled={!dirty}>
                <Check size={18} strokeWidth={2.5} />
                Save changes
              </button>
            </>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={() => discardOk() && onClose()}>Close</button>
              {/* A saved day has one record: Edit replaces Save. */}
              {daySaved ? (
                <button className="btn btn--primary" onClick={startEdit}>
                  <Pencil size={18} strokeWidth={2.5} />
                  Edit sale for {dayName}
                </button>
              ) : (
                <button className="btn btn--primary" onClick={save} disabled={!dirty}>
                  <Check size={18} strokeWidth={2.5} />
                  Save sale for {dayName}
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="sales-dates">
        <div className="sales-dates__controls">
          <div className="day-stepper">
            <button className="icon-btn icon-btn--sm" onClick={() => goTo(prevMonthDay)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            {/* Tap the month to pick any date (the native date picker sits invisibly on top). */}
            <label className="day-stepper__pick" title="Pick a date">
              <b>{monthLabel}</b>
              <CalendarDays size={15} />
              <input
                type="date"
                max={localToday()}
                value={date}
                onChange={(e) => e.target.value && goTo(e.target.value)}
                aria-label="Pick a date"
              />
            </label>
            <button className="icon-btn icon-btn--sm" onClick={() => goTo(nextMonthDay)} disabled={!nextMonthDay} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
          {status}
        </div>
        <div className="week-scroller">
        <button className="icon-btn week-scroller__arrow" onClick={() => scrollDays(-1)} disabled={!canScroll.prev} aria-label="Earlier days">
          <ChevronLeft size={18} />
        </button>
        <div className="week-strip" ref={stripRef} onScroll={updateArrows}>
          {monthDays.map((d) => {
            const t = dayTotals(sales[d], productsById);
            const future = d > localToday();
            const recorded = t.units > 0;
            return (
              <button
                key={d}
                className={`day-chip${d === date ? ' day-chip--selected' : ''}`}
                disabled={future}
                onClick={() => goTo(d)}
              >
                <span className="day-chip__day">{d === localToday() ? 'Today' : dayShort(d)}</span>
                <span className="day-chip__num">{dayNum(d)}</span>
                <span className={`day-chip__status ${future ? '' : recorded ? 'text-green' : 'text-amber'}`}>
                  {future ? '—' : recorded ? rm(t.sales) : 'Missing'}
                </span>
              </button>
            );
          })}
        </div>
        <button className="icon-btn week-scroller__arrow" onClick={() => scrollDays(1)} disabled={!canScroll.next} aria-label="Later days">
          <ChevronRight size={18} />
        </button>
        </div>
      </div>

      <div className="modal__body sales-body">
        {editing && (
          <div className="edit-note">
            <Pencil size={16} />
            <span>
              Editing the sales for <b>{dayName}</b>. Change the numbers (0 removes a product) and save. Stock moves by the difference.
            </span>
          </div>
        )}
        {locked && (
          <div className="edit-note edit-note--saved">
            <CheckCircle2 size={16} />
            <span>
              Sales for <b>{dayName}</b> are saved ({rm2(savedSales)}{Object.keys(savedDamage).length ? `, ${damagedUnits} damaged` : ''}). Press <b>Edit sale</b> to change them.
            </span>
          </div>
        )}

        <div className="sales-tools">
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product…" />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={onlySold} onChange={(e) => setOnlySold(e.target.checked)} />
            Only show items with sales or damage
          </label>
        </div>

        {scan && (
          <ScanNote
            key={scan.photo}
            scan={scan}
            date={date}
            savedSales={savedSales}
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
                <th className="center">Damaged</th>
                <th className="right">Price each</th>
                <th className="right">Sales</th>
                <th className="right">Stock after</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={6} className="empty">No products in stock match.</td></tr>
              )}
              {groups.map((g) => (
                <GroupRows key={g.category} group={g} draft={shown} damaged={shownDam} locked={locked} available={available} setUnits={setUnits} setDamaged={setDamaged} marks={scan?.marks} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function ScanNote({ scan, date, savedSales, onMoveDate, onClose }) {
  const { result, photo, marks } = scan;
  const filled = Object.keys(marks).length;
  const toCheck = Object.values(marks).filter(needsCheck).length;
  const otherDay = result.date && result.date !== date && result.date <= localToday() ? result.date : null;
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
        {savedSales > 0 && (
          <span className="text-amber">This day already has {rm(savedSales)} saved. Saving replaces it with the numbers from the paper.</span>
        )}
        {result.unmatched.length > 0 && (
          <span className="muted">Could not match: {result.unmatched.map((t) => `“${t}”`).join(', ')}. Add these by hand.</span>
        )}
        {otherDay && (
          <span>
            The paper is dated <b>{dayLabel(otherDay)}</b>.{' '}
            <button className="link-btn" onClick={() => onMoveDate(otherDay)}>Record it on that day instead</button>
          </span>
        )}
        {result.date > localToday() && <span className="text-amber">The paper is dated {result.date}, which is in the future. Check the date.</span>}
      </div>
      <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Hide scan result"><X size={16} /></button>
    </div>
  );
}

function GroupRows({ group, draft, damaged, locked, available, setUnits, setDamaged, marks }) {
  return (
    <>
      <tr className="group-row"><td colSpan={6}>{group.category}</td></tr>
      {group.items.map((p) => {
        const units = draft[p.id] || 0;
        const dmg = damaged[p.id] || 0;
        const avail = available(p);
        const left = avail - units - dmg; // what neither box can take any more of
        const mark = marks?.[p.id];
        const check = mark && needsCheck(mark);
        return (
          <tr key={p.id} className={check ? 'row--check' : units > 0 || dmg > 0 ? 'row--active' : ''}>
            <td>
              <div className="cell-title">{p.name}</div>
              <div className="cell-sub mono">{p.sku} · {avail} available</div>
              {mark && (
                <div className={`scan-read${check ? ' text-amber' : ''}`}>
                  Paper: “{mark.rawText}”
                  {mark.units < mark.wanted || mark.damaged < mark.wantedDam
                    ? ` · says ${mark.wanted} sold${mark.wantedDam ? ` + ${mark.wantedDam} damaged` : ''}, only ${mark.avail} in stock`
                    : check ? ' · hard to read, please check' : ''}
                </div>
              )}
            </td>
            <td className="center" data-label="Units sold">
              {/* Ingredients and packaging without a selling price can be damaged, but not sold */}
              <Stepper value={units} max={units + left} locked={locked} disabled={avail === 0 || p.price == null} onChange={(v) => setUnits(p, v)} label={`Units of ${p.name} sold`} />
            </td>
            <td className="center" data-label="Damaged">
              <Stepper value={dmg} max={dmg + left} locked={locked} disabled={avail === 0} onChange={(v) => setDamaged(p, v)} label={`Units of ${p.name} damaged`} tone="damage" />
            </td>
            <td className="right muted" data-label="Price each">{p.price != null ? rm2(p.price) : 'Not for sale'}</td>
            <td className="right" data-label="Sales">{units > 0 && p.price != null ? <b>{rm2(units * p.price)}</b> : <span className="dash">—</span>}</td>
            {/* A saved (locked) day's units are already out of stock. */}
            <td data-label="Stock after" className={`right ${units > 0 || dmg > 0 ? 'strong' : 'muted'}`}>{locked ? avail : left}</td>
          </tr>
        );
      })}
    </>
  );
}

function Stepper({ value, max, locked, disabled, onChange, label, tone }) {
  return (
    <div className={`stepper${value > 0 ? ` stepper--active${tone ? ` stepper--${tone}` : ''}` : ''}${locked || disabled ? ' stepper--disabled' : ''}`}>
      <button onClick={() => onChange(value - 1)} disabled={locked || value === 0} aria-label={`Fewer: ${label}`}><Minus size={14} /></button>
      <input
        inputMode="numeric"
        value={value}
        disabled={locked || disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        onFocus={(e) => e.target.select()}
        aria-label={label}
      />
      <button onClick={() => onChange(value + 1)} disabled={locked || value >= max} aria-label={`More: ${label}`}><Plus size={14} /></button>
    </div>
  );
}
