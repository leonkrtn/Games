// Flip 7: Karten ziehen, solange man sich traut.
//
// Stapel (94 Karten): Zahlen von null bis zwölf, jede Zahl so oft, wie sie hoch ist (die Null einmal),
// dazu Bonuskarten (+2, +4, +6, +8, +10, ×2) und je drei Aktionskarten: Einfrieren, Drei ziehen,
// Zweite Chance. Jede Runde bekommt jeder eine Karte, danach ist man reihum dran: noch eine Karte
// oder aufhören. Zwei bis sechs Spieler. Eine Zahl doppelt heißt raus mit null Punkten (außer eine Zweite Chance rettet).
// Sieben verschiedene Zahlen sind „Flip 7“: fünfzehn Bonuspunkte, und die Runde endet sofort.
// Einfrieren und Drei ziehen treffen, wen der Ziehende wählt (auch sich selbst). Karten aus Drei ziehen
// werden einzeln aufgedeckt, dabei gezogene Aktionen erst danach ausgeführt.
// Wertung: Zahlen zusammen, ×2 verdoppelt sie, dann kommen die Bonuskarten dazu. Wer nach einer Runde
// das Ziel erreicht hat (Einstellung in der Lobby) und vorne liegt, gewinnt.
//
// Geheim: die Reihenfolge des Stapels (view verrät nur, wie viele Karten noch drin sind).
//
// Motion: Jede Karte kommt verdeckt vom Stapel und dreht sich an ihrem Platz um, die übrigen Karten
// rücken zur Seite. Ereignisse eines Zuges (z.B. drei Karten) laufen nacheinander ab. Eine doppelte Zahl
// wird rot durchgestrichen, bei Flip 7 heben sich die sieben Zahlen nacheinander, am Rundenende fliegen
// die Karten auf die Ablage.

export const meta = {
  name: 'Flip 7',
  description: 'Zieht Karten, solange ihr euch traut. Eine Zahl doppelt, und die Runde zählt nichts.',
  players: [2, 6],
  options: [
    {
      id: 'ziel',
      label: 'Ziel',
      choices: [
        { value: 200, label: 'Zweihundert Punkte' },
        { value: 100, label: 'Hundert Punkte' },
        { value: 50, label: 'Fünfzig Punkte' },
      ],
    },
  ],
};

const MODS = { '+2': 2, '+4': 4, '+6': 6, '+8': 8, '+10': 10 };
const FLIP7_BONUS = 15;
const isNum = (c) => typeof c === 'number';

const ids = (s) => s.players.map((p) => p.id);
const nextAfter = (s, id) => ids(s)[(ids(s).indexOf(id) + 1) % s.players.length];
// Alle Spieler reihum, beginnend mit `id`
const around = (s, id) => {
  const list = ids(s);
  const i = list.indexOf(id);
  return [...list.slice(i), ...list.slice(0, i)];
};
const nameOf = (s, id) => s.players.find((p) => p.id === id).name;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function newDeck() {
  const deck = [0];
  for (let n = 1; n <= 12; n++) for (let k = 0; k < n; k++) deck.push(n);
  deck.push('+2', '+4', '+6', '+8', '+10', 'x2');
  for (const a of ['freeze', 'flip3', 'second']) deck.push(a, a, a);
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
  const s = {
    players,
    target: [100, 50].includes(options.ziel) ? options.ziel : 200,
    deck: newDeck(), // oben = letzte Karte
    discard: [],
    round: 0,
    dealer: pick(players).id,
    turn: null,
    after: null, // wer zuletzt am Zug war (danach ist der Nächste dran, der noch mitspielt)
    phase: 'zug', // zug | ziel (Aktionskarte braucht ein Ziel) | pause (Runde vorbei) | ende
    hands: {},
    totals: Object.fromEntries(players.map((p) => [p.id, 0])),
    todo: [], // was noch abzuarbeiten ist: { draw: id, f3? } oder { act, by, f3? }
    choice: null, // { act: 'freeze' | 'flip3', by }
    seq: 0, // zählt Ereignisse, dient auch gegen doppeltes Tippen
    events: [], // die letzten Ereignisse, für Anzeige und Animation
    last: null, // Punkte der letzten Runde
  };
  startRound(s);
  return s;
}

export function action(s, { player, type, data }) {
  if (!s.hands[player]) throw new Error('Du spielst nicht mit.');
  if (data?.at !== s.seq) return; // gehört zu einem älteren Stand (doppelt getippt)

  if (type === 'weiter') {
    if (s.phase === 'pause') startRound(s);
    return;
  }
  if (type === 'ziel') {
    if (s.phase !== 'ziel') return;
    if (player !== s.choice.by) throw new Error(`${nameOf(s, s.choice.by)} entscheidet.`);
    const target = String(data.target);
    if (!s.players.some((p) => p.id === target) || s.hands[target].state !== 'aktiv') {
      throw new Error('Wer schon aus der Runde ist, kann nicht getroffen werden.');
    }
    s.todo.shift();
    resolve(s, s.choice.act, player, target);
    s.choice = null;
    return run(s);
  }
  if (s.phase !== 'zug') return;
  if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);
  s.after = player;
  if (type === 'ziehen') {
    s.todo.push({ draw: player });
    return run(s);
  }
  if (type === 'aufhoeren') {
    s.hands[player].state = 'stopp';
    ev(s, { kind: 'stopp', who: player });
    return run(s);
  }
}

// Der Stapel ist geheim, ebenso was noch abzuarbeiten ist.
export function view(s) {
  const { deck, discard, todo, ...rest } = s;
  return { ...rest, deck: deck.length, discard: discard.length, top: discard.at(-1) ?? null };
}

export function waitingFor(s) {
  if (s.phase === 'zug') return [s.turn];
  if (s.phase === 'ziel') return [s.choice.by];
  if (s.phase === 'pause') return [s.dealer]; // fängt die nächste Runde an
  return [];
}

export function notices(s, before, player) {
  const fresh = s.phase !== before.phase || s.turn !== before.turn || s.round !== before.round;
  const was = waitingFor(before);
  return waitingFor(s)
    .filter((id) => fresh || !was.includes(id))
    .map((id) => ({ to: id, text: noticeText(s, before, id) }));
}

function noticeText(s, before, id) {
  const name = (x) => nameOf(s, x);
  if (s.phase === 'pause') {
    return `Runde ${word(s.round)} ist vorbei. Du bekommst ${word(s.last.points[id])} Punkte.`;
  }
  if (s.phase === 'ziel') return `Du hast ${s.choice.act === 'freeze' ? 'Einfrieren' : 'Drei ziehen'} gezogen. Wen soll es treffen?`;
  const latest = s.events.filter((e) => e.id > before.seq && !['runde', 'ende'].includes(e.kind)).at(-1);
  return `${latest ? `${describe(latest, id, name)} ` : ''}Du bist dran.`;
}

