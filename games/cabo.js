// Cabo: verdeckte Karten merken, gegen niedrigere tauschen, im richtigen Moment „Cabo“ rufen.
//
// Stapel: Werte von null bis dreizehn (null und dreizehn je zweimal, sonst je viermal, zweiundfünfzig Karten),
// ab fünf Spielern zwei solche Sätze. Jeder bekommt vier verdeckte Karten im Quadrat und sieht sich zu Beginn
// zwei davon an. Danach reihum: vom Stapel ziehen (geheim) oder die oberste Karte der Ablage nehmen, dann
// - gegen eine eigene Karte tauschen, oder gegen mehrere gleiche auf einmal (sind sie nicht gleich, bleiben sie
//   liegen, werden allen gezeigt und die neue Karte kommt als Strafe dazu), oder
// - die gezogene Karte ablegen (nur vom Stapel). Eine Sieben oder Acht erlaubt dann, eine eigene Karte anzusehen,
//   eine Neun oder Zehn eine fremde, eine Elf oder Zwölf tauscht blind eine eigene gegen eine fremde.
// Statt eines Zuges kann man „Cabo“ rufen: Alle anderen sind noch einmal dran, dann wird aufgedeckt.
// Wertung: Summe der eigenen Karten. Der Rufer bekommt null, wenn alle anderen mehr haben, sonst fünf Strafpunkte
// dazu. Kamikaze: Wer genau zwei Zwölfen und zwei Dreizehnen hat, bekommt null, alle anderen fünfzig.
// Wer genau auf das Ziel kommt, fällt einmal auf die Hälfte zurück. Wer darüber liegt, beendet das Spiel,
// die wenigsten Punkte gewinnen (Einstellung: bis hundert, bis fünfzig oder eine Runde).
//
// Geheim: der Stapel, alle verdeckten Karten (view zeigt nur, was `me` gerade sehen darf: beim Merken die zwei
// gewählten, beim Anschauen die eine, die gezogene Karte nur dem Ziehenden). Nach der Runde ist alles offen.
//
// Bildschirm (present): alle Plätze nebeneinander, links Punkte, Stapel, gezogene Karte (verdeckt) und Ablage.
//
// Motion: Austeilen vom Stapel, Karten fliegen vom Stapel in die Hand, beim Tauschen in den Platz und die alte
// dreht sich auf dem Weg zur Ablage um, Ansehen hebt die Karte und dreht sie, Cabo als Stempel, am Rundenende
// drehen sich alle Karten in einer Welle um und die Summen zählen hoch.

export const meta = {
  name: 'Cabo',
  description: 'Merkt euch eure verdeckten Karten, tauscht sie gegen niedrigere und ruft Cabo, wenn ihr die wenigsten Punkte habt.',
  players: [2, 6],
  options: [
    {
      id: 'ziel',
      label: 'Spiellänge',
      choices: [
        { value: 100, label: 'Bis hundert Punkte' },
        { value: 50, label: 'Bis fünfzig Punkte' },
        { value: 0, label: 'Eine Runde' },
      ],
    },
    {
      id: 'zeit',
      label: 'Zeit pro Zug',
      choices: [
        { value: 0, label: 'Ohne Limit' },
        { value: 30, label: 'Dreißig Sekunden' },
        { value: 60, label: 'Eine Minute' },
      ],
    },
  ],
};

const HAND = 4;
const PENALTY = 5;
const KAMIKAZE = 50;
const GRACE = 3000; // ms nach Ablauf: Züge, die gerade unterwegs sind, gelten noch
// Was eine abgelegte Karte erlaubt
const POWER = { 7: 'schauen', 8: 'schauen', 9: 'spionieren', 10: 'spionieren', 11: 'tauschen', 12: 'tauschen' };

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
const sum = (hand) => hand.reduce((a, c) => a + (c ?? 0), 0);
const isKamikaze = (hand) => hand.filter((c) => c !== null).sort((a, b) => a - b).join() === '12,12,13,13';

function newDeck(sets) {
  const deck = [];
  for (let k = 0; k < sets; k++) {
    for (let v = 0; v <= 13; v++) for (let n = 0; n < (v === 0 || v === 13 ? 2 : 4); n++) deck.push(v);
  }
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
    target: [100, 50, 0].includes(options.ziel) ? options.ziel : 100,
    limit: [0, 30, 60].includes(options.zeit) ? options.zeit : 0,
    sets: players.length >= 5 ? 2 : 1,
    deck: [], // oben = letzte Karte
    discard: [],
    round: 0,
    dealer: pick(players).id,
    turn: null,
    phase: 'merken', // merken | zug | entscheiden | aktion | schauen | pause | ende
    hands: {}, // pro Spieler eine Liste von Plätzen: Wert oder null (Platz leer, nach einem Mehrfach-Tausch)
    seen: {}, // beim Merken: welche zwei Plätze man sich angesehen hat
    ready: {},
    drawn: null, // { card, from: 'stapel' | 'ablage' }
    power: null, // schauen | spionieren | tauschen (nach dem Ablegen einer Sieben bis Zwölf)
    look: null, // { who, slot }: wer am Zug ist, sieht sich diese Karte an
    cabo: null, // wer Cabo gerufen hat
    left: [], // wer nach dem Ruf noch einmal dran ist
    totals: Object.fromEntries(players.map((p) => [p.id, 0])),
    halved: {}, // wer schon einmal vom Ziel auf die Hälfte gefallen ist
    last: null, // Wertung der letzten Runde
    seq: 0, // zählt Ereignisse, dient auch gegen doppeltes Tippen
    events: [],
    deadline: null,
    startedAt: null,
  };
  startRound(s);
  return s;
}

export function action(s, { player, type, data }) {
  if (!s.hands[player]) throw new Error('Du spielst nicht mit.');
  if (s.result) return;
  const hand = s.hands[player];

  // Beim Merken sind alle gleichzeitig dran: kein Abgleich mit seq.
  if (type === 'merken') {
    if (s.phase !== 'merken') return;
    const slot = data?.slot;
    if (!Number.isInteger(slot) || hand[slot] == null) throw new Error('Diese Karte gibt es nicht.');
    if (s.seen[player].includes(slot)) return;
    if (s.seen[player].length >= 2) throw new Error('Du hast dir schon zwei Karten angesehen.');
    s.seen[player].push(slot);
    return;
  }
  if (type === 'bereit') {
    if (s.phase !== 'merken' || s.ready[player]) return;
    if (s.seen[player].length < 2) throw new Error('Sieh dir zuerst zwei deiner Karten an.');
    s.ready[player] = true;
    if (ids(s).every((id) => s.ready[id])) beginPlay(s);
    return;
  }
  if (type === 'weiter') {
    if (s.phase === 'pause' && data?.round === s.round) startRound(s);
    return;
  }

  if (data?.at !== s.seq) return; // gehört zu einem älteren Stand (doppelt getippt)
  if (!['zug', 'entscheiden', 'aktion', 'schauen'].includes(s.phase)) return;
  if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);

  switch (type) {
    case 'ziehen': {
      if (s.phase !== 'zug') return;
      const card = takeCard(s);
      if (card === null) return endRound(s); // kommt praktisch nie vor: alle Karten liegen in den Händen
      s.drawn = { card, from: 'stapel' };
      s.phase = 'entscheiden';
      ev(s, { kind: 'zieht', who: player, from: 'stapel' });
      return setDeadline(s);
    }
    case 'nehmen': {
      if (s.phase !== 'zug') return;
      if (!s.discard.length) throw new Error('Die Ablage ist leer.');
      s.drawn = { card: s.discard.pop(), from: 'ablage' };
      s.phase = 'entscheiden';
      ev(s, { kind: 'zieht', who: player, from: 'ablage', card: s.drawn.card });
      return setDeadline(s);
    }
    case 'cabo': {
      if (s.phase !== 'zug') return;
      if (s.cabo) throw new Error(`${nameOf(s, s.cabo)} hat schon Cabo gerufen.`);
      s.cabo = player;
      s.left = around(s, player).slice(1);
      ev(s, { kind: 'cabo', who: player });
      return endTurn(s);
    }
    case 'tauschen': {
      if (s.phase !== 'entscheiden') return;
      const slots = data?.slots;
      if (!Array.isArray(slots) || !slots.length || new Set(slots).size !== slots.length) throw new Error('Wähle eine oder mehrere eigene Karten.');
      if (slots.some((i) => !Number.isInteger(i) || hand[i] == null)) throw new Error('Diese Karte gibt es nicht.');
      const out = slots.map((i) => hand[i]);
      const { card, from } = s.drawn;
      if (out.every((c) => c === out[0])) {
        hand[slots[0]] = card;
        for (const i of slots.slice(1)) hand[i] = null;
        s.discard.push(...out);
        ev(s, { kind: 'tausch', who: player, slots, out, from, ...(from === 'ablage' ? { card } : {}) });
      } else {
        // Nicht alle gleich: Die Karten bleiben liegen (alle haben sie gesehen), die neue kommt als Strafe dazu.
        hand.push(card);
        ev(s, { kind: 'patzer', who: player, slots, out, slot: hand.length - 1, from, ...(from === 'ablage' ? { card } : {}) });
      }
      return endTurn(s);
    }
    case 'ablegen': {
      if (s.phase !== 'entscheiden') return;
      if (s.drawn.from === 'ablage') throw new Error('Eine Karte von der Ablage musst du gegen eine eigene tauschen.');
      const card = s.drawn.card;
      s.discard.push(card);
      s.drawn = null;
      ev(s, { kind: 'ablegen', who: player, card });
      if (!POWER[card]) return endTurn(s);
      s.power = POWER[card];
      s.phase = 'aktion';
      return setDeadline(s);
    }
    case 'aktion': {
      if (s.phase !== 'aktion') return;
      const slot = data?.slot;
      if (s.power === 'schauen') {
        if (!Number.isInteger(slot) || hand[slot] == null) throw new Error('Wähle eine deiner Karten.');
        return startLook(s, player, player, slot);
      }
      const owner = String(data?.owner ?? '');
      const oslot = data?.oslot;
      if (owner === player || !s.hands[owner]) throw new Error('Wähle eine Karte von jemand anderem.');
      if (!Number.isInteger(oslot) || s.hands[owner][oslot] == null) throw new Error('Diese Karte gibt es nicht.');
      if (s.power === 'spionieren') return startLook(s, player, owner, oslot);
      if (owner === s.cabo) throw new Error(`${nameOf(s, owner)} hat Cabo gerufen, diese Karten bleiben liegen.`);
      if (!Number.isInteger(slot) || hand[slot] == null) throw new Error('Wähle auch eine deiner Karten.');
      [hand[slot], s.hands[owner][oslot]] = [s.hands[owner][oslot], hand[slot]];
      ev(s, { kind: 'vertauscht', who: player, slot, owner, oslot });
      return endTurn(s);
    }
    case 'auslassen': {
      if (s.phase !== 'aktion') return;
      ev(s, { kind: 'verzichtet', who: player });
      return endTurn(s);
    }
    case 'fertig': {
      if (s.phase !== 'schauen') return;
      return endTurn(s);
    }
    default:
  }
}

function startLook(s, player, owner, slot) {
  s.look = { who: owner, slot };
  s.phase = 'schauen';
  ev(s, { kind: 'schaut', who: player, owner, slot });
  setDeadline(s);
}

// Fristen (nur mit Zeitlimit): wer zu lange braucht, legt ab bzw. verzichtet.
export function tick(s, now) {
  if (s.result || !s.limit || s.deadline === null || now < s.deadline + GRACE) return;
  if (s.phase === 'merken') {
    for (const id of ids(s)) s.ready[id] = true;
    return beginPlay(s);
  }
  if (s.phase === 'zug') {
    const card = takeCard(s);
    if (card === null) return endRound(s);
    s.discard.push(card);
    ev(s, { kind: 'zeit', who: s.turn, card, from: 'stapel' });
    return endTurn(s);
  }
  if (s.phase === 'entscheiden') {
    s.discard.push(s.drawn.card);
    ev(s, { kind: 'zeit', who: s.turn, card: s.drawn.card });
    return endTurn(s);
  }
  if (s.phase === 'aktion' || s.phase === 'schauen') {
    if (s.phase === 'aktion') ev(s, { kind: 'zeit', who: s.turn });
    return endTurn(s);
  }
}

