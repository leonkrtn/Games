// Der Hai: ein Kuscheltier, um das sich zwei Freunde gemeinsam kümmern (Seite ?seite=hai).
// Er wohnt im Spielzimmer ihrer Freundschaft (rooms.data.hai), jedes Konto hat höchstens einen.
// Diese Datei läuft auf dem Server (lib/hai-server.js, lib/room.js) und im Browser (components/Hai.js):
// keine Imports, nur reine Funktionen auf dem gespeicherten Zustand.
//
// Werte (0 bis 100): essen, trinken, sauber. Sie sinken mit der Zeit, nachts (23 bis 7 Uhr in Berlin)
// kaum. Ist einer drei Stunden leer, schwimmt er weg und kommt am nächsten Morgen um sieben wieder.
// Reisemeilen gibt es für jede beendete Partie im gemeinsamen Spielzimmer und fürs Kümmern;
// genug Meilen schalten eine Reise an einen neuen Ort frei, von dort bringt er ein neues Essen mit.

export const H = 3600_000;
const DAY = 24 * H;
export const NEEDS = ['essen', 'trinken', 'sauber'];
const LASTS = { essen: 14, trinken: 12, sauber: 22 }; // Stunden (wach) von voll bis leer
const NIGHT_FACTOR = 0.1;
const AWAY_AFTER = 3 * H;
export const FULL = 92; // ab hier mag er nicht mehr essen bzw. trinken, putzen geht ab hier nicht
const CARE_BELOW = 75; // Kümmern bringt eine Meile, wenn der Wert vorher darunter lag
const CARE_MILES_PER_DAY = 8;
export const GAME_MILES = 3;
const LOG_LENGTH = 20;
const NAME_MAX = 16;

// Essen und Trinken. Neue Einträge nur hinten anhängen (der Zustand speichert die ids).
// messy: so viel Sauberkeit kostet es (Soße, Schokobart).
export const FOODS = [
  { id: 'fischstaebchen', name: 'Fischstäbchen', kind: 'essen' },
  { id: 'apfel', name: 'Apfel', kind: 'essen' },
  { id: 'spaghetti', name: 'Spaghetti', kind: 'essen', messy: 18 },
  { id: 'wasser', name: 'Wasser', kind: 'trinken' },
  { id: 'milch', name: 'Milch', kind: 'trinken' },
  { id: 'apfelsaft', name: 'Apfelsaft', kind: 'trinken' },
  { id: 'croissant', name: 'Croissant', kind: 'essen' },
  { id: 'pizza', name: 'Pizza', kind: 'essen', messy: 10 },
  { id: 'datteln', name: 'Datteln', kind: 'essen' },
  { id: 'banane', name: 'Banane', kind: 'essen' },
  { id: 'lassi', name: 'Mango-Lassi', kind: 'trinken' },
  { id: 'tee', name: 'Jasmintee', kind: 'trinken' },
  { id: 'onigiri', name: 'Onigiri', kind: 'essen' },
  { id: 'melone', name: 'Wassermelone', kind: 'essen', messy: 6 },
  { id: 'ananas', name: 'Ananas', kind: 'essen' },
  { id: 'pancakes', name: 'Pancakes', kind: 'essen', messy: 8 },
  { id: 'taco', name: 'Taco', kind: 'essen', messy: 10 },
  { id: 'kokos', name: 'Kokoswasser', kind: 'trinken' },
  { id: 'kakao', name: 'Heiße Schokolade', kind: 'trinken', messy: 12 },
];
export const FOOD = Object.fromEntries(FOODS.map((f) => [f.id, f]));
const STARTERS = ['fischstaebchen', 'apfel', 'spaghetti', 'wasser', 'milch', 'apfelsaft'];

