import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, Box, ArrowRight, Database, LineChart, CalendarDays, Paperclip, Upload, Mic, MessageSquare, Trash2, Plus, LayoutGrid, Pin, Lightbulb, RotateCcw, History, X,
} from 'lucide-react';
import AdviceCard from '../components/AdviceCard';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { getAiReply, chatMessage } from '../lib/aiReply';
import { buildAdvice } from '../lib/advice';
import { SHOP } from '../data/mockData';
import { dayLabel } from '../lib/format';
import DashboardThread from '../components/DashboardThread';

const GREETING = { id: 'greeting', role: 'ai', text: `Hi ${SHOP.owner}! Ask me anything about your stock, sales or plans.` };
const STARTERS = ['What is low on stock?', 'Which items have the lowest margin?', 'Should I stock up for Deepavali?', 'Why are sales up this week?'];

const titleFrom = (text) => (text.length > 48 ? `${text.slice(0, 45).trim()}…` : text);

function whenLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

// Chat behaviour:
// - First visit (no active chat) → default screen: greeting + starter questions.
// - The active chat lives in the store, so leaving the page and coming back
//   shows the same conversation, and a reply that arrives while you're away
//   still gets saved.sss
// - Right panel lists every saved chat (newest first); click to reopen, 🗑 to delete.
// - "New chat" goes back to the default screen; the chat is only created once
//   the first message is sent, so empty chats never clutter the history.
export default function Advisor() {
  const store = useStore();
  const { products, chats, activeChatId, typingChatId, dispatch } = store;
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [picking, setPicking] = useState(false);
  // Below 1100px the history panel is hidden and opens as a drawer instead.
  const [showHistory, setShowHistory] = useState(false);
  const openChat = (id) => { dispatch({ type: 'openChat', id }); setShowHistory(false); };
  const scrollRef = useRef(null);
  const receiptRef = useRef(null);
  const csvRef = useRef(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const { dashboardChat, dashboardDate, adviceChat } = store;
  // Two pinned chats sit above the history:
  // - Dashboard (top): today's Dashboard panel conversation, continued here; messages sent
  //   while it is open go back to the Dashboard. Past days move into the history
  //   (kind: 'dashboard') and the pin starts the new day.
  // - Today’s advice: the full list of suggestions (the Dashboard shows only the top one),
  //   with follow-up questions kept in store.adviceChat.
  const pinned = {
    dashboard: { id: 'dashboard', kind: 'dashboard', title: `Dashboard · ${dayLabel(dashboardDate)}`, messages: dashboardChat, updatedAt: dashboardChat[dashboardChat.length - 1]?.at },
    advice: { id: 'advice', kind: 'advice', title: 'Today’s advice', messages: adviceChat, updatedAt: adviceChat[adviceChat.length - 1]?.at },
  };
  const advice = buildAdvice(store);
  const chat = pinned[activeChatId] || chats.find((c) => c.id === activeChatId) || null;
  const isDashboard = chat?.kind === 'dashboard';
  const messages = [...(chat?.kind === 'advice' ? [] : [GREETING]), ...(chat?.messages || [])];
  const typing = Boolean(chat) && typingChatId === chat.id;
  const history = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => { dispatch({ type: 'readAdvisor' }); }, [dispatch]);

  // Questions sent from the dashboard / sales page arrive via router state and
  // always start a fresh chat. The ref stops StrictMode from sending twice.
  const handledAsk = useRef(null);
  useEffect(() => {
    const ask = location.state?.ask;
    if (ask && handledAsk.current !== location.key) {
      handledAsk.current = location.key;
      navigate(location.pathname, { replace: true, state: null });
      send(ask, { fresh: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Jump to the latest message when opening a chat; scroll smoothly as new ones arrive.
  const lastChat = useRef(undefined);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const switched = lastChat.current !== activeChatId;
    lastChat.current = activeChatId;
    el.scrollTo({ top: el.scrollHeight, behavior: switched ? 'auto' : 'smooth' });
  }, [activeChatId, messages.length, typing]);

  // Returns the id of the chat to write into, creating it on the first message.
  function ensureChat(firstText, fresh) {
    const current = storeRef.current.activeChatId;
    if (current && !fresh) return current;
    const { id } = chatMessage('user', '');
    const now = Date.now();
    dispatch({ type: 'startChat', chat: { id, title: titleFrom(firstText), createdAt: now, updatedAt: now, messages: [] } });
    return id;
  }

  async function send(text, { fresh = false } = {}) {
    const t = text.trim();
    if (!t) return;
    const chatId = ensureChat(t, fresh);
    const prior = fresh ? []
      : chatId === 'dashboard' ? storeRef.current.dashboardChat
        : chatId === 'advice' ? storeRef.current.adviceChat
          : storeRef.current.chats.find((c) => c.id === chatId)?.messages || [];
    const userMsg = chatMessage('user', t);
    dispatch({ type: 'addMessage', chatId, message: userMsg });
    dispatch({ type: 'setTyping', chatId });
    setInput('');

    const reply = await getAiReply([...prior, userMsg], storeRef.current);
    // Saved to the chat it was asked in, even if the user switched chats or pages meanwhile.
    dispatch({ type: 'addMessage', chatId, message: chatMessage('ai', reply) });
    dispatch({ type: 'setTyping', chatId: null });
  }

  function attachReceipt(file) {
    const chatId = ensureChat(`Receipt: ${file.name}`);
    dispatch({ type: 'addMessage', chatId, message: chatMessage('user', `📎 Attached receipt: ${file.name}`) });
    // TODO(backend): upload the file and let the model read it (OCR) to add stock.
    dispatch({ type: 'addMessage', chatId, message: chatMessage('ai', 'Got it. Reading receipts needs the real backend, so in this demo nothing was added to stock. Use Inventory → Add stock to log the delivery by hand.') });
  }

  return (
    <div className="page page--chat">
      <div className="chat">
        <header className="chat__head">
          <div className="row gap-12">
            <div className="ai-avatar ai-avatar--lg"><Sparkles size={20} /></div>
            <div>
              <div className="strong big">{chat ? chat.title : 'Bijak Advisor'}</div>
              <div className="online"><i />{store.aiEnabled ? 'Gemini' : 'Offline demo'} · using {SHOP.name}’s sales &amp; stock data</div>
            </div>
          </div>
          <div className="row gap-8">
            <button className="btn btn--outline history-toggle" onClick={() => setShowHistory(true)} aria-label="Chat history"><History size={16} /><span>History</span></button>
            <button className="btn btn--outline" aria-label="New chat" disabled={!chat} onClick={() => dispatch({ type: 'openChat', id: null })}><Plus size={16} className="only-mobile" /><span className="hide-mobile">New chat</span></button>
          </div>
        </header>

        <div className="chat__scroll" ref={scrollRef}>
          <div className="chat__column">
            {chat?.id === 'advice' && (
              <>
                <div className="msg msg--ai msg--wide">
                  <div className="ai-avatar ai-avatar--md"><Sparkles size={16} /></div>
                  <div className="ai-answer"><p>Good morning, {SHOP.owner}! I checked last night’s sales and your stock. Here’s what I’d do today:</p></div>
                </div>
                <div className="advice-list">
                  {(advice.length ? advice : [null]).map((a) => (
                    <AdviceCard
                      key={a?.id || 'none'}
                      item={a}
                      disabled={typing}
                      onAction={(item) => send(item.ask)}
                      onDismiss={(item) => dispatch({ type: 'dismissRec', id: item.id })}
                    />
                  ))}
                </div>
              </>
            )}
            {isDashboard && (
              <div className="dash-thread">
                <DashboardThread
                  messages={chat.messages}
                  rec={chat.id === 'dashboard' ? advice[0] || null : undefined}
                  typing={typing}
                  onAsk={(q) => send(q)}
                  onDismiss={(a) => dispatch({ type: 'dismissRec', id: a.id })}
                />
              </div>
            )}
            {!isDashboard && messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="msg msg--user"><div className="bubble bubble--user">{m.text}</div></div>
              ) : (
                <div key={m.id} className="msg msg--ai msg--wide">
                  <div className="ai-avatar ai-avatar--md"><Sparkles size={16} /></div>
                  <div className="ai-answer"><p className="pre">{m.text}</p></div>
                </div>
              )
            )}
            {!chat && (
              <div className="chips chips--starters">
                {STARTERS.map((q) => (
                  <button key={q} className="chip-btn" onClick={() => send(q)}><Sparkles size={12} />{q}</button>
                ))}
              </div>
            )}
            {typing && !isDashboard && (
              <div className="msg msg--ai msg--wide">
                <div className="ai-avatar ai-avatar--md"><Sparkles size={16} /></div>
                <div className="typing"><i /><i /><i /></div>
              </div>
            )}
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
                <button type="button" className="tool-btn" onClick={() => receiptRef.current.click()}><Paperclip size={16} /><span className="tool-btn__label">Attach receipt</span></button>
                <div className="popover-anchor">
                  <button type="button" className="tool-btn" onClick={() => setPicking((p) => !p)}><Box size={16} /><span className="tool-btn__label">Pick product</span></button>
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
                <button type="button" className="tool-btn" onClick={() => csvRef.current.click()}><Upload size={16} /><span className="tool-btn__label">Import CSV</span></button>
                <input ref={receiptRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => {
                  if (e.target.files[0]) attachReceipt(e.target.files[0]);
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

      {showHistory && <div className="drawer-backdrop" onClick={() => setShowHistory(false)} />}
      <aside className={`context-panel${showHistory ? " context-panel--open" : ""}`}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="eyebrow">CHAT HISTORY</div>
          <div className="row gap-4">
            <button className="icon-btn icon-btn--sm" onClick={() => openChat(null)} aria-label="New chat" title="New chat"><Plus size={15} /></button>
            <button className="icon-btn icon-btn--sm history-toggle" onClick={() => setShowHistory(false)} aria-label="Close history"><X size={15} /></button>
          </div>
        </div>
        <div className="history-list">
          <div className={`recent recent--pinned-top${activeChatId === 'dashboard' ? ' recent--active' : ''}`}>
            <button className="recent__open" onClick={() => openChat('dashboard')}>
              <LayoutGrid size={15} />
              <div>
                <div className="cell-title">Dashboard · {dayLabel(dashboardDate)}</div>
                <div className="cell-sub">
                  {typingChatId === 'dashboard' ? 'Bijak is typing…'
                    : dashboardChat.length ? `${whenLabel(pinned.dashboard.updatedAt)} · ${dashboardChat.length} messages` : 'Today · no messages yet'}
                </div>
              </div>
            </button>
            <Pin size={13} className="recent__pin" aria-label="Pinned" />
          </div>
          <div className={`recent recent--pinned${activeChatId === 'advice' ? ' recent--active' : ''}`}>
            <button className="recent__open" onClick={() => openChat('advice')}>
              <Lightbulb size={15} />
              <div>
                <div className="cell-title">Today’s advice</div>
                <div className="cell-sub">
                  {typingChatId === 'advice' ? 'Bijak is typing…'
                    : advice.length ? `${advice.length} suggestion${advice.length === 1 ? '' : 's'} for today` : 'Nothing urgent today'}
                </div>
              </div>
            </button>
            {activeChatId === 'advice' && (adviceChat.length > 0 || store.dismissedRecs.length > 0) ? (
              <button
                className="icon-btn icon-btn--sm recent__delete"
                aria-label="Reset today’s advice"
                title="Clear follow-ups and show dismissed suggestions again"
                disabled={typing}
                onClick={() => dispatch({ type: 'clearAdviceChat' })}
              >
                <RotateCcw size={14} />
              </button>
            ) : (
              <Pin size={13} className="recent__pin" aria-label="Pinned" />
            )}
          </div>
          {history.map((c) => (
            <div key={c.id} className={`recent${c.id === activeChatId ? ' recent--active' : ''}`}>
              <button className="recent__open" onClick={() => openChat(c.id)}>
                {c.kind === 'dashboard' ? <LayoutGrid size={15} /> : <MessageSquare size={15} />}
                <div>
                  <div className="cell-title">{c.title}</div>
                  <div className="cell-sub">{typingChatId === c.id ? 'Bijak is typing…' : `${whenLabel(c.updatedAt)} · ${c.messages.length} messages`}</div>
                </div>
              </button>
              <button
                className="icon-btn icon-btn--sm icon-btn--danger recent__delete"
                aria-label={`Delete chat ${c.title}`}
                onClick={() => { if (window.confirm('Delete this chat?')) dispatch({ type: 'deleteChat', id: c.id }); }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

      </aside>
    </div>
  );
}
