// Turns the text an OCR engine read from a sales sheet into rows: which product, how many
// sold, how many damaged. Plain code, no AI. Used by lib/scan.js, and easy to test on its own.
//
// What it understands, per line:
//   "Kek Lapis Sarawak   34   2"          first number = sold, second = damaged
//   "Brownies  sold 20  rosak 2"          words say which number is which
//   "Cupcakes 8 damaged"                  a number followed by "damaged" is damaged
//   "BKD-BR-03   12"                      the SKU works instead of the name
// A header line with both words ("Damaged … Sold") decides the order of two plain numbers.
// A table with a header row ("Item Name … Item Sold") is read by column; see the end of this file.

const STOP = new Set(['of', 'the', 'and', 'dan', 'x']);

const SOLD_WORDS = /^(sold|sld|terjual|jual|sale|sales|laku|卖|售)$/i;
// Short forms people write: DG (damaged goods), dmg, dmgd, rsk …
const DAMAGED_WORDS = /^(damaged?|damage|d\.?g\.?|dmg|dmgd|dam|rosak|rusak|rsk|reject|rejected|broken|buang|spoilt|spoiled|破|坏|报废|损)$/i;
const SKIP_LINE = /^(total|jumlah|grand|date|tarikh|tanggal|day|hari)\b/i;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogos: 8, sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12 };

const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (s) => normalize(s).split(' ').filter(Boolean);

// 1 = identical, 0 = nothing in common (Levenshtein, so "brownles" still matches "brownies").
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

// The words of a product name that identify it (text in brackets like "(box of 9)" is left out).
const nameWords = (name) => words(name.replace(/\([^)]*\)/g, ' ')).filter((w) => w.length >= 2 && !STOP.has(w));

// How well a line matches a product: share of its name words found in the line (0–1).
function matchScore(product, lineWords, lineAlnum) {
  const sku = product.sku ? product.sku.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  if (sku.length >= 5 && lineAlnum.includes(sku)) return 1;
  const pw = nameWords(product.name);
  if (!pw.length) return 0;
  let hit = 0;
  let strong = false;
  for (const w of pw) {
    const need = w.length <= 3 ? 1 : w.length <= 5 ? 0.8 : 0.72; // short words must be exact-ish
    const best = Math.max(0, ...lineWords.filter((l) => l.length >= 2 && !/^\d+$/.test(l)).map((l) => similarity(w, l)));
    if (best >= need) {
      hit += 1;
      if (w.length >= 4) strong = true;
    }
  }
  return strong || pw.length === hit ? hit / pw.length : 0;
}

// "O", "l", "I" and "|" are often how OCR reads 0 and 1, so numbers tolerate them.
const asNumber = (raw) => {
  let t = raw.replace(/^[x×]+/i, '').replace(/[x×]+$/i, '').replace(/(pcs|pc|units?|pkt|box|tin|jar|btl)$/i, '');
  if (!/^[\dOoIl|]{1,4}$/.test(t)) return null;
  if (!/\d/.test(t) && t.length > 2) return null;
  t = t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

// Date written on the sheet ("10/10/2026", "10 Oct", "10-10-26") → yyyy-mm-dd, or null.
export function findDate(text, today) {
  const year = Number(today.slice(0, 4));
  const ok = (y, m, d) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const full = (y) => (y < 100 ? 2000 + y : y);
  let m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m && ok(full(+m[3]), +m[2], +m[1])) return iso(full(+m[3]), +m[2], +m[1]); // day first, like Malaysia
  m = text.match(/\b(\d{1,2})\s*([a-z]{3,4})[a-z]*\.?,?\s*(\d{2,4})?\b/i);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3] ? full(+m[3]) : year;
    if (ok(y, MONTHS[m[2].toLowerCase()], +m[1])) return iso(y, MONTHS[m[2].toLowerCase()], +m[1]);
  }
  return null;
}

/**
 * @param {{ text: string, confidence?: number, words?: { text: string, confidence: number }[] }[]} lines  OCR lines, top to bottom (confidence 0–100)
 * @param {{ id: string, name: string, sku?: string }[]} products
 * @param {string} today  yyyy-mm-dd
 * @returns {{ date: string|null, items: { productId: string, rawText: string, units: number, damaged: number, confidence: number }[], unmatched: string[] }}
 */