// Orte der Weltkarte (lon/lat für die Karte). Zuhause ist der Start. Neue Orte nur hinten anhängen.
// at: Präposition für Sätze („in Paris“, „auf Hawaii“), to: Ziel („nach Paris“), seen: „war am Eiffelturm“
export const PLACES = [
  { id: 'zuhause', name: 'Zuhause', sight: 'Das Bett', seen: 'im Bett', lon: 10, lat: 51, at: 'zu Hause', to: 'nach Hause' },
  { id: 'paris', name: 'Paris', sight: 'Eiffelturm', seen: 'am Eiffelturm', lon: 2.35, lat: 48.86, souvenir: 'croissant' },
  { id: 'rom', name: 'Rom', sight: 'Kolosseum', seen: 'im Kolosseum', lon: 12.5, lat: 41.9, souvenir: 'pizza' },
  { id: 'kairo', name: 'Kairo', sight: 'Pyramiden von Gizeh', seen: 'an den Pyramiden von Gizeh', lon: 31.2, lat: 30, souvenir: 'datteln' },
  { id: 'kenia', name: 'Kenia', sight: 'Savanne', seen: 'in der Savanne', lon: 35.5, lat: -2.3, souvenir: 'banane' },
  { id: 'agra', name: 'Agra', sight: 'Taj Mahal', seen: 'am Taj Mahal', lon: 78, lat: 27.2, souvenir: 'lassi' },
  { id: 'peking', name: 'Peking', sight: 'Chinesische Mauer', seen: 'auf der Chinesischen Mauer', lon: 116.4, lat: 40.4, souvenir: 'tee' },
  { id: 'tokio', name: 'Tokio', sight: 'Fuji', seen: 'am Fuji', lon: 139.7, lat: 35.7, souvenir: 'onigiri' },
  { id: 'sydney', name: 'Sydney', sight: 'Opernhaus', seen: 'vor dem Opernhaus', lon: 151.2, lat: -33.9, souvenir: 'melone' },
  { id: 'hawaii', name: 'Hawaii', sight: 'Vulkan', seen: 'am Vulkan', lon: -155.5, lat: 19.6, at: 'auf Hawaii', to: 'nach Hawaii', souvenir: 'ananas' },
  { id: 'newyork', name: 'New York', sight: 'Freiheitsstatue', seen: 'an der Freiheitsstatue', lon: -74, lat: 40.7, souvenir: 'pancakes' },
  { id: 'mexiko', name: 'Mexiko', sight: 'Chichén Itzá', seen: 'in Chichén Itzá', lon: -88.6, lat: 20.7, souvenir: 'taco' },
  { id: 'rio', name: 'Rio de Janeiro', sight: 'Zuckerhut', seen: 'am Zuckerhut', lon: -43.2, lat: -22.9, souvenir: 'kokos' },
  { id: 'groenland', name: 'Grönland', sight: 'Eisberge', seen: 'bei den Eisbergen', lon: -45, lat: 68, souvenir: 'kakao' },
];
export const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const placeAt = (p) => p.at ?? `in ${p.name}`;
export const placeTo = (p) => p.to ?? `nach ${p.name}`;

/** Meilen, die bis einschließlich der n-ten Reise nötig sind (6, 16, 30, 48 …). */
export const milesForTrip = (n) => 6 * n + 2 * n * (n - 1);

/** Reisen: wie viele schon gemacht, wie viele frei, wie viele Meilen bis zur nächsten. */
export function trips(h) {
  const taken = h.visited.length - 1;
  let earned = 0;
  while (milesForTrip(earned + 1) <= h.miles) earned++;
  const left = PLACES.length - h.visited.length;
  const free = Math.max(0, Math.min(left, earned - taken));
  const from = milesForTrip(earned);
  const to = milesForTrip(earned + 1);
  return { taken, free, left, from, to, missing: free || !left ? 0 : milesForTrip(taken + 1) - h.miles };
}

/** Was er gerade essen und trinken kann: das Grundangebot und die Mitbringsel besuchter Orte. */
export function pantry(h) {
  const got = new Set([...STARTERS, ...h.visited.map((id) => PLACE[id]?.souvenir).filter(Boolean)]);
  return FOODS.filter((f) => got.has(f.id));
}

// --- Zeit: Tag und Nacht in Berlin ---

let fmt;
const offsets = new Map();
/** Abstand der Berliner Uhr zu UTC in ms zum Zeitpunkt t (Sommerzeit inklusive). */
function berlinOffset(t) {
  const key = Math.floor(t / H);
  let off = offsets.get(key);
  if (off !== undefined) return off;
  fmt ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(key * H)).map((x) => [x.type, Number(x.value)]));
  off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - key * H;
  if (offsets.size > 500) offsets.clear();
  offsets.set(key, off);
  return off;
}
const localTime = (t) => t + berlinOffset(t);
const localHour = (t) => Math.floor((((localTime(t) % DAY) + DAY) % DAY) / H);

export const isNight = (t) => {
  const h = localHour(t);
  return h >= 23 || h < 7;
};

// Abschnitt ab t bis zum nächsten Wechsel zwischen Tag und Nacht
function segment(t) {
  const off = berlinOffset(t);
  const l = t + off;
  const start = l - (((l % DAY) + DAY) % DAY);
  const hour = (l - start) / H;
  if (hour < 7) return { end: start + 7 * H - off, factor: NIGHT_FACTOR };
  if (hour < 23) return { end: start + 23 * H - off, factor: 1 };
  return { end: start + 31 * H - off, factor: NIGHT_FACTOR };
}

/** Der nächste Morgen um sieben (Berlin) nach t. */
export function nextMorning(t) {
  const off = berlinOffset(t);
  const l = t + off;
  let m = l - (((l % DAY) + DAY) % DAY) + 7 * H;
  if (m <= l) m += DAY;
  return m - berlinOffset(m - off);
}
const dayKey = (t) => new Date(localTime(t)).toISOString().slice(0, 10);

