// Tutto: würfeln, Karten aufdecken, aufhören, bevor es eine Niete gibt.
//
// Nach der Anleitung von Abacus (Tutto, 1994): Wer dran ist, deckt eine Karte auf und würfelt mit sechs
// Würfeln. Einsen (hundert) und Fünfen (fünfzig) zählen einzeln, drei gleiche aus einem Wurf als Drilling
// (drei Einsen tausend, sonst hundertmal die Augenzahl). Nach jedem Wurf legt man mindestens einen
// zählenden Würfel heraus und würfelt mit dem Rest weiter, oder man hört auf und schreibt die Punkte
// auf. Ein Wurf ohne zählenden Würfel ist eine Niete: Die Punkte des Zuges sind weg. Wer alle sechs
// herausgelegt hat, hat ein TUTTO: Die Karte zahlt aus, und man darf mit einer neuen Karte weitermachen.
// Karten (56): Bonus 200 bis 600 (je fünf), Stop (zehn), Feuerwerk, Straße, Plus/Minus, ×2 (je fünf) und
// ein Kleeblatt. Was jede Karte tut, steht bei CARDS. Wer am Ende einer Runde das Ziel erreicht hat und
// vorne liegt, gewinnt (Gleichstand: alle Besten); das Kleeblatt gewinnt sofort.
// Zwei bis sechs Spieler, reihum.
//
// Geheim: die Reihenfolge des Stapels (view verrät nur, wie viele Karten noch drin sind).
// Einstellungen: Ziel und Zeit pro Entscheidung (danach wird automatisch aufgedeckt, gewürfelt,
// aufgehört oder, wo Aufhören nicht geht, alles Zählende herausgelegt; siehe tick).
//
// Motion: Karten kommen vom Stapel und drehen sich um, 3D-Würfel rollen über den Tisch, herausgelegte
// Würfel gleiten in ihre Reihe, ein TUTTO schlägt groß ins Feld, eine Niete wird gestempelt, Punkte
// zählen hoch. Alle Schritte eines Zuges (Feuerwerk: viele Würfe) laufen nacheinander ab (events).

export const meta = {
  name: 'Tutto',
  description: 'Würfelt, deckt Karten auf und hört rechtzeitig auf. Wer zu viel riskiert, geht leer aus.',
  players: [2, 6],
  options: [
    {
      id: 'ziel',
      label: 'Ziel',
      choices: [
        { value: 6000, label: 'Sechstausend Punkte' },
        { value: 4000, label: 'Viertausend Punkte' },
        { value: 10000, label: 'Zehntausend Punkte' },
      ],
    },
    {
      id: 'zeit',
      label: 'Zeit pro Entscheidung',
      choices: [
        { value: 0, label: 'Ohne Limit' },
        { value: 30, label: 'Dreißig Sekunden' },
        { value: 60, label: 'Eine Minute' },
      ],
    },
  ],
};

// Karten. Im Zustand stehen nur die Kennungen.
const BONUS = { b200: 200, b300: 300, b400: 400, b500: 500, b600: 600 };
const STREET = 2000; // Straße geschafft
const PLUSMINUS = 1000; // Plus/Minus geschafft: so viel bekommt man, so viel verliert, wer führt
const GRACE = 3000; // ms nach Ablauf der Frist, in denen ein Zug noch ankommt
const TRIPLE = { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 };

const ids = (s) => s.players.map((p) => p.id);
const nextAfter = (s, id) => ids(s)[(ids(s).indexOf(id) + 1) % s.players.length];
const nameOf = (s, id) => s.players.find((p) => p.id === id).name;
const die = () => 1 + Math.floor(Math.random() * 6);

function newDeck() {
  const deck = [];
  for (const b of Object.keys(BONUS)) deck.push(b, b, b, b, b);
  for (let k = 0; k < 10; k++) deck.push('stop');
  for (const c of ['feuer', 'strasse', 'pm', 'x2']) deck.push(c, c, c, c, c);
  deck.push('klee');
  return shuffle(deck);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function setup(players, options = {}) {
  const target = [4000, 10000].includes(options.ziel) ? options.ziel : 6000;
  const limit = [30, 60].includes(options.zeit) ? options.zeit : 0;
  const start = players[Math.floor(Math.random() * players.length)].id;
  return {
    players,
    target,
    limit, // Sekunden pro Entscheidung, 0 = ohne Limit
    start, // wer die Runde beginnt (danach endet sie)
    turn: start,
    phase: 'karte', // karte → wurf → wahl … → tutto → karte … ; ende
    deadline: limit ? Date.now() + limit * 1000 : null,
    deck: newDeck(), // oben = letzte Karte
    discard: [],
    card: null, // die aufgedeckte Karte (bleibt liegen, bis die nächste kommt)
    // Die sechs Würfel: v = Augenzahl, k = in welchem Schritt herausgelegt (null = liegt auf dem Tisch)
    dice: [5, 2, 6, 3, 4, 1].map((v) => ({ v, k: null })),
    rolls: 0, // zählt die Würfe (für die Anzeige)
    grp: 0,
    seg: 0, // Punkte der herausgelegten Würfel seit der letzten Karte
    pts: 0, // Punkte aus den TUTTOs dieses Zuges
    pm: 0, // geschaffte Plus/Minus in diesem Zug (Abzug beim Aufschreiben)
    klee: 0, // TUTTOs mit dem Kleeblatt
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    round: 1,
    seq: 0, // zählt Ereignisse, dient auch gegen doppeltes Tippen
    events: [], // die letzten Ereignisse, für Anzeige und Animation
    last: null, // der letzte Zug: { who, how: 'bank' | 'niete' | 'stop', pts }
  };
}

export function action(s, { player, type, data }) {
  if (!(player in s.scores)) throw new Error('Du spielst nicht mit.');
  if (s.phase === 'ende' || data?.at !== s.seq) return; // gehört zu einem älteren Stand (doppelt getippt)
  if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);
  const now = Date.now();

  if (type === 'karte') {
    if (s.phase !== 'karte' && s.phase !== 'tutto') return;
    return draw(s, now);
  }
  if (type === 'wuerfeln') {
    if (s.phase !== 'wurf') return;
    return roll(s, now);
  }
  if (type === 'legen') {
    if (s.phase !== 'wahl') return;
    const keep = readKeep(s, data.keep);
    take(s, keep);
    if (s.phase === 'wahl') roll(s, now);
    else wait(s, now);
    return;
  }
  if (type === 'stopp') {
    if (!canStop(s)) {
      throw new Error(s.card === 'strasse' || s.card === 'pm' || s.card === 'klee'
        ? `Mit ${CARDS[s.card].name} geht es bis zum TUTTO.`
        : 'Jetzt kannst du nicht aufhören.');
    }
    return stop(s, now);
  }
}

// Frist abgelaufen: Für den, der dran ist, wird aufgedeckt, gewürfelt oder aufgehört.
export function tick(s, now) {
  if (s.deadline === null || s.phase === 'ende' || now < s.deadline + GRACE) return;
  ev(s, { kind: 'zeit', who: s.turn });
  if (s.phase === 'karte') return draw(s, now);
  if (s.phase === 'wurf') return roll(s, now);
  if (s.phase === 'tutto' || canStop(s)) return stop(s, now);
  take(s, bestTake(s));
  if (s.phase === 'wahl') roll(s, now);
  else wait(s, now);
}

// Der Stapel ist geheim, sonst ist alles offen.
export function view(s) {
  const { deck, discard, ...rest } = s;
  return { ...rest, deck: deck.length, discard: discard.length, top: discard.at(-1) ?? null };
}

export function screen(s) {
  return view(s);
}

export function points(s) {
  return s.scores;
}

export function waitingFor(s) {
  return s.phase === 'ende' ? [] : [s.turn];
}

// Nur wer neu dran ist, bekommt eine Nachricht (nicht bei jedem Wurf des anderen).
export function notices(s, before) {
  if (s.phase === 'ende' || s.turn === before.turn) return [];
  const l = s.last;
  const name = nameOf(s, l.who);
  const what =
    l.how === 'bank'
      ? `${name} hat ${word(l.pts)} Punkte aufgeschrieben.`
      : l.how === 'stop'
        ? `${name} hat eine Stop-Karte aufgedeckt.`
        : `${name} hat eine Niete gewürfelt.`;
  return [{ to: s.turn, text: `${what} Du bist dran.` }];
}

// --- Karten ---

const CARDS = {
  b200: { name: 'Bonus 200', rule: 'Ein TUTTO bringt zweihundert Punkte extra. Aufhören geht nach jedem Wurf.' },
  b300: { name: 'Bonus 300', rule: 'Ein TUTTO bringt dreihundert Punkte extra. Aufhören geht nach jedem Wurf.' },
  b400: { name: 'Bonus 400', rule: 'Ein TUTTO bringt vierhundert Punkte extra. Aufhören geht nach jedem Wurf.' },
  b500: { name: 'Bonus 500', rule: 'Ein TUTTO bringt fünfhundert Punkte extra. Aufhören geht nach jedem Wurf.' },
  b600: { name: 'Bonus 600', rule: 'Ein TUTTO bringt sechshundert Punkte extra. Aufhören geht nach jedem Wurf.' },
  x2: { name: '×2', rule: 'Ein TUTTO verdoppelt alle Punkte dieses Zuges. Aufhören geht nach jedem Wurf.' },
  stop: { name: 'Stop', rule: 'Pech gehabt. Der Zug ist vorbei.' },
  feuer: { name: 'Feuerwerk', rule: 'Gewürfelt wird bis zur Niete, alles Zählende kommt heraus. Alle Punkte zählen.' },
  strasse: { name: 'Straße', rule: 'Jede Augenzahl einmal herauslegen, bis eins bis sechs liegen. Bringt zweitausend Punkte.' },
  pm: { name: 'Plus/Minus', rule: 'Ein TUTTO bringt genau tausend Punkte. Wer vorne liegt, verliert tausend.' },
  klee: { name: 'Kleeblatt', rule: 'Zweimal hintereinander TUTTO, und das Spiel ist gewonnen.' },
};

// Aufhören geht nach einem TUTTO, und nach einem Wurf nur bei Bonus und ×2.
const canStop = (s) => s.phase === 'tutto' || (s.phase === 'wahl' && (s.card in BONUS || s.card === 'x2'));

// --- Würfel ---