// Was `me` sehen darf: verdeckte Karten als -1, leere Plätze als null.
export function view(s, me) {
  const open = s.phase === 'pause' || s.phase === 'ende';
  const known = (id, i) =>
    open ||
    (me !== null && s.phase === 'merken' && id === me && s.seen[me].includes(i)) ||
    (me !== null && s.phase === 'schauen' && s.turn === me && s.look.who === id && s.look.slot === i);
  const hands = Object.fromEntries(
    ids(s).map((id) => [id, s.hands[id].map((c, i) => (c === null ? null : known(id, i) ? c : -1))]),
  );
  const { deck, discard, seen, drawn, ...rest } = s;
  return {
    ...rest,
    hands,
    seen: me !== null && s.seen[me] ? { [me]: s.seen[me] } : {},
    peeks: Object.fromEntries(ids(s).map((id) => [id, s.seen[id]?.length ?? 0])),
    drawn: drawn && { from: drawn.from, card: drawn.from === 'ablage' || s.turn === me ? drawn.card : -1 },
    deck: deck.length,
    discard: discard.length,
    top: discard.at(-1) ?? null,
  };
}

export function screen(s) {
  return view(s, null);
}

// Bildschirm: Gesamtpunkte (bei einer Runde die Punkte dieser Runde, sobald sie vorbei ist)
export function points(s) {
  return s.totals;
}

export function waitingFor(s) {
  if (s.result) return [];
  if (s.phase === 'merken') return ids(s).filter((id) => !s.ready[id]);
  if (s.phase === 'pause') return [nextAfter(s, s.dealer)]; // gibt als Nächstes, fängt die Runde an
  return [s.turn];
}

export function notices(s, before, player) {
  if (s.result) return [];
  if (s.phase === 'pause' && before.phase !== 'pause') {
    return ids(s)
      .filter((id) => id !== player)
      .map((id) => ({ to: id, text: `Runde ${word(s.round)} ist vorbei. Du bekommst ${word(s.last.points[id])} Punkte.` }));
  }
  const fresh = s.round !== before.round;
  const was = waitingFor(before);
  return waitingFor(s)
    .filter((id) => id !== player && (fresh || !was.includes(id)))
    .map((id) => ({ to: id, text: noticeText(s, id) }));
}

function noticeText(s, id) {
  if (s.phase === 'merken') return `Runde ${word(s.round)}: Sieh dir zwei deiner Karten an.`;
  if (s.cabo && s.cabo !== id) return `${nameOf(s, s.cabo)} hat Cabo gerufen. Du bist ein letztes Mal dran.`;
  return 'Du bist dran.';
}

// --- Ablauf einer Runde ---

function startRound(s) {
  if (s.round > 0) s.dealer = nextAfter(s, s.dealer);
  s.round++;
  s.deck = newDeck(s.sets);
  s.hands = Object.fromEntries(ids(s).map((id) => [id, s.deck.splice(-HAND, HAND)]));
  s.discard = [s.deck.pop()];
  s.seen = Object.fromEntries(ids(s).map((id) => [id, []]));
  s.ready = Object.fromEntries(ids(s).map((id) => [id, false]));
  Object.assign(s, { phase: 'merken', turn: nextAfter(s, s.dealer), drawn: null, power: null, look: null, cabo: null, left: [] });
  ev(s, { kind: 'runde', round: s.round });
  setDeadline(s, 2);
}

function beginPlay(s) {
  s.phase = 'zug';
  s.seen = Object.fromEntries(ids(s).map((id) => [id, []]));
  ev(s, { kind: 'los' });
  setDeadline(s);
}

function endTurn(s) {
  const current = s.turn;
  s.drawn = null;
  s.power = null;
  s.look = null;
  if (s.cabo) {
    s.left = s.left.filter((id) => id !== current);
    if (!s.left.length) return endRound(s);
    s.turn = s.left[0];
  } else {
    s.turn = nextAfter(s, current);
  }
  s.phase = 'zug';
  setDeadline(s);
}

function setDeadline(s, factor = 1) {
  const now = Date.now();
  s.startedAt = now;
  s.deadline = s.limit ? now + s.limit * 1000 * factor : null;
}

function takeCard(s) {
  if (!s.deck.length && s.discard.length > 1) {
    const top = s.discard.pop();
    s.deck = shuffle(s.discard);
    s.discard = [top];
    ev(s, { kind: 'mischen' });
  }
  return s.deck.length ? s.deck.pop() : null;
}

function endRound(s) {
  const list = ids(s);
  const sums = Object.fromEntries(list.map((id) => [id, sum(s.hands[id])]));
  const kamikaze = list.find((id) => isKamikaze(s.hands[id])) ?? null;
  const points = {};
  let caboOk = null;
  if (kamikaze) {
    for (const id of list) points[id] = id === kamikaze ? 0 : KAMIKAZE;
  } else {
    for (const id of list) points[id] = sums[id];
    if (s.cabo) {
      caboOk = list.every((id) => id === s.cabo || sums[id] > sums[s.cabo]);
      points[s.cabo] = caboOk ? 0 : sums[s.cabo] + PENALTY;
    }
  }
  const before = { ...s.totals };
  const halved = [];
  for (const id of list) {
    s.totals[id] += points[id];
    if (s.target && s.totals[id] === s.target && !s.halved[id]) {
      s.totals[id] = s.target / 2;
      s.halved[id] = true;
      halved.push(id);
    }
  }
  s.last = { round: s.round, sums, points, before, kamikaze, cabo: s.cabo, caboOk, halved };
  Object.assign(s, { drawn: null, power: null, look: null, deadline: null });
  ev(s, { kind: 'ende' });

  const score = s.target ? s.totals : points;
  if (s.target && !list.some((id) => s.totals[id] > s.target)) {
    s.phase = 'pause';
    return;
  }
  s.phase = 'ende';
  const best = Math.min(...list.map((id) => score[id]));
  const winners = list.filter((id) => score[id] === best);
  const names = listNames(winners.map((id) => nameOf(s, id)));
  let text;
  if (winners.length > 1) text = `${names} gewinnen mit je ${word(best)} ${best === 1 ? 'Punkt' : 'Punkten'}.`;
  else if (list.length === 2) {
    const other = list.find((id) => id !== winners[0]);
    text = `${names} gewinnt mit ${word(best)} zu ${word(score[other])} Punkten.`;
  } else text = `${names} gewinnt mit ${word(best)} ${best === 1 ? 'Punkt' : 'Punkten'}.`;
  s.result = { winners, text };
}

function ev(s, e) {
  s.seq++;
  s.events.push({ id: s.seq, ...e });
  if (s.events.length > 30) s.events.splice(0, s.events.length - 30);
}

