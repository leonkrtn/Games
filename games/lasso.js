// Lasso: Buchstaben einfangen und ein Wort daraus legen. Zwei bis sechs Spieler, fünf Runden.
//
// Ablauf einer Runde: Alle sehen dasselbe Feld mit verstreuten Buchstabensteinen und ziehen heimlich
// eine Schlinge (das Seil ist begrenzt: Was man auslegt, plus der Weg zurück zum Knoten) → aufdecken:
// Ein Stein in genau einer Schlinge gehört diesem Spieler, ein Stein in mehreren Schlingen verbrennt →
// jeder legt aus seinen Steinen und einem Joker ein Wort → Wertung: ein Punkt pro eigenem Stein im Wort,
// wer den Goldstein (unter einem zufälligen Stein) gefangen hat, verdoppelt seine Punkte. Die letzte
// Runde zählt doppelt, wer hinten liegt, bekommt mehr Seil. Wörter prüft kein Wörterbuch: Die anderen
// können in der Wertung Einspruch erheben, ab der Hälfte zählt das Wort nicht.
// Teams (zu viert oder zu sechst, Option): Schlingen eines Teams verbrennen sich nicht gegenseitig,
// die Punkte werden addiert.
//
// Zeit: Jede Phase hat eine Frist. tick() schaltet weiter, die Browser fragen bei null nach
// (game.refresh). Sind alle vorher fertig, geht es sofort weiter. Zieht in einer Runde niemand eine
// Schlinge (alle weg), wartet das Spiel wieder auf „Bereit“.
//
// Motion: Vor jeder Runde zählt das Feld herunter, dann fallen die Steine gestaffelt ein. Das eigene
// Seil folgt dem Finger und spannt sich, wenn es nicht weiter reicht. Beim Aufdecken ziehen sich alle
// Seile gleichzeitig ein, doppelt gefangene Steine verkohlen und zerfallen zu Asche, die eigenen
// Steine fliegen in die Ablage. Die Steine springen ins Wort und zurück. In der Wertung hebt sich der
// Stein über dem Goldstein, Zeilen und Punkte kommen nacheinander, ein Einspruch streicht das Wort durch.
// Am Ende legt sich ein Seil um den Sieger.

export const meta = {
  name: 'Lasso',
  description: 'Zieht heimlich eine Schlinge um Buchstaben. Was mehrere fangen, verbrennt. Aus dem Rest legt jeder ein Wort.',
  players: [2, 6],
  options: [
    {
      id: 'tempo',
      label: 'Tempo',
      choices: [
        { value: 'normal', label: 'Normal' },
        { value: 'ruhig', label: 'Gemütlich' },
      ],
    },
    {
      id: 'teams',
      label: 'Spielweise',
      choices: [
        { value: 0, label: 'Jeder für sich' },
        { value: 1, label: 'Teams zu zweit (zu viert oder zu sechst)' },
      ],
    },
  ],
};

// ---------- Regeln und Maße ----------

const ROUNDS = 5;
const TIMES = { normal: { draw: 15, word: 20, score: 10 }, ruhig: { draw: 25, word: 35, score: 16 } }; // Sekunden
const COUNTDOWN = 3000; // ms vor jeder Runde: drei, zwei, eins
const REVEAL = 5000; // ms Aufdecken, danach läuft die Zeit fürs Wort
const GRACE = 1200; // ms nach Ablauf: Schlingen und Wörter, die gerade unterwegs sind, zählen noch

const TILE = 38; // halbe Kantenlänge eines Steins in Feldeinheiten
const GAP = 118; // Mindestabstand der Steinmitten
const AREA = 50_000; // Feldfläche pro Stein: Das Feld wächst mit der Zahl der Steine
const RATIO = 1.2; // Höhe : Breite
const INK = 1350; // Seillänge in Feldeinheiten (mit dem Weg zurück zum Knoten)
const BONUS = 1.3; // wer hinten liegt, bekommt so viel mehr
const MAX_PTS = 500; // Punkte einer Schlinge
const MAX_WORD = 16;

const lettersFor = (n) => 12 + 3 * (n - 2); // zwölf zu zweit, vierundzwanzig zu sechst

// Buchstaben mit Gewicht. Selten Nützliches (Q, X, Y, Umlaute) fehlt, dafür gibt es den Joker.
const VOWELS = { E: 12, A: 6, I: 6, U: 4, O: 3 };
const CONSONANTS = { N: 9, R: 7, S: 7, T: 6, D: 4, H: 4, L: 4, G: 3, M: 3, C: 2, B: 2, K: 2, F: 2, W: 2, Z: 1, P: 1, V: 1 };
const GOOD = 'ENRSTAIDHULGMO'; // je weiter vorn, desto leichter einzubauen
const JOKER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ';

// ---------- Hilfen (Server und Browser) ----------

const ids = (s) => s.players.map((p) => p.id);
const nameOf = (s, id) => s.players.find((p) => p.id === id)?.name ?? '?';
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`);

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
function word(n) {
  if (n < 0) return `minus ${word(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) {
    const one = n % 10;
    const ten = TENS[Math.floor(n / 10)];
    return one ? `${one === 1 ? 'ein' : ONES[one]}und${ten}` : ten;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    return `${h === 1 ? 'ein' : ONES[h]}hundert${n % 100 ? word(n % 100) : ''}`;
  }
  return String(n);
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const points = (n) => (n === 1 ? 'einen Punkt' : `${word(n)} Punkte`); // „haben drei Punkte“
const withPoints = (n) => (n === 1 ? 'mit einem Punkt' : `mit ${word(n)} Punkten`); // „gewinnt mit drei Punkten“

// Teams: [[id, id], …] oder null; ohne Teams ist jeder sein eigenes Team.
const teamOf = (s, id) => (s.teams ? s.teams.findIndex((t) => t.includes(id)) : ids(s).indexOf(id));
const teamsOf = (s) => s.teams ?? ids(s).map((id) => [id]);

// Punkte einer Schlinge als kurzer Text: pro Achse ein Zeichen für den Abstand zum vorigen Punkt
// (−31 bis 31), sonst „_“ und zwei Zeichen für den Wert selbst (wie in montagsmaler.js).
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const IDX = new Map([...ABC].map((c, i) => [c, i]));

function encodePoints(pts) {
  let out = '';
  let px = null;
  let py = null;
  for (const [x, y] of pts) {
    for (const [v, prev] of [
      [x, px],
      [y, py],
    ]) {
      const d = prev === null ? 99 : v - prev;
      out += d >= -31 && d <= 31 ? ABC[d + 31] : '_' + ABC[v >> 6] + ABC[v & 63];
    }
    px = x;
    py = y;
  }
  return out;
}

// [[x, y], …] oder null, wenn der Text nicht stimmt
function decodePoints(p, w, h) {
  if (typeof p !== 'string' || !p.length || p.length > MAX_PTS * 6) return null;
  const vals = [];
  const prev = [null, null];
  for (let i = 0; i < p.length; ) {
    const axis = vals.length % 2;
    const c = IDX.get(p[i]);
    let v;
    if (c === undefined) return null;
    if (c === 63) {
      const a = IDX.get(p[i + 1]);
      const b = IDX.get(p[i + 2]);
      if (a === undefined || b === undefined) return null;
      v = a * 64 + b;
      i += 3;
    } else {
      if (prev[axis] === null) return null;
      v = prev[axis] + c - 31;
      i += 1;
    }
    if (v < 0 || v > (axis ? h : w)) return null;
    prev[axis] = v;
    vals.push(v);
  }
  if (vals.length % 2 || vals.length > MAX_PTS * 2) return null;
  const pts = [];
  for (let i = 0; i < vals.length; i += 2) pts.push([vals[i], vals[i + 1]]);
  return pts;
}

const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

// Seil, das eine Schlinge braucht: alle Stücke und das Schlussstück zurück zum Anfang (Knoten)
function ropeLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return pts.length > 1 ? len + dist(pts[pts.length - 1], pts[0]) : 0;
}

// Liegt (x, y) in der geschlossenen Schlinge? Umlaufzahl ungleich null (wie fill-rule nonzero), nur mit
// ganzen Zahlen gerechnet: Server und Browser kommen sicher zum selben Ergebnis.
function inside(pts, x, y) {
  let wn = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (ay <= y) {
      if (by > y && cross > 0) wn++;
    } else if (by <= y && cross < 0) wn--;
  }
  return wn !== 0;
}

// Fläche (für „zu klein“), positiv oder negativ je nach Richtung
function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    a += ax * by - bx * ay;
  }
  return a / 2;
}

// Wort aus Großbuchstaben: ß wird SS, Leerzeichen fallen weg.
const cleanWord = (text) =>
  String(text ?? '')
    .normalize('NFC')
    .replace(/ß/g, 'SS')
    .replace(/\s+/g, '')
    .toUpperCase();

/**
 * Lässt sich `w` aus den Buchstaben `rack` und einem Joker legen?
 * Rückgabe: { pts, joker } (joker = Stelle, die der Joker übernimmt, oder -1) oder null.
 */
function matchWord(w, rack) {
  const pool = {};
  for (const ch of rack) pool[ch] = (pool[ch] ?? 0) + 1;
  let joker = -1;
  let pts = 0;
  const chars = [...w];
  for (let i = 0; i < chars.length; i++) {
    if (pool[chars[i]] > 0) {
      pool[chars[i]]--;
      pts++;
    } else if (joker < 0) joker = i;
    else return null;
  }
  return { pts, joker };
}

const rackOf = (s, id) => (s.caught?.[id] ?? []).map((i) => s.board.tiles[i].ch);

// ---------- Spielfeld ----------

function drawLetters(count) {
  const bag = (weights, n) => {
    const pool = Object.entries(weights).flatMap(([ch, w]) => Array(w).fill(ch));
    const out = [];
    while (out.length < n) {
      const ch = pool[Math.floor(Math.random() * pool.length)];
      if (out.filter((c) => c === ch).length < (ch === 'E' ? 4 : 2)) out.push(ch); // nicht zu viele gleiche
    }
    return out;
  };
  const vowels = Math.round(count * 0.4);
  return shuffle([...bag(VOWELS, vowels), ...bag(CONSONANTS, count - vowels)]);
}

/**
 * Steine in Gruppen verteilt: eine „heiße“ Gruppe mit den besten Buchstaben, die alle anzieht, weitere
 * gemischte Gruppen und einige einzelne Steine in ruhigen Ecken.
 */
function makeBoard(n) {
  const count = lettersFor(n);
  const w = Math.round(Math.sqrt((count * AREA) / RATIO));
  const h = Math.round(w * RATIO);
  const pad = TILE + 14;
  const k = Math.max(2, Math.round(count / 6));
  const centers = [];
  for (let t = 0; centers.length < k && t < 2000; t++) {
    const c = [170 + Math.random() * (w - 340), 170 + Math.random() * (h - 340)];
    const far = t < 1500 ? 380 : 260;
    if (centers.every((d) => dist(c, d) > far)) centers.push(c);
  }
  while (centers.length < k) centers.push([w / 2, h / 2]);

  const letters = drawLetters(count);
  const best = [...letters.keys()].sort((a, b) => rank(letters[a]) - rank(letters[b])).slice(0, 5);
  const groupOf = letters.map((_, i) => {
    if (best.includes(i)) return 0;
    const r = Math.random();
    return r < 0.28 ? -1 : 1 + Math.floor(Math.random() * (k - 1));
  });

  const tiles = [];
  const free = (p, gap) => p[0] >= pad && p[0] <= w - pad && p[1] >= pad && p[1] <= h - pad && tiles.every((t) => dist(p, [t.x, t.y]) >= gap);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
  // Gruppensteine zuerst, damit die Gruppen dicht werden; einzelne Steine füllen die Lücken.
  const order = [...letters.keys()].sort((a, b) => (groupOf[a] < 0) - (groupOf[b] < 0));
  for (const i of order) {
    let p = null;
    for (let t = 0; t < 400 && !p; t++) {
      const g = groupOf[i];
      const spread = t < 60 ? 105 : t < 150 ? 160 : null;
      const q =
        g >= 0 && spread
          ? [Math.round(centers[g][0] + gauss() * spread), Math.round(centers[g][1] + gauss() * spread)]
          : [Math.round(pad + Math.random() * (w - 2 * pad)), Math.round(pad + Math.random() * (h - 2 * pad))];
      if (free(q, t < 300 ? GAP : GAP - 20)) p = q;
    }
    if (!p) p = [Math.round(pad + Math.random() * (w - 2 * pad)), Math.round(pad + Math.random() * (h - 2 * pad))];
    tiles.push({ x: p[0], y: p[1], ch: letters[i], r: Math.round(Math.random() * 14 - 7) });
  }
  return { w, h, tiles: shuffle(tiles) };
}

function rank(ch) {
  const i = GOOD.indexOf(ch);
  return i < 0 ? 99 : i;
}

// ---------- Spielablauf (Server) ----------