// --- Zustand ---

const round = (v) => Math.round(v * 100) / 100;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Name aus einer Anfrage: ein bis sechzehn Zeichen. */
export function haiName(value) {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) throw new Error('Bitte gib dem Hai einen Namen.');
  if ([...name].length > NAME_MAX) throw new Error('Der Name ist zu lang. Höchstens sechzehn Zeichen.');
  return name;
}

/** Ein neuer Hai, satt, getränkt und sauber, zu Hause. by = wer ihn adoptiert hat. */
export function createHai(name, by, now, random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const essen = pick(FOODS.filter((f) => f.kind === 'essen')).id;
  const trinken = pick(FOODS.filter((f) => f.kind === 'trinken')).id;
  const nicht = pick(FOODS.filter((f) => f.id !== essen && f.id !== trinken && f.id !== 'wasser')).id;
  return {
    v: 1,
    name,
    by,
    since: now,
    at: now,
    need: { essen: 85, trinken: 85, sauber: 100 },
    empty: {},
    away: null,
    miles: 0,
    care: { day: dayKey(now), miles: 0 },
    visited: ['zuhause'],
    place: 'zuhause',
    taste: { essen, trinken, nicht }, // geheim, bis man es herausfindet (known)
    known: [],
    seed: Math.floor(random() * 1e9),
    log: [{ at: now, by, t: 'adopt' }],
  };
}

function log(h, entry) {
  h.log.push(entry);
  if (h.log.length > LOG_LENGTH) h.log.splice(0, h.log.length - LOG_LENGTH);
}

/**
 * Rechnet den Zustand bis `now` weiter (verändert h): Werte sinken, er schwimmt weg oder kommt zurück.
 * In mehreren Schritten weitergerechnet ergibt dasselbe wie in einem.
 */
export function advance(h, now) {
  let t = h.at;
  for (let guard = 0; t < now && guard < 2000; guard++) {
    if (h.away) {
      if (h.away.back > now) break;
      t = h.away.back;
      h.need = { essen: 55, trinken: 55, sauber: 45 }; // kommt hungrig und etwas zerzaust zurück
      h.empty = {};
      h.away = null;
      log(h, { at: t, t: 'zurueck' });
      continue;
    }
    const { end, factor } = segment(t);
    let stop = Math.min(end, now);
    const leaveAt = Math.min(...NEEDS.map((k) => (h.empty[k] != null ? h.empty[k] + AWAY_AFTER : Infinity)));
    const zeroAt = {};
    for (const k of NEEDS) {
      const v = h.need[k];
      if (v <= 0) continue;
      zeroAt[k] = t + v / ((100 / (LASTS[k] * H)) * factor);
      stop = Math.min(stop, zeroAt[k]);
    }
    stop = Math.max(t, Math.min(stop, leaveAt));
    for (const k of NEEDS) {
      if (h.need[k] <= 0) continue;
      if (zeroAt[k] <= stop) {
        h.need[k] = 0;
        h.empty[k] = Math.round(zeroAt[k]);
      } else {
        h.need[k] = Math.max(0, h.need[k] - (100 / (LASTS[k] * H)) * factor * (stop - t));
      }
    }
    t = stop;
    if (leaveAt <= t) {
      const since = Math.round(t);
      h.away = { since, back: nextMorning(since + 4 * H) };
      log(h, { at: since, t: 'weg' });
    }
  }
  for (const k of NEEDS) h.need[k] = round(h.need[k]);
  if (now > h.at) h.at = now;
  return h;
}

/** Kopie, weitergerechnet bis now (für Anzeigen; der gespeicherte Zustand bleibt). */
export const current = (h, now) => advance(structuredClone(h), now);

