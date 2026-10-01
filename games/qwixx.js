// Qwixx: würfeln, ankreuzen, Reihen schließen.
//
// Eine Runde: Wer dran ist, würfelt mit zwei weißen und vier farbigen Würfeln.
// 1. Beide dürfen gleichzeitig die Summe der weißen Würfel in einer Reihe ankreuzen. Das ist offen:
//    Man sieht sofort, was der andere gewählt hat.
// 2. Danach darf nur, wer gewürfelt hat, einen weißen und einen farbigen Würfel zusammenzählen.
// Wer würfelt und in beiden Schritten nichts ankreuzt, bekommt einen Fehlwurf. Angekreuzt wird nur
// von links nach rechts. Das letzte Feld einer Reihe geht erst ab fünf Kreuzen, dann ist die Reihe für
// alle geschlossen und ihr Würfel fällt weg. Ende bei zwei geschlossenen Reihen oder vier Fehlwürfen.
//
// Einstellungen in der Lobby (meta.options): klassisch oder gemixxt (jedes Feld hat eine eigene
// Farbe, Weiß plus Farbe nur auf ein Feld dieser Farbe; die Schlösser bleiben Rot, Gelb, Grün, Blau)
// und Zeit pro Entscheidung (danach wird ausgelassen bzw. automatisch gewürfelt, siehe tick).
//
// Motion: 3D-Würfel rollen über den Tisch, Kreuze zeichnen sich ein, übersprungene Felder verblassen,
// das Schloss schnappt zu und der Würfel der Reihe kippt weg, Punkte zählen hoch, am Ende wird Reihe
// für Reihe gewertet.

export const meta = {
  name: 'Qwixx',
  description: 'Würfelt, kreuzt an und schließt Reihen. Wer mehr Punkte hat, gewinnt.',
  players: [2, 2],
  options: [
    {
      id: 'variante',
      label: 'Variante',
      choices: [
        { value: 'klassisch', label: 'Klassisch' },
        { value: 'gemixxt', label: 'Gemixxt' },
      ],
    },
    {
      id: 'zeit',
      label: 'Zeit pro Entscheidung',
      choices: [
        { value: 0, label: 'Ohne Limit' },
        { value: 60, label: 'Eine Minute' },
        { value: 180, label: 'Drei Minuten' },
      ],
    },
  ],
};

const COLORS = ['r', 'y', 'g', 'b']; // Reihen- und Würfelfarben, zugleich die Farben der Schlösser
const COLOR_NAME = { r: 'Rot', y: 'Gelb', g: 'Grün', b: 'Blau' };
const UP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DOWN = [...UP].reverse();
// Gemixxt: In jeder Spalte kommt jede Farbe einmal vor, die Abschnitte sind kurz,
// und das letzte Feld hat die Farbe des Schlosses (also des Würfels, der beim Schließen wegfällt).
const MIXED = ['grybyrggbbr', 'bbryggbyrgy', 'rggrrbybyyg', 'yybgbyrrgrb'];
const LAST = 10; // Index des letzten Feldes vor dem Schloss
const NEED = 5; // so viele Kreuze braucht eine Reihe, bevor man das letzte Feld ankreuzen darf
const MAX_FAILS = 4;
const GRACE = 3000; // ms nach Ablauf der Frist, in denen ein Zug noch ankommt

const layoutFor = (variant) =>
  COLORS.map((lock, r) => ({
    lock,
    nums: r < 2 ? UP : DOWN,
    colors: variant === 'gemixxt' ? [...MIXED[r]] : Array(11).fill(lock),
  }));
const LAYOUTS = { klassisch: layoutFor('klassisch'), gemixxt: layoutFor('gemixxt') };
const layoutOf = (s) => LAYOUTS[s.variant];

const otherOf = (s, id) => s.players.find((p) => p.id !== id).id;
const nameOf = (s, id) => s.players.find((p) => p.id === id).name;

export function setup(players, options = {}) {
  const limit = [60, 180].includes(options.zeit) ? options.zeit : 0;
  return {
    players,
    variant: options.variante === 'gemixxt' ? 'gemixxt' : 'klassisch',
    limit, // Sekunden pro Entscheidung, 0 = ohne Limit
    active: players[Math.floor(Math.random() * players.length)].id, // wer würfelt
    phase: 'wuerfeln', // wuerfeln → weiss → farbe → wuerfeln … → ende
    deadline: limit ? Date.now() + limit * 1000 : null,
    rolls: 0,
    dice: null, // { w1, w2, r, y, g, b }; Würfel geschlossener Reihen: null
    // Der letzte Wurf: by = wer gewürfelt hat. Wahl: null = offen, [reihe, feld] = angekreuzt,
    // 'nichts' = ausgelassen, 'passt' = nichts möglich, 'zeit' = Zeit abgelaufen
    round: null, // { by, white: { [id]: Wahl }, color: Wahl, fail }
    locked: [false, false, false, false],
    sheets: Object.fromEntries(
      players.map((p) => [p.id, { marks: [[], [], [], []], locks: [false, false, false, false], fails: 0 }]),
    ),
    end: null, // 'reihen' | 'fehlwuerfe'
  };
}

export function action(s, { player, type, data }) {
  if (!s.sheets[player]) throw new Error('Du spielst nicht mit.');
  if (s.phase === 'ende' || data?.roll !== s.rolls) return; // gehört zu einem älteren Wurf (doppelt getippt)
  const now = Date.now();

  if (type === 'wuerfeln') {
    if (s.phase !== 'wuerfeln') return;
    if (player !== s.active) throw new Error(`${nameOf(s, s.active)} würfelt.`);
    return roll(s, now);
  }

  if (type === 'weiss') {
    if (s.phase !== 'weiss' || s.round.white[player] !== null) return;
    const field = readField(data);
    if (field) {
      check(s, player, field, whiteOptions(s, player), `Die weiße Summe ist ${word(whiteSum(s))}.`);
      mark(s, player, field);
    }
    s.round.white[player] = field ?? 'nichts';
    if (s.players.every((p) => s.round.white[p.id] !== null)) afterWhite(s, now);
    return;
  }

  if (type === 'farbe') {
    if (s.phase !== 'farbe') return;
    if (player !== s.active) throw new Error('Weiß plus Farbe darf nur, wer gewürfelt hat.');
    const field = readField(data);
    if (field) {
      check(s, player, field, colorOptions(s, player), 'Kein weißer und farbiger Würfel ergeben diese Zahl.');
      mark(s, player, field);
      if (field[1] === LAST) lockRow(s, field[0]);
    }
    s.round.color = field ?? 'nichts';
    return endRound(s, now);
  }
}

// Frist abgelaufen: Wer nicht gewürfelt hat, für den wird gewürfelt; wer nicht gewählt hat, lässt aus.
export function tick(s, now) {
  if (s.deadline === null || now < s.deadline + GRACE) return;
  if (s.phase === 'wuerfeln') return roll(s, now);
  if (s.phase === 'weiss') {
    for (const p of s.players) if (s.round.white[p.id] === null) s.round.white[p.id] = 'zeit';
    return afterWhite(s, now);
  }
  if (s.phase === 'farbe') {
    s.round.color = 'zeit';
    return endRound(s, now);
  }
}

export function waitingFor(s) {
  if (s.phase === 'wuerfeln' || s.phase === 'farbe') return [s.active];
  if (s.phase === 'weiss') return s.players.filter((p) => s.round.white[p.id] === null).map((p) => p.id);
  return [];
}

// Benachrichtigt, wer gerade neu gefragt ist (nicht jeden Zwischenschritt des anderen).
export function notices(s, before, player) {
  const fresh = s.phase !== before.phase || s.rolls !== before.rolls;
  const was = waitingFor(before);
  return waitingFor(s)
    .filter((id) => fresh || !was.includes(id))
    .map((id) => ({ to: id, text: noticeText(s, id) }));
}

