// Mensch ärgere dich nicht: würfeln, ziehen, schlagen, bis zu sechst.
//
// Brett: zu zweit bis viert das bekannte Kreuz mit vierzig Feldern, zu fünft und sechst ein Stern mit
// sechs Armen und sechzig Feldern. Beide entstehen aus derselben Rechnung (geometry): Jeder Arm hat eine
// Bahn hinaus, eine Spitze, eine Bahn zurück und ein Verbindungsfeld zum nächsten Arm, in der Mitte das Haus.
// Jeder sieht das Brett von seinem Platz aus (eigener Arm unten), der Bildschirm immer gleich.
//
// Regeln nach Schmidt Spiele: Mit einer Sechs heraus (Pflicht, solange das Startfeld frei ist), Startfeld
// räumen, nach einer Sechs noch einmal, drei Versuche ohne Figur auf der Laufbahn, im Haus nicht überspringen.
// Schlagzwang als Einstellung. Gibt es nur einen Zug, zieht das Spiel selbst.
//
// Sonderfelder (Einstellung „Mit Sonderfeldern“): in jedem Arm dieselben vier, so trifft jede Person sie in
// derselben Reihenfolge. Stern (noch einmal würfeln), Tausch (Platz tauschen mit der nächsten fremden Figur bis
// sechs Felder voraus), Burg (sicher, besetzt kommt niemand hinein), Rutsche (drei Felder weiter, schlägt alle
// fremden Figuren auf dem Weg). Sie wirken nur, wenn eine Figur mit dem Wurf darauf landet (outcome).
//
// Motion: Der Würfel rollt über den Tisch, Figuren laufen Feld für Feld, geschlagene fliegen zurück auf ihre
// B-Felder, beim Start baut sich das Brett auf, am Ende jubeln die Figuren im Haus. Sonderfelder: Funken am
// Stern, die Figur rutscht und zieht eine Spur, zwei Figuren springen übereinander, vor der Burg wächst eine Mauer.

export const meta = {
  name: 'Mensch ärgere dich nicht',
  description: 'Würfeln, ziehen, schlagen. Wer zuerst alle Figuren im Haus hat, gewinnt.',
  players: [2, 6],
  options: [
    {
      id: 'felder',
      label: 'Brett',
      choices: [
        { value: 'klassisch', label: 'Klassisch' },
        { value: 'sonder', label: 'Mit Sonderfeldern' },
      ],
    },
    {
      id: 'figuren',
      label: 'Figuren',
      choices: [
        { value: 4, label: 'Vier pro Person' },
        { value: 3, label: 'Drei pro Person' },
        { value: 2, label: 'Zwei pro Person' },
      ],
    },
    {
      id: 'schlagen',
      label: 'Schlagen',
      choices: [
        { value: 'frei', label: 'Freiwillig' },
        { value: 'pflicht', label: 'Schlagzwang' },
      ],
    },
  ],
};

const SPAN = 10; // Felder der Laufbahn pro Arm
const HOUSE = 4; // Felder im Haus
const YARD = -1; // Figur steht auf ihrem B-Feld
const TRIES = 3; // Versuche für eine Sechs ohne Figur auf der Laufbahn
// Sonderfelder nach Platz im Arm: 0 … 3 Bahn hinaus, 4 Spitze, 5 Startfeld, 6 … 8 Bahn zurück, 9 Ecke.
// Der Tausch sucht nur bis vor das nächste Startfeld (8 + 6 = 14), so muss keine Figur hinter ihr eigenes zurück.
const SPECIAL = { 6: 'stern', 8: 'tausch', 9: 'burg', 0: 'rutsche' };
const SLIDE = 3; // die Rutsche führt so viele Felder weiter
const REACH = 6; // so weit voraus sucht der Tausch

const ids = (s) => s.players.map((p) => p.id);
const nextAfter = (s, id) => ids(s)[(ids(s).indexOf(id) + 1) % s.players.length];
const nameOf = (s, id) => s.players.find((p) => p.id === id)?.name ?? '?';
const trackLen = (s) => s.arms * SPAN;
// Zu zweit sitzt man sich gegenüber, sonst reihum
const armsFor = (n) => (n <= 4 ? 4 : 6);
const seatsFor = (n) => (n === 2 ? [0, 2] : Array.from({ length: n }, (_, i) => i));

// Positionen sind relativ zum eigenen Startfeld: YARD, 0 … L-1 Laufbahn, L … L+3 Haus.
// Feld der Laufbahn (absolut): Das Startfeld ist das sechste Feld des eigenen Arms.
const absOf = (s, id, rel) => (s.seat[id] * SPAN + 5 + rel) % trackLen(s);
const relOf = (s, id, abs) => (abs - s.seat[id] * SPAN - 5 + 2 * trackLen(s)) % trackLen(s);
const onTrack = (s, rel) => rel >= 0 && rel < trackLen(s);
const special = (s, abs) => (s.felder === 'sonder' ? SPECIAL[abs % SPAN] ?? null : null);

export function setup(players, options = {}) {
  const n = players.length;
  const figures = [2, 3, 4].includes(options.figuren) ? options.figuren : 4;
  const seats = seatsFor(n);
  return {
    players,
    arms: armsFor(n),
    seat: Object.fromEntries(players.map((p, i) => [p.id, seats[i]])),
    figures,
    rule: options.schlagen === 'pflicht' ? 'pflicht' : 'frei',
    felder: options.felder === 'sonder' ? 'sonder' : 'klassisch',
    pos: Object.fromEntries(players.map((p) => [p.id, Array(figures).fill(YARD)])),
    turn: players[Math.floor(Math.random() * n)].id,
    phase: 'wuerfeln', // wuerfeln → (ziehen) → wuerfeln … → ende
    roll: null,
    tries: 0, // Fehlversuche in diesem Zug (nur ohne Figur auf der Laufbahn)
    seq: 0, // Zahl der Würfe; schützt vor doppelt gesendeten Zügen
    last: null, // was zuletzt passiert ist: { seq, by, roll, kind, hit, hits, again, left, piece, from, land, end, fx, swap }
  };
}

export function action(s, { player, type, data }) {
  if (s.result) return;
  if (!s.pos[player]) throw new Error('Du spielst nicht mit.');
  const at = Number(data?.at);
  if (type === 'wuerfeln') {
    if (at !== s.seq) return; // doppelt getippt
    if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);
    if (s.phase !== 'wuerfeln') throw new Error('Zieh erst eine Figur.');
    roll(s, player, 1 + Math.floor(Math.random() * 6));
    return;
  }
  if (type === 'ziehen') {
    if (at !== s.seq || s.phase !== 'ziehen') return;
    if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);
    const piece = Number(data?.piece);
    const list = moves(s, player, s.roll);
    // Aus den B-Feldern ist jede wartende Figur gleich gut
    const m =
      list.find((x) => x.piece === piece) ??
      (s.pos[player][piece] === YARD ? list.find((x) => x.from === YARD) : null);
    if (!m) throw new Error('Diese Figur kann nicht ziehen.');
    move(s, player, { ...m, piece: s.pos[player][piece] === YARD ? piece : m.piece });
  }
}

export function waitingFor(s) {
  return s.result ? [] : [s.turn];
}

// Wer geschlagen wurde, erfährt es; wer jetzt dran ist, bekommt „Du bist dran“.
export function notices(s, before, player) {
  if (s.result || !before?.pos) return [];
  const out = new Map();
  for (const p of s.players) {
    if (p.id === player) continue;
    if (before.pos[p.id]?.some((q, i) => q >= 0 && s.pos[p.id][i] === YARD)) {
      out.set(p.id, `${nameOf(s, player)} hat dich geschlagen.`);
    } else if (s.last?.swap?.id === p.id && s.last.seq === s.seq && s.last.seq !== before.last?.seq) {
      out.set(p.id, `${nameOf(s, s.last.by)} hat mit dir getauscht.`);
    }
  }
  if (s.turn !== before.turn && s.turn !== player) out.set(s.turn, `${out.get(s.turn) ?? ''} Du bist dran.`.trim());
  return [...out].map(([to, text]) => ({ to, text }));
}

// Punkte für die Tafel des Bildschirms: Figuren im Haus
export function points(s) {
  const L = trackLen(s);
  return Object.fromEntries(s.players.map((p) => [p.id, s.pos[p.id].filter((q) => q >= L).length]));
}

// Hier ist nichts geheim.
export function screen(s) {
  return s;
}

// --- Regeln ---

// Fremde Figur auf einem Feld der Laufbahn
function hitAt(s, id, abs) {
  for (const p of s.players) {
    if (p.id === id) continue;
    const i = s.pos[p.id].findIndex((q) => onTrack(s, q) && absOf(s, p.id, q) === abs);
    if (i >= 0) return { id: p.id, piece: i };
  }
  return null;
}

// Was passiert, wenn eine Figur mit dem Wurf auf `to` landet: wen sie schlägt, wo sie am Ende steht, welches
// Sonderfeld wirkt und mit wem sie tauscht. Läuft vor dem Zug (Liste der Züge) und beim Zug selbst.
function outcome(s, id, piece, to) {
  const res = { end: to, fx: null, hits: [], swap: null };
  if (!onTrack(s, to)) return res;
  const abs = absOf(s, id, to);
  const hit = hitAt(s, id, abs);
  if (hit) res.hits.push(hit);
  const kind = special(s, abs);
  if (kind === 'rutsche') {
    // Steht unten eine eigene Figur, rutscht sie nicht. Eigene Figuren auf dem Weg werden übersprungen.
    if (s.pos[id].some((q, i) => i !== piece && q === to + SLIDE)) return res;
    res.fx = 'rutsche';
    res.end = to + SLIDE;
    for (let r = to + 1; r <= res.end; r++) {
      const h = hitAt(s, id, absOf(s, id, r));
      if (h) res.hits.push(h);
    }
  } else if (kind === 'tausch') {
    // Die nächste fremde Figur voraus, nicht auf einer Burg und höchstens bis vor das eigene Haus
    for (let r = to + 1; r <= Math.min(to + REACH, trackLen(s) - 1); r++) {
      const at = absOf(s, id, r);
      const h = special(s, at) === 'burg' ? null : hitAt(s, id, at);
      if (!h) continue;
      res.fx = 'tausch';
      res.end = r;
      res.swap = { ...h, from: s.pos[h.id][h.piece], to: relOf(s, h.id, abs) };
      break;
    }
  } else if (kind) res.fx = kind;
  return res;
}

