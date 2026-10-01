// Bilder für Spiele hochladen (game.upload). Nur im Browser.
// Jedes Bild wird vorher verkleinert und als JPEG verschickt: schnell hochgeladen, klein in der Datenbank.

import { post } from './api';

const MAX_EDGE = 1600; // längste Seite in Pixeln
const MAX_BYTES = 1.4 * 1024 * 1024; // Server nimmt bis 1,5 MB

/**
 * source: Datei/Blob (z.B. aus <input type="file">) oder ein <canvas> (z.B. nach dem Zuschneiden).
 * Rückgabe: { id, width, height }
 */
export async function uploadImage(room, source) {
  const canvas = fitCanvas(source instanceof HTMLCanvasElement ? source : await decode(source));
  let blob;
  for (const quality of [0.85, 0.72, 0.6, 0.45]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Das Bild konnte nicht gelesen werden.');
    if (blob.size <= MAX_BYTES) break;
  }
  if (blob.size > MAX_BYTES) throw new Error('Das Bild ist zu groß.');
  const { id } = await post('/api/image', { room, type: blob.type, data: await base64(blob) });
  return { id, width: canvas.width, height: canvas.height };
}

async function decode(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('Das Bild konnte nicht gelesen werden. Bitte einen Screenshot (JPEG oder PNG) wählen.');
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Zeichnet Bild oder Canvas auf ein neues Canvas mit höchstens MAX_EDGE Pixeln Kantenlänge.
function fitCanvas(source) {
  const w = source.naturalWidth ?? source.width;
  const h = source.naturalHeight ?? source.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  if (scale === 1 && source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // durchsichtige PNGs bekommen weißes Papier statt Schwarz
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const base64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