// --- Ablauf einer Runde ---

function startRound(s) {
  for (const p of s.players) s.discard.push(...(s.hands[p.id]?.cards ?? []));
  if (s.round > 0) s.dealer = nextAfter(s, s.dealer);
  s.round++;
  s.hands = Object.fromEntries(s.players.map((p) => [p.id, { cards: [], state: 'aktiv', bust: null }]));
  s.choice = null;
  s.phase = 'zug';
  s.after = s.dealer; // nach dem Austeilen ist der Nächste nach dem Geber dran
  s.todo = around(s, nextAfter(s, s.dealer)).map((id) => ({ draw: id })); // reihum, der Geber zuletzt
  ev(s, { kind: 'runde', round: s.round });
  run(s);
}

// Arbeitet ab, was ansteht, bis jemand entscheiden muss oder die Runde vorbei ist.
function run(s) {
  while (s.todo.length && !s.players.some((p) => s.hands[p.id].state === 'flip7')) {
    const t = s.todo[0];
    if ('draw' in t) {
      s.todo.shift();
      if (s.hands[t.draw].state === 'aktiv') draw(s, t.draw, t.f3);
      continue;
    }
    // Einfrieren oder Drei ziehen: verfällt, wenn der Ziehende inzwischen raus ist
    if (s.hands[t.by].state !== 'aktiv') {
      s.todo.shift();
      continue;
    }
    const targets = active(s);
    if (targets.length === 1) {
      s.todo.shift();
      resolve(s, t.act, t.by, targets[0]);
      continue;
    }
    s.phase = 'ziel';
    s.choice = { act: t.act, by: t.by };
    return;
  }
  s.todo = [];
  s.choice = null;
  if (s.players.some((p) => s.hands[p.id].state === 'flip7') || !active(s).length) return endRound(s);
  s.phase = 'zug';
  // Der Nächste, der noch mitspielt (zuletzt wieder, wer gerade dran war)
  s.turn = [...around(s, s.after).slice(1), s.after].find((id) => s.hands[id].state === 'aktiv');
}

const active = (s) => s.players.map((p) => p.id).filter((id) => s.hands[id].state === 'aktiv');

function takeCard(s) {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s.discard);
    s.discard = [];
    ev(s, { kind: 'mischen' });
  }
  return s.deck.length ? s.deck.pop() : null;
}

// key: Karte und wie oft sie schon in der Hand liegt (für die Anzeige, damit jede Karte einen Platz hat)
const keyFor = (hand, card) => `${card}:${hand.cards.filter((c) => c === card).length}`;

function draw(s, id, f3) {
  const hand = s.hands[id];
  const card = takeCard(s);
  if (card === null) {
    // Alle Karten liegen auf dem Tisch: wer ziehen müsste, hört auf.
    hand.state = 'stopp';
    ev(s, { kind: 'stopp', who: id });
    return;
  }
  if (isNum(card)) {
    if (hand.cards.includes(card)) {
      if (hand.cards.includes('second')) {
        hand.cards.splice(hand.cards.indexOf('second'), 1);
        s.discard.push(card, 'second');
        ev(s, { kind: 'gerettet', who: id, card });
        return;
      }
      ev(s, { kind: 'pleite', who: id, card, key: keyFor(hand, card) });
      hand.cards.push(card);
      hand.state = 'raus';
      hand.bust = card;
      // Rest von Drei ziehen und aufgeschobene Aktionen dieser Person verfallen
      s.todo = s.todo.filter((t) => t.draw !== id && t.by !== id);
      return;
    }
    ev(s, { kind: 'karte', who: id, card, key: keyFor(hand, card) });
    hand.cards.push(card);
    if (new Set(hand.cards.filter(isNum)).size === 7) {
      hand.state = 'flip7';
      ev(s, { kind: 'flip7', who: id });
    }
    return;
  }
  if (card === 'second' && hand.cards.includes('second')) {
    // Nur eine Zweite Chance pro Person: die zweite geht an den Nächsten ohne, sonst auf die Ablage.
    const to = around(s, id).find((o) => o !== id && s.hands[o].state === 'aktiv' && !s.hands[o].cards.includes('second'));
    if (to) {
      ev(s, { kind: 'weiter', who: to, from: id, card, key: keyFor(s.hands[to], card) });
      s.hands[to].cards.push(card);
    } else {
      s.discard.push(card);
      ev(s, { kind: 'weg', who: id, card });
    }
    return;
  }
  ev(s, { kind: 'karte', who: id, card, key: keyFor(hand, card) });
  hand.cards.push(card);
  if (card !== 'freeze' && card !== 'flip3') return;
  const item = { act: card, by: id };
  if (f3 === undefined) {
    s.todo.unshift(item);
    return;
  }
  // Während Drei ziehen: erst, wenn alle drei Karten aufgedeckt sind
  let at = 0;
  s.todo.forEach((t, i) => {
    if (t.f3 === f3) at = i + 1;
  });
  s.todo.splice(at, 0, item);
}

function resolve(s, act, by, target) {
  if (act === 'freeze') {
    s.hands[target].state = 'frost';
    ev(s, { kind: 'frost', who: target, by });
    return;
  }
  ev(s, { kind: 'drei', who: target, by });
  const group = s.seq;
  s.todo.unshift({ draw: target, f3: group }, { draw: target, f3: group }, { draw: target, f3: group });
}

function endRound(s) {
  const points = {};
  for (const p of s.players) {
    points[p.id] = roundPoints(s.hands[p.id]);
    s.totals[p.id] += points[p.id];
  }
  s.last = { round: s.round, points };
  ev(s, { kind: 'ende', points });
  const top = Math.max(...Object.values(s.totals));
  const leaders = s.players.filter((p) => s.totals[p.id] === top);
  if (top >= s.target && leaders.length === 1) {
    s.phase = 'ende';
    const w = leaders[0];
    const others = ids(s).filter((id) => id !== w.id);
    s.result = {
      winners: [w.id],
      text:
        others.length === 1
          ? `${w.name} gewinnt mit ${word(top)} zu ${word(s.totals[others[0]])} Punkten.`
          : `${w.name} gewinnt mit ${word(top)} Punkten.`,
    };
    return;
  }
  s.phase = 'pause'; // bei Gleichstand über dem Ziel geht es weiter
}