// Alle erlaubten Züge mit diesem Wurf, nach den Vorrangregeln gefiltert.
function moves(s, id, r) {
  const L = trackLen(s);
  const mine = s.pos[id];
  const list = [];
  let entered = false;
  mine.forEach((p, i) => {
    if (p === YARD) {
      if (r !== 6 || entered || mine.includes(0)) return;
      entered = true; // alle wartenden Figuren ziehen gleich
      list.push({ piece: i, from: YARD, to: 0, ...outcome(s, id, i, 0) });
      return;
    }
    const t = p + r;
    if (t >= L + HOUSE) return;
    if (t >= L) {
      // ins Haus oder im Haus weiter: nur mit passender Zahl, ohne eigene Figuren zu überspringen
      for (let h = Math.max(p + 1, L); h <= t; h++) if (mine.includes(h)) return;
      list.push({ piece: i, from: p, to: t, ...outcome(s, id, i, t) });
      return;
    }
    if (mine.includes(t)) return; // eigene Figur: überspringen ja, landen nein
    if (special(s, absOf(s, id, t)) === 'burg' && hitAt(s, id, absOf(s, id, t))) return; // besetzte Burg
    list.push({ piece: i, from: p, to: t, ...outcome(s, id, i, t) });
  });
  // Eine Sechs bringt eine Figur heraus, solange eine wartet und das Startfeld frei ist.
  if (r === 6 && list.some((m) => m.from === YARD)) return list.filter((m) => m.from === YARD);
  // Das Startfeld wird geräumt, solange noch Figuren warten.
  if (mine.includes(YARD) && list.some((m) => m.from === 0)) return list.filter((m) => m.from === 0);
  if (s.rule === 'pflicht' && list.some((m) => m.hits.length)) return list.filter((m) => m.hits.length);
  return list;
}

function roll(s, id, r) {
  s.seq += 1;
  s.roll = r;
  const list = moves(s, id, r);
  if (!list.length) {
    // Ohne Figur auf der Laufbahn gibt es drei Versuche für eine Sechs.
    const tries = s.pos[id].some((q) => onTrack(s, q)) ? TRIES : s.tries + 1;
    s.last = { seq: s.seq, by: id, roll: r, kind: 'nichts', hit: null, again: false, left: TRIES - tries };
    if (tries < TRIES) {
      s.tries = tries;
      s.phase = 'wuerfeln';
    } else pass(s, id);
    return;
  }
  if (list.length === 1) {
    move(s, id, list[0]);
    return;
  }
  s.phase = 'ziehen';
}

function move(s, id, m) {
  const L = trackLen(s);
  const o = outcome(s, id, m.piece, m.to);
  for (const h of o.hits) s.pos[h.id][h.piece] = YARD;
  if (o.swap) s.pos[o.swap.id][o.swap.piece] = o.swap.to;
  s.pos[id][m.piece] = o.end;
  const again = s.roll === 6 || o.fx === 'stern';
  const kind = m.from === YARD ? 'raus' : m.from >= L ? 'vor' : m.to >= L ? 'haus' : 'zug';
  s.last = {
    seq: s.seq, by: id, roll: s.roll, kind, hit: o.hits[0]?.id ?? null, hits: o.hits.map((h) => h.id), again, left: 0,
    piece: m.piece, from: m.from, land: m.to, end: o.end, fx: o.fx,
    swap: o.swap && { id: o.swap.id, piece: o.swap.piece, from: o.swap.from, to: o.swap.to },
  };
  s.tries = 0;
  if (s.pos[id].every((q) => q >= L)) {
    s.phase = 'ende';
    const name = nameOf(s, id);
    s.result = {
      winners: [id],
      text: s.players.length === 2 ? `${name} gewinnt.` : `${name} hat zuerst alle Figuren im Haus.`,
    };
    return;
  }
  if (again) s.phase = 'wuerfeln';
  else pass(s, id);
}

function pass(s, id) {
  s.turn = nextAfter(s, id);
  s.phase = 'wuerfeln';
  s.tries = 0;
}

// --- Brett ---

// Feldmittelpunkte in Feldabständen, Mitte des Bretts bei 0/0, y nach unten. Arm 0 zeigt nach unten,
// die weiteren folgen im Uhrzeigersinn (so laufen auch die Figuren).
const geoCache = {};
function geometry(arms) {
  if (geoCache[arms]) return geoCache[arms];
  const a = arms === 4 ? 2 : 3.5; // Abstand der Bahnen von der Mitte: beim Stern weiter, sonst stoßen die Arme an
  const step = 360 / arms;
  const rad = (d) => (d * Math.PI) / 180;
  const round = (p) => p.map((v) => Math.round(v * 1e4) / 1e4 + 0);
  // u entlang des Arms nach außen, o quer dazu (zur Bahn hinaus)
  const at = (ang, u, o) => round([u * Math.cos(rad(ang)) + o * Math.sin(rad(ang)), u * Math.sin(rad(ang)) - o * Math.cos(rad(ang))]);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const track = [];
  const house = [];
  const yard = [];
  for (let k = 0; k < arms; k++) {
    const ang = 90 + k * step;
    for (let i = 0; i < 4; i++) track.push(at(ang, a + i, 1));
    track.push(at(ang, a + 3, 0));
    for (let i = 0; i < 4; i++) track.push(at(ang, a + 3 - i, -1));
    // Verbindungsfeld zum nächsten Arm auf der Winkelhalbierenden, möglichst ein Feld von beiden entfernt
    const p = at(ang, a, -1);
    const b = [Math.cos(rad(ang + step / 2)), Math.sin(rad(ang + step / 2))];
    const pb = p[0] * b[0] + p[1] * b[1];
    const disc = pb * pb - (p[0] ** 2 + p[1] ** 2) + 1;
    const r = disc >= 0 ? pb - Math.sqrt(disc) : pb;
    track.push(round([r * b[0], r * b[1]]));
    house.push(Array.from({ length: HOUSE }, (_, h) => at(ang, a + 2 - h, 0)));
    // B-Felder zwei mal zwei zwischen diesem und dem nächsten Arm, die erste nah am Startfeld
    const start = at(ang, a + 3, -1);
    const c = arms === 4 ? [4.5 * Math.SQRT2 * b[0], 4.5 * Math.SQRT2 * b[1]] : [6.05 * b[0], 6.05 * b[1]];
    const ax = arms === 4 ? [at(ang, 1, 0), at(ang, 0, 1)] : [b, [-b[1], b[0]]];
    const cells = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([i, j]) =>
      round([c[0] + i * ax[0][0] + j * ax[1][0], c[1] + i * ax[0][1] + j * ax[1][1]]),
    );
    cells.sort((m, n) => dist(m, start) - dist(n, start));
    yard.push(cells);
  }
  return (geoCache[arms] = { arms, L: arms * SPAN, track, house, yard });
}

// Wo steht eine Figur (relativ zu ihrem Startfeld) auf dem Brett?
function spot(geo, arm, piece, rel) {
  if (rel === YARD) return geo.yard[arm][piece];
  if (rel >= geo.L) return geo.house[arm][rel - geo.L];
  return geo.track[(arm * SPAN + 5 + rel) % geo.L];
}
// Name des Feldes für Hervorhebungen (Weg, Ziel)
function fieldKey(geo, arm, piece, rel) {
  if (rel === YARD) return `y${arm}-${piece}`;
  if (rel >= geo.L) return `h${arm}-${rel - geo.L}`;
  return `t${(arm * SPAN + 5 + rel) % geo.L}`;
}

// --- Anzeige (nur im Browser) ---

const NOUN = ['Null', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'];
const WORD = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];

