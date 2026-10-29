// Das Tagesbild auf dem Server (API-Route /api/tagesbild, täglicher Aufruf /api/cron). Regeln und Zeiten:
// lib/tagesbild.js, Zeichnung: lib/malen.js. Gespeichert in der Tabelle tagesbild (Migration „tagesbild“):
// eine Zeile pro Paar, Tag, Bild und Vorschaubild, jede mit Versionsprüfung. Jedes Konto hat höchstens ein
// Tagesbild; gibt es durch gleichzeitiges Starten doch zwei, gilt das ältere.

import { getStore } from './store/index.js';
import { friendRooms } from './hai-server.js';
import { applyCmd, emptyDrawing, finalOps } from './malen.js';
import {
  CLOSE,
  COMMENT_MAX,
  H,
  OPEN,
  REMIND,
  TASK_MAX,
  addDays,
  beganOf,
  cleanText,
  dayOf,
  isDay,
  isDone,
  nextDay,
  roundDay,
  roundState,
  setterOf,
  startDay,
  summary,
  taskOf,
  timeOn,
} from './tagesbild.js';

const MAX_ATTEMPTS = 6;
const GRACE = 5000; // ms nach 23 Uhr: Striche, die noch unterwegs sind, zählen
const THUMB_MAX = 60_000; // Zeichen eines Vorschaubilds (Daten-URL)
const LATE = 3 * H; // Benachrichtigungen, die so viel zu spät kämen, entfallen

export class BildError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Uhr des Tagesbilds. Nur im Test (Umgebungsvariable SPIELZIMMER_TESTUHR=1, nie in Produktion) lässt sie
// sich mit { t: 'uhr', at } verstellen, um 10 und 23 Uhr zu prüfen.
const testClock = () => process.env.SPIELZIMMER_TESTUHR === '1' && !process.env.VERCEL;
export const clock = () => Date.now() + (testClock() ? (globalThis.__tagesbildVersatz ?? 0) : 0);

const key = {
  pair: (code) => `${code}:paar`,
  day: (code, day) => `${code}:tag:${day}`,
  pic: (code, day, user) => `${code}:bild:${day}:${user}`,
  mini: (code, day, user) => `${code}:mini:${day}:${user}`,
};
const roomCode = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 8);

/** Das Tagesbild eines Kontos unter diesen Zeilen (das älteste), oder null. */
const oldest = (rows, userId) =>
  rows.filter((r) => r.data.members.some((m) => m.id === userId)).sort((a, b) => a.data.since - b.data.since)[0] ?? null;

async function pairsOf(store, userId) {
  const rooms = await friendRooms(store, userId);
  return { rooms, rows: await store.tbGet(rooms.map((r) => key.pair(r.code))) };
}

/** Für die Startseite: wie es heute steht (null: kein Tagesbild). rooms = geladene Räume des Kontos. */
export async function tagesbildSummary(store, rooms, user) {
  const own = rooms.filter((r) => !r.data.group && r.data.players.length === 2 && r.data.players.some((p) => p.id === user.id));
  const row = oldest(await store.tbGet(own.map((r) => key.pair(r.code))), user.id);
  if (!row) return null;
  const partner = row.data.members.find((m) => m.id !== user.id);
  return { partner, ...summary(row.data, row.room_code, user.id, clock()) };
}

const memberCheck = (pair, userId) => {
  if (!pair?.members.some((m) => m.id === userId)) throw new BildError('Dieses Tagesbild gibt es nicht mehr.', 404);
};
const partnerOf = (pair, userId) => pair.members.find((m) => m.id !== userId);
const nameOf = (pair, id) => pair.members.find((m) => m.id === id)?.name ?? '';

// Lädt eine Zeile, wendet fn(data) an und speichert mit Versionsprüfung (bei Konflikt nochmal).
// fn gibt false zurück: nichts zu speichern.
async function changeRow(store, id, fn) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [row] = await store.tbGet([id]);
    if (!row) throw new BildError('Dieses Tagesbild gibt es nicht mehr.', 404);
    if (fn(row.data) === false) return { row, changed: false };
    if (await store.tbUpdate(id, row.version, row.data)) {
      row.version++;
      return { row, changed: true };
    }
  }
  throw new BildError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

async function loadPair(store, code, userId) {
  const [row] = await store.tbGet([key.pair(roomCode(code))]);
  memberCheck(row?.data, userId);
  return row;
}