export function setup(players, options = {}) {
  const n = players.length;
  let teams = null;
  if (options.teams === 1 && (n === 4 || n === 6)) {
    const order = shuffle(players.map((p) => p.id));
    teams = [];
    for (let i = 0; i < n; i += 2) teams.push([order[i], order[i + 1]]);
  }
  return {
    players: players.map(({ id, name }) => ({ id, name })),
    teams,
    tempo: options.tempo === 'ruhig' ? 'ruhig' : 'normal',
    rounds: ROUNDS,
    round: 0,
    phase: 'bereit', // bereit → zeichnen → wort → wertung → zeichnen … → Ende
    paused: false, // true: niemand hat eine Schlinge gezogen, die Runde fängt neu an
    ready: [], // bereit: wer bereit ist; wertung: wer weiter will
    startAt: null, // zeichnen: ab hier darf gezogen werden (vorher zählt das Feld herunter)
    revealAt: null, // wort: Aufdecken, die Zeit fürs Wort läuft ab revealAt + REVEAL
    deadline: null, // Ende der Phase, wie es die Uhr zeigt
    end: null, // ab hier schaltet tick() weiter (deadline plus Nachfrist, oder früher, wenn alle fertig sind)
    board: null, // { w, h, tiles: [{ x, y, ch, r }] }
    gold: null, // Index des Steins über dem Goldstein (geheim bis zur Wertung)
    ink: {}, // Seillänge pro Spieler in dieser Runde
    loops: {}, // Schlingen als Text (geheim, bis aufgedeckt wird)
    done: [], // zeichnen und wort: wer abgegeben hat
    caught: null, // nach dem Aufdecken: { id: [Steinindex, …] }
    burned: null, // [Steinindex, …]
    words: {}, // { id: { w, joker, pts } oder null (kein Wort) }, geheim bis zur Wertung
    vetoes: {}, // { Wortleger: [wer Einspruch erhebt] }
    totals: Object.fromEntries(players.map((p) => [p.id, 0])),
    history: [], // pro Runde { pts: { id: Punkte } }
  };
}

const times = (s) => TIMES[s.tempo] ?? TIMES.normal;
const allIn = (s, list) => ids(s).every((id) => list.includes(id));

function startRound(s, now) {
  // Wer hinten liegt (ab der zweiten Runde, nicht bei Gleichstand aller), bekommt mehr Seil.
  const teamTotals = teamsOf(s).map((t) => t.reduce((sum, id) => sum + s.totals[id], 0));
  const low = Math.min(...teamTotals);
  const behind = teamTotals.some((v) => v > low) ? teamsOf(s).filter((_, i) => teamTotals[i] === low).flat() : [];
  s.board = makeBoard(s.players.length);
  Object.assign(s, {
    phase: 'zeichnen',
    paused: false,
    ready: [],
    startAt: now + COUNTDOWN,
    revealAt: null,
    deadline: now + COUNTDOWN + times(s).draw * 1000,
    gold: Math.floor(Math.random() * s.board.tiles.length),
    ink: Object.fromEntries(ids(s).map((id) => [id, Math.round(INK * (behind.includes(id) ? BONUS : 1))])),
    loops: {},
    done: [],
    caught: null,
    burned: null,
    words: {},
    vetoes: {},
  });
  s.end = s.deadline + GRACE;
}

// Aufdecken: Wem gehört welcher Stein?
function reveal(s, now) {
  const shapes = Object.fromEntries(
    Object.entries(s.loops).map(([id, p]) => [id, decodePoints(p, s.board.w, s.board.h)]),
  );
  s.caught = Object.fromEntries(ids(s).map((id) => [id, []]));
  s.burned = [];
  s.board.tiles.forEach((t, i) => {
    const owners = ids(s).filter((id) => shapes[id] && inside(shapes[id], t.x, t.y));
    if (!owners.length) return;
    if (new Set(owners.map((id) => teamOf(s, id))).size > 1) s.burned.push(i);
    else for (const id of owners) s.caught[id].push(i);
  });
  s.phase = 'wort';
  s.revealAt = now;
  s.deadline = now + REVEAL + times(s).word * 1000;
  s.end = s.deadline + GRACE;
  // Ohne Steine gibt es kein Wort: diese Spieler sind gleich fertig.
  s.done = ids(s).filter((id) => !s.caught[id].length);
  s.words = Object.fromEntries(s.done.map((id) => [id, null]));
  if (allIn(s, s.done)) s.end = s.deadline = now + REVEAL; // nur noch zusehen, wie alles verbrennt
}

function startScoring(s, now) {
  s.phase = 'wertung';
  s.ready = [];
  s.deadline = now + times(s).score * 1000;
  s.end = s.deadline + 400;
}

/** Punkte dieser Runde für `id`: { base, gold, double, struck, total } */
function roundScore(s, id) {
  const w = s.words[id];
  const struck = Boolean(w) && isStruck(s, id);
  const gold = s.gold !== null && (s.caught?.[id] ?? []).includes(s.gold);
  const double = s.round === s.rounds - 1;
  const base = w && !struck ? w.pts : 0;
  return { base, gold, double, struck, total: base * (gold ? 2 : 1) * (double ? 2 : 1) };
}

// Wer darf Einspruch erheben? Alle, die nicht im selben Team sind.
const votersOf = (s, id) => ids(s).filter((v) => teamOf(s, v) !== teamOf(s, id));
const isStruck = (s, id) => {
  const voters = votersOf(s, id);
  const n = (s.vetoes[id] ?? []).filter((v) => voters.includes(v)).length;
  return voters.length > 0 && n >= Math.ceil(voters.length / 2);
};

function finishRound(s, now) {
  const pts = Object.fromEntries(ids(s).map((id) => [id, roundScore(s, id).total]));
  for (const id of ids(s)) s.totals[id] += pts[id];
  s.history.push({ pts });
  s.round++;
  if (s.round < s.rounds) return startRound(s, now);
  Object.assign(s, { phase: 'ende', deadline: null, end: null, startAt: null, ready: [] });
  s.result = resultOf(s);
}

function resultOf(s) {
  const teams = teamsOf(s);
  const sums = teams.map((t) => t.reduce((sum, id) => sum + s.totals[id], 0));
  const top = Math.max(...sums);
  if (top === 0) return { winners: [], text: 'Niemand hat gepunktet.' };
  const best = teams.filter((_, i) => sums[i] === top);
  const winners = best.flat();
  const names = (t) => list(t.map((id) => nameOf(s, id)));
  if (s.teams) {
    if (best.length === 1) return { winners, text: `${names(best[0])} gewinnen zusammen ${withPoints(top)}.` };
    if (best.length === teams.length && teams.length === 2) {
      return { winners, text: `Gleichstand: Beide Teams haben ${points(top)}.` };
    }
    return { winners, text: `Gleichstand: ${best.map(names).join(' sowie ')} haben je ${points(top)}.` };
  }
  if (s.players.length === 2) {
    const [a, b] = ids(s);
    if (best.length === 2) return { winners, text: `Gleichstand: Beide haben ${points(top)}.` };
    const win = winners[0];
    const lose = win === a ? b : a;
    return { winners, text: `${nameOf(s, win)} gewinnt ${word(s.totals[win])} zu ${word(s.totals[lose])}.` };
  }
  if (best.length === 1) return { winners, text: `${nameOf(s, winners[0])} gewinnt ${withPoints(top)}.` };
  return { winners, text: `${names(winners)} gewinnen ${withPoints(top).replace('mit ', 'mit je ')}.` };
}

export function action(s, { player, type, data }) {
  if (s.result || !ids(s).includes(player)) return;
  const now = Date.now();
  switch (type) {
    case 'bereit': {
      if (s.phase !== 'bereit' || s.ready.includes(player)) return;
      s.ready.push(player);
      if (allIn(s, s.ready)) startRound(s, now);
      return;
    }
    case 'los': {
      // Nicht auf alle warten (jemand ist nicht da)
      if (s.phase !== 'bereit') return;
      if (!s.ready.includes(player)) throw new Error('Tipp zuerst auf Bereit.');
      startRound(s, now);
      return;
    }
    case 'schlinge': {
      if (s.phase !== 'zeichnen') throw new Error('Gerade wird keine Schlinge gezogen.');
      if (now < s.startAt - 500) throw new Error('Noch einen Moment, gleich geht es los.');
      if (now > s.end) throw new Error('Die Zeit ist um.');
      const pts = decodePoints(data?.p, s.board.w, s.board.h);
      if (!pts || pts.length < 3) throw new Error('Das ist keine Schlinge.');
      if (ropeLength(pts) > s.ink[player] + 1) throw new Error('So weit reicht dein Seil nicht.');
      s.loops[player] = data.p;
      if (!s.done.includes(player)) s.done.push(player);
      if (allIn(s, s.done)) reveal(s, now);
      return;
    }
    case 'neu': {
      // Abgegebene Schlinge zurücknehmen, solange noch nicht aufgedeckt ist
      if (s.phase !== 'zeichnen') return;
      delete s.loops[player];
      s.done = s.done.filter((id) => id !== player);
      return;
    }
    case 'wort': {
      if (s.phase !== 'wort') throw new Error('Gerade wird kein Wort gelegt.');
      if (now > s.end) throw new Error('Die Zeit ist um.');
      const w = cleanWord(data?.w);
      if (!w) s.words[player] = null;
      else {
        if (!/^[A-ZÄÖÜ]+$/.test(w)) throw new Error('Nur Buchstaben, bitte.');
        if ([...w].length < 2) throw new Error('Ein Wort hat mindestens zwei Buchstaben.');
        if ([...w].length > MAX_WORD) throw new Error('Das Wort ist zu lang.');
        const m = matchWord(w, rackOf(s, player));
        if (!m) throw new Error('Dafür fehlen dir Buchstaben. Nur einer darf der Joker sein.');
        s.words[player] = { w, joker: m.joker, pts: m.pts };
      }
      if (!s.done.includes(player)) s.done.push(player);
      if (allIn(s, s.done)) {
        // Alle fertig: weiter, aber erst nach dem Aufdecken
        if (now >= s.revealAt + REVEAL) startScoring(s, now);
        else s.end = s.deadline = s.revealAt + REVEAL;
      }
      return;
    }
    case 'aendern': {
      if (s.phase !== 'wort' || !s.done.includes(player) || !rackOf(s, player).length) return;
      s.done = s.done.filter((id) => id !== player);
      delete s.words[player];
      s.deadline = s.revealAt + REVEAL + times(s).word * 1000;
      s.end = s.deadline + GRACE;
      return;
    }
    case 'einspruch': {
      if (s.phase !== 'wertung') return;
      const author = String(data ?? '');
      if (!s.words[author]) return;
      if (!votersOf(s, author).includes(player)) {
        throw new Error(author === player ? 'Gegen dein eigenes Wort kannst du keinen Einspruch erheben.' : 'Gegen dein Team kannst du keinen Einspruch erheben.');
      }
      const v = s.vetoes[author] ?? [];
      s.vetoes[author] = v.includes(player) ? v.filter((id) => id !== player) : [...v, player];
      return;
    }
    case 'weiter': {
      if (s.phase !== 'wertung' || s.ready.includes(player)) return;
      s.ready.push(player);
      if (allIn(s, s.ready)) finishRound(s, now);
      return;
    }
  }
}

// Fristen: höchstens ein Schritt pro Aufruf (der nächste bekommt eine frische Frist).
export function tick(s, now) {
  if (s.result || s.end === null || now < s.end) return;
  if (s.phase === 'zeichnen') {
    if (Object.keys(s.loops).length) reveal(s, now);
    else Object.assign(s, { phase: 'bereit', paused: true, ready: [], startAt: null, deadline: null, end: null });
  } else if (s.phase === 'wort') startScoring(s, now);
  else if (s.phase === 'wertung') finishRound(s, now);
}

export function waitingFor(s) {
  if (s.result) return [];
  if (s.phase === 'bereit' || s.phase === 'wertung') return ids(s).filter((id) => !s.ready.includes(id));
  return ids(s).filter((id) => !s.done.includes(id));
}

// Die Runden sind kurz und laufen gleichzeitig: Nachrichten gibt es nur, wenn jemand auf die anderen wartet.
export function notices(s, before, player) {
  if (s.phase === 'bereit' && !before.ready.length && s.ready.length && !allIn(s, s.ready)) {
    return ids(s)
      .filter((id) => !s.ready.includes(id))
      .map((id) => ({ to: id, text: `${nameOf(s, player)} ist bereit. Lasso geht los, sobald alle da sind.` }));
  }
  return [];
}

// Geheim: fremde Schlingen beim Zeichnen, fremde Wörter beim Legen, der Goldstein bis zur Wertung.
export function view(s, me) {
  const v = { ...s };
  if (s.phase === 'zeichnen') v.loops = s.loops[me] ? { [me]: s.loops[me] } : {};
  if (s.phase === 'wort') v.words = Object.fromEntries(Object.entries(s.words).filter(([id]) => id === me));
  if (s.phase !== 'wertung' && s.phase !== 'ende') v.gold = null;
  return v;
}

// ---------- Anzeige (nur im Browser) ----------

// Palette (Skill „zeichnen“): Holzsteine, Kohle, Asche, Feuer, Gold
const INKC = '#141414';
const WOOD = '#ecd2a2';
const WOOD_EDGE = '#b98a4e';
const GRAIN = '#dcbb88';
const JOKER_FACE = '#f6ead2';
const CHAR = '#4a3b30';
const CHAR_EDGE = '#2a211b';
const CRACK = '#1d1611';
const EMBER = '#e0612a';
const FLAME_IN = '#f2c230';
const ASH_OUT = '#5d544c';
const ASH_IN = '#b8b0a6';
const GOLD = ['#d9a628', '#f4d872', '#e3b23a', '#c8961f', '#a8781a', '#b5831b'];

const PAD = 8; // Rand der Zeichnung ums Feld (Seil am Rand)
const STEP = 7; // neue Seilpunkte erst ab so viel Abstand