// Zahlen zusammen, ×2 verdoppelt sie, dann die Bonuskarten und bei Flip 7 fünfzehn dazu.
function roundPoints(hand) {
  if (hand.state === 'raus') return 0;
  let sum = hand.cards.filter(isNum).reduce((a, b) => a + b, 0);
  if (hand.cards.includes('x2')) sum *= 2;
  for (const c of hand.cards) if (c in MODS) sum += MODS[c];
  if (hand.state === 'flip7') sum += FLIP7_BONUS;
  return sum;
}

function ev(s, e) {
  s.seq++;
  s.events.push({ id: s.seq, ...e });
  if (s.events.length > 40) s.events.splice(0, s.events.length - 40);
}

// --- Texte ---

const NOUN = ['Null', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Elf', 'Zwölf'];
const ACTION_NAME = { freeze: 'Einfrieren', flip3: 'Drei ziehen', second: 'Zweite Chance' };

function cardText(c) {
  if (isNum(c)) return `eine ${NOUN[c]}`;
  if (c in MODS) return `die Plus ${word(MODS[c])}`;
  if (c === 'x2') return 'die Mal zwei';
  if (c === 'second') return 'eine Zweite Chance';
  return `die Karte ${ACTION_NAME[c]}`;
}

// Ein Ereignis als Satz aus Sicht von `me`. name(id) liefert den (schon sicheren) Namen.
function describe(e, me, name) {
  const you = (id) => id === me;
  const who = (id) => (you(id) ? 'Du' : name(id));
  const v = (id, du, er) => (you(id) ? du : er);
  switch (e.kind) {
    case 'karte':
      return `${who(e.who)} ${v(e.who, 'ziehst', 'zieht')} ${cardText(e.card)}.`;
    case 'pleite':
      return `${who(e.who)} ${v(e.who, 'ziehst', 'zieht')} eine zweite ${NOUN[e.card]} und ${v(e.who, 'bist', 'ist')} raus.`;
    case 'gerettet':
      return `${who(e.who)} ${v(e.who, 'ziehst', 'zieht')} eine zweite ${NOUN[e.card]}, die Zweite Chance rettet.`;
    case 'weiter':
      return `${who(e.who)} ${v(e.who, 'bekommst', 'bekommt')} die übrige Zweite Chance.`;
    case 'weg':
      return 'Die übrige Zweite Chance kommt auf die Ablage.';
    case 'stopp':
      return `${who(e.who)} ${v(e.who, 'hörst', 'hört')} auf.`;
    case 'frost':
      return e.by === e.who
        ? `${who(e.by)} ${v(e.by, 'frierst dich', 'friert sich')} selbst ein.`
        : `${who(e.by)} ${v(e.by, 'frierst', 'friert')} ${you(e.who) ? 'dich' : name(e.who)} ein.`;
    case 'drei':
      return `${who(e.who)} ${v(e.who, 'musst', 'muss')} drei Karten ziehen.`;
    case 'flip7':
      return `Flip 7! ${who(e.who)} ${v(e.who, 'hast', 'hat')} sieben verschiedene Zahlen.`;
    case 'mischen':
      return 'Der Ablagestapel wird neu gemischt.';
    default:
      return '';
  }
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

const INK = '#141414';
// Gedämpfte Druckfarben, eine pro Zahl
const NUM_COLOR = ['#7d7d7d', '#9a7b3c', '#3c8070', '#c0592f', '#3a6b98', '#6f8a2c', '#b03a3a', '#2e7d4f', '#b8801a', '#4d7280', '#8f4a2a', '#2f8585', '#5c5c2e'];
const ICE = '#3a6b98'; // auch für den Stempel „Eingefroren“
// Eigene Illustrationen (Skill „zeichnen“): Tuschekontur, gedämpfte Druckfarben
const C = {
  ice: '#cfe0ee', iceDark: '#2a4f73', clover: '#2e7d4f', cloverLight: '#cfe3c4', rust: '#c0592f', backTint: '#ece7dc',
};
const pic = (inner) => `<svg viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`;
// Eiskristall: ein Arm mit Seitenästen und Rautenspitze, sechsmal gedreht
const arm = (a) => `<g transform="rotate(${a} 50 50)">
  <path d="M50 50 V11 M50 33 L41.5 24.5 M50 33 L58.5 24.5 M50 21 L44 15 M50 21 L56 15" />
  <path d="M50 4.5 L54 9.5 L50 14.5 L46 9.5 Z" class="spitze"/>
</g>`;
// Sechseck in der Mitte des Kristalls
const HEX = `${Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i + Math.PI / 6;
  return `${i ? 'L' : 'M'}${(50 + 10 * Math.cos(a)).toFixed(2)} ${(50 + 10 * Math.sin(a)).toFixed(2)}`;
}).join(' ')} Z`;
// Spielkarte im Fächer, gedreht um einen Punkt unter der Hand
const card = (x, y, w, h, rot, inner) => `<g transform="rotate(${rot} 50 97)">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#fff" stroke="${INK}" stroke-width="3.5"/>${inner}</g>`;
// Herzförmiges Kleeblatt mit hellem V-Zeichen
const leaflet = (rot) => `<g transform="rotate(${rot} 50 50)">
  <path d="M50 50 C44 44 33.5 40 33.5 29.5 C33.5 21.5 42 17.5 48 22.5 C49.2 23.5 50 25 50 26.5 C50 25 50.8 23.5 52 22.5 C58 17.5 66.5 21.5 66.5 29.5 C66.5 40 56 44 50 50 Z" fill="${C.clover}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M41.5 31.5 L50 38 L58.5 31.5" fill="none" stroke="${C.cloverLight}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M50 47 V29" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity=".45"/>
</g>`;

const ICON = {
  freeze: pic(`
  <g fill="none" stroke="${C.iceDark}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">${[0, 60, 120, 180, 240, 300].map(arm).join('')}</g>
  <g fill="none" stroke="${C.ice}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${[0, 60, 120, 180, 240, 300].map(arm).join('')}</g>
  <path d="${HEX}" fill="${C.ice}" stroke="${C.iceDark}" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="3" fill="${C.iceDark}"/>`),
  flip3: pic(`
  ${card(33, 44, 34, 48, -30, `<rect x="37" y="48" width="26" height="40" rx="2" fill="${C.backTint}" stroke="${INK}" stroke-width="1.5"/><circle cx="50" cy="68" r="6.5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`)}
  ${card(33, 44, 34, 48, 30, `<rect x="37" y="48" width="26" height="40" rx="2" fill="${C.backTint}" stroke="${INK}" stroke-width="1.5"/><circle cx="50" cy="68" r="6.5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`)}
  <g class="gezogen" transform="rotate(-9 50 34)">
    <rect x="31" y="5" width="38" height="56" rx="4" fill="#fff" stroke="${INK}" stroke-width="3.5"/>
    <rect x="34.5" y="8.5" width="31" height="49" rx="2" fill="none" stroke="${INK}" stroke-width=".9" opacity=".35"/>
    <text x="50" y="45" text-anchor="middle" style="font:800 36px var(--font-display);fill:${C.rust}">3</text>
    <text x="37.5" y="18" style="font:800 9px var(--font-display);fill:${C.rust}">3</text>
  </g>
  <path d="M19 36 L11 32 M18.5 46 L9 46 M81 36 L89 32 M81.5 46 L91 46" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`),
  second: pic(`
  <path d="M53 54 C59 66 62 78 74 91" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <path d="M53 54 C59 66 62 78 74 91" fill="none" stroke="${C.clover}" stroke-width="3.2" stroke-linecap="round"/>
  ${[42, 130, 222, 312].map(leaflet).join('')}
  <circle cx="50" cy="50" r="3.2" fill="${C.cloverLight}" stroke="${INK}" stroke-width="2"/>
  <path d="M37 22.5 C35.5 24.5 35 27 35.5 29" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`),
};

// Schraffur, rechnerisch auf ein Rechteck zugeschnitten (ohne clipPath, damit keine ids nötig sind)
function hatch(x0, y0, x1, y1, step, dir) {
  const lines = [];
  for (let c = -(y1 - y0); c <= x1 - x0; c += step) {
    // Linie: dir 1 → von links unten nach rechts oben
    const a = { x: x0 + c, y: dir > 0 ? y1 : y0 };
    const b = { x: x0 + c + (y1 - y0), y: dir > 0 ? y0 : y1 };
    // zuschneiden auf x0..x1
    const clip = (p, q) => {
      let [px, py, qx, qy] = [p.x, p.y, q.x, q.y];
      const k = (qy - py) / (qx - px);
      if (px < x0) { py += (x0 - px) * k; px = x0; }
      if (qx > x1) { qy -= (qx - x1) * k; qx = x1; }
      return px < qx ? `M${px.toFixed(1)} ${py.toFixed(1)} L${qx.toFixed(1)} ${qy.toFixed(1)}` : '';
    };
    lines.push(clip(a, b));
  }
  return lines.filter(Boolean).join(' ');
}
// Rückseite: Doppelrahmen, Kreuzschraffur, Ecksterne, Medaillon mit der Sieben
const BACK = `<svg class="f7-backart" viewBox="0 0 60 90" preserveAspectRatio="none" aria-hidden="true">
  <rect x="0" y="0" width="60" height="90" fill="#fff"/>
  <path d="${hatch(7, 7, 53, 83, 5, 1)}" stroke="${INK}" stroke-width=".7" opacity=".28"/>
  <path d="${hatch(7, 7, 53, 83, 5, -1)}" stroke="${INK}" stroke-width=".7" opacity=".18"/>
  <rect x="4" y="4" width="52" height="82" rx="2.5" fill="none" stroke="${INK}" stroke-width="1.4"/>
  <rect x="7" y="7" width="46" height="76" rx="1.5" fill="none" stroke="${INK}" stroke-width=".7"/>
  <g fill="${INK}">${[[7, 7], [53, 7], [7, 83], [53, 83]].map(([x, y]) => `<path d="M${x} ${y - 3} L${x + 3} ${y} L${x} ${y + 3} L${x - 3} ${y} Z"/>`).join('')}</g>
  <circle cx="30" cy="45" r="16" fill="#fff" stroke="${INK}" stroke-width=".8"/>
  <circle cx="30" cy="45" r="12.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
  <text x="30" y="52" text-anchor="middle" style="font:800 20px var(--font-display);fill:${INK}">7</text></svg>`;
const XMARK = `<svg class="f7-x" viewBox="0 0 40 60" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M5 8 L35 52"/><path pathLength="1" d="M35 8 L5 52"/></svg>`;

const ORDER = (c) => (isNum(c) ? c : c in MODS ? 20 + MODS[c] : c === 'x2' ? 40 : c === 'second' ? 50 : c === 'freeze' ? 60 : 70);

function cardName(c) {
  if (isNum(c)) return NOUN[c];
  if (c in MODS) return `Plus ${word(MODS[c])}`;
  if (c === 'x2') return 'Mal zwei';
  return ACTION_NAME[c];
}

function cardHTML(c, o = {}) {
  let kind;
  let front;
  if (isNum(c)) {
    kind = 'num';
    front = `<span class="f7-corner">${c}</span><span class="f7-big">${c}</span>`;
  } else if (c in MODS || c === 'x2') {
    kind = 'mod';
    const label = c === 'x2' ? '×2' : c;
    front = `<span class="f7-corner">${label}</span><span class="f7-big f7-big-mod">${label}</span><span class="f7-label">Bonus</span>`;
  } else {
    kind = 'act';
    front = `<span class="f7-corner f7-corner-icon">${ICON[c]}</span><span class="f7-icon">${ICON[c]}</span><span class="f7-label">${ACTION_NAME[c]}</span>`;
  }
  const color = isNum(c) ? NUM_COLOR[c] : INK;
  const cls = ['f7-card', `f7-card--${kind}`, o.dup && 'dup', o.cls].filter(Boolean).join(' ');
  return `<div class="${cls}" ${o.id ? `data-id="${o.id}"` : ''} style="--c:${color};--i:${o.i ?? 0}" role="img" aria-label="${cardName(c)}">
    <div class="f7-inner"><div class="f7-face f7-front">${front}${o.dup ? XMARK : ''}</div><div class="f7-face f7-back">${BACK}</div></div>
  </div>`;
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;

const STEP = 430; // ms zwischen zwei Ereignissen eines Zuges
const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, ctrl: null, seen: 0, log: '', pts: {} };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => u.ctrl?.abort());
  }
  return u;
}

export function render(el, s, game) {
  const u = local(el, game);
  u.ctrl?.abort();
  u.ctrl = new AbortController();
  const motion = !game.reducedMotion;

  let root = el.querySelector(':scope > .f7');
  if (!root) {
    el.innerHTML = `<div class="f7">
      <div class="f7-board"></div>
      <p class="status f7-status"></p>
      <div class="f7-others"></div>
      <div class="f7-table"></div>
      <section class="f7-seat f7-me"></section>
      <div class="f7-bar"></div>
      ${rulesHTML(s)}
    </div>`;
    root = el.firstElementChild;
  }
  const q = (sel) => root.querySelector(sel);
  const me = game.me;
  const others = around(s, me).slice(1); // die anderen in Spielreihenfolge nach mir

  // Wo lagen die Karten bisher? (für das Nachrücken und das Abräumen)
  const rootBefore = root.getBoundingClientRect();
  const before = new Map();
  if (motion && !game.first) {
    root.querySelectorAll('.f7-hand .f7-card').forEach((n) => {
      const r = n.getBoundingClientRect();
      before.set(n.dataset.id, { node: n, x: r.left - rootBefore.left, y: r.top - rootBefore.top, w: r.width, h: r.height });
    });
  }

  // Neue Ereignisse bekommen nacheinander ihren Zeitpunkt.
  const fresh = game.first ? [] : s.events.filter((e) => e.id > u.seen);
  u.seen = s.events.at(-1)?.id ?? 0;
  const at = new Map(fresh.map((e, j) => [e.id, j * STEP]));

  q('.f7-board').innerHTML = boardHTML(s, game, game.first);
  q('.f7-status').innerHTML = statusHTML(s, game);
  const othersBox = q('.f7-others');
  othersBox.classList.toggle('many', others.length > 2);
  if (othersBox.children.length !== others.length) {
    othersBox.innerHTML = others.map(() => '<section class="f7-seat f7-them"></section>').join('');
  }
  const seats = [...others.map((id, k) => [othersBox.children[k], id]), [q('.f7-me'), me]];
  for (const [seat, id] of seats) {
    seat.className = `f7-seat ${id === me ? 'f7-me' : 'f7-them'} is-${s.hands[id].state}`;
    seat.style.setProperty('--pc', game.color(id));
    seat.dataset.who = id;
    seat.innerHTML = seatHTML(s, game, id);
    if (s.phase === 'zug' && s.turn === id) seat.classList.add('is-turn');
  }
  q('.f7-table').innerHTML = tableHTML(s, game);
  const logText = q('.f7-log').innerHTML;
  q('.f7-bar').innerHTML = barHTML(s, game);

  if (!motion) return;
  if (game.first) return intro(root);

  const changed = logText !== u.log;
  u.log = logText;
  if (changed) q('.f7-log').animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: Math.max(0, (fresh.length - 1) * STEP), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  animate(root, s, game, u, fresh, at, before);
}

// --- Bausteine ---

function boardHTML(s, game, intro) {
  const rows = s.players
    .map((p, k) => {
      const total = s.totals[p.id];
      const cls = ['f7-row'];
      if (s.result) cls.push(s.result.winners.includes(p.id) ? 'win' : 'lose');
      if (intro) cls.push('intro');
      return `<div class="${cls.join(' ')}" data-id="${p.id}" style="--pc:${game.color(p.id)};--k:${k}">
        <span class="f7-name">${marker(game, p.id)} ${p.id === game.me ? 'Du' : game.esc(p.name)}</span>
        <span class="f7-total num" data-total aria-label="${word(total)} Punkte">${total}</span>
        <span class="f7-track" aria-hidden="true"><i style="transform:scaleX(${Math.min(1, total / s.target)})"></i></span>
      </div>`;
    })
    .join('');
  return `${rows}<p class="f7-goal ${intro ? 'intro' : ''}">Ziel: ${word(s.target)} Punkte. Runde ${word(s.round)}.</p>`;
}

function statusHTML(s, game) {
  const me = game.me;
  const name = (id) => game.esc(game.name(id));
  if (s.result) {
    const w = s.result.winners[0];
    return `${marker(game, w)} ${w === me ? 'Du hast' : `${name(w)} hat`} das Ziel erreicht.`;
  }
  if (s.phase === 'pause') return `Runde ${word(s.round)} ist vorbei.`;
  if (s.phase === 'ziel') {
    const what = s.choice.act === 'freeze' ? 'Einfrieren' : 'Drei ziehen';
    const by = s.choice.by;
    return by === me
      ? `${marker(game, me)} ${what}: Wen soll es treffen?`
      : `${marker(game, by)} ${name(by)} entscheidet, wen ${what} trifft.`;
  }
  return s.turn === me
    ? `${marker(game, me)} Du bist dran: noch eine Karte oder aufhören?`
    : `${marker(game, s.turn)} ${name(s.turn)} ist dran.`;
}

const BADGE = { stopp: 'Aufgehört', raus: 'Pleite', frost: 'Eingefroren', flip7: 'Flip 7' };

function seatHTML(s, game, id) {
  const hand = s.hands[id];
  const counts = {};
  const cards = hand.cards
    .map((c) => {
      const k = (counts[c] = (counts[c] ?? -1) + 1);
      return { c, key: `${c}:${k}` };
    })
    .sort((a, b) => ORDER(a.c) - ORDER(b.c) || a.key.localeCompare(b.key));
  const dup = hand.state === 'raus' ? hand.bust : null;
  const html = cards
    .map(({ c, key }, i) => cardHTML(c, { id: `${s.round}|${id}|${key}`, i, dup: dup !== null && c === dup }))
    .join('');
  const badge = BADGE[hand.state];
  return `<header class="f7-head">
      <span class="f7-who">${marker(game, id)} ${id === game.me ? 'Du' : game.esc(game.name(id))}</span>
      ${badge ? `<span class="f7-badge f7-badge--${hand.state}">${badge}</span>` : ''}
      <span class="f7-pts num" data-pts aria-label="${word(roundPoints(hand))} Punkte in dieser Runde">${roundPoints(hand)}</span>
    </header>
    <div class="f7-hand" style="--n:${cards.length}">${html}</div>`;
}

function tableHTML(s, game) {
  const latest = s.events.filter((e) => !['runde', 'ende'].includes(e.kind)).at(-1);
  const log = latest ? describe(latest, game.me, (id) => game.esc(game.name(id))) : '';
  return `<div class="f7-pile f7-deck" aria-label="Stapel">
      <span class="f7-stack" aria-hidden="true">${s.deck ? cardHTML(0, { cls: 'f7-down' }).repeat(Math.min(3, s.deck)) : '<span class="f7-empty"></span>'}</span>
      <span class="f7-count"><b class="num">${s.deck}</b> Stapel</span>
    </div>
    <div class="f7-pile f7-discard" aria-label="Ablage">
      <span class="f7-stack" aria-hidden="true">${s.top !== null ? cardHTML(s.top) : '<span class="f7-empty"></span>'}</span>
      <span class="f7-count"><b class="num">${s.discard}</b> Ablage</span>
    </div>
    <p class="f7-log">${log}</p>`;
}

function barHTML(s, game) {
  const me = game.me;
  const value = (o = {}) => game.esc(JSON.stringify({ at: s.seq, ...o }));
  if (s.result) return '';
  if (s.phase === 'pause') return `<button class="btn primary" data-action="weiter" data-value="${value()}">Nächste Runde</button>`;
  if (s.phase === 'zug' && s.turn === me) {
    return `<button class="btn primary" data-action="ziehen" data-value="${value()}">Karte ziehen</button>
      <button class="btn" data-action="aufhoeren" data-value="${value()}">Aufhören</button>`;
  }
  if (s.phase === 'ziel' && s.choice.by === me) {
    return around(s, me)
      .filter((id) => s.hands[id].state === 'aktiv')
      .map((id) => `<button class="btn" data-action="ziel" data-value="${value({ target: id })}">${id === me ? 'Mich' : game.esc(game.name(id))}</button>`)
      .join('');
  }
  return '';
}

function rulesHTML(s) {
  return `<details class="f7-rules">
    <summary>Regeln</summary>
    <ol>
      <li>Im Stapel sind die Zahlen von null bis zwölf, jede so oft, wie sie hoch ist. Dazu kommen Bonuskarten und Aktionskarten.</li>
      <li>Jede Runde bekommt jeder eine Karte. Danach seid ihr ${s.players.length > 2 ? 'reihum' : 'abwechselnd'} dran: noch eine Karte ziehen oder aufhören und die Punkte behalten.</li>
      <li>Wer eine Zahl doppelt zieht, ist raus und bekommt in dieser Runde nichts. Eine Zweite Chance rettet einmal davor.</li>
      <li>Wer sieben verschiedene Zahlen hat, schafft Flip 7: fünfzehn Punkte extra, und die Runde ist sofort vorbei.</li>
      <li>Einfrieren beendet die Runde für die getroffene Person, ihre Punkte zählen. Bei Drei ziehen muss sie drei Karten nehmen. Wer die Karte zieht, wählt, wen sie trifft, auch sich selbst.</li>
      <li>Punkte: Die Zahlen werden zusammengezählt, mal zwei verdoppelt sie, danach kommen die Pluskarten dazu.</li>
      <li>Wer nach einer Runde ${word(s.target)} Punkte hat und vorne liegt, gewinnt.</li>
    </ol>
  </details>`;
}

// --- Bewegung ---

function intro(root) {
  const deck = root.querySelector('.f7-deck .f7-stack').getBoundingClientRect();
  const cards = root.querySelectorAll('.f7-hand .f7-card');
  const step = Math.min(110, 1300 / cards.length); // zu sechst nicht länger als zu zweit
  cards.forEach((n, i) => deal(n, deck, 260 + i * step));
}

// Karte kommt verdeckt vom Stapel und dreht sich an ihrem Platz um.
function deal(n, from, delay) {
  const r = n.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (r.left + r.width / 2);
  const dy = from.top + from.height / 2 - (r.top + r.height / 2);
  const timing = { duration: 440, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
  n.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / r.width})` }, { transform: 'none' }], timing);
  n.querySelector('.f7-inner').animate(
    [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.3 }, { transform: 'none' }],
    timing,
  );
}

function animate(root, s, game, u, fresh, at, before) {
  const signal = game.signal;
  const rootRect = root.getBoundingClientRect();
  const deck = root.querySelector('.f7-deck .f7-stack').getBoundingClientRect();
  const pile = root.querySelector('.f7-discard .f7-stack').getBoundingClientRect();
  const busy = fresh.length ? (fresh.length - 1) * STEP + 480 : 0;

  // Zeitpunkt jeder neu gezogenen Karte
  const cardAt = new Map();
  for (const e of fresh) {
    if (e.key && ['karte', 'pleite', 'weiter'].includes(e.kind)) cardAt.set(`${s.round}|${e.who}|${e.key}`, at.get(e.id));
  }
  const firstNew = Math.min(...cardAt.values(), Infinity);

  const present = new Set();
  root.querySelectorAll('.f7-hand .f7-card').forEach((n) => {
    present.add(n.dataset.id);
    const old = before.get(n.dataset.id);
    if (!old) return deal(n, deck, cardAt.get(n.dataset.id) ?? 0);
    // Nachrücken, wenn eine neue Karte dazwischen kommt
    const r = n.getBoundingClientRect();
    const dx = old.x - (r.left - rootRect.left);
    const dy = old.y - (r.top - rootRect.top);
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 320,
        delay: Number.isFinite(firstNew) ? firstNew : 0,
        easing: 'cubic-bezier(.6,0,.2,1)',
        fill: 'backwards',
      });
    }
  });

  // Abgeräumte Karten fliegen auf die Ablage: am Rundenbeginn alle, sonst die verbrauchte Zweite Chance.
  const roundStart = fresh.find((e) => e.kind === 'runde');
  const saved = fresh.find((e) => e.kind === 'gerettet');
  let k = 0;
  for (const [id, old] of before) {
    if (present.has(id)) continue;
    const delay = roundStart ? at.get(roundStart.id) + k++ * 35 : saved ? at.get(saved.id) + 520 : 0;
    ghost(root, old.node, old, pile, rootRect, delay, signal);
  }

  for (const e of fresh) {
    const t = at.get(e.id);
    const seat = e.who ? root.querySelector(`.f7-seat[data-who="${e.who}"]`) : null;
    if (e.kind === 'gerettet' || e.kind === 'weg') {
      // Die doppelte Karte zeigt sich kurz und landet dann auf der Ablage.
      const tmp = document.createElement('div');
      tmp.innerHTML = cardHTML(e.card);
      const node = tmp.firstElementChild;
      const hand = seat?.querySelector('.f7-hand').getBoundingClientRect();
      const via = e.kind === 'gerettet' && hand ? { left: hand.right - 60, top: hand.top, width: 54, height: 78 } : null;
      flyThrough(root, node, deck, via, pile, rootRect, t, signal);
    }
    if (e.kind === 'mischen') {
      root.querySelector('.f7-deck .f7-stack').animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }],
        { duration: 360, delay: t, easing: 'ease-in-out' },
      );
    }
    if (seat && ['pleite', 'stopp', 'frost', 'flip7'].includes(e.kind)) {
      const badge = seat.querySelector('.f7-badge');
      const late = e.kind === 'pleite' || e.kind === 'flip7' ? 420 : 0;
      badge?.animate([{ opacity: 0, transform: 'scale(1.7) rotate(-6deg)' }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        delay: t + late,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      });
      if (e.kind === 'pleite') {
        seat.querySelectorAll('.f7-card.dup .f7-x path').forEach((p, i) => {
          p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 220, delay: t + 400 + i * 120, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'backwards' });
        });
        seat.querySelector('.f7-hand').animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 360, delay: t + 700, easing: 'ease-out', fill: 'backwards' });
      }
      if (e.kind === 'flip7') {
        seat.querySelectorAll('.f7-card--num').forEach((c, i) => {
          c.animate([{ transform: 'none' }, { transform: 'translateY(-14px)', offset: 0.45 }, { transform: 'none' }], {
            duration: 520,
            delay: t + 120 + i * 80,
            easing: 'cubic-bezier(.2,.8,.2,1)',
          });
        });
      }
    }
    if (e.kind === 'frost' || e.kind === 'drei') {
      // Die gespielte Karte des Ziehenden zeigt kurz, wen es trifft.
      const by = root.querySelector(`.f7-seat[data-who="${e.by}"]`);
      const card = [...(by?.querySelectorAll(`.f7-card--act`) ?? [])].at(-1);
      card?.animate([{ transform: 'none' }, { transform: 'translateY(-10px) scale(1.08)', offset: 0.4 }, { transform: 'none' }], {
        duration: 460,
        delay: t,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
      if (e.kind === 'frost') {
        seat?.querySelector('.f7-hand').animate([{ opacity: 1 }, { opacity: 0.62 }], { duration: 420, delay: t + 200, fill: 'backwards' });
      }
    }
    if (e.kind === 'ende') countTotals(root, s, game, t + 200, signal);
  }

  // Punkte der Runde zählen mit, sobald die letzte neue Karte liegt.
  for (const p of s.players) {
    const node = root.querySelector(`.f7-seat[data-who="${p.id}"] [data-pts]`);
    const to = Number(node.textContent);
    const from = u.pts[p.id] ?? to;
    u.pts[p.id] = to;
    if (from !== to && fresh.length) countUp(node, from, to, busy - 300, 300, signal);
  }

  // Erst entscheiden, wenn alles liegt
  if (busy > 450) {
    const buttons = root.querySelectorAll('.f7-bar button');
    buttons.forEach((b) => (b.disabled = true));
    const timer = setTimeout(() => buttons.forEach((b) => (b.disabled = false)), busy);
    u.ctrl.signal.addEventListener('abort', () => clearTimeout(timer));
  }
}

function countTotals(root, s, game, delay, signal) {
  const prev = game.prev;
  for (const p of s.players) {
    const row = root.querySelector(`.f7-row[data-id="${p.id}"]`);
    const from = prev?.totals[p.id] ?? s.totals[p.id];
    const to = s.totals[p.id];
    if (from === to) continue;
    countUp(row.querySelector('[data-total]'), from, to, delay, 600, signal);
    row.querySelector('.f7-track i').animate(
      [{ transform: `scaleX(${Math.min(1, from / s.target)})` }, { transform: `scaleX(${Math.min(1, to / s.target)})` }],
      { duration: 600, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    );
  }
}

// Eine alte Karte (schon aus dem Spielfeld genommen) fliegt von ihrem Platz auf die Ablage.
function ghost(root, node, from, to, rootRect, delay, signal) {
  Object.assign(node.style, { position: 'absolute', left: `${from.x}px`, top: `${from.y}px`, margin: '0', zIndex: 4 });
  node.classList.add('f7-ghost');
  root.append(node);
  const dx = to.left - rootRect.left + to.width / 2 - (from.x + from.w / 2);
  const dy = to.top - rootRect.top + to.height / 2 - (from.y + from.h / 2);
  node
    .animate(
      [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.w}) rotate(8deg)`, opacity: 0.9 }],
      { duration: 480, delay, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'both' },
    )
    .finished.then(() => node.remove(), () => node.remove());
  signal.addEventListener('abort', () => node.remove());
}