// Alte Aufgaben und Stände aus dem Paar entfernen (die Tage selbst stehen in eigenen Zeilen)
function prune(pair, now) {
  const keep = addDays(roundDay(now), -2);
  for (const k of ['tasks', 'state']) {
    for (const d of Object.keys(pair[k] ?? {})) if (d < keep) delete pair[k][d];
  }
}

// Zeile des Tages anlegen, sobald er offen ist: Ab dann steht die Aufgabe fest.
async function ensureDay(store, row, day, now) {
  const pair = row.data;
  if (day < pair.start || now < timeOn(day, OPEN)) return null;
  const id = key.day(row.room_code, day);
  const [found] = await store.tbGet([id]);
  if (found) return found.data;
  const t = taskOf(pair, row.room_code, day);
  const data = { task: t.text, by: t.by, hearts: {}, comments: {} };
  if (await store.tbInsert({ id, room_code: row.room_code, kind: 'tag', day, data })) return data;
  return (await store.tbGet([id]))[0]?.data ?? data;
}

// Ist der Tag aufgedeckt (beide fertig, 23 Uhr vorbei oder ein früherer Tag)?
const revealed = (pair, day, now) =>
  isDay(day) && day >= pair.start && (day < roundDay(now) || (day === roundDay(now) && roundState(pair, day, now) === 'aufgedeckt'));

/** Was die Seite braucht (ohne Zeichnungen). */
function view(row, me, now, dayData) {
  const pair = row.data;
  const code = row.room_code;
  const partner = partnerOf(pair, me);
  const day = roundDay(now);
  const next = nextDay(now);
  const state = roundState(pair, day, now);
  const who = (id) => ({ began: beganOf(pair, day, id), done: isDone(pair, day, id, now), sent: Boolean(pair.state?.[day]?.[id]?.done) });
  const setter = setterOf(pair, next);
  return {
    room: code,
    now,
    me,
    partner,
    members: pair.members,
    start: pair.start,
    hearts: pair.hearts ?? {},
    round:
      day < pair.start
        ? null
        : {
            day,
            state,
            open: timeOn(day, OPEN),
            close: timeOn(day, CLOSE),
            task: dayData?.task ?? taskOf(pair, code, day).text,
            by: dayData ? dayData.by : taskOf(pair, code, day).by,
            mine: who(me),
            theirs: who(partner.id),
            hearts: state === 'aufgedeckt' ? (dayData?.hearts ?? {}) : {},
            comments: state === 'aufgedeckt' ? (dayData?.comments ?? {}) : {},
          },
    next: {
      day: next,
      open: timeOn(next, OPEN),
      setter,
      ready: Boolean(pair.tasks?.[next]),
      task: setter === me ? (pair.tasks?.[next]?.text ?? null) : null,
    },
  };
}

const note = (to, from, body, now) => ({
  to,
  from,
  title: 'Tagesbild',
  body,
  kind: 'bild',
  view: 'bild',
  url: '/?seite=tagesbild',
  tag: 'tagesbild',
  seq: now,
});

// Satz für den, der sich die Aufgabe für morgen ausdenkt (falls noch keine da ist)
const setterLine = (pair, to, now) => {
  const next = nextDay(now);
  return setterOf(pair, next) === to && !pair.tasks?.[next] ? ' Du denkst dir die Aufgabe für morgen aus.' : '';
};

/**
 * Eine Anfrage zum Tagesbild. msg.t: get (zeichnung?) | start (friend, task) | aufgabe (day, text) |
 * malen (day, base, dev, cmds, thumb?, thumbSeq?, fertig?) | zeichnung | herz (day, on) | kommentar (day, text) |
 * tag (day) | monat (month) | thumb (day, user, seq, src) | beenden; außer get und start mit msg.room (Raum-Code aus get).
 * @returns {{ body, notes?, pings? }} pings = Konten, deren Startseite und Tagesbild-Seite neu laden sollen
 */