// Würfel: Lage der Seiten im Würfel und Drehung, damit eine Seite oben liegt (wie in qwixx.js)
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE = { 1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const DIE_MS = 760; // so lange rollt der Würfel, danach laufen die Figuren
const FIELD_R = 0.4;

// Spielfigur von der Seite: Kugelkopf, Kragen, Glockenkörper, Fuß mit Kante. Farbe über --pc.
const PAWN = `<svg class="mae-pawn" viewBox="0 0 40 56" aria-hidden="true">
  <path class="b k" d="M6 44.5 L6 47.2 A14 4.8 0 0 0 34 47.2 L34 44.5"/>
  <ellipse class="b k" cx="20" cy="44.5" rx="14" ry="4.8"/>
  <path class="d" d="M24 49.6 A14 4.8 0 0 0 33 46.8 L33 45.6 A14 4.8 0 0 1 24 48.6 Z"/>
  <path class="b k" d="M16.4 21.5 C15.6 30, 9 35, 8.6 43.4 Q20 49.4, 31.4 43.4 C31 35, 24.4 30, 23.6 21.5 Z"/>
  <path class="d" d="M22 23 C23 31, 28.8 35, 29.6 43 Q26.4 45.4, 22.6 45.9 C25 39, 22.6 30, 22 23 Z"/>
  <path class="l" d="M17.3 24.5 C16.5 31, 12.2 35, 11.3 41.4 L13.2 42.4 C14 36.4, 18.1 31.4, 18.3 24.5 Z"/>
  <ellipse class="b k" cx="20" cy="21.8" rx="6.4" ry="2.3"/>
  <circle class="b k" cx="20" cy="12" r="8"/>
  <path class="d" d="M24.1 5.1 A8 8 0 0 1 20.4 20 A9.2 9.2 0 0 0 24.1 5.1 Z"/>
  <ellipse class="l" cx="16.9" cy="8.9" rx="2.5" ry="1.8" transform="rotate(-30 16.9 8.9)"/>
</svg>`;
// Kleine Figur für die Liste der Spieler
const MINI = `<svg viewBox="0 0 12 16" aria-hidden="true"><circle cx="6" cy="3.6" r="2.7"/><path d="M4.5 6.6 C4.4 9.4 2.6 11 2.3 13.2 Q6 14.9 9.7 13.2 C9.4 11 7.6 9.4 7.5 6.6 Z"/></svg>`;

// Stern mit n Zacken (für das Sternfeld und die Funken)
function starPath(cx, cy, R, r, n = 5, rot = -90) {
  const f = (v) => +v.toFixed(2);
  const pts = Array.from({ length: n * 2 }, (_, k) => {
    const a = ((rot + (k * 180) / n) * Math.PI) / 180;
    const d = k % 2 ? r : R;
    return `${f(cx + d * Math.cos(a))} ${f(cy + d * Math.sin(a))}`;
  });
  return `M${pts.join(' L')} Z`;
}

// Zeichen der Sonderfelder, gezeichnet in ein Feld von 40 × 40 (Feldkreis r = 16 um 20/20). Die Rutsche zeigt nach rechts
// und wird in Richtung der Bahn gedreht.
const SYM = {
  stern: `<path class="i k" d="${starPath(20, 21, 11, 4.6)}" stroke-width="1.2" stroke-linejoin="round"/>`,
  tausch: `<path class="i" d="M10.5 14.2 H23 V10.4 L30 15.6 L23 20.8 V17 H10.5 Z"/><path class="i" d="M29.5 25.8 H17 V29.6 L10 24.4 L17 19.2 V23 H29.5 Z"/>`,
  burg: `<path class="i" d="M13.5 29 V16 H12 V11 H15 V13.2 H18.2 V11 H21.8 V13.2 H25 V11 H28 V16 H26.5 V29 Z"/><path class="p" d="M18 29 V24.5 A2 2 0 0 1 22 24.5 V29 Z"/>`,
  rutsche: `<path class="s" d="M13.5 12 L20.5 20 L13.5 28 M20.5 12 L27.5 20 L20.5 28" stroke-width="2.8"/>`,
};
const SYM_NAME = { stern: 'Stern', tausch: 'Tausch', burg: 'Burg', rutsche: 'Rutsche' };

// Mauer vor der Figur, solange sie auf einer Burg steht (von der Seite, wie die Figur)
const WALL = `<svg viewBox="0 0 44 15" aria-hidden="true">
  <path class="w" d="M2 14 V1.5 H8 V5 H13.3 V1.5 H19.3 V5 H24.7 V1.5 H30.7 V5 H36 V1.5 H42 V14 Z"/>
  <path class="j" d="M2 9.5 H42 M10.7 5 V9.5 M21.9 5 V9.5 M33.2 5 V9.5 M6.4 9.5 V14 M16.3 9.5 V14 M27.5 9.5 V14 M37.6 9.5 V14"/>
</svg>`;

// Fester Zufall für die Anzeige (render darf kein Math.random benutzen): gleicher Wurf, gleiche Lage.
function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, key: null, moves: [], shake: 0 };
    ui.set(el, u);
  }
  return u;
}

// HTML nur setzen, wenn es sich geändert hat (Knöpfe bleiben unter dem Finger)
function put(node, html) {
  if (node.dataset.html === html) return false;
  node.dataset.html = html;
  node.innerHTML = html;
  return true;
}

export function present(el, s, game) {
  render(el, s, { ...game, tv: true });
}

export function render(el, s, game) {
  const tv = Boolean(game.tv);
  const u = local(el, game);
  const geo = geometry(s.arms);
  const me = tv || !(game.me in s.seat) ? null : game.me;
  const motion = !game.reducedMotion;
  // Eigener Arm unten: das Brett dreht sich um die Mitte, die Figuren bleiben aufrecht
  const rot = me ? (-s.seat[me] * 360) / s.arms : 0;

  const key = JSON.stringify([s.arms, rot, tv, s.figures, s.felder, s.players.map((p) => [p.id, game.color(p.id)])]);
  let root = el.querySelector(':scope > .mae');
  if (!root || u.key !== key) {
    el.innerHTML = shell(s, game, geo, rot, tv);
    root = el.firstElementChild;
    u.key = key;
    u.board = boardInfo(root, geo, rot);
    wire(root, u, game);
  }
  u.geo = geo;
  u.arm = me ? s.seat[me] : null;
  if (me) {
    const board = root.querySelector('.mae-board');
    board.style.setProperty('--pc', game.color(me));
    board.style.setProperty('--mine', game.color(me)); // bleibt auch auf fremden Figuren meine Farbe
  }
  const q = (sel) => root.querySelector(sel);
  const prev = game.prev && game.prev.pos ? game.prev : null;
  const animate = motion && !game.first && prev;
  const rolled = Boolean(animate && prev.seq !== s.seq);
  const t0 = rolled ? DIE_MS : 0;

  // Was ich gerade ziehen darf
  const mine = !s.result && s.turn === me;
  u.moves = mine && s.phase === 'ziehen' ? moves(s, me, s.roll) : [];
  const value = (o = {}) => game.esc(JSON.stringify({ at: s.seq, ...o }));

  root.classList.toggle('is-over', Boolean(s.result));
  root.dataset.phase = s.phase;

  // Figuren: Platz setzen, dann den Weg dorthin animieren
  const ends = []; // Ankunftszeiten
  const flights = [];
  for (const p of s.players) {
    const arm = s.seat[p.id];
    s.pos[p.id].forEach((rel, i) => {
      const node = root.querySelector(`.mae-piece[data-who="${CSS.escape(p.id)}"][data-i="${i}"]`);
      if (!node) return;
      const [x, y] = u.board.pct(spot(geo, arm, i, rel));
      node.style.setProperty('--x', x.toFixed(3));
      node.style.setProperty('--y', y.toFixed(3));
      node.style.zIndex = String(Math.round(y * 10) + 10);
      const m = u.moves.find((mv) => mv.piece === i && p.id === me);
      const can = Boolean(m);
      node.classList.toggle('can', can);
      node.classList.toggle('dim', Boolean(s.result) && !s.result.winners.includes(p.id));
      node.classList.toggle('safe', onTrack(s, rel) && special(s, absOf(s, p.id, rel)) === 'burg');
      node.disabled = !can;
      node.tabIndex = can ? 0 : -1;
      if (can) {
        node.dataset.action = 'ziehen';
        node.dataset.value = JSON.stringify({ at: s.seq, piece: i });
      } else {
        delete node.dataset.action;
        delete node.dataset.value;
      }
      node.setAttribute('aria-label', `Figur ${WORD[i + 1]} von ${p.id === me ? 'dir' : game.name(p.id)}${can ? ', ziehen' : ''}`);
      const was = prev?.pos?.[p.id]?.[i];
      if (animate && was !== undefined && was !== rel) flights.push({ node, arm, i, from: was, to: rel, who: p.id });
    });
  }
  if (animate) {
    // Ist der letzte Zug genau der Unterschied zum vorigen Stand, läuft er mit seinem Sonderfeld ab:
    // erst bis zum Landefeld, dann rutschen oder tauschen. Sonst läuft jede Figur direkt an ihren Platz.
    const e = s.last;
    const exact = Boolean(e && e.seq === s.seq && e.piece !== undefined && prev.pos[e.by]?.[e.piece] === e.from && s.pos[e.by][e.piece] === e.end);
    const passes = []; // wann die ziehenden Figuren über ein Feld kommen: { key, t }
    const color = game.color(e?.by);
    let swap = null;
    for (const f of flights.filter((f) => f.to !== YARD)) {
      const mover = exact && f.who === e.by && f.i === e.piece;
      if (exact && e.swap && f.who === e.swap.id && f.i === e.swap.piece && f.from === e.swap.from) continue; // springt mit dem Tausch
      const plan = mover ? { from: e.from, land: e.land, end: e.end, fx: e.fx } : { from: f.from, land: f.to, end: f.to, fx: null };
      const r = travel(f.node, geo, u.board, f, plan, t0, game.signal);
      for (const pass of r.passes) passes.push({ key: fieldKey(geo, f.arm, f.i, pass.rel), t: pass.t });
      ends.push(r.t);
      if (mover) {
        swap = r.swap;
        effect(root, u, geo, s, e, r, color, game);
      }
      if (f.node.classList.contains('safe')) wall(f.node, mover ? r.land : r.t, game.signal, true);
    }
    for (const f of flights) {
      if (f.to === YARD) {
        const struck = passes.find((p) => p.key === fieldKey(geo, f.arm, f.i, f.from));
        ends.push(knock(root, f.node, geo, u.board, f, struck ? struck.t : t0 + 200, game, color));
      } else if (swap && f.who === e.swap.id && f.i === e.swap.piece && f.from === e.swap.from) {
        ends.push(hop(f.node, u.board.pct(spot(geo, f.arm, f.i, f.from)), u.board.pct(spot(geo, f.arm, f.i, f.to)), swap.at, swap.ms, -0.3, game.signal));
        if (f.node.classList.contains('safe')) wall(f.node, swap.at + swap.ms, game.signal, true);
      }
      // Wer die Burg verlässt, lässt die Mauer zurück
      const before = prev.pos[f.who][f.i];
      if (onTrack(s, before) && special(s, absOf(s, f.who, before)) === 'burg' && !f.node.classList.contains('safe')) {
        wall(f.node, t0, game.signal, false);
      }
    }
  }
  const settled = ends.reduce((m, t) => Math.max(m, t), t0);

  // Ziele der Figuren, die ich ziehen darf
  const targets = u.moves
    .map((mv) => {
      const [x, y] = u.board.pct(spot(geo, s.seat[me], mv.piece, mv.to));
      return `<button class="mae-target" data-action="ziehen" data-value="${value({ piece: mv.piece })}" data-for="${mv.piece}"
        style="--x:${x.toFixed(3)};--y:${y.toFixed(3)};--pc:${game.color(me)}" aria-label="Figur ${WORD[mv.piece + 1]} hierher ziehen">
        <span class="mae-ghost">${PAWN}</span></button>`;
    })
    .join('');
  put(q('.mae-targets'), targets);

  // Würfel, Text, Knopf, Spieler
  paintDie(root, s, game, u, rolled, me);
  const log = logText(s, game, me);
  const logNode = q('.mae-log');
  if (put(logNode, log) && animate && log) {
    logNode.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
      duration: 260, delay: t0, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards',
    });
  }
  const status = statusText(s, game, me);
  const statusNode = q('.mae-status');
  if (put(statusNode, status) && animate && status) {
    statusNode.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
      duration: 260, delay: Math.max(0, settled - 120), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards',
    });
  }
  // Der Knopf steht immer da und ist nur gesperrt, wenn ich nicht würfeln darf: So rutscht nichts darunter.
  const roll = q('.mae-roll');
  if (roll) {
    const ready = mine && s.phase === 'wuerfeln';
    roll.disabled = !ready;
    if (ready) {
      roll.dataset.action = 'wuerfeln';
      roll.dataset.value = JSON.stringify({ at: s.seq });
    } else {
      delete roll.dataset.action;
      delete roll.dataset.value;
    }
  }
  paintSeats(root, s, game, me, animate ? prev : null, settled);

  // Ende: die Figuren im Haus jubeln nacheinander, alle anderen treten zurück
  const won = s.result?.winners[0];
  root.querySelectorAll('.mae-lane').forEach((n) => n.classList.toggle('won', Number(n.dataset.arm) === s.seat[won]));
  if (won && animate && !prev.result) cheer(root, s, won, settled + 150, game.signal);

  if (game.first && motion) intro(root);
}