const free = (s) => s.dice.flatMap((d, i) => (d.k === null ? [i] : []));
const outFaces = (s) => new Set(s.dice.filter((d) => d.k !== null).map((d) => d.v));

// Punkte einer Auswahl aus einem Wurf, null wenn ein Würfel darin nicht zählt.
function scoreOf(vals) {
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (const v of vals) count[v]++;
  let pts = 0;
  for (let v = 1; v <= 6; v++) {
    const rest = count[v] % 3;
    pts += Math.floor(count[v] / 3) * TRIPLE[v];
    if (v === 1) pts += rest * 100;
    else if (v === 5) pts += rest * 50;
    else if (rest) return null;
  }
  return pts;
}

// Alles, was im Wurf zählt (zum Aufhören, für das Feuerwerk und wenn die Zeit um ist).
// Straße: von jeder neuen Augenzahl ein Würfel.
function bestTake(s) {
  const idx = free(s);
  if (s.card === 'strasse') {
    const seen = outFaces(s);
    return idx.filter((i) => !seen.has(s.dice[i].v) && seen.add(s.dice[i].v));
  }
  const byValue = {};
  for (const i of idx) (byValue[s.dice[i].v] ??= []).push(i);
  return Object.entries(byValue).flatMap(([v, list]) =>
    v === '1' || v === '5' ? list : list.slice(0, Math.floor(list.length / 3) * 3),
  );
}

function readKeep(s, keep) {
  if (!Array.isArray(keep) || !keep.length) throw new Error('Lege mindestens einen Würfel heraus.');
  const list = [...new Set(keep.map(Number))];
  if (list.length !== keep.length || list.some((i) => !Number.isInteger(i) || i < 0 || i > 5 || s.dice[i].k !== null)) {
    throw new Error('Diese Würfel liegen nicht auf dem Tisch.');
  }
  const vals = list.map((i) => s.dice[i].v);
  if (s.card === 'strasse') {
    const seen = outFaces(s);
    if (vals.some((v) => seen.has(v))) throw new Error('Diese Augenzahl liegt schon draußen.');
    if (new Set(vals).size !== vals.length) throw new Error('Jede Augenzahl nur einmal.');
  } else if (scoreOf(vals) === null) {
    throw new Error('Zweien, Dreien, Vieren und Sechsen zählen nur zu dritt.');
  }
  return list.sort((a, b) => a - b);
}

// --- Ablauf ---

const wait = (s, now) => {
  s.deadline = s.limit && s.phase !== 'ende' ? now + s.limit * 1000 : null;
};
const snap = (s) => s.dice.map((d) => ({ ...d }));

function draw(s, now) {
  if (s.card) s.discard.push(s.card);
  if (!s.deck.length) {
    s.deck = shuffle(s.discard);
    s.discard = [];
    ev(s, { kind: 'mischen' });
  }
  const card = s.deck.pop();
  s.card = card;
  for (const d of s.dice) d.k = null;
  s.seg = 0;
  s.klee = 0;
  ev(s, { kind: 'karte', who: s.turn, card, dice: snap(s) });
  if (card === 'stop') {
    ev(s, { kind: 'stop', who: s.turn, lost: s.pts });
    return endTurn(s, now, 'stop', 0);
  }
  s.phase = 'wurf';
  wait(s, now);
}

// Würfelt mit allen Würfeln auf dem Tisch. Beim Feuerwerk geht es von selbst weiter bis zur Niete.
function roll(s, now) {
  for (let guard = 0; guard < 100; guard++) {
    for (const d of s.dice) if (d.k === null) d.v = die();
    s.rolls++;
    ev(s, { kind: 'wurf', who: s.turn, dice: snap(s), r: s.rolls });
    const best = bestTake(s);
    if (!best.length) return niete(s, now);
    if (s.card !== 'feuer') {
      s.phase = 'wahl';
      return wait(s, now);
    }
    take(s, best);
    if (free(s).length === 0) {
      s.pts += s.seg;
      s.seg = 0;
      ev(s, { kind: 'tutto', who: s.turn, card: 'feuer', pts: s.pts });
      for (const d of s.dice) d.k = null;
    }
  }
  s.pts += s.seg;
  s.seg = 0;
  bank(s, now);
}

// Würfel herauslegen; sind dann alle draußen, ist es ein TUTTO.
function take(s, keep) {
  s.grp++;
  for (const i of keep) s.dice[i].k = s.grp;
  if (s.card !== 'strasse') s.seg += scoreOf(keep.map((i) => s.dice[i].v));
  ev(s, { kind: 'legen', who: s.turn, take: keep, dice: snap(s), seg: s.seg, pts: s.pts });
  if (free(s).length === 0 && s.card !== 'feuer') tutto(s);
}

function tutto(s) {
  const c = s.card;
  if (c in BONUS) s.pts += s.seg + BONUS[c];
  else if (c === 'x2') s.pts = (s.pts + s.seg) * 2;
  else if (c === 'strasse') s.pts += STREET;
  else if (c === 'pm') {
    s.pts += PLUSMINUS;
    s.pm++;
  } else if (c === 'klee') s.klee++;
  s.seg = 0;
  ev(s, { kind: 'tutto', who: s.turn, card: c, pts: s.pts, n: s.klee });
  if (c === 'klee') {
    if (s.klee >= 2) return cloverWin(s);
    // Gleich nochmal mit allen sechs, ohne neue Karte
    for (const d of s.dice) d.k = null;
    s.phase = 'wurf';
    return;
  }
  s.phase = 'tutto';
}

function niete(s, now) {
  if (s.card === 'feuer') {
    ev(s, { kind: 'niete', who: s.turn, lost: 0, feuer: true });
    s.pts += s.seg;
    s.seg = 0;
    return bank(s, now);
  }
  ev(s, { kind: 'niete', who: s.turn, lost: s.pts + s.seg });
  endTurn(s, now, 'niete', 0);
}

function stop(s, now) {
  if (s.phase === 'wahl') {
    take(s, bestTake(s));
    if (s.phase === 'wahl') {
      s.pts += s.seg;
      s.seg = 0;
    }
  }
  bank(s, now);
}

// Punkte aufschreiben. Für jedes geschaffte Plus/Minus verliert, wer vorne liegt, tausend Punkte
// (nie unter null; wer selbst vorne liegt, verliert nichts).
function bank(s, now) {
  const who = s.turn;
  const hits = [];
  for (let k = 0; k < s.pm; k++) {
    const top = Math.max(...Object.values(s.scores));
    if (top <= 0 || s.scores[who] === top) continue;
    const hit = ids(s).filter((id) => s.scores[id] === top);
    for (const id of hit) s.scores[id] = Math.max(0, s.scores[id] - PLUSMINUS);
    hits.push(...hit);
    ev(s, { kind: 'abzug', who: hit, by: who });
  }
  s.scores[who] += s.pts;
  ev(s, { kind: 'bank', who, pts: s.pts });
  endTurn(s, now, 'bank', s.pts, [...new Set(hits)]);
}

function endTurn(s, now, how, pts, hit = []) {
  s.last = { who: s.turn, how, pts, hit };
  s.pts = 0;
  s.seg = 0;
  s.pm = 0;
  s.klee = 0;
  for (const d of s.dice) d.k = null;
  const next = nextAfter(s, s.turn);
  if (next === s.start) {
    if (Math.max(...Object.values(s.scores)) >= s.target) return finish(s);
    s.round++;
  }
  s.turn = next;
  s.phase = 'karte';
  wait(s, now);
}

function cloverWin(s) {
  s.phase = 'ende';
  s.deadline = null;
  s.last = { who: s.turn, how: 'klee', pts: 0 };
  ev(s, { kind: 'klee', who: s.turn });
  s.result = { winners: [s.turn], text: `${nameOf(s, s.turn)} schafft mit dem Kleeblatt zweimal TUTTO und gewinnt.` };
}

function finish(s) {
  s.phase = 'ende';
  s.deadline = null;
  const all = s.players.map((p) => ({ p, total: s.scores[p.id] }));
  if (all.length === 2) {
    const [a, b] = all;
    if (a.total === b.total) {
      s.result = { winners: [], text: `Unentschieden, beide haben ${word(a.total)} Punkte.` };
      return;
    }
    const [w, l] = a.total > b.total ? [a, b] : [b, a];
    s.result = { winners: [w.p.id], text: `${w.p.name} gewinnt mit ${word(w.total)} zu ${word(l.total)} Punkten.` };
    return;
  }
  const top = Math.max(...all.map((x) => x.total));
  const best = all.filter((x) => x.total === top).map((x) => x.p);
  if (best.length === all.length) s.result = { winners: [], text: `Unentschieden, alle haben ${word(top)} Punkte.` };
  else if (best.length === 1) s.result = { winners: [best[0].id], text: `${best[0].name} gewinnt mit ${word(top)} Punkten.` };
  else s.result = { winners: best.map((p) => p.id), text: `${list(best.map((p) => p.name))} gewinnen mit je ${word(top)} Punkten.` };
}

function ev(s, e) {
  s.seq++;
  s.events.push({ id: s.seq, ...e });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}

// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
function list(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const SHY = '\u00ad';
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// Zahlen im Text als Wort (die Textschrift hat eine durchgestrichene Null).
function word(n) {
  if (n < 0) return `minus ${word(-n)}`;
  if (n < 20) return ONES[n];
  const unit = (k) => (k === 1 ? 'ein' : ONES[k]);
  if (n < 100) return n % 10 ? `${unit(n % 10)}und${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  // Lange Zahlwörter mit weichem Trennstrich, damit sie auf dem Handy umbrechen können
  if (n < 1000) return `${unit(Math.floor(n / 100))}${SHY}hundert${n % 100 ? SHY + word(n % 100) : ''}`;
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    return `${k === 1 ? '' : word(k).replace(/eins$/, 'ein') + SHY}tausend${n % 1000 ? SHY + word(n % 1000) : ''}`;
  }
  return String(n);
}

// ---------- Anzeige (nur im Browser) ----------

const INK = '#141414';
const PAL = {
  ocker: '#b8801a', ockerTief: '#7a5a12',
  rost: '#c0622b',
  rot: '#b03a3a',
  blau: '#3a6b98', blauTief: '#284c6e',
  gruen: '#2e7d4f', gruenTief: '#1f5a38',
  grau: '#6b6b66',
};
const k2 = (n) => +n.toFixed(2);

// --- Kartenbilder (viewBox 40 × 40) ---

// Rosette mit zwei Bändern (Bonus)
function rosette() {
  const pts = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 11.2 : 13.4;
    return `${k2(20 + Math.cos(a) * r)},${k2(17 + Math.sin(a) * r)}`;
  }).join(' ');
  return `<g stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">
      <path d="M13 24 L9.5 37 L13.6 34.6 L16.2 38.4 L19 26 Z" fill="${PAL.rost}"/>
      <path d="M27 24 L30.5 37 L26.4 34.6 L23.8 38.4 L21 26 Z" fill="${PAL.rost}"/>
    </g>
    <polygon points="${pts}" fill="${PAL.ocker}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="20" cy="17" r="8" fill="#fff" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="20" cy="17" r="6.2" fill="none" stroke="${PAL.ocker}" stroke-width=".9" stroke-dasharray="1.2 1.2"/>
    <path d="M20 12.4 L21.4 15.6 L24.8 15.9 L22.2 18.1 L23 21.4 L20 19.6 L17 21.4 L17.8 18.1 L15.2 15.9 L18.6 15.6 Z" fill="${PAL.ocker}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`;
}

// Zwei Würfel übereinander, schräg (×2)
function twoDice() {
  const face = (x, y, rot, fill) => `<g transform="rotate(${rot} ${x + 8} ${y + 8})">
      <rect x="${x}" y="${y}" width="16" height="16" rx="3.4" fill="${fill}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="${x + 4.5}" cy="${y + 4.5}" r="1.6" fill="${fill === '#fff' ? INK : '#fff'}"/>
      <circle cx="${x + 11.5}" cy="${y + 11.5}" r="1.6" fill="${fill === '#fff' ? INK : '#fff'}"/>
    </g>`;
  return `${face(6, 15, -14, '#fff')}${face(17, 8, 12, PAL.blau)}`;
}

// Stoppschild an der Stange
function stopSign() {
  const oct = (r) => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return `${k2(20 + Math.cos(a) * r)},${k2(16 + Math.sin(a) * r)}`;
  }).join(' ');
  return `<rect x="18.6" y="27" width="2.8" height="12" fill="${PAL.grau}" stroke="${INK}" stroke-width="1.2"/>
    <polygon points="${oct(15)}" fill="${PAL.rot}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <polygon points="${oct(12.7)}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>
    <text x="20" y="19" text-anchor="middle" fill="#fff" style="font:800 7.2px var(--font-display);letter-spacing:.3px">STOP</text>`;
}

// Feuerwerk: großer Stern, kleiner Stern, Leuchtspur von unten
function burst(cx, cy, n, r0, r1, r2, colors, w) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    const c = colors[i % colors.length];
    const p = (rr) => `${k2(cx + Math.cos(a) * rr)} ${k2(cy + Math.sin(a) * rr)}`;
    return `<path d="M${p(r0)} L${p(r)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/><circle cx="${k2(cx + Math.cos(a) * (r + w * 1.4))}" cy="${k2(cy + Math.sin(a) * (r + w * 1.4))}" r="${k2(w * (i % 2 ? 0.5 : 0.75))}" fill="${c}"/>`;
  }).join('');
}
function firework() {
  return `<path d="M12 39 C13 33 13 26 17.5 19" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="12.6" cy="34" r=".8" fill="${PAL.ocker}"/><circle cx="14.6" cy="28" r=".7" fill="${PAL.rost}"/>
    <g class="tt-art-burst">${burst(19, 15, 14, 3.6, 13, 9.5, [PAL.rost, PAL.ocker], 1.9)}</g>
    <circle cx="19" cy="15" r="3.2" fill="${PAL.rost}" stroke="${INK}" stroke-width="1.3"/>
    <g class="tt-art-burst2">${burst(32.5, 30.5, 10, 1.8, 5.6, 4, [PAL.ocker], 1.2)}</g>
    <circle cx="32.5" cy="30.5" r="1.6" fill="${PAL.ocker}" stroke="${INK}" stroke-width="1"/>`;
}

// Straße: Weg, der sich nach hinten verengt, mit Mittelstreifen und sechs Meilensteinen
function street() {
  const stones = [[6.5, 31.5], [33.5, 31.5], [11.5, 22.5], [32, 21], [12.5, 12], [26.5, 11]];
  return `<path d="M5 38 C10 30 23 30 21.5 22 C20.5 16 14 15 17.5 6 L22.5 6 C20 15 27.5 16 28.5 22 C30.5 31 22 31 35 38 Z" fill="${PAL.grau}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M20 37 C21 31 25 30 25 22 C25 16 19.5 15 20 6.6" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="2.2 2" stroke-linecap="round"/>
    ${stones.map(([x, y]) => `<g transform="translate(${x} ${y})">
      <rect x="-2.3" y="-2.3" width="4.6" height="4.6" rx="1" fill="#fff" stroke="${INK}" stroke-width="1"/>
      <circle r=".75" fill="${PAL.gruen}"/>
    </g>`).join('')}`;
}

// Plus/Minus: Waage, die zur Plus-Seite kippt (die Schalen hängen senkrecht an den Balkenenden)
function balance() {
  const tilt = (-12 * Math.PI) / 180;
  const end = (dx) => [20 + dx * Math.cos(tilt), 11 + dx * Math.sin(tilt)];
  const pan = ([x, y], fill, sign) => {
    const b = y + 10;
    return `<path d="M${k2(x)} ${k2(y)} L${k2(x - 4.6)} ${k2(b)} M${k2(x)} ${k2(y)} L${k2(x + 4.6)} ${k2(b)}" stroke="${INK}" stroke-width=".9"/>
      ${sign}
      <path d="M${k2(x - 6)} ${k2(b)} Q${k2(x)} ${k2(b + 6.4)} ${k2(x + 6)} ${k2(b)} Z" fill="${fill}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  };
  const L = end(-13);
  const R = end(13);
  const plus = `<path d="M${k2(L[0])} ${k2(L[1] + 4.6)} L${k2(L[0])} ${k2(L[1] + 10.4)} M${k2(L[0] - 2.9)} ${k2(L[1] + 7.5)} L${k2(L[0] + 2.9)} ${k2(L[1] + 7.5)}" stroke="${PAL.ockerTief}" stroke-width="2" stroke-linecap="round"/>`;
  const minus = `<path d="M${k2(R[0] - 2.7)} ${k2(R[1] + 8.4)} L${k2(R[0] + 2.7)} ${k2(R[1] + 8.4)}" stroke="${PAL.blauTief}" stroke-width="2" stroke-linecap="round"/>`;
  return `<path d="M13.5 38.5 L26.5 38.5 L23.5 35 L16.5 35 Z" fill="${PAL.grau}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="18.8" y="11" width="2.4" height="24" fill="${PAL.grau}" stroke="${INK}" stroke-width="1.2"/>
    ${pan(L, PAL.ocker, plus)}${pan(R, PAL.blau, minus)}
    <path d="M${k2(end(-14.5)[0])} ${k2(end(-14.5)[1])} L${k2(end(14.5)[0])} ${k2(end(14.5)[1])}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="20" cy="11" r="2.1" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
}

// Vierblättriges Kleeblatt
function clover() {
  const leaf = (rot) => `<g transform="rotate(${rot} 20 18)"><path d="M20 18 C16.5 15 12 11.5 13.4 7.6 C14.6 4.4 18.6 4.6 20 7.8 C21.4 4.6 25.4 4.4 26.6 7.6 C28 11.5 23.5 15 20 18 Z" fill="${PAL.gruen}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M20 17 L20 9.5" stroke="${PAL.gruenTief}" stroke-width=".9" stroke-linecap="round"/></g>`;
  return `<path d="M20 19 C21 26 24 31 29 36.5" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M20 19 C21 26 24 31 29 36.5" fill="none" stroke="${PAL.gruen}" stroke-width="1.8" stroke-linecap="round"/>
    ${[0, 90, 180, 270].map((r) => leaf(r + 8)).join('')}
    <circle cx="20" cy="18" r="1.4" fill="${PAL.gruenTief}"/>`;
}

const ART = { bonus: rosette, x2: twoDice, stop: stopSign, feuer: firework, strasse: street, pm: balance, klee: clover };
const kindOf = (c) => (c in BONUS ? 'bonus' : c);
const LOOK = {
  bonus: [PAL.ocker, 'BONUS'],
  x2: [PAL.blau, 'MAL ZWEI'],
  stop: [PAL.rot, 'STOP'],
  feuer: [PAL.rost, 'FEUERWERK'],
  strasse: [PAL.gruen, 'STRASSE'],
  pm: [PAL.ocker, 'PLUS/MINUS'],
  klee: [PAL.gruen, 'KLEEBLATT'],
};

// Vorderseite 60 × 90: Rahmen, Farbfläche, Bild, große Zahl, Name unten
function faceSVG(card) {
  const kind = kindOf(card);
  const [color, label] = LOOK[kind];
  const big = kind === 'bonus' ? card.slice(1) : kind === 'x2' ? '×2' : kind === 'pm' ? '±1000' : '';
  const art = `<g class="tt-art" transform="translate(${big ? 15 : 10} ${big ? 9 : 17}) scale(${big ? 0.75 : 1})">${ART[kind]()}</g>`;
  const long = label.length > 8;
  return `<svg viewBox="0 0 60 90" aria-hidden="true">
    <rect x=".8" y=".8" width="58.4" height="88.4" rx="4" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
    <rect x="4" y="4" width="52" height="82" rx="2" fill="${color}" fill-opacity=".1" stroke="${color}" stroke-width=".8"/>
    ${art}
    ${big ? `<text x="30" y="${kind === 'pm' ? 57 : 59}" text-anchor="middle" fill="${INK}" style="font:800 ${kind === 'pm' ? 15 : 20}px var(--font-display)">${big}</text>` : ''}
    <path d="M10 70.5 L50 70.5" stroke="${color}" stroke-width=".8"/>
    <text x="30" y="79.5" text-anchor="middle" fill="${INK}" style="font:800 ${long ? 6.6 : 7.4}px var(--font-display);letter-spacing:${long ? 0.2 : 0.6}px">${label}</text>
  </svg>`;
}

// Linie auf ein Rechteck zuschneiden (Liang-Barsky), statt clipPath mit id
function clipLine(x0, y0, x1, y1, [l, tp, r, b]) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - l], [dx, r - x0], [-dy, y0 - tp], [dy, b - y0]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const u = q / p;
    if (p < 0) {
      if (u > t1) return null;
      if (u > t0) t0 = u;
    } else {
      if (u < t0) return null;
      if (u < t1) t1 = u;
    }
  }
  return `M${k2(x0 + t0 * dx)} ${k2(y0 + t0 * dy)} L${k2(x0 + t1 * dx)} ${k2(y0 + t1 * dy)}`;
}

