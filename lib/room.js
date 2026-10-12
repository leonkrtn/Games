// Spielzimmer und Spielzüge. Läuft auf dem Server (API-Route).
//
// Jede Freundschaft hat ein eigenes Spielzimmer mit den beiden Konten als Spielern, dazu gibt es
// Gruppen-Spielzimmer für bis zu sechs Spieler (data.group = { name }, Mitglieder = data.players).
// In einer Gruppe kann ein Mitglied der Bildschirm sein (data.screen = Konto-ID, gewählt in der Lobby):
// Es spielt nicht mit und zeigt groß, was alle sehen dürfen, z.B. auf einem Fernseher.
// Ablauf bei jeder Anfrage: Raum aus der Datenbank laden → Änderung anwenden →
// speichern, aber nur wenn niemand dazwischen gespeichert hat (sonst neu laden
// und nochmal). So gehen gleichzeitige Züge (z.B. bei Schere-Stein-Papier) nicht verloren.

import { games, gameList, resolveOptions } from './games.js';
import { getStore } from './store/index.js';
import { creditGame } from './hai.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_ATTEMPTS = 6;
const HISTORY_LENGTH = 10;
export const PLAYERS_MAX = 6; // so viele spielen höchstens mit
export const GROUP_MAX = 7; // so viele Mitglieder hat eine Gruppe höchstens: sechs Spieler und ein Bildschirm

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Wer mitspielt: alle Mitglieder außer dem Bildschirm. Diese Reihenfolge ergibt die Spielerfarben. */
export const playing = (data) => data.players.filter((p) => p.id !== data.screen);

/** Raum-Code aus einer Anfrage, so wie er gespeichert ist. */
export const roomCode = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 8);

const randomCode = (length = 6) =>
  Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** Gruppenname aus einer Anfrage: ein bis dreißig Zeichen. */
export function groupName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new UserError('Bitte gib der Gruppe einen Namen.');
  if ([...name].length > 30) throw new UserError('Der Name ist zu lang. Höchstens dreißig Zeichen.');
  return name;
}

/** Legt ein neues Spielzimmer an. players = [{ id, name }], extra = weitere Daten (z.B. { group: { name } }) */
export async function createRoom(store, players, extra = {}) {
  const data = { players: players.map(({ id, name }) => ({ id, name, score: 0 })), game: null, ...extra };
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
  if (msg.t === 'group-add') msg = { ...msg, member: await friendToAdd(store, user, msg.user) };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = await store.get(code);
    if (!room) throw new UserError('Dieses Spielzimmer gibt es nicht mehr.', 404);
    const player = room.data.players.find((p) => p.id === user.id);
    if (!player) throw new UserError('Du spielst in diesem Spielzimmer nicht mit.', 403);
    if (msg.t === 'action' && player.id === room.data.screen) throw new UserError('Der Bildschirm spielt nicht mit.');

    // Ist eine Frist des Spiels abgelaufen? Dann zuerst weiterschalten (auch beim bloßen Nachschauen).
    const before = room.data.game?.state;
    const ticked = tick(room.data) ? afterChange(room.data, player, before) : null;

    const outcome = msg.t === 'state' ? null : apply(room.data, player, msg);
    if (!outcome && !ticked) return { snapshot: await snapshot(room, user.id), changed: false };
    // Wohnt hier der Hai der beiden, bringt jede beendete Partie Reisemeilen (lib/hai.js).
    for (const finished of [ticked?.finished, outcome?.finished]) {
      if (finished && room.data.hai) creditGame(room.data.hai, finished.game_name, Date.now());
    }

    if (await store.update(code, room.version, room.data)) {
      room.version++;
      for (const finished of [ticked?.finished, outcome?.finished]) {
        if (finished) await store.addResult(code, finished);
      }
      if (outcome?.clearUploads) await store.removeUploads(code);
      if (outcome?.added) await store.addGroupMembers(code, [outcome.added], user.id);
      if (outcome?.left) {
        await store.removeGroupMember(code, user.id);
        if (!room.data.players.length) await store.remove(code); // die letzte Person ist gegangen
      }
      const notes = [...(ticked?.notes ?? []), ...(outcome?.notes ?? [])].map((n) => ({
        ...n,
        view: code,
        seq: room.version,
      }));
      const snap = await snapshot(room, user.id);
      if (outcome?.left) snap.left = true;
      return { snapshot: snap, changed: true, notes };
    }
    // Jemand war schneller – neu laden und nochmal.
  }
  throw new UserError('Gerade ist viel los. Bitte nochmal versuchen.', 409);
}