// Gerüst einer Partie: Brett mit Feldern, Ebenen für Ziele und Figuren, Würfeltisch, Spielerliste, Regeln.
function shell(s, game, geo, rot, tv) {
  const P = rotation(rot);
  const fields = [...geo.track, ...geo.house.flat(), ...geo.yard.flat()].map(P);
  const minX = Math.min(...fields.map((p) => p[0])) - 0.55;
  const maxX = Math.max(...fields.map((p) => p[0])) + 0.55;
  const minY = Math.min(...fields.map((p) => p[1])) - 0.95; // Köpfe der obersten Figuren
  const maxY = Math.max(...fields.map((p) => p[1])) + 0.55;
  const W = maxX - minX;
  const H = maxY - minY;
  const f = (v) => +v.toFixed(3);
  const owner = Object.fromEntries(Object.entries(s.seat).map(([id, arm]) => [arm, id]));
  const tint = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, white)`;
  const L = geo.L;
  const stepMs = 560 / L; // Auftakt: die Laufbahn in gut einer halben Sekunde

  const track = geo.track.map(P);
  const road = `<path class="mae-road" pathLength="1" d="M${track.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')} Z"/>`;
  let lanes = '';
  let houses = '';
  let yards = '';
  for (let arm = 0; arm < geo.arms; arm++) {
    const id = owner[arm];
    const c = id ? game.color(id) : null;
    const tip = track[arm * SPAN + 4];
    const end = P(geo.house[arm][HOUSE - 1]);
    lanes += `<path class="mae-lane ${id ? '' : 'free'}" data-arm="${arm}" pathLength="1" d="M${f(tip[0])} ${f(tip[1])} L${f(end[0])} ${f(end[1])}"
      style="${c ? `stroke:${c}` : ''}"/>`;
    houses += geo.house[arm]
      .map(P)
      .map(([x, y], h) => `<circle class="mae-f mae-house ${id ? '' : 'free'}" data-f="h${arm}-${h}" cx="${f(x)}" cy="${f(y)}" r="${FIELD_R}"
        style="--d:${Math.round(560 + h * 70)}ms;${c ? `fill:${tint(c, 24)};stroke:${c}` : ''}"/>`)
      .join('');
    if (id) {
      yards += geo.yard[arm]
        .map(P)
        .map(([x, y], i) => `<circle class="mae-f mae-yard" data-f="y${arm}-${i}" cx="${f(x)}" cy="${f(y)}" r="${FIELD_R - 0.03}"
          style="--d:${Math.round(420 + i * 60)}ms;fill:${tint(c, 12)};stroke:${c}"/>`)
        .join('');
    }
  }
  // Sonderfelder: Rutschen unter den Feldern (mit Pfeilen in den Lücken und einer Spur für die Bewegung),
  // Zeichen über den Feldern. Die Zeichen bleiben aufrecht, nur die Rutsche folgt der Bahn.
  let chutes = '';
  let trails = '';
  let symbols = '';
  if (s.felder === 'sonder') {
    track.forEach((p, i) => {
      const kind = SPECIAL[i % SPAN];
      if (!kind) return;
      let turn = 0;
      if (kind === 'rutsche') {
        const q = track[i + SLIDE];
        turn = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
        const d = `M${f(p[0])} ${f(p[1])} L${f(q[0])} ${f(q[1])}`;
        const gaps = Array.from({ length: SLIDE }, (_, k) => {
          const [a, b] = [track[i + k], track[i + k + 1]];
          return `<path class="mae-chevron" d="M-.06 -.16 L.06 0 L-.06 .16" transform="translate(${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}) rotate(${f(turn)})"/>`;
        }).join('');
        const d0 = `style="--d:${Math.round(i * stepMs + 200)}ms"`;
        chutes += `<path class="mae-chute-rim" pathLength="1" d="${d}" ${d0}/><path class="mae-chute" pathLength="1" d="${d}" ${d0}/>${gaps}`;
        trails += `<path class="mae-chute-trail" data-s="t${i}" pathLength="1" d="${d}"/>`;
      }
      symbols += `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(turn)}) scale(.025) translate(-20 -20)"><g class="mae-sym" data-s="t${i}" data-kind="${kind}" style="--d:${Math.round(i * stepMs + 160)}ms">${SYM[kind]}</g></g>`;
    });
  }
  const trackFields = track
    .map(([x, y], i) => {
      const arm = Math.floor(i / SPAN);
      const start = i % SPAN === 5 && owner[arm];
      const c = start ? game.color(owner[arm]) : null;
      return `<circle class="mae-f mae-t ${start ? 'start' : ''}" data-f="t${i}" cx="${f(x)}" cy="${f(y)}" r="${FIELD_R}"
        style="--d:${Math.round(i * stepMs)}ms;${c ? `fill:${c};stroke:${c}` : ''}"/>${
        start ? `<circle class="mae-start-ring" cx="${f(x)}" cy="${f(y)}" r="${FIELD_R - 0.1}" style="--d:${Math.round(i * stepMs)}ms"/>` : ''
      }`;
    })
    .join('');

  const pieces = s.players
    .map((p) =>
      s.pos[p.id]
        .map((_, i) => `<button class="mae-piece" type="button" data-who="${game.esc(p.id)}" data-i="${i}" style="--pc:${game.color(p.id)}" disabled tabindex="-1">
          <span class="mae-ring" aria-hidden="true"></span><span class="mae-fig">${PAWN}</span>${s.felder === 'sonder' ? `<span class="mae-wall">${WALL}</span>` : ''}</button>`)
        .join(''),
    )
    .join('');

  const faces = Object.keys(PIPS)
    .map(
      (n) => `<span class="mae-face" style="transform:${FACE[n]} translateZ(var(--h))"><svg viewBox="0 0 30 30" aria-hidden="true">${PIPS[n]
        .map((k) => `<circle cx="${8 + (k % 3) * 7}" cy="${8 + Math.floor(k / 3) * 7}" r="2.8"/>`)
        .join('')}</svg></span>`,
    )
    .join('');

  return `<div class="mae ${tv ? 'mae-tv' : ''} mae-arms-${geo.arms}" data-w="${f(W)}" data-h="${f(H)}" data-x="${f(minX)}" data-y="${f(minY)}">
    <div class="mae-stage">
      <div class="mae-board" style="aspect-ratio:${f(W)} / ${f(H)};--u:${f(100 / W)};--ar:${f(W / H)}">
        <svg class="mae-svg" viewBox="${f(minX)} ${f(minY)} ${f(W)} ${f(H)}" aria-hidden="true">
          ${road}${chutes}${lanes}${trackFields}${houses}${yards}${trails}${symbols}
        </svg>
        <div class="mae-targets"></div>
        <div class="mae-pieces">${pieces}</div>
        <div class="mae-fx" aria-hidden="true"></div>
      </div>
      <div class="mae-side">
        <div class="mae-tray">
          <button class="mae-die idle" type="button" disabled aria-label="Würfel">
            <span class="mae-lift"><span class="mae-cube"><i class="mae-core"></i><i class="mae-core mae-core-x"></i><i class="mae-core mae-core-y"></i>${faces}</span></span>
          </button>
          <div class="mae-text"><p class="mae-log" aria-live="polite"></p><p class="status mae-status"></p>${
            tv ? '' : '<div class="mae-bar"><button class="btn primary mae-roll" type="button" disabled>Würfeln</button></div>'
          }</div>
        </div>
        <ol class="mae-seats"></ol>
        ${s.felder === 'sonder' ? legendHTML(tv) : ''}
      </div>
    </div>
    ${tv ? '' : rulesHTML(s)}
  </div>`;
}

const rotation = (deg) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  return ([x, y]) => [x * c - y * sn, x * sn + y * c];
};

// Umrechnung Brett → Prozent der Brettbreite, für Figuren und Ziele
function boardInfo(root, geo, rot) {
  const P = rotation(rot);
  const W = Number(root.dataset.w);
  const minX = Number(root.dataset.x);
  const minY = Number(root.dataset.y);
  const board = root.querySelector('.mae-board');
  const fields = new Map([...root.querySelectorAll('.mae-f')].map((n) => [n.dataset.f, n]));
  return {
    pct: (p) => {
      const [x, y] = P(p);
      return [((x - minX) / W) * 100, ((y - minY) / W) * 100];
    },
    px: () => board.clientWidth / 100, // Pixel pro Prozent der Breite
    fields,
  };
}

