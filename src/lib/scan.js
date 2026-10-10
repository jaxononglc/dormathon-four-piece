// Photo of a handwritten sales record → { date, items, unmatched } via POST /api/scan.
// The photo is shrunk here first: phone photos are 4000px+, which costs more tokens
// and uploads slowly without reading any better than ~1600px.
import { api } from './api';

const MAX_SIDE = 1600;
const MAX_RAW_BYTES = 2_900_000; // the server takes up to ~3 MB (MAX_IMAGE_CHARS in server/api.js)

// Windows often gives .heic files an empty type, so check the name too.
const heicType = (file) =>
  /^image\/hei[cf]$/.test(file.type) ? file.type : /\.hei[cf]$/i.test(file.name) ? `image/${file.name.slice(-4).toLowerCase()}` : null;

function base64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(new Error('Could not open the photo'));
    reader.readAsDataURL(file);
  });
}

async function compress(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Desktop Chrome/Edge cannot decode iPhone HEIC photos. Gemini can, so send the file as is.
    const type = heicType(file);
    if (!type) throw new Error('This photo format is not supported. Try a JPEG or PNG');
    if (file.size > MAX_RAW_BYTES) throw new Error('This HEIC photo is too large. Open it on the phone and send it as JPEG, or take a screenshot of it');
    return { mimeType: type, data: await base64(file) };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

/**
 * @param {File} file  image picked or taken with the camera
 * @param {object[]} products  products the record can mention
 * @param {string} today  yyyy-mm-dd
 * @returns {Promise<{date: string|null, items: {productId: string, rawText: string, units: number, confidence: number}[], unmatched: string[]}>}
 */
export async function scanSalesRecord(file, products, today) {
  if (!file.type.startsWith('image/') && !heicType(file)) throw new Error('Please choose a photo');
  const image = await compress(file);
  return api('POST', '/scan', {
    image,
    today,
    products: products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, unit: p.unit })),
  });
}

// Below this the row is highlighted for the user to check.
export const SURE = 0.75;
