// Spielzimmer und Spielzüge. Läuft auf dem Server (API-Route).
//
// Jede Freundschaft hat ein eigenes Spielzimmer mit den beiden Konten als Spielern.
// Ablauf bei jeder Anfrage: Raum aus der Datenbank laden → Änderung anwenden →
// speichern, aber nur wenn niemand dazwischen gespeichert hat (sonst neu laden
// und nochmal). So gehen gleichzeitige Züge (z.B. bei Schere-Stein-Papier) nicht verloren.

import { games, gameList } from './games.js';
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
  const code = String(msg.room ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 8);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = await store.get(code);
    if (!room) throw new UserError('Dieses Spielzimmer gibt es nicht mehr.', 404);
    const player = room.data.players.find((p) => p.id === user.id);
    if (!player) throw new UserError('Du spielst in diesem Spielzimmer nicht mit.', 403);

    if (msg.t === 'state') return { snapshot: await snapshot(room, user.id), changed: false };

    const outcome = apply(room.data, player, msg);
    if (!outcome) return { snapshot: await snapshot(room, user.id), changed: false };

    if (await store.update(code, room.version, room.data)) {
      room.version++;
      if (outcome.finished) await store.addResult(code, outcome.finished);
      const notes = (outcome.notes ?? []).map((n) => ({ ...n, view: code, seq: room.version }));
      return { snapshot: await snapshot(room, user.id), changed: true, notes };
    }
    // Jemand war schneller – neu laden und nochmal.
  }
  throw new UserError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

// Wendet eine Anfrage auf die Raumdaten an (verändert `data`).
// Rückgabe: false = nichts geändert, sonst { finished?: Eintrag für den Verlauf, notes? }
function apply(data, player, msg) {
  switch (msg.t) {
    case 'choose': {
      const entry = games.get(msg.game);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht.');
      startGame(data, entry);
      return { notes: startNotes(data, entry, player) };
    }
    case 'restart': {
      if (!data.game) return false;
      const entry = games.get(data.game.id);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht mehr.');
      startGame(data, entry);
      return { notes: startNotes(data, entry, player) };
    }
    case 'lobby':
      if (!data.game) return false;
      data.game = null;
      return {};
    case 'action': {
      const g = data.game;
      if (!g) return false;
      const entry = games.get(g.id);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht mehr.');
      if (g.state.result) throw new UserError('Das Spiel ist schon vorbei.');
      const draft = structuredClone(g.state);
      const returned = entry.mod.action(draft, { player: player.id, type: String(msg.type), data: msg.data });
      g.state = returned === undefined ? draft : returned;
      const finished = countResult(data, entry);
      const notes = g.state.result
        ? others(data, player).map((p) => note(p.id, entry.meta.name, g.state.result.text ?? 'Spiel vorbei.'))
        : waitingFor(entry, g.state, data.players)
            .filter((id) => id !== player.id)
            .map((id) => note(id, entry.meta.name, `Du bist dran. ${player.name} wartet auf dich.`));
      return { finished, notes };
    }
    default:
      return false;
  }
}

// --- Benachrichtigungen ---

const note = (to, title, body) => ({ to, title, body });
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

function startNotes(data, entry, player) {
  const waiting = waitingFor(entry, data.game.state, data.players);
  return others(data, player).map((p) =>
    note(
      p.id,
      entry.meta.name,
      `${player.name} hat das Spiel gestartet.${waiting.includes(p.id) ? ' Du bist dran.' : ''}`,
    ),
  );
}

// --- Spielablauf ---

function startGame(data, entry) {
  const [min, max] = entry.meta.players;
  const n = data.players.length;
  if (n < min) throw new UserError(`${entry.meta.name} braucht mindestens ${min} Spieler.`);
  if (n > max) throw new UserError(`${entry.meta.name} geht mit höchstens ${max} Spielern.`);
  const state = entry.mod.setup(data.players.map(({ id, name }) => ({ id, name })));
  data.game = { id: entry.id, state, started: Date.now() }; // started: jede Partie ist neu (auch bei „Nochmal“)
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
        game.view = entry.mod.view ? entry.mod.view(g.state, meId) : g.state;
      } catch (err) {
        console.error(`Fehler in view() von "${g.id}":`, err);
        game.error = `Fehler im Spiel (view): ${err.message}`;
      }
    }
  }
  return {
    room: room.code,
    version: room.version,
    me: meId,
    players: room.data.players.map(({ id, name, score }) => ({ id, name, score })),
    games: gameList,
    game,
    history: g ? null : await getStore().listResults(room.code, HISTORY_LENGTH),
  };
}
