import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { CATEGORIES, PRODUCTS, SALES_RECORDS, SUPPLIERS } from '../data/mockData';
import { dayLabel, localToday } from '../lib/format';
import { api, syncAction } from '../lib/api';

const STORAGE_KEY = 'bijak-demo-v1';

// Data comes from the database through /api (server/api.js) when it is reachable.
// Every action updates this store first, then is saved to the API in order
// (see syncAction). If the API is down, the app falls back to the mock data and
// keeps changes in this browser (localStorage) only.
const initialState = () => ({
  backend: 'connecting', // 'connecting' | 'online' | 'offline' (not persisted)
  aiEnabled: false, // server has a Gemini key (not persisted)
  syncError: null, // last failed save, shown in Settings (not persisted)
  products: PRODUCTS,
  // User-created categories / suppliers go to the front so they show up first
  // in the (max 5) suggestions.
  categories: CATEGORIES,
  suppliers: SUPPLIERS,
  sales: SALES_RECORDS,
  advisorUnread: 3,
  // AI Advisor conversations (`chats` + `messages` tables).
  chats: [], // [{ id, kind, day?, title, createdAt, updatedAt, messages: [{ id, role, text, at }] }]
  activeChatId: null, // null = the default "new chat" screen
  typingChatId: null, // chat waiting for an AI reply, or 'dashboard' (not persisted)
  // The Dashboard panel keeps one conversation per day. When the day changes,
  // 'rollDashboard' moves it into `chats` (kind: 'dashboard') and starts a new one.
  dashboardChat: [], // [{ id, role, text, at }]
  dashboardDate: localToday(), // yyyy-mm-dd the current dashboardChat belongs to
  // Follow-up questions asked from the pinned "Today's advice" chat in AI Advisor.
  adviceChat: [], // [{ id, role, text, at }]
  dismissedRecs: [], // ids from lib/advice.js the user said "Not now" to
});

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { backend, aiEnabled, syncError, ...saved } = JSON.parse(raw); // eslint-disable-line no-unused-vars
      return { ...initialState(), ...saved, typingChatId: null };
    }
  } catch {
    // ignore broken storage
  }
  return initialState();
}

function reducer(state, action) {
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
      // TODO(backend): POST /categories or /suppliers { name } and use the saved row instead.
      return { ...state, [action.list]: [name, ...list] };
    }
    case 'deleteProduct':
      return { ...state, products: state.products.filter((p) => p.id !== action.id) };
    case 'adjustStock':
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.id ? { ...p, stock: Math.max(0, p.stock + action.delta) } : p
        ),
      };
    case 'saveSales': {
      // Replace the day's record and move stock by the difference, so editing
      // an already-saved day never double-counts.
      const before = state.sales[action.date] || {};
      const after = Object.fromEntries(Object.entries(action.lines).filter(([, u]) => u > 0));
      const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
      const delta = {};
      ids.forEach((id) => {
        delta[id] = (after[id] || 0) - (before[id] || 0);
      });
      const sales = { ...state.sales };
      if (Object.keys(after).length) sales[action.date] = after;
      else delete sales[action.date];
      return {
        ...state,
        sales,
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
      return { ...initialState(), backend: state.backend, aiEnabled: state.aiEnabled };
    // ---- API ----
    case 'hydrate':
      // Saved data from the database replaces the local copy; UI state (open chat…) stays.
      return { ...state, ...action.data, backend: 'online', syncError: null };
    case 'backendOffline':
      return { ...state, backend: 'offline' };
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

  const refresh = useCallback(async () => {
    try {
      const data = await api('GET', `/state?today=${localToday()}`);
      rawDispatch({ type: 'hydrate', data });
    } catch (err) {
      console.warn('API unavailable, using data saved in this browser:', err.message);
      rawDispatch({ type: 'backendOffline' });
    }
  }, []);

  // Update the screen right away, then save to the API one call at a time so
  // the order matches (e.g. a chat is created before its first message).
  const dispatch = useCallback((action) => {
    const before = stateRef.current;
    rawDispatch(action);
    if (before.backend !== 'online') return;
    queue.current = queue.current
      .then(() => syncAction(action, before))
      .then(() => action.type === 'reset' && refresh())
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
      const { typingChatId, backend, aiEnabled, syncError, ...saved } = state; // eslint-disable-line no-unused-vars
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // storage full or blocked — the demo still works in memory
    }
  }, [state]);

  const value = useMemo(() => {
    const productsById = Object.fromEntries(state.products.map((p) => [p.id, p]));
    const reorder = state.products.filter((p) => stockStatus(p) !== 'ok');
    return {
      ...state,
      productsById,
      reorder,
      lowCount: reorder.filter((p) => stockStatus(p) === 'low').length,
      outCount: reorder.filter((p) => stockStatus(p) === 'out').length,
      stockValue: state.products.reduce((s, p) => s + p.stock * p.cost, 0),
      retailValue: state.products.reduce((s, p) => s + p.stock * (p.price ?? p.cost), 0),
      salesFor: (date) => dayTotals(state.sales[date], productsById),
      dispatch,
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