// Rückseite: Rauten, in der Mitte ein Würfel mit fünf Augen im Kreis
function backSVG() {
  const box = [4, 4, 56, 86];
  const lines = [];
  for (let i = -90; i <= 150; i += 7) lines.push(clipLine(i, 4, i + 82, 86, box), clipLine(i + 82, 4, i, 86, box));
  return `<svg viewBox="0 0 60 90" aria-hidden="true">
    <rect x=".8" y=".8" width="58.4" height="88.4" rx="4" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
    <rect x="4" y="4" width="52" height="82" rx="2" fill="${PAL.rost}"/>
    <path d="${lines.filter(Boolean).join(' ')}" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>
    <circle cx="30" cy="45" r="15" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
    <circle cx="30" cy="45" r="12.6" fill="none" stroke="${PAL.rost}" stroke-width=".8"/>
    <g transform="rotate(-10 30 45)">
      <rect x="22.5" y="37.5" width="15" height="15" rx="3.2" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
      ${[[26, 41], [34, 41], [30, 45], [26, 49], [34, 49]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${INK}"/>`).join('')}
    </g>
  </svg>`;
}

const FACES = Object.fromEntries(Object.keys(CARDS).map((c) => [c, faceSVG(c)]));
const BACK = backSVG();

function cardHTML(card, cls = '') {
  return `<div class="tt-card ${cls}" ${card ? `data-card="${card}" role="img" aria-label="Karte ${CARDS[card].name}"` : 'aria-hidden="true"'}>
    <div class="tt-inner"><div class="tt-side tt-front">${card ? FACES[card] : ''}</div><div class="tt-side tt-back">${BACK}</div></div>
  </div>`;
}

// --- Würfel (3D wie in qwixx.js) ---

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE3D = { 1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const CUBE = `<i class="tt-core"></i><i class="tt-core tt-core-x"></i><i class="tt-core tt-core-y"></i>${Object.keys(PIPS)
  .map((n) => `<span class="tt-pipface" style="transform:${FACE3D[n]} translateZ(var(--h))"><svg viewBox="0 0 30 30" aria-hidden="true">${PIPS[n]
    .map((p) => (n === '1'
      ? `<circle cx="15" cy="15" r="4.1" fill="${PAL.rost}"/>`
      : `<circle cx="${8 + (p % 3) * 7}" cy="${8 + Math.floor(p / 3) * 7}" r="2.75"/>`))
    .join('')}</svg></span>`)
  .join('')}`;

// Fester Zufall für die Anzeige (render darf kein Math.random benutzen): gleicher Wurf, gleiche Lage.
function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;
const nm = (game, id) => (id === game.me && !game.tv ? 'Du' : game.esc(game.name(id)));
const num = (n) => `<b class="num">${n}</b>`;
const clock = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// Was darf ich gerade tun?
const mine = (s, game) => !game.tv && !s.result && s.turn === game.me;

// Würfel, die man in diesem Wurf antippen kann
function pickable(s) {
  if (s.phase !== 'wahl') return new Set();
  const idx = free(s);
  if (s.card === 'strasse') {
    const out = outFaces(s);
    return new Set(idx.filter((i) => !out.has(s.dice[i].v)));
  }
  return new Set(idx.filter((i) => {
    const v = s.dice[i].v;
    return v === 1 || v === 5 || idx.filter((j) => s.dice[j].v === v).length >= 3;
  }));
}

// Antippen: Einsen und Fünfen einzeln, andere Zahlen zu dritt, bei der Straße jede Augenzahl einmal.
function toggle(s, sel, i) {
  const v = s.dice[i].v;
  const next = new Set(sel);
  if (s.card === 'strasse') {
    if (next.has(i)) next.delete(i);
    else {
      for (const j of next) if (s.dice[j].v === v) next.delete(j);
      next.add(i);
    }
    return next;
  }
  if (v === 1 || v === 5) {
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  }
  const same = free(s).filter((j) => s.dice[j].v === v);
  const chunk = same.slice(Math.floor(same.indexOf(i) / 3) * 3).slice(0, 3);
  if (chunk.length < 3) return next;
  if (chunk.some((j) => next.has(j))) chunk.forEach((j) => next.delete(j));
  else chunk.forEach((j) => next.add(j));
  return next;
}

// Lokaler Zustand pro Spielfeld (überlebt neues Zeichnen, neu bei jeder Partie)
const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, ctrl: null, sel: new Set(), selKey: -1, seen: 0, busy: false, disp: null, rk: 0, refreshed: null, autoSent: false };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => u.ctrl?.abort());
  }
  return u;
}

// Nachspielen nur, was kurz ist und direkt auf den vorigen Stand folgt. Kommen mehrere Züge auf einmal
// (die App war im Hintergrund, eine Nachricht ging verloren), steht sofort der neue Stand da: Sonst wären die
// Knöpfe so lange gesperrt, wie die Folge dauert, und es sähe aus, als hinge das Spiel.
const MAX_REPLAY = 9000;
function replayable(fresh, prev) {
  if (!fresh.length || !prev || fresh[0].id !== prev.seq + 1) return false;
  const ends = fresh.filter((e) => e.kind === 'bank' || e.kind === 'stop' || (e.kind === 'niete' && !e.feuer)).length;
  return ends <= 1 && fresh.reduce((t, e) => t + (DUR[e.kind] ?? 300), 0) <= MAX_REPLAY;
}

// Wie lange ein Ereignis auf der Bühne dauert, bevor das nächste kommt
const DUR = { karte: 720, mischen: 820, wurf: 980, legen: 460, tutto: 1500, niete: 1150, stop: 1000, abzug: 820, bank: 640, klee: 1400, zeit: 260 };

export function present(el, s, game) {
  render(el, s, { ...game, tv: true });
}

export function render(el, s, game) {
  const u = local(el, game);
  u.ctrl?.abort();
  u.ctrl = new AbortController();
  const signal = u.ctrl.signal;
  const motion = !game.reducedMotion;

  let root = el.querySelector(':scope > .tt');
  const built = !root;
  if (built) root = build(el, s, game);
  if (u.selKey !== s.seq) {
    u.selKey = s.seq;
    u.sel = new Set();
    u.autoSent = false;
  }

  const later = (ms, fn) => {
    if (ms <= 0) return fn();
    const t = setTimeout(fn, ms);
    signal.addEventListener('abort', () => clearTimeout(t));
  };

  const fresh = built || game.first || !game.prev ? [] : s.events.filter((e) => e.id > u.seen);
  u.seen = s.events.at(-1)?.id ?? 0;
  // Eine unterbrochene Folge ist vorbei: Ohne das blieben die Knöpfe gesperrt, bis wieder etwas passiert.
  u.busy = false;

  if (!motion || !replayable(fresh, game.prev)) {
    paintAll(root, s, game, u);
    if (motion && game.first) intro(root);
    if (motion && s.result && game.prev && !game.prev.result) finale(root, s, game, signal);
  } else {
    // Erst der Stand davor, dann jedes Ereignis nacheinander, zuletzt der neue Stand
    settle(root, game.prev, game, u);
    u.busy = true;
    paintBar(root, s, game, u);
    let t = 0;
    for (const e of fresh) {
      later(t, () => play(root, e, game, u, signal));
      t += DUR[e.kind] ?? 300;
    }
    later(t, () => {
      u.busy = false;
      paintAll(root, s, game, u);
      if (s.result && !game.prev.result) finale(root, s, game, signal);
    });
  }

  root.addEventListener(
    'click',
    (e) => {
      const d = e.target.closest('.tt-die');
      if (d && !d.disabled && mine(s, game) && s.phase === 'wahl' && !u.busy) {
        u.sel = toggle(s, u.sel, Number(d.dataset.i));
        paintSelection(root, s, game, u);
        return;
      }
      if (e.target.closest('[data-action="wuerfeln"], [data-action="legen"]') && motion) {
        root.querySelector('.tt-felt').classList.add('shaking'); // bis der Wurf vom Server da ist
        later(2000, () => root.querySelector('.tt-felt').classList.remove('shaking'));
      }
    },
    { signal },
  );
  startTimer(root, s, game, u, signal);
}

// --- Aufbau (einmal pro Partie) ---

function build(el, s, game) {
  const tv = Boolean(game.tv);
  const rows = s.players
    .map((p) => `<div class="tt-row" data-id="${game.esc(p.id)}" style="--pc:${game.color(p.id)}">
        <span class="tt-name">${marker(game, p.id)}<span class="tt-name-text">${nm(game, p.id)}</span></span>
        <b class="tt-total num">0</b>
        <span class="tt-track" aria-hidden="true"><i class="tt-pend"></i><i class="tt-fill"></i></span>
      </div>`)
    .join('');
  const dice = s.dice
    .map((_, i) => `<button type="button" class="tt-die" data-i="${i}" style="--c:${i + 1}" disabled>
        <span class="tt-lift"><span class="tt-cube">${CUBE}</span></span>
      </button>`)
    .join('');
  el.innerHTML = `<div class="tt ${tv ? 'tt-tv' : ''} ${s.players.length > 2 ? 'many' : ''}" data-target="${s.target}" style="--n:${s.players.length}">
    <div class="tt-left">
      <section class="tt-board" aria-label="Punkte">${rows}<p class="tt-goal">Ziel: ${word(s.target)} Punkte.</p></section>
      <div class="tt-head">
        ${s.limit ? '<div class="tt-timer off" aria-hidden="true"><span class="tt-timer-num num"></span><span class="tt-timer-bar"><i></i></span></div>' : ''}
        <p class="status tt-status"></p>
      </div>
    </div>
    <div class="tt-table">
      <div class="tt-cards">
        <div class="tt-pile tt-piles">
          <button type="button" class="tt-deck" data-action="karte" aria-label="Karte aufdecken" disabled>
            <span class="tt-stack">${cardHTML(null, 'down')}${cardHTML(null, 'down')}${cardHTML(null, 'down')}</span>
          </button>
          <span class="tt-count tt-deck-count"></span>
        </div>
        <div class="tt-slot"><span class="tt-empty"></span></div>
        <div class="tt-pile">
          <span class="tt-stack tt-discard"></span>
          <span class="tt-count tt-discard-count"></span>
        </div>
        <div class="tt-turn">
          <span class="tt-turn-label">Im Zug</span>
          <b class="tt-turn-pts num">0</b>
          <span class="tt-turn-sub"></span>
        </div>
      </div>
      <p class="tt-rule"></p>
      <div class="tt-felt">
        ${s.dice.map((_, i) => `<span class="tt-place" style="--c:${i + 1}"></span>`).join('')}
        ${dice}
        <div class="tt-banner" aria-hidden="true"></div>
      </div>
    </div>
    <p class="tt-log"></p>
    <div class="tt-bar">
      <button type="button" class="btn primary tt-main"></button>
      <button type="button" class="btn tt-alt"></button>
    </div>
    ${tv ? '' : rulesHTML(s)}
  </div>`;
  return el.firstElementChild;
}

// --- Zeichnen eines Standes ---

// Stand davor ohne Bewegung (falls eine Folge unterbrochen wurde, steht danach alles richtig)
function settle(root, p, game, u) {
  u.disp = { deck: p.deck, discard: p.discard, top: p.top, scores: { ...p.scores } };
  u.rk = p.rolls;
  paintBoard(root, p, game, u.disp.scores);
  paintCard(root, p.card);
  paintPiles(root, u.disp);
  paintDice(root, p.dice, u.rk, p, game, u, false);
  setTurnPts(root, p.pts + p.seg);
}

function paintAll(root, s, game, u) {
  u.disp = { deck: s.deck, discard: s.discard, top: s.top, scores: { ...s.scores } };
  u.rk = s.rolls;
  paintBoard(root, s, game, s.scores);
  paintCard(root, s.card);
  paintPiles(root, u.disp);
  paintDice(root, s.dice, u.rk, s, game, u, true);
  setTurnPts(root, s.result ? 0 : s.pts + s.seg);
  paintTexts(root, s, game);
  paintBar(root, s, game, u);
  paintSelection(root, s, game, u);
  root.querySelector('.tt-felt').classList.remove('shaking');
}

function paintBoard(root, s, game, scores) {
  const turnPts = s.result ? 0 : s.pts + s.seg;
  for (const p of s.players) {
    const row = root.querySelector(`.tt-row[data-id="${CSS.escape(p.id)}"]`);
    const total = scores[p.id];
    const turn = !s.result && s.turn === p.id;
    row.classList.toggle('is-turn', turn);
    row.classList.toggle('win', Boolean(s.result?.winners.includes(p.id)));
    row.classList.toggle('lose', Boolean(s.result && s.result.winners.length && !s.result.winners.includes(p.id)));
    const t = row.querySelector('.tt-total');
    t.textContent = total;
    t.setAttribute('aria-label', `${word(total)} Punkte`);
    row.querySelector('.tt-fill').style.transform = `scaleX(${Math.min(1, total / s.target)})`;
    row.querySelector('.tt-pend').style.transform = `scaleX(${Math.min(1, (total + (turn ? turnPts : 0)) / s.target)})`;
  }
}

function paintCard(root, card) {
  const slot = root.querySelector('.tt-slot');
  const cur = slot.querySelector('.tt-card');
  if ((cur?.dataset.card ?? null) === (card ?? null)) return;
  slot.innerHTML = card ? cardHTML(card) : '<span class="tt-empty"></span>';
}

function paintPiles(root, d) {
  const deck = root.querySelector('.tt-deck .tt-stack');
  [...deck.children].forEach((c, i) => (c.style.visibility = i < Math.min(3, d.deck) ? '' : 'hidden'));
  root.querySelector('.tt-deck-count').innerHTML = `${num(d.deck)} Stapel`;
  const pile = root.querySelector('.tt-discard');
  const key = d.top ?? '';
  if (pile.dataset.top !== key) {
    pile.dataset.top = key;
    pile.innerHTML = d.top ? cardHTML(d.top) : '<span class="tt-empty"></span>';
  }
  root.querySelector('.tt-discard-count').innerHTML = `${num(d.discard)} Ablage`;
}

// Würfel an ihren Platz: auf dem Tisch (leicht verstreut) oder oben in der Reihe der herausgelegten
function paintDice(root, dice, rk, s, game, u, final) {
  const can = final && mine(s, game) && !u.busy ? pickable(s) : new Set();
  const idle = final && (s.phase === 'karte' || s.phase === 'wurf' || s.phase === 'ende');
  root.querySelectorAll('.tt-die').forEach((n, i) => {
    const d = dice[i];
    const kept = d.k !== null;
    n.classList.toggle('kept', kept);
    n.classList.toggle('idle', idle && !kept);
    n.classList.toggle('can', can.has(i));
    n.classList.toggle('no', final && s.phase === 'wahl' && !kept && !can.has(i) && mine(s, game));
    n.disabled = !can.has(i);
    if (!kept) {
      n.style.setProperty('--hx', `${((hash(rk, i, 'x') - 0.5) * 0.2).toFixed(3)}`);
      n.style.setProperty('--hy', `${((hash(rk, i, 'y') - 0.5) * 0.3).toFixed(3)}`);
      n.style.setProperty('--hr', `${((hash(rk, i, 'r') - 0.5) * 24).toFixed(1)}deg`);
    }
    const [fx, fy] = SHOW[d.v];
    const cube = n.querySelector('.tt-cube');
    const want = `rotateX(${fx}deg) rotateY(${fy}deg)`;
    if (cube.style.transform !== want) cube.style.transform = want;
    n.dataset.v = d.v;
    n.setAttribute('aria-label', `Würfel ${word(d.v)}${kept ? ', herausgelegt' : ''}`);
  });
}

function setTurnPts(root, n, from = null, delay = 0, signal = null) {
  const node = root.querySelector('.tt-turn-pts');
  if (from !== null && from !== n && signal) return countUp(node, from, n, delay, 360, signal);
  node.textContent = n;
}

function paintTexts(root, s, game) {
  root.querySelector('.tt-status').innerHTML = statusHTML(s, game);
  root.querySelector('.tt-log').innerHTML = logHTML(s, game);
  root.querySelector('.tt-rule').innerHTML = s.card ? ruleHTML(s) : 'Wer dran ist, deckt eine Karte auf.';
  root.querySelector('.tt-table').style.setProperty('--pc', game.color(s.turn));
  root.querySelector('.tt-banner').style.setProperty('--pc', game.color(s.turn));
}

function ruleHTML(s) {
  const c = CARDS[s.card];
  const extra = s.card === 'klee' && s.klee === 1 && s.phase !== 'ende' ? ' Ein TUTTO ist geschafft.' : '';
  return `<b class="tt-rule-name">${c.name}.</b> ${c.rule}${extra}`;
}

function statusHTML(s, game) {
  const who = s.turn;
  const me = mine(s, game);
  const name = game.esc(game.name(who));
  if (s.result) {
    if (s.last?.how === 'klee') return `${marker(game, who)} Kleeblatt geschafft.`;
    return 'Die letzte Runde ist gespielt.';
  }
  const text = (() => {
    if (s.phase === 'karte') return me ? 'Du bist dran. Deck eine Karte auf.' : `${name} ist dran.`;
    if (s.phase === 'wurf') {
      if (s.card === 'klee' && s.klee === 1) return me ? 'Noch ein TUTTO. Würfle mit allen sechs.' : `${name} braucht noch ein TUTTO.`;
      if (s.card === 'feuer') return me ? 'Feuerwerk: Würfle, der Rest geht von selbst.' : `${name} zündet das Feuerwerk.`;
      return me ? 'Würfle.' : `${name} würfelt.`;
    }
    if (s.phase === 'wahl') {
      if (!me) return `${name} legt Würfel heraus.`;
      if (s.card === 'strasse') return 'Lege neue Augenzahlen heraus und würfle weiter.';
      if (!canStop(s)) return 'Lege Würfel heraus und würfle weiter. Aufhören geht erst nach dem TUTTO.';
      return 'Lege Würfel heraus und würfle weiter, oder hör auf.';
    }
    return me ? 'TUTTO. Aufhören oder eine neue Karte?' : `${name} hat ein TUTTO.`;
  })();
  return `${marker(game, who)} ${text}`;
}

// Was im letzten Zug passiert ist
function logHTML(s, game) {
  const l = s.last;
  if (!l || l.how === 'klee') return '';
  const who = nm(game, l.who);
  const you = l.who === game.me && !game.tv;
  let text;
  if (l.how === 'bank') text = `${who} ${you ? 'schreibst' : 'schreibt'} ${num(l.pts)} auf.`;
  else if (l.how === 'stop') text = `${who} ${you ? 'hast' : 'hat'} Stop aufgedeckt.`;
  else text = `${who} ${you ? 'hast' : 'hat'} eine Niete gewürfelt.`;
  const hit = (l.hit ?? []).filter((id) => id in s.scores);
  if (hit.length) {
    const names = list(hit.map((id) => nm(game, id)));
    text += ` ${names} ${hit.length > 1 ? 'verlieren je' : hit[0] === game.me && !game.tv ? 'verlierst' : 'verliert'} ${num(PLUSMINUS)}.`;
  }
  return `<span class="tt-log-cap">Zuletzt</span> ${text}`;
}

function paintBar(root, s, game, u) {
  const bar = root.querySelector('.tt-bar');
  const main = bar.querySelector('.tt-main');
  const alt = bar.querySelector('.tt-alt');
  const deck = root.querySelector('.tt-deck');
  const me = mine(s, game);
  bar.classList.toggle('off', !me);
  const value = (o = {}) => JSON.stringify({ at: s.seq, ...o });
  let mainAction = null;
  let mainLabel = 'Würfeln';
  let altAction = null;
  if (s.phase === 'karte') {
    mainAction = 'karte';
    mainLabel = 'Karte aufdecken';
  } else if (s.phase === 'wurf') {
    mainAction = 'wuerfeln';
    mainLabel = 'Würfeln';
  } else if (s.phase === 'wahl') {
    mainAction = 'legen';
    mainLabel = 'Weiterwürfeln';
    altAction = 'stopp';
  } else if (s.phase === 'tutto') {
    mainAction = 'karte';
    mainLabel = 'Neue Karte';
    altAction = 'stopp';
  }
  main.textContent = mainLabel;
  if (mainAction) {
    main.dataset.action = mainAction;
    main.dataset.value = value();
  } else delete main.dataset.action;
  main.disabled = !me || u.busy || !mainAction || mainAction === 'legen';
  alt.textContent = 'Aufhören';
  alt.style.visibility = altAction ? '' : 'hidden';
  if (altAction) {
    alt.dataset.action = altAction;
    alt.dataset.value = value();
  } else delete alt.dataset.action;
  alt.disabled = !me || u.busy || !altAction || !canStop(s);
  const drawable = me && !u.busy && (s.phase === 'karte' || s.phase === 'tutto');
  deck.disabled = !drawable;
  deck.dataset.value = value();
  deck.classList.toggle('ready', drawable);
}

// Auswahl beim Herauslegen: Würfel heben sich, der Knopf zeigt, was passiert
function paintSelection(root, s, game, u) {
  const me = mine(s, game) && s.phase === 'wahl' && !u.busy;
  const sel = me ? u.sel : new Set();
  root.querySelectorAll('.tt-die').forEach((n, i) => n.classList.toggle('sel', sel.has(i)));
  const sub = root.querySelector('.tt-turn-sub');
  const main = root.querySelector('.tt-main');
  if (!me) {
    sub.innerHTML = s.card === 'klee' && s.klee === 1 && !s.result ? 'Ein TUTTO geschafft' : '';
    return;
  }
  const keep = [...sel].sort((a, b) => a - b);
  const all = keep.length === free(s).length;
  if (s.card === 'strasse') {
    sub.innerHTML = keep.length ? `Auswahl ${num(keep.length)} neu` : 'Antippen';
  } else {
    const pts = keep.length ? scoreOf(keep.map((i) => s.dice[i].v)) : 0;
    sub.innerHTML = keep.length ? `Auswahl ${num(`+${pts}`)}` : 'Antippen';
  }
  main.textContent = all && keep.length ? 'Herauslegen' : 'Weiterwürfeln';
  main.dataset.value = JSON.stringify({ at: s.seq, keep });
  main.disabled = !keep.length;
}

// --- Abspielen der Ereignisse ---

function play(root, e, game, u, signal) {
  const banner = (text, cls, color) => showBanner(root, text, cls, color ?? game.color(e.who), signal);
  if (e.kind === 'zeit') return banner('Zeit', 'zeit');
  if (e.kind === 'mischen') return shuffleIn(root, u, signal);
  if (e.kind === 'karte') {
    drawCard(root, e.card, u, signal);
    root.querySelector('.tt-rule').innerHTML = `<b class="tt-rule-name">${CARDS[e.card].name}.</b> ${CARDS[e.card].rule}`;
    root.querySelector('.tt-table').style.setProperty('--pc', game.color(e.who));
    if (e.dice) paintDice(root, e.dice, u.rk, null, game, u, false);
    root.querySelectorAll('.tt-die').forEach((n) => n.classList.add('idle'));
    return;
  }
  if (e.kind === 'wurf') {
    u.rk = e.r;
    paintDice(root, e.dice, u.rk, null, game, u, false);
    root.querySelector('.tt-felt').classList.remove('shaking');
    rollDice(root, e.dice, e.r, signal);
    return;
  }
  if (e.kind === 'legen') {
    const before = Number(root.querySelector('.tt-turn-pts').textContent);
    paintDice(root, e.dice, u.rk, null, game, u, false);
    setTurnPts(root, e.pts + e.seg, before, 120, signal);
    return;
  }
  if (e.kind === 'tutto') {
    const before = Number(root.querySelector('.tt-turn-pts').textContent);
    banner('TUTTO', 'tutto');
    hop(root, signal);
    setTurnPts(root, e.pts, before, 520, signal);
    if (e.card === 'klee' || e.card === 'x2' || e.card in BONUS || e.card === 'pm' || e.card === 'strasse') pulseCard(root, 380);
    return;
  }
  if (e.kind === 'niete') {
    banner('Niete', 'niete', 'var(--bad)');
    root.querySelectorAll('.tt-die:not(.kept)').forEach((n) => {
      n.classList.add('dud');
      later(n, signal, DUR.niete - 80, () => n.classList.remove('dud'));
    });
    if (!e.feuer && e.lost) {
      const node = root.querySelector('.tt-turn-pts');
      node.classList.add('lost');
      later(node, signal, DUR.niete, () => node.classList.remove('lost'));
      setTurnPts(root, 0, e.lost, 600, signal);
    }
    return;
  }
  if (e.kind === 'stop') {
    banner('Stop', 'niete', 'var(--bad)');
    pulseCard(root, 200);
    if (e.lost) setTurnPts(root, 0, e.lost, 500, signal);
    return;
  }
  if (e.kind === 'abzug') {
    for (const id of e.who) {
      const from = u.disp.scores[id];
      u.disp.scores[id] = Math.max(0, from - PLUSMINUS);
      bumpScore(root, id, from, u.disp.scores[id], 'minus', signal);
    }
    return;
  }
  if (e.kind === 'bank') {
    const from = u.disp.scores[e.who];
    u.disp.scores[e.who] = from + e.pts;
    bumpScore(root, e.who, from, u.disp.scores[e.who], 'plus', signal);
    setTurnPts(root, 0, e.pts, 200, signal);
    return;
  }
  if (e.kind === 'klee') {
    banner('Kleeblatt', 'tutto');
    pulseCard(root, 0, true);
  }
}

function later(node, signal, ms, fn) {
  const t = setTimeout(fn, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(t);
    fn();
  });
}

// Neue Karte: die alte fliegt auf die Ablage, die neue kommt verdeckt vom Stapel und dreht sich um.
function drawCard(root, card, u, signal) {
  const slot = root.querySelector('.tt-slot');
  const old = slot.querySelector('.tt-card');
  const deck = root.querySelector('.tt-deck .tt-stack').getBoundingClientRect();
  if (old) discardOld(root, old, u, signal);
  u.disp.deck = Math.max(0, u.disp.deck - 1);
  paintPiles(root, u.disp);
  slot.innerHTML = cardHTML(card);
  const n = slot.firstElementChild;
  const r = n.getBoundingClientRect();
  const dx = deck.left + deck.width / 2 - (r.left + r.width / 2);
  const dy = deck.top + deck.height / 2 - (r.top + r.height / 2);
  const timing = { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
  n.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${deck.width / r.width})` }, { transform: 'none' }], timing);
  n.querySelector('.tt-inner').animate(
    [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.35 }, { transform: 'none' }],
    timing,
  );
}