// --- Texte ---

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// Zahlen im Text als Wort (die Textschrift hat eine durchgestrichene Null), lange mit weichem Trennstrich.
function word(n) {
  if (n < 0) return `minus ${word(-n)}`;
  if (n < 20) return ONES[n];
  const unit = (k) => (k === 1 ? 'ein' : ONES[k]);
  if (n < 100) return n % 10 ? `${unit(n % 10)}und­${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  if (n < 1000) return `${unit(Math.floor(n / 100))}hundert${n % 100 ? `­${word(n % 100)}` : ''}`;
  return String(n);
}

function listNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

const NOUN = ['Null', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Elf', 'Zwölf', 'Dreizehn'];
const POWER_TEXT = { schauen: 'eigene Karte ansehen', spionieren: 'fremde Karte ansehen', tauschen: 'blind tauschen' };

// ---------- Anzeige (nur im Browser) ----------

// --- Zeichnungen (Skill „zeichnen“): Meerestiere, Tuschekontur, gedämpfte Druckfarben ---

const INK = '#141414';
const SEA = {
  blue: '#3a6b98', blueLight: '#cfe0ee', blueMid: '#7c9fbd', teal: '#2f8585', tealLight: '#cde3df',
  rust: '#c0592f', coral: '#d98468', coralLight: '#f2cfc0', ochre: '#c9922f', ochreLight: '#f0dcae',
  sand: '#ead9b0', green: '#2e7d4f', greenLight: '#bcd9b0', gray: '#8a9399', grayLight: '#e2e5e7',
  pink: '#e3a3a0', pinkLight: '#f6dcd8', shell: '#f3e8d2', moss: '#6f8a2c',
};
const W = 3.4; // Hauptkontur in der 100er-viewBox
const line = (d, c = INK, w = W) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d, fill, w = W) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;
// Dicker Strang mit Tuschekante: erst breit in Tusche, darüber schmaler in Farbe
const rope = (d, fill, w = 9) => `${line(d, INK, w)}${line(d, fill, w - 2 * W + 0.6)}`;
const eye = (x, y, r = 3.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.38}" r="${r * 0.36}" fill="#fff"/>`;
const f = (n) => +n.toFixed(1);
const polar = (cx, cy, r, deg) => [f(cx + r * Math.cos((deg * Math.PI) / 180)), f(cy + r * Math.sin((deg * Math.PI) / 180))];

// 0: Muschel mit Perle
function shell() {
  const H = [50, 84];
  const pts = Array.from({ length: 8 }, (_, i) => polar(50, 52, 37, 190 + (160 / 7) * i));
  let d = `M${H[0] - 9} ${H[1]} L${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [mx, my] = polar(50, 52, 42.5, 190 + (160 / 7) * (i - 0.5));
    d += ` Q${mx} ${my} ${x1} ${y1}`;
  }
  d += ` L${H[0] + 9} ${H[1]} Z`;
  const ribs = pts.slice(1, -1).map(([x, y]) => `M${f(50 + (x - 50) * 0.12)} ${f(80 + (y - 80) * 0.12)} L${f(50 + (x - 50) * 0.9)} ${f(80 + (y - 80) * 0.9)}`).join(' ');
  return `${shape(d, SEA.coralLight)}
    ${line(ribs, SEA.coral, 2.2)}
    ${shape('M38 84 L62 84 L58 93 L42 93 Z', SEA.coral, 2.6)}
    <circle cx="50" cy="66" r="12" fill="#fff" stroke="${INK}" stroke-width="${W}"/>
    <path d="M43.5 62 C44.5 58.5 47 56.6 50 56.4" fill="none" stroke="${SEA.blueLight}" stroke-width="2.6" stroke-linecap="round"/>`;
}

// 1: Seestern, leicht schräg, mit Tupfen
function star() {
  const cx = 50;
  const cy = 53;
  let d = '';
  for (let k = 0; k < 5; k++) {
    const a = -90 + k * 72 - 8;
    const [ix, iy] = polar(cx, cy, 15, a - 36);
    const [tx, ty] = polar(cx, cy, 41, a);
    const [c1x, c1y] = polar(cx, cy, 30, a - 13);
    const [c2x, c2y] = polar(cx, cy, 30, a + 13);
    const [nx, ny] = polar(cx, cy, 15, a + 36);
    const [t1x, t1y] = polar(tx, ty, 3.2, a - 90);
    const [t2x, t2y] = polar(tx, ty, 3.2, a + 90);
    d += `${k ? '' : `M${ix} ${iy}`} Q${c1x} ${c1y} ${t1x} ${t1y} Q${polar(tx, ty, 4, a)[0]} ${polar(tx, ty, 4, a)[1]} ${t2x} ${t2y} Q${c2x} ${c2y} ${nx} ${ny}`;
  }
  const dots = [];
  for (let k = 0; k < 5; k++) {
    const a = -90 + k * 72 - 8;
    for (const [r, s] of [[18, 3.2], [27, 2.6], [34, 1.9]]) {
      const [x, y] = polar(cx, cy, r, a);
      dots.push(`<circle cx="${x}" cy="${y}" r="${s}" fill="${SEA.ochreLight}"/>`);
    }
  }
  return `${shape(`${d} Z`, SEA.ochre)}${dots.join('')}
    ${line(`M${cx - 4} ${cy + 3} Q${cx} ${cy + 6} ${cx + 4} ${cy + 3}`, INK, 2)}
    ${eye(cx - 5, cy - 3, 2.4)}${eye(cx + 5, cy - 3, 2.4)}`;
}

// 2: Seepferdchen, nach links, eingerollter Schwanz
function seahorse() {
  const body = 'M21 26 L35 24 C37 16 45 11 52 14 C58 17 60 24 58 30 C66 39 68 52 63 62 C60 69 56 73 51 77 C46 73 44 69 42 65 C34 59 32 47 38 39 C37 36 36 34 35 33.5 L21 33.5 Z';
  const tail = 'M50 72 C53 82 57 91 66 89 C73 87 72 78 66 77.5 C61.5 77 61 83.5 65 83.5';
  return `${rope(tail, SEA.ochre, 10)}
    ${shape(body, SEA.ochre)}
    ${shape('M60 37 C70 38 74 48 66 56 Z', SEA.ochreLight, 2.6)}
    ${line('M63 41 L69 43 M63 46 L70 48 M63 51 L68 52', INK, 1.4)}
    ${line('M38 44 Q42 45 45 44 M36 50 Q41 51.5 45 50 M37 56 Q42 57.5 46 56 M40 62 Q44 63 47 62', INK, 1.5)}
    ${line('M45 12 L46 6 L49.5 12.5 M51 13.5 L55 8.5 L55.6 15.5', INK, 2.4)}
    ${eye(46, 23, 3.2)}
    ${line('M22 30 L26 30', INK, 1.6)}`;
}

// 3: Krabbe von vorn, Scheren erhoben
function crab() {
  const legs = [-1, 1].map((s) =>
    [0, 1, 2].map((i) => {
      const x0 = 50 + s * (20 - i * 2);
      const y0 = 60 + i * 5;
      return line(`M${x0} ${y0} L${50 + s * (33 + i * 2)} ${62 + i * 6} L${50 + s * (37 + i * 3)} ${74 + i * 6}`, INK, 3.6);
    }).join(''),
  ).join('');
  const claw = (s) => {
    const x = 50 + s * 31;
    return `${line(`M${50 + s * 18} 52 Q${50 + s * 30} 46 ${x} 36`, INK, 4.2)}
      ${shape(`M${x - s * 7} 37 C${x - s * 10} 26 ${x - s * 4} 15 ${x + s * 4} 15 C${x + s * 2} 21 ${x + s * 1} 25 ${x + s * 5} 28 C${x + s * 9} 30 ${x + s * 8} 37 ${x} 40 Z`, SEA.rust, 3)}
      ${shape(`M${x + s * 4} 15 C${x + s * 11} 17 ${x + s * 13} 23 ${x + s * 11} 28 C${x + s * 8} 27 ${x + s * 6} 25 ${x + s * 5} 22 Z`, SEA.rust, 2.6)}`;
  };
  return `${legs}${claw(-1)}${claw(1)}
    ${line('M44 46 L42 34 M56 46 L58 34', INK, 3)}
    ${shape('M22 60 C22 46 34 41 50 41 C66 41 78 46 78 60 C78 71 66 77 50 77 C34 77 22 71 22 60 Z', SEA.rust)}
    ${line('M30 52 Q34 49 38 52 M62 52 Q66 49 70 52', SEA.coralLight, 2.4)}
    <circle cx="42" cy="33" r="5" fill="#fff" stroke="${INK}" stroke-width="2.6"/><circle cx="58" cy="33" r="5" fill="#fff" stroke="${INK}" stroke-width="2.6"/>
    <circle cx="43" cy="33.5" r="2.2" fill="${INK}"/><circle cx="57" cy="33.5" r="2.2" fill="${INK}"/>
    ${line('M44 63 Q50 68 56 63', INK, 2.4)}`;
}

// 4: Qualle mit Fransenrand und langen Fäden
function jelly() {
  const strands = [27, 39, 61, 73].map((x, i) => {
    const s = i % 2 ? 1 : -1;
    return line(`M${x} 55 C${x + s * 6} 65 ${x - s * 6} 74 ${x} 83 C${x + s * 4} 88 ${x} 92 ${x + s * 2} 95`, INK, 2.6);
  }).join('');
  const arms = [44, 56].map((x, i) => {
    const s = i ? 1 : -1;
    return rope(`M${x} 54 C${x - s * 4} 64 ${x + s * 5} 70 ${x} 80`, SEA.pinkLight, 8.6);
  }).join('');
  return `${strands}${arms}
    ${shape(`M20 52 C18 30 32 15 50 15 C68 15 82 30 80 52 ${Array.from({ length: 6 }, (_, i) => { const x0 = 80 - i * 10; return `Q${x0 - 5} 58.5 ${x0 - 10} 52`; }).join(' ')} Z`, SEA.pink)}
    ${line('M28 44 C28 32 37 24 50 23 M72 44 C72 34 66 27 58 24.5', SEA.pinkLight, 2.6)}
    ${eye(42, 39, 3)}${eye(58, 39, 3)}
    ${line('M46 45.5 Q50 48.5 54 45.5', INK, 2)}`;
}

// 5: Fisch mit Schuppen, nach rechts
function fish() {
  const body = 'M86 52 C80 36 62 28 46 31 C36 33 30 40 25 46 L10 34 C13 45 13 57 10 68 L25 57 C30 63 38 70 50 71 C67 72 81 64 86 52 Z';
  const scales = [];
  for (const [x, y] of [[40, 44], [48, 40], [48, 50], [40, 56], [56, 47], [56, 58], [48, 61], [32, 50]]) {
    scales.push(`M${x} ${y - 4} Q${x + 4.5} ${y} ${x} ${y + 4}`);
  }
  return `${shape('M44 31 C48 18 62 16 70 24 C64 26 60 29 58 31 Z', SEA.ochre, 3)}
    ${shape('M48 70 C50 79 58 82 64 80 C60 76 59 73 59 70.5 Z', SEA.ochre, 2.8)}
    ${shape(body, SEA.teal)}
    <path d="M30 59 C40 69 58 72 72 66 C79 63 84 58 86 53 C76 61 56 64 42 60 Z" fill="${SEA.tealLight}"/>
    ${line(scales.join(' '), SEA.tealLight, 2)}
    ${line('M66 37 C62 44 62 54 66 60', INK, 2.4)}
    ${shape('M60 52 C56 58 50 59 47 57 C51 55 55 52 60 49 Z', SEA.ochre, 2.2)}
    ${eye(74, 45, 3.6)}
    ${line('M82 55 Q84 57 86.5 55', INK, 2)}
    ${shape(body, 'none')}`;
}

// 6: Schildkröte von oben, schwimmend
function turtle() {
  const plates = 'M52 38 L61 43 L61 54 L52 59 L43 54 L43 43 Z';
  return `${shape('M68 34 C76 22 86 20 90 24 C88 32 80 38 72 40 Z', SEA.greenLight)}
    ${shape('M68 66 C76 78 86 80 90 76 C88 68 80 62 72 60 Z', SEA.greenLight)}
    ${shape('M32 36 C26 28 18 26 14 29 C16 34 22 38 30 40 Z', SEA.greenLight)}
    ${shape('M32 64 C26 72 18 74 14 71 C16 66 22 62 30 60 Z', SEA.greenLight)}
    ${shape('M24 50 L12 47 L13 53 Z', SEA.greenLight, 2.6)}
    ${shape('M76 50 C76 42 82 39 88 40 C94 41 96 47 96 50 C96 53 94 59 88 60 C82 61 76 58 76 50 Z', SEA.greenLight)}
    ${eye(89, 46, 2.4)}${eye(89, 54, 2.4)}
    ${shape('M22 50 C22 34 36 26 52 26 C68 26 80 36 80 50 C80 64 68 74 52 74 C36 74 22 66 22 50 Z', SEA.green)}
    ${shape(plates, SEA.moss, 2.4)}
    ${line('M43 43 L33 37 M43 54 L33 60 M61 43 L70 37 M61 54 L70 60 M52 38 L52 28.5 M52 59 L52 71.5', INK, 2.2)}
    ${line('M27 50 L35 50 M70 50 L76.5 50', INK, 2.2)}`;
}

// 7: Krake mit großen Augen (Karte zum Ansehen)
function octopus() {
  const arms = [
    'M34 56 C24 62 18 72 22 82 C25 88 32 86 31 80',
    'M42 60 C38 70 36 80 42 88 C46 92 51 88 48 84',
    'M58 60 C62 70 64 80 58 88 C54 92 49 88 52 84',
    'M66 56 C76 62 82 72 78 82 C75 88 68 86 69 80',
    'M28 50 C18 50 10 56 10 64 C10 70 17 71 18 66',
    'M72 50 C82 50 90 56 90 64 C90 70 83 71 82 66',
  ];
  const suckers = [[22, 74], [40, 78], [60, 78], [78, 74], [12, 60], [88, 60]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${SEA.coralLight}" stroke="${INK}" stroke-width="1"/>`)
    .join('');
  return `${arms.map((d) => rope(d, SEA.coral, 10.5)).join('')}${suckers}
    ${shape('M26 50 C26 26 36 13 50 13 C64 13 74 26 74 50 C74 59 64 64 50 64 C36 64 26 59 26 50 Z', SEA.rust)}
    ${line('M34 26 C36 21 40 18 44 17', SEA.coralLight, 2.6)}
    <ellipse cx="41" cy="44" rx="7" ry="8" fill="#fff" stroke="${INK}" stroke-width="2.8"/>
    <ellipse cx="59" cy="44" rx="7" ry="8" fill="#fff" stroke="${INK}" stroke-width="2.8"/>
    ${eye(42.5, 45.5, 3.6)}${eye(60.5, 45.5, 3.6)}
    ${line('M46 56.5 Q50 59 54 56.5', INK, 2.2)}`;
}

