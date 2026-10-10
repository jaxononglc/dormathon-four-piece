// Tiny client for the /api routes in server/api.js.
import { dayLabel } from './format';
export async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// Store action → API call that saves it. `state` is the store *before* the action.
// Actions not listed here (openChat, setTyping, rollDashboard…) are UI-only.
export function syncAction(action, state) {
  const chatPath = (chatId) => (chatId === 'dashboard' ? `dashboard-${state.dashboardDate}` : chatId);
  switch (action.type) {
    case 'addProduct':
      return api('POST', '/products', { product: action.product });
    case 'updateProduct':
      return api('PATCH', `/products/${encodeURIComponent(action.id)}`, { patch: action.patch });
    case 'deleteProduct':
      return api('DELETE', `/products/${encodeURIComponent(action.id)}`);
    case 'addOption':
      return api('POST', '/options', { list: action.list, name: action.name });
    case 'addSale':
      return api('POST', '/sales', { sale: action.sale });
    case 'editSale':
      return api('PUT', `/sales/${encodeURIComponent(action.id)}`, { lines: action.lines });
    case 'saveDamage':
      return api('PUT', `/damage/${action.date}`, { lines: action.lines });
    case 'dismissRec':
      return api('POST', '/dismissed', { id: action.id });
    case 'startChat':
      return api('POST', '/chats', { chat: action.chat });
    case 'deleteChat':
      return api('DELETE', `/chats/${encodeURIComponent(action.id)}`);
    case 'addMessage':
    case 'addDashboardMessage': {
      const chatId = action.type === 'addDashboardMessage' ? 'dashboard' : action.chatId;
      // Each day's Dashboard chat is created with its first message.
      const chat = chatId === 'dashboard' ? { kind: 'dashboard', day: state.dashboardDate, title: `Dashboard · ${dayLabel(state.dashboardDate)}` } : undefined;
      return api('POST', `/chats/${encodeURIComponent(chatPath(chatId))}/messages`, { message: action.message, chat });
    }
    case 'clearDashboardChat':
      return api('DELETE', `/chats/${chatPath('dashboard')}/messages`);
    case 'clearAdviceChat':
      return Promise.all([api('DELETE', '/chats/advice/messages'), api('DELETE', '/dismissed')]);
    case 'reset':
      return api('POST', '/reset');
    default:
      return null;
  }
}
