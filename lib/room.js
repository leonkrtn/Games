// Spielzimmer und Spielzüge. Läuft auf dem Server (API-Route).
//
// Jede Freundschaft hat ein eigenes Spielzimmer mit den beiden Konten als Spielern.
// Ablauf bei jeder Anfrage: Raum aus der Datenbank laden → Änderung anwenden →
// speichern, aber nur wenn niemand dazwischen gespeichert hat (sonst neu laden
// und nochmal). So gehen gleichzeitige Züge (z.B. bei Schere-Stein-Papier) nicht verloren.

import { games, gameList, resolveOptions } from './games.js';
import { getStore } from './store/index.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_ATTEMPTS = 6;
const HISTORY_LENGTH = 10;

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Raum-Code aus einer Anfrage, so wie er gespeichert ist. */
export const roomCode = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 8);

const randomCode = (length = 6) =>
  Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** Legt ein neues Spielzimmer an. players = [{ id, name }] */
export async function createRoom(store, players) {
  const data = { players: players.map(({ id, name }) => ({ id, name, score: 0 })), game: null };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    if (await store.create(code, data)) return code;
  }
  throw new Error('Konnte kein Spielzimmer anlegen.');
}

/**
 * Bearbeitet eine Anfrage im Spielzimmer. user = angemeldetes Konto.
 * @returns {{ snapshot, changed, notes? }} changed = andere Browser müssen neu laden;
 *   notes = Benachrichtigungen [{ to, title, body, view, seq }]
 */
export async function handle(msg, user) {
  const store = getStore();
  const code = roomCode(msg.room);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = await store.get(code);
    if (!room) throw new UserError('Dieses Spielzimmer gibt es nicht mehr.', 404);
    const player = room.data.players.find((p) => p.id === user.id);
    if (!player) throw new UserError('Du spielst in diesem Spielzimmer nicht mit.', 403);

    // Ist eine Frist des Spiels abgelaufen? Dann zuerst weiterschalten (auch beim bloßen Nachschauen).
    const before = room.data.game?.state;
    const ticked = tick(room.data) ? afterChange(room.data, player, before) : null;

    const outcome = msg.t === 'state' ? null : apply(room.data, player, msg);
    if (!outcome && !ticked) return { snapshot: await snapshot(room, user.id), changed: false };

    if (await store.update(code, room.version, room.data)) {
      room.version++;
      for (const finished of [ticked?.finished, outcome?.finished]) {
        if (finished) await store.addResult(code, finished);
      }
      if (outcome?.clearUploads) await store.removeUploads(code);
      const notes = [...(ticked?.notes ?? []), ...(outcome?.notes ?? [])].map((n) => ({
        ...n,
        view: code,
        seq: room.version,
      }));
      return { snapshot: await snapshot(room, user.id), changed: true, notes };
    }
    // Jemand war schneller – neu laden und nochmal.
  }
  throw new UserError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

// Wendet eine Anfrage auf die Raumdaten an (verändert `data`).
// Rückgabe: false = nichts geändert, sonst { finished?: Eintrag für den Verlauf, notes?, clearUploads? }
// clearUploads: Bilder der letzten Partie löschen (neues Spiel oder zurück in die Lobby).
function apply(data, player, msg) {
  switch (msg.t) {
    case 'choose': {
      const entry = games.get(msg.game);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht.');
      startGame(data, entry, msg.options);
      return { notes: startNotes(data, entry, player), clearUploads: true };
    }
    case 'restart': {
      if (!data.game) return false;
      const entry = games.get(data.game.id);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht mehr.');
      startGame(data, entry, data.game.options); // „Nochmal“ mit denselben Optionen
      return { notes: startNotes(data, entry, player), clearUploads: true };
    }
    case 'lobby':
      if (!data.game) return false;
      data.game = null;
      return { clearUploads: true };
    case 'action': {
      const g = data.game;
      if (!g) return false;
      const entry = games.get(g.id);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht mehr.');
      // Nach dem Ende angekommene Züge still ignorieren (z.B. letzte Tipper in einem Wettlauf);
      // die Antwort zeigt ohnehin schon das Ergebnis.
      if (g.state.result) return false;
      const before = g.state;
      const next = runOnCopy(before, (draft) =>
        entry.mod.action(draft, { player: player.id, type: String(msg.type), data: msg.data }),
      );
      if (!next) return false; // Zug ohne Wirkung: nicht speichern, niemanden benachrichtigen
      g.state = next;
      return afterChange(data, player, before);
    }
    default:
      return false;
  }
}