// Die liegende Karte fliegt auf die Ablage; erst danach liegt sie oben.
function discardOld(root, old, u, signal) {
  const pile = root.querySelector('.tt-discard').getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const r = old.getBoundingClientRect();
  const card = old.dataset.card;
  Object.assign(old.style, {
    position: 'absolute', left: `${r.left - rootRect.left}px`, top: `${r.top - rootRect.top}px`,
    width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: 3,
  });
  old.classList.add('ghost');
  root.append(old);
  const dx = pile.left + pile.width / 2 - (r.left + r.width / 2);
  const dy = pile.top + pile.height / 2 - (r.top + r.height / 2);
  u.disp.discard++;
  u.disp.top = card;
  const done = () => {
    old.remove();
    paintPiles(root, u.disp);
  };
  old
    .animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${pile.width / r.width}) rotate(8deg)` }], {
      duration: 440,
      easing: 'cubic-bezier(.6,0,.2,1)',
      fill: 'forwards',
    })
    .finished.then(done, done);
  signal.addEventListener('abort', () => old.remove());
}

// Die Ablage wird gemischt und kommt als neuer Stapel zurück.
function shuffleIn(root, u, signal) {
  const old = root.querySelector('.tt-slot .tt-card');
  if (old) discardOld(root, old, u, signal);
  const slot = root.querySelector('.tt-slot');
  if (old) slot.innerHTML = '<span class="tt-empty"></span>';
  const pile = root.querySelector('.tt-discard');
  const deck = root.querySelector('.tt-deck .tt-stack');
  const a = pile.getBoundingClientRect();
  const b = deck.getBoundingClientRect();
  const t = setTimeout(() => {
    u.disp.deck += u.disp.discard;
    u.disp.discard = 0;
    u.disp.top = null;
    paintPiles(root, u.disp);
    deck.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'rotate(-7deg)', offset: 0.55 }, { transform: 'rotate(5deg)', offset: 0.78 }, { transform: 'none' }], {
      duration: 520,
      easing: 'cubic-bezier(.6,0,.2,1)',
    });
  }, 300);
  signal.addEventListener('abort', () => clearTimeout(t));
}

// Würfel kommen von oben links über den Tisch, überschlagen sich und bleiben auf ihrer Zahl liegen.
function rollDice(root, dice, r, signal) {
  const dies = [...root.querySelectorAll('.tt-die')];
  let k = 0;
  dice.forEach((d, i) => {
    if (d.k !== null) return;
    const n = dies[i];
    const size = n.offsetWidth;
    const [fx, fy] = SHOW[d.v];
    const spinX = 540 + Math.floor(hash(r, i, 'sx') * 3) * 180;
    const spinY = 360 + Math.floor(hash(r, i, 'sy') * 3) * 90;
    const dir = hash(r, i, 'dir') < 0.5 ? -1 : 1;
    const timing = { duration: 820, delay: k * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
    k++;
    n.classList.add('rolling');
    n.querySelector('.tt-lift').animate(
      [
        { transform: `translate(${-size * (2.2 + hash(r, i, 'fx'))}px, ${-size * (0.9 + hash(r, i, 'fy') * 0.6)}px) rotate(-150deg) scale(1.18)`, opacity: 0 },
        { opacity: 1, offset: 0.16 },
        { transform: `translate(${size * 0.12}px, ${-size * 0.18}px) rotate(12deg) scale(1.04)`, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      timing,
    );
    const anim = n.querySelector('.tt-cube').animate(
      [{ transform: `rotateX(${fx + spinX * dir}deg) rotateY(${fy - spinY}deg)` }, { transform: `rotateX(${fx}deg) rotateY(${fy}deg)` }],
      timing,
    );
    const end = () => n.classList.remove('rolling');
    anim.finished.then(end, end);
    signal.addEventListener('abort', end);
  });
}

// TUTTO: die herausgelegten Würfel hüpfen der Reihe nach.
function hop(root, signal) {
  root.querySelectorAll('.tt-die.kept .tt-lift').forEach((n, i) => {
    const a = n.animate([{ transform: 'none' }, { transform: 'translateY(-34%) rotate(-8deg)', offset: 0.45 }, { transform: 'none' }], {
      duration: 460,
      delay: 120 + i * 70,
      easing: 'cubic-bezier(.2,.8,.2,1)',
    });
    signal.addEventListener('abort', () => a.cancel());
  });
}

function pulseCard(root, delay, big = false) {
  root.querySelector('.tt-slot .tt-card')?.animate(
    [{ transform: 'none' }, { transform: `translateY(-8%) scale(${big ? 1.12 : 1.06}) rotate(-3deg)`, offset: 0.4 }, { transform: 'none' }],
    { duration: big ? 900 : 560, delay, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}

// Großer Schriftzug über dem Tisch: schlägt ein, steht kurz, geht.
function showBanner(root, text, cls, color, signal) {
  const b = root.querySelector('.tt-banner');
  b.className = `tt-banner ${cls}`;
  b.style.setProperty('--bc', color);
  b.innerHTML = `<span class="tt-banner-in">${[...text].map((ch, i) => `<span style="--k:${i}">${ch}</span>`).join('')}</span>`;
  const long = cls === 'tutto' ? 1350 : 1050;
  const a = b.animate(
    [
      { opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { opacity: 1, offset: 0.8 },
      { opacity: 0 },
    ],
    { duration: long, easing: 'linear', fill: 'forwards' },
  );
  b.querySelectorAll('.tt-banner-in > span').forEach((s, i) => {
    s.animate(
      [{ transform: 'translateY(-40%) scale(1.9)', opacity: 0 }, { transform: 'none', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
      { duration: 380, delay: i * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    );
  });
  signal.addEventListener('abort', () => a.cancel());
}

// Punkte auf der Tafel: zählen hoch (oder runter), Balken wächst mit.
function bumpScore(root, id, from, to, cls, signal) {
  const row = root.querySelector(`.tt-row[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const target = Number(root.dataset.target) || null;
  countUp(row.querySelector('.tt-total'), from, to, 0, 600, signal);
  row.classList.add(cls);
  later(row, signal, 900, () => row.classList.remove(cls));
  if (target) row.querySelector('.tt-fill').style.transform = `scaleX(${Math.min(1, to / target)})`;
}

