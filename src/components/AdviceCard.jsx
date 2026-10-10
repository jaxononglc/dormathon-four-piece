import { AlertTriangle, CalendarDays, CheckCircle2 } from 'lucide-react';

// One suggestion from lib/advice.js. Pass `item = null` for the "all good" card.
export default function AdviceCard({ item, onAction, onDismiss, disabled }) {
  if (!item) {
    return (
      <div className="rec-card">
        <span className="tag tag--green"><CheckCircle2 size={12} />All good</span>
        <p className="small">Nothing urgent right now.</p>
      </div>
    );
  }
  const Icon = item.tone === 'indigo' ? CalendarDays : AlertTriangle;
  return (
    <div className="rec-card">
      <span className={`tag tag--${item.tone}`}><Icon size={12} />{item.tag}</span>
      <div className="strong">{item.title}</div>
      <p className="small">{item.body}</p>
      <div className="row gap-8">
        <button className="btn btn--primary btn--xs" disabled={disabled} onClick={() => onAction(item)}>{item.action}</button>
        <button className="btn btn--ghost btn--xs" onClick={() => onDismiss(item)}>Not now</button>
      </div>
    </div>
  );
}