// 8: Kugelfisch, aufgeblasen mit Stacheln
function puffer() {
  const spikes = Array.from({ length: 16 }, (_, i) => {
    const a = -170 + i * 21;
    if (a > 150 && a < 210) return '';
    const [x1, y1] = polar(52, 52, 28, a - 6);
    const [x2, y2] = polar(52, 52, 37, a);
    const [x3, y3] = polar(52, 52, 28, a + 6);
    return `M${x1} ${y1} L${x2} ${y2} L${x3} ${y3}`;
  }).join(' ');
  return `${shape(spikes, SEA.ochreLight, 2.4)}
    ${shape('M24 52 L8 40 C11 48 11 56 8 64 Z', SEA.ochre, 3)}
    <circle cx="52" cy="52" r="30" fill="${SEA.ochre}" stroke="${INK}" stroke-width="${W}"/>
    <path d="M27 62 C34 76 56 84 72 76 C78 72 81 67 82 62 C70 70 44 72 27 62 Z" fill="${SEA.ochreLight}"/>
    ${[[40, 38], [50, 32], [60, 36], [36, 50], [46, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${SEA.rust}"/>`).join('')}
    ${shape('M50 60 C46 66 40 68 36 66 C40 62 44 58 50 56 Z', SEA.ochreLight, 2.2)}
    <circle cx="68" cy="45" r="8" fill="#fff" stroke="${INK}" stroke-width="2.8"/>${eye(70, 46, 4)}
    <ellipse cx="81" cy="58" rx="3.4" ry="4" fill="${SEA.coral}" stroke="${INK}" stroke-width="2.4"/>`;
}

// 9: Rochen von oben (Karte zum Spionieren)
function ray() {
  const body = 'M50 22 C60 26 78 38 94 52 C80 56 64 58 56 70 L50 74 L44 70 C36 58 20 56 6 52 C22 38 40 26 50 22 Z';
  return `${line('M50 72 C51 82 48 88 52 96', INK, 3)}
    ${shape(body, SEA.blue)}
    ${shape('M42 25 C40 18 42 14 45 13 C46 17 46 21 47 23.5 Z', SEA.blue, 2.6)}
    ${shape('M58 25 C60 18 58 14 55 13 C54 17 54 21 53 23.5 Z', SEA.blue, 2.6)}
    ${line('M30 44 C38 46 44 52 46 62 M70 44 C62 46 56 52 54 62', SEA.blueLight, 2.2)}
    ${[[24, 50], [76, 50], [36, 40], [64, 40], [50, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${SEA.blueLight}"/>`).join('')}
    ${eye(43, 30, 2.8)}${eye(57, 30, 2.8)}`;
}

// 10: Delfin im Sprung über einer Welle
function dolphin() {
  const body = 'M13 68 C17 58 23 49 31 41 C41 29 56 21 70 23 C79 25 84 31 87 38 L95 41 C93 45 88 47 84 47 C82 52 78 55 73 53 C68 48 60 45 52 46 C44 47 37 53 31 61 C27 66 21 70 16 72 Z';
  return `${shape('M15 69 L4 62 C6 68 6 74 8 80 L17 71 Z', SEA.blueMid, 3)}
    ${shape('M50 28 C50 18 56 11 63 9 C61 15 61 21 63 25 Z', SEA.blueMid, 3)}
    ${shape('M60 44 C60 52 56 58 50 60 C52 54 52 49 53 45 Z', SEA.blueMid, 2.8)}
    ${shape(body, SEA.blueMid)}
    <path d="M84 47 C82 52 78 55 73 53 C68 48 60 45 52 46 C44 47 37 53 31 61 C36 50 44 42 54 41.5 C64 41 72 46 76 50 C79 50.5 82 49 84 47 Z" fill="${SEA.blueLight}"/>
    ${line('M84 43.5 Q88 44.5 93 43', INK, 1.8)}
    ${eye(76, 37, 2.8)}
    ${line('M8 88 Q16 82 24 88 T40 88 T56 88 T72 88 T88 88', SEA.blue, 3)}
    ${line('M30 96 Q38 91 46 96 T62 96', SEA.blueLight, 2.6)}`;
}

// 11: Hai, schlank, nach links (Karte zum Tauschen)
function shark() {
  const body = 'M8 52 C14 44 26 38 42 37 C58 36 72 40 80 46 L94 32 C92 42 92 52 95 64 L80 56 C70 62 52 66 36 64 C24 62 14 58 8 52 Z';
  return `${shape('M44 37.5 C48 26 54 20 62 17 C60 25 60 32 62 38.5 Z', SEA.gray, 3)}
    ${shape('M42 62 C40 70 34 74 28 75 C30 70 32 66 34 62.5 Z', SEA.gray, 2.8)}
    ${shape(body, SEA.gray)}
    <path d="M10 54 C18 60 30 63 44 63 C58 63 70 60 78 56.5 C66 58 48 59 34 57 C24 56 16 55 10 54 Z" fill="${SEA.grayLight}"/>
    ${line('M33 46 L31 54 M37 46 L35 54 M41 46 L39 54', INK, 1.8)}
    ${eye(22, 47, 2.8)}
    ${line('M10 54 Q16 57 24 55', INK, 2)}
    ${shape('M13 55.5 L14.6 58.4 L16.2 55.9 L17.8 58.6 L19.4 56 Z', '#fff', 1.2)}
    ${shape(body, 'none')}`;
}

// 12: Wal mit Fontäne
function whale() {
  const body = 'M10 58 C10 40 26 30 46 30 C64 30 76 40 80 52 C84 50 88 44 90 38 L96 34 C96 42 94 50 88 54 C92 58 96 62 96 68 L88 62 C82 70 66 78 46 78 C24 78 10 72 10 58 Z';
  return `${line('M40 26 C38 18 32 14 26 14 M40 26 C42 16 48 12 54 12 M40 26 L40 12', SEA.blueLight, 4.2)}
    ${line('M40 26 C38 18 32 14 26 14 M40 26 C42 16 48 12 54 12 M40 26 L40 12', SEA.blue, 1.6)}
    ${shape(body, SEA.blue)}
    <path d="M12 62 C16 72 30 77 46 77 C62 77 74 72 82 64 C70 70 56 72 44 71 C30 70 18 67 12 62 Z" fill="${SEA.blueLight}"/>
    ${line('M24 70 L26 74 M32 72 L33 76 M40 72.5 L40.5 76.5 M48 72.5 L48 76.5 M56 71.5 L55.5 75.5', SEA.blue, 1.6)}
    ${shape('M38 60 C38 68 32 72 26 72 C28 66 30 62 33 59 Z', SEA.blueMid, 2.6)}
    ${eye(24, 52, 3)}
    ${line('M12 60 Q18 63 28 61', INK, 2)}`;
}

// 13: Seeungeheuer, das aus den Wellen taucht
function monster() {
  return `${rope('M30 70 C32 54 44 52 46 66', SEA.green, 11)}
    ${rope('M54 70 C56 52 70 50 72 66', SEA.green, 11)}
    ${shape('M74 64 C78 58 86 58 92 52 C90 60 84 66 78 68 Z', SEA.green, 2.8)}
    ${line('M36 56 L37 52 M40 55 L42 51 M60 54 L61 50 M64 53 L66 49', INK, 2)}
    ${shape('M10 70 C8 54 12 38 22 30 C30 24 40 26 42 34 C44 40 38 44 32 42 C26 52 26 62 28 70 Z', SEA.green)}
    ${shape('M22 30 L18 20 L26 26 L28 16 L32 26 L38 22 L36 30 Z', SEA.moss, 2.4)}
    <path d="M28 66 C27 58 28 50 31 43 C29 52 29 60 30 66 Z" fill="${SEA.greenLight}"/>
    ${eye(33, 33, 3)}
    ${line('M30 30 L37 28.6', INK, 2.2)}
    ${shape('M40 38 L41.4 42 L38 40 Z', '#fff', 1.2)}
    ${line('M4 74 Q12 68 20 74 T36 74 T52 74 T68 74 T84 74 T100 74', SEA.blue, 3.4)}
    ${line('M14 84 Q22 79 30 84 T46 84 T62 84 T78 84 T94 84', SEA.blueLight, 2.8)}`;
}

const ART = [shell, star, seahorse, crab, jelly, fish, turtle, octopus, puffer, ray, dolphin, shark, whale, monster].map(
  (fn) => `<svg viewBox="0 0 100 100" aria-hidden="true">${fn()}</svg>`,
);

// Rückseite: Wellenschuppen (Seigaiha) in Meerblau, Rahmen und Medaillon mit Anker
function backSVG() {
  const r = 7;
  const rows = [];
  for (let row = 0; row < 26; row++) {
    const y = row * 3.6 - 9;
    const off = row % 2 ? r : 0;
    for (let x = -r + off; x <= 60 + r; x += 2 * r) {
      rows.push(`<circle cx="${x}" cy="${y + r}" r="${r}" fill="${SEA.blue}"/>`,
        `<circle cx="${x}" cy="${y + r}" r="${r - 1.9}" fill="none" stroke="${SEA.blueLight}" stroke-width="1"/>`,
        `<circle cx="${x}" cy="${y + r}" r="${r - 3.8}" fill="none" stroke="${SEA.blueLight}" stroke-width="1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90"><rect width="60" height="90" fill="${SEA.blue}"/>${rows.join('')}
    <rect x="3.5" y="3.5" width="53" height="83" rx="2" fill="none" stroke="#fff" stroke-width="1.6"/>
    <circle cx="30" cy="45" r="12" fill="#fff" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="30" cy="45" r="9.4" fill="none" stroke="${SEA.blue}" stroke-width=".8"/>
    <g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="30" cy="38.6" r="1.8"/><path d="M30 40.4 V51.6 M26 43 H34 M23.6 47.6 C24.6 51 27 52.4 30 52.4 C33 52.4 35.4 51 36.4 47.6 M23 49 L23.6 47.4 L25.2 48.2 M37 49 L36.4 47.4 L34.8 48.2"/>
    </g></svg>`;
}

// --- Karten ---

const PLURAL = ['Nullen', 'Einsen', 'Zweien', 'Dreien', 'Vieren', 'Fünfen', 'Sechsen', 'Siebenen', 'Achten', 'Neunen', 'Zehnen', 'Elfen', 'Zwölfen', 'Dreizehnen'];
const LABEL = { schauen: 'Ansehen', spionieren: 'Spionieren', tauschen: 'Tauschen' };
const valueColor = (v) => (v <= 6 ? '#2f8585' : v <= 8 ? '#a8751a' : v <= 10 ? '#3a6b98' : v <= 12 ? '#c0592f' : '#8f2f24');
const BACK_URL = `url("data:image/svg+xml,${encodeURIComponent(backSVG())}")`;

function faceHTML(v) {
  const power = POWER[v];
  return `<span class="cb-num">${v}</span><span class="cb-big">${v}</span><span class="cb-art">${ART[v]}</span>${power ? `<span class="cb-lbl">${LABEL[power]}</span>` : ''}`;
}

// Eine Karte: Knopf mit Vorder- und Rückseite, umgedreht per Klasse `up` (Übergang im CSS).
function cardNode() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cb-card';
  b.innerHTML = '<span class="cb-inner"><span class="cb-face cb-front"></span><span class="cb-face cb-back"></span></span>';
  return b;
}

function setCard(node, v) {
  const up = v !== null && v >= 0;
  node.classList.toggle('gone', v === null);
  node.classList.toggle('up', up);
  if (up && node.dataset.v !== String(v)) {
    node.dataset.v = String(v);
    node.style.setProperty('--c', valueColor(v));
    node.querySelector('.cb-front').innerHTML = faceHTML(v);
  }
  node.setAttribute('aria-label', v === null ? 'leerer Platz' : up ? NOUN[v] : 'verdeckte Karte');
}

// Lose Karte (fliegt über den Tisch), v = -1 für verdeckt
function looseCard(v, cls = '') {
  const n = cardNode();
  n.classList.add('cb-ghost', ...cls.split(' ').filter(Boolean));
  n.tabIndex = -1;
  setCard(n, v);
  return n;
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;
const shownHtml = new WeakMap();
function put(el, html) {
  if (!el || shownHtml.get(el) === html) return false;
  shownHtml.set(el, html);
  el.innerHTML = html;
  return true;
}

const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, seenEv: null, sel: [], own: null, other: null, selAt: null, refreshAt: 0, raf: 0, pts: {} };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => cancelAnimationFrame(u.raf));
    if (!game.tv) el.addEventListener('click', (e) => onClick(e, el, u), { signal: game.signal });
  }
  return u;
}

export function present(el, s, game) {
  render(el, s, { ...game, tv: true });
}

export function render(el, s, game) {
  const tv = Boolean(game.tv);
  const u = local(el, game);
  u.s = s;
  u.game = game;
  clearTimeout(u.waitTimer);
  el.querySelectorAll('.cb .wait').forEach((n) => n.classList.remove('wait'));
  if (u.selAt !== s.seq) {
    // Neuer Stand: vorläufige Auswahl gilt nicht mehr
    u.sel = [];
    u.own = null;
    u.other = null;
    u.selAt = s.seq;
  }
  let root = el.querySelector(':scope > .cb');
  if (!root || root.dataset.tv !== String(tv)) {
    el.innerHTML = `<div class="cb ${tv ? 'cb-tv' : ''}" data-tv="${tv}">
      <div class="cb-board"></div>
      <div class="cb-head"><p class="status cb-status"></p><div class="cb-clock" aria-hidden="true"><i></i></div></div>
      <div class="cb-others"></div>
      <div class="cb-table">
        <button type="button" class="cb-pile cb-deck" data-pile="ziehen" aria-label="Stapel"><span class="cb-stack"></span><span class="cb-count"></span></button>
        <div class="cb-pile cb-hold"><span class="cb-stack cb-slot"></span><span class="cb-count">Gezogen</span></div>
        <button type="button" class="cb-pile cb-discard" data-pile="nehmen" aria-label="Ablage"><span class="cb-stack"></span><span class="cb-count">Ablage</span></button>
        <p class="cb-log"></p>
      </div>
      <section class="cb-seat cb-me"></section>
      <div class="cb-bar"></div>
      ${tv ? '' : rulesHTML(s)}
    </div>`;
    root = el.firstElementChild;
  }
  const motion = !game.reducedMotion;
  // Was ist seit dem letzten Zeichnen passiert?
  const fresh = u.seenEv === null || game.first ? [] : s.events.filter((e) => e.id > u.seenEv);
  u.seenEv = s.events.at(-1)?.id ?? 0;
  // Alte Positionen für fliegende Karten (Ablage, gezogene Karte) vor dem Umbau merken
  const before = motion && fresh.length ? snapshot(root) : null;

  paint(root, s, game, u);
  clock(root, s, game, u);

  if (!motion) return;
  if (game.first) return intro(root, s);
  if (fresh.length && fresh.length <= 4) animate(root, s, game, u, fresh, before);
}

// --- Zeichnen ---

function seatsOrder(s, game) {
  return game.tv ? ids(s) : around(s, game.me).slice(1);
}

function paint(root, s, game, u) {
  const tv = Boolean(game.tv);
  const me = game.me;
  const q = (sel) => root.querySelector(sel);
  const others = seatsOrder(s, game);
  root.dataset.phase = s.phase;

  put(q('.cb-board'), boardHTML(s, game));
  put(q('.cb-status'), statusHTML(s, game, u));
  q('.cb-clock').hidden = !s.limit;

  const box = q('.cb-others');
  box.classList.toggle('many', others.length > 2);
  box.classList.toggle('two', others.length === 2);
  box.style.setProperty('--seats', others.length);
  if (box.children.length !== others.length) {
    box.innerHTML = others.map(() => '<section class="cb-seat cb-them"></section>').join('');
  }
  const seats = others.map((id, k) => [box.children[k], id]);
  if (!tv) seats.push([q('.cb-me'), me]);
  q('.cb-me').hidden = tv;
  const act = actable(s, game, u);
  for (const [seat, id] of seats) paintSeat(seat, s, game, u, id, act);

  // Tisch: Stapel, gezogene Karte, Ablage
  const deck = q('.cb-deck');
  const deckStack = deck.querySelector('.cb-stack');
  const layers = Math.min(3, s.deck);
  if (deckStack.childElementCount !== layers) {
    deckStack.replaceChildren(...Array.from({ length: layers }, () => looseCard(-1, 'cb-pilecard')));
  }
  deckStack.classList.toggle('empty', !s.deck);
  put(deck.querySelector('.cb-count'), `<b class="num">${s.deck}</b> Stapel`);
  deck.disabled = !act.piles;
  const discard = q('.cb-discard');
  const top = discard.querySelector('.cb-stack');
  let topCard = top.querySelector('.cb-card');
  if (s.top === null) top.replaceChildren();
  else {
    if (!topCard) {
      topCard = looseCard(s.top, 'cb-pilecard');
      top.replaceChildren(topCard);
    }
    setCard(topCard, s.top);
  }
  top.classList.toggle('empty', s.top === null);
  discard.disabled = !act.piles || s.top === null;

  const hold = q('.cb-hold .cb-slot');
  const drawnKey = s.drawn ? `${s.seq}:${s.drawn.card}` : '';
  if (hold.dataset.key !== drawnKey) {
    hold.dataset.key = drawnKey;
    hold.replaceChildren(...(s.drawn ? [looseCard(s.drawn.card, 'cb-pilecard')] : []));
  }
  hold.closest('.cb-hold').classList.toggle('has', Boolean(s.drawn));
  hold.closest('.cb-hold').style.setProperty('--pc', s.turn ? game.color(s.turn) : 'var(--ink)');

  const latest = s.events.filter((e) => !['runde', 'los', 'ende'].includes(e.kind)).at(-1);
  put(q('.cb-log'), latest && !['pause', 'ende'].includes(s.phase) ? describe(latest, s, game) : '');
  if (!tv) put(q('.cb-bar'), barHTML(s, game, u));
}

// Was darf ich gerade antippen?
function actable(s, game, u) {
  const me = game.me;
  const out = { piles: false, card: () => false, chosen: () => false };
  if (game.tv || s.result) return out;
  if (s.phase === 'merken') {
    out.card = (who, i) => who === me && !s.ready[me] && (s.seen[me]?.length ?? 0) < 2 && !s.seen[me]?.includes(i);
    return out;
  }
  if (s.turn !== me) return out;
  if (s.phase === 'zug') out.piles = true;
  if (s.phase === 'entscheiden') {
    out.card = (who) => who === me;
    out.chosen = (who, i) => who === me && u.sel.includes(i);
  }
  if (s.phase === 'aktion') {
    if (s.power === 'schauen') out.card = (who) => who === me;
    if (s.power === 'spionieren') out.card = (who) => who !== me;
    if (s.power === 'tauschen') {
      out.card = (who) => who !== s.cabo || who === me;
      out.chosen = (who, i) => (who === me ? u.own === i : u.other?.who === who && u.other.slot === i);
    }
  }
  return out;
}

function paintSeat(seat, s, game, u, id, act) {
  const me = game.me;
  const hand = s.hands[id];
  const cls = ['cb-seat', id === me ? 'cb-me' : 'cb-them'];
  const playing = ['zug', 'entscheiden', 'aktion', 'schauen'].includes(s.phase);
  if (playing && s.turn === id) cls.push('is-turn');
  if (s.cabo === id) cls.push('is-cabo');
  if (s.result) cls.push(s.result.winners.includes(id) ? 'win' : 'lose');
  seat.className = cls.join(' ');
  seat.dataset.who = id;
  seat.style.setProperty('--pc', game.color(id));

  if (!seat.firstElementChild) {
    seat.innerHTML = '<header class="cb-seat-head"><span class="cb-who"></span><span class="cb-tag"></span><span class="cb-pts num"></span></header><div class="cb-hand"></div>';
  }
  put(seat.querySelector('.cb-who'), `${marker(game, id)} <span class="cb-name">${id === me ? 'Du' : game.esc(game.name(id))}</span>`);
  put(seat.querySelector('.cb-tag'), tagHTML(s, id));
  const open = s.phase === 'pause' || s.phase === 'ende';
  const pts = seat.querySelector('.cb-pts');
  put(pts, open ? String(s.last.points[id]) : '');
  pts.setAttribute('aria-label', open ? `${word(s.last.points[id])} Punkte in dieser Runde` : '');

  const box = seat.querySelector('.cb-hand');
  while (box.children.length < hand.length) box.append(cardNode());
  while (box.children.length > hand.length) box.lastElementChild.remove();
  const cols = Math.max(2, Math.ceil(hand.length / 2));
  box.style.setProperty('--cols', cols);
  [...box.children].forEach((n, i) => {
    n.dataset.slot = i;
    n.dataset.who = id;
    setCard(n, hand[i]);
    const can = hand[i] !== null && act.card(id, i);
    n.disabled = !can;
    n.classList.toggle('can', can);
    n.classList.toggle('chosen', act.chosen(id, i));
    n.classList.toggle('look', s.phase === 'schauen' && s.look.who === id && s.look.slot === i);
    n.classList.toggle('seen', s.phase === 'merken' && id === me && Boolean(s.seen[me]?.includes(i)));
  });
}

function tagHTML(s, id) {
  const open = s.phase === 'pause' || s.phase === 'ende';
  if (open && s.last.kamikaze === id) return '<span class="cb-stamp">Kamikaze</span>';
  if (open && s.last.cabo === id) return `<span class="cb-stamp">${s.last.caboOk ? 'Cabo geschafft' : 'Cabo plus fünf'}</span>`;
  if (s.cabo === id) return '<span class="cb-stamp">Cabo</span>';
  if (s.phase === 'merken' && s.ready[id]) return '<span class="cb-ready">Gemerkt</span>';
  return '';
}

function boardHTML(s, game) {
  const open = s.phase === 'pause' || s.phase === 'ende';
  if (!s.target) {
    return `<p class="cb-goal">Eine Runde. Die wenigsten Punkte gewinnen.</p>`;
  }
  const rows = s.players
    .map((p, k) => {
      const total = s.totals[p.id];
      const gain = open && s.last.round === s.round ? s.totals[p.id] - s.last.before[p.id] : null;
      const cls = ['cb-row'];
      if (s.result) cls.push(s.result.winners.includes(p.id) ? 'win' : 'lose');
      return `<div class="${cls.join(' ')}" data-id="${p.id}" style="--pc:${game.color(p.id)};--k:${k}">
        <span class="cb-row-name">${marker(game, p.id)} <span class="cb-name">${p.id === game.me ? 'Du' : game.esc(p.name)}</span></span>
        <span class="cb-gain num">${gain === null ? '' : gain >= 0 ? `+${gain}` : gain}</span>
        <span class="cb-total num" data-total aria-label="${word(total)} Punkte">${total}</span>
        <span class="cb-track" aria-hidden="true"><i style="transform:scaleX(${Math.min(1, total / s.target)})"></i></span>
      </div>`;
    })
    .join('');
  return `<div class="cb-rows ${s.players.length > 3 ? 'many' : ''}">${rows}</div>
    <p class="cb-goal">Runde ${word(s.round)}. Wer über ${word(s.target)} kommt, beendet das Spiel. Die wenigsten Punkte gewinnen.</p>`;
}

function statusHTML(s, game, u) {
  const me = game.me;
  const tv = Boolean(game.tv);
  const name = (id) => game.esc(game.name(id));
  const turn = s.turn;
  const mine = !tv && turn === me;
  if (s.phase === 'pause' || s.phase === 'ende') return roundText(s, game);
  if (s.phase === 'merken') {
    const waiting = ids(s).filter((id) => !s.ready[id]);
    if (!tv && !s.ready[me]) {
      const n = s.seen[me]?.length ?? 0;
      if (n === 0) return 'Tippe zwei deiner Karten an und merke sie dir gut.';
      if (n === 1) return 'Noch eine Karte antippen.';
      return 'Merke dir beide gut, dann tippe auf Gemerkt.';
    }
    return waiting.length > 2 ? `Noch ${word(waiting.length)} merken sich ihre Karten.` : `Warte auf ${listNames(waiting.map(name))}.`;
  }
  const last = s.cabo && turn !== s.cabo ? (mine ? 'Dein letzter Zug. ' : 'Letzter Zug. ') : '';
  const who = `${marker(game, turn)} ${mine ? 'Du' : name(turn)}`;
  if (s.phase === 'zug') {
    if (!mine) return `${last}${who} ist dran.`;
    return `${last}${marker(game, me)} Zieh vom Stapel, nimm die ${NOUN[s.top] ?? 'Karte'} von der Ablage${s.cabo ? '' : ' oder rufe Cabo'}.`;
  }
  if (s.phase === 'entscheiden') {
    const c = s.drawn.card;
    if (!mine) return s.drawn.from === 'stapel' ? `${who} hat vom Stapel gezogen.` : `${who} nimmt die ${NOUN[c]} von der Ablage.`;
    if (s.drawn.from === 'ablage') return `${marker(game, me)} Tippe an, wogegen du die ${NOUN[c]} tauschst.`;
    const power = POWER[c] ? ` (${POWER_TEXT[POWER[c]]})` : '';
    return `${marker(game, me)} Eine ${NOUN[c]}: Tippe an, wogegen du tauschst, oder lege sie ab${power}.`;
  }
  if (s.phase === 'aktion') {
    if (!mine) return `${who} darf ${POWER_TEXT[s.power]}.`;
    if (s.power === 'schauen') return `${marker(game, me)} Tippe eine deiner Karten an, um sie anzusehen.`;
    if (s.power === 'spionieren') return `${marker(game, me)} Tippe eine Karte von jemand anderem an.`;
    return `${marker(game, me)} Tippe eine eigene und eine fremde Karte an. Sie werden blind getauscht.`;
  }
  if (s.phase === 'schauen') {
    if (mine) return `${marker(game, me)} Merke dir die Karte, dann tippe auf Fertig.`;
    const owner = s.look.who;
    if (owner === turn) return `${who} sieht sich eine eigene Karte an.`;
    return `${who} sieht sich eine Karte von ${owner === me && !tv ? 'dir' : name(owner)} an.`;
  }
  return '';
}

function roundText(s, game) {
  const L = s.last;
  const name = (id) => (id === game.me && !game.tv ? 'Du' : game.esc(game.name(id)));
  const parts = [];
  if (L.kamikaze) {
    parts.push(`Kamikaze: ${name(L.kamikaze)} ${L.kamikaze === game.me && !game.tv ? 'hast' : 'hat'} zwei Zwölfen und zwei Dreizehnen, alle anderen bekommen fünfzig.`);
  } else if (L.cabo) {
    const du = L.cabo === game.me && !game.tv;
    parts.push(L.caboOk
      ? `${name(L.cabo)} ${du ? 'hast' : 'hat'} die wenigsten Punkte und ${du ? 'bekommst' : 'bekommt'} null.`
      : `${name(L.cabo)} ${du ? 'hast' : 'hat'} nicht die wenigsten Punkte: fünf Strafpunkte.`);
  }
  for (const id of L.halved) parts.push(`${name(id)} ${id === game.me && !game.tv ? 'landest' : 'landet'} genau auf ${word(s.target)} und ${id === game.me && !game.tv ? 'fällst' : 'fällt'} auf ${word(s.target / 2)} zurück.`);
  if (!parts.length) parts.push(`Runde ${word(s.round)} ist vorbei.`);
  return parts.join(' ');
}

function barHTML(s, game, u) {
  const me = game.me;
  const val = (o = {}) => game.esc(JSON.stringify({ at: s.seq, ...o }));
  if (s.result) return '';
  if (s.phase === 'merken') {
    if (s.ready[me]) return '';
    return `<button class="btn primary" data-action="bereit" data-value="${val()}" ${(s.seen[me]?.length ?? 0) < 2 ? 'disabled' : ''}>Gemerkt</button>`;
  }
  if (s.phase === 'pause') return `<button class="btn primary" data-action="weiter" data-value="${game.esc(JSON.stringify({ round: s.round }))}">Nächste Runde</button>`;
  if (s.turn !== me) return '';
  if (s.phase === 'zug') {
    return `<button class="btn primary" data-action="ziehen" data-value="${val()}">Ziehen</button>
      <button class="btn" data-action="nehmen" data-value="${val()}" ${s.top === null ? 'disabled' : ''}>Ablage nehmen</button>
      <button class="btn cb-cabo-btn" data-action="cabo" data-value="${val()}" ${s.cabo ? 'disabled' : ''}>Cabo rufen</button>`;
  }
  if (s.phase === 'entscheiden') {
    const n = u.sel.length;
    const label = n > 1 ? `${ONES[n][0].toUpperCase()}${ONES[n].slice(1)} tauschen` : 'Tauschen';
    return `<button class="btn primary" data-action="tauschen" data-value="${val({ slots: u.sel })}" ${n ? '' : 'disabled'}>${label}</button>
      <button class="btn" data-action="ablegen" data-value="${val()}" ${s.drawn.from === 'ablage' ? 'disabled' : ''}>Ablegen</button>`;
  }
  if (s.phase === 'aktion') return `<button class="btn" data-action="auslassen" data-value="${val()}">Ohne Aktion weiter</button>`;
  if (s.phase === 'schauen') return `<button class="btn primary" data-action="fertig" data-value="${val()}">Fertig</button>`;
  return '';
}

function rulesHTML(s) {
  return `<details class="cb-rules">
    <summary>Regeln</summary>
    <ol>
      <li>Jeder hat vier verdeckte Karten. Am Anfang der Runde siehst du dir zwei davon an und merkst sie dir.</li>
      <li>Wer dran ist, zieht vom Stapel (nur du siehst die Karte) oder nimmt die oberste Karte der Ablage.</li>
      <li>Die Karte kommt gegen eine eigene Karte in deine Auslage, die alte geht offen auf die Ablage. Mehrere gleiche Karten darfst du zusammen gegen eine tauschen. Sind sie nicht gleich, bleiben sie liegen und die neue Karte kommt als Strafe dazu.</li>
      <li>Eine Karte vom Stapel darfst du auch ablegen. Eine Sieben oder Acht erlaubt dann, eine eigene Karte anzusehen, eine Neun oder Zehn eine fremde, eine Elf oder Zwölf tauscht eine eigene blind gegen eine fremde.</li>
      <li>Statt zu ziehen rufst du Cabo, wenn du glaubst, die wenigsten Punkte zu haben. Alle anderen sind noch einmal dran, deine Karten darf dabei niemand tauschen. Dann wird aufgedeckt.</li>
      <li>Jeder bekommt die Summe seiner Karten. Hat der Rufer die wenigsten (allein), bekommt er null, sonst fünf Strafpunkte dazu.</li>
      <li>Kamikaze: Wer am Ende genau zwei Zwölfen und zwei Dreizehnen hat, bekommt null, alle anderen fünfzig.</li>
      ${s.target ? `<li>Wer genau auf ${word(s.target)} kommt, fällt einmal auf ${word(s.target / 2)} zurück. Kommt jemand über ${word(s.target)}, ist das Spiel aus, und die wenigsten Punkte gewinnen.</li>` : '<li>Gespielt wird eine Runde, die wenigsten Punkte gewinnen.</li>'}
    </ol>
  </details>`;
}

// Ein Ereignis als Satz aus Sicht von `me`
function describe(e, s, game) {
  const me = game.tv ? null : game.me;
  const name = (id) => game.esc(game.name(id));
  const who = (id) => (id === me ? 'Du' : name(id));
  const v = (id, du, er) => (id === me ? du : er);
  const dat = (id) => (id === me ? 'dir' : name(id));
  switch (e.kind) {
    case 'zieht':
      return e.from === 'stapel'
        ? `${who(e.who)} ${v(e.who, 'ziehst', 'zieht')} vom Stapel.`
        : `${who(e.who)} ${v(e.who, 'nimmst', 'nimmt')} die ${NOUN[e.card]} von der Ablage.`;
    case 'tausch':
      return e.out.length > 1
        ? `${who(e.who)} ${v(e.who, 'tauschst', 'tauscht')} ${word(e.out.length)} ${PLURAL[e.out[0]]} gegen eine Karte.`
        : `${who(e.who)} ${v(e.who, 'tauschst', 'tauscht')} eine Karte, die ${NOUN[e.out[0]]} kommt auf die Ablage.`;
    case 'patzer':
      return `${who(e.who)} ${v(e.who, 'versuchst', 'versucht')} es mit ${listNames(e.out.map((c) => `einer ${NOUN[c]}`))}. Nicht gleich: Eine Strafkarte kommt dazu.`;
    case 'ablegen':
      return POWER[e.card]
        ? `${who(e.who)} ${v(e.who, 'legst', 'legt')} eine ${NOUN[e.card]} ab und ${v(e.who, 'darfst', 'darf')} ${POWER_TEXT[POWER[e.card]]}.`
        : `${who(e.who)} ${v(e.who, 'legst', 'legt')} eine ${NOUN[e.card]} ab.`;
    case 'schaut':
      return e.owner === e.who
        ? `${who(e.who)} ${v(e.who, 'siehst dir', 'sieht sich')} eine eigene Karte an.`
        : `${who(e.who)} ${v(e.who, 'siehst dir', 'sieht sich')} eine Karte von ${dat(e.owner)} an.`;
    case 'vertauscht':
      return `${who(e.who)} ${v(e.who, 'tauschst', 'tauscht')} blind eine Karte mit ${dat(e.owner)}.`;
    case 'verzichtet':
      return `${who(e.who)} ${v(e.who, 'verzichtest', 'verzichtet')} auf die Aktion.`;
    case 'cabo': {
      const rest = ids(s).filter((id) => id !== e.who);
      return `${who(e.who)} ${v(e.who, 'rufst', 'ruft')} Cabo. ${rest.length > 1 ? 'Alle anderen sind' : `${who(rest[0])} ${v(rest[0], 'bist', 'ist')}`} noch einmal dran.`;
    }
    case 'zeit':
      return e.card !== undefined
        ? `${e.who === me ? 'Deine Zeit' : `Die Zeit von ${name(e.who)}`} ist um, die ${NOUN[e.card]} kommt auf die Ablage.`
        : `${e.who === me ? 'Deine Zeit' : `Die Zeit von ${name(e.who)}`} ist um.`;
    case 'mischen':
      return 'Die Ablage wird zum neuen Stapel gemischt.';
    default:
      return '';
  }
}

// --- Eingaben ---

function onClick(e, el, u) {
  const s = u.s;
  const game = u.game;
  if (!s || s.result) return;
  const pile = e.target.closest('.cb-pile[data-pile]');
  if (pile && !pile.disabled) {
    game.send(pile.dataset.pile, { at: s.seq });
    return;
  }
  const card = e.target.closest('.cb-card[data-slot]');
  if (!card || card.disabled || card.classList.contains('cb-ghost')) return;
  const who = card.dataset.who;
  const slot = Number(card.dataset.slot);
  const me = game.me;
  const root = el.querySelector(':scope > .cb');
  if (s.phase === 'merken') {
    game.send('merken', { slot });
    return;
  }
  if (s.turn !== me) return;
  if (s.phase === 'entscheiden' && who === me) {
    u.sel = u.sel.includes(slot) ? u.sel.filter((i) => i !== slot) : [...u.sel, slot];
    return paint(root, s, game, u);
  }
  if (s.phase !== 'aktion') return;
  if (s.power === 'schauen' && who === me) return void game.send('aktion', { at: s.seq, slot });
  if (s.power === 'spionieren' && who !== me) return void game.send('aktion', { at: s.seq, owner: who, oslot: slot });
  if (s.power === 'tauschen') {
    if (who === me) u.own = u.own === slot ? null : slot;
    else u.other = u.other?.who === who && u.other.slot === slot ? null : { who, slot };
    if (u.own !== null && u.other) return void game.send('aktion', { at: s.seq, slot: u.own, owner: u.other.who, oslot: u.other.slot });
    paint(root, s, game, u);
  }
}

// --- Zeitlimit ---

function clock(root, s, game, u) {
  cancelAnimationFrame(u.raf);
  const bar = root.querySelector('.cb-clock i');
  if (!s.limit || s.deadline === null || s.result) {
    bar.style.transform = 'scaleX(0)';
    return;
  }
  const total = s.deadline - s.startedAt;
  const step = () => {
    if (game.signal.aborted) return;
    const now = game.now();
    const left = Math.max(0, s.deadline - now);
    bar.style.transform = `scaleX(${left / total})`;
    root.querySelector('.cb-clock').classList.toggle('low', left < 8000);
    if (now >= s.deadline + GRACE + 300 && Date.now() - u.refreshAt > 2000) {
      u.refreshAt = Date.now();
      game.refresh();
    }
    u.raf = requestAnimationFrame(step);
  };
  step();
}

// --- Bewegung ---

const EASE_IN = 'cubic-bezier(.2,.8,.2,1)';
const EASE_WAY = 'cubic-bezier(.6,0,.2,1)';

function snapshot(root) {
  const r = (el) => el && el.getBoundingClientRect();
  return { hold: r(root.querySelector('.cb-hold .cb-slot')), top: r(root.querySelector('.cb-discard .cb-stack')) };
}

function intro(root, s) {
  if (s.phase !== 'merken') return;
  const deck = root.querySelector('.cb-deck .cb-stack').getBoundingClientRect();
  const cards = [...root.querySelectorAll('.cb-hand .cb-card')];
  const step = Math.min(70, 1100 / Math.max(1, cards.length));
  // reihum austeilen: erst jedem die erste Karte, dann die zweite …
  const order = [...cards].sort((a, b) => a.dataset.slot - b.dataset.slot);
  order.forEach((n, i) => deal(n, deck, 200 + i * step));
  const top = root.querySelector('.cb-discard .cb-card');
  if (top) deal(top, deck, 200 + order.length * step + 80);
  root.querySelectorAll('.cb-row, .cb-seat-head').forEach((n, i) => {
    n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 60, easing: EASE_IN, fill: 'backwards' });
  });
}

// Karte kommt verdeckt vom Stapel an ihren Platz (dreht sich danach per Übergang um, falls offen)
function deal(n, from, delay) {
  const r = n.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (r.left + r.width / 2);
  const dy = from.top + from.height / 2 - (r.top + r.height / 2);
  n.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / r.width}) rotate(-6deg)` }, { transform: 'none' }], {
    duration: 460,
    delay,
    easing: EASE_WAY,
    fill: 'backwards',
  });
  if (n.classList.contains('up')) {
    n.querySelector('.cb-inner').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.6 }, { transform: 'none' }], { duration: 700, delay, easing: EASE_IN, fill: 'backwards' });
  }
}

