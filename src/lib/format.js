export const rm = (n, decimals = 0) =>
  `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const rm2 = (n) => rm(n, 2);

export const pct = (n, decimals = 0) => `${(n * 100).toFixed(decimals)}%`;

export const signedPct = (n, decimals = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(decimals)}%`;

// ---- Dates (all ISO yyyy-mm-dd, local time) ----
export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dayShort = (iso) => DAY_SHORT[parseISO(iso).getDay()];
export const dayNum = (iso) => parseISO(iso).getDate();
export const shortDate = (iso) => {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
};
export const longDate = (iso) => {
  const d = parseISO(iso);
  return `${DAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
};
export const dayLabel = (iso) => {
  const d = parseISO(iso);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
};

// Sunday that starts the week containing `iso`.
export const weekStart = (iso) => addDays(iso, -parseISO(iso).getDay());

export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

// ---- CSV download ----
export function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Today on this device, as yyyy-mm-dd.
export const localToday = () => toISO(new Date());

// Monday of the week containing `iso` (the Dashboard week runs Mon–Sun).
export const mondayOf = (iso) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));

// "Kedai Kak Ros" → "KR" (avatar letters).
export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).filter((c) => /[A-Za-z0-9]/.test(c)).slice(-2).join('').toUpperCase() || '?';
