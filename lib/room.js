// Räume, Spieler und Spielzüge. Läuft auf dem Server (API-Route).
//
// Ablauf bei jeder Anfrage: Raum aus der Datenbank laden → Änderung anwenden →
// speichern, aber nur wenn niemand dazwischen gespeichert hat (sonst neu laden
// und nochmal). So gehen gleichzeitige Züge (z.B. bei Schere-Stein-Papier) nicht verloren.

import { games, gameList } from './games.js';
import { getStore } from './store/index.js';
import { validSubscription, ACTIVE_FOR_MS } from './push.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_ATTEMPTS = 6;
const HISTORY_LENGTH = 10;

export class UserError extends Error {
  constructor(message, status = 400, code = undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const OTHER_DEVICE = 'Du spielst in diesem Raum inzwischen auf einem anderen Gerät.';
const sameName = (a, b) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

const randomCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const text = (value, max) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

/**
 * Bearbeitet eine Anfrage aus dem Browser.
 * @returns {{ snapshot: object, changed: boolean, notes?: object[] }}
 *   changed = andere Browser müssen neu laden; notes = Benachrichtigungen [{ to, title, body }]
 */
export async function handle(msg) {
  const me = { id: text(msg.playerId, 64), token: text(msg.token, 128) };
  if (!me.id || me.token.length < 16) throw new UserError('Ungültige Spieler-Kennung.');
  if (msg.t === 'join') return join(msg, me);

  const store = getStore();
  const code = text(msg.room, 4).toUpperCase();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = await store.get(code);
    if (!room) throw new UserError('Diesen Raum gibt es nicht mehr.', 404);
    const player = room.data.players.find((p) => p.id === me.id);
    if (!player) throw new UserError('Du bist nicht in diesem Raum.', 403);
    if (player.token !== me.token) throw new UserError(OTHER_DEVICE, 403);

    if (msg.t === 'state') return { snapshot: await snapshot(room, me.id), changed: false };
    if (msg.t === 'push-subscribe' || msg.t === 'push-unsubscribe' || msg.t === 'seen') {
      await pushRequest(store, code, player, msg);
      return { snapshot: { ok: true }, changed: false };
    }

    const outcome = apply(room.data, player, msg);
    if (!outcome) return { snapshot: await snapshot(room, me.id), changed: false };

    if (await store.update(code, room.version, room.data)) {
      room.version++;
      if (outcome.finished) await store.addResult(code, outcome.finished);
      if (msg.t === 'leave') {
        await store.removePushForPlayer(code, player.id);
        if (room.data.players.length === 0) await store.remove(code);
        return { snapshot: { left: true, room: code, version: room.version }, changed: true };
      }
      return { snapshot: await snapshot(room, me.id), changed: true, notes: outcome.notes };
    }
    // Jemand war schneller – neu laden und nochmal.
  }
  throw new UserError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

async function join(msg, me) {
  const store = getStore();
  const name = text(msg.name, 20) || 'Gast';
  const wanted = text(msg.room, 4).toUpperCase();
  const fixedCode = /^[A-Z]{4}$/.test(wanted) ? wanted : null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = fixedCode ? await store.get(fixedCode) : null;

    if (!room) {
      const code = fixedCode ?? randomCode();
      const data = { players: [{ id: me.id, token: me.token, name, score: 0 }], game: null };
      if (await store.create(code, data)) {
        return { snapshot: await snapshot({ code, version: 0, data }, me.id), changed: true };
      }
      continue; // Code gerade vergeben, nochmal versuchen
    }

    let player = room.data.players.find((p) => p.id === me.id);
    let takenOver = false;
    let isNew = false;
    if (player && player.token !== me.token) throw new UserError(OTHER_DEVICE, 403);
    if (player?.name === name) return { snapshot: await snapshot(room, me.id), changed: false };

    if (player) {
      player.name = name;
    } else {
      // Gleicher Name schon im Raum: meistens dieselbe Person auf einem anderen Gerät
      // oder als Web-App auf dem Home-Bildschirm (die hat auf dem iPhone einen eigenen Speicher).
      // Nach Rückfrage wird der Platz mit allen Punkten übernommen; das alte Gerät ist dann abgemeldet.
      const existing = room.data.players.find((p) => sameName(p.name, name));
      if (existing && !msg.takeover) {
        throw new UserError(`In diesem Raum spielt schon jemand als „${existing.name}“.`, 409, 'name_taken');
      }
      if (existing) {
        existing.token = me.token;
        player = existing;
        takenOver = true;
      } else {
        if (room.data.players.length >= 20) throw new UserError('Der Raum ist voll.');
        player = { id: me.id, token: me.token, name, score: 0 };
        room.data.players.push(player);
        isNew = true;
      }
    }
    if (await store.update(room.code, room.version, room.data)) {
      room.version++;
      // Das alte Gerät bekommt keine Benachrichtigungen mehr für diesen Platz.
      if (takenOver) await store.removePushForPlayer(room.code, player.id);
      const notes = isNew
        ? others(room.data, player).map((p) => note(p, 'Spielzimmer', `${name} ist jetzt im Raum.`))
        : [];
      return { snapshot: await snapshot(room, player.id), changed: true, notes };
    }
  }
  throw new UserError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

// Wendet eine Anfrage auf die Raumdaten an (verändert `data`).
// Rückgabe: false = nichts geändert, sonst { finished?: Ergebnis für den Verlauf }
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
        ? others(data, player).map((p) => note(p, entry.meta.name, g.state.result.text ?? 'Spiel vorbei.'))
        : waitingFor(entry, g.state, data.players)
            .filter((id) => id !== player.id)
            .map((id) => note({ id }, entry.meta.name, `Du bist dran. ${player.name} wartet auf dich.`));
      return { finished, notes };
    }
    case 'leave':
      data.players = data.players.filter((p) => p.id !== player.id);
      return {};
    default:
      return false;
  }
}

