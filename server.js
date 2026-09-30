import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = path.join(ROOT, 'games');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Spiele laden: jede Datei in games/ ist ein Spiel (Dateien mit _ am Anfang
// werden ignoriert). Änderungen werden live übernommen, ohne Neustart.
// ---------------------------------------------------------------------------

let games = new Map(); // id -> { id, v, mod, meta }

async function loadGames() {
  const next = new Map();
  for (const file of fs.readdirSync(GAMES_DIR).sort()) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    const id = file.slice(0, -3);
    const full = path.join(GAMES_DIR, file);
    const v = Math.floor(fs.statSync(full).mtimeMs);
    const known = games.get(id);
    if (known && known.v === v) {
      next.set(id, known);
      continue;
    }
    try {
      const mod = await import(`${pathToFileURL(full)}?v=${v}`);
      for (const fn of ['setup', 'action', 'render']) {
        if (typeof mod[fn] !== 'function') throw new Error(`export function ${fn} fehlt`);
      }
      if (!mod.meta?.name) throw new Error('export const meta = { name: ... } fehlt');
      const [min = 1, max = 99] = mod.meta.players ?? [];
      const meta = {
        name: mod.meta.name,
        emoji: mod.meta.emoji ?? '🎲',
        description: mod.meta.description ?? '',
        players: [min, max],
      };
      next.set(id, { id, v, mod, meta });
      if (known) console.log(`Spiel aktualisiert: ${id}`);
    } catch (err) {
      console.error(`Spiel "${id}" konnte nicht geladen werden:`, err);
    }
  }
  games = next;
}

await loadGames();
console.log(`Spiele: ${[...games.keys()].join(', ') || '(keine)'}`);

let reloadTimer;
fs.watch(GAMES_DIR, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    await loadGames();
    for (const room of rooms.values()) broadcast(room);
  }, 200);
});

// ---------------------------------------------------------------------------
// Dateien ausliefern
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
};

function serveFile(res, base, rel) {
  const file = path.join(base, rel);
  if (!file.startsWith(base + path.sep)) return notFound(res);
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return notFound(res);
  }
  if (pathname.startsWith('/games/')) return serveFile(res, GAMES_DIR, pathname.slice('/games/'.length));
  if (pathname === '/') pathname = '/index.html';
  serveFile(res, PUBLIC_DIR, pathname.slice(1));
});

// ---------------------------------------------------------------------------
// Räume
// ---------------------------------------------------------------------------

const rooms = new Map(); // code -> { code, players, game, lastActive }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function createRoom(code) {
  while (!code || rooms.has(code)) {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  }
  const room = { code, players: [], game: null, lastActive: Date.now() };
  rooms.set(code, room);
  return room;
}

function startGame(room, entry) {
  const [min, max] = entry.meta.players;
  const n = room.players.length;
  if (n < min) throw new Error(`${entry.meta.name} braucht mindestens ${min} Spieler.`);
  if (n > max) throw new Error(`${entry.meta.name} geht mit höchstens ${max} Spielern.`);
  const state = entry.mod.setup(room.players.map(({ id, name }) => ({ id, name })));
  room.game = { id: entry.id, v: entry.v, mod: entry.mod, meta: entry.meta, state, counted: false };
}

// Punkte zählen, sobald ein Spiel state.result gesetzt hat.
function countResult(room) {
  const g = room.game;
  if (!g?.state?.result || g.counted) return;
  g.counted = true;
  for (const id of g.state.result.winners ?? []) {
    const p = room.players.find((p) => p.id === id);
    if (p) p.score++;
  }
}

function snapshot(room, me) {
  const g = room.game;
  let game = null;
  if (g) {
    game = { id: g.id, v: g.v, name: g.meta.name, view: null, result: g.state.result ?? null };
    try {
      game.view = g.mod.view ? g.mod.view(g.state, me.id) : g.state;
    } catch (err) {
      console.error(`Fehler in view() von "${g.id}":`, err);
      game.error = `Fehler im Spiel (view): ${err.message}`;
    }
  }
  return {
    t: 'room',
    room: room.code,
    me: me.id,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, online: !!p.ws })),
    games: [...games.values()].map((e) => ({ id: e.id, v: e.v, ...e.meta })),
    game,
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room) {
  room.lastActive = Date.now();
  for (const p of room.players) if (p.ws) send(p.ws, snapshot(room, p));
}

// Fehler, die ein Spiel absichtlich wirft (ungültiger Zug), sind normale Errors.
// Alles andere (TypeError usw.) ist ein Bug im Spiel und wird geloggt.
function isBug(err) {
  return !(err instanceof Error) || err.constructor !== Error;
}

// ---------------------------------------------------------------------------
// Live-Verbindung
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  let room = null;
  let player = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      handle(msg);
    } catch (err) {
      if (isBug(err)) console.error(`Fehler bei "${msg.t}"${room?.game ? ` im Spiel "${room.game.id}"` : ''}:`, err);
      send(ws, { t: 'error', message: isBug(err) ? `Fehler im Spiel: ${err?.message ?? err}` : err.message });
    }
  });

  ws.on('close', () => {
    if (room && player?.ws === ws) {
      player.ws = null;
      broadcast(room);
    }
  });

  function handle(msg) {
    if (msg.t === 'join') {
      if (room && player?.ws === ws) player.ws = null;
      const name = String(msg.name ?? '').trim().slice(0, 20) || 'Gast';
      const id = String(msg.playerId ?? '').slice(0, 64) || Math.random().toString(36).slice(2);
      const code = String(msg.room ?? '').trim().toUpperCase();
      // Unbekannter Code (z.B. nach Server-Neustart): Raum mit diesem Code neu anlegen.
      room = rooms.get(code) ?? createRoom(/^[A-Z]{4}$/.test(code) ? code : null);
      player = room.players.find((p) => p.id === id);
      if (player) {
        if (player.ws && player.ws !== ws) send(player.ws, { t: 'kicked' });
        player.name = name;
        player.ws = ws;
      } else {
        player = { id, name, score: 0, ws };
        room.players.push(player);
      }
      send(ws, { t: 'welcome', room: room.code, playerId: id });
      return broadcast(room);
    }

    if (!room || player?.ws !== ws) return;

    switch (msg.t) {
      case 'choose': {
        const entry = games.get(msg.game);
        if (!entry) throw new Error('Dieses Spiel gibt es nicht.');
        startGame(room, entry);
        break;
      }
      case 'restart': {
        if (!room.game) return;
        // Neueste Version der Spieldatei verwenden – praktisch beim Ausprobieren.
        startGame(room, games.get(room.game.id) ?? room.game);
        break;
      }
      case 'lobby':
        room.game = null;
        break;
      case 'action': {
        const g = room.game;
        if (!g) return;
        if (g.state.result) throw new Error('Das Spiel ist schon vorbei.');
        const draft = structuredClone(g.state);
        const returned = g.mod.action(draft, { player: player.id, type: String(msg.type), data: msg.data });
        g.state = returned === undefined ? draft : returned;
        countResult(room);
        break;
      }
      case 'leave': {
        room.players = room.players.filter((p) => p !== player);
        if (room.players.length === 0) rooms.delete(room.code);
        else broadcast(room);
        room = player = null;
        return;
      }
      default:
        return;
    }
    broadcast(room);
  }
});

// Tote Verbindungen erkennen (z.B. Handy im Standby) und Verbindung wachhalten.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

// Verlassene Räume nach einem Tag aufräumen.
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.lastActive < cutoff && room.players.every((p) => !p.ws)) rooms.delete(code);
  }
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log(`Spielzimmer läuft auf http://localhost:${PORT}`));
