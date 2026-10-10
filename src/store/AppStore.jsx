import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { dayLabel, localToday } from '../lib/format';
import { api, syncAction } from '../lib/api';
import { withStockLog, changedLogs } from '../lib/stockLog';

// Only UI preferences are kept in this browser; all data lives in the database.
const STORAGE_KEY = 'bijak-ui-v1';
const SAVED_UI = ['activeChatId', 'advisorUnread'];

// All data comes from the database through /api (server/api.js). Every action
// updates this store first, then is saved to the API in order (see syncAction).
// Until the first load succeeds the app shows a connecting / offline screen (App.jsx).
const initialState = () => ({
  backend: 'connecting', // 'connecting' | 'online' | 'offline'
  backendError: null, // why the last load failed
  aiEnabled: false, // server has a Gemini key
  syncError: null, // last failed save, shown in Settings
  shop: { name: '', type: '', owner: '' }, // Shop table + its owner in Users
  products: [],
  // User-created categories / suppliers go to the front so they show up first
  // in the (max 5) suggestions.
  categories: [],
  suppliers: [],
  // Every recorded sale (Sales + SalesItem). `sales` (units per product per day) is derived from it.
  salesRecords: [], // [{ id, date: 'yyyy-mm-dd', at, lines: { productId: units } }]
  damage: {}, // damaged goods ("DamageLog"): { 'yyyy-mm-dd': { productId: units } }
  advisorUnread: 3,
  // AI Advisor conversations (Chat + Message tables).
  chats: [], // [{ id, kind, day?, title, createdAt, updatedAt, messages: [{ id, role, text, at }] }]
  activeChatId: null, // null = the default "new chat" screen
  typingChatId: null, // chat waiting for an AI reply, or 'dashboard'
  // The Dashboard panel keeps one conversation per day. When the day changes,
  // 'rollDashboard' moves it into `chats` (kind: 'dashboard') and starts a new one.
  dashboardChat: [], // [{ id, role, text, at }]
  dashboardDate: localToday(), // yyyy-mm-dd the current dashboardChat belongs to
  // Follow-up questions asked from the pinned "Today's advice" chat in AI Advisor.
  adviceChat: [], // [{ id, role, text, at }]
  dismissedRecs: [], // ids from lib/advice.js the user said "Not now" to
  // Per-product change history (Inventory → Log), see lib/stockLog.js.
  stockLog: [], // [{ id, productId, at, kind, delta, stockAfter, note }]
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...initialState(), ...Object.fromEntries(SAVED_UI.filter((k) => k in saved).map((k) => [k, saved[k]])) };
  } catch {
    return initialState(); // broken or blocked storage
  }
}

function reducer(state, action) {
  return withStockLog(state, baseReducer(state, action), action);
}

