// Spielzimmer – Browser-Seite: Verbindung, Lobby und Anzeige der Spiele.

const $ = (sel) => document.querySelector(sel);

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// crypto.randomUUID gibt es nur über https/localhost – im WLAN per IP nicht.
const randomId = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');

const myId = store.get('spielzimmer.id') ?? randomId();
store.set('spielzimmer.id', myId);

// ---------------------------------------------------------------------------
// Verbindung
// ---------------------------------------------------------------------------

let ws = null;
let joined = null; // { room, name } sobald man in einem Raum ist
let kicked = false;
let retries = 0;
let connTimer = null;

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retries = 0;
    showConn(false);
    if (joined) sendJoin();
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    if (kicked) return;
    if (joined) showConn(true);
    setTimeout(connect, Math.min(500 * 2 ** retries++, 5000));
  };
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else toast('Keine Verbindung – versuche es gleich nochmal.');
}

function sendJoin() {
  ws.send(JSON.stringify({ t: 'join', room: joined.room, name: joined.name, playerId: myId }));
}

function join(room, name) {
  joined = { room, name };
  store.set('spielzimmer.name', name);
  if (ws?.readyState === WebSocket.OPEN) sendJoin();
}

function leave() {
  send({ t: 'leave' });
  joined = null;
  store.del('spielzimmer.room');
  history.replaceState(null, '', location.pathname);
  current = null;
  showStart();
}

function handle(msg) {
  switch (msg.t) {
    case 'welcome':
      if (!joined) break;
      joined.room = msg.room;
      store.set('spielzimmer.room', msg.room);
      history.replaceState(null, '', `?raum=${msg.room}`);
      break;
    case 'room':
      if (joined) renderRoom(msg);
      break;
    case 'error':
      toast(msg.message);
      break;
    case 'kicked':
      kicked = true;
      ws.close();
      document.body.innerHTML = `<main class="app"><div class="card stack center" style="margin-top:48px">
        <p class="big">Der Raum ist in einem anderen Fenster geöffnet.</p>
        <button class="btn primary" onclick="location.reload()">Hier weiterspielen</button></div></main>`;
      break;
  }
}

