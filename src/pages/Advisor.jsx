import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, History, Box, Info, AlertTriangle, Copy, ThumbsUp, ThumbsDown, ArrowRight, Database, LineChart, CalendarDays,
  Paperclip, Upload, Mic, Store, MessageSquare, Check, Pencil, Download,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { advisorReply } from '../lib/advisor';
import { SHOP, SUPPLIERS, UPCOMING, RECENT_CHATS, TODAY } from '../data/mockData';
import { downloadCSV, rm } from '../lib/format';

// What the Deepavali plan needs (from last year's festive orders). "Have" comes from live stock.
const PLAN_ITEMS = [
  { productId: 'p1', need: 90, orderBy: '20 Oct', urgent: true },
  { productId: 'p7', need: 400, orderBy: '22 Oct', urgent: true },
  { productId: 'p4', need: 900, orderBy: 'Weekly' },
  { productId: 'p3', need: 80, orderBy: '25 Oct' },
  { productId: 'p2', need: 45, orderBy: '25 Oct' },
];
const BUDGET = 800;

const INITIAL = [
  { id: 1, role: 'user', text: 'Yes, build the stock plan for Deepavali.' },
  { id: 2, role: 'ai', type: 'plan' },
  { id: 3, role: 'user', text: 'What if I only have RM 800 to spend right now?' },
  { id: 4, role: 'ai', type: 'budget' },
];
const FRESH = [{ id: 1, role: 'ai', type: 'text', text: `Hi ${SHOP.owner}! Ask me anything about your stock, sales or plans.` }];

