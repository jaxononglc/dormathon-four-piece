// One place that turns a chat history into an AI answer, used by both the
// AI Advisor page and the Dashboard panel.
import { advisorReply } from './advisor';
import { askGemini } from './gemini';

/**
 * @param {{role: 'user'|'ai', text: string}[]} history  oldest first; last item is the new question
 * @param {object} store  value from useStore()
 * @returns {Promise<string>}
 */
export async function getAiReply(history, store) {
  const question = history[history.length - 1]?.text || '';
  // Keyword-based answers are the offline fallback (no key, no network, quota hit…).
  const local = advisorReply(question, store).text;
  if (!store.aiEnabled) {
    await new Promise((r) => setTimeout(r, 600));
    return local;
  }
  try {
    return await askGemini(history, store);
  } catch (err) {
    console.warn('Gemini failed, using offline answer:', err);
    return `${local}\n\n(Offline answer — Gemini is unavailable: ${err.message})`;
  }
}

export const chatMessage = (role, text) => ({
  id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  role,
  text,
  at: Date.now(),
});