// Eine lose Karte fliegt von `from` nach `to` (Rechtecke im Fenster); flip: unterwegs umdrehen
function fly(root, v, from, to, { delay = 0, duration = 460, flip = null, signal }) {
  if (!from || !to) return;
  const base = root.getBoundingClientRect();
  const n = looseCard(flip === 'up' ? -1 : v);
  const w = to.width;
  const h = to.height;
  n.style.cssText = `position:absolute;left:${to.left - base.left}px;top:${to.top - base.top}px;--w:${w}px;--h:${h}px;width:${w}px;height:${h}px;z-index:6`;
  root.append(n);
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const k = from.width / to.width;
  n.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'translate(0, -6%)', offset: 0.85 }, { transform: 'none' }], { duration, delay, easing: EASE_WAY, fill: 'backwards' });
  if (flip) {
    // Unterwegs umdrehen
    if (flip === 'up') setCard(n, v);
    const a = flip === 'up' ? 'rotateY(180deg)' : 'none';
    const b = flip === 'up' ? 'none' : 'rotateY(180deg)';
    const inner = n.querySelector('.cb-inner');
    inner.style.transition = 'none';
    inner.animate([{ transform: a }, { transform: a, offset: 0.2 }, { transform: b }], { duration, delay, easing: EASE_IN, fill: 'both' });
  }
  const done = () => n.remove();
  setTimeout(done, delay + duration + 40);
  signal.addEventListener('abort', done);
}