export function parseSheet(lines, products, today) {
  const clean = withTables(lines)
    .map((l) => ({ text: String(l.text || '').replace(/\s+/g, ' ').trim(), conf: Number.isFinite(l.confidence) ? l.confidence / 100 : 0.7, words: l.words || [] }))
    .filter((l) => l.text);

  // Header with both words: tells which of two plain numbers is sold and which is damaged.
  let damagedFirst = false;
  for (const l of clean) {
    const ws = l.text.split(/[\s,;:/|]+/);
    const s = ws.findIndex((w) => SOLD_WORDS.test(w));
    const d = ws.findIndex((w) => DAMAGED_WORDS.test(w));
    if (s >= 0 && d >= 0 && !ws.some((w) => asNumber(w) !== null)) { damagedFirst = d < s; break; }
  }

  const items = new Map();
  const unmatched = [];
  let date = null;

  for (const l of clean) {
    date ||= findDate(l.text, today);
    if (SKIP_LINE.test(l.text)) continue;

    const lineWords = words(l.text);
    const lineAlnum = l.text.toLowerCase().replace(/[^a-z0-9]/g, '');
    let best = null;
    for (const p of products) {
      const score = matchScore(p, lineWords, lineAlnum);
      if (score >= 0.5 && (!best || score > best.score || (score === best.score && nameWords(p.name).length > nameWords(best.p.name).length))) best = { p, score };
    }

    // Remove the product's SKU and any "(…)" text so their digits are not read as counts.
    let rest = l.text.replace(/\([^)]*\)/g, ' ');
    if (best?.p.sku) rest = rest.replace(new RegExp(best.p.sku.split('').map((c) => (/[a-z0-9]/i.test(c) ? c : '[-\\s]?')).join('[-\\s]?'), 'i'), ' ');
    const tokens = rest.split(/[\s,;:/\\[\]{}=<>~_|—–-]+/).filter(Boolean);

    // Walk the tokens: a number belongs to the word before or after it ("rosak 2", "2 rosak"), else to its position.
    let sold = null;
    let damaged = null;
    let mode = null;
    let plain = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (SOLD_WORDS.test(t)) { mode = 'sold'; continue; }
      if (DAMAGED_WORDS.test(t)) { mode = 'damaged'; continue; }
      const n = asNumber(t);
      if (n === null) continue;
      const next = tokens[i + 1] || '';
      // The word before the number wins ("sold 12 rosak 2"); otherwise the word after it ("2 rosak").
      // But "3 DG 2" is sold 3 and damaged 2: a word that has its own number after it does not claim this one.
      const nextHasOwn = asNumber(tokens[i + 2] || '') !== null;
      let slot = mode || (nextHasOwn ? null : SOLD_WORDS.test(next) ? 'sold' : DAMAGED_WORDS.test(next) ? 'damaged' : null);
      if (!slot) {
        if (plain >= 2) continue; // a third number is probably a total or a price
        slot = (plain === 0) !== damagedFirst ? 'sold' : 'damaged';
        plain += 1;
      }
      if (slot === 'sold') sold = (sold || 0) + n;
      else damaged = (damaged || 0) + n;
      mode = null;
    }

    if (!best) {
      if (/\p{L}{3,}/u.test(rest) && (sold !== null || damaged !== null) && !(SOLD_WORDS.test(lineWords[0] || '') || DAMAGED_WORDS.test(lineWords[0] || ''))) unmatched.push(l.text);
      continue;
    }
    // A stray symbol where a digit should be ("Cupcakes % 0") means the numbers were not read properly.
    const noisy = l.words.some((w) => /[%©@#$&*?!^=]/.test(w.text || ''));
    if (sold === null && damaged === null && !noisy) continue; // a product name with no number on its line
    const units = sold || 0;
    const dmg = damaged || 0;
    // How sure OCR was about the digits themselves: a misread number usually has a low word confidence.
    const numConf = l.words.filter((w) => asNumber(w.text || '') !== null && Number.isFinite(w.confidence)).map((w) => w.confidence / 100);
    let confidence = Math.min(l.conf * (0.5 + 0.5 * best.score), ...numConf);
    if (noisy) confidence = Math.min(confidence, 0.4);
    confidence = Math.max(0, Math.min(1, confidence));
    const prev = items.get(best.p.id);
    items.set(best.p.id, prev
      ? { ...prev, units: prev.units + units, damaged: prev.damaged + dmg, rawText: `${prev.rawText}; ${l.text}`, confidence: Math.min(prev.confidence, confidence) }
      : { productId: best.p.id, rawText: l.text, units, damaged: dmg, confidence });
  }

  // Rows with 0 sold and 0 damaged are dropped, unless the photo was unclear there (low confidence): the user should see those.
  return { date, items: [...items.values()].filter((i) => i.units > 0 || i.damaged > 0 || i.confidence < 0.5), unmatched };
}