function countUp(node, from, to, delay, duration, signal) {
  if (from === to) {
    node.textContent = to;
    return;
  }
  node.textContent = from;
  const start = performance.now() + Math.max(0, delay);
  const step = (t) => {
    if (signal.aborted) return;
    const p = Math.min(1, Math.max(0, (t - start) / duration));
    node.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  signal.addEventListener('abort', () => (node.textContent = to));
}

// Auftakt: Tafel, Stapel und Würfel kommen nacheinander.
function intro(root) {
  const ease = 'cubic-bezier(.2,.8,.2,1)';
  root.querySelectorAll('.tt-row').forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(i * 70, 350), easing: ease, fill: 'backwards' }));
  root.querySelectorAll('.tt-pile').forEach((n) => n.animate([{ opacity: 0, transform: 'translateY(-14px) rotate(-6deg)' }, { opacity: 1, transform: 'none' }], { duration: 440, delay: 260, easing: ease, fill: 'backwards' }));
  root.querySelectorAll('.tt-place').forEach((n, i) => n.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 380 + i * 50, easing: ease, fill: 'backwards' }));
  root.querySelectorAll('.tt-die .tt-lift').forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(-60%) rotate(-40deg) scale(1.2)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 480 + i * 70, easing: ease, fill: 'backwards' }));
}