// Einmal pro Brett: Schütteln beim Würfeln, Vorschau des Weges beim Darüberfahren
function wire(root, u, game) {
  const tray = root.querySelector('.mae-tray');
  root.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest('[data-action="wuerfeln"]')) return;
      tray.classList.add('shaking'); // bis die Antwort mit dem Wurf da ist
      clearTimeout(u.shake);
      u.shake = setTimeout(() => tray.classList.remove('shaking'), 2500);
    },
    { signal: game.signal },
  );
  const trail = (piece, on) => {
    const m = u.moves.find((mv) => mv.piece === piece);
    root.querySelectorAll('.mae-f.trail').forEach((n) => n.classList.remove('trail'));
    root.querySelectorAll('.mae-target.hot').forEach((n) => n.classList.remove('hot'));
    root.querySelectorAll('.mae-piece.swap-hint').forEach((n) => n.classList.remove('swap-hint'));
    if (!on || !m) return;
    if (u.arm === null) return;
    const from = m.from === YARD ? 0 : m.from + 1;
    // Rutsche: der Weg geht bis unten; Tausch: die andere Figur wird markiert
    const to = m.fx === 'rutsche' ? m.end : m.to;
    for (let r = from; r <= to; r++) u.board.fields.get(fieldKey(u.geo, u.arm, piece, r))?.classList.add('trail');
    if (m.swap) root.querySelector(`.mae-piece[data-who="${CSS.escape(m.swap.id)}"][data-i="${m.swap.piece}"]`)?.classList.add('swap-hint');
    root.querySelector(`.mae-target[data-for="${piece}"]`)?.classList.add('hot');
  };
  const over = (e, on) => {
    const n = e.target.closest('.mae-piece.can, .mae-target');
    if (n) trail(Number(n.dataset.i ?? n.dataset.for), on);
  };
  const pieces = root.querySelector('.mae-board');
  pieces.addEventListener('pointerover', (e) => over(e, true), { signal: game.signal });
  pieces.addEventListener('pointerout', (e) => over(e, false), { signal: game.signal });
  pieces.addEventListener('focusin', (e) => over(e, true), { signal: game.signal });
  pieces.addEventListener('focusout', (e) => over(e, false), { signal: game.signal });
}

// --- Bewegung ---

const translate = (x, y) => `translate(calc(${x.toFixed(3)}cqw - 50%), calc(${y.toFixed(3)}cqw - 50%))`;

const WAY = 'cubic-bezier(.45,0,.3,1)';
const UP = 'cubic-bezier(.2,.8,.2,1)';
const DOWN = 'cubic-bezier(.6,0,.4,1)';

// Weg einer Figur in Abschnitten: Feld für Feld hüpfen bis zum Landefeld (aus den B-Feldern oder rückwärts in einem
// Bogen), dann auf der Rutsche gleiten oder zum Tausch springen. Eine einzige Animation für den ganzen Weg, damit
// nichts zwischen den Abschnitten springt. Gibt die Ankunft am Landefeld und am Ende zurück, dazu wann die Figur
// über welches Feld kommt (für die Geschlagenen) und wann der Tausch beginnt.
function travel(node, geo, board, f, plan, delay, signal) {
  const pos = (rel) => board.pct(spot(geo, f.arm, f.i, rel));
  const places = [{ t: 0, p: pos(plan.from) }]; // Lage, easing gilt bis zum nächsten Eintrag
  const lifts = [{ t: 0, tf: 'none' }];
  const passes = [];
  let t = 0;
  const jump = plan.from === YARD || plan.land < plan.from;
  if (jump) {
    const ms = 460;
    places[0].e = WAY;
    lifts[0].e = UP;
    lifts.push({ t: ms * 0.45, tf: 'translateY(-55%) scale(1.04)', e: DOWN });
    t = ms;
    places.push({ t, p: pos(plan.land) });
    lifts.push({ t, tf: 'none' });
    passes.push({ rel: plan.land, t: delay + t });
  } else {
    const n = plan.land - plan.from;
    const step = Math.min(640, 200 + 72 * n) / n;
    for (let k = 1; k <= n; k++) {
      places[places.length - 1].e = WAY;
      lifts[lifts.length - 1].e = UP;
      lifts.push({ t: t + step * 0.45, tf: 'translateY(-22%) scale(1.04)', e: DOWN });
      t += step;
      places.push({ t, p: pos(plan.from + k) });
      lifts.push({ t, tf: 'none' });
      passes.push({ rel: plan.from + k, t: delay + t });
    }
  }
  const land = delay + t;
  let swap = null;
  let glide = null;
  if (plan.fx === 'rutsche') {
    // Kurz sitzen, dann immer schneller hinunter, nach vorn gelehnt, und unten aufrichten
    const [x0, y0] = pos(plan.land);
    const [x1, y1] = pos(plan.end);
    const lean = (12 * (x1 - x0)) / Math.hypot(x1 - x0, y1 - y0);
    places.push({ t: t + 90, p: [x0, y0] });
    lifts.push({ t: t + 90, tf: 'scale(1.06, .92)', e: 'ease-out' });
    lifts.push({ t: t + 150, tf: `rotate(${lean.toFixed(1)}deg) translateY(-6%)` });
    t += 90;
    const ms = 150 + 90 * (plan.end - plan.land);
    const share = [0.46, 0.78, 1];
    for (let r = plan.land + 1; r <= plan.end; r++) {
      const k = r - plan.land;
      places[places.length - 1].e = k === 1 ? 'cubic-bezier(.5,0,.8,.6)' : 'linear';
      const at = t + ms * (share[k - 1] ?? k / (plan.end - plan.land));
      places.push({ t: at, p: pos(r) });
      passes.push({ rel: r, t: delay + at });
    }
    glide = { at: delay + t, ms };
    t += ms;
    lifts.push({ t, tf: `rotate(${lean.toFixed(1)}deg) translateY(-6%)`, e: UP });
    t += 180;
    places.push({ t, p: [x1, y1] });
    lifts.push({ t, tf: 'none' });
  } else if (plan.fx === 'tausch') {
    // Kurz innehalten, dann in einem hohen Bogen auf den Platz der anderen Figur
    const ms = 520;
    t += 140;
    places.push({ t, p: pos(plan.land), e: WAY });
    lifts.push({ t, tf: 'none', e: UP });
    swap = { at: delay + t, ms };
    lifts.push({ t: t + ms * 0.5, tf: 'translateY(-75%) scale(1.06)', e: DOWN });
    t += ms;
    places.push({ t, p: pos(plan.end) });
    lifts.push({ t, tf: 'none' });
  }
  const frames = (list, prop) =>
    list.map((k) => ({ transform: prop(k), offset: k.t / t, easing: k.e ?? 'linear' }));
  node.classList.add('moving');
  const timing = { duration: t, delay, fill: 'backwards' };
  const a = node.animate(frames(places, (k) => translate(...k.p)), timing);
  node.querySelector('.mae-fig').animate(frames(lifts, (k) => k.tf), timing);
  a.finished.then(() => node.classList.remove('moving'), () => node.classList.remove('moving'));
  signal.addEventListener('abort', () => a.cancel());
  return { t: delay + t, land, passes, swap, glide };
}

// Ein Bogen von a nach b (die getauschte Figur springt unter der anderen hindurch). Gibt die Ankunft zurück.
function hop(node, a, b, delay, ms, height, signal) {
  node.classList.add('moving');
  const timing = { duration: ms, delay, fill: 'backwards' };
  const x = node.animate([{ transform: translate(...a), easing: WAY }, { transform: translate(...b) }], timing);
  node.querySelector('.mae-fig').animate(
    [{ transform: 'none', easing: UP }, { transform: `translateY(${height * 100}%) scale(.94)`, offset: 0.5, easing: DOWN }, { transform: 'none' }],
    timing,
  );
  x.finished.then(() => node.classList.remove('moving'), () => node.classList.remove('moving'));
  signal.addEventListener('abort', () => x.cancel());
  return delay + ms;
}

// Mauer vor einer Figur auf der Burg: wächst, wenn sie ankommt, sinkt, wenn sie geht.
function wall(node, delay, signal, up) {
  const w = node.querySelector('.mae-wall');
  if (!w) return;
  const shown = { transform: 'none', opacity: 1 };
  const gone = { transform: 'translateY(35%) scaleY(.2)', opacity: 0 };
  const a = w.animate(up ? [gone, shown] : [shown, gone], { duration: up ? 300 : 220, delay, easing: UP, fill: 'backwards' });
  signal.addEventListener('abort', () => a.cancel());
}

// Wirkung des Sonderfelds, wenn die Figur dort landet: Funken am Stern, Spur auf der Rutsche, der Tausch dreht sich.
function effect(root, u, geo, s, e, r, color, game) {
  if (!e.fx || e.fx === 'burg') return;
  const abs = absOf(s, e.by, e.land);
  const sym = root.querySelector(`.mae-sym[data-s="t${abs}"]`);
  const keep = (a) => game.signal.addEventListener('abort', () => a.cancel());
  if (e.fx === 'stern') {
    if (sym) {
      keep(sym.animate(
        [{ transform: 'none', easing: UP }, { transform: 'scale(1.5) rotate(36deg)', offset: 0.4, easing: DOWN }, { transform: 'rotate(72deg)' }],
        { duration: 620, delay: r.land - 60 },
      ));
    }
    const [x, y] = u.board.pct(geo.track[abs]);
    const fx = root.querySelector('.mae-fx');
    for (let k = 0; k < 8; k++) {
      const spark = document.createElement('span');
      spark.className = 'mae-spark';
      spark.style.setProperty('--pc', color);
      spark.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${starPath(10, 10, 9, 3.4, 4, -90)}"/></svg>`;
      fx.append(spark);
      const ang = (k * 45 + 22.5) * (Math.PI / 180);
      const d = ((k % 2 ? 0.8 : 1.2) * 100) / Number(root.dataset.w);
      const end = translate(x + Math.cos(ang) * d, y + Math.sin(ang) * d);
      const a = spark.animate(
        [{ transform: `${translate(x, y)} scale(.2)`, opacity: 1 }, { transform: `${end} scale(1) rotate(90deg)`, opacity: 1, offset: 0.6 }, { transform: `${end} scale(.4) rotate(140deg)`, opacity: 0 }],
        { duration: 640, delay: r.land - 20 + (k % 2) * 40, easing: UP, fill: 'both' },
      );
      a.finished.then(() => spark.remove(), () => spark.remove());
      game.signal.addEventListener('abort', () => spark.remove());
    }
  } else if (e.fx === 'tausch' && r.swap) {
    if (sym) keep(sym.animate([{ transform: 'none' }, { transform: 'rotate(180deg)' }], { duration: r.swap.ms, delay: r.swap.at, easing: WAY }));
  } else if (e.fx === 'rutsche') {
    // Farbige Spur auf der Rutsche, die hinter der Figur her läuft und dann verblasst
    const trail = root.querySelector(`.mae-chute-trail[data-s="t${abs}"]`);
    if (trail && r.glide) {
      const ms = r.glide.ms + 600;
      trail.style.stroke = color;
      keep(trail.animate(
        [
          { strokeDashoffset: 1, opacity: 0.5, easing: 'cubic-bezier(.5,0,.8,.6)' },
          { strokeDashoffset: 0, opacity: 0.5, offset: r.glide.ms / ms },
          { strokeDashoffset: 0, opacity: 0.5, offset: (r.glide.ms + 200) / ms, easing: 'ease-out' },
          { strokeDashoffset: 0, opacity: 0 },
        ],
        { duration: ms, delay: r.glide.at },
      ));
    }
  }
}