// Führt fn (action oder tick des Spiels) auf einer Kopie aus.
// Rückgabe: der neue Zustand, oder null, wenn sich nichts geändert hat.
function runOnCopy(state, fn) {
  const draft = structuredClone(state);
  const returned = fn(draft);
  const next = returned === undefined ? draft : returned;
  return JSON.stringify(next) === JSON.stringify(state) ? null : next;
}

// Spiele mit Zeitlimit: tick(state, now) schaltet weiter, wenn eine Frist abgelaufen ist.
// Läuft vor jeder Anfrage im Raum; true = der Zustand hat sich geändert.
function tick(data) {
  const g = data.game;
  const entry = g && !g.state.result ? games.get(g.id) : null;
  if (typeof entry?.mod.tick !== 'function') return false;
  try {
    const next = runOnCopy(g.state, (draft) => entry.mod.tick(draft, Date.now()));
    if (!next) return false;
    g.state = next;
    return true;
  } catch (err) {
    console.error(`Fehler in tick() von "${g.id}":`, err);
    return false;
  }
}

// Nach einer Änderung am Spielstand (Zug oder abgelaufene Frist): Punkte und Benachrichtigungen.
// player = wer die Anfrage geschickt hat, before = Spielstand vorher.
function afterChange(data, player, before) {
  const g = data.game;
  const entry = games.get(g.id);
  const finished = countResult(data, entry);
  const notes = g.state.result
    ? others(data, player).map((p) =>
        note(p.id, entry.meta.name, g.state.result.text ?? 'Spiel vorbei.', 'end', player.id),
      )
    : gameNotes(entry, data, player, before);
  return { finished, notes };
}

// --- Benachrichtigungen ---

// kind: Art für die Einstellungen der Empfänger (lib/push.js), from: wer sie ausgelöst hat
const note = (to, title, body, kind, from) => ({ to, title, body, kind, from });
const others = (data, player) => data.players.filter((p) => p.id !== player.id);

// Auf wen wartet das Spiel? Spiele können das mit waitingFor(state) sagen, sonst: alle.
function waitingFor(entry, state, players) {
  if (state.result) return [];
  if (typeof entry.mod.waitingFor !== 'function') return players.map((p) => p.id);
  try {
    return entry.mod.waitingFor(state) ?? [];
  } catch (err) {
    console.error(`Fehler in waitingFor() von "${entry.id}":`, err);
    return players.map((p) => p.id);
  }
}

// Spiele können mit notices(state, before, playerId) eigene Texte schicken, sonst: „Du bist dran“.
function gameNotes(entry, data, player, before) {
  const state = data.game.state;
  if (typeof entry.mod.notices !== 'function') {
    return waitingFor(entry, state, data.players)
      .filter((id) => id !== player.id)
      .map((id) => note(id, entry.meta.name, `Du bist dran. ${player.name} wartet auf dich.`, 'turn', player.id));
  }
  try {
    return (entry.mod.notices(state, before, player.id) ?? [])
      .filter((n) => n?.to !== player.id && data.players.some((p) => p.id === n?.to))
      .map((n) => note(n.to, entry.meta.name, String(n.text ?? '').slice(0, 200), 'turn', player.id));
  } catch (err) {
    console.error(`Fehler in notices() von "${entry.id}":`, err);
    return [];
  }
}