// Eine Karte, die nie liegen bleibt: vom Stapel (über die Hand) auf die Ablage.
function flyThrough(root, node, from, via, to, rootRect, delay, signal) {
  const w = 54;
  const h = 78;
  const x = (r) => r.left - rootRect.left + r.width / 2 - w / 2;
  const y = (r) => r.top - rootRect.top + r.height / 2 - h / 2;
  Object.assign(node.style, { position: 'absolute', left: `${x(from)}px`, top: `${y(from)}px`, zIndex: 4 });
  node.style.setProperty('--w', `${w}px`);
  node.style.setProperty('--h', `${h}px`);
  node.classList.add('f7-ghost');
  root.append(node);
  const at = (r) => `translate(${x(r) - x(from)}px, ${y(r) - y(from)}px)`;
  const frames = via
    ? [
        { transform: `${at(from)} scale(.8)`, opacity: 0 },
        { transform: at(via), opacity: 1, offset: 0.35 },
        { transform: at(via), offset: 0.6 },
        { transform: `${at(to)} scale(.8) rotate(8deg)`, opacity: 0.9 },
      ]
    : [{ transform: `${at(from)} scale(.8)`, opacity: 0 }, { transform: `${at(to)} scale(.8) rotate(8deg)`, opacity: 0.9 }];
  node
    .animate(frames, { duration: via ? 1100 : 520, delay, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'both' })
    .finished.then(() => node.remove(), () => node.remove());
  signal.addEventListener('abort', () => node.remove());
}