// Fester Zufall für Effekte (render darf kein Math.random benutzen)
const hash = (i, k) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const r1 = (v) => Math.round(v * 10) / 10;

// --- Zeichnungen ---

// Stein in Feldeinheiten, Mitte bei 0,0 (Kante unten)
const tileSvg = (ch) => `
  <rect class="ls-ring" x="-47" y="-47" width="94" height="94" rx="13"/>
  <rect class="ls-edge" x="-38" y="-34" width="76" height="76" rx="8"/>
  <rect class="ls-top" x="-38" y="-38" width="76" height="72" rx="8"/>
  <rect class="ls-tint" x="-38" y="-38" width="76" height="72" rx="8"/>
  <path class="ls-grain" d="M-30 -21 C -14 -24, 6 -17, 30 -23 M-31 19 C -12 15, 10 22, 30 17"/>
  <path class="ls-shine" d="M-31 -27 C -31 -31, -29 -32, -24 -32 H 8"/>
  <text class="ls-ch" y="15">${ch}</text>`;

// Verkohlter Stein (liegt über dem Holz und wird beim Verbrennen eingeblendet)
const burntSvg = (ch) => `<g class="ls-burnt">
  <rect x="-38" y="-34" width="76" height="76" rx="8" fill="${CHAR_EDGE}" stroke="${INKC}" stroke-width="2.6"/>
  <rect x="-38" y="-38" width="76" height="72" rx="8" fill="${CHAR}" stroke="${INKC}" stroke-width="2.6"/>
  <path d="M-38 -8 L-22 -4 L-14 -14 L2 -8 M10 34 L6 18 L18 8 L14 -6 M38 -20 L24 -18" fill="none" stroke="${CRACK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M-22 -4 L-14 -14 M18 8 L14 -6" fill="none" stroke="${EMBER}" stroke-width="1.6" stroke-linecap="round"/>
  <text class="ls-ch" y="15" style="fill:#7d6b5c">${ch}</text>
</g>`;

const ASH = `<g class="ls-ash">
  <path d="M-34 4 C -38 -12, -24 -26, -8 -22 C 2 -32, 24 -28, 28 -14 C 40 -10, 40 10, 30 18 C 28 32, 6 34, -4 28 C -18 36, -34 24, -34 4 Z" fill="${ASH_OUT}"/>
  <path d="M-22 4 C -24 -6, -14 -14, -4 -12 C 4 -18, 16 -14, 18 -6 C 26 -2, 26 8, 18 12 C 16 20, 4 22, -2 18 C -12 22, -22 14, -22 4 Z" fill="${ASH_IN}"/>
  <path d="M-12 2 C -6 -4, 4 -4, 10 0" fill="none" stroke="#857c72" stroke-width="1.4" stroke-linecap="round"/>
  <g fill="#2b241f"><circle cx="-14" cy="10" r="2"/><circle cx="12" cy="-8" r="1.7"/><circle cx="8" cy="12" r="1.4"/><circle cx="-26" cy="-8" r="1.6"/><circle cx="30" cy="2" r="1.4"/></g>
  <g fill="${EMBER}"><circle cx="2" cy="6" r="1.6"/><circle cx="-8" cy="-4" r="1.2"/></g>
</g>`;

const FLAME = `<path d="M0 -40 C 6 -26, 22 -14, 20 6 C 19 22, 8 30, 0 30 C -10 30, -20 22, -20 8 C -20 -4, -12 -10, -10 -20 C -4 -14, -2 -10, -2 -8 C 2 -18, 2 -30, 0 -40 Z" fill="${EMBER}" stroke="${INKC}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M1 -10 C 5 -2, 12 6, 10 16 C 9 23, 4 26, 0 26 C -6 26, -10 21, -10 14 C -10 7, -5 2, -3 -4 C -1 0, 0 2, 0 4 C 2 -1, 2 -5, 1 -10 Z" fill="${FLAME_IN}" stroke="${INKC}" stroke-width="1.6" stroke-linejoin="round"/>`;

const NUGGET = `<path d="M-30 4 L-22 -16 L-4 -26 L18 -22 L32 -6 L28 16 L10 28 L-14 26 L-30 4 Z" fill="${GOLD[0]}"/>
  <path d="M-22 -16 L-4 -26 L18 -22 L6 -8 L-12 -4 Z" fill="${GOLD[1]}"/>
  <path d="M6 -8 L18 -22 L32 -6 L28 16 L14 6 Z" fill="${GOLD[2]}"/>
  <path d="M-12 -4 L6 -8 L14 6 L10 28 L-14 26 L-30 4 Z" fill="${GOLD[3]}"/>
  <path d="M-14 26 L-30 4 L-12 -4 L-6 14 Z" fill="${GOLD[4]}"/>
  <path d="M14 6 L28 16 L10 28 Z" fill="${GOLD[5]}"/>
  <path d="M-22 -16 L-12 -4 L6 -8 L18 -22 M6 -8 L14 6 L28 16 M14 6 L-6 14 L-12 -4 M-6 14 L-14 26 M14 6 L10 28" fill="none" stroke="${INKC}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M-30 4 L-22 -16 L-4 -26 L18 -22 L32 -6 L28 16 L10 28 L-14 26 Z" fill="none" stroke="${INKC}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M-17 -14 L-7 -19.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`;
const SPARK = `<path class="ls-spark" d="M31 -40 C 32 -33, 34 -31, 41 -30 C 34 -29, 32 -27, 31 -20 C 30 -27, 28 -29, 21 -30 C 28 -31, 30 -33, 31 -40 Z" fill="#fff" stroke="${INKC}" stroke-width="1.8" stroke-linejoin="round"/>`;
const nuggetIcon = `<svg class="ls-nug" viewBox="-36 -42 80 74" aria-hidden="true">${NUGGET}${SPARK}</svg>`;

// Seilrolle für die Seilanzeige
const coilSvg = `<svg class="ls-coil" viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke-linecap="round">
  ${[[22, 15, 11], [19, 13, 9], [16, 11, 7]].map(([cy, rx, ry]) => `<ellipse cx="20" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${INKC}" stroke-width="6"/><ellipse cx="20" cy="${cy}" rx="${rx}" ry="${ry}" class="ls-coil-c" stroke-width="3"/>`).join('')}
  <path d="M31 16 C 34 22, 36 28, 38 34" stroke="${INKC}" stroke-width="6"/><path d="M31 16 C 34 22, 36 28, 38 34" class="ls-coil-c" stroke-width="3"/>
</g></svg>`;

// Haken, wenn jemand fertig ist
const CHECK = '<svg class="ls-check" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M4 10.5 L8.5 15 L16 5.5"/></svg>';

// Pfad durch die Punkte: Kurven durch die Mitten, geschlossen durch den Knoten (erster Punkt)
function ropeD(pts, closed) {
  const n = pts.length;
  if (!n) return '';
  const P = (p) => `${r1(p[0])} ${r1(p[1])}`;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (n === 1) return `M${P(pts[0])}l.1 0`;
  let d = `M${P(pts[0])}L${P(mid(pts[0], pts[1]))}`;
  const last = closed ? n : n - 1;
  for (let i = 1; i < last; i++) d += `Q${P(pts[i])} ${P(mid(pts[i], pts[(i + 1) % n]))}`;
  return closed ? `${d}L${P(pts[0])}Z` : `${d}L${P(pts[n - 1])}`;
}

// Knoten am Anfang der Schlinge mit einem kurzen Seilende nach außen
function knotSvg(pts, k = 1) {
  const n = pts.length;
  const [x, y] = pts[0];
  const a = pts[n - 1];
  const b = pts[1];
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0] / n;
    cy += p[1] / n;
  }
  let ox = x - cx;
  let oy = y - cy;
  const len = Math.sqrt(ox * ox + oy * oy) || 1;
  ox /= len;
  oy /= len;
  const t1 = [x + (ox * 22 - oy * 6) * k, y + (oy * 22 + ox * 6) * k];
  const t2 = [x + (ox * 46 + oy * 4) * k, y + (oy * 46 - ox * 4) * k];
  const tail = `M${r1(x)} ${r1(y)} Q${r1(t1[0])} ${r1(t1[1])} ${r1(t2[0])} ${r1(t2[1])}`;
  const fray = [-1, 0, 1]
    .map((j) => `M${r1(t2[0])} ${r1(t2[1])} l${r1((ox * 9 - oy * j * 5) * k)} ${r1((oy * 9 + ox * j * 5) * k)}`)
    .join('');
  return `<g class="ls-knot">
    <path class="ls-r0" d="${tail}"/><path class="ls-r1" d="${tail}"/><path class="ls-fray" d="${fray}"/>
    <g transform="translate(${r1(x)} ${r1(y)}) rotate(${Math.round(ang)}) scale(${k})">
      <ellipse rx="16" ry="12" class="ls-knot-b"/>
      <path d="M-7 -10.5 C -10 -4, -10 4, -7 10.5 M0 -12 C -3 -4, -3 4, 0 12 M7 -10.5 C 4 -4, 4 4, 7 10.5" class="ls-knot-w"/>
    </g>
  </g>`;
}

// Ganze Schlinge eines Spielers; draw = Seil zieht sich ein (Aufdecken)
function loopSvg(pts, color, cls = '') {
  const d = ropeD(pts, true);
  return `<g class="ls-rope ${cls}" style="--pc:${color}">
    <path class="ls-fill" d="${d}"/>
    <path class="ls-r0" pathLength="1" d="${d}"/>
    <path class="ls-r1" pathLength="1" d="${d}"/>
    <path class="ls-r2" d="${d}"/>
    ${knotSvg(pts)}
  </g>`;
}

// Kleiner Stein als HTML-Knopf (Ablage, Wort, Wertung). joker: '' (noch frei) oder der Buchstabe
function chipSvg(ch, joker = null) {
  const isJ = joker !== null;
  return `<svg viewBox="-41 -41 82 86" aria-hidden="true">
    <rect x="-38" y="-34" width="76" height="76" rx="8" fill="${WOOD_EDGE}" stroke="${INKC}" stroke-width="3"/>
    <rect x="-38" y="-38" width="76" height="72" rx="8" fill="${isJ ? JOKER_FACE : WOOD}" stroke="${INKC}" stroke-width="3"/>
    ${
      isJ
        ? `<rect x="-31" y="-31" width="62" height="58" rx="4" fill="none" stroke="${INKC}" stroke-width="1.6" stroke-dasharray="4 4"/>
           ${joker ? `<text class="ls-ch ls-ch-j" y="15">${joker}</text><path d="M24 -30 L26 -25 L31 -25 L27 -22 L29 -17 L24 -20 L19 -17 L21 -22 L17 -25 L22 -25 Z" fill="${GOLD[0]}" stroke="${INKC}" stroke-width="1.4" stroke-linejoin="round"/>`
             : `<path d="M0 -18 L4.5 -6 L17 -6 L7 2 L11 15 L0 7 L-11 15 L-7 2 L-17 -6 L-4.5 -6 Z" fill="${GOLD[0]}" stroke="${INKC}" stroke-width="2.2" stroke-linejoin="round"/>`}`
        : `<path d="M-31 -27 C -31 -31, -29 -32, -24 -32 H 8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>
           <text class="ls-ch" y="15">${ch}</text>`
    }
  </svg>`;
}

// Abbildung für den Start: HUT im Lasso
const SCENE = (() => {
  const t = (x, y, r, ch) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(.68)">${tileSvg(ch)}</g>`;
  const d = 'M30 70 C 26 26, 110 14, 170 30 C 222 44, 226 110, 180 124 C 130 138, 50 130, 34 104 C 28 94, 28 84, 30 70';
  return `<svg class="ls-scene" viewBox="0 0 250 150" aria-hidden="true">
    ${t(62, 72, -5, 'H')}${t(120, 60, 4, 'U')}${t(176, 82, -3, 'T')}
    <g class="ls-rope" style="--pc:var(--p1)">
      <path class="ls-r0" pathLength="1" d="${d}"/><path class="ls-r1" pathLength="1" d="${d}"/><path class="ls-r2" d="${d}"/>
      ${knotSvg([[30, 70], [32, 52], [60, 34], [120, 22], [170, 30], [210, 60], [200, 110], [150, 130], [80, 128], [40, 108], [30, 90]], 0.6)}
    </g>
  </svg>`;
})();

// --- Zustand im Browser (überlebt neues Zeichnen) ---

const ui = new WeakMap();

// HTML nur setzen, wenn es sich geändert hat: Sonst würden Knöpfe ersetzt, während jemand tippt.
const shown = new WeakMap();
function put(el, html) {
  if (shown.get(el) === html) return false;
  shown.set(el, html);
  el.innerHTML = html;
  return true;
}

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, key: null, boardKey: null, board: null, stage: null, lastRefresh: 0 };
    ui.set(el, u);
    const timer = setInterval(() => clockTick(u), 200);
    game.signal.addEventListener('abort', () => {
      clearInterval(timer);
      u.stage?.abort();
    });
  }
  return u;
}

const me = (u) => u.game.me;
const timesOf = (s) => TIMES[s.tempo] ?? TIMES.normal;
const color = (u, id) => u.game.color(id);
const esc = (u, t) => u.game.esc(t);
const nameList = (u, list2) => list(list2.map((id) => (id === me(u) ? 'dir' : esc(u, u.game.name(id)))));