export default function Advisor() {
  const store = useStore();
  const { products, dispatch } = store;
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(INITIAL);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [showContext, setShowContext] = useState(true);
  const [picking, setPicking] = useState(false);
  const [needs, setNeeds] = useState(() => Object.fromEntries(PLAN_ITEMS.map((i) => [i.productId, i.need])));
  const endRef = useRef(null);
  const receiptRef = useRef(null);
  const csvRef = useRef(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => { dispatch({ type: 'readAdvisor' }); }, [dispatch]);

  // Questions sent from the dashboard / sales page arrive via router state.
  useEffect(() => {
    const ask = location.state?.ask;
    if (ask) {
      navigate(location.pathname, { replace: true, state: null });
      send(ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  function send(text) {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text: t }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'ai', ...advisorReply(t, storeRef.current) }]);
    }, 700);
  }

  // ---- Plan numbers (shared by the plan table and the budget answer) ----
  const plan = PLAN_ITEMS.map((i) => {
    const p = store.productsById[i.productId];
    if (!p) return null;
    const need = needs[i.productId];
    const order = Math.max(0, need - p.stock);
    return { ...i, p, need, order, cost: order * p.cost };
  }).filter(Boolean);
  const planTotal = plan.reduce((s, r) => s + r.cost, 0);
  const costOf = (id) => plan.find((r) => r.productId === id)?.cost ?? 0;
  const buyNow = costOf('p1') + costOf('p7') + costOf('p4');
  const later = costOf('p2');
  const skip = costOf('p3');

  const ctx = {
    plan, planTotal, needs, setNeeds, buyNow, later, skip, toast,
  };

  return (
    <div className="page page--chat">
      <div className="chat">
        <header className="chat__head">
          <div className="row gap-12">
            <div className="ai-avatar ai-avatar--lg"><Sparkles size={20} /></div>
            <div>
              <div className="strong big">Bijak Advisor</div>
              <div className="online"><i />Using {SHOP.name}’s sales &amp; stock data · synced 8:02 am</div>
            </div>
          </div>
          <div className="row gap-8">
            <button className={`icon-btn icon-btn--box${showContext ? ' is-on' : ''}`} onClick={() => setShowContext((s) => !s)} aria-label="Toggle context panel" title="Data, reminders and recent chats">
              <History size={17} />
            </button>
            <button className="btn btn--outline" onClick={() => { setMessages(FRESH); setTyping(false); }}>New chat</button>
          </div>
        </header>

        <div className="chat__scroll">
          <div className="chat__column">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="msg msg--user"><div className="bubble bubble--user">{m.text}</div></div>
              ) : (
                <div key={m.id} className="msg msg--ai msg--wide">
                  <div className="ai-avatar ai-avatar--md"><Sparkles size={16} /></div>
                  <div className="ai-answer">
                    {m.type === 'plan' ? <PlanAnswer {...ctx} /> : m.type === 'budget' ? <BudgetAnswer {...ctx} send={send} /> : <p className="pre">{m.text}</p>}
                  </div>
                </div>
              )
            )}
            {typing && (
              <div className="msg msg--ai msg--wide">
                <div className="ai-avatar ai-avatar--md"><Sparkles size={16} /></div>
                <div className="typing"><i /><i /><i /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <div className="row gap-6">
              <span className="ctx-chip"><Database size={13} />All inventory</span>
              <span className="ctx-chip"><LineChart size={13} />Sales · 90 days</span>
              <span className="ctx-chip"><CalendarDays size={13} />Until 8 Nov</span>
            </div>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about your stock, sales or plans…"
            />
            <div className="composer__bar">
              <div className="row gap-4">
                <button type="button" className="tool-btn" onClick={() => receiptRef.current.click()}><Paperclip size={16} />Attach receipt</button>
                <div className="popover-anchor">
                  <button type="button" className="tool-btn" onClick={() => setPicking((p) => !p)}><Box size={16} />Pick product</button>
                  {picking && (
                    <div className="popover">
                      {products.map((p) => (
                        <button type="button" key={p.id} onClick={() => { setInput((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}${p.name} `); setPicking(false); }}>
                          {p.name} <small>{p.stock} {p.unit}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="tool-btn" onClick={() => csvRef.current.click()}><Upload size={16} />Import CSV</button>
                <input ref={receiptRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) {
                    setMessages((m) => [...m,
                      { id: Date.now(), role: 'user', text: `📎 Attached receipt: ${f.name}` },
                      { id: Date.now() + 1, role: 'ai', type: 'text', text: 'Got it. Reading receipts needs the real backend, so in this demo nothing was added to stock. Use Inventory → Add stock to log the delivery by hand.' }]);
                  }
                  e.target.value = '';
                }} />
                <input ref={csvRef} type="file" accept=".csv" hidden onChange={(e) => {
                  if (e.target.files[0]) toast('CSV import needs the backend — not available in this demo', 'info');
                  e.target.value = '';
                }} />
              </div>
              <div className="row gap-8">
                <button type="button" className="icon-btn" onClick={() => toast('Voice input is not available in this demo', 'info')} aria-label="Voice input"><Mic size={16} /></button>
                <button type="submit" className="send-btn send-btn--lg" disabled={!input.trim()} aria-label="Send"><ArrowRight size={17} /></button>
              </div>
            </div>
          </form>
          <p className="disclaimer">Bijak can make mistakes. Check quantities and prices before sending orders.</p>
        </div>
      </div>

      {showContext && (
        <aside className="context-panel">
          <div className="eyebrow">DATA I’M USING</div>
          <div className="data-card"><span className="icon-tile"><Box size={16} /></span><div><div className="cell-title">Inventory</div><div className="cell-sub">{products.length} products · synced 8:02 am</div></div></div>
          <div className="data-card"><span className="icon-tile"><LineChart size={16} /></span><div><div className="cell-title">Sales history</div><div className="cell-sub">Last 90 days</div></div></div>
          <div className="data-card"><span className="icon-tile"><Store size={16} /></span><div><div className="cell-title">Suppliers</div><div className="cell-sub">{SUPPLIERS.filter((s) => s !== 'Own kitchen').length} saved suppliers</div></div></div>

          <div className="eyebrow">COMING UP</div>
          {UPCOMING.map((u) => (
            <div key={u.title} className="upcoming">
              <i className={`bar-${u.color}`} />
              <div><div className="cell-title">{u.title}</div><div className="cell-sub">{u.date} · {u.note}</div></div>
            </div>
          ))}

          <div className="eyebrow">RECENT CHATS</div>
          {RECENT_CHATS.map((c) => (
            <button key={c.title} className="recent" onClick={() => send(c.title)}>
              <MessageSquare size={15} />
              <div><div className="cell-title">{c.title}</div><div className="cell-sub">{c.when}</div></div>
            </button>
          ))}
        </aside>
      )}
    </div>
  );
}

function PlanAnswer({ plan, planTotal, setNeeds, needs, toast }) {
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);
  const [vote, setVote] = useState(null);

  const text = plan.map((r) => `${r.p.name}: order ${r.order} ${r.p.unit} (${rm(r.cost)}) by ${r.orderBy}`).join('\n');

  return (
    <div className="stack-14">
      <p>Here’s a 3-week plan based on your last 90 days of sales and last year’s festive orders. Order the flour and boxes first — they have the longest delivery time.</p>
      <div className="plan">
        <div className="plan__head">
          <span className="row gap-8 strong"><Box size={16} />Deepavali stock plan</span>
          <span className="tag tag--indigo">Festival: 8 Nov</span>
        </div>
        <table className="table table--compact">
          <thead><tr><th>Item</th><th>Have</th><th>Need</th><th>Order</th><th>Est. cost</th><th>Order by</th></tr></thead>
          <tbody>
            {plan.map((r) => (
              <tr key={r.productId}>
                <td className="cell-title">{r.p.name}</td>
                <td>{r.p.stock} {unitLabel(r.p.unit)}</td>
                <td>
                  {editing ? (
                    <input className="input input--xs" type="number" min="0" value={needs[r.productId]} onChange={(e) => setNeeds((n) => ({ ...n, [r.productId]: Math.max(0, Number(e.target.value) || 0) }))} />
                  ) : `${r.need} ${unitLabel(r.p.unit)}`}
                </td>
                <td className="text-indigo">+{r.order} {unitLabel(r.p.unit)}</td>
                <td>{rm(r.cost)}</td>
                <td><span className={`tag ${r.urgent ? 'tag--red' : 'tag--grey'}`}>{r.orderBy}</span></td>
              </tr>
            ))}
            <tr className="total-row"><td>Total</td><td /><td /><td /><td>{rm(planTotal)}</td><td /></tr>
          </tbody>
        </table>
      </div>

      <div className="grid-2 grid-2--even">
        <div className="mini-card">
          <div className="strong">Expected weekly orders</div>
          <div className="cell-sub">Dashed line = a normal week</div>
          <div className="mini-bars">
            {[['12 Oct', 1], ['19 Oct', 1.2], ['26 Oct', 1.65], ['2 Nov', 1.8], ['9 Nov', 0.95]].map(([l, v]) => (
              <div key={l} className="mini-bars__col">
                {v === 1.8 && <span className="mini-bars__tip">~1.8× normal</span>}
                <div className={`mini-bars__bar${v >= 1.6 ? (v === 1.8 ? ' is-peak' : ' is-high') : ''}`} style={{ height: `${v * 48}px` }} />
                <span>{l}</span>
              </div>
            ))}
            <div className="mini-bars__normal" style={{ bottom: `${48 + 20}px` }} />
          </div>
        </div>
        <div className="mini-card mini-card--soft">
          <div className="row gap-6 strong"><Info size={15} />Why I suggest this</div>
          <ul className="why">
            <li>Last year your orders nearly doubled in the 2 weeks before Deepavali.</li>
            <li>Your flour supplier needs about 3 days to deliver.</li>
            <li>You have about 10 weeks of butter at normal use, so only a small festive top-up.</li>
          </ul>
          <span className="tag tag--amber"><AlertTriangle size={12} />Medium confidence · based on 1 past Deepavali</span>
        </div>
      </div>

      <div className="row gap-8 wrap plan-actions">
        <button className="btn btn--primary" disabled={sent} onClick={() => { setSent(true); toast('Order drafts sent to 4 suppliers (demo — nothing really sent)'); }}>
          {sent ? <><Check size={18} />Orders sent</> : <>Send orders to suppliers <ArrowRight size={18} /></>}
        </button>
        <button className="btn btn--outline" onClick={() => setEditing((e) => !e)}>{editing ? <><Check size={16} />Done editing</> : <><Pencil size={16} />Edit plan</>}</button>
        <button className="btn btn--outline" onClick={() => downloadCSV(`deepavali-plan-${TODAY}.csv`, [
          ['Item', 'Have', 'Need', 'Order', 'Unit', 'Est. cost (RM)', 'Order by'],
          ...plan.map((r) => [r.p.name, r.p.stock, r.need, r.order, r.p.unit, r.cost.toFixed(2), r.orderBy]),
          ['Total', '', '', '', '', planTotal.toFixed(2), ''],
        ])}><Download size={16} />Download plan</button>
        <span className="grow" />
        <button className="icon-btn" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(text); toast('Plan copied'); }}><Copy size={16} /></button>
        <button className={`icon-btn${vote === 'up' ? ' is-on' : ''}`} aria-label="Helpful" onClick={() => setVote(vote === 'up' ? null : 'up')}><ThumbsUp size={16} /></button>
        <button className={`icon-btn${vote === 'down' ? ' is-on' : ''}`} aria-label="Not helpful" onClick={() => setVote(vote === 'down' ? null : 'down')}><ThumbsDown size={16} /></button>
      </div>
    </div>
  );
}

function BudgetAnswer({ buyNow, later, skip, send }) {
  const diff = buyNow - BUDGET;
  return (
    <div className="stack-14">
      <p>
        Then I’d buy the flour, cake boxes and this week’s eggs first ({rm(buyNow)} — {diff > 0 ? `just ${rm(diff)} over` : `${rm(-diff)} under budget`}).
        Skip the butter top-up since you already have about 10 weeks of it, and buy sugar after payday on 25 Oct. You’ll still cover expected orders until 2 Nov.
      </p>
      <div className="budget">
        <div className="budget__item budget__item--indigo"><span>Buy now</span><b>{rm(buyNow)}</b></div>
        <div className="budget__item"><span>After 25 Oct</span><b>{rm(later)}</b></div>
        <div className="budget__item budget__item--green"><span>Skip</span><b>{rm(skip)} saved</b></div>
      </div>
      <div className="chips">
        {['Message my suppliers', 'Remind me on 25 Oct', 'What is low on stock?'].map((c) => (
          <button key={c} className="chip-btn" onClick={() => send(c)}><Sparkles size={12} />{c}</button>
        ))}
      </div>
    </div>
  );
}

const unitLabel = (u) => (u === 'pcs' ? '' : u);
