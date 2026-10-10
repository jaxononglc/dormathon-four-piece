import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, AlertTriangle, Receipt, LineChart, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';
import KpiCard from '../components/KpiCard';
import { BarChart } from '../components/Charts';
import DailySalesModal from '../components/DailySalesModal';
import DashboardThread from '../components/DashboardThread';
import { useStore } from '../store/AppStore';
import { SUNDAY_FORECAST, LAST_WEEK, ANALYSIS } from '../data/mockData';
import { addDays, dayShort, localToday, longDate, mondayOf, rm, signedPct } from '../lib/format';
import { getAiReply, chatMessage } from '../lib/aiReply';
import { buildAdvice } from '../lib/advice';


export default function Dashboard() {
  const store = useStore();
  const { products, productsById, sales, lowCount, outCount, stockValue, salesFor, dashboardChat, typingChatId, dispatch, shop } = store;
  const storeRef = useRef(store);
  storeRef.current = store;
  const [draft, setDraft] = useState('');
  const typing = typingChatId === 'dashboard';
  const bodyRef = useRef(null);
  const [range, setRange] = useState('week');
  const [params] = useSearchParams();
  // /?record=1 opens the daily sales modal directly (handy for demos and links).
  const [recording, setRecording] = useState(params.get('record') === '1');

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(localToday()), i)); // Mon–Sun
  const weekSales = weekDays.filter((d) => d <= localToday()).reduce((s, d) => s + salesFor(d).sales, 0);

  const bestSeller = useMemo(() => {
    const units = {};
    weekDays.filter((d) => d <= localToday()).forEach((d) => {
      Object.entries(sales[d] || {}).forEach(([id, u]) => (units[id] = (units[id] || 0) + u));
    });
    const [id, u] = Object.entries(units).sort((a, b) => b[1] - a[1])[0] || [];
    return id ? { product: productsById[id], units: u } : null;
  }, [sales, productsById]);

  const chartData =
    range === 'week'
      ? weekDays.map((d) => {
          if (d > localToday()) return { label: dayShort(d), value: SUNDAY_FORECAST, kind: 'forecast', tip: `Forecast · ${rm(SUNDAY_FORECAST)}` };
          const v = salesFor(d).sales;
          return d === localToday()
            ? { label: dayShort(d), value: v, kind: 'current', tip: `Today · ${rm(v)}` }
            : { label: dayShort(d), value: v, kind: 'past' };
        })
      : ANALYSIS['6w'].trend.slice(1).map((t, i, arr) => ({
          label: t.label,
          value: t.value,
          kind: i === arr.length - 1 ? 'current' : 'past',
          tip: `Week of ${t.label} · ${rm(t.value)}`,
        }));

  const weekdayAvg = weekDays.slice(0, 5).reduce((s, d) => s + salesFor(d).sales, 0) / 5;
  const todaySales = salesFor(localToday()).sales;
  const insight =
    range === 'week'
      ? `Saturday sales are ${Math.round((todaySales / weekdayAvg - 1) * 100)}% above your weekday average.`
      : 'Revenue has grown 4 weeks out of the last 5 — weekend orders are driving it.';

  // Most urgent suggestion; the full list is in AI Advisor → Today's advice.
  const rec = buildAdvice(store)[0];

  // The panel keeps one running conversation (store.dashboardChat), so it is still
  // here after visiting other pages, and a reply that lands meanwhile is kept.
  async function ask(text) {
    const t = text.trim();
    if (!t || storeRef.current.typingChatId === 'dashboard') return;
    const userMsg = chatMessage('user', t);
    const history = [...storeRef.current.dashboardChat, userMsg];
    dispatch({ type: 'addDashboardMessage', message: userMsg });
    dispatch({ type: 'setTyping', chatId: 'dashboard' });
    setDraft('');
    const reply = await getAiReply(history, storeRef.current);
    dispatch({ type: 'addDashboardMessage', message: chatMessage('ai', reply) });
    dispatch({ type: 'setTyping', chatId: null });
  }

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [dashboardChat.length, typing]);

  return (
    <div className="page page--with-panel">
      <div className="page__main">
        <header className="topbar">
          <div>
            <h1>Good morning, {shop.owner}</h1>
            <p className="muted">{longDate(localToday())} · Here’s how your shop is doing</p>
          </div>
          <div className="topbar__actions">
            <button className="btn btn--primary" onClick={() => setRecording(true)}>Record New Sale</button>
          </div>
        </header>

        <section className="kpis">
          <KpiCard to="/inventory" hint="See all stock" label="Stock value" value={rm(stockValue)} icon={Box} delta={`${signedPct(stockValue / LAST_WEEK.stockValue - 1)} vs last week`} tone={stockValue >= LAST_WEEK.stockValue ? 'up' : 'down'} />
          <KpiCard
            to="/inventory?level=restock"
            hint="See items that need restocking"
            label="Need restocking"
            value={`${lowCount + outCount} items`}
            icon={AlertTriangle}
            delta={outCount ? `${outCount} out of stock` : 'None out of stock'}
            tone={outCount ? 'down' : 'up'}
          />
          <KpiCard to="/sales?period=7d" hint="See this week’s sales" label="Sales this week" value={rm(weekSales)} icon={Receipt} delta={`${signedPct(weekSales / LAST_WEEK.sales - 1, 0)} vs last week`} tone={weekSales >= LAST_WEEK.sales ? 'up' : 'down'} />
          <KpiCard to="/sales?period=7d#top-products" hint="See top products" label="Best seller" value={bestSeller ? shortName(bestSeller.product.name) : '—'} icon={LineChart} delta={bestSeller ? `${bestSeller.units} sold this week` : null} tone="neutral" />
        </section>

        <section className="card card--pad">
          <div className="card__head">
            <div>
              <h3>Daily sales</h3>
              <p className="muted small">
                {range === 'week' ? 'This week, in RM · Sunday is AI forecast' : 'Last 5 weeks, in RM'}
              </p>
            </div>
            <div className="segmented">
              <button className={range === 'week' ? 'is-active' : ''} onClick={() => setRange('week')}>Week</button>
              <button className={range === 'month' ? 'is-active' : ''} onClick={() => setRange('month')}>Month</button>
            </div>
          </div>
          <BarChart data={chartData} />
          <div className="insight">
            <Sparkles size={16} />
            {insight}
          </div>
        </section>
      </div>

      <aside className="ai-panel">
        <div className="ai-panel__head">
          <div className="ai-avatar ai-avatar--lg"><Sparkles size={20} /></div>
          <div>
            <div className="strong">Bijak Advisor</div>
            <div className="online"><i />Watching {products.length} products</div>
          </div>
          {dashboardChat.length > 0 && (
            <button
              className="icon-btn ai-panel__clear"
              title="Clear this conversation"
              aria-label="Clear conversation"
              disabled={typing}
              onClick={() => dispatch({ type: 'clearDashboardChat' })}
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
        <div className="ai-panel__body" ref={bodyRef}>
          <DashboardThread
            messages={dashboardChat}
            rec={rec || null}
            typing={typing}
            onAsk={ask}
            onDismiss={(a) => dispatch({ type: 'dismissRec', id: a.id })}
          />
        </div>
        <form
          className="ai-panel__composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about your stock or sales…" />
          <button className="send-btn" aria-label="Send" disabled={!draft.trim() || typing}><ArrowRight size={16} /></button>
        </form>
      </aside>

      {recording && <DailySalesModal onClose={() => setRecording(false)} />}
    </div>
  );
}

const shortName = (name) => name.replace(/\s*\(.*\)$/, '').replace(' Sarawak', '');