function noticeText(s, id) {
  if (s.phase === 'wuerfeln') {
    const r = s.round;
    return r?.fail && r.by !== id
      ? `${nameOf(s, r.by)} hat einen Fehlwurf. Du bist dran mit Würfeln.`
      : 'Du bist dran mit Würfeln.';
  }
  if (s.phase === 'farbe') return 'Du bist dran mit Weiß plus Farbe.';
  const sum = word(whiteSum(s));
  return s.round.by === id
    ? `Die Zeit war um, für dich wurde gewürfelt. Weiße Summe ${sum}.`
    : `${nameOf(s, s.round.by)} hat gewürfelt. Weiße Summe ${sum}.`;
}

// --- Ablauf ---

function roll(s, now) {
  const die = () => 1 + Math.floor(Math.random() * 6);
  s.rolls++;
  s.dice = { w1: die(), w2: die() };
  COLORS.forEach((c, r) => (s.dice[c] = s.locked[r] ? null : die()));
  s.round = { by: s.active, white: Object.fromEntries(s.players.map((p) => [p.id, null])), color: null, fail: false };
  s.phase = 'weiss';
  s.deadline = deadlineFrom(s, now);
  // Wer die weiße Summe nirgends ankreuzen kann, muss nicht erst „Nichts“ tippen.
  for (const p of s.players) if (!whiteOptions(s, p.id).length) s.round.white[p.id] = 'passt';
  if (s.players.every((p) => s.round.white[p.id] !== null)) afterWhite(s, now);
}

function afterWhite(s, now) {
  // In Schritt eins geschlossene Reihen gelten erst jetzt: So dürfen beide gleichzeitig in derselben
  // Reihe ankreuzen oder sie sogar beide schließen.
  COLORS.forEach((_, r) => {
    if (!s.locked[r] && s.players.some((p) => s.sheets[p.id].locks[r])) lockRow(s, r);
  });
  if (over(s)) return finish(s);
  s.phase = 'farbe';
  s.deadline = deadlineFrom(s, now);
  if (!colorOptions(s, s.active).length) {
    s.round.color = 'passt';
    endRound(s, now);
  }
}

function endRound(s, now) {
  const r = s.round;
  if (!Array.isArray(r.white[r.by]) && !Array.isArray(r.color)) {
    s.sheets[r.by].fails++;
    r.fail = true;
  }
  if (over(s)) return finish(s);
  s.active = otherOf(s, r.by);
  s.phase = 'wuerfeln';
  s.deadline = deadlineFrom(s, now);
}

const deadlineFrom = (s, now) => (s.limit ? now + s.limit * 1000 : null);
const over = (s) =>
  s.locked.filter(Boolean).length >= 2 || s.players.some((p) => s.sheets[p.id].fails >= MAX_FAILS);

function finish(s) {
  s.phase = 'ende';
  s.deadline = null;
  s.end = s.locked.filter(Boolean).length >= 2 ? 'reihen' : 'fehlwuerfe';
  const [a, b] = s.players.map((p) => ({ p, total: scoreOf(s, p.id).total }));
  if (a.total === b.total) {
    s.result = { winners: [], text: `Unentschieden, beide haben ${word(a.total)} Punkte.` };
    return;
  }
  const [w, l] = a.total > b.total ? [a, b] : [b, a];
  s.result = { winners: [w.p.id], text: `${w.p.name} gewinnt, ${word(w.total)} zu ${word(l.total)}.` };
}

// --- Felder ---

const lastOf = (sheet, r) => sheet.marks[r].at(-1) ?? -1;
const whiteSum = (s) => s.dice.w1 + s.dice.w2;

// Warum ein Feld für diesen Spieler nicht geht (unabhängig von den Würfeln), sonst null.
function blocked(s, id, r, i) {
  const sheet = s.sheets[id];
  if (s.locked[r]) return 'Diese Reihe ist geschlossen.';
  if (sheet.marks[r].includes(i)) return 'Das Feld ist schon angekreuzt.';
  if (i < lastOf(sheet, r)) return 'Angekreuzt wird nur von links nach rechts.';
  if (i === LAST && sheet.marks[r].length < NEED) return 'Das letzte Feld geht erst ab fünf Kreuzen in der Reihe.';
  return null;
}

// Schritt eins: die weiße Summe, in jeder Reihe und auf jeder Feldfarbe.
function whiteOptions(s, id) {
  const sum = whiteSum(s);
  return layoutOf(s).flatMap((row, r) => {
    const i = row.nums.indexOf(sum);
    return i >= 0 && !blocked(s, id, r, i) ? [[r, i]] : [];
  });
}

// Schritt zwei: Welche weißen Würfel ergeben mit dem Würfel in der Feldfarbe die Zahl des Feldes?
function colorPairs(s, r, i) {
  const row = layoutOf(s)[r];
  const v = s.dice[row.colors[i]];
  if (v == null) return [];
  return ['w1', 'w2'].filter((w) => s.dice[w] + v === row.nums[i]);
}

function colorOptions(s, id) {
  return layoutOf(s).flatMap((row, r) =>
    row.nums.flatMap((_, i) => (colorPairs(s, r, i).length && !blocked(s, id, r, i) ? [[r, i]] : [])),
  );
}

function readField(data) {
  const f = data?.field;
  if (f == null) return null;
  const [r, i] = Array.isArray(f) ? f.map(Number) : [];
  if (!(Number.isInteger(r) && r >= 0 && r < 4 && Number.isInteger(i) && i >= 0 && i <= LAST)) {
    throw new Error('Dieses Feld gibt es nicht.');
  }
  return [r, i];
}

function check(s, id, [r, i], options, mismatch) {
  if (options.some(([a, b]) => a === r && b === i)) return;
  throw new Error(blocked(s, id, r, i) ?? mismatch);
}

function mark(s, id, [r, i]) {
  const sheet = s.sheets[id];
  sheet.marks[r].push(i);
  if (i === LAST) sheet.locks[r] = true; // das Schloss zählt als zusätzliches Kreuz
}

function lockRow(s, r) {
  s.locked[r] = true;
  s.dice[COLORS[r]] = null; // der Würfel dieser Farbe ist aus dem Spiel
}