// --- Benachrichtigungen ---

const note = (to, title, body) => ({ to: to.id, title, body });
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
      p,
      entry.meta.name,
      `${player.name} hat das Spiel gestartet.${waiting.includes(p.id) ? ' Du bist dran.' : ''}`,
    ),
  );
}

// Push-Abo speichern/löschen und "schaut gerade zu" melden. Ändert den Raum nicht.
async function pushRequest(store, code, player, msg) {
  if (msg.t === 'push-subscribe') {
    if (!validSubscription(msg.subscription)) throw new UserError('Ungültiges Benachrichtigungs-Abo.');
    const { endpoint, keys } = msg.subscription;
    await store.savePush({
      endpoint,
      room_code: code,
      player_id: player.id,
      subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      active_until: new Date(Date.now() + ACTIVE_FOR_MS).toISOString(),
    });
  } else if (msg.t === 'push-unsubscribe') {
    const endpoint = text(msg.endpoint, 1000);
    const own = (await store.listPush(code)).find((s) => s.endpoint === endpoint && s.player_id === player.id);
    if (own) await store.removePush(endpoint);
  } else {
    const endpoint = text(msg.endpoint, 1000);
    const until = msg.visible ? new Date(Date.now() + ACTIVE_FOR_MS).toISOString() : null;
    await store.touchPush(endpoint, code, player.id, until);
  }
}

function startGame(data, entry) {
  const [min, max] = entry.meta.players;
  const n = data.players.length;
  if (n < min) throw new UserError(`${entry.meta.name} braucht mindestens ${min} Spieler.`);
  if (n > max) throw new UserError(`${entry.meta.name} geht mit höchstens ${max} Spielern.`);
  const state = entry.mod.setup(data.players.map(({ id, name }) => ({ id, name })));
  data.game = { id: entry.id, state };
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

// Was ein Spieler zu sehen bekommt (ohne Geheimnisse der anderen und ohne Tokens).
async function snapshot(room, meId) {
  const g = room.data.game;
  let game = null;
  if (g) {
    const entry = games.get(g.id);
    game = { id: g.id, name: entry?.meta.name ?? g.id, view: null, result: g.state.result ?? null };
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