export async function handleTagesbild(msg, user) {
  const store = getStore();
  const now = clock();
  const me = user.id;

  if (msg.t === 'uhr') {
    if (!testClock()) throw new BildError('Unbekannte Anfrage.');
    globalThis.__tagesbildVersatz = Number(msg.at) - Date.now();
    return { body: { now: clock() } };
  }

  if (msg.t === 'get') {
    const { rooms, rows } = await pairsOf(store, me);
    const row = oldest(rows, me);
    if (row) {
      const body = view(row, me, now, await ensureDay(store, row, roundDay(now), now));
      // Beim ersten Laden gleich die eigene Zeichnung mitschicken: Das Malbrett steht sofort da, nichts rutscht.
      if (msg.zeichnung && body.round?.state === 'malen' && !body.round.mine.sent) {
        const [pic] = await store.tbGet([key.pic(row.room_code, body.round.day, me)]);
        body.drawing = { day: body.round.day, d: pic?.data.d ?? emptyDrawing() };
      }
      return { body };
    }
    // Zur Auswahl: alle Freunde, mit dem Hinweis, wer schon ein Tagesbild hat
    const friends = await Promise.all(
      rooms.map(async (r) => {
        const other = r.data.players.find((p) => p.id !== me);
        return { id: other.id, name: other.name, taken: Boolean(oldest((await pairsOf(store, other.id)).rows, other.id)) };
      }),
    );
    const start = startDay(now);
    return {
      body: {
        now,
        bild: null,
        start,
        opensNow: start === dayOf(now) && now >= timeOn(start, OPEN),
        friends: friends.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      },
    };
  }

  if (msg.t === 'start') {
    const { rooms, rows } = await pairsOf(store, me);
    if (oldest(rows, me)) throw new BildError('Du hast schon ein Tagesbild.');
    const room = rooms.find((r) => r.data.players.some((p) => p.id === msg.friend && p.id !== me));
    if (!room) throw new BildError('Ein Tagesbild geht nur mit Freunden.', 404);
    const other = room.data.players.find((p) => p.id !== me);
    if (oldest((await pairsOf(store, other.id)).rows, other.id)) throw new BildError(`${other.name} hat schon ein Tagesbild.`);
    const text = cleanText(msg.task, TASK_MAX);
    const members = room.data.players.map(({ id, name }) => ({ id, name }));
    const start = startDay(now);
    const pair = {
      since: now,
      members,
      first: members.findIndex((m) => m.id === me),
      start,
      tasks: text ? { [start]: { text, by: me } } : {},
      state: {},
      hearts: {},
      sent: {},
    };
    // Startet die erste Runde sofort, gilt die Nachricht unten als Bescheid über die neue Aufgabe.
    const opensNow = start === dayOf(now) && now >= timeOn(start, OPEN);
    if (opensNow) pair.sent.open = start;
    const row = { id: key.pair(room.code), room_code: room.code, kind: 'paar', version: 0, data: pair };
    if (!(await store.tbInsert(row))) throw new BildError(`${other.name} hat schon ein Tagesbild.`);
    const dayData = await ensureDay(store, row, roundDay(now), now);
    const body = opensNow
      ? `${user.display_name} hat ein Tagesbild mit dir gestartet. Heute: ${dayData.task}. Malen bis dreiundzwanzig Uhr.`
      : `${user.display_name} hat ein Tagesbild mit dir gestartet. Das erste Bild malt ihr ${start === dayOf(now) ? 'heute' : 'morgen'} ab zehn Uhr.`;
    return { body: view(row, me, now, dayData), notes: [note(other.id, me, body, now)], pings: members.map((m) => m.id) };
  }

  const code = roomCode(msg.room);
  const pings = (pair) => pair.members.map((m) => m.id);

  if (msg.t === 'aufgabe') {
    const day = msg.day;
    if (!isDay(day)) throw new BildError('Unbekannter Tag.');
    const text = cleanText(msg.text, TASK_MAX);
    const { row, changed } = await changeRow(store, key.pair(code), (pair) => {
      memberCheck(pair, me);
      if (setterOf(pair, day) !== me) throw new BildError('Die Aufgabe für diesen Tag denkt sich die andere Person aus.');
      if (now >= timeOn(day, OPEN)) throw new BildError('Die Aufgabe steht schon fest.');
      if (day > nextDay(now)) throw new BildError('Dafür ist es noch zu früh.');
      pair.tasks ??= {};
      if ((pair.tasks[day]?.text ?? null) === text) return false;
      if (text) pair.tasks[day] = { text, by: me };
      else delete pair.tasks[day];
      prune(pair, now);
    });
    const dayData = await ensureDay(store, row, roundDay(now), now);
    return { body: view(row, me, now, dayData), pings: changed ? pings(row.data) : [] };
  }

  if (msg.t === 'malen') return draw(store, msg, code, user, now);

  // Die eigene Zeichnung der laufenden Runde (zum Weitermalen, auch auf einem anderen Gerät)
  if (msg.t === 'zeichnung') {
    await loadPair(store, code, me);
    const day = roundDay(now);
    const [pic] = await store.tbGet([key.pic(code, day, me)]);
    return { body: { day, d: pic?.data.d ?? emptyDrawing() } };
  }

  if (msg.t === 'herz' || msg.t === 'kommentar') {
    const day = msg.day;
    const pairRow = await loadPair(store, code, me);
    if (!revealed(pairRow.data, day, now)) throw new BildError('Das Bild ist noch nicht aufgedeckt.');
    await ensureDay(store, pairRow, day, now);
    const partner = partnerOf(pairRow.data, me).id;
    if (msg.t === 'herz') {
      const on = Boolean(msg.on);
      const { changed } = await changeRow(store, key.day(code, day), (data) => {
        data.hearts ??= {};
        if (Boolean(data.hearts[me]) === on) return false;
        if (on) data.hearts[me] = now;
        else delete data.hearts[me];
      });
      if (changed) {
        await changeRow(store, key.pair(code), (pair) => {
          pair.hearts ??= {};
          pair.hearts[partner] = Math.max(0, (pair.hearts[partner] ?? 0) + (on ? 1 : -1));
        });
      }
    } else {
      const text = cleanText(msg.text, COMMENT_MAX);
      await changeRow(store, key.day(code, day), (data) => {
        data.comments ??= {};
        if ((data.comments[me]?.text ?? null) === text) return false;
        if (text) data.comments[me] = { text, at: now };
        else delete data.comments[me];
      });
    }
    const fresh = await loadPair(store, code, me);
    const dayData = await ensureDay(store, fresh, roundDay(now), now);
    const [dayRow] = await store.tbGet([key.day(code, day)]);
    return { body: { ...view(fresh, me, now, dayData), dayInfo: { day, hearts: dayRow.data.hearts ?? {}, comments: dayRow.data.comments ?? {} } }, pings: [partner] };
  }

  if (msg.t === 'tag') {
    const day = msg.day;
    const pairRow = await loadPair(store, code, me);
    const pair = pairRow.data;
    if (!revealed(pair, day, now)) throw new BildError('Das Bild ist noch nicht aufgedeckt.');
    const ids = pair.members.map((m) => m.id);
    const rows = await store.tbGet([key.day(code, day), ...ids.map((id) => key.pic(code, day, id)), ...ids.map((id) => key.mini(code, day, id))]);
    const find = (id) => rows.find((r) => r.id === id);
    const dayData = find(key.day(code, day))?.data;
    return {
      body: {
        day,
        task: dayData?.task ?? taskOf(pair, code, day).text,
        by: dayData ? dayData.by : taskOf(pair, code, day).by,
        hearts: dayData?.hearts ?? {},
        comments: dayData?.comments ?? {},
        pics: Object.fromEntries(
          ids.map((id) => {
            const d = find(key.pic(code, day, id))?.data.d;
            return [id, d ? { ops: finalOps(d), seq: d.seq, mini: find(key.mini(code, day, id))?.data.seq ?? null } : null];
          }),
        ),
      },
    };
  }

  if (msg.t === 'monat') {
    const month = String(msg.month ?? '');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BildError('Unbekannter Monat.');
    const pairRow = await loadPair(store, code, me);
    const pair = pairRow.data;
    const from = `${month}-01`;
    const to = addDays(`${nextMonth(month)}-01`, -1);
    const last = revealed(pair, roundDay(now), now) ? roundDay(now) : addDays(roundDay(now), -1);
    const [days, minis] = await Promise.all([store.tbList(code, 'tag', from, to), store.tbList(code, 'mini', from, to)]);
    return {
      body: {
        month,
        days: days
          .filter((r) => r.day <= last)
          .map((r) => ({
            day: r.day,
            task: r.data.task,
            by: r.data.by,
            hearts: r.data.hearts ?? {},
            comments: r.data.comments ?? {},
            thumbs: Object.fromEntries(
              minis.filter((t) => t.day === r.day).map((t) => [t.user_id, { src: t.data.src, empty: t.data.empty, seq: t.data.seq }]),
            ),
          })),
      },
    };
  }

  if (msg.t === 'thumb') {
    // Vorschaubild nachreichen (z.B. wenn um 23 Uhr abgeschickt wurde): nur für aufgedeckte Bilder, passend zum Stand
    const day = msg.day;
    const pairRow = await loadPair(store, code, me);
    if (!revealed(pairRow.data, day, now) || !pairRow.data.members.some((m) => m.id === msg.user)) throw new BildError('Unbekanntes Bild.');
    const [pic] = await store.tbGet([key.pic(code, day, msg.user)]);
    if (!pic || pic.data.d.seq !== msg.seq || !validThumb(msg.src)) return { body: { ok: false } };
    await store.tbPut({
      id: key.mini(code, day, msg.user),
      room_code: code,
      kind: 'mini',
      day,
      user_id: msg.user,
      data: { src: msg.src, seq: msg.seq, empty: !finalOps(pic.data.d).length },
    });
    return { body: { ok: true } };
  }

  if (msg.t === 'beenden') {
    const pairRow = await loadPair(store, code, me);
    await store.tbRemove(code);
    const other = partnerOf(pairRow.data, me);
    return {
      body: { bild: null, ended: true },
      notes: [note(other.id, me, `${user.display_name} hat euer Tagesbild beendet.`, now)],
      pings: pings(pairRow.data),
    };
  }

  throw new BildError('Unbekannte Anfrage.');
}

const nextMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const validThumb = (src) => typeof src === 'string' && src.length <= THUMB_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(src);

// Striche speichern (gebündelt, höchstens alle zwei Sekunden) und abschicken (fertig: true).
// base = Stand, auf dem der Browser aufbaut, dev = Kennung der geöffneten Seite. Hat inzwischen ein anderes
// Gerät weitergemalt, antwortet der Server mit dem gespeicherten Stand (conflict), statt zu mischen.
async function draw(store, msg, code, user, now) {
  const me = user.id;
  const day = msg.day;
  const pairRow = await loadPair(store, code, me);
  const pair = pairRow.data;
  if (day !== roundDay(now) || roundState(pair, day, now) === 'vorher') throw new BildError('An diesem Bild wird nicht mehr gemalt.');
  if (pair.state?.[day]?.[me]?.done) return { body: { done: true, ...view(pairRow, me, now, null) } };
  if (now > timeOn(day, CLOSE) + GRACE) return { body: { late: true, ...view(pairRow, me, now, null) } };
  if (!beganOf(pair, day, me)) await ensureDay(store, pairRow, day, now);

  const cmds = Array.isArray(msg.cmds) ? msg.cmds.slice(0, 300) : [];
  const dev = String(msg.dev ?? '').slice(0, 24);
  const base = Number.isInteger(msg.base) ? msg.base : -1;
  const id = key.pic(code, day, me);
  let saved = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !saved; attempt++) {
    let [pic] = await store.tbGet([id]);
    if (!pic) {
      await store.tbInsert({ id, room_code: code, kind: 'bild', day, user_id: me, data: { d: emptyDrawing(), dev: null } });
      [pic] = await store.tbGet([id]);
    }
    const data = pic.data;
    const d = data.d;
    if (cmds.length && d.seq !== base && data.dev !== dev) {
      saved = { conflict: true, d, seq: d.seq };
      break;
    }
    const before = d.seq;
    let full = false;
    for (const cmd of cmds) {
      if (typeof cmd?.s === 'number' && cmd.s <= d.seq) continue; // schon da (nochmal geschickt)
      const ok = applyCmd(d, cmd);
      if (!ok) break;
      if (ok === 'voll') full = true;
    }
    if (d.seq === before) saved = { seq: d.seq, empty: !finalOps(d).length };
    else {
      data.dev = dev;
      if (await store.tbUpdate(id, pic.version, data)) saved = { seq: d.seq, full, empty: !finalOps(d).length };
    }
  }
  if (!saved) throw new BildError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
  if (saved.conflict) return { body: saved };

  if (validThumb(msg.thumb)) {
    await store.tbPut({
      id: key.mini(code, day, me),
      room_code: code,
      kind: 'mini',
      day,
      user_id: me,
      data: { src: msg.thumb, seq: Number.isInteger(msg.thumbSeq) ? msg.thumbSeq : saved.seq, empty: saved.empty },
    });
  }

  // Im Paar vermerken: angefangen (erster Strich des Tages) und abgeschickt
  const fertig = msg.fertig === true;
  if (!fertig && (beganOf(pair, day, me) || !cmds.length)) return { body: saved };
  let reveal = false;
  const { row, changed } = await changeRow(store, key.pair(code), (p) => {
    memberCheck(p, me);
    const st = ((p.state ??= {})[day] ??= {});
    const mine = (st[me] ??= {});
    let any = false;
    if (!mine.began && cmds.length) {
      mine.began = now;
      any = true;
    }
    if (fertig && !mine.done) {
      mine.done = now;
      any = true;
      reveal = false;
      if (roundState(p, day, now) === 'aufgedeckt' && (p.sent ??= {}).reveal !== day) {
        p.sent.reveal = day;
        reveal = true;
      }
    }
    if (any) prune(p, now);
    return any;
  });
  const body = { ...saved, ...view(row, me, now, await ensureDay(store, row, day, now)) };
  if (!changed) return { body };
  const other = partnerOf(row.data, me);
  const task = taskOf(row.data, code, day).text;
  const notes = !fertig
    ? []
    : reveal
      ? [note(other.id, me, `Beide Bilder sind da. Schau dir an, was ${user.display_name} zu „${task}“ gemalt hat.${setterLine(row.data, other.id, now)}`, now)]
      : [note(other.id, me, `${user.display_name} hat das Tagesbild abgeschickt.`, now)];
  return { body, notes, pings: row.data.members.map((m) => m.id) };
}

