import { Sparkles } from 'lucide-react';
import AdviceCard from './AdviceCard';
import { SHOP } from '../data/mockData';

const STARTERS = ['Should I stock up for Deepavali?', 'Why are sales up?', 'Which items lose money?'];

// A day's Dashboard conversation: greeting, the most urgent suggestion, the
// messages and (while empty) starter questions. Shared by the Dashboard panel
// and the Dashboard chats in AI Advisor, so both look the same.
// `rec`: suggestion object, null = nothing urgent, undefined = past day (no live card).
export default function DashboardThread({ messages, rec, typing, onAsk, onDismiss }) {
  const live = rec !== undefined;
  return (
    <>
      <div className="msg msg--ai">
        <div className="ai-avatar"><Sparkles size={13} /></div>
        <div className="bubble bubble--ai">Good morning, {SHOP.owner}! I checked last night’s sales and your stock. Here’s what I’d do today:</div>
      </div>
      {live && <AdviceCard item={rec} disabled={typing} onAction={(a) => onAsk(a.ask)} onDismiss={onDismiss} />}
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="msg msg--user"><div className="bubble bubble--user">{m.text}</div></div>
        ) : (
          <div key={m.id} className="msg msg--ai">
            <div className="ai-avatar"><Sparkles size={13} /></div>
            <div className="bubble bubble--ai pre">{m.text}</div>
          </div>
        )
      )}
      {typing && (
        <div className="msg msg--ai">
          <div className="ai-avatar"><Sparkles size={13} /></div>
          <div className="typing"><i /><i /><i /></div>
        </div>
      )}
      {live && messages.length === 0 && (
        <div className="chips chips--indent">
          {STARTERS.map((c) => (
            <button key={c} className="chip-btn" onClick={() => onAsk(c)}>{c}</button>
          ))}
        </div>
      )}
    </>
  );
}