// Geschlagene Figur: kurzer Stoß, Kreis in der Farbe des Schlagenden, dann im Bogen zurück auf ihr B-Feld.
function knock(root, node, geo, board, f, delay, game, color) {
  const from = board.pct(spot(geo, f.arm, f.i, f.from));
  const to = board.pct(spot(geo, f.arm, f.i, YARD));
  const fig = node.querySelector('.mae-fig');
  const burst = document.createElement('span');
  burst.className = 'mae-burst';
  burst.style.setProperty('--x', from[0].toFixed(3));
  burst.style.setProperty('--y', from[1].toFixed(3));
  burst.style.setProperty('--pc', color);
  root.querySelector('.mae-fx').append(burst);
  burst
    .animate([{ transform: `${translate(...from)} scale(.4)`, opacity: 0.9 }, { transform: `${translate(...from)} scale(1.9)`, opacity: 0 }], {
      duration: 520, delay: delay - 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards',
    })
    .finished.then(() => burst.remove(), () => burst.remove());
  game.signal.addEventListener('abort', () => burst.remove());

  const duration = 640;
  node.classList.add('moving');
  const timing = { duration, delay, fill: 'backwards' };
  const a = node.animate(
    [
      { transform: translate(...from), offset: 0 },
      { transform: translate(...from), offset: 0.22, easing: 'cubic-bezier(.6,0,.2,1)' },
      { transform: translate(...to), offset: 1 },
    ],
    timing,
  );
  fig.animate(
    [
      { transform: 'none', offset: 0 },
      { transform: 'translateX(10%) rotate(14deg)', offset: 0.1 },
      { transform: 'translateX(-6%) rotate(-10deg)', offset: 0.2 },
      { transform: 'translateY(-70%) rotate(-200deg) scale(.9)', offset: 0.62, easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: 'rotate(-360deg)', offset: 1 },
    ],
    timing,
  );
  a.finished.then(() => node.classList.remove('moving'), () => node.classList.remove('moving'));
  game.signal.addEventListener('abort', () => a.cancel());
  return delay + duration;
}