// Eine verdeckte Karte zeigt sich kurz allen (dreht sich auf, wartet, dreht sich zurück)
function showFor(root, node, v, delay, duration, signal) {
  if (!node) return;
  const r = node.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  const n = looseCard(v);
  n.style.cssText = `position:absolute;left:${r.left - base.left}px;top:${r.top - base.top}px;--w:${r.width}px;--h:${r.height}px;width:${r.width}px;height:${r.height}px;z-index:6`;
  root.append(n);
  const inner = n.querySelector('.cb-inner');
  inner.style.transition = 'none';
  const back = 'rotateY(180deg)';
  inner.animate([{ transform: back }, { transform: 'none', offset: 0.18 }, { transform: 'none', offset: 0.82 }, { transform: back }], { duration, delay, easing: EASE_IN, fill: 'both' });
  n.animate([{ transform: 'none' }, { transform: 'translateY(-10%) scale(1.06)', offset: 0.18 }, { transform: 'translateY(-10%) scale(1.06)', offset: 0.82 }, { transform: 'none' }], { duration, delay, easing: EASE_IN });
  hideUntil(node, 0);
  node.animate([{ opacity: 0 }, { opacity: 0 }], { duration: delay + duration });
  const done = () => n.remove();
  setTimeout(done, delay + duration + 40);
  signal.addEventListener('abort', done);
}