// Punkte pro Reihe: ein Kreuz eins, zwei drei, drei sechs … (Dreieckszahlen), Fehlwurf minus fünf.
function scoreOf(s, id) {
  const sheet = s.sheets[id];
  const rows = sheet.marks.map((m, r) => {
    const n = m.length + (sheet.locks[r] ? 1 : 0);
    return (n * (n + 1)) / 2;
  });
  const fails = sheet.fails * 5;
  return { rows, fails, total: rows.reduce((a, b) => a + b, 0) - fails };
}

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// Zahlen im Text als Wort (die Textschrift hat eine durchgestrichene Null).
function word(n) {
  if (n < 0) return `minus ${word(-n)}`;
  if (n < 20) return ONES[n];
  const unit = (k) => (k === 1 ? 'ein' : ONES[k]);
  if (n < 100) return n % 10 ? `${unit(n % 10)}und${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  if (n < 1000) return `${unit(Math.floor(n / 100))}hundert${n % 100 ? word(n % 100) : ''}`;
  return String(n);
}

// ---------- Anzeige (nur im Browser) ----------

const DICE = ['w1', 'w2', 'r', 'y', 'g', 'b'];
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// Lage der Würfelseiten im Würfel, und wie der Würfel gedreht sein muss, damit eine Seite oben liegt
const FACE = { 1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const IDLE = [5, 2, 6, 3, 4, 1]; // Würfel vor dem ersten Wurf

const CROSS = (cls = '') =>
  `<svg class="qx-x ${cls}" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M10 10 L30 30"/><path pathLength="1" d="M30 10 L10 30"/></svg>`;
const PAD = `<svg class="qx-pad" viewBox="0 0 24 24" aria-hidden="true">
  <path class="qx-shackle" d="M8.2 11.5 V8.6 a3.8 3.8 0 0 1 7.6 0 V11.5"/>
  <rect class="qx-body" x="5.5" y="11" width="13" height="9.5" rx="1.2"/>
  <path class="qx-hole" d="M12 14.6 V17"/>
</svg>`;

// Fester Zufall für die Anzeige (render darf kein Math.random benutzen): gleicher Wurf, gleiche Lage.
function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

const minus = (n) => (n < 0 ? `−${-n}` : String(n));
const clock = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// Wer muss gerade was entscheiden? 'weiss' | 'farbe' | null
function decisionOf(s, id) {
  if (s.result) return null;
  if (s.phase === 'weiss' && s.round.white[id] === null) return 'weiss';
  if (s.phase === 'farbe' && s.active === id) return 'farbe';
  return null;
}

// Lokaler Zustand pro Spielfeld (überlebt neues Zeichnen, neu bei jeder Partie)
const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = {
      signal: game.signal,
      ctrl: null, // pro Zeichnen: Timer und Listener
      tab: 'me', // 'me' | 'them'
      pick: null, // vorläufiges Kreuz [reihe, feld]
      pickKey: '',
      optKey: '', // für welche Entscheidung die Felder schon aufgeleuchtet sind
      drawn: new Set(), // Kreuze, die schon zu sehen waren (Neue zeichnen sich ein)
      tray: '',
      lines: {},
      autoSent: false,
      refreshed: null,
    };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => u.ctrl?.abort());
  }
  return u;
}

const NONE = { prev: null, locks: new Set(), totals: null, rolled: false, ended: false };

export function render(el, s, game) {
  const u = local(el, game);
  u.ctrl?.abort();
  u.ctrl = new AbortController();
  const signal = u.ctrl.signal;

  let root = el.querySelector(':scope > .qx');
  if (!root) {
    el.innerHTML = `<div class="qx"><div class="qx-tray"></div><div class="qx-main"></div>${rulesHTML(s)}</div>`;
    root = el.firstElementChild;
  }
  const tray = root.querySelector('.qx-tray');
  const main = root.querySelector('.qx-main');

  if (game.first) for (const key of allKeys(s)) u.drawn.add(key); // Bestehendes nicht nochmal zeichnen
  const key = `${s.rolls}:${s.phase}`;
  if (u.pickKey !== key) {
    u.pickKey = key;
    u.pick = null;
    u.autoSent = false;
    if (decisionOf(s, game.me)) u.tab = 'me'; // neue Entscheidung: der eigene Zettel kommt nach vorn
  }

  const fx = changes(s, game);
  renderTray(tray, s, game, u, fx);
  const paint = (effects) => {
    paintMain(main, s, game, u, effects);
    markDice(tray, s, game, u);
  };
  paint(fx);

  root.addEventListener(
    'click',
    (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell && !cell.disabled) {
        const [r, i] = cell.dataset.cell.split(':').map(Number);
        const same = u.pick?.[0] === r && u.pick?.[1] === i;
        u.pick = same ? null : [r, i];
        paint({ ...NONE, pick: same ? null : `${r}:${i}` });
        return;
      }
      const tab = e.target.closest('[data-tab]');
      if (tab && tab.dataset.tab !== u.tab) {
        const from = u.tab;
        u.tab = tab.dataset.tab;
        paint({ ...NONE, tabFrom: from });
        return;
      }
      if (e.target.closest('.qx-roll') && !game.reducedMotion) {
        tray.classList.add('shaking'); // bis die Antwort mit dem Wurf da ist
        setTimeout(() => tray.classList.remove('shaking'), 2000);
      }
    },
    { signal },
  );

  startTimer(main, s, game, u, signal);
}

// Was hat sich seit dem letzten Stand geändert? (nur das wird animiert)
function changes(s, game) {
  const prev = game.prev;
  if (!prev) return { ...NONE, first: game.first };
  return {
    prev,
    first: false,
    locks: new Set(s.locked.flatMap((l, r) => (l && !prev.locked[r] ? [r] : []))),
    totals: Object.fromEntries(s.players.map((p) => [p.id, scoreOf(prev, p.id)])),
    rolled: s.rolls !== prev.rolls,
    ended: Boolean(s.result && !prev.result),
  };
}

// Alle Kreuze, Schlösser und Fehlwürfe als Schlüssel (für „schon gesehen“)
function allKeys(s) {
  return s.players.flatMap((p) => sheetKeys(s, p.id));
}
function sheetKeys(s, id) {
  const sheet = s.sheets[id];
  return [
    ...sheet.marks.flatMap((m, r) => m.map((i) => `${id}:${r}:${i}`)),
    ...sheet.locks.flatMap((l, r) => (l ? [`${id}:${r}:L`] : [])),
    ...Array.from({ length: sheet.fails }, (_, k) => `${id}:F${k}`),
  ];
}

// --- Würfeltisch ---

function renderTray(tray, s, game, u, fx) {
  const me = game.me;
  tray.classList.toggle('stale', s.phase === 'wuerfeln' || s.phase === 'ende');
  tray.classList.toggle('ended', s.phase === 'ende'); // darüber steht schon das Ergebnis mit seinen Linien
  tray.classList.toggle('white-only', s.phase === 'weiss' || (s.phase === 'farbe' && s.active !== me));

  const key = JSON.stringify([s.rolls, s.dice]);
  if (u.tray === key && !fx.first) return;
  u.tray = key;
  tray.classList.remove('shaking');

  const prevDice = fx.prev?.dice;
  const die = (d, k) => {
    const color = d[0] === 'w' ? 'w' : d;
    const v = s.dice ? s.dice[d] : IDLE[k];
    const leaving = s.dice && v == null && prevDice?.[d] != null && fx.prev?.rolls === s.rolls;
    if (v == null && !leaving) {
      return `<div class="qx-die qx-die--${color} gone" data-die="${d}" style="--k:${k}"><span class="qx-slot"></span></div>`;
    }
    const value = v ?? prevDice[d];
    const [fx0, fy0] = SHOW[value]; // liegend flach von oben, dreidimensional nur im Flug
    const rz = (hash(s.rolls, k, 'rz') - 0.5) * 18;
    const faces = Object.keys(PIPS)
      .map(
        (n) => `<span class="qx-face" style="transform:${FACE[n]} translateZ(var(--h))">
          <svg viewBox="0 0 30 30" aria-hidden="true">${PIPS[n]
            .map((p) => `<circle cx="${8 + (p % 3) * 7}" cy="${8 + Math.floor(p / 3) * 7}" r="2.75"/>`)
            .join('')}</svg></span>`,
      )
      .join('');
    return `<div class="qx-die qx-die--${color} ${fx.first ? 'intro' : ''} ${leaving ? 'leaving' : ''} ${s.dice ? '' : 'idle'}"
        data-die="${d}" data-face="${fx0},${fy0}" data-rz="${rz}"
        style="--k:${k};--rz:${rz}deg" role="img" aria-label="${s.dice ? `${d[0] === 'w' ? 'Weiß' : COLOR_NAME[d]} ${word(value)}` : 'Würfel'}">
        ${leaving ? '<span class="qx-slot"></span>' : ''}
        <div class="qx-lift"><div class="qx-cube" style="transform:rotateX(${fx0}deg) rotateY(${fy0}deg)">
          <i class="qx-core"></i><i class="qx-core qx-core-x"></i><i class="qx-core qx-core-y"></i>${faces}
        </div></div>
      </div>`;
  };

  const sum = s.dice ? s.dice.w1 + s.dice.w2 : null;
  tray.innerHTML = `
    <div class="qx-dice">
      <div class="qx-pair">
        ${die('w1', 0)}${die('w2', 1)}
        <span class="qx-brace ${sum === null ? 'off' : ''} ${fx.rolled ? 'rolled' : ''}" aria-hidden="true"></span>
        <span class="qx-sum ${sum === null ? 'off' : ''} ${fx.rolled ? 'rolled' : ''}">${sum === null ? '' : `<b class="num">${sum}</b>`}</span>
      </div>
      <div class="qx-colors">${DICE.slice(2).map((d, k) => die(d, k + 2)).join('')}</div>
    </div>`;

  if (fx.rolled && !game.reducedMotion) rollDice(tray, s);
}