function baseReducer(state, action) {
  switch (action.type) {
    case 'addProduct':
      return { ...state, products: [...state.products, action.product] };
    case 'updateProduct':
      return {
        ...state,
        products: state.products.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      };
    case 'addOption': {
      // action.list: 'categories' | 'suppliers'
      const name = action.name.trim();
      const list = state[action.list];
      if (!name || list.some((c) => c.toLowerCase() === name.toLowerCase())) return state;
      return { ...state, [action.list]: [name, ...list] };
    }
    case 'deleteProduct':
      return { ...state, products: state.products.filter((p) => p.id !== action.id) };
    case 'saveDamage': {
      // Replace the day's damaged goods; they leave stock, so stock moves by the difference.
      const before = state.damage[action.date] || {};
      const after = positive(action.lines);
      const damage = { ...state.damage };
      if (Object.keys(after).length) damage[action.date] = after;
      else delete damage[action.date];
      return {
        ...state,
        damage,
        products: state.products.map((p) => {
          const delta = (after[p.id] || 0) - (before[p.id] || 0);
          return delta ? { ...p, stock: Math.max(0, p.stock - delta) } : p;
        }),
      };
    }
    case 'addSale':
    case 'editSale': {
      // A new sale takes its units out of stock; an edit moves stock by the
      // difference (units taken off go back). An edit with no units left deletes the sale.
      const old = action.type === 'editSale' ? state.salesRecords.find((r) => r.id === action.id) : null;
      if (action.type === 'editSale' && !old) return state;
      // One sale per day: the modal edits the day's sale instead of adding a second.
      if (action.type === 'addSale' && state.salesRecords.some((r) => r.date === action.sale.date)) return state;
      const before = old?.lines || {};
      const after = positive(action.type === 'addSale' ? action.sale.lines : action.lines);
      const delta = {};
      new Set([...Object.keys(before), ...Object.keys(after)]).forEach((id) => {
        delta[id] = (after[id] || 0) - (before[id] || 0);
      });
      let salesRecords;
      if (!old) salesRecords = Object.keys(after).length ? [...state.salesRecords, { ...action.sale, lines: after }] : state.salesRecords;
      else if (Object.keys(after).length) salesRecords = state.salesRecords.map((r) => (r.id === old.id ? { ...r, lines: after } : r));
      else salesRecords = state.salesRecords.filter((r) => r.id !== old.id);
      return {
        ...state,
        salesRecords,
        products: state.products.map((p) =>
          delta[p.id] ? { ...p, stock: Math.max(0, p.stock - delta[p.id]) } : p
        ),
      };
    }
    case 'dismissRec':
      return { ...state, dismissedRecs: [...state.dismissedRecs, action.id] };
    case 'startChat':
      return { ...state, chats: [action.chat, ...state.chats], activeChatId: action.chat.id };
    case 'addMessage':
      // 'dashboard' / 'advice' are the two pinned single conversations.
      if (action.chatId === 'dashboard') return { ...state, dashboardChat: [...state.dashboardChat, action.message] };
      if (action.chatId === 'advice') return { ...state, adviceChat: [...state.adviceChat, action.message] };
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id === action.chatId ? { ...c, messages: [...c.messages, action.message], updatedAt: action.message.at } : c
        ),
      };
    case 'addDashboardMessage':
      return { ...state, dashboardChat: [...state.dashboardChat, action.message] };
    case 'rollDashboard': {
      if (state.dashboardDate === action.today) return state;
      const day = state.dashboardDate;
      const msgs = state.dashboardChat;
      // An empty day leaves nothing in history.
      const archived = msgs.length
        ? [{ id: `dashboard-${day}`, kind: 'dashboard', day, title: `Dashboard · ${dayLabel(day)}`, createdAt: msgs[0].at, updatedAt: msgs[msgs.length - 1].at, messages: msgs }]
        : [];
      return {
        ...state,
        chats: [...archived, ...state.chats.filter((c) => c.id !== `dashboard-${day}`)],
        dashboardChat: [],
        dashboardDate: action.today,
        // Someone reading yesterday's chat keeps reading it, now from history.
        activeChatId: state.activeChatId === 'dashboard' && archived.length ? archived[0].id : state.activeChatId,
      };
    }
    case 'clearDashboardChat':
      return { ...state, dashboardChat: [] };
    case 'clearAdviceChat':
      // Also brings back the suggestions that were dismissed.
      return { ...state, adviceChat: [], dismissedRecs: [] };
    case 'openChat':
      return { ...state, activeChatId: action.id };
    case 'deleteChat':
      return {
        ...state,
        chats: state.chats.filter((c) => c.id !== action.id),
        activeChatId: state.activeChatId === action.id ? null : state.activeChatId,
      };
    case 'setTyping':
      return { ...state, typingChatId: action.chatId };
    case 'readAdvisor':
      return state.advisorUnread ? { ...state, advisorUnread: 0 } : state;
    case 'reset':
      // The API reloads the demo data right after (see dispatch); keep the connection info.
      return { ...initialState(), backend: state.backend, aiEnabled: state.aiEnabled, shop: state.shop };
    // ---- API ----
    case 'hydrate':
      // Saved data from the database replaces the local copy; UI state (open chat…) stays.
      return { ...state, ...action.data, backend: 'online', backendError: null, syncError: null };
    case 'backendConnecting':
      return { ...state, backend: 'connecting', backendError: null };
    case 'backendOffline':
      return { ...state, backend: 'offline', backendError: action.message };
    case 'syncError':
      return { ...state, syncError: action.message };
    default:
      return state;
  }
}