/** Flecken auf dem Hai: Positionen aus SPOTS (Zeichnung), je schmutziger, desto mehr. */
export function stainCount(h) {
  const s = h.need.sauber;
  return s >= FULL ? 0 : Math.min(7, Math.max(1, Math.ceil((100 - s) / 13)));
}
export function stainOrder(h, spots) {
  const random = seeded(h.seed);
  const order = spots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Wie geht es ihm? Liste der Nöte (für Texte) und eine Stimmung für die Zeichnung. */
export function mood(h, now) {
  if (h.away) return { mood: 'weg', wants: [] };
  const wants = NEEDS.filter((k) => h.need[k] < 30);
  const low = Math.min(...NEEDS.map((k) => h.need[k]));
  return {
    mood: isNight(now) ? 'schlaf' : low < 15 ? 'traurig' : low < 45 ? 'mittel' : 'froh',
    wants,
  };
}

// Kümmern bringt eine Meile, wenn es nötig war, höchstens acht am Tag.
function careMile(h, before, now) {
  if (before >= CARE_BELOW) return 0;
  const day = dayKey(now);
  if (h.care.day !== day) h.care = { day, miles: 0 };
  if (h.care.miles >= CARE_MILES_PER_DAY) return 0;
  h.care.miles++;
  h.miles++;
  return 1;
}

/** Eine Partie im gemeinsamen Spielzimmer ist zu Ende. */
export function creditGame(h, gameName, now) {
  h.miles += GAME_MILES;
  log(h, { at: now, t: 'spiel', game: String(gameName ?? '').slice(0, 40) });
}

/**
 * Wendet eine Anfrage an (verändert h, vorher advance bis now). by = Konto-ID.
 * msg: { t: 'essen' | 'trinken', item } | { t: 'putzen' } | { t: 'reise', place } | { t: 'name', name }
 * Ungültig → throw new Error('Satz für den Spieler'). Rückgabe: Ereignis für Anzeige und Benachrichtigung,
 * oder null, wenn sich nichts ändert.
 */
export function applyHai(h, by, msg, now) {
  const name = h.name;
  if (msg.t === 'name') {
    const next = haiName(msg.name);
    if (next === h.name) return null;
    h.name = next;
    return { t: 'name' };
  }
  if (h.away) throw new Error(`${name} ist weggeschwommen und kommt morgen früh wieder.`);

  switch (msg.t) {
    case 'essen':
    case 'trinken': {
      const food = FOOD[msg.item];
      if (!food || food.kind !== msg.t || !pantry(h).includes(food)) throw new Error('Das hat er gerade nicht da.');
      const k = food.kind;
      if (h.need[k] >= FULL) throw new Error(k === 'essen' ? `${name} ist satt.` : `${name} hat keinen Durst.`);
      const r = h.taste[k] === food.id ? 'mag' : h.taste.nicht === food.id ? 'nicht' : null;
      const before = h.need[k];
      h.need[k] = round(Math.min(100, before + (r === 'mag' ? 60 : r === 'nicht' ? 15 : k === 'essen' ? 40 : 45)));
      delete h.empty[k];
      if (food.messy) {
        h.need.sauber = round(Math.max(0, h.need.sauber - food.messy));
        if (h.need.sauber === 0 && h.empty.sauber == null) h.empty.sauber = now;
      }
      if (r && !h.known.includes(food.id)) h.known.push(food.id);
      const miles = careMile(h, before, now);
      log(h, { at: now, by, t: k, item: food.id, ...(r ? { r } : {}) });
      return { t: k, item: food.id, r, miles };
    }
    case 'putzen': {
      if (h.need.sauber >= FULL) throw new Error(`${name} ist schon sauber.`);
      const before = h.need.sauber;
      h.need.sauber = 100;
      delete h.empty.sauber;
      h.seed = (h.seed + 7919) % 1e9; // beim nächsten Mal andere Flecken
      const miles = careMile(h, before, now);
      log(h, { at: now, by, t: 'putzen' });
      return { t: 'putzen', miles };
    }
    case 'reise': {
      const place = PLACE[msg.place];
      if (!place) throw new Error('Diesen Ort gibt es nicht.');
      if (place.id === h.place) return null;
      const isNew = !h.visited.includes(place.id);
      if (isNew) {
        const { free, missing } = trips(h);
        if (!free) throw new Error(`Für die nächste Reise fehlen noch ${missing} Meilen.`);
        h.visited.push(place.id);
      }
      h.place = place.id;
      log(h, { at: now, by, t: 'reise', place: place.id, ...(isNew ? { neu: true } : {}) });
      return { t: 'reise', place: place.id, neu: isNew };
    }
    default:
      throw new Error('Unbekannte Anfrage.');
  }
}

/** Was die Browser sehen: alles außer dem, was er mag, solange es niemand herausgefunden hat. */
export function publicHai(h) {
  const { taste, ...rest } = h;
  return {
    ...rest,
    taste: Object.fromEntries(Object.entries(taste).filter(([, id]) => h.known.includes(id))),
  };
}

/** Kurzer Satz, wie es ihm geht (für Startseite und Bühne). */
export function statusText(h, now) {
  const { mood: m, wants } = mood(h, now);
  if (m === 'weg') return `Ist weggeschwommen. Kommt morgen früh wieder.`;
  const words = { essen: 'Hunger', trinken: 'Durst', sauber: 'schmutzig' };
  const needs = wants.filter((k) => k !== 'sauber').map((k) => words[k]);
  let text = '';
  if (needs.length) text = `Hat ${needs.join(' und ')}`;
  if (wants.includes('sauber')) text = text ? `${text} und ist schmutzig` : 'Ist schmutzig';
  if (m === 'schlaf') return text ? `Schläft. ${text}.` : 'Schläft.';
  return text ? `${text}.` : m === 'froh' ? 'Geht es gut.' : 'Geht es ganz gut.';
}