// ---------------------------------------------------------------------------------------------
// Tables. A sheet like
//     Item ID | Item Name           | Item Cost Price (RM) | Item Sold
//        7    | Kotak kek 8"        |         0.8          |    3
// is read by its header row: only the name column and the sold / damaged columns are used, so IDs and
// prices never get mistaken for counts. Needs word positions from OCR (bbox).
// ---------------------------------------------------------------------------------------------
const bboxOk = (w) => w?.bbox && Number.isFinite(w.bbox.x0) && Number.isFinite(w.bbox.x1) && Number.isFinite(w.bbox.y0) && Number.isFinite(w.bbox.y1);
const median = (xs, fallback) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : fallback);
const heightOf = (ws) => median(ws.filter(bboxOk).map((w) => w.bbox.y1 - w.bbox.y0), 20);

/** OCR words with positions → text rows, top to bottom (words whose vertical centres are close share a row). */
export function groupRows(wordList) {
  const ws = wordList.filter((w) => String(w.text || '').trim() && bboxOk(w));
  if (!ws.length) return [];
  const h = heightOf(ws);
  const yc = (w) => (w.bbox.y0 + w.bbox.y1) / 2;
  const rows = [];
  for (const w of [...ws].sort((a, b) => yc(a) - yc(b))) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.yc - yc(w)) < h * 0.6) {
      row.words.push(w);
      row.yc = row.words.reduce((s, x) => s + yc(x), 0) / row.words.length;
    } else rows.push({ yc: yc(w), words: [w] });
  }
  return rows.map((r) => {
    const sorted = r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    return { text: sorted.map((w) => w.text).join(' '), confidence: sorted.reduce((s, w) => s + (Number.isFinite(w.confidence) ? w.confidence : 70), 0) / sorted.length, words: sorted };
  });
}

