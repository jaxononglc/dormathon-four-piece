import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Receipt, ShoppingBag, TrendingUp, LineChart as LineIcon, Sparkles, ArrowRight, AlertTriangle, Check, Download } from 'lucide-react';
import KpiCard from '../components/KpiCard';
import { LineChart, Sparkline } from '../components/Charts';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { ANALYSIS, TOP_PRODUCTS, MARGIN_TARGET, SLOW_MOVERS, SHOP } from '../data/mockData';
import { downloadCSV, pct, rm, rm2, signedPct } from '../lib/format';

const SORTS = { revenue: 'Revenue', units: 'Units', margin: 'Margin' };

export default function SalesAnalysis() {
  const { productsById } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // ?period=7d|30d|6w (the Dashboard cards link here with 7d)
  const period = ANALYSIS[params.get('period')] ? params.get('period') : '6w';
  const setPeriod = (p) => setParams(p === '6w' ? {} : { period: p }, { replace: true });
  // #top-products scrolls to that card (used by the Dashboard "Best seller" card).
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);
  const [sort, setSort] = useState('revenue');
  const [done, setDone] = useState({});
  const a = ANALYSIS[period];

  const aov = a.revenue / a.orders;
  const aovPrev = a.revenuePrev / a.ordersPrev;
  const profit = a.revenue * a.margin;

  const top = TOP_PRODUCTS.map((t) => {
    const p = productsById[t.productId];
    if (!p) return null;
    const units = Math.round(t.units * a.topFactor);
    return { ...t, p, units, revenue: units * p.price, margin: (p.price - p.cost) / p.price };
  })
    .filter(Boolean)
    .sort((x, y) => y[sort] - x[sort]);

  const margins = Object.values(productsById)
    .filter((p) => p.price && TOP_PRODUCTS.some((t) => t.productId === p.id))
    .map((p) => ({ p, m: (p.price - p.cost) / p.price }))
    .sort((x, y) => y.m - x.m);

  const slow = SLOW_MOVERS.map((s) => ({ ...s, p: productsById[s.productId] })).filter((s) => s.p);
  const tiedUp = slow.reduce((sum, s) => sum + s.p.stock * s.p.cost, 0);

  function exportReport() {
    downloadCSV(`sales-report-${period}.csv`, [
      [`${SHOP.name} — Sales report`, a.range],
      [],
      ['Revenue (RM)', a.revenue], ['Orders', a.orders], ['Avg. order value (RM)', aov.toFixed(2)], ['Gross profit (RM)', profit.toFixed(0)], ['Margin', pct(a.margin)],
      [],
      ['Period', 'Revenue (RM)', 'Previous (RM)'],
      ...a.trend.map((t, i) => [t.label, t.value, a.previous[i]]),
      [],
      ['Product', 'Units', 'Revenue (RM)', 'Margin'],
      ...top.map((t) => [t.p.name, t.units, t.revenue, pct(t.margin)]),
    ]);
    toast('Report downloaded');
  }

  const cookies = productsById.p11;
  const cookieMargin = cookies ? (cookies.price - cookies.cost) / cookies.price : 0;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Sales analysis</h1>
          <p className="muted">{SHOP.name} · {a.range} · {a.compare}</p>
        </div>
        <div className="topbar__actions">
          <div className="segmented segmented--dark">
            {Object.entries(ANALYSIS).map(([k, v]) => (
              <button key={k} className={period === k ? 'is-active' : ''} onClick={() => setPeriod(k)}>{v.label}</button>
            ))}
          </div>
          <span className="date-label"><CalendarDays size={16} />{a.range.replace(' 2026', '')}</span>
          <button className="btn btn--outline" onClick={exportReport}><Download size={16} />Export report</button>
        </div>
      </header>

      <section className="kpis">
        <KpiCard label="Revenue" value={rm(a.revenue)} icon={Receipt} delta={`${signedPct(a.revenue / a.revenuePrev - 1)} vs previous`} tone="up" />
        <KpiCard label="Orders" value={a.orders.toLocaleString()} icon={ShoppingBag} delta={`${signedPct(a.orders / a.ordersPrev - 1)} vs previous`} tone="up" />
        <KpiCard label="Avg. order value" value={rm2(aov)} icon={TrendingUp} delta={`${aov >= aovPrev ? '+' : '−'}${rm2(Math.abs(aov - aovPrev))} per order`} tone={aov >= aovPrev ? 'up' : 'down'} />
        <KpiCard
          label="Gross profit"
          value={rm(profit)}
          icon={LineIcon}
          delta={`Margin ${pct(a.margin)} · ${a.margin >= a.marginPrev ? '+' : '−'}${Math.abs((a.margin - a.marginPrev) * 100).toFixed(1)} pts`}
          tone={a.margin >= a.marginPrev ? 'up' : 'down'}
        />
      </section>

      <section className="ai-summary">
        <div className="ai-avatar ai-avatar--lg"><Sparkles size={19} /></div>
        <div className="ai-summary__text">
          <div className="strong">Bijak’s summary</div>
          <p>
            Revenue is up {signedPct(a.revenue / a.revenuePrev - 1).slice(1)}, driven mostly by weekend WhatsApp orders. But profit margin slipped because butter cost rose 14% — Butter cookies now earn only {pct(cookieMargin)}. Raising the tin price by RM 1.50 would bring it back above your {pct(MARGIN_TARGET)} target.
          </p>
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
        <LineChart labels={a.trend.map((t) => t.label)} current={a.trend.map((t) => t.value)} previous={a.previous} />
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
              <tr><th>#</th><th>Product</th><th>Units</th><th>Revenue</th><th>Margin</th><th>Trend</th></tr>
            </thead>
            <tbody>
              {top.map((t, i) => {
                const below = t.margin < MARGIN_TARGET;
                const rising = t.trend[t.trend.length - 1] >= t.trend[0];
                return (
                  <tr key={t.productId}>
                    <td><span className={`rank${i === 0 ? ' rank--first' : ''}`}>{i + 1}</span></td>
                    <td className="cell-title">{t.p.name}</td>
                    <td>{t.units}</td>
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
            {margins.map(({ p, m }) => (
              <div key={p.id} className="margin-row">
                <span className="margin-row__name">{p.name}</span>
                <div className="margin-row__track">
                  <div className={`margin-row__bar${m < MARGIN_TARGET ? ' is-below' : ''}`} style={{ width: `${m * 100 / 0.6}%` }} />
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
              <p className="muted small">Selling much slower than usual</p>
            </div>
            <span className="tag tag--amber">{rm(tiedUp)} tied up</span>
          </div>
          <div className="stack-10">
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
