import { useEffect, useRef, useState } from 'react';
import { rm } from '../lib/format';

const kfmt = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

// Vertical bars. Each item: { label, value, kind: 'past' | 'current' | 'forecast', tip }
export function BarChart({ data, height = 230, defaultIndex }) {
  const [hover, setHover] = useState(null);
  const W = 600;
  const pad = { l: 40, r: 8, t: 34, b: 26 };
  const ticks = niceTicks(0, Math.max(...data.map((d) => d.value), 1));
  const max = ticks[ticks.length - 1];
  const innerH = height - pad.t - pad.b;
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(34, slot * 0.45);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const active = hover ?? defaultIndex ?? data.findIndex((d) => d.kind === 'current');
  const a = data[active];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={0} y={y(t) + 4} className="tick">{kfmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2;
          const h = Math.max(2, y(0) - y(d.value));
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={innerH} fill="transparent" />
              <rect
                x={x} y={y(0) - h} width={bw} height={h} rx={6}
                className={`bar bar--${d.kind}${i === active ? ' bar--hover' : ''}`}
              />
              <text x={x + bw / 2} y={height - 6} textAnchor="middle" className={`xlabel${d.kind === 'current' ? ' xlabel--strong' : ''}`}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      {a && (
        <div
          className="chart-tip"
          style={{ left: `${((pad.l + slot * active + slot / 2) / W) * 100}%`, top: `${(y(a.value) / height) * 100}%` }}
        >
          {a.tip ?? `${a.label} · ${rm(a.value)}`}
        </div>
      )}
    </div>
  );
}

// Line + area for current period, dashed line for previous period.
// The SVG is drawn at the width it is shown at, so text and lines keep their real size on a
// phone (a fixed 1000-wide drawing shrunk to ~300px made everything tiny). On narrow
// screens it is a bit shorter and only some x labels are shown so they never overlap.
export function LineChart({ labels, current, previous, height: heightProp = 250 }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)) || 1000);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const small = W < 560;
  const height = small ? 220 : heightProp;
  const pad = small ? { l: 36, r: 14, t: 16, b: 30 } : { l: 44, r: 16, t: 20, b: 30 };
  const all = [...current, ...previous];
  const ticks = niceTicks(Math.min(...all) * 0.9, Math.max(...all) * 1.05);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i) => pad.l + (labels.length === 1 ? innerW / 2 : (innerW * i) / (labels.length - 1));
  const y = (v) => pad.t + innerH - ((v - lo) / (hi - lo)) * innerH;
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = `${path(current)} L${x(current.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  // Show every k-th label (always the last) so neighbours keep about 56px apart.
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 56))));
  const showLabel = (i) => (labels.length - 1 - i) % every === 0;
  const showDots = labels.length <= 14;
  // Tooltip and guide line only while hovering (or tapping) a point.
  const active = hover;
  const change = active != null && previous[active] ? current[active] / previous[active] - 1 : 0;

  return (
    <div className="chart" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Revenue trend">
        <defs>
          <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === lo ? 'axis' : 'grid'} />
            <text x={0} y={y(t) + 4} className="tick">{kfmt(t)}</text>
          </g>
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={path(previous)} className="line line--prev" />
        <path d={path(current)} className="line line--current" />
        {active != null && <line x1={x(active)} x2={x(active)} y1={pad.t} y2={y(lo)} className="guide" />}
        {current.map((v, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <rect x={x(i) - innerW / labels.length / 2} y={0} width={innerW / labels.length} height={height} fill="transparent" />
            {(showDots || i === active) && <circle cx={x(i)} cy={y(v)} r={i === active ? 6 : small ? 3.5 : 4} className="dot" />}
            {showLabel(i) && (
              <text x={x(i)} y={height - 8} textAnchor={small && i === 0 ? 'start' : small && i === labels.length - 1 ? 'end' : 'middle'} className="xlabel">{labels[i]}</text>
            )}
          </g>
        ))}
      </svg>
      {active != null && (
        <div
          className={`chart-tip chart-tip--rich${x(active) / W > 0.85 ? " chart-tip--end" : x(active) / W < 0.15 ? " chart-tip--start" : ""}`}
          style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(current[active]) / height) * 100}%` }}
        >
          <span className="chart-tip__label">{labels[active]}</span>
          <b>{rm(current[active])}</b>
          {previous[active] > 0 && (
            <span className={change >= 0 ? 'chart-tip__up' : 'chart-tip__down'}>
              {change >= 0 ? '+' : '−'}{Math.abs(change * 100).toFixed(0)}% vs previous
            </span>
          )}
        </div>
      )}
    </div>
  );
}
