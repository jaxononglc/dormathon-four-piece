// Photo of a sales sheet → { date, items, unmatched }, read on this device with OCR
// (tesseract.js) and matched to your products by plain code (lib/ocrParse.js).
// No AI service and no upload: the photo never leaves the phone.
//
// OCR reads printed or neat block writing well, and messy joined-up handwriting poorly,
// so every row is shown for checking before anything is saved.
import { groupRows, parseSheet } from './ocrParse';

const MAX_SIDE = 2200; // OCR needs the letters to be big enough, so this is larger than for upload
const MIN_SIDE = 1200; // small photos are enlarged a little
const IDLE_MS = 60_000; // the OCR engine is kept for a minute so a second scan starts at once

// Draw the photo on a canvas at a good size, in grey with the contrast stretched.
async function prepare(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser cannot open that photo format. Try a JPEG or PNG (HEIC photos work on iPhone / Safari)');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > MAX_SIDE ? MAX_SIDE / longest : longest < MIN_SIDE ? MIN_SIDE / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g] += 1;
  }
  // Stretch between the 2nd and 98th percentile so dim photos and grey paper get readable.
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.02; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.02; hi--);
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// One shared OCR engine (loaded the first time, from the tesseract.js CDN, then cached by the browser).
let enginePromise = null;
let idleTimer = null;
let onProgress = null;
async function engine() {
  clearTimeout(idleTimer);
  enginePromise ||= import('tesseract.js').then(async ({ createWorker, PSM }) => {
    const worker = await createWorker('eng', 1, { logger: (m) => onProgress?.(m) });
    // One block of text: keeps a row's name and its numbers on the same line.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
    return worker;
  });
  return enginePromise;
}
function releaseSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const p = enginePromise;
    enginePromise = null;
    (await p?.catch(() => null))?.terminate();
  }, IDLE_MS);
}

// The text rows OCR found, top to bottom, each with a 0–100 confidence. Words are regrouped into rows
// by their position, so table columns stay on the same row (and the parser can read them by column).
function linesOf(data) {
  const lines = (data.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((p) => p.lines || []));
  const words = lines.flatMap((l) => l.words || []);
  if (words.length && words.every((w) => w.bbox)) return groupRows(words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })));
  if (lines.length) return lines.map((l) => ({ text: l.text, confidence: l.confidence, words: (l.words || []).map((w) => ({ text: w.text, confidence: w.confidence })) }));
  return String(data.text || '').split('\n').map((text) => ({ text, confidence: data.confidence }));
}

/**
 * @param {File} file  image picked or taken with the camera
 * @param {object[]} products  products the sheet can mention ({ id, name, sku })
 * @param {string} today  yyyy-mm-dd
 * @param {(percent: number, step: string) => void} [progress]  called while it works
 * @returns {Promise<{date: string|null, items: {productId: string, rawText: string, units: number, damaged: number, confidence: number}[], unmatched: string[]}>}
 */
export async function scanSalesRecord(file, products, today, progress) {
  if (!file.type.startsWith('image/') && !/\.hei[cf]$/i.test(file.name)) throw new Error('Please choose a photo');
  progress?.(0, 'Preparing photo');
  const canvas = await prepare(file);

  progress?.(0, 'Loading reader');
  onProgress = (m) => {
    if (m.status === 'recognizing text') progress?.(Math.round(m.progress * 100), 'Reading the sheet');
    else if (/load|initializ/.test(m.status || '')) progress?.(Math.round((m.progress || 0) * 100), 'Loading reader');
  };
  try {
    const worker = await engine();
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    return parseSheet(linesOf(data), products, today);
  } finally {
    onProgress = null;
    releaseSoon();
  }
}

// Below this the row is highlighted for the user to check.
export const SURE = 0.75;