// ---- Derived helpers ----
export function stockStatus(p) {
  if (p.stock <= 0) return 'out';
  if (p.stock < p.min) return 'low';
  return 'ok';
}

// Restock up to twice the minimum so the item is not flagged again right away.
export const suggestedQty = (p) => Math.max(1, p.min * 2 - p.stock);

const positive = (lines) => Object.fromEntries(Object.entries(lines || {}).filter(([, u]) => u > 0));

// Sale ids are made here so a new sale can be edited before the API call returns.
// Numeric (Sales_ID is bigint) and far above the database's own ids.
export const newSaleId = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

// { 'yyyy-mm-dd': { productId: units } } from all recorded sales.
function salesByDay(records) {
  const days = {};
  for (const r of records) {
    const day = (days[r.date] ||= {});
    for (const [id, u] of Object.entries(r.lines)) day[id] = (day[id] || 0) + u;
  }
  return days;
}

export function dayTotals(lines, productsById) {
  let units = 0;
  let sales = 0;
  let profit = 0;
  for (const [id, u] of Object.entries(lines || {})) {
    const p = productsById[id];
    if (!p || !u) continue;
    units += u;
    sales += u * (p.price || 0);
    profit += u * ((p.price || 0) - p.cost);
  }
  return { units, sales, profit };
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const stateRef = useRef(state);
  stateRef.current = state;
  const queue = useRef(Promise.resolve());

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) rawDispatch({ type: 'backendConnecting' });
    try {
      const data = await api('GET', `/state?today=${localToday()}`);
      rawDispatch({ type: 'hydrate', data });
    } catch (err) {
      console.warn('Could not load data from the API:', err.message);
      rawDispatch({ type: 'backendOffline', message: err.message });
    }
  }, []);

  // Update the screen right away, then save to the API one call at a time so
  // the order matches (e.g. a chat is created before its first message).
  const dispatch = useCallback((input) => {
    // meta gives log entries a fixed id/time, so replaying the reducer gives the same result.
    const action = { ...input, meta: { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() } };
    const before = stateRef.current;
    rawDispatch(action);
    if (before.backend !== 'online') return;
    const logs = changedLogs(before, reducer(before, action));
    queue.current = queue.current
      .then(() => syncAction(action, before))
      .then(() => logs.length && api('POST', '/stock-logs', { logs }))
      .then(() => action.type === 'reset' && refresh({ quiet: true }))
      .catch((err) => {
        console.error(`Saving "${action.type}" failed:`, err);
        rawDispatch({ type: 'syncError', message: `${action.type}: ${err.message}` });
      });
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  // Start a new Dashboard day on load and at midnight while the app stays open.
  useEffect(() => {
    const roll = () => rawDispatch({ type: 'rollDashboard', today: localToday() });
    roll();
    const timer = setInterval(roll, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(SAVED_UI.map((k) => [k, state[k]]))));
    } catch {
      // storage blocked — preferences just aren't remembered
    }
  }, [state.activeChatId, state.advisorUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => {
    const productsById = Object.fromEntries(state.products.map((p) => [p.id, p]));
    const reorder = state.products.filter((p) => stockStatus(p) !== 'ok');
    const sales = salesByDay(state.salesRecords);
    return {
      ...state,
      sales,
      productsById,
      reorder,
      lowCount: reorder.filter((p) => stockStatus(p) === 'low').length,
      outCount: reorder.filter((p) => stockStatus(p) === 'out').length,
      stockValue: state.products.reduce((s, p) => s + p.stock * p.cost, 0),
      retailValue: state.products.reduce((s, p) => s + p.stock * (p.price ?? p.cost), 0),
      salesFor: (date) => dayTotals(sales[date], productsById),
      dispatch,
      refresh: () => refresh(), // reload everything from the API (Retry button)
    };
  }, [state, dispatch, refresh]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