export function render(el, s, game) {
  const u = local(el, game);
  u.s = s;
  u.game = game;

  let root = el.querySelector(':scope > .ls');
  if (!root) {
    el.innerHTML = `<div class="ls">
      <div class="ls-head"><ol class="ls-rounds"></ol><p class="ls-clock"><span class="ls-phase"></span><span class="ls-time num"></span></p></div>
      <div class="ls-bar"><i></i></div>
      <div class="ls-over"></div>
      <div class="ls-slot"></div>
      <div class="ls-under"></div>
    </div>`;
    root = el.firstElementChild;
  }
  u.root = root;
  renderRounds(u);

  const key = s.result ? 'ende' : `${s.round}:${s.phase}:${s.startAt}`;
  if (u.key !== key) {
    u.stage?.abort();
    u.stage = new AbortController();
    u.prevKey = u.key;
    u.key = key;
    u.entered = false;
    u.autoSent = false;
    const boardKey = s.result || s.phase === 'bereit' ? null : `${s.round}:${s.startAt}`;
    if (boardKey !== u.boardKey) {
      u.boardKey = boardKey;
      buildBoard(u);
    }
    root.dataset.phase = s.result ? 'ende' : s.phase;
    root.querySelector('.ls-over').replaceChildren();
    root.querySelector('.ls-under').replaceChildren();
  }

  if (s.result) renderEnd(u);
  else if (s.phase === 'bereit') renderReady(u);
  else if (s.phase === 'zeichnen') renderDraw(u);
  else if (s.phase === 'wort') renderWord(u);
  else if (s.phase === 'wertung') renderScore(u);
  u.entered = true;
  clockTick(u);
}

// --- Kopf: Runden und Uhr ---

function renderRounds(u) {
  const { s, game } = u;
  const box = u.root.querySelector('.ls-rounds');
  const sig = `${s.round}:${s.result ? 1 : 0}`;
  if (box.dataset.sig === sig) return;
  const fresh = box.dataset.sig !== undefined;
  box.dataset.sig = sig;
  box.classList.toggle('intro', game.first && !fresh);
  box.innerHTML = Array.from({ length: s.rounds }, (_, i) => {
    const state = i < s.round || s.result ? 'past' : i === s.round ? 'now' : 'next';
    const last = i === s.rounds - 1;
    return `<li class="ls-rd is-${state} ${fresh && i === s.round - 1 ? 'fresh' : ''}" style="--i:${i}"
      aria-label="Runde ${word(i + 1)}${last ? ', zählt doppelt' : ''}${state === 'now' ? ', läuft' : ''}"><span class="num">${i + 1}</span>${last ? '<b>×2</b>' : ''}</li>`;
  }).join('');
}