// Ein Element bleibt unsichtbar, bis eine fliegende Karte dort ankommt
function hideUntil(el, t) {
  el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: t, fill: 'backwards' });
}

function lift(el, t, dur = 520) {
  el?.animate([{ transform: 'none' }, { transform: 'translateY(-12%) scale(1.08)', offset: 0.4 }, { transform: 'none' }], { duration: dur, delay: t, easing: EASE_IN });
}

function animate(root, s, game, u, fresh, before) {
  const signal = game.signal;
  const rect = (el) => el?.getBoundingClientRect();
  const card = (who, slot) => root.querySelector(`.cb-seat[data-who="${who}"] .cb-card[data-slot="${slot}"]`);
  const deck = rect(root.querySelector('.cb-deck .cb-stack'));
  const hold = before.hold ?? rect(root.querySelector('.cb-hold .cb-slot'));
  const holdNow = rect(root.querySelector('.cb-hold .cb-slot'));
  const pile = rect(root.querySelector('.cb-discard .cb-stack'));
  const topCard = root.querySelector('.cb-discard .cb-card');
  const prevDrawn = game.prev?.drawn?.card ?? -1;
  let t = 0;
  for (const e of fresh) {
    switch (e.kind) {
      case 'zieht': {
        const real = root.querySelector('.cb-hold .cb-card');
        fly(root, e.from === 'ablage' ? e.card : -1, e.from === 'ablage' ? before.top : deck, holdNow, { delay: t, signal });
        hideUntil(real, t + 460);
        if (real?.classList.contains('up') && e.from === 'stapel') {
          real.querySelector('.cb-inner').animate([{ transform: 'rotateY(180deg)' }, { transform: 'none' }], { duration: 360, delay: t + 460, easing: EASE_IN, fill: 'backwards' });
        }
        t += 520;
        break;
      }
      case 'tausch':
      case 'patzer': {
        const known = e.from === 'ablage' ? e.card : prevDrawn;
        if (e.kind === 'patzer') {
          // Die gewählten Karten zeigen sich allen, dann kommt die neue als Strafe dazu
          e.slots.forEach((slot, i) => showFor(root, card(e.who, slot), e.out[i], t, 1400, signal));
          t += 1100;
          const target = card(e.who, e.slot);
          fly(root, known, hold, rect(target), { delay: t, flip: known >= 0 ? 'down' : null, signal });
          hideUntil(target, t + 460);
          t += 520;
          break;
        }
        const target = card(e.who, e.slots[0]);
        // Alte Karten fliegen offen auf die Ablage
        e.slots.forEach((slot, i) => {
          const n = card(e.who, slot);
          fly(root, e.out[i], rect(n), pile, { delay: t + i * 90, flip: 'up', signal });
        });
        hideUntil(topCard, t + 460 + (e.slots.length - 1) * 90);
        fly(root, known, hold, rect(target), { delay: t + 160, flip: known >= 0 ? 'down' : null, signal });
        hideUntil(target, t + 620);
        e.slots.slice(1).forEach((slot) => hideUntil(card(e.who, slot), t + 1));
        t += 700;
        break;
      }
      case 'ablegen': {
        fly(root, e.card, hold, pile, { delay: t, flip: e.who === game.me ? null : 'up', signal });
        hideUntil(topCard, t + 460);
        t += 520;
        break;
      }
      case 'zeit': {
        if (e.card !== undefined) {
          fly(root, e.card, e.from === 'stapel' ? deck : hold, pile, { delay: t, flip: 'up', signal });
          hideUntil(topCard, t + 460);
          t += 520;
        }
        break;
      }
      case 'schaut': {
        lift(card(e.owner, e.slot), t);
        t += 300;
        break;
      }
      case 'vertauscht': {
        const a = card(e.who, e.slot);
        const b = card(e.owner, e.oslot);
        const ra = rect(a);
        const rb = rect(b);
        fly(root, -1, rb, ra, { delay: t, duration: 620, signal });
        fly(root, -1, ra, rb, { delay: t, duration: 620, signal });
        hideUntil(a, t + 620);
        hideUntil(b, t + 620);
        t += 680;
        break;
      }
      case 'cabo': {
        shout(root, 'Cabo', game.color(e.who), t, signal);
        const stamp = root.querySelector(`.cb-seat[data-who="${e.who}"] .cb-stamp`);
        stamp?.animate([{ opacity: 0, transform: 'scale(1.8) rotate(-8deg)' }, { opacity: 1, transform: 'rotate(-3deg)' }], { duration: 340, delay: t + 300, easing: EASE_IN, fill: 'backwards' });
        t += 900;
        break;
      }
      case 'mischen': {
        root.querySelector('.cb-deck .cb-stack').animate(
          [{ transform: 'none' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(6deg)' }, { transform: 'none' }],
          { duration: 420, delay: t, easing: 'ease-in-out' },
        );
        t += 300;
        break;
      }
      case 'runde': {
        const cards = [...root.querySelectorAll('.cb-hand .cb-card')].sort((a, b) => a.dataset.slot - b.dataset.slot);
        const step = Math.min(70, 1100 / Math.max(1, cards.length));
        cards.forEach((n, i) => deal(n, deck, t + 120 + i * step));
        if (topCard) deal(topCard, deck, t + 120 + cards.length * step + 60);
        t += 400;
        break;
      }
      case 'ende': {
        reveal(root, s, game, u, t, signal);
        t += 1200;
        break;
      }
      default:
    }
  }
  // Knöpfe erst, wenn alles liegt
  const buttons = root.querySelectorAll('.cb-bar button, .cb-card.can, .cb-pile');
  if (t > 600) {
    buttons.forEach((b) => b.classList.add('wait'));
    u.waitTimer = setTimeout(() => buttons.forEach((b) => b.classList.remove('wait')), t - 200);
  }
}

// Großes Wort über dem Tisch (Cabo)
function shout(root, text, color, delay, signal) {
  const table = root.querySelector('.cb-table').getBoundingClientRect();
  const base = root.getBoundingClientRect();
  const n = document.createElement('div');
  n.className = 'cb-shout';
  n.textContent = text;
  n.style.cssText = `left:${table.left - base.left + table.width / 2}px;top:${table.top - base.top + table.height / 2}px;color:${color}`;
  root.append(n);
  n.animate(
    [
      { opacity: 0, transform: 'translate(-50%, -50%) scale(2.2) rotate(-10deg)' },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', offset: 0.25 },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', offset: 0.75 },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(.96) rotate(-4deg)' },
    ],
    { duration: 1300, delay, easing: EASE_IN, fill: 'both' },
  );
  const done = () => n.remove();
  setTimeout(done, delay + 1360);
  signal.addEventListener('abort', done);
}

// Rundenende: alle Karten drehen sich in einer Welle um, Punkte zählen hoch, Stempel fallen
function reveal(root, s, game, u, t, signal) {
  const seats = [...root.querySelectorAll('.cb-seat:not([hidden])')];
  let k = 0;
  for (const seat of seats) {
    const cards = [...seat.querySelectorAll('.cb-card:not(.gone)')];
    cards.forEach((n) => {
      const inner = n.querySelector('.cb-inner');
      inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'none' }], { duration: 420, delay: t + k * 45, easing: EASE_IN, fill: 'backwards' });
      k++;
    });
  }
  const after = t + k * 45 + 300;
  for (const seat of seats) {
    const pts = seat.querySelector('.cb-pts');
    const to = Number(pts.textContent);
    countUp(pts, 0, to, after, 500, signal);
    seat.querySelector('.cb-stamp')?.animate([{ opacity: 0, transform: 'scale(1.8) rotate(-8deg)' }, { opacity: 1, transform: 'rotate(-3deg)' }], { duration: 340, delay: after + 500, easing: EASE_IN, fill: 'backwards' });
  }
  root.querySelectorAll('.cb-row').forEach((row) => {
    const id = row.dataset.id;
    const from = s.last.before[id];
    const to = s.totals[id];
    countUp(row.querySelector('[data-total]'), from, to, after + 600, 700, signal);
    row.querySelector('.cb-track i').animate(
      [{ transform: `scaleX(${Math.min(1, from / s.target)})` }, { transform: `scaleX(${Math.min(1, to / s.target)})` }],
      { duration: 700, delay: after + 600, easing: EASE_IN, fill: 'backwards' },
    );
    row.querySelector('.cb-gain').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: after + 500, easing: EASE_IN, fill: 'backwards' });
  });
  if (s.result) {
    root.querySelectorAll('.cb-seat.win').forEach((seat, i) => {
      seat.querySelectorAll('.cb-card:not(.gone)').forEach((n, j) => lift(n, after + 1400 + i * 120 + j * 70, 600));
    });
  }
}

