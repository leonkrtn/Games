// Der Hai auf dem Server (API-Route /api/hai). Regeln und Zustand: lib/hai.js.
// Der Hai wohnt im Spielzimmer einer Freundschaft (rooms.data.hai) und wird wie ein Zug mit
// Versionsprüfung gespeichert. Jedes Konto hat höchstens einen; gibt es durch gleichzeitiges Adoptieren
// doch zwei, gilt der ältere.

import { getStore } from './store/index.js';
import { FOOD, PLACE, advance, applyHai, createHai, haiName, placeTo, publicHai } from './hai.js';

const MAX_ATTEMPTS = 6;

export class HaiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Spielzimmer der angenommenen Freundschaften eines Kontos (ohne Gruppen)
async function friendRooms(store, userId) {
  const codes = (await store.listFriendships(userId))
    .filter((f) => f.status === 'accepted' && f.room_code)
    .map((f) => f.room_code);
  return (await store.getRooms(codes)).filter(
    (r) => !r.data.group && r.data.players.length === 2 && r.data.players.some((p) => p.id === userId),
  );
}

/** Der Raum mit dem Hai unter diesen Räumen, oder null. */
export function sharkRoom(rooms) {
  return rooms.filter((r) => r.data.hai).sort((a, b) => a.data.hai.since - b.data.hai.since)[0] ?? null;
}

const partnerOf = (room, userId) => {
  const p = room.data.players.find((x) => x.id !== userId);
  return p ? { id: p.id, name: p.name } : null;
};

function view(room, userId, now, extra = {}) {
  const h = advance(structuredClone(room.data.hai), now);
  return { room: room.code, now, me: userId, partner: partnerOf(room, userId), hai: publicHai(h), ...extra };
}

// Lädt den Raum, wendet fn(data, now) an und speichert mit Versionsprüfung (bei Konflikt nochmal).
async function change(store, code, user, fn) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = typeof code === 'string' ? await store.get(code.slice(0, 8)) : null;
    if (!room || room.data.group || !room.data.players.some((p) => p.id === user.id))
      throw new HaiError('Diesen Hai gibt es nicht mehr.', 404);
    const now = Date.now();
    const result = fn(room.data, now);
    if (!result) return { room, result: null, now };
    if (await store.update(room.code, room.version, room.data)) {
      room.version++;
      return { room, result, now };
    }
  }
  throw new HaiError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

// Benachrichtigung an die andere Person (Art „hai“, abschaltbar in den Einstellungen)
const note = (room, user, body) => {
  const other = partnerOf(room, user.id);
  return other
    ? [{ to: other.id, title: room.data.hai?.name ?? 'Hai', body, kind: 'hai', from: user.id, view: 'hai', url: '/?seite=hai', tag: 'hai', seq: room.version }]
    : [];
};

function noteText(event, user, name) {
  const who = user.display_name;
  switch (event.t) {
    case 'essen':
      return `${who} hat ${name} gefüttert: ${FOOD[event.item].name}.`;
    case 'trinken':
      return `${who} hat ${name} zu trinken gegeben: ${FOOD[event.item].name}.`;
    case 'putzen':
      return `${who} hat ${name} geputzt.`;
    case 'reise':
      return `${who} ist mit ${name} ${placeTo(PLACE[event.place])} gereist.`;
    case 'name':
      return `${who} hat euren Hai umbenannt. Er heißt jetzt ${name}.`;
    default:
      return null;
  }
}

/**
 * Eine Anfrage zum Hai. msg.t: get | adopt (friend, name) | essen, trinken (item) | putzen | reise (place)
 * | name (name) | freilassen; außer get und adopt mit msg.room (Raum-Code aus get).
 * @returns {{ body, notes?, pings? }} pings = Konten, deren Startseite und Hai-Seite neu laden sollen
 */
export async function handleHai(msg, user) {
  const store = getStore();

  if (msg.t === 'get') {
    const rooms = await friendRooms(store, user.id);
    const room = sharkRoom(rooms);
    if (room) return { body: view(room, user.id, Date.now()) };
    // Zur Auswahl: alle Freunde, mit dem Hinweis, wer schon einen Hai hat
    const friends = await Promise.all(
      rooms.map(async (r) => {
        const other = partnerOf(r, user.id);
        return { ...other, taken: Boolean(sharkRoom(await friendRooms(store, other.id))) };
      }),
    );
    return { body: { hai: null, now: Date.now(), friends: friends.sort((a, b) => a.name.localeCompare(b.name, 'de')) } };
  }

  if (msg.t === 'adopt') {
    const name = haiName(msg.name);
    const rooms = await friendRooms(store, user.id);
    if (sharkRoom(rooms)) throw new HaiError('Du hast schon einen Hai.');
    const target = rooms.find((r) => r.data.players.some((p) => p.id === msg.friend && p.id !== user.id));
    if (!target) throw new HaiError('Einen Hai teilen kannst du nur mit Freunden.', 404);
    const other = partnerOf(target, user.id);
    if (sharkRoom(await friendRooms(store, other.id))) throw new HaiError(`${other.name} hat schon einen Hai.`);
    const { room, now } = await change(store, target.code, user, (data, now) => {
      if (data.hai) throw new HaiError(`${other.name} hat schon einen Hai.`);
      data.hai = createHai(name, user.id, now);
      return true;
    });
    return {
      body: view(room, user.id, now),
      notes: note(room, user, `${user.display_name} hat einen Hai für euch beide adoptiert. Er heißt ${name}.`),
      pings: room.data.players.map((p) => p.id),
    };
  }

  if (msg.t === 'freilassen') {
    let name = '';
    const { room } = await change(store, msg.room, user, (data) => {
      if (!data.hai) throw new HaiError('Diesen Hai gibt es nicht mehr.', 404);
      name = data.hai.name;
      delete data.hai;
      return true;
    });
    const other = partnerOf(room, user.id);
    return {
      body: { hai: null, released: true },
      notes: other
        ? [{ to: other.id, title: name, body: `${user.display_name} hat ${name} ins Meer entlassen.`, kind: 'hai', from: user.id, view: 'hai', url: '/?seite=hai', tag: 'hai' }]
        : [],
      pings: room.data.players.map((p) => p.id),
    };
  }

  // Pflegen, reisen, umbenennen
  const { room, result, now } = await change(store, msg.room, user, (data, now) => {
    if (!data.hai) throw new HaiError('Diesen Hai gibt es nicht mehr.', 404);
    advance(data.hai, now);
    return applyHai(data.hai, user.id, msg, now);
  });
  if (!result) return { body: view(room, user.id, now) };
  const text = noteText(result, user, room.data.hai.name);
  return {
    body: view(room, user.id, now, { event: result }),
    notes: text ? note(room, user, text) : [],
    pings: room.data.players.map((p) => p.id),
  };
}