/**
 * Live-Nachrichten eines Spiels (game.live) über den Server: nur der Ersatzweg, wenn die Browser sie
 * nicht direkt über Supabase Realtime austauschen (lokaler Testmodus). msg = { room, data?, since }
 * @returns {{ seq, messages: [{ seq, payload }] }} Nachrichten der anderen nach `since`
 */
export async function live(msg, user) {
  const store = getStore();
  const code = roomCode(msg.room);
  const room = await store.get(code);
  if (!room) throw new UserError('Dieses Spielzimmer gibt es nicht mehr.', 404);
  if (!room.data.players.some((p) => p.id === user.id)) {
    throw new UserError('Du spielst in diesem Spielzimmer nicht mit.', 403);
  }
  if (msg.data && typeof msg.data === 'object') {
    if (JSON.stringify(msg.data).length > 32_000) throw new UserError('Die Nachricht ist zu groß.', 413);
    await store.pushLive(code, { ...msg.data, from: user.id });
  }
  const since = Number.isFinite(Number(msg.since)) ? Number(msg.since) : -1;
  const { seq, messages } = await store.liveSince(code, since);
  return { seq, messages: messages.filter((m) => m.payload?.from !== user.id) };
}

// Wen holt `user` in die Gruppe? Nur eigene Freunde (angenommene Freundschaft).
async function friendToAdd(store, user, id) {
  const target = typeof id === 'string' ? await store.getUser(id) : null;
  const f = target && (await store.getFriendshipBetween(user.id, target.id));
  if (!f || f.status !== 'accepted') throw new UserError('In die Gruppe holen kannst du nur deine Freunde.', 404);
  return { id: target.id, name: target.display_name };
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
    // --- Gruppen: umbenennen, Mitglieder holen, verlassen ---
    case 'group-rename': {
      if (!data.group) throw new UserError('Nur Gruppen haben einen Namen.');
      const name = groupName(msg.name);
      if (name === data.group.name) return false;
      data.group.name = name;
      return {};
    }
    case 'group-add': {
      if (!data.group) throw new UserError('Hier spielt ihr zu zweit. Für mehr Leute gründe eine Gruppe.');
      const m = msg.member;
      if (data.players.some((p) => p.id === m.id)) throw new UserError(`${m.name} ist schon in der Gruppe.`);
      if (data.players.length >= GROUP_MAX) throw new UserError('Eine Gruppe hat höchstens sieben Mitglieder: sechs Spieler und einen Bildschirm.');
      if (data.game) throw new UserError('Neue Mitglieder kommen dazu, wenn gerade kein Spiel läuft.');
      data.players.push({ id: m.id, name: m.name, score: 0 });
      return {
        added: m.id,
        notes: [note(m.id, 'Spielzimmer', `${player.name} hat dich in die Gruppe „${data.group.name}“ geholt.`, 'friends', player.id)],
      };
    }
    case 'group-leave': {
      if (!data.group) throw new UserError('Ein Spielzimmer zu zweit endet nur mit der Freundschaft.');
      data.players = data.players.filter((p) => p.id !== player.id);
      if (data.screen === player.id) {
        delete data.screen; // ohne Bildschirm geht die Partie weiter
        return { left: true };
      }
      const running = Boolean(data.game);
      data.game = null; // eine laufende Partie geht ohne diese Person nicht weiter
      return { left: true, clearUploads: running };
    }
    // Bildschirm wählen (Konto-ID) oder abwählen (null), nur wenn gerade kein Spiel läuft
    case 'screen': {
      if (!data.group) throw new UserError('Einen Bildschirm gibt es nur in Gruppen.');
      const id = typeof msg.user === 'string' && msg.user ? msg.user : null;
      if (id === (data.screen ?? null)) return false;
      if (data.game) throw new UserError('Den Bildschirm wählt ihr, wenn gerade kein Spiel läuft.');
      if (id && !data.players.some((p) => p.id === id)) throw new UserError('Der Bildschirm muss in der Gruppe sein.');
      if (id && data.players.length < 3) throw new UserError('Für einen Bildschirm braucht die Gruppe mindestens drei Mitglieder.');
      if (id) data.screen = id;
      else delete data.screen;
      return {};
    }
    // Was der Bildschirm im Spiel zeigt: 'spiel' (eigene Anzeige des Spiels, wo es eine gibt) oder 'tafel'
    // (nur die Punktetafel). Geht jederzeit, ändert nur die Anzeige.
    case 'screen-mode': {
      if (!data.group) throw new UserError('Einen Bildschirm gibt es nur in Gruppen.');
      const mode = msg.mode === 'tafel' ? 'tafel' : 'spiel';
      if (mode === (data.screenMode ?? 'spiel')) return false;
      if (mode === 'tafel') data.screenMode = 'tafel';
      else delete data.screenMode;
      return {};
    }
    case 'action': {
      const g = data.game;
      if (!g) return false;
      const entry = games.get(g.id);
      if (!entry) throw new UserError('Dieses Spiel gibt es nicht mehr.');
      // Nach dem Ende angekommene Züge still ignorieren (z.B. letzte Tipper in einem Wettlauf);
      // die Antwort zeigt ohnehin schon das Ergebnis. Spiele mit epilogue() nehmen danach noch Züge an,
      // die nur die Anzeige ändern (Kunstkritik schaltet die Bilder auf dem Bildschirm weiter).
      if (g.state.result) return epilogue(g, entry, player, msg);
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

// Zug nach dem Spielende: Ergebnis und Punkte bleiben, niemand wird benachrichtigt.
function epilogue(g, entry, player, msg) {
  if (typeof entry.mod.epilogue !== 'function') return false;
  const result = g.state.result;
  const next = runOnCopy(g.state, (draft) =>
    entry.mod.epilogue(draft, { player: player.id, type: String(msg.type), data: msg.data }),
  );
  if (!next) return false;
  g.state = { ...next, result };
  return {};
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
// Der Bildschirm bekommt keine Nachrichten über Spiele: Er spielt nicht mit.
const others = (data, player) => playing(data).filter((p) => p.id !== player.id);

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
    return waitingFor(entry, state, playing(data))
      .filter((id) => id !== player.id)
      .map((id) => note(id, entry.meta.name, `Du bist dran. ${player.name} wartet auf dich.`, 'turn', player.id));
  }
  try {
    return (entry.mod.notices(state, before, player.id) ?? [])
      .filter((n) => n?.to !== player.id && playing(data).some((p) => p.id === n?.to))
      .map((n) => note(n.to, entry.meta.name, String(n.text ?? '').slice(0, 200), 'turn', player.id));
  } catch (err) {
    console.error(`Fehler in notices() von "${entry.id}":`, err);
    return [];
  }
}

function startNotes(data, entry, player) {
  const waiting = waitingFor(entry, data.game.state, playing(data));
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
  const players = playing(data);
  const n = players.length;
  if (n < min) throw new UserError(`${entry.meta.name} braucht mindestens ${min} Spieler.`);
  if (n > PLAYERS_MAX) throw new UserError('Zu siebt ist einer der Bildschirm. Wählt ihn oben in der Lobby.');
  if (n > max) throw new UserError(`${entry.meta.name} geht mit höchstens ${max} Spielern.`);
  const options = resolveOptions(entry.meta.options, wanted);
  const state = entry.mod.setup(
    players.map(({ id, name }) => ({ id, name })),
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
    const waiting = entry ? waitingFor(entry, g.state, playing(room.data)) : [];
    game = {
      name: entry?.meta.name ?? g.id,
      finished: Boolean(g.state.result),
      myTurn: waiting.includes(meId),
      theirTurn: waiting.some((id) => id !== meId),
      waiting: waiting.filter((id) => id !== meId), // auf wen außer mir das Spiel wartet
    };
  }
  return {
    order: playing(room.data).map((p) => p.id), // Reihenfolge = Spielerfarben (Rot, Schwarz, Blau …)
    scores: Object.fromEntries(room.data.players.map((p) => [p.id, p.score])),
    screen: room.data.screen ?? null, // wer der Bildschirm ist (spielt nicht mit)
    game,
  };
}

/**
 * Was das laufende Spiel `meId` gerade zeigt, laut view() des Spiels (null ohne Spiel).
 * Der Bildschirm sieht nur, was screen() des Spiels erlaubt (ohne screen(): nichts vom Spielstand).
 */
export function currentView(room, meId) {
  const g = room.data.game;
  const entry = g ? games.get(g.id) : null;
  if (!entry) return null;
  if (meId === room.data.screen) return entry.mod.screen ? entry.mod.screen(g.state) : null;
  return entry.mod.view ? entry.mod.view(g.state, meId) : g.state;
}

// Für die Tafel des Bildschirms: Punkte der laufenden Partie laut points() des Spiels und wer dran ist.
function boardInfo(entry, data) {
  const state = data.game.state;
  let points = null;
  if (typeof entry.mod.points === 'function') {
    try {
      points = entry.mod.points(state) ?? null;
    } catch (err) {
      console.error(`Fehler in points() von "${entry.id}":`, err);
    }
  }
  return { points, waiting: waitingFor(entry, state, playing(data)) };
}

// Was ein Spieler (oder der Bildschirm) zu sehen bekommt, ohne Geheimnisse der anderen.
async function snapshot(room, meId) {
  const g = room.data.game;
  const screen = room.data.players.find((p) => p.id === room.data.screen) ?? null;
  const isScreen = screen?.id === meId;
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
        console.error(`Fehler in ${isScreen ? 'screen' : 'view'}() von "${g.id}":`, err);
        game.error = `Fehler im Spiel (${isScreen ? 'screen' : 'view'}): ${err.message}`;
      }
      // Bildschirm: eigene Anzeige des Spiels (present) oder die Tafel der Plattform
      if (isScreen) {
        const present = typeof entry.mod.present === 'function' && room.data.screenMode !== 'tafel';
        Object.assign(game, { present }, boardInfo(entry, room.data));
      }
    }
  }
  return {
    room: room.code,
    version: room.version,
    now: Date.now(), // Serverzeit, damit Countdowns im Browser auch bei falsch gehender Uhr stimmen
    me: meId,
    role: isScreen ? 'screen' : 'player',
    players: playing(room.data).map(({ id, name, score }) => ({ id, name, score })), // wer mitspielt
    // mode: was er im Spiel zeigt ('spiel' oder 'tafel', Wahl in der Lobby)
    screen: screen && { id: screen.id, name: screen.name, score: screen.score, mode: room.data.screenMode ?? 'spiel' },
    group: room.data.group ? { name: room.data.group.name } : null, // null: Spielzimmer einer Freundschaft
    games: gameList,
    lastOptions: room.data.lastOptions ?? {}, // zuletzt gewählte Spieloptionen, für die Lobby
    game,
    history: g ? null : await getStore().listResults(room.code, HISTORY_LENGTH),
  };
}