function startNotes(data, entry, player) {
  const waiting = waitingFor(entry, data.game.state, data.players);
  return others(data, player).map((p) =>
    note(
      p.id,
      entry.meta.name,
      `${player.name} hat das Spiel gestartet.${waiting.includes(p.id) ? ' Du bist dran.' : ''}`,
      'start',
      player.id,
    ),
  );
}

// --- Spielablauf ---

// wanted = in der Lobby gewählte Optionen (meta.options des Spiels), Unbekanntes wird zur Vorgabe.
function startGame(data, entry, wanted) {
  const [min, max] = entry.meta.players;
  const n = data.players.length;
  if (n < min) throw new UserError(`${entry.meta.name} braucht mindestens ${min} Spieler.`);
  if (n > max) throw new UserError(`${entry.meta.name} geht mit höchstens ${max} Spielern.`);
  const options = resolveOptions(entry.meta.options, wanted);
  const state = entry.mod.setup(
    data.players.map(({ id, name }) => ({ id, name })),
    options,
  );
  data.game = { id: entry.id, state, started: Date.now(), options }; // started: jede Partie ist neu (auch bei „Nochmal“)
  // Die Lobby schlägt beim nächsten Mal dieselben Optionen vor.
  if (entry.meta.options.length) data.lastOptions = { ...data.lastOptions, [entry.id]: options };
}

// Sobald ein Spiel state.result setzt: Punkte vergeben und Eintrag für den Verlauf liefern.
function countResult(data, entry) {
  const result = data.game.state.result;
  if (!result) return undefined;
  const winners = [];
  for (const id of result.winners ?? []) {
    const p = data.players.find((p) => p.id === id);
    if (!p) continue;
    p.score++;
    winners.push({ id: p.id, name: p.name });
  }
  return { game_id: entry.id, game_name: entry.meta.name, winners, text: result.text ?? null };
}

/** Kurzfassung für die Freundesliste: Punkte und wer gerade dran ist. */
export function summarize(room, meId) {
  const g = room.data.game;
  let game = null;
  if (g) {
    const entry = games.get(g.id);
    const waiting = entry ? waitingFor(entry, g.state, room.data.players) : [];
    game = {
      name: entry?.meta.name ?? g.id,
      finished: Boolean(g.state.result),
      myTurn: waiting.includes(meId),
      theirTurn: waiting.some((id) => id !== meId),
    };
  }
  return {
    order: room.data.players.map((p) => p.id), // Reihenfolge = Spielerfarben (Rot, Schwarz)
    scores: Object.fromEntries(room.data.players.map((p) => [p.id, p.score])),
    game,
  };
}

/** Was das laufende Spiel `meId` gerade zeigt, laut view() des Spiels (null ohne Spiel). */
export function currentView(room, meId) {
  const g = room.data.game;
  const entry = g ? games.get(g.id) : null;
  if (!entry) return null;
  return entry.mod.view ? entry.mod.view(g.state, meId) : g.state;
}

// Was ein Spieler zu sehen bekommt (ohne Geheimnisse der anderen).
async function snapshot(room, meId) {
  const g = room.data.game;
  let game = null;
  if (g) {
    const entry = games.get(g.id);
    game = {
      id: g.id,
      started: g.started ?? 0,
      name: entry?.meta.name ?? g.id,
      view: null,
      result: g.state.result ?? null,
    };
    if (!entry) {
      game.error = 'Dieses Spiel gibt es nicht mehr.';
    } else {
      try {
        game.view = currentView(room, meId);
      } catch (err) {
        console.error(`Fehler in view() von "${g.id}":`, err);
        game.error = `Fehler im Spiel (view): ${err.message}`;
      }
    }
  }
  return {
    room: room.code,
    version: room.version,
    now: Date.now(), // Serverzeit, damit Countdowns im Browser auch bei falsch gehender Uhr stimmen
    me: meId,
    players: room.data.players.map(({ id, name, score }) => ({ id, name, score })),
    games: gameList,
    lastOptions: room.data.lastOptions ?? {}, // zuletzt gewählte Spieloptionen, für die Lobby
    game,
    history: g ? null : await getStore().listResults(room.code, HISTORY_LENGTH),
  };
}
