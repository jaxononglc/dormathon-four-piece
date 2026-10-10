import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { PRODUCTS, SALES_RECORDS } from '../data/mockData';

const STORAGE_KEY = 'bijak-demo-v1';

const initialState = () => ({
  products: PRODUCTS,
  sales: SALES_RECORDS,
  advisorUnread: 3,
  dismissedRecs: [],
});

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...initialState(), ...JSON.parse(raw) };
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