// Die Würfel kommen von links über den Tisch, überschlagen sich und bleiben auf ihrer Zahl liegen.
function rollDice(tray, s) {
  tray.querySelectorAll('.qx-die:not(.gone)').forEach((n) => {
    const k = Number(n.style.getPropertyValue('--k'));
    const rz = Number(n.dataset.rz);
    const [fx0, fy0] = n.dataset.face.split(',').map(Number);
    const spinX = 540 + Math.floor(hash(s.rolls, k, 'sx') * 3) * 180;
    const spinY = 360 + Math.floor(hash(s.rolls, k, 'sy') * 3) * 90;
    const dir = hash(s.rolls, k, 'dir') < 0.5 ? -1 : 1;
    const timing = { duration: 860, delay: k * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
    // Im Flug deckend (durchsichtige 3D-Würfel wirken wie Glas), gedimmte Farbwürfel treten erst nach der Landung zurück
    const opacity = getComputedStyle(n).opacity;
    n.animate(
      [
        { transform: `translate(${-150 - k * 14}px, ${-26 + hash(s.rolls, k, 'y') * 40}px) rotate(${rz - 160}deg) scale(1.22)`, opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { opacity: 1, offset: 0.82 },
        { transform: `translate(0px, 0px) rotate(${rz}deg) scale(1)`, opacity },
      ],
      timing,
    );
    n.classList.add('rolling');
    n.querySelector('.qx-cube')
      .animate(
        [
          { transform: `rotateX(${fx0 + spinX * dir}deg) rotateY(${fy0 - spinY}deg)` },
          { transform: `rotateX(${fx0}deg) rotateY(${fy0}deg)` },
        ],
        timing,
      )
      .finished.then(() => n.classList.remove('rolling'), () => {});
  });
}

// Würfel, die zum vorläufigen Kreuz gehören, heben sich ab.
function markDice(tray, s, game, u) {
  const used = new Set();
  const d = decisionOf(s, game.me);
  if (d && u.pick) {
    if (d === 'weiss') ['w1', 'w2'].forEach((w) => used.add(w));
    else {
      const [r, i] = u.pick;
      used.add(colorPairs(s, r, i)[0]);
      used.add(layoutOf(s)[r].colors[i]);
    }
  }
  tray.querySelectorAll('.qx-die').forEach((n) => n.classList.toggle('used', used.has(n.dataset.die)));
}

// --- Alles unter dem Würfeltisch ---

function paintMain(main, s, game, u, fx) {
  const me = game.me;
  const them = otherOf(s, me);
  const decision = decisionOf(s, me);
  const shown = u.tab === 'me' ? me : them;
  const freshOpts = decision && u.optKey !== u.pickKey;
  if (decision) u.optKey = u.pickKey;

  main.innerHTML = `
    ${timerHTML(s, game)}
    ${statusHTML(s, game, decision)}
    ${s.round && !s.result ? roundHTML(s, game, u) : ''}
    ${s.result ? finalHTML(s, game, fx) : ''}
    ${tabsHTML(s, game, u, fx)}
    <div class="qx-sheet-wrap">${sheetHTML(s, game, u, shown, fx, freshOpts)}</div>
    ${barHTML(s, game, u, decision)}`;

  if (fx.tabFrom && !game.reducedMotion) {
    const dir = fx.tabFrom === 'me' ? 1 : -1;
    main.querySelector('.qx-sheet').animate(
      [{ transform: `translateX(${dir * 18}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    const ind = main.querySelector('.qx-ind');
    ind.animate([{ transform: `translateX(${fx.tabFrom === 'me' ? 0 : 100}%)` }, { transform: `translateX(${u.tab === 'me' ? 0 : 100}%)` }], {
      duration: 260,
      easing: 'cubic-bezier(.6,0,.2,1)',
    });
  }

  // Punkte zählen hoch
  if (fx.totals && !game.reducedMotion) {
    for (const p of s.players) {
      const node = main.querySelector(`.qx-tab[data-tab="${p.id === me ? 'me' : 'them'}"] .qx-tab-pts`);
      if (node) countUp(node, fx.totals[p.id].total, scoreOf(s, p.id).total, 250, u.ctrl.signal);
    }
    const before = fx.totals[shown];
    const now = scoreOf(s, shown);
    main.querySelectorAll('.qx-pt[data-row]').forEach((n) => {
      const r = Number(n.dataset.row);
      countUp(n, before.rows[r], now.rows[r], 250, u.ctrl.signal);
    });
  }
  if (fx.ended && !game.reducedMotion) {
    main.querySelectorAll('.qx-final td[data-to]').forEach((n) => {
      countUp(n, 0, Number(n.dataset.to), Number(n.dataset.delay), u.ctrl.signal);
    });
  }
}

function countUp(node, from, to, delay, signal) {
  if (from === to) return;
  node.textContent = minus(from);
  const start = performance.now() + delay;
  const step = (t) => {
    if (signal.aborted) return;
    const p = Math.min(1, Math.max(0, (t - start) / 480));
    node.textContent = minus(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;

function timerHTML(s, game) {
  if (!s.deadline || s.result) return '';
  const total = s.limit * 1000;
  const left = Math.max(0, s.deadline - game.now());
  return `<div class="qx-timer ${left < 10_000 ? 'late' : ''}" aria-hidden="true">
    <span class="qx-timer-num num">${clock(left)}</span>
    <span class="qx-timer-bar"><i style="transform:scaleX(${left / total})"></i></span>
  </div>`;
}

// Countdown nach Serverzeit. Bei null wird ein vorläufiges Kreuz noch abgeschickt, nach der
// Nachfrist fragt der Browser nach, damit tick() weiterschaltet.
function startTimer(main, s, game, u, signal) {
  if (!s.deadline || s.result) return;
  const total = s.limit * 1000;
  const update = () => {
    const now = game.now();
    const left = Math.max(0, s.deadline - now);
    const box = main.querySelector('.qx-timer');
    if (box) {
      box.querySelector('.qx-timer-num').textContent = clock(left);
      box.querySelector('i').style.transform = `scaleX(${left / total})`;
      box.classList.toggle('late', left < 10_000);
    }
    const d = decisionOf(s, game.me);
    if (left === 0 && d && u.pick && !u.autoSent) {
      u.autoSent = true;
      game.send(d, { roll: s.rolls, field: u.pick });
    }
    if (now >= s.deadline + GRACE + 300 && u.refreshed !== s.deadline) {
      u.refreshed = s.deadline;
      game.refresh();
    }
  };
  update();
  const timer = setInterval(update, 250);
  signal.addEventListener('abort', () => clearInterval(timer));
}

function statusHTML(s, game, decision) {
  const e = game.esc;
  const me = game.me;
  const them = otherOf(s, me);
  let who = s.active;
  let text;
  if (s.result) {
    const failed = s.players.find((p) => s.sheets[p.id].fails >= MAX_FAILS);
    text =
      s.end === 'reihen'
        ? 'Zwei Reihen sind geschlossen.'
        : failed.id === me
          ? 'Du hast den vierten Fehlwurf.'
          : `${e(failed.name)} hat den vierten Fehlwurf.`;
    return `<p class="status qx-status">${text}</p>`;
  }
  if (s.phase === 'wuerfeln') {
    text = s.active === me ? 'Du bist dran mit Würfeln.' : `${e(nameOf(s, s.active))} ist dran mit Würfeln.`;
  } else if (s.phase === 'weiss') {
    if (decision) {
      who = me;
      text = s.active === me
        ? 'Weiße Summe ankreuzen oder auslassen, danach Weiß plus Farbe.'
        : 'Weiße Summe ankreuzen oder auslassen.';
    } else {
      who = them;
      text = s.active === me ? `${e(game.name(them))} überlegt noch, danach kommt dein Weiß plus Farbe.` : `${e(game.name(them))} überlegt noch.`;
    }
  } else {
    text = decision
      ? 'Weiß plus Farbe ankreuzen oder auslassen.'
      : `${e(nameOf(s, s.active))} wählt Weiß plus Farbe.`;
  }
  return `<p class="status qx-status">${marker(game, who)} ${text}</p>`;
}

const fieldLabel = (s, [r, i]) => {
  const row = layoutOf(s)[r];
  return `${COLOR_NAME[row.colors[i]]} <span class="num">${row.nums[i]}</span>`;
};

// Was im aktuellen Wurf schon entschieden ist, pro Spieler ein Satz (offen für beide).
// Wer noch überlegt, steht im Status darüber.
function roundHTML(s, game, u) {
  const r = s.round;
  const line = (id) => {
    const w = r.white[id];
    if (w === null) return '';
    const you = id === game.me;
    const v = (du, er) => (you ? du : er);
    const crosses = [w, id === r.by ? r.color : null].filter(Array.isArray).map((f) => fieldLabel(s, f));
    let text;
    if (r.fail && id === r.by) text = `<span class="bad">${v('hast einen Fehlwurf', 'hat einen Fehlwurf')}</span>`;
    else if (crosses.length) text = `${v('hast', 'hat')} ${crosses.join(' und ')} angekreuzt`;
    else if (w === 'passt') text = v('konntest nichts ankreuzen', 'konnte nichts ankreuzen');
    else if (w === 'zeit') text = v('hast nicht rechtzeitig gewählt', 'hat nicht rechtzeitig gewählt');
    else text = v('hast nichts angekreuzt', 'hat nichts angekreuzt');
    const fresh = u.lines[id] !== undefined && u.lines[id] !== text;
    u.lines[id] = text;
    const name = you ? 'Du' : game.esc(game.name(id));
    return `<li class="${fresh ? 'enter' : ''}">${marker(game, id)}<span><b>${name}</b> ${text}.</span></li>`;
  };
  const lines = [game.me, otherOf(s, game.me)].map(line).join('');
  if (!lines) return '';
  const caption = s.phase === 'wuerfeln' ? '<li class="qx-round-cap">Letzter Wurf</li>' : '';
  return `<ul class="qx-round">${caption}${lines}</ul>`;
}

function tabsHTML(s, game, u, fx) {
  const e = game.esc;
  const tab = (key, id, label) => {
    const unseen = u.tab !== key && sheetKeys(s, id).some((k) => !u.drawn.has(k));
    const total = scoreOf(s, id).total;
    return `<button type="button" role="tab" class="qx-tab" data-tab="${key}" aria-selected="${u.tab === key}" style="--pc:${game.color(id)}">
      ${marker(game, id)}<span class="qx-tab-name">${label}</span>
      ${unseen ? '<span class="qx-news" aria-label="neu"></span>' : ''}
      ${s.result ? '' : `<span class="qx-tab-pts" aria-label="${word(total)} Punkte">${minus(total)}</span>`}
    </button>`;
  };
  const them = otherOf(s, game.me);
  return `<div class="qx-tabs ${fx.first ? 'intro' : ''}" role="tablist" aria-label="Zettel">
    ${tab('me', game.me, 'Du')}${tab('them', them, e(game.name(them)))}
    <span class="qx-ind" style="transform:translateX(${u.tab === 'me' ? 0 : 100}%)"></span>
  </div>`;
}

function sheetHTML(s, game, u, who, fx, freshOpts) {
  const sheet = s.sheets[who];
  const decision = who === game.me ? decisionOf(s, who) : null;
  const options = decision === 'weiss' ? whiteOptions(s, who) : decision === 'farbe' ? colorOptions(s, who) : [];
  const opts = new Set(options.map(([r, i]) => `${r}:${i}`));
  const pick = decision ? u.pick : null;
  const prevSheet = fx.prev?.sheets[who];
  const seen = (key) => {
    const fresh = !u.drawn.has(key);
    u.drawn.add(key);
    return fresh;
  };

  const rows = layoutOf(s)
    .map((row, r) => {
      const last = lastOf(sheet, r);
      const closed = s.locked[r];
      const closing = fx.locks.has(r);
      const wasLost = (i) => prevSheet && (i < lastOf(prevSheet, r) || fx.prev.locked[r]);
      const cells = row.nums
        .map((n, i) => {
          const c = row.colors[i];
          const x = sheet.marks[r].includes(i);
          const isPick = pick?.[0] === r && pick[1] === i;
          const lost = !x && (i < last || closed);
          const opt = opts.has(`${r}:${i}`);
          const cls = ['qx-cell'];
          let inner = '';
          if (x) {
            const fresh = seen(`${who}:${r}:${i}`);
            cls.push('is-x');
            if (fresh) cls.push('enter');
            inner = CROSS(fresh ? 'enter' : '');
          } else if (isPick) {
            cls.push('is-pick');
            inner = CROSS(fx.pick === `${r}:${i}` ? 'enter' : '');
          } else if (opt) {
            inner = `<span class="qx-ghost">${CROSS()}</span>`;
          }
          const wouldLose = !x && pick?.[0] === r && i > last && i < pick[1]; // würde übersprungen
          if (opt) cls.push('is-opt');
          if (opt && freshOpts) cls.push('pop');
          if (decision && !opt && !x && !isPick && !wouldLose) cls.push('dim');
          if (lost) cls.push('is-lost');
          if (lost && fx.prev && !wasLost(i)) cls.push(closing ? 'closing' : 'losing');
          if (wouldLose) cls.push('would-lose');
          if (wouldLose && fx.pick) cls.push('losing');
          const state = x ? ', angekreuzt' : lost ? ', nicht mehr möglich' : '';
          return `<button type="button" class="${cls.join(' ')}" data-cell="${r}:${i}" ${opt ? '' : 'disabled'}
            style="--c:var(--qx-${c});--ci:var(--qx-${c}-ink);--i:${i}" ${isPick ? 'aria-pressed="true"' : ''}
            aria-label="${COLOR_NAME[c]} ${n}${state}"><span class="qx-n">${n}</span>${inner}</button>`;
        })
        .join('');
      const owned = sheet.locks[r];
      const lockFresh = owned && seen(`${who}:${r}:L`);
      const lock = `<span class="qx-lock ${closed ? 'is-closed' : ''} ${closing ? 'closing' : ''} ${owned ? 'is-x' : ''}"
          style="--c:var(--qx-${row.lock});--ci:var(--qx-${row.lock}-ink);--i:11"
          role="img" aria-label="Schloss ${COLOR_NAME[row.lock]}${closed ? ', geschlossen' : ''}${owned ? ', zählt als Kreuz' : ''}">
          ${PAD}${owned ? CROSS(lockFresh ? 'enter' : '') : ''}</span>`;
      return `<div class="qx-row ${closed ? 'is-closed' : ''} ${closing ? 'closing' : ''} ${fx.first ? 'intro' : ''}" style="--r:${r}">${cells}${lock}</div>`;
    })
    .join('');

  const score = scoreOf(s, who);
  const fails = Array.from({ length: MAX_FAILS }, (_, k) => {
    const x = k < sheet.fails;
    const fresh = x && seen(`${who}:F${k}`);
    return `<span class="qx-fail ${x ? 'is-x' : ''} ${fresh ? 'enter' : ''}">${x ? CROSS(fresh ? 'enter' : '') : ''}${fresh ? '<b class="qx-minus num">−5</b>' : ''}</span>`;
  }).join('');
  const pts = COLORS.map(
    (c, r) => `<span class="qx-pt" data-row="${r}" style="--c:var(--qx-${c});--ci:var(--qx-${c}-ink)" aria-label="${COLOR_NAME[c]}: ${word(score.rows[r])} Punkte">${score.rows[r]}</span>`,
  ).join('');

  return `<div class="qx-sheet ${decision ? 'deciding' : ''} ${fx.rolled ? 'after-roll' : ''}" style="--pc:${game.color(who)}" role="tabpanel">
    ${rows}
    <div class="qx-foot ${fx.first ? 'intro' : ''}">
      <div class="qx-fails"><span class="qx-foot-label">Fehlwürfe</span>${fails}</div>
      <div class="qx-pts" aria-label="Punkte pro Reihe">${pts}${score.fails ? `<span class="qx-pt qx-pt-fail">${minus(-score.fails)}</span>` : ''}</div>
    </div>
  </div>`;
}

function barHTML(s, game, u, decision) {
  const value = (v) => game.esc(JSON.stringify(v));
  if (s.result) return '';
  if (s.phase === 'wuerfeln' && s.active === game.me) {
    return `<div class="qx-bar"><button class="btn primary qx-roll" data-action="wuerfeln" data-value="${value({ roll: s.rolls })}">Würfeln</button></div>`;
  }
  if (!decision) return '';
  const crossedWhite = Array.isArray(s.round.white[game.me]);
  let note = '';
  if (u.pick) note = 'Zum Wegnehmen das Kreuz nochmal antippen.';
  else if (decision === 'farbe' && !crossedWhite) note = 'Ohne Kreuz in diesem Wurf gibt es einen Fehlwurf.';
  return `<div class="qx-bar">
    <button class="btn primary" data-action="${decision}" data-value="${value({ roll: s.rolls, field: u.pick })}">${u.pick ? 'Fertig' : 'Nichts ankreuzen'}</button>
    ${note ? `<span class="qx-note">${note}</span>` : ''}
  </div>`;
}

// Wertung am Ende: Reihe für Reihe, die Zahlen zählen hoch, zuletzt wird der Sieger unterstrichen.
function finalHTML(s, game, fx) {
  const ids = [game.me, otherOf(s, game.me)];
  const scores = Object.fromEntries(ids.map((id) => [id, scoreOf(s, id)]));
  const winner = s.result.winners[0];
  const anim = fx.ended && !game.reducedMotion;
  const STEP = 110;
  const cell = (n, k, cls = '', style = '') =>
    `<td class="num ${cls}" style="${style}" ${anim ? `data-to="${n}" data-delay="${k * STEP}"` : ''}>${anim ? '0' : minus(n)}</td>`;
  const rows = COLORS.map(
    (c, r) => `<tr style="--k:${r}"><th><span class="qx-swatch" style="--c:var(--qx-${c})"></span>${COLOR_NAME[c]}</th>${ids
      .map((id) => cell(scores[id].rows[r], r))
      .join('')}</tr>`,
  ).join('');
  const fails = `<tr style="--k:4"><th>Fehlwürfe</th>${ids.map((id) => cell(-scores[id].fails, 4)).join('')}</tr>`;
  const total = `<tr class="qx-total" style="--k:5"><th>Summe</th>${ids
    .map((id) => cell(scores[id].total, 5, winner ? (id === winner ? 'win' : 'lose') : '', `--wc:${game.color(id)}`))
    .join('')}</tr>`;
  return `<section class="qx-final ${anim ? 'play' : ''}" aria-label="Wertung">
    <table>
      <thead><tr><th></th>${ids
        .map((id) => `<th>${marker(game, id)} ${id === game.me ? 'Du' : game.esc(game.name(id))}</th>`)
        .join('')}</tr></thead>
      <tbody>${rows}${fails}${total}</tbody>
    </table>
  </section>`;
}

function rulesHTML(s) {
  const mixed = s.variant === 'gemixxt';
  return `<details class="qx-rules">
    <summary>Regeln${mixed ? ' (gemixxt)' : ''}</summary>
    <ol>
      <li>Wer dran ist, würfelt mit allen Würfeln.</li>
      <li>Zuerst dürfen beide die Summe der weißen Würfel in einer Reihe ankreuzen.</li>
      <li>${mixed
        ? 'Danach darf, wer gewürfelt hat, einen weißen und einen farbigen Würfel zusammenzählen und die Zahl auf einem Feld in der Farbe dieses Würfels ankreuzen.'
        : 'Danach darf, wer gewürfelt hat, einen weißen und einen farbigen Würfel zusammenzählen und die Zahl in der Reihe dieser Farbe ankreuzen.'}</li>
      <li>Angekreuzt wird von links nach rechts. Übersprungene Felder sind verloren.</li>
      <li>Wer würfelt und nichts ankreuzt, bekommt einen Fehlwurf. Er kostet fünf Punkte.</li>
      <li>Das letzte Feld einer Reihe geht erst ab fünf Kreuzen. Dann ist die Reihe für alle geschlossen, ihr Würfel fällt weg, und das Schloss zählt als Kreuz.</li>
      <li>Schluss ist bei zwei geschlossenen Reihen oder vier Fehlwürfen.</li>
      <li>Punkte pro Reihe: ein Kreuz zählt eins, zwei Kreuze drei, drei Kreuze sechs, vier Kreuze zehn und so weiter.</li>
      ${s.limit ? `<li>Für jede Entscheidung gibt es ${s.limit === 60 ? 'eine Minute' : 'drei Minuten'}. Danach wird ausgelassen oder automatisch gewürfelt.</li>` : ''}
    </ol>
  </details>`;
}

export const style = `
  .qx {
    /* Gedämpfte Druckfarben der Reihen; -ink ist die dunklere Variante für Zahlen (lesbar auf Weiß) */
    --qx-r: #c4452f; --qx-r-ink: #a3341f;
    --qx-y: #e3b23c; --qx-y-ink: #765800;
    --qx-g: #4a8a56; --qx-g-ink: #2b6637;
    --qx-b: #3c6c9c; --qx-b-ink: #2a547f;
    display: grid;
    gap: 16px;
    width: 100%;
    max-width: 560px;
  }
  .qx-main { display: grid; gap: 14px; }

  /* ---------- Würfeltisch ---------- */
  .qx-tray { padding: 16px 0 6px; border-top: 2px solid var(--line); border-bottom: 1px solid var(--hairline); }
  .qx-tray.ended { border-top: 0; padding-top: 0; }
  .qx-dice { display: flex; justify-content: center; align-items: flex-start; gap: 18px; }
  .qx-pair { display: grid; grid-template-columns: auto auto; column-gap: 8px; justify-items: center; }
  .qx-colors { display: flex; gap: 8px; }
  .qx-brace {
    grid-column: 1 / -1; justify-self: stretch;
    height: 7px; margin: 9px 8px 0;
    border: 2px solid var(--ink); border-top: 0;
    transform-origin: center top;
  }
  .qx-sum { grid-column: 1 / -1; min-height: 1.1em; margin-top: 2px; font: 800 var(--t-lg) / 1 var(--font-display); }
  .qx-brace.off, .qx-sum.off { visibility: hidden; }
  .qx-brace.rolled { animation: qx-brace 300ms cubic-bezier(.2,.8,.2,1) 760ms both; }
  .qx-sum.rolled { animation: qx-rise 300ms cubic-bezier(.2,.8,.2,1) 860ms both; }
  @keyframes qx-brace { from { transform: scaleX(0); } }

  .qx-die {
    --s: 40px; --h: calc(var(--s) / 2);
    position: relative; width: var(--s); height: var(--s);
    perspective: 320px;
    transform: rotate(var(--rz));
    transition: opacity 220ms ease-out;
  }
  .qx-lift { width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 180ms cubic-bezier(.2,.8,.2,1); }
  .qx-die.used .qx-lift { transform: translateY(-7px); }
  .qx-cube { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
  .qx-face {
    position: absolute; inset: 0; display: block;
    border: 1.5px solid var(--de); border-radius: 22%;
    background: var(--df);
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .qx-face svg { display: block; width: 100%; height: 100%; fill: var(--dp); }
  /* Innere Flächen füllen die runden Ecken, solange der Würfel sich dreht (liegend stören sie nur) */
  .qx-core { position: absolute; inset: 2px; border-radius: 22%; background: var(--de); visibility: hidden; }
  .qx-die.rolling .qx-core { visibility: visible; }
  .qx-core-x { transform: rotateX(90deg); }
  .qx-core-y { transform: rotateY(90deg); }
  .qx-die--w { --df: var(--paper); --de: var(--ink); --dp: var(--ink); }
  .qx-die--r { --df: var(--qx-r); --de: var(--qx-r-ink); --dp: #fff; }
  .qx-die--y { --df: var(--qx-y); --de: var(--qx-y-ink); --dp: var(--ink); }
  .qx-die--g { --df: var(--qx-g); --de: var(--qx-g-ink); --dp: #fff; }
  .qx-die--b { --df: var(--qx-b); --de: var(--qx-b-ink); --dp: #fff; }

  /* Nicht gebrauchte Würfel treten zurück: alter Wurf, oder Farbwürfel, die man gerade nicht benutzen darf */
  .qx-tray.stale .qx-die { opacity: .55; }
  .qx-tray.white-only .qx-colors .qx-die { opacity: .38; }
  .qx-tray .qx-die.idle { opacity: .28; }
  .qx-die.gone { transform: none; }
  .qx-slot { position: absolute; inset: 0; border: 1.5px dashed var(--hairline); border-radius: 22%; }
  .qx-die.leaving .qx-lift { animation: qx-leave 460ms cubic-bezier(.6,0,.2,1) 380ms forwards; }
  @keyframes qx-leave { to { opacity: 0; transform: translateY(14px) rotate(40deg) scale(.55); } }

  .qx-die.intro { animation: qx-drop 520ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 70ms); }
  @keyframes qx-drop { from { opacity: 0; transform: translateY(-22px) rotate(calc(var(--rz) - 30deg)) scale(1.15); } }

  /* Nach dem Tippen auf „Würfeln“, bis der Wurf vom Server da ist */
  .qx-tray.shaking .qx-lift { animation: qx-shake 130ms ease-in-out infinite alternate; }
  .qx-tray.shaking .qx-colors .qx-die:nth-child(2n) .qx-lift,
  .qx-tray.shaking .qx-pair .qx-die:nth-child(2) .qx-lift { animation-delay: -65ms; }
  @keyframes qx-shake { from { transform: translateY(-2px) rotate(-7deg); } to { transform: translateY(1px) rotate(7deg); } }

  /* ---------- Zeit, Status, letzter Wurf ---------- */
  .qx-timer { display: flex; align-items: center; gap: 12px; }
  .qx-timer-num { min-width: 3ch; font-size: var(--t-md); line-height: 1; }
  .qx-timer-bar { flex: 1; height: 3px; overflow: hidden; background: var(--hairline); }
  .qx-timer-bar i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 250ms linear; }
  .qx-timer.late .qx-timer-num { color: var(--bad); }
  .qx-timer.late .qx-timer-bar i { background: var(--bad); }

  .qx-round { display: grid; gap: 2px; font-size: var(--t-sm); }
  .qx-round li { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .qx-round .num { font-size: 1.2em; line-height: 1; }
  .qx-round-cap { color: var(--muted); }
  .qx-round li.enter { animation: qx-rise 260ms cubic-bezier(.2,.8,.2,1); }
  @keyframes qx-rise { from { opacity: 0; transform: translateY(6px); } }

  /* ---------- Reiter: eigener Zettel und der des anderen, mit Punkten ---------- */
  .qx-tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--hairline); }
  .qx-tab {
    appearance: none; -webkit-appearance: none;
    display: flex; align-items: center; gap: 8px;
    min-width: 0; min-height: 48px; margin: 0; padding: 4px 12px 6px 0;
    border: 0; border-radius: 0; background: none;
    color: var(--muted); font: 700 var(--t-base) / 1.2 var(--font-body); text-align: left;
    cursor: pointer; transition: background-color 120ms ease-out;
  }
  .qx-tab + .qx-tab { padding-left: 12px; border-left: 1px solid var(--hairline); }
  .qx-tab:hover { background: var(--wash); }
  .qx-tab[aria-selected="true"] { color: var(--ink); }
  .qx-tab-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qx-tab-pts { margin-left: auto; color: var(--pc); font: 800 var(--t-xl) / 1 var(--font-display); font-variant-numeric: tabular-nums; }
  .qx-news { flex: none; width: 7px; height: 7px; background: var(--pc); animation: qx-news 900ms ease-in-out 3 alternate; }
  @keyframes qx-news { from { opacity: .25; transform: scale(.6); } }
  .qx-ind { position: absolute; left: 0; bottom: -1px; width: 50%; height: 3px; background: var(--ink); }

  /* ---------- Zettel ---------- */
  .qx-sheet { display: grid; gap: 4px; }
  .qx-row { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px; }
  .qx-cell {
    appearance: none; -webkit-appearance: none;
    position: relative; display: grid; place-items: center;
    min-width: 0; height: 44px; margin: 0; padding: 0;
    border: 0; border-radius: var(--radius);
    background: color-mix(in srgb, var(--c) 17%, white);
    color: var(--ci); -webkit-text-fill-color: currentColor; opacity: 1;
    font: 800 var(--t-md) / 1 var(--font-display); font-variant-numeric: tabular-nums;
    cursor: default;
    transition: opacity 160ms ease-out;
  }
  .qx-n { transition: opacity 160ms ease-out; }
  .qx-x { position: absolute; left: 3px; top: 3px; width: calc(100% - 6px); height: calc(100% - 6px); overflow: visible; }
  .qx-x path { fill: none; stroke: var(--pc); stroke-width: 6; stroke-linecap: square; }
  .qx-cell.is-x .qx-n, .qx-cell.is-pick .qx-n { opacity: .28; }
  .qx-cell.is-lost { background: color-mix(in srgb, var(--c) 7%, white); }
  .qx-cell.is-lost .qx-n { opacity: .3; }

  /* Entscheiden: mögliche Felder stehen, der Rest tritt zurück */
  .qx-cell.dim { opacity: .42; }
  .qx-cell.is-opt { cursor: pointer; outline: 2px solid var(--ink); outline-offset: -2px; }
  .qx-cell.is-opt:active { transform: scale(.96); }
  .qx-cell.is-pick { outline: 3px solid var(--pc); outline-offset: -3px; }
  .qx-cell.would-lose { outline: none; }
  .qx-cell.would-lose .qx-n { opacity: .22; }
  .qx-ghost { position: absolute; inset: 0; opacity: 0; transition: opacity 140ms ease-out; }
  @media (hover: hover) { .qx-cell.is-opt:hover .qx-ghost { opacity: .25; } }
  .qx-cell.pop { animation: qx-pop 280ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--r) * 40ms + var(--i) * 14ms); }
  .qx-sheet.after-roll .qx-cell.pop { animation-delay: calc(860ms + var(--r) * 40ms + var(--i) * 14ms); }
  @keyframes qx-pop { from { transform: scale(.8); opacity: .42; } }

  /* Kreuz einzeichnen, Feld gibt kurz nach */
  .qx-x.enter path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: qx-draw 190ms cubic-bezier(.3,.7,.2,1) forwards; }
  .qx-x.enter path:nth-child(2) { animation-delay: 140ms; }
  @keyframes qx-draw { to { stroke-dashoffset: 0; } }
  .qx-cell.enter { animation: qx-press 320ms cubic-bezier(.2,.8,.2,1); }
  @keyframes qx-press { from { transform: scale(.88); } }
  .qx-cell.enter .qx-n, .qx-cell.losing .qx-n { animation: qx-fade 340ms ease-out both; }
  .qx-cell.losing .qx-n { animation-delay: calc(var(--i) * 22ms); }
  .qx-cell.closing .qx-n { animation: qx-fade 380ms ease-out both; animation-delay: calc(260ms + (10 - var(--i)) * 30ms); }
  @keyframes qx-fade { from { opacity: 1; } }

  /* Schloss: offen, schnappt beim Schließen zu */
  .qx-lock { position: relative; display: grid; place-items: center; height: 44px; }
  .qx-pad { width: 100%; max-width: 30px; height: 30px; overflow: visible; }
  .qx-shackle { fill: none; stroke: var(--ci); stroke-width: 2.2; transform: translateY(-2.6px); }
  .qx-body { fill: var(--c); }
  .qx-hole { fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; }
  .qx-lock.is-closed .qx-shackle { transform: none; }
  .qx-lock.closing .qx-shackle { animation: qx-shackle 260ms cubic-bezier(.6,0,.2,1) 120ms both; }
  .qx-lock.closing .qx-pad { animation: qx-snap 280ms cubic-bezier(.2,.8,.2,1) 360ms both; }
  @keyframes qx-shackle { from { transform: translateY(-2.6px); } }
  @keyframes qx-snap { from { transform: scale(.8); } }
  .qx-lock .qx-x { left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; }
  .qx-lock .qx-x.enter path { animation-delay: 520ms; }
  .qx-lock .qx-x.enter path:nth-child(2) { animation-delay: 660ms; }

  /* Fehlwürfe und Punkte pro Reihe */
  .qx-foot {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px;
    margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--hairline);
  }
  .qx-fails { display: flex; align-items: center; gap: 6px; }
  .qx-foot-label { margin-right: 2px; color: var(--muted); font-size: var(--t-sm); }
  .qx-fail { position: relative; width: 26px; height: 26px; border: 1.5px solid var(--ink); border-radius: var(--radius); --pc: var(--bad); }
  .qx-fail .qx-x { left: 0; top: 0; width: 100%; height: 100%; }
  .qx-minus {
    position: absolute; left: 50%; top: 0;
    color: var(--bad); font-size: var(--t-sm);
    opacity: 0; pointer-events: none;
    animation: qx-minus 900ms cubic-bezier(.2,.8,.2,1) 200ms both;
  }
  @keyframes qx-minus {
    0% { opacity: 0; transform: translate(-50%, -40%); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, -150%); }
  }
  .qx-pts { display: flex; gap: 4px; }
  .qx-pt {
    min-width: 32px; padding: 3px 6px 2px; border-radius: var(--radius);
    background: color-mix(in srgb, var(--c) 17%, white); color: var(--ci);
    font: 800 var(--t-md) / 1 var(--font-display); font-variant-numeric: tabular-nums; text-align: center;
  }
  .qx-pt-fail { background: var(--wash); color: var(--bad); }

  /* Auftakt: Zettel baut sich Reihe für Reihe auf */
  .qx-row.intro { animation: qx-row-in 420ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(140ms + var(--r) * 90ms); }
  .qx-row.intro .qx-cell, .qx-row.intro .qx-lock {
    animation: qx-cell-in 320ms cubic-bezier(.2,.8,.2,1) both;
    animation-delay: calc(180ms + var(--r) * 90ms + var(--i) * 22ms);
  }
  .qx-foot.intro, .qx-tabs.intro { animation: qx-rise 360ms cubic-bezier(.2,.8,.2,1) 560ms both; }
  @keyframes qx-row-in { from { opacity: 0; transform: translateX(-14px); } }
  @keyframes qx-cell-in { from { opacity: 0; transform: scale(.8); } }

  /* ---------- Knopfleiste ---------- */
  .qx-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .qx-note { flex: 1 1 160px; color: var(--muted); font-size: var(--t-sm); }

  /* ---------- Wertung am Ende ---------- */
  .qx-final table { width: 100%; border-collapse: collapse; }
  .qx-final th, .qx-final td { padding: 6px 0 6px 12px; border-bottom: 1px solid var(--hairline); text-align: right; }
  .qx-final th:first-child { padding-left: 0; text-align: left; }
  .qx-final thead th { border-bottom: 2px solid var(--line); font-size: var(--t-sm); white-space: nowrap; }
  .qx-final td { font: 800 var(--t-lg) / 1 var(--font-display); font-variant-numeric: tabular-nums; }
  .qx-swatch { display: inline-block; width: .7em; height: .7em; margin-right: 8px; background: var(--c); }
  .qx-total th, .qx-total td { padding-top: 10px; border-bottom: 0; border-top: 2px solid var(--line); }
  .qx-total td { position: relative; font-size: var(--t-2xl); }
  .qx-total td.win { color: var(--wc); }
  .qx-total td.win::after { content: ''; position: absolute; left: 12px; right: 0; bottom: 0; height: 4px; background: var(--wc); transform-origin: right; }
  .qx-total td.lose { opacity: .45; }
  .qx-final.play tbody tr { animation: qx-rise 320ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 110ms); }
  .qx-final.play .win::after { animation: qx-under 420ms cubic-bezier(.6,0,.2,1) 1000ms both; }
  .qx-final.play .lose { animation: qx-recede 400ms ease-out 1000ms both; }
  @keyframes qx-under { from { transform: scaleX(0); } }
  @keyframes qx-recede { from { opacity: 1; } }

  /* ---------- Regeln zum Aufklappen ---------- */
  .qx-rules { padding-top: 10px; border-top: 1px solid var(--hairline); font-size: var(--t-sm); }
  .qx-rules summary {
    width: max-content; cursor: pointer; font-weight: 700;
    text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px;
  }
  .qx-rules ol { display: grid; gap: 4px; max-width: 60ch; margin-top: 8px; padding-left: 1.4em; list-style: decimal; }

  @media (min-width: 600px) {
    .qx-die { --s: 48px; }
    .qx-cell, .qx-lock { height: 50px; }
    .qx-cell { font-size: var(--t-lg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .qx *, .qx *::before, .qx *::after { animation: none !important; transition: none !important; }
    .qx .qx-x path { stroke-dashoffset: 0 !important; }
    .qx .qx-die.leaving .qx-lift { opacity: 0; }
  }
`;