// Läuft alle 200 ms: Uhr, Countdown, Steine einfallen lassen, rechtzeitig abgeben, bei null nachfragen
function clockTick(u) {
  const { s, game } = u;
  if (!s || !u.root) return;
  const now = game.now();
  const clock = u.root.querySelector('.ls-clock');
  const bar = u.root.querySelector('.ls-bar');
  const T = timesOf(s);
  let label = '';
  let left = null;
  let total = 1;
  if (!s.result) {
    if (s.phase === 'zeichnen') {
      if (now < s.startAt) {
        label = 'Gleich geht es los';
        left = s.startAt - now;
        total = COUNTDOWN;
      } else {
        label = 'Seil auslegen';
        left = s.deadline - now;
        total = T.draw * 1000;
      }
    } else if (s.phase === 'wort') {
      total = T.word * 1000;
      if (now < s.revealAt + REVEAL) {
        // Erst aufdecken: Die Uhr fürs Wort steht noch (oder zählt das Aufdecken herunter, wenn alle fertig sind)
        label = 'Aufdecken';
        left = s.deadline > s.revealAt + REVEAL ? s.deadline - s.revealAt - REVEAL : s.revealAt + REVEAL - now;
        if (s.deadline <= s.revealAt + REVEAL) total = REVEAL;
      } else {
        label = 'Wort legen';
        left = s.deadline - now;
      }
    } else if (s.phase === 'wertung') {
      label = 'Wertung';
      left = s.deadline - now;
      total = T.score * 1000;
    }
  }
  // Beim Countdown steht die große Zahl auf dem Feld, im Kopf nur der Hinweis
  const counting = s.phase === 'zeichnen' && now < s.startAt && !s.result;
  clock.hidden = left === null;
  bar.hidden = left === null || counting;
  clock.querySelector('.ls-time').hidden = counting;
  if (left !== null) {
    left = Math.max(0, left);
    const sec = String(Math.ceil(left / 1000));
    const phase = clock.querySelector('.ls-phase');
    const time = clock.querySelector('.ls-time');
    if (phase.textContent !== label) phase.textContent = label;
    const low = left < 5500 && (s.phase === 'zeichnen' || s.phase === 'wort') && now >= (s.startAt ?? 0);
    if (time.textContent !== sec) {
      time.textContent = sec;
      if (low && !game.reducedMotion) time.animate([{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    clock.classList.toggle('low', low);
    bar.classList.toggle('low', low);
    bar.firstElementChild.style.transform = `scaleX(${Math.min(1, left / total).toFixed(4)})`;
  }

  if (s.phase === 'zeichnen' && !s.result) drawTick(u, now);
  if (s.phase === 'wort' && !s.result) wordTick(u, now);

  if (!s.result && s.end && now >= s.end + 250 && Date.now() - u.lastRefresh > 1500) {
    u.lastRefresh = Date.now();
    game.refresh();
  }
}

// Wer ist fertig? Kleine Namensschilder mit Haken
function whoHtml(u, doneList, label) {
  const { s, game } = u;
  const before = new Set(u.whoBefore ?? doneList);
  const html = ids(s)
    .map((id) => {
      const done = doneList.includes(id);
      const fresh = done && !before.has(id) && !game.reducedMotion;
      return `<li class="${done ? 'is-done' : ''} ${fresh ? 'fresh' : ''}" style="--pc:${color(u, id)}"><span class="marker" style="color:${color(u, id)}"></span><span class="ls-wn">${id === me(u) ? 'Du' : esc(u, game.name(id))}</span>${done ? CHECK : ''}</li>`;
    })
    .join('');
  u.whoBefore = [...doneList];
  return `<ul class="ls-who" aria-label="${label}">${html}</ul>`;
}

// --- Bereit ---

function renderReady(u) {
  const { s, game } = u;
  const over = u.root.querySelector('.ls-over');
  const mine = s.ready.includes(me(u));
  const missing = ids(s).filter((id) => !s.ready.includes(id));
  if (!u.entered) {
    const teams = s.teams
      ? `<p class="ls-teams">Teams: ${s.teams.map((t) => t.map((id) => `<span class="marker" style="color:${color(u, id)}"></span> ${id === me(u) ? 'du' : esc(u, game.name(id))}`).join(' und ')).join(' <span class="muted">gegen</span> ')}.</p>`
      : '';
    over.innerHTML = `<div class="ls-intro ${game.first && !s.paused ? 'enter' : ''}">
      ${s.paused ? '<p class="status">Niemand hat ein Seil ausgelegt. Die Runde fängt neu an, sobald alle bereit sind.</p>' : SCENE}
      ${
        s.paused || s.round
          ? ''
          : `<ol class="ls-rules">
        <li><b>Seil auslegen.</b> Zieh heimlich eine Schlinge um die Buchstaben, die du willst. Das Seil reicht nicht für alles.</li>
        <li><b>Aufdecken.</b> Was in mehreren Schlingen liegt, verbrennt.</li>
        <li><b>Wort legen.</b> Aus deinen Steinen und einem Joker. Jeder eigene Stein im Wort ist ein Punkt.</li>
      </ol>
      <p class="muted ls-more">Fünf Runden. Unter einem Stein liegt ein Goldstein, wer ihn fängt, verdoppelt seine Punkte. Die letzte Runde zählt doppelt, und wer hinten liegt, bekommt mehr Seil. Passt ein Wort nicht, erhebt Einspruch.</p>`
      }
      ${teams}
      <div class="ls-ready-box"><div class="ls-who-box"></div><div class="row ls-ready-row"></div></div>
    </div>`;
  }
  put(over.querySelector('.ls-who-box'), whoHtml(u, s.ready, 'Bereit'));
  put(
    over.querySelector('.ls-ready-row'),
    `${mine ? `<p class="status">Warte auf ${nameList(u, missing)}.</p>` : '<button class="btn primary" data-action="bereit">Bereit</button>'}
     ${mine && missing.length ? `<button class="link" data-action="los">Ohne ${nameList(u, missing)} anfangen</button>` : ''}`,
  );
}

// --- Spielfeld ---

function buildBoard(u) {
  const slot = u.root.querySelector('.ls-slot');
  u.board = null;
  u.drag = null;
  u.loop = null;
  if (!u.boardKey) {
    slot.replaceChildren();
    return;
  }
  const { s } = u;
  const { w, h, tiles } = s.board;
  const n = tiles.length;
  const step = Math.min(45, 620 / n); // Auftakt insgesamt höchstens gut eine halbe Sekunde
  // Reihenfolge des Einfallens: von oben links nach unten rechts
  const order = [...tiles.keys()].sort((a, b) => tiles[a].y + tiles[a].x * 0.4 - (tiles[b].y + tiles[b].x * 0.4));
  const rankOf = new Map(order.map((i, k) => [i, k]));
  const dots = [];
  for (let x = 60; x < w; x += 80) for (let y = 60; y < h; y += 80) dots.push(`M${x} ${y}h.1`);
  slot.innerHTML = `<div class="ls-board wait" style="--w:${w};--h:${h}">
    <svg class="ls-field" viewBox="${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}" role="img" aria-label="Spielfeld mit ${word(n)} Buchstaben">
      <rect class="ls-ground" x="0" y="0" width="${w}" height="${h}" rx="10"/>
      <path class="ls-dots" d="${dots.join('')}"/>
      <g class="ls-fills"></g>
      <g class="ls-tiles">${tiles
        .map(
          (t, i) => `<g class="ls-at" transform="translate(${t.x} ${t.y})"><g class="ls-base"></g><g class="ls-tile-r" transform="rotate(${t.r})"><g class="ls-tile" data-i="${i}" style="--k:${rankOf.get(i)};--step:${step}ms">${tileSvg(t.ch)}</g></g></g>`,
        )
        .join('')}</g>
      <g class="ls-ropes"></g>
      <g class="ls-fx"></g>
    </svg>
    <div class="ls-count num" aria-hidden="true"></div>
  </div>`;
  const el = slot.firstElementChild;
  u.board = {
    el,
    svg: el.querySelector('svg'),
    ropes: el.querySelector('.ls-ropes'),
    fills: el.querySelector('.ls-fills'),
    fx: el.querySelector('.ls-fx'),
    count: el.querySelector('.ls-count'),
    tiles: [...el.querySelectorAll('.ls-tile')],
    shown: false,
  };
}

const tileEl = (u, i) => u.board.tiles[i];

// Steine erscheinen, sobald die Runde beginnt (vorher zählt das Feld herunter)
function showTiles(u, now) {
  const b = u.board;
  if (!b || b.shown) return;
  const { s, game } = u;
  if (s.phase === 'zeichnen' && now < s.startAt) {
    const n = String(Math.ceil((s.startAt - now) / 1000));
    if (b.count.textContent !== n) {
      b.count.textContent = n;
      if (!game.reducedMotion) b.count.animate([{ transform: 'scale(1.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    return;
  }
  b.shown = true;
  b.count.textContent = '';
  b.el.classList.remove('wait');
  if (s.phase === 'zeichnen' && now - s.startAt < 1500 && !game.reducedMotion) b.el.classList.add('drop');
}

// --- Seil auslegen ---

function renderDraw(u) {
  const { s, game } = u;
  const under = u.root.querySelector('.ls-under');
  const done = s.done.includes(me(u));
  const sent = s.loops[me(u)] ? decodePoints(s.loops[me(u)], s.board.w, s.board.h) : null;
  if (!u.entered) {
    const ink = s.ink[me(u)] ?? INK;
    under.innerHTML = `
      <div class="ls-ink" style="--pc:${color(u, me(u))}">
        ${coilSvg}
        <div class="ls-ink-track"><i></i></div>
        <span class="ls-ink-label"><span class="ls-ink-ok">Seil${ink > INK ? ', extra lang' : ''}</span><span class="ls-ink-end">Seil zu Ende</span></span>
      </div>
      ${ink > INK ? '<p class="ls-bonus muted">Du liegst hinten und bekommst mehr Seil.</p>' : ''}
      <p class="status ls-note" aria-live="polite"></p>
      <div class="row ls-actions"><button type="button" class="btn primary ls-send">Fertig</button><button type="button" class="link ls-redo" hidden>Nochmal ziehen</button></div>
      <div class="ls-who-box"></div>`;
    under.querySelector('.ls-send').addEventListener('click', () => sendLoop(u), { signal: u.stage.signal });
    under.querySelector('.ls-redo').addEventListener('click', () => game.send('neu'), { signal: u.stage.signal });
    bindDraw(u);
    if (game.first || u.prevKey) scrollToGame(u);
  }
  // Abgegeben (auch nach Neuladen): die gespeicherte Schlinge zeigen
  if (done && sent && !u.drag && (!u.loop || encodePoints(u.loop) !== s.loops[me(u)])) u.loop = sent;
  if (!done && u.wasDone && !u.drag) u.loop = null;
  u.wasDone = done;
  put(under.querySelector('.ls-who-box'), whoHtml(u, s.done, 'Fertig'));
  u.board?.el.classList.toggle('locked', done);
  syncDraw(u);
}

function canDraw(u) {
  const { s, game } = u;
  const now = game.now();
  return s.phase === 'zeichnen' && !s.result && now >= s.startAt && now < s.deadline + 300 && !s.done.includes(me(u)) && !u.sending;
}

function bindDraw(u) {
  const { svg } = u.board;
  const signal = u.stage.signal;
  const pos = (e) => {
    const rect = svg.getBoundingClientRect();
    const { w, h } = u.s.board;
    const x = -PAD + ((e.clientX - rect.left) / rect.width) * (w + 2 * PAD);
    const y = -PAD + ((e.clientY - rect.top) / rect.height) * (h + 2 * PAD);
    return [Math.round(Math.min(w, Math.max(0, x))), Math.round(Math.min(h, Math.max(0, y)))];
  };
  svg.addEventListener(
    'pointerdown',
    (e) => {
      if (u.drag || !canDraw(u) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {}
      u.drag = { id: e.pointerId, pts: [pos(e)], used: 0, taut: false };
      u.loop = null;
      u.hint = '';
      syncDraw(u);
    },
    { signal },
  );
  svg.addEventListener(
    'pointermove',
    (e) => {
      const d = u.drag;
      if (!d || e.pointerId !== d.id) return;
      const events = e.getCoalescedEvents?.() ?? [];
      let added = false;
      for (const ev of events.length ? events : [e]) added = addPoint(u, pos(ev)) || added;
      if (added || d.taut !== d.wasTaut) {
        d.wasTaut = d.taut;
        if (!u.raf) {
          u.raf = requestAnimationFrame(() => {
            u.raf = null;
            syncDraw(u);
          });
        }
      }
    },
    { signal },
  );
  const end = (e) => {
    if (!u.drag || e.pointerId !== u.drag.id) return;
    finishDrag(u);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(type, end, { signal });
  // iOS: Die Seite nicht verschieben, solange ein Seil ausgelegt werden darf
  const hold = (e) => canDraw(u) && e.cancelable && e.preventDefault();
  svg.addEventListener('touchstart', hold, { signal, passive: false });
  svg.addEventListener('touchmove', hold, { signal, passive: false });
}

// Neuer Seilpunkt, aber nur so weit, wie das Seil reicht (mit dem Weg zurück zum Knoten)
function addPoint(u, q) {
  const d = u.drag;
  const last = d.pts[d.pts.length - 1];
  if (dist(last, q) < STEP || d.pts.length >= MAX_PTS - 1) return false;
  const ink = u.s.ink[me(u)] ?? INK;
  const fits = (p) => d.used + dist(last, p) + dist(p, d.pts[0]) <= ink;
  let p = q;
  if (!fits(q)) {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      const c = [Math.round(last[0] + (q[0] - last[0]) * m), Math.round(last[1] + (q[1] - last[1]) * m)];
      if (fits(c)) lo = m;
      else hi = m;
    }
    p = [Math.round(last[0] + (q[0] - last[0]) * lo), Math.round(last[1] + (q[1] - last[1]) * lo)];
    d.taut = true;
    if (dist(last, p) < 2 || !fits(p)) return false;
  } else d.taut = false;
  d.used += dist(last, p);
  d.pts.push(p);
  return true;
}

function finishDrag(u) {
  const d = u.drag;
  u.drag = null;
  if (!d) return;
  if (d.pts.length < 3 || Math.abs(area(d.pts)) < 6000) {
    u.loop = null;
    u.hint = 'Zu klein. Zieh das Seil um ein paar Buchstaben.';
  } else {
    u.loop = d.pts;
    u.hint = '';
  }
  syncDraw(u);
}

async function sendLoop(u) {
  if (!u.loop || u.sending || u.s.done.includes(me(u))) return;
  u.sending = true;
  syncDraw(u);
  await u.game.send('schlinge', { p: encodePoints(u.loop) });
  u.sending = false;
  if (u.board) syncDraw(u);
}

// Kurz vor Schluss abgeben, was da ist (auch ein Seil, das gerade noch gezogen wird)
function drawTick(u, now) {
  showTiles(u, now);
  const { s } = u;
  if (u.autoSent || s.done.includes(me(u)) || now < s.deadline - 400) return;
  u.autoSent = true;
  if (u.drag) finishDrag(u);
  if (u.loop) sendLoop(u);
}

// Eigenes Seil, Seilanzeige, eingefangene Steine und Knöpfe auf den Stand bringen
function syncDraw(u) {
  const b = u.board;
  if (!b) return;
  const { s, game } = u;
  const under = u.root.querySelector('.ls-under');
  const done = s.done.includes(me(u));
  const ink = s.ink[me(u)] ?? INK;
  const d = u.drag;
  const pts = d ? d.pts : u.loop;
  const pc = color(u, me(u));
  let used = 0;
  if (d) {
    b.ropes.innerHTML = `<g class="ls-rope live ${d.taut ? 'taut' : ''}" style="--pc:${pc}">
      <path class="ls-fill" d="${ropeD(d.pts, true)}"/>
      <line class="ls-close" x1="${d.pts[d.pts.length - 1][0]}" y1="${d.pts[d.pts.length - 1][1]}" x2="${d.pts[0][0]}" y2="${d.pts[0][1]}"/>
      <path class="ls-r0" d="${ropeD(d.pts, false)}"/><path class="ls-r1" d="${ropeD(d.pts, false)}"/><path class="ls-r2" d="${ropeD(d.pts, false)}"/>
      <circle class="ls-anchor" cx="${d.pts[0][0]}" cy="${d.pts[0][1]}" r="13"/>
    </g>`;
    used = d.used + (d.pts.length > 1 ? dist(d.pts[d.pts.length - 1], d.pts[0]) : 0);
  } else if (pts) {
    if (b.drawn !== pts) {
      b.ropes.innerHTML = loopSvg(pts, pc, `mine ${b.drawn === undefined || game.reducedMotion ? '' : 'snap'}`);
      b.drawn = pts;
    }
    used = ropeLength(pts);
  } else {
    b.ropes.replaceChildren();
    b.drawn = null;
  }
  // Steine im eigenen Seil hervorheben
  const { tiles } = s.board;
  tiles.forEach((t, i) => {
    const isIn = Boolean(pts && pts.length > 2 && inside(pts, t.x, t.y));
    const el = tileEl(u, i);
    if (el.classList.contains('in') !== isIn) {
      el.classList.toggle('in', isIn);
      el.style.setProperty('--pc', pc);
    }
  });
  const left = Math.max(0, 1 - used / ink);
  under.querySelector('.ls-ink-track i').style.transform = `scaleX(${left.toFixed(4)})`;
  under.querySelector('.ls-ink').classList.toggle('empty', Boolean(d?.taut));
  const send = under.querySelector('.ls-send');
  send.hidden = done;
  send.disabled = !u.loop || u.sending || Boolean(d);
  under.querySelector('.ls-redo').hidden = !done;
  b.svg.classList.toggle('can-draw', !done);
  const count = pts && pts.length > 2 ? tiles.filter((t) => inside(pts, t.x, t.y)).length : 0;
  let note;
  if (done) {
    const waiting = ids(s).filter((id) => !s.done.includes(id));
    note = waiting.length ? `Abgegeben. Warte auf ${nameList(u, waiting)}.` : 'Alle sind fertig.';
  } else if (u.hint) note = u.hint;
  else if (d?.taut) note = 'Das Seil ist zu Ende. Führ es zurück zum Knoten.';
  else if (d) note = count === 1 ? 'Ein Buchstabe im Seil.' : `${cap(word(count))} Buchstaben im Seil.`;
  else if (u.loop) note = `${count === 1 ? 'Ein Buchstabe' : `${cap(word(count))} Buchstaben`} im Seil. Neu ansetzen ersetzt die Schlinge.`;
  else note = 'Zieh mit dem Finger eine Schlinge um die Buchstaben, die du willst.';
  const el = under.querySelector('.ls-note');
  if (el.textContent !== note) el.textContent = note;
}

// --- Aufdecken und Wort legen ---

function renderWord(u) {
  const { s, game } = u;
  const under = u.root.querySelector('.ls-under');
  if (!u.entered) {
    // Kommt die Ansicht direkt vom Seil auslegen, wird aufgedeckt (sonst gleich der Endstand)
    const play = !game.reducedMotion && u.prevKey === `${s.round}:zeichnen:${s.startAt}` && game.now() - s.revealAt < 4000;
    showTiles(u, game.now());
    drawReveal(u, play);
    u.draft = { keys: [], joker: '' };
    u.picker = false;
    under.innerHTML = `<div class="ls-build">
        <div class="ls-word-wrap"><div class="ls-word" aria-label="Dein Wort"></div><p class="ls-worth num"></p></div>
        <div class="ls-rack" aria-label="Deine Steine"></div>
        <div class="ls-picker" hidden><p class="label">Joker als</p><div class="ls-letters">${[...JOKER_LETTERS].map((ch) => `<button type="button" class="ls-pick" data-ch="${ch}">${ch}</button>`).join('')}</div></div>
        <p class="status ls-note" aria-live="polite"></p>
        <div class="row ls-actions"><button type="button" class="btn primary ls-send">Fertig</button><button type="button" class="link ls-clear">Leeren</button><button type="button" class="link ls-pass">Passen</button><button type="button" class="link ls-edit" hidden>Ändern</button></div>
      </div>
      <div class="ls-who-box"></div>`;
    bindBuild(u, play);
  }
  put(under.querySelector('.ls-who-box'), whoHtml(u, s.done, 'Fertig'));
  syncBuild(u);
}

// Alle Seile, eingefangene und verbrannte Steine; play = als Abfolge animiert
function drawReveal(u, play) {
  const b = u.board;
  if (!b) return;
  const { s } = u;
  const { w, h, tiles } = s.board;
  b.svg.classList.remove('can-draw');
  b.el.classList.remove('locked');
  b.el.classList.toggle('reveal', play);
  b.el.classList.add('open');
  b.drawn = undefined;
  // Seile: jeder in seiner Farbe, alle zugleich
  b.ropes.innerHTML = ids(s)
    .filter((id) => s.loops[id])
    .map((id) => {
      const pts = decodePoints(s.loops[id], w, h);
      return pts ? loopSvg(pts, color(u, id), play ? 'draw' : '') : '';
    })
    .join('');
  const owner = {};
  for (const id of ids(s)) for (const i of s.caught[id]) owner[i] ??= id;
  const burned = new Set(s.burned);
  let fx = '';
  tiles.forEach((t, i) => {
    const el = tileEl(u, i);
    el.classList.remove('in');
    if (owner[i]) {
      el.classList.add('own');
      el.style.setProperty('--pc', color(u, owner[i]));
    }
    if (burned.has(i)) {
      el.classList.add('burn');
      el.insertAdjacentHTML('beforeend', burntSvg(t.ch));
      el.closest('.ls-at').querySelector('.ls-base').innerHTML = ASH;
      const k = s.burned.indexOf(i);
      if (play) {
        // Flammen und Funken (fester Zufall pro Stein)
        const flames = [-24, 0, 24]
          .map((dx, j) => `<g class="ls-flame" style="--j:${j}" transform="translate(${t.x + dx} ${t.y - (j === 1 ? 14 : 2)}) scale(${r1((j === 1 ? 1.25 : 0.85) + hash(i, j) * 0.25)})"><g>${FLAME}</g></g>`)
          .join('');
        const sparks = Array.from({ length: 6 }, (_, j) => {
          const a = hash(i, j + 5) * Math.PI * 2;
          const dd = 50 + hash(i, j + 9) * 40;
          return `<rect class="ls-ember" x="${t.x - 3}" y="${t.y - 3}" width="6" height="6" style="--ex:${Math.round(Math.cos(a) * dd)}px;--ey:${Math.round(Math.sin(a) * dd - 30)}px;--j:${j}"/>`;
        }).join('');
        fx += `<g class="ls-burnfx" style="--b:${k}">${flames}${sparks}</g>`;
      }
      el.closest('.ls-at').style.setProperty('--b', k);
    }
  });
  b.fx.innerHTML = fx;
}

function bindBuild(u, play) {
  const under = u.root.querySelector('.ls-under');
  const signal = u.stage.signal;
  const { s, game } = u;
  under.querySelector('.ls-build').addEventListener(
    'click',
    (e) => {
      if (s.done.includes(me(u)) || u.sending) return;
      const chip = e.target.closest('.ls-chip');
      const pick = e.target.closest('.ls-pick');
      if (chip) {
        const k = chip.dataset.k === 'j' ? 'j' : Number(chip.dataset.k);
        if (chip.closest('.ls-word')) {
          u.draft.keys = u.draft.keys.filter((x) => x !== k);
          if (k === 'j') u.draft.joker = '';
        } else if (k === 'j') {
          u.picker = !u.picker;
        } else u.draft.keys.push(k);
        syncBuild(u, true);
      } else if (pick) {
        u.draft.joker = pick.dataset.ch;
        u.draft.keys = u.draft.keys.filter((x) => x !== 'j');
        u.draft.keys.push('j');
        u.picker = false;
        syncBuild(u, true);
      } else if (e.target.closest('.ls-send')) sendWord(u);
      else if (e.target.closest('.ls-clear')) {
        u.draft = { keys: [], joker: '' };
        u.picker = false;
        syncBuild(u, true);
      } else if (e.target.closest('.ls-pass')) {
        u.sending = true;
        game.send('wort', { w: '' }).then(() => {
          u.sending = false;
          syncBuild(u);
        });
      }
    },
    { signal },
  );
  under.querySelector('.ls-edit').addEventListener(
    'click',
    () => {
      const w = s.words[me(u)];
      if (w) restoreDraft(u, w);
      game.send('aendern');
    },
    { signal },
  );
  // Tastatur: Buchstaben tippen, Rücktaste, Eingabe
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName ?? '')) return;
      if (u.s.phase !== 'wort' || u.s.done.includes(me(u))) return;
      const key = e.key.length === 1 ? cleanWord(e.key) : '';
      if (e.key === 'Backspace') {
        const k = u.draft.keys.pop();
        if (k === 'j') u.draft.joker = '';
      } else if (e.key === 'Enter') return sendWord(u);
      else if (key.length === 1 && JOKER_LETTERS.includes(key)) {
        const free = rackKeys(u).find((i) => u.s.board.tiles[i].ch === key && !u.draft.keys.includes(i));
        if (free !== undefined) u.draft.keys.push(free);
        else if (!u.draft.keys.includes('j')) {
          u.draft.joker = key;
          u.draft.keys.push('j');
        } else return;
      } else return;
      e.preventDefault();
      u.picker = false;
      syncBuild(u, true);
    },
    { signal },
  );
  // Die eigenen Steine fliegen vom Feld in die Ablage
  u.flyIn = play;
}

const rackKeys = (u) => u.s.caught?.[me(u)] ?? [];
const draftWord = (u) => u.draft.keys.map((k) => (k === 'j' ? u.draft.joker : u.s.board.tiles[k].ch)).join('');

// Gespeichertes Wort wieder in den Entwurf holen (Ändern, Neuladen)
function restoreDraft(u, w) {
  const keys = [];
  let joker = '';
  [...w.w].forEach((ch, i) => {
    const k = i === w.joker ? undefined : rackKeys(u).find((t) => u.s.board.tiles[t].ch === ch && !keys.includes(t));
    if (k === undefined) {
      joker = ch;
      keys.push('j');
    } else keys.push(k);
  });
  u.draft = { keys, joker };
}

async function sendWord(u) {
  const w = draftWord(u);
  if (u.sending || [...w].length < 2 || u.s.done.includes(me(u))) return;
  u.sending = true;
  syncBuild(u);
  await u.game.send('wort', { w });
  u.sending = false;
  if (u.root.isConnected) syncBuild(u);
}

function wordTick(u, now) {
  const { s } = u;
  if (u.autoSent || s.done.includes(me(u)) || now < s.deadline - 400 || !u.draft) return;
  u.autoSent = true;
  if ([...draftWord(u)].length >= 2) sendWord(u);
}

// Ablage und Wort zeichnen; flip = Steine gleiten von ihrem alten Platz an den neuen
function syncBuild(u, flip = false) {
  const { s, game } = u;
  const under = u.root.querySelector('.ls-under');
  const build = under.querySelector('.ls-build');
  if (!build) return;
  const done = s.done.includes(me(u));
  const rack = rackKeys(u);
  const saved = s.words[me(u)];
  if (done && saved && draftWord(u) !== saved.w) restoreDraft(u, saved);

  const before = new Map();
  if (flip && !game.reducedMotion) for (const c of build.querySelectorAll('.ls-chip')) before.set(c.dataset.k, c.getBoundingClientRect());

  const chip = (k, inWord) => {
    const isJ = k === 'j';
    const ch = isJ ? '' : s.board.tiles[k].ch;
    const label = isJ ? (u.draft.joker && inWord ? `Joker als ${u.draft.joker}` : 'Joker') : ch;
    return `<button type="button" class="ls-chip ${isJ ? 'joker' : ''}" data-k="${k}" aria-label="${label}${inWord ? ', zurücklegen' : ''}" ${done ? 'disabled' : ''}>${chipSvg(ch, isJ ? (inWord ? u.draft.joker : '') : null)}</button>`;
  };
  const wordEl = build.querySelector('.ls-word');
  const rackEl = build.querySelector('.ls-rack');
  // Nur neu zeichnen, wenn sich am eigenen Wort etwas geändert hat (sonst geht ein Tipp verloren,
  // während jemand anderes abgibt)
  const sig = JSON.stringify([u.draft, done, rack]);
  const same = build.dataset.sig === sig;
  build.dataset.sig = sig;
  if (!same) wordEl.innerHTML = u.draft.keys.length ? u.draft.keys.map((k) => chip(k, true)).join('') : `<span class="ls-word-empty">${rack.length ? 'Tippe deine Steine an.' : ''}</span>`;
  if (!same) rackEl.innerHTML = [...rack.filter((k) => !u.draft.keys.includes(k)), ...(u.draft.keys.includes('j') ? [] : ['j'])].map((k) => chip(k, false)).join('');
  rackEl.hidden = !rack.length;

  const w = draftWord(u);
  const m = [...w].length >= 2 ? matchWord(w, rack.map((i) => s.board.tiles[i].ch)) : null;
  const worth = build.querySelector('.ls-worth');
  worth.textContent = m ? (m.pts === 1 ? 'Ein Punkt' : `${cap(word(m.pts))} Punkte`) : '';
  build.querySelector('.ls-picker').hidden = !u.picker || done;
  for (const p of build.querySelectorAll('.ls-pick')) p.setAttribute('aria-pressed', String(p.dataset.ch === u.draft.joker));

  const send = build.querySelector('.ls-send');
  send.hidden = done || !rack.length;
  send.disabled = !m || u.sending;
  build.querySelector('.ls-clear').hidden = done || !u.draft.keys.length;
  build.querySelector('.ls-pass').hidden = done || !rack.length || u.draft.keys.length > 0;
  build.querySelector('.ls-edit').hidden = !done || !rack.length || game.now() > s.deadline;

  let note;
  if (!rack.length) note = s.caught ? 'Du hast diesmal keine Steine behalten.' : '';
  else if (done) {
    const waiting = ids(s).filter((id) => !s.done.includes(id));
    const what = saved ? `„${saved.w}“ abgegeben.` : 'Gepasst.';
    note = waiting.length ? `${what} Warte auf ${nameList(u, waiting)}.` : what;
  } else if (u.picker) note = 'Welcher Buchstabe soll der Joker sein?';
  else note = 'Der Joker wird zu jedem Buchstaben, zählt aber keinen Punkt.';
  const noteEl = build.querySelector('.ls-note');
  if (noteEl.textContent !== note) noteEl.textContent = note;

  // Bewegung: in die Ablage fliegen (Aufdecken) oder zwischen Ablage und Wort gleiten
  if (u.flyIn) {
    u.flyIn = false;
    rackEl.querySelectorAll('.ls-chip:not(.joker)').forEach((c, j) => {
      const from = tileEl(u, Number(c.dataset.k)).getBoundingClientRect();
      const to = c.getBoundingClientRect();
      if (!to.width) return;
      const k = from.width / to.width;
      c.animate(
        [
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${k})`, opacity: 0 },
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${k})`, opacity: 1, offset: 0.08 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 520, delay: 2500 + j * 70, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'backwards' },
      );
    });
    const jk = rackEl.querySelector('.ls-chip.joker');
    jk?.animate([{ transform: 'translateY(10px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 300,
      delay: 2600 + rack.length * 70,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'backwards',
    });
  } else if (before.size) {
    for (const c of build.querySelectorAll('.ls-chip')) {
      const from = before.get(c.dataset.k);
      if (!from) continue;
      const to = c.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
}

// --- Wertung ---

function scoreRowsHtml(u) {
  const { s, game } = u;
  const teams = teamsOf(s);
  let k = 0;
  const row = (id) => {
    const r = roundScore(s, id);
    const w = s.words[id];
    const voters = votersOf(s, id);
    const vetoes = (s.vetoes[id] ?? []).filter((v) => voters.includes(v));
    const canVeto = Boolean(w) && voters.includes(me(u));
    const mine = vetoes.includes(me(u));
    const chips = w
      ? [...w.w]
          .map((ch, i) => {
            const isJ = i === w.joker;
            return `<span class="ls-mini ${isJ ? 'joker' : ''}" style="--c:${i}">${chipSvg(ch, isJ ? ch : null)}</span>`;
          })
          .join('')
      : `<span class="muted ls-noword">${s.caught?.[id]?.length ? 'Kein Wort' : 'Keine Steine'}</span>`;
    const notes = [];
    if (r.gold) notes.push(`${nuggetIcon}<span>Goldstein: doppelt</span>`);
    if (r.struck) notes.push('<span>Zählt nicht.</span>');
    if (vetoes.length && !r.struck) notes.push(`<span>Einspruch von ${nameList(u, vetoes)}.</span>`);
    if (vetoes.length && r.struck) notes.push(`<span>Einspruch von ${nameList(u, vetoes)}.</span>`);
    const i = k++;
    return `<li class="ls-row ${r.struck ? 'struck' : ''} ${r.gold ? 'gold' : ''}" data-id="${esc(u, id)}" style="--pc:${color(u, id)};--i:${i}">
      <div class="ls-row-top">
        <span class="ls-row-name"><span class="marker" style="color:${color(u, id)}"></span><span class="ls-wn">${id === me(u) ? 'Du' : esc(u, game.name(id))}</span></span>
        <b class="ls-gain num" data-from="0" data-v="${r.total}">${r.total}</b>
        <span class="ls-sum num" data-from="${s.totals[id]}" data-v="${s.totals[id] + r.total}" aria-label="Gesamt">${s.totals[id] + r.total}</span>
      </div>
      <div class="ls-row-word">
        <span class="ls-chips">${chips}<i class="ls-strike" aria-hidden="true"></i></span>
        ${canVeto ? `<button class="ls-veto" data-action="einspruch" data-value="${esc(u, id)}" aria-pressed="${mine}">Gilt nicht</button>` : ''}
      </div>
      ${notes.length ? `<p class="ls-row-note">${notes.join(' ')}</p>` : ''}
    </li>`;
  };
  if (!s.teams) return ids(s).map(row).join('');
  return teams
    .map((t) => {
      const sum = t.reduce((a, id) => a + roundScore(s, id).total, 0);
      const tot = t.reduce((a, id) => a + s.totals[id] + roundScore(s, id).total, 0);
      return `<li class="ls-team"><p class="ls-team-head"><span>Team ${t.map((id) => (id === me(u) ? 'du' : esc(u, game.name(id)))).join(' und ')}</span><span class="num">+${sum}</span><span class="num">${tot}</span></p><ol>${t.map(row).join('')}</ol></li>`;
    })
    .join('');
}

function goldLine(u) {
  const { s, game } = u;
  if (s.gold === null) return '';
  const t = s.board.tiles[s.gold];
  const owners = ids(s).filter((id) => s.caught[id].includes(s.gold));
  let text;
  if (s.burned.includes(s.gold)) text = `Der Goldstein lag unter dem ${t.ch} und ist verbrannt.`;
  else if (!owners.length) text = `Der Goldstein lag unter dem ${t.ch}. Niemand hat ihn gefangen.`;
  else {
    const who = owners.includes(me(u)) && owners.length === 1 ? 'Du hast' : `${list(owners.map((id) => (id === me(u) ? 'du' : esc(u, game.name(id)))))} ${owners.length > 1 ? 'haben' : 'hat'}`;
    text = `Der Goldstein lag unter dem ${t.ch}. ${cap(who)} ihn gefangen.`;
  }
  return `<p class="ls-goldline">${nuggetIcon}<span>${text}</span></p>`;
}

function renderScore(u) {
  const { s, game } = u;
  const over = u.root.querySelector('.ls-over');
  const under = u.root.querySelector('.ls-under');
  const first = !u.entered;
  const animate = first && !game.reducedMotion && u.prevKey === `${s.round}:wort:${s.startAt}`;
  if (first) {
    showTiles(u, game.now());
    if (u.board && !u.board.el.classList.contains('open')) drawReveal(u, false);
    revealGold(u, animate);
    over.innerHTML = `<section class="ls-score ${animate ? 'enter' : ''}" aria-label="Wertung der Runde">
      ${s.round === s.rounds - 1 ? '<p class="ls-double">Letzte Runde: Alle Punkte zählen doppelt.</p>' : ''}
      ${goldLine(u)}
      <div class="ls-cols muted"><span>Runde ${word(s.round + 1)}</span><span>Punkte</span><span>Gesamt</span></div>
      <ol class="ls-rows"></ol>
    </section>`;
    under.innerHTML = '<div class="ls-next"></div>';
    scrollToGame(u);
  }
  const rows = over.querySelector('.ls-rows');
  const struckBefore = new Set([...rows.querySelectorAll('.ls-row.struck')].map((r) => r.dataset.id));
  const html = scoreRowsHtml(u);
  if (!first && shown.get(rows) !== html) over.querySelector('.ls-score').classList.remove('enter'); // Einspruch: nicht alles neu einblenden
  put(rows, html);
  // Neu durchgestrichen: Strich zieht sich ein
  if (!first && !game.reducedMotion) {
    for (const r of rows.querySelectorAll('.ls-row.struck')) if (!struckBefore.has(r.dataset.id)) r.classList.add('strike-in');
  }
  if (animate) countUp(u, rows);
  const mine = s.ready.includes(me(u));
  const waiting = ids(s).filter((id) => !s.ready.includes(id));
  if (first) under.querySelector('.ls-next').innerHTML = '<div class="row ls-next-row"></div><div class="ls-who-box"></div>';
  put(
    under.querySelector('.ls-next-row'),
    mine ? `<p class="status">Warte auf ${nameList(u, waiting)}.</p>` : `<button class="btn primary" data-action="weiter">${s.round === s.rounds - 1 ? 'Zum Ergebnis' : 'Nächste Runde'}</button>`,
  );
  put(under.querySelector('.ls-who-box'), whoHtml(u, s.ready, 'Bereit für die nächste Runde'));
}

// Punkte zählen hoch, Zeile für Zeile
function countUp(u, box) {
  const signal = u.stage.signal;
  for (const el of box.querySelectorAll('[data-v]')) {
    const row = el.closest('.ls-row');
    const i = Number(row.style.getPropertyValue('--i')) || 0;
    const to = Number(el.dataset.v);
    const from = Number(el.dataset.from) || 0;
    if (from === to) continue;
    el.textContent = String(from);
    const start = performance.now() + 500 + i * 110 + (el.classList.contains('ls-sum') ? 350 : 0);
    const step = (t) => {
      if (signal.aborted || !el.isConnected) return;
      const p = Math.min(1, Math.max(0, (t - start) / 420));
      el.textContent = String(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// Der Stein über dem Goldstein hebt sich
function revealGold(u, animate) {
  const b = u.board;
  const { s } = u;
  if (!b || s.gold === null) return;
  const at = tileEl(u, s.gold).closest('.ls-at');
  if (at.querySelector('.ls-gold')) return;
  at.querySelector('.ls-base').insertAdjacentHTML('beforeend', `<g class="ls-gold ${animate ? 'rise' : ''}"><g transform="scale(.9)">${NUGGET}${SPARK}</g></g>`);
  tileEl(u, s.gold).classList.add('lifted');
  b.el.classList.toggle('gold-anim', animate);
}

// --- Ende ---

function renderEnd(u) {
  const { s, game } = u;
  const over = u.root.querySelector('.ls-over');
  if (u.entered) return;
  const animate = !game.reducedMotion && Boolean(u.prevKey);
  const teams = teamsOf(s);
  const sums = teams.map((t) => t.reduce((a, id) => a + s.totals[id], 0));
  const order = [...teams.keys()].sort((a, b) => sums[b] - sums[a]);
  const winners = new Set(s.result.winners);
  const rows = order
    .map((ti, k) => {
      const t = teams[ti];
      const win = t.some((id) => winners.has(id));
      const per = Array.from({ length: s.rounds }, (_, r) => t.reduce((a, id) => a + (s.history[r]?.pts[id] ?? 0), 0));
      const names = t
        .map((id) => `<span class="ls-fn"><span class="marker" style="color:${color(u, id)}"></span><span class="ls-wn">${id === me(u) ? 'Du' : esc(u, game.name(id))}</span></span>`)
        .join('');
      return `<li class="ls-frow ${win ? 'win' : ''}" style="--i:${order.length - 1 - k};--pc:${color(u, t[0])}">
        <span class="ls-place num">${k + 1}</span>
        <span class="ls-fnames">${names}</span>
        <span class="ls-per">${per.map((p) => `<span class="num">${p}</span>`).join('')}</span>
        <b class="ls-ftot num" data-v="${sums[ti]}">${animate ? 0 : sums[ti]}</b>
        ${win ? '<svg class="ls-lasso" aria-hidden="true"></svg>' : ''}
      </li>`;
    })
    .join('');
  over.innerHTML = `<section class="ls-final ${animate ? 'enter' : ''}" style="--n:${order.length}" aria-label="Endstand">
    <div class="ls-fcols muted"><span></span><span>${s.teams ? 'Team' : 'Spieler'}</span><span class="ls-per">${Array.from({ length: s.rounds }, (_, r) => `<span>${r + 1}</span>`).join('')}</span><span>Gesamt</span></div>
    <ol class="ls-frows">${rows}</ol>
  </section>`;
  layLasso(u);
  if (animate) {
    const signal = u.stage.signal;
    for (const el of over.querySelectorAll('.ls-ftot')) {
      const i = Number(el.closest('.ls-frow').style.getPropertyValue('--i')) || 0;
      const to = Number(el.dataset.v);
      const start = performance.now() + 200 + i * 140;
      const step = (t) => {
        if (signal.aborted || !el.isConnected) return;
        const p = Math.min(1, Math.max(0, (t - start) / 520));
        el.textContent = String(Math.round(to * (1 - (1 - p) ** 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }
}

// Ein Seil um die Siegerzeile, in Pixeln der Zeile (nach dem Layout, und neu bei anderer Breite)
function layLasso(u) {
  const signal = u.stage.signal;
  const lay = () => {
    for (const svg of u.root.querySelectorAll('.ls-lasso')) {
      const row = svg.parentElement.getBoundingClientRect();
      const W = Math.round(row.width + 24);
      const H = Math.round(row.height + 12);
      if (!W || svg.dataset.w === String(W)) continue;
      svg.dataset.w = String(W);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // eckige Ellipse, die dem Inhalt nicht zu nahe kommt; der Knoten sitzt links oben
      const sq = (v) => Math.sign(v) * Math.abs(v) ** 0.45;
      const pts = Array.from({ length: 40 }, (_, i) => {
        const a = Math.PI * 1.18 + (i / 40) * Math.PI * 2;
        const wob = 1 + (hash(i, 3) - 0.5) * 0.03;
        return [Math.round(W / 2 + sq(Math.cos(a)) * (W / 2 - 5) * wob), Math.round(H / 2 + sq(Math.sin(a)) * (H / 2 - 4) * wob)];
      });
      svg.innerHTML = `<g class="ls-rope" style="--pc:${svg.parentElement.style.getPropertyValue('--pc')}">
        <path class="ls-r0" pathLength="1" d="${ropeD(pts, true)}"/><path class="ls-r1" pathLength="1" d="${ropeD(pts, true)}"/><path class="ls-r2" d="${ropeD(pts, true)}"/>${knotSvg(pts, 0.45)}</g>`;
    }
  };
  requestAnimationFrame(() => !signal.aborted && lay());
  window.addEventListener('resize', lay, { signal });
}

// Beim Wechsel der Phase das Spiel ins Bild holen
function scrollToGame(u) {
  const signal = u.stage.signal;
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    const top = u.root.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.35) window.scrollBy({ top: top - 8, behavior: u.game.reducedMotion ? 'auto' : 'smooth' });
  });
}

export const style = `
  .ls { display: flex; flex-direction: column; gap: 14px; }
  .ls[data-phase="ende"] .ls-head, .ls[data-phase="ende"] .ls-bar { display: none; }
  .ls-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 40px; }

  /* Runden: ein Kästchen pro Runde, die letzte zählt doppelt */
  .ls-rounds { display: flex; gap: 6px; }
  .ls-rd { position: relative; width: 28px; height: 30px; display: grid; place-items: center;
    border: 2px solid var(--hairline); border-radius: var(--radius); color: var(--muted); font-size: var(--t-md); line-height: 1; }
  .ls-rd.is-now { border-color: var(--ink); color: var(--ink); }
  .ls-rd.is-past { background: var(--ink); border-color: var(--ink); color: var(--paper); }
  .ls-rd b { position: absolute; top: -9px; right: -9px; padding: 1px 2px; background: var(--paper); color: var(--ink);
    font: 800 12px/1 var(--font-display); }
  .ls-rd.is-past b { color: var(--muted); }
  .ls-rounds.intro .ls-rd { animation: ls-in 320ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 70ms) backwards; }
  .ls-rd.fresh { animation: ls-pop 340ms cubic-bezier(.2,.8,.2,1); }

  .ls-clock { display: flex; align-items: baseline; gap: 8px; margin: 0; }
  .ls-phase { font-size: var(--t-sm); font-weight: 700; color: var(--muted); white-space: nowrap; }
  .ls-time { font-size: var(--t-xl); line-height: 1; min-width: 1.3em; text-align: right; }
  .ls-clock.low .ls-time { color: var(--bad); }
  .ls-bar { height: 4px; background: var(--hairline); margin-top: -8px; }
  .ls-bar i { display: block; height: 100%; background: var(--ink); transform-origin: 0 50%; transition: transform 200ms linear; }
  .ls-bar.low i { background: var(--bad); }

  /* Spielfeld */
  .ls-board { position: relative; width: 100%; max-width: 520px; margin: 0 auto; }
  .ls-field { display: block; width: 100%; height: auto; overflow: visible; }
  .ls-field.can-draw { touch-action: none; cursor: crosshair; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .ls-ground { fill: var(--paper); stroke: var(--ink); stroke-width: 3; }
  .ls-dots { stroke: var(--hairline); stroke-width: 7; stroke-linecap: round; }
  .ls-count { position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--t-4xl); pointer-events: none; }

  .ls-tile, .ls-gold, .ls-ash, .ls-flame > g, .ls-ember, .ls-knot { transform-box: fill-box; transform-origin: 50% 50%; }
  .ls-edge { fill: ${WOOD_EDGE}; stroke: ${INKC}; stroke-width: 2.6; }
  .ls-top { fill: ${WOOD}; stroke: ${INKC}; stroke-width: 2.6; }
  .ls-tint { fill: color-mix(in srgb, var(--pc, #000) 16%, transparent); opacity: 0; transition: opacity 160ms ease-out; }
  .ls-grain { fill: none; stroke: ${GRAIN}; stroke-width: 1.5; stroke-linecap: round; }
  .ls-shine { fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; opacity: .75; }
  .ls-ch { font: 800 52px var(--font-display); text-anchor: middle; fill: ${INKC}; }
  .ls-ch-j { fill: none; stroke: ${INKC}; stroke-width: 2.4; }
  .ls-ring { fill: none; stroke: var(--pc, #000); stroke-width: 6; opacity: 0; transition: opacity 160ms ease-out; }
  .ls-tile.in .ls-ring { opacity: .9; stroke-dasharray: 10 7; }
  .ls-tile.in .ls-tint, .ls-tile.own .ls-tint { opacity: 1; }
  .ls-tile.own .ls-ring { opacity: 1; stroke-dasharray: none; }
  .ls-tile.own .ls-ch { fill: var(--pc); }
  .ls-tile.lifted { transform: translate(0, -34px) rotate(-9deg); opacity: .3; }
  .ls-tile.burn { opacity: 0; }
  .ls-board.wait .ls-tile { opacity: 0; }

  /* Auftakt: Steine fallen gestaffelt ein */
  .ls-board.drop .ls-tile { animation: ls-drop 420ms cubic-bezier(.2,.8,.2,1) calc(var(--k) * var(--step)) backwards; }
  @keyframes ls-drop { from { opacity: 0; transform: translateY(-36px) scale(1.18); } }

  /* Seil: Tuschekontur, Farbe des Spielers, helle Drehung */
  .ls-rope .ls-r0 { fill: none; stroke: ${INKC}; stroke-width: 15; stroke-linecap: round; stroke-linejoin: round; }
  .ls-rope .ls-r1 { fill: none; stroke: var(--pc); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
  .ls-rope .ls-r2 { fill: none; stroke: color-mix(in srgb, var(--pc) 50%, white); stroke-width: 10; stroke-dasharray: 2.5 9; stroke-linejoin: round; }
  .ls-fill { fill: color-mix(in srgb, var(--pc) 9%, transparent); }
  .ls-knot-b { fill: var(--pc); stroke: ${INKC}; stroke-width: 2.6; }
  .ls-knot-w { fill: none; stroke: ${INKC}; stroke-width: 1.6; }
  .ls-fray { fill: none; stroke: ${INKC}; stroke-width: 3; stroke-linecap: round; }
  .ls-rope.live .ls-close { stroke: var(--pc); stroke-width: 5; stroke-dasharray: 10 12; stroke-linecap: round; opacity: .5; }
  .ls-rope.live.taut .ls-close { stroke-dasharray: none; opacity: .9; stroke-width: 6; }
  .ls-rope.live .ls-fill { opacity: .7; }
  .ls-anchor { fill: var(--pc); stroke: ${INKC}; stroke-width: 3; }
  .ls-rope.snap .ls-fill { animation: ls-fade 260ms ease-out; }
  .ls-rope.snap .ls-knot { animation: ls-pop 300ms cubic-bezier(.2,.8,.2,1); }

  /* Aufdecken: Seile ziehen sich ein, dann verbrennen doppelt gefangene Steine */
  .ls-rope.draw > .ls-r0, .ls-rope.draw > .ls-r1 { stroke-dasharray: 1; animation: ls-draw 820ms cubic-bezier(.3,.7,.2,1) backwards; }
  .ls-rope.draw > .ls-r2, .ls-rope.draw .ls-knot { animation: ls-fade 300ms ease-out 760ms backwards; }
  .ls-rope.draw > .ls-fill { animation: ls-fade 420ms ease-out 820ms backwards; }
  .ls-board.reveal .ls-tile.own .ls-ring, .ls-board.reveal .ls-tile.own .ls-tint { animation: ls-fade 260ms ease-out 1000ms backwards; }
  .ls-board.reveal .ls-tile.own { animation: ls-own 360ms cubic-bezier(.2,.8,.2,1) 1000ms; }
  @keyframes ls-own { 40% { transform: scale(1.12); } }
  .ls-burnt { opacity: 1; }
  .ls-board.reveal .ls-tile.burn .ls-ring { stroke: ${EMBER}; stroke-dasharray: none; animation: ls-glow 700ms ease-out calc(1100ms + var(--b) * 90ms); }
  @keyframes ls-glow { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
  .ls-board.reveal .ls-burnt { animation: ls-fade 300ms ease-out calc(1250ms + var(--b) * 90ms) backwards; }
  .ls-board.reveal .ls-tile.burn { animation: ls-crumble 440ms cubic-bezier(.6,0,.2,1) calc(1850ms + var(--b) * 90ms) backwards; }
  @keyframes ls-crumble { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(.5) rotate(10deg); } }
  .ls-board.reveal .ls-ash { animation: ls-ash 420ms ease-out calc(2050ms + var(--b) * 90ms) backwards; }
  @keyframes ls-ash { from { opacity: 0; transform: scale(.5); } }
  .ls-flame > g { transform-origin: 50% 100%; opacity: 0;
    animation: ls-flame 760ms cubic-bezier(.2,.8,.2,1) calc(1200ms + var(--b) * 90ms + var(--j) * 90ms) both; }
  @keyframes ls-flame {
    0% { opacity: 0; transform: translateY(12px) scale(.3); }
    30% { opacity: 1; transform: translateY(-4px) scale(1); }
    100% { opacity: 0; transform: translateY(-50px) scale(.35); }
  }
  .ls-ember { fill: ${EMBER}; stroke: ${INKC}; stroke-width: 1.2; opacity: 0;
    animation: ls-ember 700ms cubic-bezier(.2,.8,.2,1) calc(1500ms + var(--b) * 90ms + var(--j) * 30ms) both; }
  @keyframes ls-ember { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--ex), var(--ey)) scale(.4) rotate(90deg); } }

  /* Wertung: der Stein hebt sich vom Goldstein */
  .ls-board.gold-anim .ls-tile.lifted { animation: ls-lift 620ms cubic-bezier(.6,0,.2,1) 250ms backwards; }
  @keyframes ls-lift { from { transform: none; opacity: 1; } }
  .ls-board.gold-anim .ls-gold { animation: ls-nugget 460ms cubic-bezier(.2,.8,.2,1) 560ms backwards; }
  @keyframes ls-nugget { from { opacity: 0; transform: scale(.4); } }
  .ls-board.gold-anim .ls-spark { transform-box: fill-box; transform-origin: 50% 50%; animation: ls-spark 600ms cubic-bezier(.2,.8,.2,1) 900ms backwards; }
  @keyframes ls-spark { from { opacity: 0; transform: scale(.2) rotate(-60deg); } }

  /* Seilanzeige */
  .ls-ink { display: flex; align-items: center; gap: 10px; }
  .ls-coil { width: 32px; height: 32px; flex: none; }
  .ls-coil-c { stroke: var(--pc); }
  .ls-ink-track { flex: 1; height: 12px; border: 2px solid var(--ink); border-radius: var(--radius); overflow: hidden; }
  .ls-ink-track i { display: block; height: 100%; background: var(--pc); transform-origin: 0 50%; transition: transform 90ms linear; }
  .ls-ink-label { font-size: var(--t-sm); font-weight: 700; white-space: nowrap; }
  .ls-ink-end, .ls-ink.empty .ls-ink-ok { display: none; }
  .ls-ink.empty .ls-ink-end { display: inline; color: var(--bad); }
  .ls-bonus { font-size: var(--t-sm); margin-top: -6px; }
  .ls-note { min-height: 3em; }
  .ls-actions { min-height: 48px; }

  /* Wer ist fertig? */
  .ls-who { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: var(--t-sm); color: var(--muted); }
  .ls-who li { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .ls-who li.is-done { color: var(--ink); }
  .ls-wn { min-width: 0; max-width: 9em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ls-check { width: 16px; height: 16px; flex: none; }
  .ls-check path { fill: none; stroke: var(--ok); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
  .ls-who li.fresh .ls-check path { stroke-dasharray: 1; animation: ls-draw 300ms cubic-bezier(.3,.7,.2,1) backwards; }

  /* Wort legen */
  .ls-build { display: flex; flex-direction: column; gap: 10px; }
  .ls-word-wrap { display: flex; align-items: flex-end; gap: 12px; border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
  .ls-word { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 3px; min-height: 48px; align-items: flex-end; }
  .ls-word-empty { color: var(--muted); font-size: var(--t-sm); padding-bottom: 12px; }
  .ls-worth { font-size: var(--t-lg); white-space: nowrap; line-height: 1; padding-bottom: 6px; }
  .ls-rack { display: flex; flex-wrap: wrap; gap: 6px; min-height: 48px; }
  .ls-chip { appearance: none; -webkit-appearance: none; border: 0; padding: 0; background: none; width: 42px; height: 44px;
    cursor: pointer; transition: transform 140ms cubic-bezier(.2,.8,.2,1); }
  .ls-chip svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .ls-chip:hover:not(:disabled) { transform: translateY(-3px); }
  .ls-chip:active:not(:disabled) { transform: scale(.96); }
  .ls-chip:disabled { cursor: default; }
  .ls-picker { animation: ls-in 200ms cubic-bezier(.2,.8,.2,1); }
  .ls-letters { display: grid; grid-template-columns: repeat(auto-fill, minmax(33px, 1fr)); gap: 4px; }
  .ls-pick { appearance: none; min-height: 38px; padding: 0; border: 2px solid var(--ink); border-radius: var(--radius); background: var(--paper);
    color: var(--ink); font: 800 var(--t-md)/1 var(--font-display); cursor: pointer; }
  .ls-pick:hover { background: var(--wash); }
  .ls-pick:active { transform: scale(.96); }
  .ls-pick[aria-pressed="true"] { background: var(--ink); color: var(--paper); }

  /* Wertung */
  .ls-score { display: flex; flex-direction: column; gap: 10px; }
  .ls-double { font-weight: 700; }
  .ls-goldline { display: flex; align-items: center; gap: 10px; }
  .ls-nug { width: 30px; height: 28px; flex: none; overflow: visible; }
  .ls-cols, .ls-row-top, .ls-team-head { display: grid; grid-template-columns: minmax(0, 1fr) 3.4em 3.4em; align-items: baseline; gap: 6px; }
  .ls-cols { font-size: var(--t-sm); border-bottom: 2px solid var(--ink); padding-bottom: 4px; }
  .ls-cols span:not(:first-child) { text-align: right; }
  .ls-row { padding: 10px 0; border-bottom: 1px solid var(--hairline); }
  .ls-row-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 700; }
  .ls-gain { font-size: var(--t-xl); line-height: 1; text-align: right; color: var(--pc); }
  .ls-sum { font-size: var(--t-lg); line-height: 1; text-align: right; }
  .ls-row-word { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
  .ls-chips { position: relative; display: inline-flex; flex-wrap: wrap; gap: 2px; align-items: center; min-height: 30px; }
  .ls-mini { display: block; width: 27px; height: 29px; }
  .ls-mini svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .ls-noword { font-size: var(--t-sm); }
  .ls-strike { position: absolute; left: -4px; right: -4px; top: 46%; height: 3px; background: var(--bad); transform: scaleX(0); transform-origin: 0 50%; }
  .ls-row.struck .ls-strike { transform: none; }
  .ls-row.struck .ls-mini { opacity: .45; }
  .ls-row.struck .ls-gain { color: var(--muted); }
  .ls-row.strike-in .ls-strike { animation: ls-strike 320ms cubic-bezier(.6,0,.2,1); }
  @keyframes ls-strike { from { transform: scaleX(0); } }
  .ls-veto { appearance: none; min-height: 34px; padding: 4px 10px; border: 2px solid var(--ink); border-radius: var(--radius);
    background: var(--paper); color: var(--ink); font: 700 var(--t-sm)/1.2 var(--font-body); cursor: pointer; }
  .ls-veto:hover { background: var(--wash); }
  .ls-veto:active { transform: scale(.96); }
  .ls-veto[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
  .ls-row-note { display: flex; align-items: center; gap: 4px 8px; flex-wrap: wrap; margin-top: 4px; font-size: var(--t-sm); color: var(--muted); }
  .ls-row-note .ls-nug { width: 22px; height: 20px; }
  .ls-team { border-bottom: 2px solid var(--ink); }
  .ls-team-head { padding-top: 10px; font-weight: 700; }
  .ls-team-head span:first-child { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ls-team-head .num { text-align: right; font-size: var(--t-md); }
  .ls-team ol .ls-row { padding-left: 12px; }
  .ls-team ol .ls-row:last-child { border-bottom: 0; }
  .ls-score.enter .ls-row { animation: ls-in 360ms cubic-bezier(.2,.8,.2,1) calc(220ms + var(--i) * 110ms) backwards; }
  .ls-score.enter .ls-mini { animation: ls-chip 260ms cubic-bezier(.2,.8,.2,1) calc(300ms + var(--i) * 110ms + var(--c) * 40ms) backwards; }
  @keyframes ls-chip { from { opacity: 0; transform: translateY(-8px) rotate(-8deg); } }
  .ls-score.enter .ls-row.gold .ls-row-note .ls-nug { animation: ls-pop 380ms cubic-bezier(.2,.8,.2,1) calc(950ms + var(--i) * 110ms) backwards; }
  .ls-score.enter .ls-goldline .ls-nug { animation: ls-pop 380ms cubic-bezier(.2,.8,.2,1) 300ms backwards; }

  /* Start */
  .ls-intro { display: flex; flex-direction: column; gap: 14px; }
  .ls-scene { display: block; width: min(100%, 270px); height: auto; margin: 0 auto; overflow: visible; }
  .ls-scene .ls-r0 { stroke-width: 9; }
  .ls-scene .ls-r1, .ls-scene .ls-r2 { stroke-width: 6; }
  .ls-scene .ls-r2 { stroke-dasharray: 1.5 6; }
  .ls-intro.enter .ls-scene .ls-rope > .ls-r0, .ls-intro.enter .ls-scene .ls-rope > .ls-r1 { stroke-dasharray: 1; animation: ls-draw 900ms cubic-bezier(.6,0,.2,1) 350ms backwards; }
  .ls-intro.enter .ls-scene .ls-rope > .ls-r2, .ls-intro.enter .ls-scene .ls-knot { animation: ls-fade 300ms ease-out 1150ms backwards; }
  .ls-rules { display: grid; gap: 8px; counter-reset: ls; }
  .ls-rules li { position: relative; padding-left: 2em; counter-increment: ls; }
  .ls-rules li::before { content: counter(ls); position: absolute; left: 0; top: -.1em; font: 800 var(--t-lg)/1 var(--font-display); }
  .ls-more { font-size: var(--t-sm); }
  .ls-teams { font-weight: 700; }
  .ls-ready-box { display: flex; flex-direction: column; gap: 12px; }

  /* Ende: Rangliste, ein Seil legt sich um den Sieger */
  .ls-final { display: flex; flex-direction: column; }
  .ls-fcols, .ls-frow { display: grid; grid-template-columns: 1.4em minmax(0, 1fr) auto 2.6em; align-items: center; gap: 10px; }
  .ls-fcols { font-size: var(--t-sm); border-bottom: 2px solid var(--ink); padding: 0 6px 4px; }
  .ls-fcols > span:last-child { text-align: right; }
  .ls-frow { position: relative; padding: 14px 6px; border-bottom: 1px solid var(--hairline); }
  .ls-place { font-size: var(--t-lg); line-height: 1; }
  .ls-fnames { display: flex; flex-direction: column; min-width: 0; font-weight: 700; }
  .ls-fn { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ls-fn .ls-wn { max-width: none; }
  .ls-per { display: grid; grid-template-columns: repeat(5, 1.5em); text-align: center; font-size: var(--t-sm); color: var(--muted); }
  .ls-ftot { font-size: var(--t-2xl); line-height: 1; text-align: right; }
  .ls-frow.win .ls-ftot { color: var(--pc); }
  .ls-frow:not(.win) { opacity: .62; }
  .ls-lasso { position: absolute; left: -12px; top: -6px; width: calc(100% + 24px); height: calc(100% + 12px); overflow: visible; pointer-events: none; }
  .ls-lasso .ls-r0 { stroke-width: 7; }
  .ls-lasso .ls-r1, .ls-lasso .ls-r2 { stroke-width: 4; }
  .ls-lasso .ls-r2 { stroke-dasharray: 1.2 4.5; }
  .ls-final.enter .ls-frow { animation: ls-in 420ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 140ms) backwards; }
  .ls-final.enter .ls-frow:not(.win) { animation: ls-in 420ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 140ms) backwards, ls-dim 500ms ease-out calc(var(--n) * 140ms + 900ms) backwards; }
  @keyframes ls-dim { from { opacity: 1; } }
  .ls-final.enter .ls-lasso .ls-rope > .ls-r0, .ls-final.enter .ls-lasso .ls-rope > .ls-r1 { stroke-dasharray: 1; animation: ls-draw 760ms cubic-bezier(.6,0,.2,1) calc(var(--n) * 140ms + 550ms) backwards; }
  .ls-final.enter .ls-lasso .ls-rope > .ls-r2, .ls-final.enter .ls-lasso .ls-knot { animation: ls-fade 300ms ease-out calc(var(--n) * 140ms + 1250ms) backwards; }

  @keyframes ls-in { from { opacity: 0; transform: translateY(8px); } }
  @keyframes ls-fade { from { opacity: 0; } }
  @keyframes ls-pop { from { opacity: 0; transform: scale(.4); } }
  @keyframes ls-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }

  @media (prefers-reduced-motion: reduce) {
    .ls *, .ls *::before { animation: none !important; transition: none !important; }
  }
`;