/**
 * Täglicher Aufruf (/api/cron, mehrmals am Tag): verschickt, was fällig ist, je Paar und Tag höchstens einmal.
 * Um 10 Uhr die neue Aufgabe, um 21 Uhr eine Erinnerung an alle, die noch nicht abgeschickt haben, um 23 Uhr
 * das Aufdecken (wenn nicht schon früher aufgedeckt wurde). Ruft man ihn öfter auf, passiert nichts doppelt.
 * @returns {Promise<{ notes, pings }>}
 */
export async function tagesbildCron(now = clock()) {
  const store = getStore();
  const notes = [];
  const pinged = new Set();
  for (const row of await store.tbPairs()) {
    try {
      const out = await duePair(store, row, now);
      notes.push(...out);
      if (out.length) for (const m of row.data.members) pinged.add(m.id);
    } catch (err) {
      console.error(`Tagesbild ${row.room_code}:`, err);
    }
  }
  return { notes, pings: [...pinged] };
}

async function duePair(store, row, now) {
  const code = row.room_code;
  const day = roundDay(now);
  if (day < row.data.start) return [];
  const open = timeOn(day, OPEN);
  const close = timeOn(day, CLOSE);
  // Ab 10 Uhr steht die Aufgabe fest (eigene Zeile), auch wenn niemand die Seite öffnet
  const dayData = now < close ? await ensureDay(store, row, day, now) : null;
  let out = [];
  const { changed } = await changeRow(store, row.id, (pair) => {
    out = [];
    const sent = (pair.sent ??= {});
    const state = roundState(pair, day, now);
    const task = dayData?.task ?? taskOf(pair, code, day).text;
    const by = dayData ? dayData.by : taskOf(pair, code, day).by;
    for (const m of pair.members) {
      const other = partnerOf(pair, m.id);
      if (sent.open !== day && state === 'malen' && now < open + LATE) {
        const who = by === m.id ? 'Deine Aufgabe ist da' : by ? `Die Aufgabe von ${nameOf(pair, by)}` : 'Die Aufgabe heute';
        out.push(note(m.id, other.id, `${who}: ${task}. Malen bis dreiundzwanzig Uhr.`, now));
      }
      if (sent.remind !== day && state === 'malen' && now >= timeOn(day, REMIND) && !pair.state?.[day]?.[m.id]?.done) {
        out.push(
          note(
            m.id,
            other.id,
            beganOf(pair, day, m.id)
              ? 'Dein Bild ist noch nicht abgeschickt. Um dreiundzwanzig Uhr wird es aufgedeckt, so wie es ist.'
              : `Du hast heute noch nicht gemalt: ${task}. Bis dreiundzwanzig Uhr ist Zeit.`,
            now,
          ),
        );
      }
      if (sent.reveal !== day && now >= close && now < close + LATE) {
        const mine = beganOf(pair, day, m.id);
        const theirs = beganOf(pair, day, other.id);
        const text = theirs
          ? `Aufgedeckt: ${mine ? 'eure Bilder' : `das Bild von ${other.name}`} zu „${task}“.`
          : `Aufgedeckt. ${other.name} hat heute nicht gemalt.`;
        out.push(note(m.id, other.id, text + setterLine(pair, m.id, now), now));
      }
    }
    let any = false;
    if (sent.open !== day && state === 'malen' && now < open + LATE) any = sent.open = day;
    if (sent.remind !== day && state === 'malen' && now >= timeOn(day, REMIND)) any = sent.remind = day;
    if (sent.reveal !== day && now >= close && now < close + LATE) any = sent.reveal = day;
    return Boolean(any);
  });
  return changed ? out : [];
}