// Auftakt: Laufbahn und Felder erscheinen der Reihe nach, dann fallen die Figuren auf ihre Plätze.
function intro(root) {
  root.classList.add('intro');
  const pieces = [...root.querySelectorAll('.mae-piece')];
  const step = Math.min(70, 520 / pieces.length);
  pieces.forEach((n, k) => {
    n.querySelector('.mae-fig').animate(
      [{ transform: 'translateY(-90%) scale(1.1)', opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }],
      { duration: 420, delay: 640 + k * step, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    );
  });
  root.querySelector('.mae-die').animate(
    [{ transform: 'translateY(-20px) rotate(-30deg) scale(1.15)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 480, delay: 400, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
  );
}

// Höhepunkt: Die Figuren im Haus heben nacheinander ab, von außen nach innen, mit einem Kreis in ihrer Farbe.
function cheer(root, s, won, delay, signal) {
  const L = trackLen(s);
  const order = s.pos[won].map((rel, i) => [rel, i]).sort((a, b) => a[0] - b[0]);
  order.forEach(([rel, i], k) => {
    const node = root.querySelector(`.mae-piece[data-who="${CSS.escape(won)}"][data-i="${i}"]`);
    if (!node || rel < L) return;
    const t = delay + 160 + k * 120;
    const a = node.querySelector('.mae-fig').animate(
      [{ transform: 'none' }, { transform: 'translateY(-34%) scale(1.12)', offset: 0.45 }, { transform: 'none' }],
      { duration: 520, delay: t, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    const b = node.querySelector('.mae-ring').animate(
      [{ transform: 'scale(.6)', opacity: 0.9 }, { transform: 'scale(2.2)', opacity: 0 }],
      { duration: 620, delay: t + 80, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    signal.addEventListener('abort', () => (a.cancel(), b.cancel()));
  });
  root.style.setProperty('--dim-delay', `${delay}ms`);
}

// --- Würfel ---

function paintDie(root, s, game, u, rolled, me) {
  const tray = root.querySelector('.mae-tray');
  const die = root.querySelector('.mae-die');
  const cube = die.querySelector('.mae-cube');
  if (rolled || u.dieSeq !== s.seq) tray.classList.remove('shaking');
  const ready = !s.result && s.turn === me && s.phase === 'wuerfeln';
  die.disabled = !ready;
  die.classList.toggle('ready', ready);
  if (ready) {
    die.dataset.action = 'wuerfeln';
    die.dataset.value = JSON.stringify({ at: s.seq });
    die.setAttribute('aria-label', 'Würfeln');
  } else {
    delete die.dataset.action;
    delete die.dataset.value;
    die.setAttribute('aria-label', s.roll ? `Würfel: ${NOUN[s.roll]}` : 'Würfel');
  }
  // Wer gerade würfelt, dessen Farbe trägt der Tisch
  tray.style.setProperty('--pc', game.color(s.turn));
  die.classList.toggle('idle', !s.roll);
  die.classList.toggle('stale', Boolean(s.roll) && s.phase === 'wuerfeln' && !s.result && s.last?.by !== s.turn);
  if (u.dieSeq === s.seq && !rolled) return;
  u.dieSeq = s.seq;
  const v = s.roll ?? 6;
  const [fx, fy] = SHOW[v];
  const rz = (hash(s.seq, 'rz') - 0.5) * 24;
  die.style.setProperty('--rz', `${rz.toFixed(1)}deg`);
  cube.style.transform = `rotateX(${fx}deg) rotateY(${fy}deg)`;
  if (!rolled) return;
  // Der Würfel kommt über den Tisch, überschlägt sich und bleibt auf seiner Zahl liegen.
  const spinX = 540 + Math.floor(hash(s.seq, 'sx') * 3) * 180;
  const spinY = 360 + Math.floor(hash(s.seq, 'sy') * 3) * 90;
  const dir = hash(s.seq, 'dir') < 0.5 ? -1 : 1;
  const timing = { duration: DIE_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
  die.animate(
    [
      { transform: `translate(${-70 * dir}px, ${-30 + hash(s.seq, 'y') * 24}px) rotate(${rz - 160 * dir}deg) scale(1.25)`, opacity: 0 },
      { opacity: 1, offset: 0.18 },
      { transform: `rotate(${rz}deg)`, opacity: 1 },
    ],
    timing,
  );
  die.classList.add('rolling');
  cube
    .animate([{ transform: `rotateX(${fx + spinX * dir}deg) rotateY(${fy - spinY}deg)` }, { transform: `rotateX(${fx}deg) rotateY(${fy}deg)` }], timing)
    .finished.then(() => die.classList.remove('rolling'), () => {});
}

// --- Texte ---

function logText(s, game, me) {
  const e = s.last;
  if (!e) return '';
  const du = e.by === me;
  const who = du ? 'Du' : game.esc(game.name(e.by));
  const v = (second, third) => (du ? second : third);
  const n = NOUN[e.roll];
  const victim = e.hit === me ? 'dich' : game.esc(game.name(e.hit));
  const marker = `<span class="marker" style="color:${game.color(e.by)}"></span> `;
  let text;
  if (e.kind === 'nichts') text = `${who} ${v('würfelst', 'würfelt')} eine ${n}.${e.left ? '' : ' Kein Zug möglich.'}`;
  else if (e.kind === 'raus' && e.hit) text = `${who} ${v('kommst', 'kommt')} mit einer Sechs raus und ${v('schlägst', 'schlägt')} ${victim}.`;
  else if (e.kind === 'raus') text = `${who} ${v('würfelst', 'würfelt')} eine Sechs und ${v('kommst', 'kommt')} raus.`;
  else if (e.kind === 'haus') text = `${who} ${v('würfelst', 'würfelt')} eine ${n} und ${v('ziehst', 'zieht')} ins Haus.`;
  else if (e.kind === 'vor') text = `${who} ${v('würfelst', 'würfelt')} eine ${n} und ${v('rückst', 'rückt')} im Haus vor.`;
  else {
    // Ein Zug auf der Laufbahn, vielleicht mit Sonderfeld; mehrere Geschlagene nur als Zahl, damit es kurz bleibt
    const hits = e.hits ?? (e.hit ? [e.hit] : []);
    const acts = [];
    if (e.fx === 'rutsche') acts.push(v('rutschst', 'rutscht'));
    else if (e.fx === 'tausch') acts.push(`${v('tauschst', 'tauscht')} mit ${e.swap.id === me ? 'dir' : game.esc(game.name(e.swap.id))}`);
    else if (e.fx === 'stern') acts.push(`${v('landest', 'landet')} auf einem Stern`);
    else if (e.fx === 'burg') acts.push(`${v('ziehst', 'zieht')} in eine Burg`);
    if (hits.length) acts.push(`${v('schlägst', 'schlägt')} ${hits.length > 1 ? `${WORD[hits.length]} Figuren` : victim}`);
    if (!acts.length) acts.push(v('ziehst', 'zieht'));
    text = `${who} ${v('würfelst', 'würfelt')} eine ${n}${acts.length > 1 ? `, ${acts[0]} und ${acts[1]}` : ` und ${acts[0]}`}.`;
  }
  return marker + text;
}

function statusText(s, game, me) {
  if (s.result) return '';
  const du = s.turn === me;
  const who = game.esc(game.name(s.turn));
  const marker = `<span class="marker" style="color:${game.color(s.turn)}"></span> `;
  const versuche = (n, acc) => (n === 1 ? (acc ? 'einen Versuch' : 'ein Versuch') : `${WORD[n]} Versuche`);
  let text;
  if (s.phase === 'ziehen') {
    text = du ? `Du hast eine ${NOUN[s.roll]}. Welche Figur ziehst du?` : `${who} hat eine ${NOUN[s.roll]} und wählt eine Figur.`;
  } else if (s.last?.seq === s.seq && s.last.by === s.turn && s.last.again) {
    text = du ? 'Du darfst noch einmal würfeln.' : `${who} darf noch einmal würfeln.`;
  } else if (s.tries) {
    const left = TRIES - s.tries;
    text = du ? `Noch ${versuche(left)} für eine Sechs.` : `${who} hat noch ${versuche(left, true)}.`;
  } else if (!s.pos[s.turn].some((q) => onTrack(s, q))) {
    text = du ? 'Du bist dran und hast drei Versuche für eine Sechs.' : `${who} ist dran und hat drei Versuche.`;
  } else text = du ? 'Du bist dran.' : `${who} ist dran.`;
  return marker + text;
}

// Spieler in Zugreihenfolge, mit ihren Figuren im Haus
function paintSeats(root, s, game, me, prev, delay) {
  const L = trackLen(s);
  const list = root.querySelector('.mae-seats');
  list.classList.toggle('many', s.players.length > 2);
  const html = s.players
    .map((p) => {
      const home = s.pos[p.id].filter((q) => q >= L).length;
      const before = prev ? prev.pos[p.id].filter((q) => q >= L).length : home;
      const turn = !s.result && s.turn === p.id;
      const won = s.result?.winners.includes(p.id);
      const pips = s.pos[p.id]
        .map((_, k) => `<i class="${k < home ? 'in' : ''} ${k >= before && k < home ? 'gain' : ''}">${MINI}</i>`)
        .join('');
      return `<li class="${turn ? 'is-turn' : ''} ${won ? 'won' : ''}" style="--pc:${game.color(p.id)}">
        <span class="mae-who"><span class="marker" style="color:${game.color(p.id)}"></span><span class="mae-name">${p.id === me ? 'Du' : game.esc(p.name)}</span></span>
        <span class="mae-home" role="img" aria-label="${WORD[home]} von ${WORD[s.figures]} im Haus">${pips}</span>
      </li>`;
    })
    .join('');
  if (put(list, html)) list.style.setProperty('--gain-delay', `${delay}ms`);
}

// Legende der Sonderfelder; am Bildschirm kurz, damit sie auch zu sechst neben das Brett passt
function legendHTML(tv) {
  const text = tv
    ? { stern: 'Noch einmal würfeln.', tausch: 'Platz tauschen.', burg: 'Sicher vor Schlagen.', rutsche: 'Drei weiter, schlägt.' }
    : {
        stern: 'Noch einmal würfeln.',
        tausch: 'Platz tauschen mit der nächsten fremden Figur bis sechs Felder voraus.',
        burg: 'Hier wird niemand geschlagen. Ist sie besetzt, kommt niemand hinein.',
        rutsche: 'Drei Felder weiter, fremde Figuren auf dem Weg werden geschlagen.',
      };
  return `<ul class="mae-legend" aria-label="Sonderfelder">${Object.keys(text)
    .map((k) => `<li><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="f" cx="20" cy="20" r="16"/>${SYM[k]}</svg><p><strong>${SYM_NAME[k]}</strong> ${text[k]}</p></li>`)
    .join('')}</ul>`;
}

function rulesHTML(s) {
  return `<details class="mae-rules">
    <summary>Regeln</summary>
    <ol>
      <li>Jede Person hat ${WORD[s.figures]} Figuren auf den B-Feldern ihrer Farbe. Wer zuerst alle ins Haus bringt, gewinnt.</li>
      <li>Mit einer Sechs kommt eine Figur auf das Startfeld. Das muss sein, solange eine Figur wartet und das Startfeld frei ist. Danach wird das Startfeld geräumt, sobald es geht.</li>
      <li>Nach einer Sechs würfelst du noch einmal. Wer keine Figur auf der Laufbahn hat, hat drei Versuche für eine Sechs.</li>
      <li>Die Figuren laufen im Uhrzeigersinn, genau so weit, wie der Würfel zeigt. Eigene Figuren darf man überspringen, aber nicht auf ihnen landen.</li>
      <li>Wer auf einer fremden Figur landet, schlägt sie: Sie muss zurück auf ihre B-Felder. ${
        s.rule === 'pflicht' ? 'Wer schlagen kann, muss schlagen, außer das Startfeld muss geräumt werden.' : 'Schlagen ist freiwillig.'
      }</li>
      <li>Ins Haus geht es nur mit der passenden Zahl, und dort wird nicht übersprungen.</li>
      <li>Kann eine Figur ziehen, muss gezogen werden. Gibt es nur einen Zug, macht ihn das Spiel.</li>${
        s.felder === 'sonder'
          ? `
      <li>Die Sonderfelder stehen in der Legende. Sie wirken nur, wenn eine Figur mit dem Wurf darauf landet, nicht nach einem Tausch oder einer Rutsche. Figuren auf einer Burg werden nicht getauscht. Steht unten an der Rutsche eine eigene Figur, rutschst du nicht.</li>`
          : ''
      }
    </ol>
  </details>`;
}

export const style = `
  .mae { display: grid; gap: 18px; container-type: inline-size; --mae-h: calc(100svh - 150px); }
  .mae-stage { display: grid; gap: 14px; align-items: start; }
  @container (min-width: 640px) {
    .mae-stage { grid-template-columns: minmax(0, 1fr) minmax(12rem, 16rem); gap: 24px; }
    .mae-side { position: sticky; top: 12px; }
  }

  /* ---------- Brett ---------- */
  .mae-board {
    position: relative; justify-self: center;
    width: min(100%, calc(var(--mae-h) * var(--ar)));
    container-type: inline-size;
    user-select: none; -webkit-user-select: none;
  }
  .mae-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .mae-road { fill: none; stroke: var(--ink); stroke-width: .055; stroke-linejoin: round; }
  .mae-lane { fill: none; stroke-width: .09; stroke-linecap: round; }
  .mae-lane.free { stroke: var(--hairline); stroke-width: .05; }
  .mae-lane.won { stroke-width: .2; }
  .mae-f { fill: var(--paper); stroke: var(--ink); stroke-width: .055; transition: fill 160ms ease-out; }
  .mae-f.free { fill: var(--paper); stroke: var(--hairline); }
  .mae-yard { stroke-width: .045; }
  .mae-start-ring { fill: none; stroke: var(--paper); stroke-width: .05; }
  .mae-t.trail { fill: color-mix(in srgb, var(--pc, var(--ink)) 16%, white); }
  .mae-house.trail { stroke-width: .1; }

  /* Ebenen über dem Brett: Ziele, Figuren, Effekte. Lage über --x/--y in Prozent der Brettbreite. */
  .mae-targets, .mae-pieces, .mae-fx { position: absolute; inset: 0; pointer-events: none; }
  .mae-piece, .mae-target, .mae-burst {
    position: absolute; left: 0; top: 0;
    width: calc(var(--u) * 1cqw); height: calc(var(--u) * 1cqw);
    transform: translate(calc(var(--x) * 1cqw - 50%), calc(var(--y) * 1cqw - 50%));
  }
  .mae-piece {
    margin: 0; padding: 0; border: 0; background: none; border-radius: 50%;
    -webkit-appearance: none; appearance: none; color: inherit;
    pointer-events: none; cursor: default;
    -webkit-tap-highlight-color: transparent;
  }
  .mae-piece.moving { z-index: 1000 !important; }
  .mae-fig { position: absolute; left: 9%; top: -44.3%; width: 82%; height: 114.8%; display: block; transform-origin: 50% 82%; }
  .mae-pawn { display: block; width: 100%; height: 100%; overflow: visible; }
  .mae-pawn .b { fill: color-mix(in srgb, var(--pc) 86%, #fff); }
  .mae-pawn .d { fill: color-mix(in srgb, var(--pc) 62%, #000); }
  .mae-pawn .l { fill: color-mix(in srgb, var(--pc) 48%, #fff); }
  .mae-pawn .k { stroke: var(--ink); stroke-width: 1.9; stroke-linejoin: round; }
  .mae-ring {
    position: absolute; inset: 6%; border-radius: 50%;
    border: 2px solid var(--pc); opacity: 0; pointer-events: none;
  }

  /* Figuren, die ich ziehen darf: angehoben, mit Ring, größere Trefferfläche */
  .mae-piece.can { pointer-events: auto; cursor: pointer; }
  .mae-piece.can::before { content: ''; position: absolute; inset: -14%; border-radius: 50%; }
  .mae-piece.can .mae-fig { transform: translateY(-9%); transition: transform 180ms cubic-bezier(.2,.8,.2,1); }
  .mae-piece.can .mae-ring { opacity: 1; animation: mae-pulse 1400ms ease-in-out infinite; }
  .mae-piece.can:hover .mae-fig, .mae-piece.can:focus-visible .mae-fig { transform: translateY(-16%) scale(1.06); }
  .mae-piece.can:active .mae-fig { transform: translateY(-6%) scale(.96); transition-duration: 90ms; }
  .mae-piece:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  @keyframes mae-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.18); opacity: .45; } }

  .mae-target {
    margin: 0; padding: 0; border: 0; background: none; -webkit-appearance: none; appearance: none;
    pointer-events: auto; cursor: pointer; border-radius: 50%;
    -webkit-tap-highlight-color: transparent;
  }
  .mae-target::after {
    content: ''; position: absolute; inset: -4%; border-radius: 50%;
    border: 2px dashed var(--pc);
    animation: mae-target 260ms cubic-bezier(.2,.8,.2,1) backwards;
  }
  .mae-ghost { position: absolute; left: 9%; top: -44.3%; width: 82%; height: 114.8%; opacity: .22; transition: opacity 160ms ease-out; }
  .mae-target.hot .mae-ghost, .mae-target:hover .mae-ghost { opacity: .5; }
  .mae-target:active .mae-ghost { opacity: .7; transform: scale(.96); }
  @keyframes mae-target { from { opacity: 0; transform: scale(.6); } }

  .mae-burst { border-radius: 50%; border: 3px solid var(--pc); opacity: 0; }

  /* Ende: die anderen treten zurück */
  .mae-piece { transition: opacity 500ms ease-out var(--dim-delay, 0ms); }
  .mae-piece.dim { opacity: .32; }
  .mae.is-over .mae-lane:not(.won) { opacity: .5; }

  /* ---------- Sonderfelder ---------- */
  /* Rutsche: eine Rinne um die vier Felder, Pfeile in den Lücken */
  .mae-chute-rim { fill: none; stroke: var(--ink); stroke-width: .99; stroke-linecap: round; }
  .mae-chute { fill: none; stroke: var(--wash); stroke-width: .89; stroke-linecap: round; }
  .mae-chevron { fill: none; stroke: var(--ink); stroke-width: .05; stroke-linecap: round; stroke-linejoin: round; }
  .mae-chute-trail { fill: none; stroke-width: .56; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; }
  .mae-sym { transform-box: fill-box; transform-origin: center; }
  .mae-sym .i, .mae-legend .i { fill: var(--ink); }
  .mae-sym .k, .mae-legend .k { stroke: var(--ink); }
  .mae-sym .p, .mae-legend .p { fill: var(--paper); }
  .mae-sym .s, .mae-legend .s { fill: none; stroke: var(--ink); stroke-linecap: round; stroke-linejoin: round; }
  .mae-wall { position: absolute; left: 6%; top: 38%; width: 88%; height: 30%; opacity: 0; pointer-events: none; transform-origin: 50% 100%; }
  .mae-piece.safe .mae-wall { opacity: 1; }
  .mae-wall svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .mae-wall .w { fill: var(--paper); stroke: var(--ink); stroke-width: 1.7; stroke-linejoin: round; }
  .mae-wall .j { fill: none; stroke: var(--ink); stroke-width: .8; }
  .mae-piece.swap-hint .mae-ring { opacity: 1; border: 3px dashed var(--mine, var(--ink)); animation: mae-pulse 1400ms ease-in-out infinite; }
  .mae-spark { position: absolute; left: 0; top: 0; width: calc(var(--u) * .5cqw); height: calc(var(--u) * .5cqw); opacity: 0; pointer-events: none; }
  .mae-spark svg { display: block; width: 100%; height: 100%; overflow: visible; fill: var(--pc); stroke: var(--ink); stroke-width: 1.3; stroke-linejoin: round; }
  .mae-legend { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .mae-legend li { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); align-items: start; gap: 8px; }
  .mae-legend svg { display: block; width: 1.6rem; height: 1.6rem; overflow: visible; }
  .mae-legend .f { fill: var(--paper); stroke: var(--ink); stroke-width: 2.2; }
  .mae-legend p { margin: 0; font-size: var(--t-sm); line-height: 1.35; color: var(--muted); }
  .mae-legend strong { color: var(--ink); }

  /* ---------- Würfeltisch ---------- */
  .mae-side { display: grid; gap: 14px; align-content: start; min-width: 0; }
  .mae-tray {
    display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 16px;
    padding: 12px 0; border-top: 2px solid var(--pc, var(--line)); border-bottom: 1px solid var(--hairline);
    transition: border-color 300ms ease-out;
  }
  /* Texte wechseln bei jedem Zug: zwei Zeilen sind immer reserviert, damit nichts darunter rutscht */
  .mae-text { display: grid; gap: 4px; min-width: 0; align-content: start; }
  .mae-log { margin: 0; color: var(--muted); font-size: var(--t-sm); line-height: 1.35; min-height: 2.7em; }
  .mae-status { margin: 0; line-height: 1.3; min-height: 2.6em; }
  .mae-bar { display: flex; margin-top: 4px; }
  .mae-roll { min-width: 9rem; }

  .mae-die {
    --s: 52px; --h: calc(var(--s) / 2);
    position: relative; width: var(--s); height: var(--s); margin: 4px;
    padding: 0; border: 0; background: none; -webkit-appearance: none; appearance: none; color: inherit;
    perspective: 360px; transform: rotate(var(--rz, 0deg));
    transition: opacity 220ms ease-out;
    -webkit-tap-highlight-color: transparent;
  }
  .mae-die:disabled { cursor: default; }
  .mae-die.ready { cursor: pointer; }
  .mae-die.idle, .mae-die.stale { opacity: .45; }
  .mae-lift { display: block; width: 100%; height: 100%; transform-style: preserve-3d; }
  .mae-cube { position: relative; display: block; width: 100%; height: 100%; transform-style: preserve-3d; }
  .mae-face {
    position: absolute; inset: 0; display: block;
    border: 2px solid var(--ink); border-radius: 22%; background: var(--paper);
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .mae-face svg { display: block; width: 100%; height: 100%; fill: var(--ink); }
  .mae-core { position: absolute; inset: 2px; border-radius: 22%; background: var(--ink); visibility: hidden; }
  .mae-die.rolling .mae-core { visibility: visible; }
  .mae-core-x { transform: rotateX(90deg); }
  .mae-core-y { transform: rotateY(90deg); }
  /* Ich bin dran: der Würfel lädt alle paar Sekunden zum Antippen ein */
  .mae-die.ready .mae-lift { animation: mae-invite 2600ms cubic-bezier(.4,0,.2,1) 600ms infinite; }
  @keyframes mae-invite { 0%, 78%, 100% { transform: none; } 84% { transform: translateY(-5px) rotate(-6deg); } 90% { transform: translateY(0) rotate(4deg); } }
  .mae-die.ready:active .mae-lift { transform: scale(.94); animation: none; }
  .mae-die.ready:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
  .mae-tray.shaking .mae-lift { animation: mae-shake 130ms ease-in-out infinite alternate; }
  @keyframes mae-shake { from { transform: translateY(-2px) rotate(-8deg); } to { transform: translateY(1px) rotate(8deg); } }

  /* ---------- Spieler ---------- */
  .mae-seats { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
  .mae-seats.many { grid-template-columns: repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr)); column-gap: 12px; }
  .mae-seats li {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0;
    padding: 7px 8px; border-bottom: 1px solid var(--hairline);
    transition: background-color 300ms ease-out;
  }
  .mae-seats li.is-turn { background: color-mix(in srgb, var(--pc) 10%, white); }
  .mae-seats li.won { background: color-mix(in srgb, var(--pc) 14%, white); }
  .mae-who { display: flex; align-items: center; gap: 6px; min-width: 0; font: 800 var(--t-md) / 1.1 var(--font-display); }
  .mae-who .marker { flex: none; }
  .mae-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
  .mae-seats li.is-turn .mae-name { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: var(--pc); }
  .mae-home { display: flex; gap: 2px; flex: none; }
  .mae-home i { display: block; width: 11px; height: 15px; }
  .mae-home svg { display: block; width: 100%; height: 100%; fill: var(--paper); stroke: var(--hairline); stroke-width: 1.2; }
  .mae-home i.in svg { fill: var(--pc); stroke: var(--ink); stroke-width: 1; }
  .mae-home i.gain { animation: mae-gain 420ms cubic-bezier(.2,.8,.2,1) var(--gain-delay, 0ms) backwards; }
  @keyframes mae-gain { from { transform: translateY(-8px) scale(1.5); opacity: 0; } }

  /* ---------- Regeln ---------- */
  .mae-rules summary { cursor: pointer; font-weight: 700; }
  .mae-rules ol { margin: 10px 0 0; padding-left: 1.3em; display: grid; gap: 6px; color: var(--muted); font-size: var(--t-sm); }

  /* ---------- Auftakt ---------- */
  .mae.intro .mae-road { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mae-draw 700ms cubic-bezier(.3,.7,.2,1) forwards; }
  .mae.intro .mae-lane { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mae-draw 420ms cubic-bezier(.3,.7,.2,1) 520ms forwards; }
  .mae.intro .mae-f, .mae.intro .mae-start-ring { transform-box: fill-box; transform-origin: center; animation: mae-pop 320ms cubic-bezier(.2,.8,.2,1) var(--d, 0ms) backwards; }
  .mae.intro .mae-sym { animation: mae-pop 320ms cubic-bezier(.2,.8,.2,1) var(--d, 0ms) backwards; }
  .mae.intro .mae-chute, .mae.intro .mae-chute-rim { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mae-draw 360ms cubic-bezier(.3,.7,.2,1) var(--d, 0ms) forwards; }
  .mae.intro .mae-chevron { animation: mae-fade 240ms ease-out 760ms backwards; }
  @keyframes mae-fade { from { opacity: 0; } }
  @keyframes mae-draw { to { stroke-dashoffset: 0; } }
  @keyframes mae-pop { from { opacity: 0; transform: scale(.3); } }

  /* ---------- Bildschirm ---------- */
  .mae-tv { --mae-h: calc(100vh - 9rem); }
  .mae-tv .mae-stage { grid-template-columns: minmax(0, 1fr) minmax(18rem, 28rem); gap: 4vw; align-items: start; }
  .mae-tv .mae-side { gap: 3vh; }
  .mae-tv .mae-die { --s: 5.5rem; margin: .5rem; }
  .mae-tv .mae-tray { align-items: start; gap: 1.2rem; }
  .mae-tv .mae-log { font-size: var(--t-base); }
  .mae-tv .mae-status { font-size: var(--t-md); }
  .mae-tv .mae-seats, .mae-tv .mae-seats.many { grid-template-columns: minmax(0, 1fr); }
  .mae-tv .mae-seats li { padding: 1.2vh .8vw; }
  .mae-tv .mae-who { font-size: var(--t-xl); }
  .mae-tv .mae-home i { width: 1.1rem; height: 1.5rem; }
  .mae-tv .mae-legend { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8vh 1.2rem; }
  .mae-tv .mae-legend li { align-items: center; }
  .mae-tv .mae-legend p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  @media (prefers-reduced-motion: reduce) {
    .mae *, .mae.intro * { animation: none !important; transition: none !important; }
    .mae.intro .mae-road, .mae.intro .mae-lane, .mae.intro .mae-chute, .mae.intro .mae-chute-rim { stroke-dashoffset: 0; }
  }
`;