function countUp(node, from, to, delay, duration, signal) {
  if (!node || from === to) return;
  node.textContent = from;
  const start = performance.now() + Math.max(0, delay);
  const step = (now) => {
    if (signal.aborted) return;
    const p = Math.min(1, Math.max(0, (now - start) / duration));
    node.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const style = `
  .cb { position: relative; display: grid; gap: 14px; width: 100%; max-width: 560px; }

  /* ---------- Punkte ---------- */
  .cb-board { display: grid; gap: 8px; padding-top: 12px; border-top: 2px solid var(--line); }
  .cb-rows { display: grid; gap: 8px; }
  .cb-rows.many { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
  .cb-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 3px 8px; }
  .cb-row-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }
  .cb-row-name .marker { flex: none; }
  .cb-gain:empty { display: none; }
  .cb-gain { min-width: 2.2em; text-align: right; color: var(--muted); font: 800 var(--t-base) / 1 var(--font-display); }
  .cb-total { min-width: 1.6em; text-align: right; color: var(--pc); font: 800 var(--t-xl) / .9 var(--font-display); }
  .cb-track { grid-column: 1 / -1; position: relative; height: 5px; overflow: hidden; border-radius: var(--radius); background: var(--hairline); }
  .cb-track i { position: absolute; inset: 0; background: var(--pc); transform-origin: left; }
  .cb-row.lose { opacity: .45; }
  .cb-goal { color: var(--muted); font-size: var(--t-sm); }
  .cb-rows.many .cb-row { gap: 3px 4px; }
  .cb-rows.many .cb-gain { min-width: 1.9em; font-size: var(--t-sm); }
  .cb-rows.many .cb-total { font-size: var(--t-lg); }
  @media (max-width: 359px) { .cb-rows.many .cb-gain { display: none; } }

  /* ---------- Status und Uhr ---------- */
  .cb-head { display: grid; gap: 6px; }
  .cb-status { min-height: 3.9em; line-height: 1.3; }
  .cb-clock { position: relative; height: 4px; overflow: hidden; border-radius: var(--radius); background: var(--hairline); }
  .cb-clock[hidden] { display: none; }
  .cb-clock i { position: absolute; inset: 0; background: var(--ink); transform-origin: left; }
  .cb-clock.low i { background: var(--bad); }

  /* ---------- Plätze ---------- */
  .cb-seat { --w: 66px; --gap: 8px; display: grid; gap: 8px; align-content: start; min-width: 0; container-type: inline-size; }
  .cb-them { --w: 48px; --gap: 6px; padding-top: 8px; border-top: 1px solid var(--hairline); transition: border-color 240ms ease-out; }
  .cb-others { display: grid; gap: 12px; align-items: start; }
  .cb-others:empty { display: none; }
  .cb-others.two { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .cb-others.two .cb-them { --w: 42px; }
  .cb-others.many { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
  .cb-others.many .cb-them { --w: 32px; --gap: 4px; }
  .cb-them.is-turn { border-top-color: var(--pc); }
  /* Feste Höhe: die Rundenpunkte am Ende dürfen nichts verschieben */
  .cb-seat-head { display: flex; align-items: center; gap: 8px; height: 30px; min-width: 0; }
  .cb-who { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 700; }
  .cb-who .marker { flex: none; }
  .cb-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cb-seat.is-turn .cb-name { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: var(--pc); }
  .cb-tag { flex: none; }
  .cb-tag:empty { display: none; }
  /* Stempel bei den anderen schräg über den Karten, statt den Namen zu verdrängen */
  .cb-them { position: relative; }
  .cb-them .cb-tag { position: absolute; z-index: 3; left: 4px; top: calc(var(--w) * 2.62 + 26px); }
  .cb-stamp {
    display: inline-block; padding: 2px 7px 1px; rotate: -3deg;
    border: 2px solid var(--pc); border-radius: var(--radius); color: var(--pc); background: var(--paper);
    font: 800 var(--t-sm) / 1.15 var(--font-display); letter-spacing: .05em; text-transform: uppercase; white-space: nowrap;
  }
  .cb-ready { color: var(--muted); font-size: var(--t-sm); }
  .cb-pts:empty { display: none; }
  .cb-pts { margin-left: auto; min-width: 1.6em; text-align: right; color: var(--pc); font: 800 var(--t-xl) / 1 var(--font-display); }
  .cb-others.many .cb-seat-head { gap: 2px 6px; height: 26px; }
  .cb-others.many .cb-who { flex: 1 1 0; font-size: var(--t-sm); }
  .cb-others.many .cb-pts { font-size: var(--t-lg); }
  .cb-others.many .cb-stamp { font-size: 11px; padding: 1px 4px 0; }

  .cb-seat.lose .cb-hand { opacity: .55; }

  /* Hand: zwei Reihen, Strafkarten in neuen Spalten; zu viele Spalten machen die Karten schmaler */
  .cb-hand {
    --cw: min(var(--w), calc((100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols)));
    display: grid; grid-auto-flow: column; grid-template-rows: repeat(2, calc(var(--cw) * 1.44));
    grid-auto-columns: var(--cw); gap: var(--gap); justify-content: start;
  }
  .cb-me .cb-hand { justify-content: center; }
  .cb-hand > .cb-card { --w: var(--cw); }

  /* ---------- Karten ---------- */
  .cb-card {
    --c: var(--ink); position: relative; display: block; width: var(--w); height: calc(var(--w) * 1.44);
    padding: 0; border: 0; background: none; perspective: 600px; cursor: default;
    -webkit-tap-highlight-color: transparent;
  }
  .cb-card.gone { visibility: hidden; }
  .cb-inner { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateY(180deg); transition: transform 420ms cubic-bezier(.2,.8,.2,1); }
  .cb-card.up .cb-inner { transform: none; }
  .cb-face {
    position: absolute; inset: 0; overflow: hidden;
    border: 1.6px solid var(--ink); border-radius: var(--radius-m);
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .cb-front { background: color-mix(in srgb, var(--c) 9%, white); }
  .cb-front::before { content: ''; position: absolute; inset: 3px; border: 1px solid color-mix(in srgb, var(--c) 30%, white); border-radius: 2px; }
  .cb-back { transform: rotateY(180deg); background: ${BACK_URL} center / cover #3a6b98; }
  .cb-num { position: absolute; left: calc(var(--w) * .09); top: calc(var(--w) * .05); color: var(--c); font: 800 calc(var(--w) * .3) / 1 var(--font-display); }
  .cb-art { position: absolute; left: 11%; right: 11%; top: 25%; height: 54%; }
  .cb-art svg { display: block; width: 100%; height: 100%; }
  .cb-lbl { display: none; position: absolute; left: 0; right: 0; bottom: calc(var(--w) * .07); text-align: center; color: var(--c); font: 700 max(10.5px, calc(var(--w) * .14)) / 1 var(--font-body); }
  /* Was die Karte kann, steht nur auf großen Karten (eigene Hand, gezogene Karte) */
  .cb-me .cb-lbl, .cb-hold .cb-lbl { display: block; }
  .cb-big { display: none; position: absolute; inset: 0; place-items: center; color: var(--c); font: 800 calc(var(--w) * .62) / 1 var(--font-display); }
  /* Kleine Karten: nur die große Zahl, das Bild wäre zu klein */
  .cb-them .cb-num, .cb-them .cb-art, .cb-them .cb-lbl { display: none; }
  .cb-them .cb-big { display: grid; }
  .cb-them .cb-front::before { inset: 2px; }

  .cb-card.can { cursor: pointer; }
  .cb-card.can .cb-inner { transition: transform 420ms cubic-bezier(.2,.8,.2,1), translate 160ms ease-out; }
  .cb-card.can .cb-face { box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px color-mix(in srgb, var(--pc, var(--ink)) 45%, white); }
  .cb-card.can:hover .cb-inner { translate: 0 -3px; }
  .cb-card.can:active .cb-inner { scale: .96; }
  .cb-card.chosen .cb-inner, .cb-card.look .cb-inner { translate: 0 -8%; }
  .cb-card.chosen .cb-face, .cb-card.look .cb-face { box-shadow: 0 0 0 2px var(--paper), 0 0 0 4.5px var(--pc, var(--ink)); }
  .cb-card.seen .cb-face { box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--hairline); }
  .cb-card:disabled { opacity: 1; }
  .cb-card:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
  .cb-ghost { pointer-events: none; }
  .wait { pointer-events: none; }

  /* ---------- Tisch ---------- */
  .cb-table {
    /* Drei gleich breite Spalten: wechselnde Zahlen und Beschriftungen verschieben die Stapel nicht */
    position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-items: center; align-items: end;
    gap: 8px 12px; padding: 14px 0 12px; border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline);
  }
  .cb-pile { display: grid; justify-items: center; gap: 5px; padding: 0; border: 0; background: none; font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
  .cb-pile:not(:disabled) { cursor: pointer; }
  .cb-stack { --w: 56px; position: relative; display: block; width: var(--w); height: calc(var(--w) * 1.44); }
  .cb-stack > .cb-card { position: absolute; left: 0; top: 0; }
  .cb-deck .cb-stack > .cb-card:nth-child(1) { transform: translate(-3px, 3px); }
  .cb-deck .cb-stack > .cb-card:nth-child(2) { transform: translate(-1.5px, 1.5px); }
  .cb-stack.empty, .cb-hold .cb-slot:empty { border: 1.5px dashed var(--hairline); border-radius: var(--radius-m); }
  .cb-hold .cb-stack { --w: 66px; }
  .cb-hold.has .cb-count { color: var(--pc); }
  .cb-pile:not(:disabled) .cb-stack { transition: translate 160ms ease-out; }
  .cb-pile:not(:disabled):hover .cb-stack { translate: 0 -3px; }
  .cb-pile:not(:disabled):active .cb-stack { scale: .96; }
  .cb-pile:not(:disabled) .cb-card .cb-face { box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px color-mix(in srgb, var(--ink) 30%, white); }
  .cb-count { color: var(--muted); font-size: var(--t-sm); white-space: nowrap; }
  .cb-count b { color: var(--ink); font: 800 var(--t-base) / 1 var(--font-display); }
  .cb-log { grid-column: 1 / -1; min-height: 2.6em; line-height: 1.3; text-align: center; font-size: var(--t-sm); }
  .cb-shout {
    position: absolute; z-index: 8; pointer-events: none; padding: 4px 18px 0;
    border: 4px solid currentColor; border-radius: var(--radius-m); background: var(--paper);
    font: 800 var(--t-4xl) / 1 var(--font-display); letter-spacing: .06em; text-transform: uppercase;
  }

  /* ---------- Knöpfe ---------- */
  .cb-bar { display: flex; flex-wrap: wrap; gap: 10px 12px; min-height: 44px; }
  .cb-bar .btn:active:not(:disabled) { transform: scale(.96); }
  .cb-cabo-btn:not(:disabled) { border-color: var(--ink); font-weight: 800; }

  /* ---------- Regeln ---------- */
  .cb-rules { padding-top: 10px; border-top: 1px solid var(--hairline); font-size: var(--t-sm); }
  .cb-rules summary { width: max-content; cursor: pointer; font-weight: 700; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .cb-rules ol { display: grid; gap: 4px; max-width: 60ch; margin-top: 8px; padding-left: 1.4em; list-style: decimal; }

  @media (min-width: 600px) {
    .cb-seat { --w: 76px; }
    .cb-them { --w: 54px; }
    .cb-others.two .cb-them { --w: 48px; }
    .cb-others.many .cb-them { --w: 38px; }
    .cb-stack { --w: 62px; }
    .cb-hold .cb-stack { --w: 76px; }
  }

  /* ---------- Bildschirm: links Punkte, Status und Tisch, rechts alle Plätze ---------- */
  .cb-tv { max-width: none; gap: 2vh 3vw; }
  .cb-tv .cb-me, .cb-tv .cb-bar, .cb-tv .cb-rules { display: none; }
  .cb-tv .cb-status { font-size: var(--t-md); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .cb-tv .cb-goal { display: none; }
  .cb-tv .cb-board:not(:has(.cb-row)) { display: none; }
  .cb-tv .cb-lbl, .cb-tv .cb-hold .cb-lbl { display: none; }
  .cb-tv .cb-rows { gap: .45rem; }
  .cb-tv .cb-track { height: 3px; }
  .cb-tv .cb-table { padding: 1vh 0; gap: .4rem 1.2rem; }
  .cb-tv .cb-who, .cb-tv .cb-others.many .cb-who { font-size: var(--t-md); }
  .cb-tv .cb-rows.many { grid-template-columns: minmax(0, 1fr); gap: .7vh; }
  .cb-tv .cb-row-name { font-size: var(--t-base); }
  .cb-tv .cb-goal { font-size: var(--t-base); }
  .cb-tv .cb-total { font-size: var(--t-xl); }
  .cb-tv .cb-stack { --w: 3.6rem; }
  .cb-tv .cb-hold .cb-stack { --w: 4.2rem; }
  .cb-tv .cb-count { font-size: var(--t-base); }
  .cb-tv .cb-log { font-size: var(--t-base); }
  .cb-tv .cb-others, .cb-tv .cb-others.two, .cb-tv .cb-others.many { grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: 2.4vh 2vw; }
  .cb-tv .cb-them, .cb-tv .cb-others.two .cb-them, .cb-tv .cb-others.many .cb-them { --w: 4.6rem; --gap: .5rem; padding-top: 1vh; border-top-width: 2px; }
  .cb-tv .cb-others.many .cb-seat-head, .cb-tv .cb-seat-head { height: 2.6rem; }
  .cb-tv .cb-others.many .cb-who, .cb-tv .cb-who { font: 800 var(--t-md) / 1.1 var(--font-display); }
  .cb-tv .cb-others.many .cb-pts, .cb-tv .cb-pts { font-size: var(--t-2xl); }
  .cb-tv .cb-others.many .cb-stamp, .cb-tv .cb-stamp { font-size: var(--t-sm); padding: 2px 8px 1px; }
  .cb-tv .cb-others .cb-them .cb-tag { left: .3rem; top: calc(var(--w) * 2.62 + 2.6rem); }
  .cb-tv .cb-them.is-turn { background: color-mix(in srgb, var(--pc) 8%, white); }
  .cb-tv .cb-them .cb-num, .cb-tv .cb-them .cb-art { display: block; }
  .cb-tv .cb-them .cb-big { display: none; }
  .cb-tv .cb-shout { font-size: 7rem; }
  @media (min-width: 880px) and (orientation: landscape) {
    .cb-tv { grid-template-columns: minmax(15rem, 21rem) minmax(0, 1fr); grid-template-areas: "board others" "head others" "table others" ". others"; grid-template-rows: auto auto auto 1fr; align-items: start; }
    .cb-tv .cb-board { grid-area: board; }
    .cb-tv .cb-head { grid-area: head; }
    .cb-tv .cb-table { grid-area: table; }
    .cb-tv .cb-others { grid-area: others; }
    .cb-tv .cb-others.many { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .cb-tv .cb-others.many .cb-them { --w: min(4.6rem, 12vh); }
  }

  @media (prefers-reduced-motion: reduce) {
    .cb *, .cb *::before, .cb *::after { animation: none !important; transition: none !important; }
  }
`;