function showConn(on) {
  clearTimeout(connTimer);
  // Kurze Aussetzer nicht gleich anzeigen.
  if (on) connTimer = setTimeout(() => ($('#conn').hidden = false), 800);
  else $('#conn').hidden = true;
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

// ---------------------------------------------------------------------------
// Startseite
// ---------------------------------------------------------------------------

function showStart() {
  $('#room').hidden = true;
  $('#start').hidden = false;
  $('#name').value = store.get('spielzimmer.name') ?? '';
  (!$('#name').value ? $('#name') : $('#code').value ? $('#join') : $('#create')).focus();
}

function startWith(room) {
  const name = $('#name').value.trim();
  if (!name) {
    $('#name').focus();
    return toast('Wie heißt du?');
  }
  if (room !== null && !/^[A-Za-z]{4}$/.test(room)) {
    $('#code').focus();
    return toast('Der Raum-Code hat 4 Buchstaben.');
  }
  join(room?.toUpperCase() ?? null, name);
}

$('#create').onclick = () => startWith(null);
$('#join').onclick = () => startWith($('#code').value.trim());
$('#start-form').onsubmit = (e) => {
  e.preventDefault();
  const code = $('#code').value.trim();
  startWith(code ? code : null);
};

// ---------------------------------------------------------------------------
// Raum: Kopfzeile, Lobby, Spiel
// ---------------------------------------------------------------------------

let last = null; // letzte Nachricht vom Server

function renderRoom(msg) {
  last = msg;
  $('#start').hidden = true;
  $('#room').hidden = false;
  $('#room-code').textContent = msg.room;
  $('#players').innerHTML = msg.players
    .map((p) => `<span class="player ${p.online ? 'online' : ''} ${p.id === myId ? 'me' : ''}">
        <span class="dot"></span>${esc(p.name)}${p.id === myId ? ' <span class="muted">(du)</span>' : ''}
        <span class="score" title="Gewonnene Spiele">${p.score}</span></span>`)
    .join('');
  $('#to-lobby').hidden = !msg.game;
  if (msg.game) renderGame(msg);
  else renderLobby(msg);
}

function renderLobby(msg) {
  current = null;
  $('#game-wrap').hidden = true;
  $('#lobby').hidden = false;
  const n = msg.players.length;
  const hint = n < 2
    ? `<div class="card lobby-hint">👋 Du bist noch allein hier. Tippe oben auf <b>Einladen</b> und schick den Link – dann könnt ihr loslegen.</div>`
    : '';
  const cards = msg.games
    .map((g) => {
      const [min, max] = g.players;
      const fits = n >= min && n <= max;
      const count = min === max ? `${min} Spieler` : `${min}–${max} Spieler`;
      return `<button class="card game-card" data-game="${esc(g.id)}" ${fits ? '' : 'disabled'}>
          <span class="emoji">${esc(g.emoji)}</span>
          <span class="title">${esc(g.name)}</span>
          <span class="desc">${esc(g.description)}</span>
          <span class="tag">${count}</span>
        </button>`;
    })
    .join('');
  $('#lobby').innerHTML = `${hint}
    <div class="game-grid">${cards || '<p class="muted">Noch keine Spiele im Ordner <code>games/</code>.</p>'}</div>
    <div class="lobby-foot muted">
      <span>Neues Spiel erfinden? Einfach eine Datei in <code>games/</code> anlegen.</span>
      <button class="btn ghost small" id="leave">Raum verlassen</button>
    </div>`;
}

$('#lobby').addEventListener('click', (e) => {
  const card = e.target.closest('[data-game]');
  if (card) return send({ t: 'choose', game: card.dataset.game });
  if (e.target.closest('#leave')) leave();
});

$('#to-lobby').onclick = () => send({ t: 'lobby' });

$('#share').onclick = async () => {
  const url = `${location.origin}${location.pathname}?raum=${last.room}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Spielzimmer', text: 'Komm spielen!', url });
    await navigator.clipboard.writeText(url);
    toast('Link kopiert!');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    prompt('Diesen Link schicken:', url);
  }
};

// ---------------------------------------------------------------------------
// Spiele anzeigen
// ---------------------------------------------------------------------------

const modules = new Map();
let current = null; // { id, v, key } des gerade angezeigten Spiels
let renderSeq = 0;

function loadModule(id, v) {
  const key = `${id}@${v}`;
  if (!modules.has(key)) {
    modules.set(key, import(`/games/${encodeURIComponent(id)}.js?v=${v}`).then((mod) => {
      if (mod.style) {
        const tag = document.createElement('style');
        tag.textContent = mod.style;
        document.head.append(tag);
      }
      return mod;
    }));
  }
  return modules.get(key);
}

async function renderGame(msg) {
  $('#lobby').hidden = true;
  $('#game-wrap').hidden = false;
  const { game } = msg;
  const players = msg.players.map(({ id, name }) => ({ id, name }));

  renderResult(game.result);

  // Nur neu zeichnen, wenn sich wirklich etwas geändert hat (sonst gehen z.B. Eingaben verloren).
  const key = JSON.stringify([game.id, game.v, game.view, game.result, game.error, players]);
  if (current?.key === key) return;
  current = { id: game.id, v: game.v, key };

  const el = $('#game');
  if (game.error) return showGameError(game.error);

  const seq = ++renderSeq;
  let mod;
  try {
    mod = await loadModule(game.id, game.v);
  } catch (err) {
    console.error(err);
    return showGameError(`Spiel „${game.name}“ konnte nicht geladen werden:\n${err.message}`);
  }
  if (seq !== renderSeq) return; // inzwischen kam schon ein neuerer Stand

  const api = {
    me: myId,
    players,
    name: (id) => players.find((p) => p.id === id)?.name ?? '?',
    send: (type, data) => send({ t: 'action', type, data }),
    esc,
    result: game.result,
  };
  try {
    mod.render(el, game.view, api);
  } catch (err) {
    console.error(err);
    showGameError(`Fehler beim Anzeigen von „${game.name}“:\n${err.message}`);
  }
}

function showGameError(text) {
  $('#game').innerHTML = `<div class="card game-error">${esc(text)}</div>`;
}

function renderResult(result) {
  const el = $('#result');
  if (!result) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const won = result.winners?.includes(myId);
  const html = `<div class="card result ${won ? 'won' : ''}">
      <div class="result-text">${won ? '🎉 ' : ''}${esc(result.text ?? 'Spiel vorbei')}</div>
      <div class="row center">
        <button class="btn primary" data-cmd="restart">Nochmal</button>
        <button class="btn" data-cmd="lobby">Anderes Spiel</button>
      </div>
    </div>`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = false;
}

$('#result').addEventListener('click', (e) => {
  const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
  if (cmd) send({ t: cmd });
});

// Kurzschreibweise für Spiele:
//   <button data-action="setzen" data-value="3">   → sendet Aktion "setzen" mit 3
//   <form data-action="antwort"> <input name="text"> → sendet { text: "..." }
const parseValue = (v) => {
  if (v === undefined) return undefined;
  try { return JSON.parse(v); } catch { return v; }
};

$('#game').addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  e.preventDefault();
  send({ t: 'action', type: el.dataset.action, data: parseValue(el.dataset.value) });
});

$('#game').addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  send({ t: 'action', type: form.dataset.action, data: Object.fromEntries(new FormData(form)) });
});

// ---------------------------------------------------------------------------
// Los geht's
// ---------------------------------------------------------------------------

const urlRoom = new URLSearchParams(location.search).get('raum')?.toUpperCase() ?? null;
const savedName = store.get('spielzimmer.name');
const savedRoom = store.get('spielzimmer.room');

connect();

if (savedName && (urlRoom || savedRoom)) {
  // Direkt zurück in den Raum.
  join(urlRoom ?? savedRoom, savedName);
} else {
  if (urlRoom) $('#code').value = urlRoom;
  showStart();
}
