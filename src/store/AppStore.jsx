import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { CATEGORIES, PRODUCTS, SALES_RECORDS, SUPPLIERS } from '../data/mockData';

const STORAGE_KEY = 'bijak-demo-v1';

const initialState = () => ({
  products: PRODUCTS,
  // Stand-ins for `categories` / `suppliers` tables. User-created entries go to
  // the front so they show up first in the (max 5) suggestions.
  categories: CATEGORIES,
  suppliers: SUPPLIERS,
  sales: SALES_RECORDS,
  advisorUnread: 3,
  // AI Advisor conversations. Stand-in for a `chats` table (+ `messages` table).
  // TODO(backend): GET /chats on load, POST /chats on first message,
  // POST /chats/:id/messages per message, DELETE /chats/:id.
  chats: [], // [{ id, title, createdAt, updatedAt, messages: [{ id, role, text, at }] }]
  activeChatId: null, // null = the default "new chat" screen
  typingChatId: null, // chat waiting for an AI reply, or 'dashboard' (not persisted)
  // The Dashboard panel keeps exactly one running conversation.
  // TODO(backend): store it as a chat with kind = 'dashboard'.
  dashboardChat: [], // [{ id, role, text, at }]
  dismissedRecs: [],
});

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...initialState(), ...JSON.parse(raw), typingChatId: null };
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
      // 'dashboard' is the Dashboard panel's single conversation.
      if (action.chatId === 'dashboard') return { ...state, dashboardChat: [...state.dashboardChat, action.message] };
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id === action.chatId ? { ...c, messages: [...c.messages, action.message], updatedAt: action.message.at } : c
        ),
      };
    case 'addDashboardMessage':
      return { ...state, dashboardChat: [...state.dashboardChat, action.message] };
    case 'clearDashboardChat':
      return { ...state, dashboardChat: [] };
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
      return initialState();
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
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      const { typingChatId, ...saved } = state; // eslint-disable-line no-unused-vars
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
