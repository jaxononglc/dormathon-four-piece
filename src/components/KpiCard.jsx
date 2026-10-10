import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Sparkles, ArrowUpRight } from 'lucide-react';

// tone: 'up' (green), 'down' (red), 'neutral' (indigo)
// to: optional route — the whole card becomes a link (e.g. "/inventory?level=restock").
export default function KpiCard({ label, value, icon: Icon, delta, tone = 'up', to, hint }) {
  const TrendIcon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Sparkles;
  const body = (
    <>
      <div className="kpi__top">
        <span className="kpi__label">{label}</span>
        <span className="icon-tile">{Icon && <Icon size={16} />}</span>
      </div>
      <div className="kpi__value">{value}</div>
      {delta && (
        <span className={`delta delta--${tone}`}>
          <TrendIcon size={12} />
          {delta}
        </span>
      )}
      {to && <ArrowUpRight size={16} className="kpi__go" aria-hidden="true" />}
    </>
  );
  return to ? (
    <Link to={to} className="card kpi kpi--link" title={hint} aria-label={`${label}: ${value}. ${hint || 'Open details'}`}>
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  );
}
