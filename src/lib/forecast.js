// Sales forecast for the Dashboard chart: Gemini predicts from the shop's daily revenue
// (POST /api/forecast). Answers are cached in this browser per date + data, so Gemini is
// only asked again after new sales are saved or the day changes. If Gemini can't answer,
// a plain code estimate (average of the same weekday, else of recent days) is used.
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { addDays, parseISO } from './format';
import { UPCOMING } from '../data/config';

const CACHE_KEY = 'bijak-forecast-v1';
const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};
const writeCache = (key, value) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ [key]: value })); } catch { /* storage blocked */ }
};

// Average of the same weekday in the last 4 weeks (recorded days only), else of the last 7 recorded days.
export function estimate(date, today, revenueOn) {
  const same = [1, 2, 3, 4].map((w) => addDays(date, -7 * w)).filter((d) => d <= today).map(revenueOn).filter((v) => v > 0);
  const recent = Array.from({ length: 7 }, (_, i) => revenueOn(addDays(today, -i))).filter((v) => v > 0);
  const pick = same.length ? same : recent;
  if (!pick.length) return null;
  const avg = Math.round(pick.reduce((s, v) => s + v, 0) / pick.length / 10) * 10;
  const day = parseISO(date).toLocaleDateString('en-MY', { weekday: 'long' });
  return { revenue: avg, reason: same.length ? `Average of your last ${same.length} ${day}${same.length === 1 ? '' : 's'}` : `Average of your last ${recent.length} recorded days` };
}

/**
 * @param {string[]} dates  future yyyy-mm-dd dates to forecast
 * @param {string} today
 * @param {(iso: string) => number} revenueOn  revenue on a day (store.salesFor(d).sales)
 * @param {boolean} aiEnabled
 * @returns {{ [date]: { revenue, reason, source: 'ai' | 'estimate' } }, loading: boolean }
 */
export function useForecast(dates, today, revenueOn, aiEnabled) {
  // The last 8 weeks of revenue: when this changes, the forecast is redone.
  const history = useMemo(() => Array.from({ length: 56 }, (_, i) => revenueOn(addDays(today, -i))), [today, revenueOn]);
  const key = JSON.stringify([today, dates, history]);

  const fallback = useMemo(() => {
    const out = {};
    for (const d of dates) {
      const e = estimate(d, today, revenueOn);
      if (e) out[d] = { ...e, source: 'estimate' };
    }
    return out;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ai, setAi] = useState(() => readCache()[key] || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = readCache()[key];
    if (cached) return setAi(cached);
    setAi(null);
    if (!aiEnabled || !dates.length || !history.some((v) => v > 0)) return;
    let alive = true;
    setLoading(true);
    api('POST', '/forecast', { today, dates, events: UPCOMING })
      .then(({ forecasts }) => {
        const map = Object.fromEntries(forecasts.map((f) => [f.date, { revenue: f.revenue, reason: f.reason, source: 'ai' }]));
        writeCache(key, map);
        if (alive) setAi(map);
      })
      .catch((err) => console.warn('Forecast from Gemini failed, using the estimate:', err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, aiEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { forecast: { ...fallback, ...(ai || {}) }, loading };
}