// What a header means. Cost / price / ID columns are 'ignore' so their numbers are never read as counts.
function headerKind(label) {
  if (/sold|terjual|jual|laku|卖|售/.test(label)) return 'sold';
  if (/damag|rosak|rusak|reject|broken|buang|spoil|\bd\.?g\.?$|\bdmg|破|坏|报废/.test(label)) return 'damaged';
  if (/cost|price|harga|amount|total|jumlah|\brm\b|value|nilai/.test(label)) return 'ignore';
  if (/\bid\b|\bno\.?\b|\bbil\b|\bcode\b|\bkod\b|\bsku\b|#/.test(label)) return 'ignore';
  if (/name|nama|product|produk|barang|description|perihal|item$/.test(label)) return 'name';
  if (/qty|quantity|kuantiti|units?\b/.test(label)) return 'qty';
  return 'other';
}

// The columns of a header row (words close together make one label), or null if the row is not a header.
function headerColumns(row) {
  const ws = row.words || [];
  if (ws.length < 2 || !ws.every(bboxOk) || ws.some((w) => asNumber(w.text) !== null)) return null;
  const h = heightOf(ws);
  const cols = [];
  for (const w of ws) {
    const last = cols[cols.length - 1];
    // Words of one label ("Item Cost Price (RM)") sit about a space apart; separate columns are further apart.
    // "Sold" and "Damaged" are never one label, however close they are.
    const k = headerKind(w.text.toLowerCase());
    const before = last ? last.words.map((x) => headerKind(x.text.toLowerCase())) : [];
    const clash = (k === 'sold' && before.includes('damaged')) || (k === 'damaged' && before.includes('sold'));
    if (last && !clash && w.bbox.x0 - last.x1 < h * 0.9) { last.words.push(w); last.x1 = Math.max(last.x1, w.bbox.x1); }
    else cols.push({ words: [w], x0: w.bbox.x0, x1: w.bbox.x1 });
  }
  for (const c of cols) {
    c.label = c.words.map((w) => w.text).join(' ').toLowerCase();
    c.kind = headerKind(c.label);
  }
  if (cols.length < 2 || !cols.some((c) => ['sold', 'damaged', 'qty'].includes(c.kind))) return null;
  if (!cols.some((c) => c.kind === 'sold' || c.kind === 'damaged')) cols.forEach((c) => { if (c.kind === 'qty') c.kind = 'sold'; });
  return cols;
}

// A data row → one tidy line: "<name> sold <n> damaged <n>" (the rest of the line parser then handles it).
function readTableRow(row, cols) {
  const h = heightOf(row.words);
  const inCol = new Map(cols.map((c) => [c, []]));
  for (const w of row.words) {
    // The column whose header is nearest sideways (numbers are often right-aligned under a centred header).
    let best = null;
    let dist = Infinity;
    for (const c of cols) {
      const d = w.bbox.x1 < c.x0 ? c.x0 - w.bbox.x1 : w.bbox.x0 > c.x1 ? w.bbox.x0 - c.x1 : 0;
      if (d < dist) { dist = d; best = c; }
    }
    if (dist <= h * 6) inCol.get(best).push(w);
  }
  const of = (kind) => cols.filter((c) => c.kind === kind).flatMap((c) => inCol.get(c));
  const hasName = cols.some((c) => c.kind === 'name');
  const nameWords = hasName ? of('name') : row.words.filter((w) => asNumber(w.text) === null && !of('ignore').includes(w));
  const firstNumber = (ws) => { for (const w of ws) { const n = asNumber(w.text); if (n !== null) return n; } return null; };
  let soldWords = of('sold');
  let damWords = of('damaged');
  const dataCols = cols.filter((c) => c.kind === 'sold' || c.kind === 'damaged');
  // Hand-written columns are rarely lined up with their headers. If two numbers fell under the same
  // header, give them to the data columns from left to right instead ("24  2" → sold 24, damaged 2).
  const numbersIn = (ws) => ws.filter((w) => asNumber(w.text) !== null);
  if (dataCols.length >= 2 && (numbersIn(soldWords).length > 1 || numbersIn(damWords).length > 1)) {
    const nums = numbersIn([...soldWords, ...damWords]).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    soldWords = [];
    damWords = [];
    dataCols.forEach((c, i) => { if (nums[i]) (c.kind === 'sold' ? soldWords : damWords).push(nums[i]); });
  }
  const sold = firstNumber(soldWords);
  const damaged = firstNumber(damWords);
  const name = nameWords.map((w) => w.text).join(' ').trim();
  if (!name) return null;
  const used = [...nameWords, ...soldWords, ...damWords];
  const text = `${name}${sold !== null ? ` sold ${sold}` : ''}${damaged !== null ? ` damaged ${damaged}` : ''}`;
  return { text, confidence: used.reduce((s, w) => s + (Number.isFinite(w.confidence) ? w.confidence : 70), 0) / used.length, words: used };
}

// Replace each table's header row and data rows by tidy lines; other rows pass through untouched.
function withTables(rows) {
  const out = [];
  let cols = null;
  for (const row of rows) {
    const header = headerColumns(row);
    if (header) { cols = header; continue; }
    if (cols && row.words?.length && row.words.every(bboxOk)) {
      const tidy = readTableRow(row, cols);
      if (tidy) out.push(tidy);
      continue;
    }
    out.push(row);
  }
  return out;
}