function countUp(node, from, to, delay, duration, signal) {
  if (from === to) return;
  node.textContent = from;
  const start = performance.now() + Math.max(0, delay);
  const step = (t) => {
    if (signal.aborted) return;
    const p = Math.min(1, Math.max(0, (t - start) / duration));
    node.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const style = `
  .f7 { position: relative; display: grid; gap: 14px; width: 100%; max-width: 560px; }

  /* ---------- Gesamtpunkte auf dem Weg zum Ziel ---------- */
  .f7-board { display: grid; gap: 10px; padding-top: 12px; border-top: 2px solid var(--line); }
  .f7-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 4px 12px; }
  .f7-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }
  .f7-total { color: var(--pc); font: 800 var(--t-2xl) / .9 var(--font-display); font-variant-numeric: tabular-nums; }
  .f7-track { grid-column: 1 / -1; position: relative; height: 6px; overflow: hidden; border-radius: var(--radius); background: var(--hairline); }
  .f7-track i { position: absolute; inset: 0; background: var(--pc); transform-origin: left; }
  .f7-goal { color: var(--muted); font-size: var(--t-sm); }
  .f7-row.lose { opacity: .45; }
  .f7-row.intro { animation: f7-rise 420ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 90ms); }
  .f7-goal.intro { animation: f7-rise 420ms cubic-bezier(.2,.8,.2,1) 180ms both; }
  @keyframes f7-rise { from { opacity: 0; transform: translateY(8px); } }

  /* ---------- Plätze ---------- */
  .f7-seat { --w: 54px; --h: 78px; display: grid; gap: 8px; }
  .f7-them { --w: 42px; --h: 60px; }
  .f7-others { display: grid; gap: 12px; }
  .f7-others:empty { display: none; }
  /* Ab drei Gegnern: kleinere Karten, zwei Plätze nebeneinander */
  .f7-others.many { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
  .f7-others.many .f7-them { --w: 30px; --h: 43px; align-content: start; }
  .f7-others.many .f7-head { gap: 6px; min-height: 24px; flex-wrap: wrap; }
  .f7-others.many .f7-who { flex: 1 1 0; font-size: var(--t-sm); }
  .f7-others.many .f7-pts { font-size: var(--t-lg); }
  .f7-others.many .f7-badge { order: 3; font-size: 11px; padding: 1px 5px 0; }
  .f7-others.many .f7-head:has(.f7-badge)::after { content: ''; order: 2; flex-basis: 100%; } /* Stempel in eigener Zeile */
  .f7-others.many .f7-corner { left: 3px; top: 2px; }
  .f7-them.is-turn .f7-who { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: var(--pc); }
  .f7-head { display: flex; align-items: center; gap: 10px; min-height: 30px; }
  .f7-who { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }
  .f7-pts { margin-left: auto; color: var(--pc); font: 800 var(--t-xl) / 1 var(--font-display); font-variant-numeric: tabular-nums; }
  .f7-badge {
    flex: none; padding: 2px 8px 1px;
    border: 2px solid currentColor; border-radius: var(--radius);
    font: 800 var(--t-sm) / 1.2 var(--font-display); letter-spacing: .05em; text-transform: uppercase;
  }
  .f7-badge--raus { color: var(--bad); }
  .f7-badge--frost { color: ${ICE}; }
  .f7-badge--flip7 { color: var(--pc); }
  .f7-badge--flip7 { font-size: var(--t-base); }
  .f7-hand { display: flex; min-height: var(--h); }
  /* Viele Karten schieben sich übereinander, die Ecke bleibt lesbar */
  .f7-hand > .f7-card + .f7-card { margin-left: min(6px, calc((100% - var(--n) * var(--w)) / (var(--n) - 1))); }
  .f7-seat.is-raus .f7-hand { opacity: .5; }
  .f7-seat.is-frost .f7-hand { opacity: .62; }

  /* ---------- Karten ---------- */
  .f7-card { position: relative; flex: none; width: var(--w); height: var(--h); perspective: 520px; }
  .f7-inner { position: absolute; inset: 0; transform-style: preserve-3d; }
  .f7-face {
    position: absolute; inset: 0; overflow: hidden;
    border: 1.6px solid var(--ink); border-radius: var(--radius-m); background: var(--paper);
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .f7-front::before { content: ''; position: absolute; inset: 3px; border: 1px solid var(--hairline); border-radius: 2px; }
  .f7-back { transform: rotateY(180deg); }
  .f7-backart { position: absolute; inset: 0; width: 100%; height: 100%; }
  .f7-corner { position: absolute; left: 5px; top: 4px; color: var(--c); font: 800 calc(var(--w) * .26) / 1 var(--font-display); }
  .f7-corner-icon { width: calc(var(--w) * .26); height: calc(var(--w) * .26); }
  .f7-corner-icon svg { display: block; width: 100%; height: 100%; }
  .f7-big { position: absolute; inset: 0; display: grid; place-items: center; color: var(--c); font: 800 calc(var(--w) * .66) / 1 var(--font-display); }
  .f7-big-mod { font-size: calc(var(--w) * .46); }
  .f7-icon { position: absolute; left: 16%; right: 16%; top: 20%; bottom: 34%; }
  .f7-icon svg { display: block; width: 100%; height: 100%; }
  .f7-label { position: absolute; left: 2px; right: 2px; bottom: 4px; text-align: center; font: 700 8.5px / 1.05 var(--font-body); }
  /* Auf kleinen Karten (Gegner, Stapel, Ablage) reicht das Bild */
  .f7-them .f7-label, .f7-stack .f7-label { display: none; }
  .f7-them .f7-icon, .f7-stack .f7-icon { bottom: 20%; }
  .f7-card--mod .f7-front { background: color-mix(in srgb, var(--ink) 4%, white); }
  .f7-x { position: absolute; inset: 0; width: 100%; height: 100%; }
  .f7-x path { fill: none; stroke: var(--bad); stroke-width: 4; stroke-linecap: square; stroke-dasharray: 1; stroke-dashoffset: 0; }
  .f7-ghost { pointer-events: none; }

  /* ---------- Tisch: Stapel, Ablage, letztes Ereignis ---------- */
  .f7-table {
    display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 14px;
    padding: 12px 0; border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline);
  }
  .f7-pile { display: grid; justify-items: center; gap: 4px; }
  .f7-stack { --w: 42px; --h: 60px; position: relative; display: block; width: 42px; height: 60px; }
  .f7-stack > .f7-card { position: absolute; left: 0; top: 0; }
  .f7-deck .f7-stack > .f7-card:nth-child(1) { transform: translate(-3px, 3px); }
  .f7-deck .f7-stack > .f7-card:nth-child(2) { transform: translate(-1.5px, 1.5px); }
  .f7-down .f7-inner { transform: rotateY(180deg); }
  .f7-empty { display: block; width: 100%; height: 100%; border: 1.5px dashed var(--hairline); border-radius: var(--radius-m); }
  .f7-count { color: var(--muted); font-size: var(--t-sm); white-space: nowrap; }
  .f7-count b { color: var(--ink); font: 800 var(--t-base) / 1 var(--font-display); }
  .f7-log { font-size: var(--t-sm); }

  /* ---------- Knöpfe ---------- */
  .f7-bar { display: flex; flex-wrap: wrap; gap: 10px 12px; }
  .f7-bar:empty { display: none; }
  .f7-bar .btn:active:not(:disabled) { transform: scale(.96); }

  /* ---------- Regeln ---------- */
  .f7-rules { padding-top: 10px; border-top: 1px solid var(--hairline); font-size: var(--t-sm); }
  .f7-rules summary {
    width: max-content; cursor: pointer; font-weight: 700;
    text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px;
  }
  .f7-rules ol { display: grid; gap: 4px; max-width: 60ch; margin-top: 8px; padding-left: 1.4em; list-style: decimal; }

  @media (min-width: 600px) {
    .f7-seat { --w: 62px; --h: 90px; }
    .f7-them { --w: 50px; --h: 72px; }
    .f7-others.many .f7-them { --w: 38px; --h: 55px; }
    .f7-label { font-size: 10px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .f7 *, .f7 *::before, .f7 *::after { animation: none !important; transition: none !important; }
  }
`;
