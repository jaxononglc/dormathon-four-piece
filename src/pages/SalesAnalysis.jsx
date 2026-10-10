import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { CalendarDays, Receipt, Package, PackageX, LineChart as LineIcon, AlertTriangle, Check, Download } from 'lucide-react';
import KpiCard from '../components/KpiCard';
import { LineChart } from '../components/Charts';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { MARGIN_TARGET } from '../data/config';
import { analyse, PERIODS } from '../lib/analysis';
import { downloadCSV, localToday, pct, rm, rm2, signedPct } from '../lib/format';

const SORTS = { revenue: 'Revenue', units: 'Units', margin: 'Margin' };

// Every number is worked out in code from the store's database data (lib/analysis.js).
export default function SalesAnalysis() {
  const { productsById, products, sales, damage, shop } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // ?period=7d|30d|90d|365d (the Dashboard cards link here with 7d), or
  // ?period=custom&from=yyyy-mm-dd&to=yyyy-mm-dd for a date range picked with the calendar button.
  const today = localToday();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const [from, to] = [params.get('from') || '', params.get('to') || ''];
  const isCustom = params.get('period') === 'custom' && iso.test(from) && iso.test(to) && from <= to && to <= today;
  const period = isCustom ? 'custom' : PERIODS[params.get('period')] ? params.get('period') : '30d';
  const custom = isCustom ? { from, to } : null;
  const setPeriod = (p) => setParams(p === '30d' ? {} : { period: p }, { replace: true });
  const [sort, setSort] = useState('revenue');
  const [done, setDone] = useState({});

  // Date range picker (opens from the calendar button next to 1 week / 1 month / …).
  const [pickOpen, setPickOpen] = useState(false);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const rangeRef = useRef(null);
  useEffect(() => {
    if (!pickOpen) return undefined;
    const close = (e) => { if (!rangeRef.current?.contains(e.target)) setPickOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pickOpen]);
  const togglePicker = () => {
    if (!pickOpen) setDraft({ from: custom?.from || a.start, to: custom?.to || today });
    setPickOpen((o) => !o);
  };
  const draftOk = iso.test(draft.from) && iso.test(draft.to) && draft.from <= draft.to && draft.to <= today;
  const applyRange = () => {
    setParams({ period: 'custom', from: draft.from, to: draft.to }, { replace: true });
    setPickOpen(false);
  };

  const a = useMemo(
    () => analyse(period, today, { sales, damage, products, productsById }, custom),
    [period, from, to, today, sales, damage, products, productsById] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // #top-products scrolls to that card (used by the Dashboard "Best seller" card).
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const header = (
    <header className="topbar sales-head">
      <h1>Sales analysis</h1>
      <div className="topbar__actions">
        <div className="range-wrap" ref={rangeRef}>
          <div className="segmented segmented--dark">
            {Object.entries(PERIODS).map(([k, v]) => (
              <button key={k} className={period === k ? 'is-active' : ''} onClick={() => { setPickOpen(false); setPeriod(k); }}>{v.label}</button>
            ))}
            <button className={`range-btn${isCustom ? ' is-active' : ''}`} onClick={togglePicker} aria-label="Pick a date range" aria-expanded={pickOpen} title="Pick a date range">
              <CalendarDays size={16} />
            </button>
          </div>
          {isCustom && <div className="range-label">{a.range}</div>}
          {pickOpen && (
            <div className="range-pop" role="dialog" aria-label="Pick a date range">
              <label>From
                <input type="date" max={draft.to || today} value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value, to: d.to && e.target.value > d.to ? e.target.value : d.to }))} />
              </label>
              <label>To
                <input type="date" min={draft.from} max={today} value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
              </label>
              <button className="btn btn--primary btn--sm" onClick={applyRange} disabled={!draftOk}>Apply</button>
            </div>
          )}
        </div>
        <button className="btn btn--outline btn--icon" onClick={exportReport} aria-label="Export report" title="Export report"><Download size={18} /></button>
      </div>
    </header>
  );

  function exportReport() {
    downloadCSV(`sales-report-${isCustom ? `${from}_to_${to}` : period}.csv`, [
      [`${shop.name} — Sales report`, a.range],
      [],
      ['Revenue (RM)', a.revenue], ['Units sold', a.unitsSold], ['Gross profit (RM)', a.grossProfit.toFixed(0)], ['Margin', pct(a.margin)],
      ['Damaged units', a.damagedUnits], ['Damaged cost (RM)', a.damagedCost.toFixed(2)],
      [],
      ['Period', 'Revenue (RM)', 'Previous (RM)'],
      ...a.trend.map((t) => [t.label, t.value, t.previous]),
      [],
      ['Product', 'Units', 'Damaged', 'Revenue (RM)', 'Margin'],
      ...top.map((t) => [t.p.name, t.units, t.damaged, t.revenue, pct(t.margin)]),
    ]);
    toast('Report downloaded');
  }

  const top = [...a.topProducts].sort((x, y) => y[sort] - x[sort]);
  const margins = a.marginByProduct;
  const slow = a.slowMovers;
  const tiedUp = slow.reduce((sum, s) => sum + s.p.stock * s.p.cost, 0);
  const vsPrev = (now, prev) => (prev > 0 ? `${signedPct(now / prev - 1)} vs previous` : 'No earlier records');
  const hasTrend = a.trend.some((t) => t.value > 0 || t.previous > 0);

  return (
    <div className="page">
      {header}

      <section className="kpis">
        <KpiCard label="Revenue" value={rm(a.revenue)} icon={Receipt} delta={vsPrev(a.revenue, a.revenuePrev)} tone={a.revenue >= a.revenuePrev ? 'up' : 'down'} />
        <KpiCard label="Units sold" value={a.unitsSold.toLocaleString()} icon={Package} delta={vsPrev(a.unitsSold, a.unitsSoldPrev)} tone={a.unitsSold >= a.unitsSoldPrev ? 'up' : 'down'} />
        <KpiCard
          label="Gross profit"
          value={rm(a.grossProfit)}
          icon={LineIcon}
          delta={`Margin ${pct(a.margin)}${a.revenuePrev > 0 ? ` · ${a.margin >= a.marginPrev ? '+' : '−'}${Math.abs((a.margin - a.marginPrev) * 100).toFixed(1)} pts` : ''}`}
          tone={a.margin >= MARGIN_TARGET ? 'up' : 'down'}
        />
        <KpiCard
          label="Damaged goods"
          value={`${a.damagedUnits} unit${a.damagedUnits === 1 ? '' : 's'}`}
          icon={PackageX}
          delta={a.damagedUnits ? `${rm2(a.damagedCost)} lost` : 'None this period'}
          tone={a.damagedUnits ? 'down' : 'up'}
        />
      </section>

      <section className="card card--pad">
        <div className="card__head">
          <div>
            <h3>Revenue trend</h3>
            <p className="muted small">{a.trendTitle}</p>
          </div>
          <div className="legend">
            <span><i className="legend__line" />This period</span>
            <span><i className="legend__line legend__line--dashed" />Previous period</span>
          </div>
        </div>
        {hasTrend
          ? <LineChart labels={a.trend.map((t) => t.label)} current={a.trend.map((t) => t.value)} previous={a.trend.map((t) => t.previous)} previousLabels={a.trend.map((t) => t.previousLabel)} />
          : <p className="muted empty">No sales recorded in this period.</p>}
      </section>

      <section className="card table-card" id="top-products">
        <div className="card__head card--pad">
          <div>
            <h3>Top products</h3>
            <p className="muted small">Best sellers this period</p>
          </div>
          <select className="input input--sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}
          </select>
        </div>
        <table className="table table--compact top-table">
          <thead>
            <tr><th>#</th><th>Product</th><th>Units</th><th>Damaged</th><th>Revenue</th><th>Margin</th></tr>
          </thead>
          <tbody>
            {top.length === 0 && <tr><td colSpan={6} className="empty">No sales in this period.</td></tr>}
            {top.map((t, i) => {
              const below = t.margin < MARGIN_TARGET;
              return (
                <tr key={t.productId}>
                  <td><span className={`rank${i === 0 ? ' rank--first' : ''}`}>{i + 1}</span></td>
                  <td className="cell-title">{t.p.name}</td>
                  <td data-label="Units">{t.units}</td>
                  <td data-label="Damaged" className={t.damaged ? 'text-red' : 'muted'}>{t.damaged || '—'}</td>
                  <td>{rm(t.revenue)}</td>
                  <td data-label="Margin"><span className={`tag ${below ? 'tag--red' : 'tag--green'}`}>{pct(t.margin)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid-2">
        <section className="card card--pad">
          <div className="card__head">
            <div>
              <h3>Profit margin by product</h3>
              <p className="muted small">How much you keep from every RM 1 sold</p>
            </div>
            <span className="legend"><span><i className="legend__target" />Target {pct(MARGIN_TARGET)}</span></span>
          </div>
          <div className="margins">
            {margins.length === 0 && <p className="muted small">No products sold in this period.</p>}
            {margins.map(({ p, margin: m }) => (
              <div key={p.id} className="margin-row">
                <span className="margin-row__name">{p.name}</span>
                <div className="margin-row__track">
                  <div className={`margin-row__bar${m < MARGIN_TARGET ? ' is-below' : ''}`} style={{ width: `${Math.max(0, Math.min(100, m * 100 / 0.6))}%` }} />
                  <div className="margin-row__target" style={{ left: `${MARGIN_TARGET * 100 / 0.6}%` }} />
                </div>
                <div className="margin-row__val">
                  <b className={m < MARGIN_TARGET ? 'text-red' : ''}>{pct(m)}</b>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card card--pad">
          <div className="card__head">
            <div>
              <h3>Slow movers</h3>
              <p className="muted small">Selling slowly or expiring soon</p>
            </div>
            {slow.length > 0 && <span className="tag tag--amber">{rm(tiedUp)} tied up</span>}
          </div>
          <div className="stack-10">
            {slow.length === 0 && <p className="muted small">Nothing is selling unusually slowly.</p>}
            {slow.map((s) => (
              <div key={s.productId} className="slow-item">
                <span className="icon-tile icon-tile--amber"><AlertTriangle size={16} /></span>
                <div className="grow">
                  <div className="cell-title">{s.p.name}</div>
                  <div className="cell-sub">{s.note} · {rm(s.p.stock * s.p.cost)} in stock</div>
                </div>
                {done[s.productId] ? (
                  <span className="tag tag--green"><Check size={12} />Planned</span>
                ) : (
                  <button
                    className="btn btn--soft btn--xs"
                    onClick={() => {
                      setDone({ ...done, [s.productId]: true });
                      toast(`${s.action}: added to this week’s to-do for ${s.p.name}`);
                    }}
                  >
                    {s.action}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
