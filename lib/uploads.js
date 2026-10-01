// Bilder aus Spielen (z.B. Screenshots): hochladen und ausliefern. Läuft nur auf dem Server.
//
// Ein Spiel bekommt nach dem Hochladen nur die id und speichert sie im Spielstand.
// Fremde Bilder liefert der Server nur aus, wenn das Spiel sie dir gerade zeigt, also wenn die id
// in deiner view() vorkommt. So bleiben z.B. geheime Einsendungen bis zur Auflösung geheim.
// Gelöscht werden die Bilder eines Zimmers, sobald dort ein neues Spiel startet oder jemand
// in die Lobby geht (lib/room.js), spätestens nach KEEP_DAYS.

import { getStore } from './store/index.js';
import { UserError, currentView, roomCode } from './room.js';

const MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_PER_PLAYER = 30; // pro Zimmer und Partie, auch gelöschte Einsendungen zählen mit
const KEEP_DAYS = 3;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Die ersten Bytes jedes erlaubten Formats. Andere Dateien (z.B. SVG mit Skript) werden abgelehnt.
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

/** Speichert ein Bild. msg = { room, type, data (Base64) }. Rückgabe: { id } */
export async function saveUpload(msg, user) {
  const store = getStore();
  const code = roomCode(msg.room);
  const room = await store.get(code);
  if (!room) throw new UserError('Dieses Spielzimmer gibt es nicht mehr.', 404);
  if (!room.data.players.some((p) => p.id === user.id)) {
    throw new UserError('Du spielst in diesem Spielzimmer nicht mit.', 403);
  }
  if (!room.data.game || room.data.game.state.result) throw new UserError('Gerade läuft kein Spiel.');

  const type = String(msg.type ?? '');
  const base64 = String(msg.data ?? '');
  if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new UserError('Das Bild ist zu groß.', 413);
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || !SIGNATURES[type]?.(bytes)) throw new UserError('Das ist kein Bild (JPEG, PNG oder WebP).');
  if ((await store.countUploads(code, user.id)) >= MAX_PER_PLAYER) {
    throw new UserError('Du hast in diesem Spiel schon zu viele Bilder hochgeladen.');
  }

  await store.removeOldUploads(new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString());
  const id = await store.addUpload({
    room_code: code,
    owner: user.id,
    type,
    data: bytes.toString('base64'),
    size: bytes.length,
  });
  return { id };
}

/** Lädt ein Bild, wenn `user` es sehen darf. Rückgabe: { type, bytes } */
export async function loadUpload(id, user) {
  const missing = new UserError('Dieses Bild gibt es nicht (mehr).', 404);
  if (!ID.test(id)) throw missing;
  const store = getStore();
  const upload = await store.getUpload(id);
  if (!upload) throw missing;
  if (upload.owner !== user.id) {
    const room = await store.get(upload.room_code);
    if (!room?.data.players.some((p) => p.id === user.id)) throw missing;
    if (!JSON.stringify(currentView(room, user.id) ?? null).includes(id)) throw missing;
  }
  return { type: upload.type, bytes: Buffer.from(upload.data, 'base64') };
}
