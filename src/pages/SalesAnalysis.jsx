import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Receipt, Package, PackageX, LineChart as LineIcon, Sparkles, ArrowRight, AlertTriangle, Check, Download } from 'lucide-react';
import KpiCard from '../components/KpiCard';
import { LineChart, Sparkline } from '../components/Charts';
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
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // ?period=7d|30d|6w (the Dashboard cards link here with 7d)
  const period = PERIODS[params.get('period')] ? params.get('period') : '6w';
  const setPeriod = (p) => setParams(p === '6w' ? {} : { period: p }, { replace: true });
  const [sort, setSort] = useState('revenue');
  const [done, setDone] = useState({});

  const a = useMemo(
    () => analyse(period, localToday(), { sales, damage, products, productsById, marginTarget: MARGIN_TARGET }),
    [period, sales, damage, products, productsById]
  );

  // #top-products scrolls to that card (used by the Dashboard "Best seller" card).
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const header = (
    <header className="topbar">
      <div className="topbar__title">
        <h1>Sales analysis</h1>
        <p className="muted">{shop.name} · {a.range} · {a.compare}</p>
        {a.daysRecorded < a.totalDays && <p className="muted small topbar__note">Sales recorded on {a.daysRecorded} of {a.totalDays} days</p>}
      </div>
      <div className="topbar__actions">
        <div className="segmented segmented--dark">
          {Object.entries(PERIODS).map(([k, v]) => (
            <button key={k} className={period === k ? 'is-active' : ''} onClick={() => setPeriod(k)}>{v.label}</button>
          ))}
        </div>
        <span className="date-label"><CalendarDays size={16} />{a.range.replace(/ \d{4}$/, '')}</span>
        <button className="btn btn--outline" onClick={exportReport}><Download size={16} />Export report</button>
      </div>
    </header>
  );

  function exportReport() {
    downloadCSV(`sales-report-${period}.csv`, [
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

      <section className="ai-summary">
        <div className="ai-avatar ai-avatar--lg"><Sparkles size={19} /></div>
        <div className="ai-summary__text">
          <div className="strong">Bijak’s summary</div>
          <p>{a.summary}</p>
        </div>
        <button className="btn btn--outline" onClick={() => navigate('/advisor', { state: { ask: 'Which items lose money?' } })}>
          Ask Advisor <ArrowRight size={16} />
        </button>
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
          ? <LineChart labels={a.trend.map((t) => t.label)} current={a.trend.map((t) => t.value)} previous={a.trend.map((t) => t.previous)} />
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
        <table className="table table--compact">
          <thead>
            <tr><th>#</th><th>Product</th><th>Units</th><th>Damaged</th><th>Revenue</th><th>Margin</th><th>Trend</th></tr>
          </thead>
          <tbody>
            {top.length === 0 && <tr><td colSpan={7} className="empty">No sales in this period.</td></tr>}
            {top.map((t, i) => {
              const below = t.margin < MARGIN_TARGET;
              const rising = t.trend[t.trend.length - 1] >= t.trend[0];
              return (
                <tr key={t.productId}>
                  <td><span className={`rank${i === 0 ? ' rank--first' : ''}`}>{i + 1}</span></td>
                  <td className="cell-title">{t.p.name}</td>
                  <td>{t.units}</td>
                  <td className={t.damaged ? 'text-red' : 'muted'}>{t.damaged || '—'}</td>
                  <td>{rm(t.revenue)}</td>
                  <td><span className={`tag ${below ? 'tag--red' : 'tag--green'}`}>{pct(t.margin)}</span></td>
                  <td><Sparkline values={t.trend} color={below ? '#d97706' : rising ? '#059669' : '#dc2626'} /></td>
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
                <b className={m < MARGIN_TARGET ? 'text-red' : ''}>{pct(m)}</b>
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
