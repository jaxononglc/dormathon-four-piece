import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';

// tone: 'up' (green), 'down' (red), 'neutral' (indigo)
export default function KpiCard({ label, value, icon: Icon, delta, tone = 'up' }) {
  const TrendIcon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Sparkles;
  return (
    <div className="card kpi">
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
    </div>
  );
}