// Spielende: Die Balken der Sieger füllen sich nach, ihre Zeile wird unterstrichen, der Rest tritt zurück.
function finale(root, s, game, signal) {
  const ease = 'cubic-bezier(.2,.8,.2,1)';
  const winners = s.result.winners;
  root.querySelectorAll('.tt-row').forEach((row, i) => {
    const won = winners.includes(row.dataset.id);
    const a = won
      ? row.animate([{ transform: 'none' }, { transform: 'translateX(6px)', offset: 0.5 }, { transform: 'none' }], { duration: 520, delay: 300 + i * 60, easing: ease })
      : row.animate([{ opacity: 1 }, { opacity: 0.45 }], { duration: 420, delay: 600, easing: 'ease-out', fill: 'backwards' });
    signal.addEventListener('abort', () => a.cancel());
  });
  if (s.last?.how === 'klee') pulseCard(root, 200, true);
}

function startTimer(root, s, game, u, signal) {
  const box = root.querySelector('.tt-timer');
  if (!box) return;
  if (!s.deadline || s.result) {
    box.classList.add('off');
    return;
  }
  box.classList.remove('off');
  const total = s.limit * 1000;
  const update = () => {
    const now = game.now();
    const left = Math.max(0, s.deadline - now);
    box.querySelector('.tt-timer-num').textContent = clock(left);
    box.querySelector('i').style.transform = `scaleX(${left / total})`;
    box.classList.toggle('late', left < 10_000);
    // Bei null wird eine Auswahl noch abgeschickt, nach der Nachfrist fragt der Browser nach.
    if (left === 0 && mine(s, game) && s.phase === 'wahl' && u.sel.size && !u.autoSent) {
      u.autoSent = true;
      game.send('legen', { at: s.seq, keep: [...u.sel].sort((a, b) => a - b) });
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

function rulesHTML(s) {
  return `<details class="tt-rules">
    <summary>Regeln</summary>
    <ol>
      <li>Wer dran ist, deckt eine Karte auf und würfelt mit allen sechs Würfeln.</li>
      <li>Einsen zählen hundert, Fünfen fünfzig. Drei gleiche aus einem Wurf sind ein Drilling: drei Einsen tausend, sonst hundertmal die Augenzahl.</li>
      <li>Nach jedem Wurf legst du mindestens einen zählenden Würfel heraus und würfelst mit dem Rest weiter. Oder du hörst auf und schreibst alles auf.</li>
      <li>Zählt kein Würfel, ist es eine Niete: Die Punkte des Zuges sind weg.</li>
      <li>Liegen alle sechs draußen, ist es ein TUTTO. Die Karte zahlt aus, und du kannst aufhören oder mit einer neuen Karte weiterspielen.</li>
      <li>Bonus: Punkte extra beim TUTTO. Mal zwei: Ein TUTTO verdoppelt den Zug. Stop: Der Zug ist vorbei. Feuerwerk: Es geht von selbst bis zur Niete, alles zählt. Straße: eins bis sechs sammeln, bringt zweitausend. Plus/Minus: Ein TUTTO bringt tausend, wer vorne liegt, verliert tausend. Kleeblatt: zweimal hintereinander TUTTO gewinnt sofort.</li>
      <li>Bei Straße, Plus/Minus und Kleeblatt geht es bis zum TUTTO, aufhören geht erst danach.</li>
      <li>Hat am Ende einer Runde jemand ${word(s.target)} Punkte, gewinnt, wer vorne liegt.</li>
      ${s.limit ? `<li>Für jede Entscheidung gibt es ${s.limit === 60 ? 'eine Minute' : 'dreißig Sekunden'}. Danach wird automatisch aufgedeckt, gewürfelt oder aufgehört.</li>` : ''}
    </ol>
  </details>`;
}

export const style = `
  .tt { position: relative; display: grid; gap: 14px; width: 100%; max-width: 560px; --d: 44px; --cw: 70px; --pw: 32px; }

  /* ---------- Punkte auf dem Weg zum Ziel ---------- */
  .tt-left { display: contents; }
  .tt-board { display: grid; gap: 8px 16px; padding-top: 12px; border-top: 2px solid var(--line); }
  .tt.many .tt-board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tt-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 3px 10px; padding: 4px 6px 6px; margin: 0 -6px; border-radius: var(--radius); transition: background-color 260ms ease-out; }
  .tt-row.is-turn { background: color-mix(in srgb, var(--pc) 10%, white); }
  .tt-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-weight: 700; }
  .tt-name-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .tt-total { min-width: 2.6em; color: var(--pc); font: 800 var(--t-xl) / .9 var(--font-display); text-align: right; }
  .tt.many .tt-total { font-size: var(--t-lg); }
  .tt.many .tt-name { font-size: var(--t-sm); }
  .tt-track { grid-column: 1 / -1; position: relative; height: 6px; overflow: hidden; border-radius: var(--radius); background: var(--hairline); }
  .tt-track i { position: absolute; inset: 0; transform-origin: left; transition: transform 600ms cubic-bezier(.2,.8,.2,1); }
  .tt-fill { background: var(--pc); }
  .tt-pend { background: color-mix(in srgb, var(--pc) 35%, white); }
  .tt-row.plus .tt-total { animation: tt-bump 420ms cubic-bezier(.2,.8,.2,1); }
  .tt-row.minus .tt-total { color: var(--bad); animation: tt-shake 420ms ease-in-out; }
  @keyframes tt-bump { 40% { transform: scale(1.18); } }
  @keyframes tt-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  .tt-row.lose { opacity: .45; }
  .tt-row.win .tt-name-text { text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 4px; text-decoration-color: var(--pc); }
  .tt-goal { grid-column: 1 / -1; color: var(--muted); font-size: var(--t-sm); }

  /* ---------- Status und Zeit ---------- */
  .tt-head { display: grid; gap: 6px; }
  .tt-status { min-height: 2.6em; line-height: 1.3; }
  .tt-timer { display: flex; align-items: center; gap: 12px; }
  .tt-timer.off { visibility: hidden; }
  .tt-timer-num { min-width: 2.2em; font-size: var(--t-md); line-height: 1; text-align: right; }
  .tt-timer-bar { flex: 1; height: 3px; overflow: hidden; background: var(--hairline); }
  .tt-timer-bar i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 250ms linear; }
  .tt-timer.late .tt-timer-num { color: var(--bad); }
  .tt-timer.late .tt-timer-bar i { background: var(--bad); }

  /* ---------- Tisch: Stapel, Karte, Punkte im Zug ---------- */
  .tt-table { display: grid; gap: 10px; padding: 12px 0 10px; border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); }
  .tt-cards { display: grid; grid-template-columns: auto auto auto minmax(0, 1fr); align-items: end; gap: 10px; }
  .tt-pile { display: grid; justify-items: center; gap: 4px; }
  .tt-deck { appearance: none; -webkit-appearance: none; display: block; margin: 0; padding: 0; border: 0; background: none; cursor: default; border-radius: var(--radius-m); }
  .tt-deck.ready { cursor: pointer; }
  .tt-deck.ready:active .tt-stack { transform: scale(.96); }
  .tt-deck.ready .tt-stack > .tt-card:last-child { animation: tt-nudge 1400ms ease-in-out 600ms infinite; }
  @keyframes tt-nudge { 0%, 70%, 100% { transform: none; } 80% { transform: translateY(-4px) rotate(-3deg); } }
  .tt-stack { --w: var(--pw); position: relative; display: block; width: var(--pw); height: calc(var(--pw) * 1.5); transition: transform 120ms ease-out; }
  .tt-stack > .tt-card { position: absolute; left: 0; top: 0; }
  .tt-deck .tt-stack > .tt-card:nth-child(1) { transform: translate(-3px, 3px); }
  .tt-deck .tt-stack > .tt-card:nth-child(2) { transform: translate(-1.5px, 1.5px); }
  .tt-count { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .tt-count b { color: var(--ink); font: 800 var(--t-sm) / 1 var(--font-display); }
  .tt-empty { display: block; width: 100%; height: 100%; border: 1.5px dashed var(--hairline); border-radius: var(--radius-m); }
  .tt-slot { --w: var(--cw); width: var(--cw); height: calc(var(--cw) * 1.5); }
  .tt-turn { display: grid; align-self: stretch; align-content: start; justify-items: end; gap: 2px; text-align: right; }
  .tt-turn-label { color: var(--muted); font-size: var(--t-sm); }
  .tt-turn-pts { color: var(--pc, var(--ink)); font: 800 var(--t-3xl) / .9 var(--font-display); text-align: right; }
  .tt-turn-pts.lost { color: var(--bad); text-decoration: line-through; text-decoration-thickness: 3px; }
  .tt-turn-sub { min-height: 1.3em; color: var(--muted); font-size: var(--t-sm); white-space: nowrap; }
  .tt-turn-sub b { color: var(--ink); font: 800 var(--t-md) / 1 var(--font-display); }
  .tt-rule { min-height: 2.6em; line-height: 1.3; font-size: var(--t-sm); }
  .tt-rule-name { font: 800 var(--t-base) / 1 var(--font-display); letter-spacing: .02em; }

  /* ---------- Karten ---------- */
  .tt-card { position: relative; width: var(--w); height: calc(var(--w) * 1.5); perspective: 600px; }
  .tt-inner { position: absolute; inset: 0; transform-style: preserve-3d; }
  .tt-side { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .tt-side svg { display: block; width: 100%; height: 100%; }
  .tt-back { transform: rotateY(180deg); }
  .tt-card.down .tt-inner { transform: rotateY(180deg); }
  .tt-card.ghost { pointer-events: none; }

  /* ---------- Würfeltisch: oben die herausgelegten, unten der Wurf ---------- */
  .tt-felt {
    --lane: calc(var(--d) * .78 + 10px);
    --table-y: calc(var(--lane) + var(--d) * .42);
    position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
    height: calc(var(--table-y) + var(--d) * 1.18);
  }
  .tt-felt::before {
    content: ''; position: absolute; left: 0; right: 0; top: var(--lane);
    border-top: 1px dashed var(--hairline);
  }
  .tt-place, .tt-die { grid-row: 1; grid-column: var(--c); justify-self: center; align-self: start; }
  .tt-place { width: calc(var(--d) * .78); height: calc(var(--d) * .78); margin-top: 3px; border: 1.5px dashed var(--hairline); border-radius: 22%; }
  .tt-die {
    --h: calc(var(--d) / 2); --ty: var(--table-y); --sc: 1; --jx: var(--hx, 0); --jy: var(--hy, 0); --rz: var(--hr, 0deg);
    appearance: none; -webkit-appearance: none; position: relative; z-index: 1;
    width: var(--d); height: var(--d); margin: 0; padding: 0; border: 0; background: none; border-radius: 22%;
    perspective: 340px; cursor: default; color: inherit;
    transform: translate(calc(var(--jx) * var(--d)), calc(var(--ty) + var(--jy) * var(--d))) rotate(var(--rz)) scale(var(--sc));
    transform-origin: 50% 50%;
    transition: transform 440ms cubic-bezier(.6,0,.2,1), opacity 220ms ease-out;
  }
  .tt-die.kept { --ty: calc(var(--d) * -.11 + 3px); --sc: .78; --jx: 0; --jy: 0; --rz: 0deg; }
  .tt-die.idle { opacity: .45; }
  .tt-die.no { opacity: .4; }
  .tt-die.can { cursor: pointer; }
  .tt-die.can::after { content: ''; position: absolute; inset: -4px; border: 2px solid var(--ink); border-radius: 26%; opacity: .0; transition: opacity 160ms ease-out; }
  .tt-die.can::after { opacity: .35; }
  @media (hover: hover) { .tt-die.can:hover::after { opacity: .8; } }
  .tt-die.sel { --ty: calc(var(--table-y) - var(--d) * .26); }
  .tt-die.sel::after { opacity: 1; border-color: var(--pc); border-width: 3px; }
  .tt-die.can:active .tt-lift { transform: scale(.94); }
  .tt-lift { display: block; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 140ms ease-out; }
  .tt-cube { position: relative; display: block; width: 100%; height: 100%; transform-style: preserve-3d; }
  .tt-pipface {
    position: absolute; inset: 0; display: block;
    border: max(1.5px, calc(var(--d) * .034)) solid var(--ink); border-radius: 22%; background: #fffdf6;
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .tt-pipface svg { display: block; width: 100%; height: 100%; fill: var(--ink); }
  .tt-core { position: absolute; inset: 2px; border-radius: 22%; background: var(--ink); visibility: hidden; }
  .tt-die.rolling .tt-core { visibility: visible; }
  .tt-core-x { transform: rotateX(90deg); }
  .tt-core-y { transform: rotateY(90deg); }
  .tt-die.dud .tt-pipface { border-color: var(--bad); }
  .tt-die.dud .tt-lift { animation: tt-dud 420ms ease-in-out 60ms both; }
  @keyframes tt-dud { 25% { transform: translateX(-12%) rotate(-6deg); } 60% { transform: translateX(9%) rotate(5deg); } 100% { transform: none; } }
  .tt-felt.shaking .tt-die:not(.kept) .tt-lift { animation: tt-rattle 130ms ease-in-out infinite alternate; }
  .tt-felt.shaking .tt-die:nth-of-type(2n) .tt-lift { animation-delay: -65ms; }
  @keyframes tt-rattle { from { transform: translateY(-2px) rotate(-7deg); } to { transform: translateY(1px) rotate(7deg); } }

  /* Großer Schriftzug: TUTTO, Niete, Stop */
  .tt-banner { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; opacity: 0; pointer-events: none; }
  .tt-banner-in { display: flex; padding: 0 .2em; background: var(--paper); color: var(--bc); font: 900 calc(var(--d) * 1.5) / 1 var(--font-display); letter-spacing: .04em; }
  .tt-banner-in > span { display: inline-block; }
  .tt-banner.niete .tt-banner-in { border: 4px solid var(--bc); border-radius: var(--radius-m); padding: .06em .3em 0; font-size: calc(var(--d) * 1.05); text-transform: uppercase; rotate: -6deg; }
  .tt-banner.zeit .tt-banner-in { font-size: calc(var(--d) * .8); }

  /* ---------- Letzter Zug und Knöpfe ---------- */
  .tt-log { min-height: 1.3em; font-size: var(--t-sm); }
  .tt-log .num { font-size: 1.15em; line-height: 1; }
  .tt-log-cap { color: var(--muted); margin-right: 4px; }
  .tt-bar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; max-width: 26rem; }
  .tt-bar.off { visibility: hidden; }
  .tt-bar .btn { min-width: 0; padding-left: 8px; padding-right: 8px; }
  .tt-bar .btn:active:not(:disabled) { transform: scale(.96); }

  /* ---------- Regeln ---------- */
  .tt-rules { padding-top: 10px; border-top: 1px solid var(--hairline); font-size: var(--t-sm); }
  .tt-rules summary { width: max-content; cursor: pointer; font-weight: 700; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .tt-rules ol { display: grid; gap: 4px; max-width: 60ch; margin-top: 8px; padding-left: 1.4em; list-style: decimal; }

  @media (min-width: 600px) {
    .tt { --d: 54px; --cw: 92px; --pw: 44px; }
  }

  /* ---------- Bildschirm: links die Punkte, rechts der Tisch groß ---------- */
  .tt-tv { max-width: none; --d: 5.2rem; --cw: 9.4rem; --pw: 4.4rem; gap: 2vh 4vw; }
  .tt-tv .tt-bar, .tt-tv .tt-rules { display: none; }
  .tt-tv .tt-board, .tt-tv.many .tt-board { grid-template-columns: minmax(0, 1fr); gap: .6rem; }
  .tt-tv .tt-name, .tt-tv.many .tt-name { font: 800 var(--t-lg) / 1.1 var(--font-display); }
  .tt-tv .tt-total, .tt-tv.many .tt-total { font-size: var(--t-2xl); }
  .tt-tv .tt-track { height: .5rem; }
  .tt-tv .tt-status { font-size: var(--t-lg); }
  .tt-tv .tt-log, .tt-tv .tt-goal { font-size: var(--t-base); }
  .tt-tv .tt-rule { font-size: var(--t-base); }
  .tt-tv .tt-rule-name { font-size: var(--t-md); }
  .tt-tv .tt-count { font-size: var(--t-sm); }
  .tt-tv .tt-count b { font-size: var(--t-base); }
  .tt-tv .tt-turn-label, .tt-tv .tt-turn-sub { font-size: var(--t-base); }
  .tt-tv .tt-turn-pts { font-size: var(--t-4xl); }
  .tt-tv .tt-cards { gap: 1.6rem; }
  .tt-tv .tt-timer-num { font-size: var(--t-xl); }
  @media (min-width: 880px) and (orientation: landscape) {
    .tt-tv { grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr); grid-template-areas: "left table" "left log"; grid-template-rows: auto 1fr; align-items: start; }
    .tt-tv .tt-left { grid-area: left; display: grid; gap: 2vh; align-content: start; }
    .tt-tv .tt-log { grid-area: log; }
    .tt-tv .tt-table { grid-area: table; max-width: 50rem; }
    .tt-tv .tt-log { max-width: 50rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tt *, .tt *::before, .tt *::after { animation: none !important; transition: none !important; }
  }
`;
