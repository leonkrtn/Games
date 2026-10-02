// Montagsmaler: Einer zeichnet, die anderen raten. Zu zweit bis zu sechst, gemeinsam.
//
// Ablauf pro Runde: Der Zeichner schreibt ein Wort (oder nimmt einen Vorschlag) → die Rater sehen nur
// die Striche wie beim Galgenmännchen, einer tippt auf „Bereit“ → die Zeit läuft ab dem ersten Strich,
// die Rater sehen live, was gezeichnet wird, und tippen Rateversuche ein → erraten (von irgendwem),
// Zeit um oder alle haben aufgegeben: nächste Runde, der Nächste zeichnet. Schafft ihr alle Wörter,
// gewinnt ihr alle. Am Ende zeigt eine Galerie alle Bilder der Partie.
//
// Zeichnen: Die Zeichnung ist eine Liste von Befehlen (Strich, Füllen, Löschen, Zurück, Vor), die der
// Server und beide Browser gleich anwenden. Gemalt wird auf ein eigenes Raster (S × S Punkte, jede
// Zelle eine Farbnummer) statt mit den Canvas-Funktionen: So ergibt der Eimer überall exakt dieselbe
// Fläche, auch wenn Browser Linien unterschiedlich glätten. Damit die Rater flüssig zusehen, gehen
// Striche schon während des Zeichnens über game.live an die anderen Browser; gespeichert wird jeder
// fertige Befehl mit einer laufenden Nummer (seq), damit nichts doppelt oder in falscher Reihenfolge ankommt.
//
// Motion: Die Runden bauen sich als Kästchen auf, die Buchstaben-Striche fallen ein, Stifte heben
// sich bei der Auswahl, der Eimer zieht einen Ring, „Alles löschen“ reißt das Blatt ab, falsche
// Versuche rutschen in die Liste. Ist das Wort erraten, schrumpft die Zeichnung in die Auflösung,
// die Buchstaben klappen um und ein Haken zeichnet sich ein. Am Ende kommt die Galerie Bild für Bild.

export const meta = {
  name: 'Montagsmaler',
  description: 'Einer zeichnet ein Wort, die anderen sehen live zu und raten. Zusammen gegen die Uhr.',
  players: [2, 6],
  options: [
    {
      id: 'jeder',
      label: 'Runden',
      choices: [
        { value: 2, label: 'Jeder zeichnet zweimal' },
        { value: 1, label: 'Jeder zeichnet einmal' },
        { value: 3, label: 'Jeder zeichnet dreimal' },
      ],
    },
    {
      id: 'zeit',
      label: 'Zeit pro Bild',
      choices: [
        { value: 90, label: 'Anderthalb Minuten' },
        { value: 60, label: 'Eine Minute' },
        { value: 120, label: 'Zwei Minuten' },
        { value: 0, label: 'Ohne Limit' },
      ],
    },
  ],
};

// ---------- Zeichnung (Server und Browser) ----------

const S = 1000; // Malfläche: S × S Rasterpunkte
const PEN = [4, 10, 22]; // Stiftdicke als Radius in Rasterpunkten: dünn, mittel, dick
const RUBBER = [10, 24, 48]; // Radierer
const COLORS = 7; // 0 = Papier (Radierer), 1–6 = Farben
const MAX_OPS = 1500;
const MAX_CHARS = 60_000; // Summe aller Strich-Codes einer Zeichnung, hält den Zustand klein
const MAX_STROKE = 6000; // Zeichen eines Strichs
const MAX_WORD = 24;
const GRACE = 800; // ms nach Ablauf: Tipps, die gerade unterwegs sind, zählen noch

const radius = (c, w) => (c === 0 ? RUBBER : PEN)[w];

// Punkte eines Strichs als kurzer Text: pro Achse ein Zeichen für den Abstand zum vorigen Punkt
// (−31 bis 31), sonst „_“ und zwei Zeichen für den Wert selbst.
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
function decodePoints(p) {
  if (typeof p !== 'string' || !p.length || p.length > MAX_STROKE) return null;
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
    if (v < 0 || v >= S) return null;
    prev[axis] = v;
    vals.push(v);
  }
  if (vals.length % 2) return null;
  const pts = [];
  for (let i = 0; i < vals.length; i += 2) pts.push([vals[i], vals[i + 1]]);
  return pts;
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Befehl → gespeicherter Schritt der Zeichnung (oder null, wenn er keiner ist bzw. nicht stimmt)
function cleanOp(cmd) {
  const { s, t } = cmd;
  if (t === 's' && isInt(cmd.c, 0, COLORS - 1) && isInt(cmd.w, 0, 2) && decodePoints(cmd.p)) {
    return { s, t, c: cmd.c, w: cmd.w, p: cmd.p };
  }
  if (t === 'f' && isInt(cmd.c, 0, COLORS - 1) && isInt(cmd.x, 0, S - 1) && isInt(cmd.y, 0, S - 1)) {
    return { s, t, c: cmd.c, x: cmd.x, y: cmd.y };
  }
  if (t === 'c') return { s, t };
  return null;
}

const charsOf = (ops) => ops.reduce((sum, op) => sum + (op.p?.length ?? 8), 0);

const emptyDrawing = () => ({ ops: [], n: 0, seq: 0 });

/**
 * Wendet einen Befehl auf die Zeichnung d = { ops, n, seq } an (verändert d).
 * ops.slice(0, n) ist zu sehen, der Rest lässt sich mit „Vor“ zurückholen.
 * Befehle: s Strich { c, w, p }, f Füllen { c, x, y }, c Alles löschen, u Zurück, r Vor;
 * jeder mit laufender Nummer s = seq + 1.
 * Rückgabe: false = passt nicht an diese Stelle, 'voll' = verworfen, weil die Zeichnung voll ist, sonst true.
 */
function applyCmd(d, cmd) {
  if (!cmd || typeof cmd !== 'object' || cmd.s !== d.seq + 1) return false;
  d.seq = cmd.s;
  if (cmd.t === 'u') d.n = Math.max(0, d.n - 1);
  else if (cmd.t === 'r') d.n = Math.min(d.ops.length, d.n + 1);
  else {
    const op = cleanOp(cmd);
    if (!op || (op.t === 'c' && !d.n)) return true;
    const ops = d.ops.slice(0, d.n);
    if (ops.length >= MAX_OPS || charsOf(ops) + (op.p?.length ?? 8) > MAX_CHARS) return 'voll';
    ops.push(op);
    d.ops = ops;
    d.n = ops.length;
  }
  return true;
}

// ---------- Wörter ----------

// Vorschläge: Dinge, die man gut zeichnen kann
const SUGGESTIONS = `Haus Baum Sonne Mond Stern Auto Fahrrad Schiff Flugzeug Rakete Zug Brücke Leuchtturm Burg Zelt
  Kirche Berg Vulkan Insel Wolke Regenbogen Blitz Schneemann Regenschirm Blume Kaktus Pilz Apfel Banane Birne
  Kirsche Erdbeere Ananas Karotte Tomate Brezel Pizza Eis Torte Tasse Flasche Gabel Löffel Topf Toaster
  Kühlschrank Lampe Kerze Stuhl Bett Sofa Fenster Treppe Schlüssel Schloss Wecker Brille Hut Krone Stiefel
  Socke Hose Handschuh Schal Rucksack Koffer Geschenk Luftballon Drachen Fußball Gitarre Trommel Klavier
  Trompete Glocke Buch Brief Schere Pinsel Kamera Telefon Fernseher Roboter Anker Kompass Fernglas Lupe
  Hammer Säge Leiter Schaufel Gießkanne Besen Zahnbürste Spiegel Badewanne Katze Hund Maus Elefant Giraffe
  Löwe Zebra Affe Bär Pinguin Eule Ente Schwan Fisch Hai Wal Krake Krebs Schnecke Schmetterling Biene
  Spinne Marienkäfer Schlange Frosch Schildkröte Krokodil Hase Igel Fuchs Pferd Kuh Schwein Schaf Huhn
  Dinosaurier Einhorn Gespenst Hexe Pirat Ritter König Clown Engel Zauberer Meerjungfrau Herz Auge Hand
  Zahn Skelett Feuer Rutsche Schaukel Karussell Ampel Zaun Brunnen Windmühle Iglu Pyramide Traktor Bagger
  Hubschrauber U-Boot Segelboot Würfel Schatzkiste Sanduhr Zauberstab Magnet Glühbirne Taschenlampe
  Fallschirm Heißluftballon Weihnachtsbaum Osterei Kürbis Schneeflocke Nest Spinnennetz Sandburg Muschel
  Palme Wasserfall Feuerwehrauto Zahnarzt Kran Kaffeemaschine Mikrofon Kopfhörer Briefkasten Vogelscheuche`
  .split(/\s+/)
  .filter(Boolean);
const SUGGEST_EACH = 6; // so viele Vorschläge bekommt ein Zeichner pro Runde

const NUMBERS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig', 'einundzwanzig',
  'zweiundzwanzig', 'dreiundzwanzig', 'vierundzwanzig'];
const word = (n) => NUMBERS[n] ?? String(n);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const LETTER = /\p{L}/u;
const letterCount = (w) => [...w].filter((ch) => LETTER.test(ch)).length;
const slotCount = (pattern) => [...pattern].filter((ch) => ch === '_').length;

// Was der Rater sieht: jeder Buchstabe ein Strich, Leerzeichen und Bindestriche bleiben.
const maskWord = (w) => [...w].map((ch) => (LETTER.test(ch) ? '_' : ch)).join('');

function cleanWord(text) {
  const w = String(text ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[\s-]+|[\s-]+$/g, '');
  if (!w) throw new Error('Bitte schreib ein Wort.');
  if (!/^[\p{L} -]+$/u.test(w)) throw new Error('Nur Buchstaben, Leerzeichen und Bindestriche.');
  if ([...w].length > MAX_WORD) throw new Error('Das ist zu lang. Höchstens vierundzwanzig Zeichen.');
  if (letterCount(w) < 2) throw new Error('Mindestens zwei Buchstaben.');
  return w;
}

// Zum Vergleichen: klein, Umlaute ausgeschrieben, Akzente, Leerzeichen und Bindestriche weg
const norm = (t) =>
  String(t ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Knapp daneben: ein Buchstabe anders (bei langen Wörtern zwei)
const isClose = (guess, target) => target.length >= 3 && distance(guess, target) <= (target.length >= 8 ? 2 : 1);

// ---------- Spielablauf (Server) ----------

const ids = (s) => s.players.map((p) => p.id);
const nextAfter = (s, id) => ids(s)[(ids(s).indexOf(id) + 1) % s.players.length];
const nameOf = (s, id) => s.players.find((p) => p.id === id)?.name ?? '?';
const guessersOf = (s) => ids(s).filter((id) => id !== s.drawer);
// „Ben muss“ (zu zweit) oder „Die anderen müssen“
const othersDo = (s, one, many) => {
  const g = guessersOf(s);
  return g.length === 1 ? `${nameOf(s, g[0])} ${one}` : `Die anderen ${many}`;
};

export function setup(players, options = {}) {
  const rounds = ([1, 2, 3].includes(options.jeder) ? options.jeder : 2) * players.length;
  const zeit = [0, 60, 90, 120].includes(options.zeit) ? options.zeit : 90;
  const deck = SUGGESTIONS.map((_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    players: players.map(({ id, name }) => ({ id, name })),
    rounds,
    zeit,
    round: 0,
    drawer: players[Math.floor(Math.random() * players.length)].id,
    phase: 'wort', // wort → bereit → malen → (nächste Runde) … → ende
    word: null,
    deck, // Reihenfolge der Vorschläge; jeder Zeichner bekommt die nächsten SUGGEST_EACH
    deckPos: 0,
    drawing: emptyDrawing(),
    startedAt: null, // erster Strich: ab da läuft die Zeit
    deadline: null,
    guesses: [], // falsche Versuche dieser Runde: [{ text, close, by }]
    gaveUp: [], // Rater, die in dieser Runde aufgegeben haben
    past: [], // fertige Runden: [{ drawer, word, guessed, by, ms, tries, ops }]
  };
}

export function action(s, { player, type, data }) {
  if (s.result || !s.players.some((p) => p.id === player)) return;
  const now = Date.now();
  const drawer = player === s.drawer;

  switch (type) {
    case 'wort': {
      if (s.phase !== 'wort') return;
      if (!drawer) throw new Error(`${nameOf(s, s.drawer)} sucht das Wort aus.`);
      s.word = cleanWord(data?.wort);
      s.phase = 'bereit';
      s.deckPos = (s.deckPos + SUGGEST_EACH) % s.deck.length;
      return;
    }
    case 'anderes-wort': {
      if (s.phase !== 'bereit' || !drawer) return;
      s.word = null;
      s.phase = 'wort';
      return;
    }
    case 'bereit': {
      if (s.phase !== 'bereit') return;
      if (drawer) throw new Error(`${othersDo(s, 'muss', 'müssen')} bereit sein.`);
      s.phase = 'malen';
      return;
    }
    case 'malen': {
      // Zeichenbefehle kommen gebündelt; was schon da ist (gleiche Nummer), wird übersprungen.
      if (s.phase !== 'malen' || !drawer) return;
      if (s.deadline && now > s.deadline + GRACE) return;
      const cmds = Array.isArray(data?.cmds) ? data.cmds.slice(0, 200) : [];
      let changed = false;
      for (const cmd of cmds) {
        if (typeof cmd?.s === 'number' && cmd.s <= s.drawing.seq) continue;
        if (!applyCmd(s.drawing, cmd)) break;
        changed = true;
      }
      if (changed && !s.startedAt) {
        s.startedAt = now;
        s.deadline = s.zeit ? now + s.zeit * 1000 : null;
      }
      return;
    }
    case 'raten': {
      if (s.phase !== 'malen') throw new Error('Gerade wird nicht geraten.');
      if (drawer) throw new Error(`Du zeichnest. Raten ${guessersOf(s).length === 1 ? 'muss der andere' : 'müssen die anderen'}.`);
      if (s.deadline && now > s.deadline + GRACE) throw new Error('Die Zeit ist um.');
      const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
      const guess = norm(text);
      if (!guess) throw new Error('Bitte tipp ein Wort ein.');
      const target = norm(s.word);
      if (guess === target) return endRound(s, true, now, player);
      const same = s.guesses.find((g) => norm(g.text) === guess);
      if (same) throw new Error(same.by && same.by !== player ? 'Das wurde schon geraten.' : 'Das hast du schon geraten.');
      s.guesses.push({ text, close: isClose(guess, target), by: player });
      if (s.guesses.length > 60) s.guesses.shift();
      return;
    }
    case 'aufgeben': {
      // Die Runde endet erst, wenn alle Rater aufgegeben haben.
      if (s.phase !== 'malen' || drawer) return;
      s.gaveUp = [...new Set([...(s.gaveUp ?? []), player])];
      if (guessersOf(s).every((id) => s.gaveUp.includes(id))) return endRound(s, false, now);
      return;
    }
  }
}

// Zeit um? Dann ist das Wort nicht erraten.
export function tick(s, now) {
  if (s.phase === 'malen' && s.deadline && now >= s.deadline + GRACE) endRound(s, false, now);
}

function endRound(s, guessed, now, by = null) {
  s.past.push({
    drawer: s.drawer,
    word: s.word,
    guessed,
    by, // wer es erraten hat
    ms: guessed && s.startedAt ? Math.min(now, s.deadline ?? now) - s.startedAt : null,
    tries: s.guesses.length,
    ops: s.drawing.ops.slice(0, s.drawing.n),
  });
  Object.assign(s, {
    round: s.round + 1,
    drawer: nextAfter(s, s.drawer),
    phase: 'wort',
    word: null,
    drawing: emptyDrawing(),
    startedAt: null,
    deadline: null,
    guesses: [],
    gaveUp: [],
  });
  if (s.round < s.rounds) return;

  s.phase = 'ende';
  const hits = s.past.filter((r) => r.guessed).length;
  const n = s.rounds;
  let text;
  if (hits === n) text = `Ihr habt ${n === 2 ? 'beide' : `alle ${word(n)}`} Wörter erraten und gewinnt zusammen.`;
  else if (hits === 0) text = 'Kein Wort erraten. Nächstes Mal klappt es.';
  else if (hits === 1) text = `Ein Wort von ${word(n)} erraten.`;
  else text = `${cap(word(hits))} von ${word(n)} Wörtern erraten.`;
  s.result = { winners: hits === n ? s.players.map((p) => p.id) : [], text };
}

export function waitingFor(s) {
  if (s.result) return [];
  if (s.phase === 'wort') return [s.drawer];
  if (s.phase === 'bereit') return guessersOf(s);
  if (s.phase === 'malen') {
    return s.startedAt ? [s.drawer, ...guessersOf(s).filter((id) => !(s.gaveUp ?? []).includes(id))] : [s.drawer];
  }
  return [];
}

// Benachrichtigungen nur bei den Schritten, auf die jemand wartet (nicht bei jedem Strich oder Tipp).
export function notices(s, before, player) {
  if (s.result) return [];
  const drawerName = nameOf(s, s.drawer);
  if (before.round !== s.round) {
    const last = s.past[s.past.length - 1];
    const how = last.guessed ? `„${last.word}“ erraten.` : `„${last.word}“ wurde nicht erraten.`;
    return [{ to: s.drawer, text: `${how} Jetzt zeichnest du. Denk dir ein Wort aus.` }];
  }
  if (before.phase === 'wort' && s.phase === 'bereit') {
    return guessersOf(s).map((id) => ({ to: id, text: `${drawerName} hat ein Wort. Tipp auf Bereit, dann geht es los.` }));
  }
  if (before.phase === 'bereit' && s.phase === 'malen') {
    return [{ to: s.drawer, text: `${nameOf(s, player)} ist bereit. Du kannst zeichnen.` }];
  }
  if (s.phase === 'malen' && !before.startedAt && s.startedAt) {
    return guessersOf(s).map((id) => ({ to: id, text: `${drawerName} zeichnet. Rate mit.` }));
  }
  return [];
}

// Geheim: das Wort (die Rater sehen nur die Striche) und die Vorschläge des Zeichners.
// Die Zeichnungen fertiger Runden kommen erst am Ende mit, bis dahin nur die der letzten Runde.
export function view(s, me) {
  const { deck, deckPos, ...rest } = s;
  if (s.result) return rest;
  const v = {
    ...rest,
    word: me === s.drawer ? s.word : null,
    pattern: s.word ? maskWord(s.word) : null,
    past: s.past.map((r, i) => (i === s.past.length - 1 ? r : { ...r, ops: null })),
  };
  if (me === s.drawer && s.phase === 'wort') {
    v.suggestions = Array.from({ length: SUGGEST_EACH }, (_, i) => SUGGESTIONS[deck[(deckPos + i) % deck.length]]);
  }
  return v;
}


// ---------- Anzeige (nur im Browser) ----------

const INK = '#141414';
const WOOD = '#ecc995';
const ROSE = '#e9a3a0'; // Radiergummi
const SLEEVE = '#3a6b98';
// Malfarben (Index wie in den Befehlen): Farbe auf dem Papier und die drei Facetten des Stifts (Licht von links)
const PAINTS = [
  { name: 'Radierer', paint: '#ffffff' },
  { name: 'Schwarz', paint: '#141414', facets: ['#262626', '#4d4d4d', '#0d0d0d'] },
  { name: 'Rot', paint: '#d33a2c', facets: ['#d33a2c', '#e0675b', '#a82a1f'] },
  { name: 'Blau', paint: '#2f6fb3', facets: ['#2f6fb3', '#5a8fc8', '#22558c'] },
  { name: 'Grün', paint: '#2e8b4e', facets: ['#2e8b4e', '#58a674', '#226a3b'] },
  { name: 'Gelb', paint: '#f2c230', facets: ['#f2c230', '#f6d46a', '#cf9f17'] },
  { name: 'Braun', paint: '#8a5a2e', facets: ['#8a5a2e', '#a77b52', '#6a4321'] },
];
const RGB = PAINTS.map(({ paint }) => [1, 3, 5].map((i) => parseInt(paint.slice(i, i + 2), 16)));
const LUT = new Uint32Array(RGB.map(([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r)); // RGBA im Speicher

// --- Raster: eine Farbnummer pro Rasterpunkt ---

function createRaster() {
  // drawn: Schlüssel der gemalten Schritte, marks: Zwischenstände (Anzahl Schritte → Kopie), pv: Vorschau obendrauf
  return { buf: new Uint8Array(S * S), drawn: [], marks: new Map(), pv: null, dirty: null };
}

function touch(r, x0, y0, x1, y1) {
  const d = r.dirty;
  if (!d) r.dirty = { x0, y0, x1, y1 };
  else Object.assign(d, { x0: Math.min(d.x0, x0), y0: Math.min(d.y0, y0), x1: Math.max(d.x1, x1), y1: Math.max(d.y1, y1) });
}

// Strichstück mit runden Enden: alle Punkte, deren Mitte höchstens rad von der Strecke a–b entfernt ist.
// Pro Zeile ist das eine Spanne (Kreis um a, Kreis um b und das Band dazwischen). Nur Grundrechenarten
// und Wurzeln, damit jeder Browser exakt dieselben Punkte trifft.
function capsule(r, ax, ay, bx, by, rad, c) {
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad));
  const y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by) + rad));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const reach = rad * Math.sqrt(len2);
  const r2 = rad * rad;
  let minX = S;
  let maxX = -1;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5 - ay; // alles relativ zu a
    let lo = Infinity;
    let hi = -Infinity;
    let h = r2 - py * py;
    if (h >= 0) {
      h = Math.sqrt(h);
      lo = -h;
      hi = h;
    }
    const qy = py - dy;
    h = r2 - qy * qy;
    if (h >= 0) {
      h = Math.sqrt(h);
      lo = Math.min(lo, dx - h);
      hi = Math.max(hi, dx + h);
    }
    if (len2 > 0) {
      // Band: Fußpunkt auf der Strecke (0 ≤ p·d ≤ |d|²) und Abstand zur Geraden höchstens rad
      let a = -Infinity;
      let b = Infinity;
      if (dx !== 0) {
        const u = (-py * dy) / dx;
        const v = (len2 - py * dy) / dx;
        a = Math.max(a, Math.min(u, v));
        b = Math.min(b, Math.max(u, v));
      } else if (py * dy < 0 || py * dy > len2) b = -Infinity;
      if (dy !== 0) {
        const u = (py * dx - reach) / dy;
        const v = (py * dx + reach) / dy;
        a = Math.max(a, Math.min(u, v));
        b = Math.min(b, Math.max(u, v));
      } else if (Math.abs(py * dx) > reach) b = -Infinity;
      if (a <= b) {
        lo = Math.min(lo, a);
        hi = Math.max(hi, b);
      }
    }
    const xs = Math.max(0, Math.ceil(lo + ax - 0.5));
    const xe = Math.min(S - 1, Math.floor(hi + ax - 0.5));
    if (xs > xe) continue;
    r.buf.fill(c, y * S + xs, y * S + xe + 1);
    if (xs < minX) minX = xs;
    if (xe > maxX) maxX = xe;
  }
  if (maxX >= 0) touch(r, minX, y0, maxX, y1);
}

// Kurve von a nach b mit Kontrollpunkt q, in kurze Stücke zerlegt
function curve(r, a, q, b, rad, c) {
  const len = Math.sqrt((q[0] - a[0]) ** 2 + (q[1] - a[1]) ** 2) + Math.sqrt((b[0] - q[0]) ** 2 + (b[1] - q[1]) ** 2);
  const n = Math.max(1, Math.ceil(len / Math.max(2, rad * 0.75)));
  let [px, py] = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const v = 1 - t;
    const x = v * v * a[0] + 2 * v * t * q[0] + t * t * b[0];
    const y = v * v * a[1] + 2 * v * t * q[1] + t * t * b[1];
    capsule(r, px, py, x, y, rad, c);
    px = x;
    py = y;
  }
}

// Ein Strich besteht aus Stücken: Stück 0 vom ersten Punkt zur ersten Mitte, Stück k eine Kurve um Punkt k
// (braucht Punkt k + 1), am Schluss das Endstück bis zum letzten Punkt. Zeichnet die Stücke ab `from`,
// so kann ein Strich wachsen, während er noch gezeichnet wird. Rückgabe: Zahl der fertigen Stücke.
function strokePieces(r, pts, c, rad, from, final) {
  const n = pts.length;
  const mid = (i) => [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
  const ready = Math.max(0, n - 1);
  for (let k = from; k < ready; k++) {
    if (k === 0) capsule(r, pts[0][0], pts[0][1], ...mid(0), rad, c);
    else curve(r, mid(k - 1), pts[k], mid(k), rad, c);
  }
  if (final) {
    const a = n === 1 ? pts[0] : mid(n - 2);
    capsule(r, a[0], a[1], pts[n - 1][0], pts[n - 1][1], rad, c);
  }
  return ready;
}

// Eimer: zusammenhängende Fläche gleicher Farbe (Nachbarn oben, unten, links, rechts) umfärben
function flood(r, x, y, c) {
  const buf = r.buf;
  const target = buf[y * S + x];
  if (target === c) return;
  let x0 = x;
  let x1 = x;
  let y0 = y;
  let y1 = y;
  const stack = [x, y];
  while (stack.length) {
    const sy = stack.pop();
    const sx = stack.pop();
    const row = sy * S;
    if (buf[row + sx] !== target) continue;
    let l = sx;
    let rr = sx;
    while (l > 0 && buf[row + l - 1] === target) l--;
    while (rr < S - 1 && buf[row + rr + 1] === target) rr++;
    buf.fill(c, row + l, row + rr + 1);
    if (l < x0) x0 = l;
    if (rr > x1) x1 = rr;
    if (sy < y0) y0 = sy;
    if (sy > y1) y1 = sy;
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= S) continue;
      const nrow = ny * S;
      let open = false;
      for (let k = l; k <= rr; k++) {
        if (buf[nrow + k] === target) {
          if (!open) stack.push(k, ny);
          open = true;
        } else open = false;
      }
    }
  }
  touch(r, x0, y0, x1, y1);
}

function applyOp(r, op) {
  if (op.t === 's') {
    const pts = decodePoints(op.p);
    if (pts) strokePieces(r, pts, op.c, radius(op.c, op.w), 0, true);
  } else if (op.t === 'f') flood(r, op.x, op.y, op.c);
  else if (op.t === 'c') {
    r.buf.fill(0);
    touch(r, 0, 0, S - 1, S - 1);
  }
}

const opKey = (op) =>
  op.t === 's' ? `${op.s}s${op.c}${op.w}:${op.p.length}:${op.p.slice(-6)}` : op.t === 'f' ? `${op.s}f${op.c}:${op.x},${op.y}` : `${op.s}c`;

const MARK_EVERY = 12;

function remember(r) {
  const k = r.drawn.length;
  if (k % MARK_EVERY || r.marks.has(k)) return;
  r.marks.set(k, r.buf.slice());
  if (r.marks.size > 24) r.marks.delete(Math.min(...r.marks.keys()));
}

// Zurück auf den letzten Zwischenstand mit höchstens `upTo` Schritten (für Zurück oder eine verworfene Vorschau)
function rewind(r, upTo) {
  let best = 0;
  for (const k of [...r.marks.keys()]) {
    if (k > upTo) r.marks.delete(k);
    else if (k > best) best = k;
  }
  if (best) r.buf.set(r.marks.get(best));
  else r.buf.fill(0);
  r.drawn.length = best;
  r.pv = null;
  touch(r, 0, 0, S - 1, S - 1);
}

const isPrefix = (a, b) => b && a.length <= b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

/**
 * Bringt das Raster auf den Stand `active` (sichtbare Schritte) plus `preview` (Strich, der gerade
 * entsteht: { s, c, w, pts }). Malt nur, was neu ist; bei Zurück oder Abweichungen ab einem Zwischenstand.
 */
function syncRaster(r, active, preview) {
  const keys = active.map(opKey);
  let same = 0;
  while (same < r.drawn.length && same < keys.length && r.drawn[same] === keys[same]) same++;
  let i = same;
  if (same < r.drawn.length) {
    rewind(r, same);
    i = r.drawn.length;
  } else if (r.pv) {
    // Eine Vorschau liegt obendrauf. Wird sie gerade zum fertigen Strich, einfach fertig malen.
    const op = active[same];
    const ref = r.pv.ref;
    if (op && op.s === ref.s && op.t === 's' && op.c === ref.c && op.w === ref.w && isPrefix(ref.pts, decodePoints(op.p))) {
      applyOp(r, op);
      r.drawn.push(keys[same]);
      remember(r);
      r.pv = null;
      i = same + 1;
    } else if (op || ref !== preview) {
      rewind(r, same);
      i = r.drawn.length;
    }
  }
  for (; i < active.length; i++) {
    applyOp(r, active[i]);
    r.drawn.push(keys[i]);
    remember(r);
  }
  if (preview) {
    if (r.pv?.ref !== preview) r.pv = { ref: preview, pieces: 0 };
    r.pv.pieces = strokePieces(r, preview.pts, preview.c, radius(preview.c, preview.w), r.pv.pieces, false);
  }
}

// Kleines Bild einer Zeichnung (Auflösung, Galerie): je 2 × 2 Rasterpunkte gemittelt, das glättet die Kanten.
function drawThumb(canvas, ops) {
  const r = createRaster();
  for (const op of ops ?? []) applyOp(r, op);
  const n = canvas.width;
  const f = S / n;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  const out = img.data;
  const area = f * f;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * S + x * f;
        for (let dx = 0; dx < f; dx++) {
          const [cr, cg, cb] = RGB[r.buf[row + dx]];
          rs += cr;
          gs += cg;
          bs += cb;
        }
      }
      const o = (y * n + x) * 4;
      out[o] = rs / area;
      out[o + 1] = gs / area;
      out[o + 2] = bs / area;
      out[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// --- Zeichnungen (Skill „zeichnen“): Buntstifte und Werkzeuge ---

const BODY = 'M5 15 H19 V56.5 Q19 58 17.5 58 H6.5 Q5 58 5 56.5 Z';
const pencilSvg = ([base, light, dark]) => `<svg viewBox="0 0 24 60" aria-hidden="true">
  <path d="${BODY}" fill="${base}"/>
  <rect x="5" y="15" width="4.7" height="43" fill="${light}"/>
  <rect x="14.3" y="15" width="4.7" height="43" fill="${dark}"/>
  <path d="M7 20 V47" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".45"/>
  <g stroke="${INK}" stroke-linejoin="round" fill="none">
    <path d="M9.7 16 V57.5 M14.3 16 V57.5" stroke-width=".7" opacity=".5"/>
    <path d="M5 50.5 H19 M5 52.5 H19" stroke-width=".8"/>
    <path d="${BODY}" stroke-width="1.4"/>
    <path d="M12 2.5 L5 15 Q7.3 18 9.7 15 Q12 18 14.3 15 Q16.7 18 19 15 Z" fill="${WOOD}" stroke-width="1.4"/>
    <path d="M12 2.5 L9.2 7.6 Q12 8.8 14.8 7.6 Z" fill="${base}" stroke-width="1.2"/>
  </g>
</svg>`;

// Die aktuelle Farbe (--mm-cur) steckt in der Stiftmine, der Farbe im Eimer und dem Klecks.
const ICON = {
  stift: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="rotate(45 20 20)">
    <path d="M15.5 9 H24.5 V31 H15.5 Z" fill="#fff"/>
    <path d="M20 10 V30" stroke-width=".9" opacity=".5"/>
    <path d="M15.5 9 L20 0.5 L24.5 9 Z" fill="${WOOD}"/>
    <path d="M17.6 5.2 L20 0.5 L22.4 5.2 Q20 6.2 17.6 5.2 Z" style="fill:var(--mm-cur)" stroke-width="1.2"/>
    <rect x="15.5" y="31" width="9" height="3" fill="#bdbdbd"/>
    <path d="M15.5 34 H24.5 V36 Q24.5 38.5 22 38.5 H18 Q15.5 38.5 15.5 36 Z" fill="${ROSE}"/>
  </g></svg>`,
  eimer: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <g transform="rotate(-40 23 19)">
      <path d="M13.5 14.5 Q23 1.5 32.5 14.5" fill="none"/>
      <path d="M13 14 L15.5 32 Q23 34.5 30.5 32 L33 14" fill="#fff"/>
      <path d="M14.3 23 Q23 25.5 31.7 23" fill="none" stroke-width="1"/>
      <ellipse cx="23" cy="14" rx="10" ry="3.2" style="fill:var(--mm-cur)"/>
    </g>
    <path d="M10.2 18 C 7.4 21.8, 9 27, 7.9 31.6" fill="none" style="stroke:var(--mm-cur)" stroke-width="3"/>
    <path d="M7.9 30.5 C 5.6 33.6, 6 37.3, 7.9 37.3 C 9.8 37.3, 10.3 33.6, 7.9 30.5 Z" style="fill:var(--mm-cur)" stroke-width="1.3"/>
  </g></svg>`,
  radierer: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="rotate(-35 20 21)">
    <rect x="6" y="14" width="28" height="13" rx="2" fill="${ROSE}"/>
    <path d="M17 14 H34 V27 H17 Z" fill="${SLEEVE}"/>
    <path d="M21 18.5 H30" stroke="#fff" stroke-width="1.2" opacity=".6"/>
    <path d="M6 22 H17"/>
  </g>
  <g fill="${INK}"><circle cx="9" cy="33.5" r="1"/><circle cx="12.5" cy="35.5" r=".8"/><circle cx="6.5" cy="36.5" r=".7"/></g></svg>`,
  zurueck: `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 13 H24 C30 13 33 17.5 33 22 C33 27 29.5 31 24 31 H13"/><path d="M19 7.5 L13.5 13 L19 18.5"/></g></svg>`,
  vor: `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="matrix(-1 0 0 1 40 0)">
    <path d="M14 13 H24 C30 13 33 17.5 33 22 C33 27 29.5 31 24 31 H13"/><path d="M19 7.5 L13.5 13 L19 18.5"/></g></svg>`,
  leeren: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14 13.5 C 12 9, 16 4.5, 20.5 6 C 23 3.5, 28.5 5, 27.5 9.5 C 30 11.5, 28.5 14.5, 26.5 14.5" fill="#fff"/>
    <path d="M17.5 9.5 L19.5 7.8 M22.5 11.5 L24.5 8.8 L26 10" fill="none" stroke-width="1.1"/>
    <path d="M8.5 14 H31.5 L28.5 36 H11.5 Z" fill="#fff"/>
    <path d="M14.5 18 L15.8 32.5 M20 18 V32.5 M25.5 18 L24.2 32.5" fill="none" stroke-width="1.3"/>
    <path d="M7.5 14 H32.5" stroke-width="2.6"/>
  </g></svg>`,
};

// Haken und Kreuz wie mit dem Stift gezogen; der Stempel mit Ring für die Auflösung
const MARK = {
  ok: '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="mm-ink ok" pathLength="1" d="M9 21.5 L16.5 29 L31.5 10.5"/></svg>',
  miss: '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="mm-ink miss" pathLength="1" d="M11 11 L29 29"/><path class="mm-ink miss" pathLength="1" d="M29 11 L11 29"/></svg>',
};
const RING = 'M20 4.5 C 29 4.2, 35.6 11, 35.4 20.2 C 35.2 29.3, 28.6 35.6, 19.6 35.4 C 10.8 35.2, 4.4 28.6, 4.6 19.8 C 4.8 11.4, 11.2 4.8, 20 4.5';
const STAMP = {
  ok: `<svg class="mm-stamp ok" viewBox="0 0 40 40" aria-hidden="true"><path class="mm-ring" pathLength="1" d="${RING}"/><path class="mm-tick" pathLength="1" d="M12.5 20.5 L18 26 L28 14"/></svg>`,
  miss: `<svg class="mm-stamp miss" viewBox="0 0 40 40" aria-hidden="true"><path class="mm-ring" pathLength="1" d="${RING}"/><path class="mm-tick" pathLength="1" d="M14 14 L26 26"/><path class="mm-tick two" pathLength="1" d="M26 14 L14 26"/></svg>`,
};
// Warten aufs Wort: ein Stift kritzelt eine Schleife
const SCRIBBLE = `<svg class="mm-scribble" viewBox="0 0 120 48" aria-hidden="true">
  <path class="mm-scribble-line" pathLength="1" d="M6 34 C 16 10, 26 10, 24 26 C 22 40, 36 40, 42 24 C 48 8, 60 10, 58 26 C 56 40, 72 40, 78 24 C 84 10, 96 12, 94 26 C 93 34, 100 36, 106 30"/>
</svg>`;

const fmt = (ms, up = false) => {
  const sec = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// Galgenmännchen: ein Strich pro Buchstabe, Wörter getrennt, Bindestriche sichtbar.
// letters = das Wort (Zeichner, Auflösung) oder null (Rater).
function slotsHtml(game, pattern, letters, cls = '') {
  const chars = [...pattern];
  const real = letters ? [...letters] : null;
  const n = chars.filter((ch) => ch === '_').length;
  const size = n <= 8 ? 'l' : n <= 12 ? 'm' : n <= 18 ? 's' : 'xs';
  const groups = [''];
  let k = 0;
  chars.forEach((ch, j) => {
    if (ch === ' ') groups.push('');
    else if (ch === '_') groups[groups.length - 1] += `<span class="mm-slot" style="--k:${k++}"><b>${real ? game.esc(real[j]) : ''}</b></span>`;
    else groups[groups.length - 1] += `<span class="mm-dash">${game.esc(ch)}</span>`;
  });
  const label = real ? letters : `Gesuchtes Wort mit ${word(n)} Buchstaben`;
  return `<div class="mm-slots size-${size} ${cls}" style="--n:${n}" role="img" aria-label="${game.esc(label)}">${groups
    .map((g) => `<span class="mm-grp">${g}</span>`)
    .join('')}</div>`;
}

// --- Zustand im Browser (überlebt neues Zeichnen) ---

const ui = new WeakMap();

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, key: null, stage: null, tool: 'stift', color: 1, size: 1, suggest: 0, lastRefresh: 0 };
    reset(u);
    ui.set(el, u);
    game.live.on((data) => onLive(u, data));
    game.signal.addEventListener('abort', () => u.stage?.abort());
  }
  return u;
}

// Alles, was nur für eine Ansicht (Phase einer Runde) gilt
function reset(u) {
  Object.assign(u, {
    board: null,
    raster: null,
    model: null,
    pending: [], // eigene Zeichenbefehle, die der Server noch nicht hat
    sending: false,
    stroke: null, // Strich, der gerade gezeichnet wird
    livePreview: null, // Rater: Strich des anderen, der gerade entsteht
    liveCmds: new Map(), // Rater: fertige Befehle, die live schon da sind
    pointer: null,
    fillAt: null,
    full: false,
    triesShown: 0,
    tickClock: null,
  });
}

export function render(el, s, game) {
  const u = local(el, game);
  u.s = s;
  u.game = game;
  u.drawer = !s.result && s.drawer === game.me;

  let root = el.querySelector(':scope > .mm');
  if (!root) {
    el.innerHTML = '<div class="mm"><div class="mm-track"></div><div class="mm-stage"></div></div>';
    root = el.firstElementChild;
  }
  renderTrack(root.querySelector('.mm-track'), s, game);

  const key = s.result ? 'ende' : `${s.round}:${s.phase}`;
  if (u.key === key) {
    if (u.board) updateBoard(u);
    return;
  }
  // Neue Phase: Ansicht neu aufbauen. Kommt sie von der Malfläche, schrumpft die Zeichnung in die Auflösung.
  const from = u.board && !game.reducedMotion ? u.board.paper.getBoundingClientRect() : null;
  u.stage?.abort();
  u.stage = new AbortController();
  u.key = key;
  reset(u);
  const stage = root.querySelector('.mm-stage');
  if (s.result) renderEnd(stage, s, game, u);
  else if (s.phase === 'wort') renderWord(stage, s, game, u, from);
  else if (s.phase === 'bereit') renderReady(stage, s, game);
  else renderBoard(stage, s, game, u);
}

// --- Runden oben: ein Kästchen pro Runde, Haken oder Kreuz zeichnen sich ein ---

function renderTrack(box, s, game) {
  const before = game.prev ? game.prev.past.length : game.first ? 0 : s.past.length;
  const items = Array.from({ length: s.rounds }, (_, i) => {
    const r = s.past[i];
    const list = ids(s);
    const drawer = r ? r.drawer : list[(list.indexOf(s.drawer) + i - s.round) % list.length];
    const state = r ? (r.guessed ? 'ok' : 'miss') : i === s.round && !s.result ? 'now' : 'next';
    const label = r ? (r.guessed ? 'erraten' : 'nicht erraten') : state === 'now' ? 'läuft' : 'kommt noch';
    return `<li class="mm-round is-${state} ${r && i >= before ? 'fresh' : ''}" style="--i:${i};--c:${game.color(drawer)}"
      aria-label="Runde ${word(i + 1)}, ${game.esc(game.name(drawer))} zeichnet, ${label}">${r ? MARK[r.guessed ? 'ok' : 'miss'] : '<i></i>'}</li>`;
  }).join('');
  // Am Ende steht das Ergebnis schon im Banner der Plattform.
  let caption = '';
  if (!s.result) {
    const who = s.drawer === game.me ? 'Du zeichnest.' : `${game.esc(game.name(s.drawer))} zeichnet.`;
    caption = `Runde ${word(s.round + 1)} von ${word(s.rounds)}. <span class="marker" style="color:${game.color(s.drawer)}"></span> ${who}`;
  }
  box.innerHTML = `<ol class="mm-rounds ${s.rounds > 9 ? 'many' : ''} ${game.first ? 'intro' : ''}">${items}</ol><p class="mm-track-cap">${caption}</p>`;
}

// --- Wort aussuchen (mit Auflösung der letzten Runde) ---

function renderWord(stage, s, game, u, from) {
  const signal = u.stage.signal;
  const drawer = s.drawer === game.me;
  const g = guessersOf(s);
  const other = g.length === 1 ? `${game.esc(game.name(g[0]))} sieht` : 'Die anderen sehen';
  stage.innerHTML = `
    ${s.past.length ? revealHtml(s, game) : ''}
    ${
      drawer
        ? `<form class="mm-wordform" autocomplete="off">
            <label for="mm-word-in">Dein Wort</label>
            <input id="mm-word-in" name="wort" maxlength="${MAX_WORD}" autocomplete="off" spellcheck="false" enterkeyhint="done">
            <div class="mm-preview" aria-hidden="true"></div>
            <p class="field-hint muted">${other} nur einen Strich pro Buchstaben. Erlaubt sind Buchstaben, Leerzeichen und Bindestriche.</p>
            <div class="row">
              <button class="btn primary" type="submit">Fertig</button>
              <button class="btn mm-suggest" type="button">Vorschlag</button>
            </div>
          </form>`
        : `<div class="mm-wait">${SCRIBBLE}<p class="status">${game.esc(game.name(s.drawer))} denkt sich ein Wort aus.</p></div>`
    }`;

  if (s.past.length) playReveal(stage, s, game, u, from);
  if (!drawer) return;

  const form = stage.querySelector('.mm-wordform');
  const input = form.querySelector('input');
  const preview = form.querySelector('.mm-preview');
  const showPreview = () => {
    const w = input.value.replace(/\s+/g, ' ').trim();
    const ok = /^[\p{L} -]+$/u.test(w) && letterCount(w) >= 1;
    preview.innerHTML = ok ? slotsHtml(game, maskWord(w), null, 'tiny') : '';
  };
  input.addEventListener('input', showPreview, { signal });
  form.querySelector('.mm-suggest').addEventListener(
    'click',
    () => {
      const list = s.suggestions ?? [];
      if (!list.length) return;
      input.value = list[u.suggest++ % list.length];
      showPreview();
      if (!game.reducedMotion) input.animate([{ transform: 'translateY(3px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    },
    { signal },
  );
  form.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      await game.send('wort', { wort: input.value });
      btn.disabled = false;
    },
    { signal },
  );
}

function revealHtml(s, game) {
  const r = s.past[s.past.length - 1];
  const who = r.drawer === game.me ? 'Du hast' : `${game.esc(game.name(r.drawer))} hat`;
  // Zu mehreren steht dabei, wer es erraten hat
  const by = s.players.length > 2 && r.by ? `${r.by === game.me ? 'Du hast' : `${game.esc(game.name(r.by))} hat`} es erraten` : 'Erraten';
  let res;
  if (!r.guessed) res = 'Nicht erraten.';
  else if (r.ms === null) res = `${by}, noch bevor der erste Strich da war.`;
  else res = `${by} in <span class="num">${fmt(r.ms, true)}</span>${r.tries ? '.' : ', gleich beim ersten Versuch.'}`;
  return `<section class="mm-reveal ${r.guessed ? 'is-ok' : 'is-miss'}" aria-label="Auflösung">
    <div class="mm-thumb"><canvas width="500" height="500" role="img" aria-label="Zeichnung zu ${game.esc(r.word)}"></canvas>${STAMP[r.guessed ? 'ok' : 'miss']}</div>
    <div class="mm-reveal-text">
      <p class="mm-reveal-cap">${who} gezeichnet:</p>
      ${slotsHtml(game, maskWord(r.word), r.word, 'flip')}
      <p class="mm-reveal-res">${res}</p>
    </div>
  </section>`;
}

function playReveal(stage, s, game, u, from) {
  const r = s.past[s.past.length - 1];
  const thumb = stage.querySelector('.mm-thumb');
  drawThumb(thumb.querySelector('canvas'), r.ops);
  // Buchstaben klappen nacheinander um, danach zeichnet sich der Stempel ein (höchstens gut eine Sekunde)
  const n = letterCount(r.word);
  const step = Math.min(60, 560 / Math.max(1, n));
  stage.querySelector('.mm-reveal').style.setProperty('--step', `${step}ms`);
  stage.querySelector('.mm-reveal').style.setProperty('--after', `${320 + n * step}ms`);
  if (!from || game.reducedMotion) return;
  // FLIP: Die Zeichnung kommt von der großen Malfläche und schrumpft an ihren Platz.
  const to = thumb.getBoundingClientRect();
  if (!to.width) return;
  const k = from.width / to.width;
  thumb.style.transformOrigin = '0 0';
  thumb.animate(
    [
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${k})` },
      { transform: 'none' },
    ],
    { duration: 460, easing: 'cubic-bezier(.6,0,.2,1)' },
  );
}

// --- Bereit? ---

function renderReady(stage, s, game) {
  const drawer = s.drawer === game.me;
  const n = slotCount(s.pattern);
  if (drawer) {
    stage.innerHTML = `<div class="mm-ready">
      <p class="label">Dein Wort</p>
      ${slotsHtml(game, s.pattern, s.word, 'drop')}
      <p class="status">Warte, bis ${guessersOf(s).length === 1 ? `${game.esc(game.name(guessersOf(s)[0]))} bereit ist` : 'jemand bereit ist'}. Die Zeit läuft ab deinem ersten Strich.</p>
      <button class="link" data-action="anderes-wort">Anderes Wort</button>
    </div>`;
    return;
  }
  stage.innerHTML = `<div class="mm-ready">
    <p class="status">${game.esc(game.name(s.drawer))} hat ein Wort.</p>
    ${slotsHtml(game, s.pattern, null, 'drop')}
    <p class="muted">${cap(word(n))} Buchstaben. Die Zeit läuft ab dem ersten Strich.</p>
    <div class="row"><button class="btn primary" data-action="bereit">Bereit</button></div>
  </div>`;
}

// --- Malen und raten ---

function toolsHtml() {
  const crayons = PAINTS.slice(1)
    .map(
      (p, i) =>
        `<button type="button" class="mm-crayon" data-color="${i + 1}" aria-label="${p.name}" title="${p.name}" aria-pressed="false" style="--i:${i}">${pencilSvg(p.facets)}</button>`,
    )
    .join('');
  const tools = [
    ['stift', 'Stift'],
    ['eimer', 'Eimer: Fläche füllen'],
    ['radierer', 'Radierer'],
  ]
    .map(
      ([id, label], i) =>
        `<button type="button" class="mm-tool" data-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="false" style="--i:${i}">${ICON[id]}</button>`,
    )
    .join('');
  const sizes = ['dünn', 'mittel', 'dick']
    .map(
      (label, i) =>
        `<button type="button" class="mm-tool mm-size" data-size="${i}" aria-label="${cap(label)}" title="${cap(label)}" aria-pressed="false" style="--i:${i + 3}"><i style="--d:${[5, 10, 18][i]}px"></i></button>`,
    )
    .join('');
  return `<div class="mm-tools">
    <div class="mm-crayons" role="group" aria-label="Farbe">${crayons}</div>
    <div class="mm-toolrow">
      <div class="mm-seg" role="group" aria-label="Werkzeug">${tools}</div>
      <div class="mm-seg" role="group" aria-label="Dicke">${sizes}</div>
    </div>
    <div class="mm-toolrow mm-cmds">
      <button type="button" class="btn mm-cmd" data-cmd="u">${ICON.zurueck}<span>Zurück</span></button>
      <button type="button" class="btn mm-cmd" data-cmd="r">${ICON.vor}<span>Vor</span></button>
      <button type="button" class="btn mm-cmd" data-cmd="c">${ICON.leeren}<span>Alles löschen</span></button>
    </div>
  </div>`;
}

function renderBoard(stage, s, game, u) {
  const signal = u.stage.signal;
  const drawer = u.drawer;
  const many = guessersOf(s).length > 1;
  const otherName = game.esc(game.name(drawer ? guessersOf(s)[0] : s.drawer));
  const triesTitle = drawer ? (many ? 'Versuche der anderen' : `Versuche von ${otherName}`) : many ? 'Versuche' : 'Deine Versuche';
  const n = slotCount(s.pattern);
  stage.innerHTML = `
    <div class="mm-board ${drawer ? 'is-drawer' : 'is-guesser'}">
      <div class="mm-wordline">
        <div>
          ${slotsHtml(game, s.pattern, drawer ? s.word : null, 'drop')}
          <p class="mm-count muted">${drawer ? 'Dein Wort' : `${cap(word(n))} Buchstaben`}</p>
        </div>
        <div class="mm-clock"><span class="mm-clock-num"></span></div>
      </div>
      <div class="mm-bar" ${s.zeit ? '' : 'hidden'}><i></i></div>
      <div class="mm-paper">
        <canvas class="mm-canvas" width="${S}" height="${S}" role="img" aria-label="${drawer ? 'Malfläche' : `Zeichnung von ${otherName}`}"></canvas>
        <div class="mm-fx" aria-hidden="true"></div>
        ${drawer ? '<div class="mm-cursor" hidden></div>' : ''}
        <svg class="mm-frame" viewBox="0 0 100 100" aria-hidden="true"><rect pathLength="1" x=".4" y=".4" width="99.2" height="99.2"/></svg>
      </div>
      ${
        drawer
          ? toolsHtml()
          : `<form class="mm-guess" autocomplete="off">
              <label for="mm-guess-in">Dein Tipp</label>
              <div class="row nowrap">
                <input id="mm-guess-in" name="tipp" maxlength="30" autocomplete="off" spellcheck="false" enterkeyhint="send">
                <button class="btn primary" type="submit">Raten</button>
              </div>
            </form>`
      }
      <p class="status mm-note" aria-live="polite"></p>
      <section class="mm-tries" hidden>
        <h3 class="mm-tries-title">${triesTitle}</h3>
        <ol class="mm-tries-list" aria-live="polite"></ol>
      </section>
      ${drawer ? '' : '<div class="mm-giveup"><button type="button" class="link">Aufgeben</button></div>'}
    </div>`;

  const board = stage.firstElementChild;
  const canvas = board.querySelector('.mm-canvas');
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  u.px = new Uint32Array(img.data.buffer);
  u.px.fill(LUT[0]);
  ctx.putImageData(img, 0, 0);
  u.ctx = ctx;
  u.img = img;
  u.raster = createRaster();
  u.board = {
    el: board,
    paper: board.querySelector('.mm-paper'),
    canvas,
    fx: board.querySelector('.mm-fx'),
    cursor: board.querySelector('.mm-cursor'),
    note: board.querySelector('.mm-note'),
    tries: board.querySelector('.mm-tries'),
    list: board.querySelector('.mm-tries-list'),
    clock: board.querySelector('.mm-clock'),
    num: board.querySelector('.mm-clock-num'),
    bar: board.querySelector('.mm-bar i'),
  };

  if (drawer) {
    bindTools(u, signal);
    bindDrawing(u, signal);
    syncTools(u);
  } else bindGuess(u, signal);
  startClock(u, signal);
  updateBoard(u);

  // Malfläche und Werkzeuge (bzw. Eingabe) ganz ins Bild holen
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    const top = board.querySelector('.mm-wordline').getBoundingClientRect().top;
    const bottom = board.querySelector(drawer ? '.mm-tools' : '.mm-guess').getBoundingClientRect().bottom;
    let dy = 0;
    if (top < 0 || bottom - top > innerHeight - 16) dy = top - 8;
    else if (bottom > innerHeight) dy = bottom - innerHeight + 8;
    if (dy) window.scrollBy({ top: dy, behavior: game.reducedMotion ? 'auto' : 'smooth' });
  });
}

function updateBoard(u) {
  const { s } = u;
  const d = s.drawing;
  if (u.drawer) {
    u.pending = u.pending.filter((c) => c.s > d.seq);
    if (u.pending.length && !u.sending) flushQueue(u);
  } else {
    for (const k of u.liveCmds.keys()) if (k <= d.seq) u.liveCmds.delete(k);
  }
  updateDrawing(u);
  renderTries(u);
  renderNote(u);
  u.tickClock?.();
}

// Was gerade zu sehen sein soll: gespeicherter Stand plus eigene, noch nicht gespeicherte Befehle
// (Zeichner) bzw. live angekommene Befehle des anderen (Rater).
function currentModel(u) {
  const d = u.s.drawing;
  const m = { ops: d.ops, n: d.n, seq: d.seq };
  const extra = u.drawer ? u.pending : [...u.liveCmds.values()].sort((a, b) => a.s - b.s);
  for (const cmd of extra) {
    if (cmd.s <= m.seq) continue;
    if (!applyCmd(m, cmd)) break;
  }
  return m;
}

function updateDrawing(u) {
  if (!u.raster) return;
  const m = currentModel(u);
  u.model = m;
  let preview = u.drawer ? u.stroke : u.livePreview;
  if (preview && preview.s <= m.seq) {
    preview = null;
    if (!u.drawer) u.livePreview = null;
  }
  syncRaster(u.raster, m.ops.slice(0, m.n), preview);
  if (!u.paintQueued) {
    u.paintQueued = true;
    requestAnimationFrame(() => {
      u.paintQueued = false;
      paint(u);
    });
  }
  if (u.drawer && !u.stroke) syncCmds(u);
}

function paint(u) {
  const r = u.raster;
  const d = r?.dirty;
  if (!d || !u.ctx) return;
  r.dirty = null;
  const { px } = u;
  const buf = r.buf;
  for (let y = d.y0; y <= d.y1; y++) {
    const row = y * S;
    for (let x = d.x0; x <= d.x1; x++) px[row + x] = LUT[buf[row + x]];
  }
  u.ctx.putImageData(u.img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
}

function renderTries(u) {
  const { s, game, board } = u;
  const list = s.guesses;
  board.tries.hidden = !list.length;
  const last = list[list.length - 1]?.text;
  if (list.length < u.triesShown || (list.length === u.triesShown && last !== u.lastTry)) {
    board.list.replaceChildren();
    u.triesShown = 0;
  }
  const many = s.players.length > 2;
  for (const g of list.slice(u.triesShown)) {
    const li = document.createElement('li');
    li.className = `mm-try enter ${g.close ? 'close' : ''}`;
    const who = many && g.by ? `<span class="marker" style="color:${game.color(g.by)}" title="${game.esc(game.name(g.by))}"></span> ` : '';
    li.innerHTML = `<span>${who}${game.esc(g.text)}</span>${g.close ? '<b class="mm-close">knapp</b>' : ''}`;
    board.list.prepend(li);
  }
  u.triesShown = list.length;
  u.lastTry = last;
}

function renderNote(u) {
  const { s, game, board } = u;
  const gaveUp = !u.drawer && (s.gaveUp ?? []).includes(game.me);
  const guess = board.el.querySelector('.mm-guess');
  if (guess) {
    guess.hidden = gaveUp;
    board.el.querySelector('.mm-giveup').hidden = gaveUp;
  }
  let text = '';
  if (u.full) text = 'Das Bild ist voll. Nimm etwas zurück oder lösche alles.';
  else if (gaveUp) text = 'Du hast aufgegeben. Die anderen raten weiter.';
  else if (!s.startedAt) {
    text = u.drawer
      ? 'Leg los. Die Zeit läuft ab deinem ersten Strich.'
      : `${game.name(s.drawer)} fängt gleich an. Du kannst schon raten.`;
  } else if (!u.drawer && !s.guesses.length) text = 'Tipp ein, was du erkennst. Groß- und Kleinschreibung ist egal.';
  if (board.note.textContent !== text) board.note.textContent = text;
  board.note.hidden = !text;
}

// Uhr: zählt ab dem ersten Strich herunter (ohne Limit: hoch) und fragt bei null beim Server nach.
function startClock(u, signal) {
  const { num, bar, clock } = u.board;
  const tick = () => {
    const { s, game } = u;
    if (!s.zeit) {
      num.textContent = fmt(s.startedAt ? game.now() - s.startedAt : 0, true);
      return;
    }
    const total = s.zeit * 1000;
    const left = s.startedAt ? Math.max(0, s.deadline - game.now()) : total;
    const text = fmt(left);
    const low = Boolean(s.startedAt) && left < 10_500;
    if (num.textContent !== text) {
      const first = !num.textContent;
      num.textContent = text;
      if (low && !first && !game.reducedMotion) {
        num.animate([{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    bar.style.transform = `scaleX(${left / total})`;
    clock.classList.toggle('low', low);
    bar.parentElement.classList.toggle('low', low);
    if (s.startedAt && game.now() >= s.deadline + GRACE + 300 && Date.now() - u.lastRefresh > 2000) {
      u.lastRefresh = Date.now();
      game.refresh();
    }
  };
  u.tickClock = tick;
  const timer = setInterval(tick, 250);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// --- Zeichner: Werkzeuge ---

function bindTools(u, signal) {
  u.board.el.querySelector('.mm-tools').addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.color) {
        u.color = Number(b.dataset.color);
        if (u.tool === 'radierer') u.tool = 'stift';
      } else if (b.dataset.tool) u.tool = b.dataset.tool;
      else if (b.dataset.size) u.size = Number(b.dataset.size);
      else if (b.dataset.cmd) command(u, b.dataset.cmd);
      syncTools(u);
    },
    { signal },
  );
}

function syncTools(u) {
  const el = u.board.el;
  el.style.setProperty('--mm-cur', PAINTS[u.color].paint);
  el.dataset.tool = u.tool;
  for (const b of el.querySelectorAll('[data-color]')) b.setAttribute('aria-pressed', String(Number(b.dataset.color) === u.color));
  for (const b of el.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === u.tool));
  for (const b of el.querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === u.size));
  syncCmds(u);
}

function syncCmds(u) {
  const m = u.model;
  if (!m || !u.board) return;
  const set = (cmd, on) => {
    const b = u.board.el.querySelector(`[data-cmd="${cmd}"]`);
    if (b && b.disabled === on) b.disabled = !on;
  };
  set('u', m.n > 0);
  set('r', m.n < m.ops.length);
  set('c', m.n > 0 && m.ops[m.n - 1].t !== 'c');
}

function command(u, t) {
  endStroke(u);
  const m = u.model;
  if (!m) return;
  if (t === 'u' && !m.n) return;
  if (t === 'r' && m.n >= m.ops.length) return;
  if (t === 'c') {
    if (!m.n || m.ops[m.n - 1].t === 'c') return;
    tearFx(u);
  }
  issue(u, { t });
}

const nextSeq = (u) => Math.max(u.s.drawing.seq, u.pending[u.pending.length - 1]?.s ?? 0, u.stroke?.s ?? 0) + 1;

// Neuer eigener Befehl: sofort zeigen, live an den anderen, dann (gebündelt) speichern.
function issue(u, cmd) {
  if (cmd.s === undefined) cmd.s = nextSeq(u);
  u.full = applyCmd(currentModel(u), cmd) === 'voll';
  u.pending.push(cmd);
  u.game.live.send({ k: 'cmd', r: u.s.round, cmd });
  updateDrawing(u);
  renderNote(u);
  flushQueue(u);
}

// Immer nur eine Anfrage unterwegs, damit die Befehle in der richtigen Reihenfolge ankommen.
// Was der Server schon hat (laut Stand), fällt in updateBoard aus der Liste.
async function flushQueue(u) {
  if (u.sending || !u.raster) return;
  const batch = u.pending.filter((c) => c.s > u.s.drawing.seq).slice(0, 80);
  if (!batch.length) return;
  const signal = u.stage.signal;
  u.sending = true;
  const last = batch[batch.length - 1].s;
  await u.game.send('malen', { cmds: batch });
  if (signal.aborted) return;
  u.sending = false;
  if (u.s.drawing.seq >= last) flushQueue(u);
  else {
    // Antwort noch nicht gezeichnet oder Anfrage fehlgeschlagen: gleich nochmal versuchen
    clearTimeout(u.retry);
    u.retry = setTimeout(() => !signal.aborted && flushQueue(u), 900);
  }
}

// --- Zeichner: Finger, Stift oder Maus auf der Malfläche ---

function bindDrawing(u, signal) {
  const { canvas } = u.board;
  const canDraw = () => u.s.phase === 'malen' && !u.s.result && !(u.s.deadline && u.game.now() > u.s.deadline);
  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const fit = (v) => Math.min(S - 1, Math.max(0, Math.floor(v)));
    return [fit(((e.clientX - rect.left) / rect.width) * S), fit(((e.clientY - rect.top) / rect.height) * S)];
  };
  const opts = { signal };

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (u.pointer !== null || !canDraw() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      u.pointer = e.pointerId;
      if (u.tool === 'eimer') u.fillAt = pos(e);
      else startStroke(u, pos(e));
    },
    opts,
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse') moveCursor(u, e);
      if (e.pointerId !== u.pointer || !u.stroke) return;
      const events = e.getCoalescedEvents?.() ?? [];
      let added = false;
      for (const ev of events.length ? events : [e]) added = addPoint(u, pos(ev)) || added;
      if (!added) return;
      updateDrawing(u);
      if (!u.liveTimer) u.liveTimer = setTimeout(() => sendLivePoints(u), 50);
    },
    opts,
  );
  const end = (e) => {
    if (e.pointerId !== u.pointer) return;
    u.pointer = null;
    if (u.fillAt) {
      const p = u.fillAt;
      u.fillAt = null;
      if (e.type === 'pointerup') fillAt(u, p);
    } else endStroke(u);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, end, opts);
  canvas.addEventListener('pointerleave', () => u.board.cursor && (u.board.cursor.hidden = true), opts);
  // iOS: die Seite nicht verschieben oder vergrößern, solange auf der Malfläche gezeichnet wird
  const hold = (e) => canDraw() && e.cancelable && e.preventDefault();
  canvas.addEventListener('touchstart', hold, { signal, passive: false });
  canvas.addEventListener('touchmove', hold, { signal, passive: false });
}

function moveCursor(u, e) {
  const cur = u.board.cursor;
  if (!cur) return;
  if (u.tool === 'eimer') {
    cur.hidden = true;
    return;
  }
  const rect = u.board.canvas.getBoundingClientRect();
  const d = Math.max(4, (2 * radius(u.tool === 'radierer' ? 0 : u.color, u.size) * rect.width) / S);
  cur.hidden = false;
  cur.style.width = cur.style.height = `${d}px`;
  cur.style.transform = `translate(${e.clientX - rect.left - d / 2}px, ${e.clientY - rect.top - d / 2}px)`;
}

function startStroke(u, p) {
  u.stroke = { s: nextSeq(u), c: u.tool === 'radierer' ? 0 : u.color, w: u.size, pts: [p], sent: 0 };
  updateDrawing(u);
  sendLivePoints(u);
}

// Neuer Punkt nur, wenn der Finger ein Stück weiter ist (hält die Zeichnung klein)
function addPoint(u, p) {
  const st = u.stroke;
  const [lx, ly] = st.pts[st.pts.length - 1];
  const min = Math.max(4, radius(st.c, st.w) * 0.3);
  if ((p[0] - lx) ** 2 + (p[1] - ly) ** 2 < min * min) return false;
  st.pts.push(p);
  if (st.pts.length >= 1200) {
    // sehr langer Strich: abschließen und nahtlos weitermachen
    endStroke(u);
    startStroke(u, p);
  }
  return true;
}

function endStroke(u) {
  const st = u.stroke;
  if (!st) return;
  u.stroke = null;
  clearTimeout(u.liveTimer);
  u.liveTimer = null;
  issue(u, { s: st.s, t: 's', c: st.c, w: st.w, p: encodePoints(st.pts) });
}

// Neue Punkte des laufenden Strichs live an den anderen (alle 50 ms gesammelt)
function sendLivePoints(u) {
  clearTimeout(u.liveTimer);
  u.liveTimer = null;
  const st = u.stroke;
  if (!st || st.sent >= st.pts.length) return;
  u.game.live.send({ k: 'pt', r: u.s.round, s: st.s, c: st.c, w: st.w, i: st.sent, p: st.pts.slice(st.sent).flat() });
  st.sent = st.pts.length;
}

function fillAt(u, [x, y]) {
  if (u.raster.buf[y * S + x] === u.color) return;
  rippleFx(u, x, y, u.color);
  issue(u, { t: 'f', c: u.color, x, y });
}

// --- Rater: live mitsehen ---

function onLive(u, data) {
  const s = u.s;
  if (!s || !u.raster || u.drawer || s.phase !== 'malen' || s.result || data?.r !== s.round) return;
  if (data.k === 'cmd') {
    const cmd = data.cmd;
    if (!cmd || typeof cmd.s !== 'number' || cmd.s <= s.drawing.seq) return;
    const known = u.liveCmds.get(cmd.s);
    if (known && JSON.stringify(known) === JSON.stringify(cmd)) return;
    u.liveCmds.set(cmd.s, cmd);
    if (u.livePreview && u.livePreview.s <= cmd.s) u.livePreview = null;
    if (cmd.t === 'c') tearFx(u);
    updateDrawing(u);
    if (cmd.t === 'f' && isInt(cmd.x, 0, S - 1) && isInt(cmd.y, 0, S - 1) && isInt(cmd.c, 1, COLORS - 1)) rippleFx(u, cmd.x, cmd.y, cmd.c);
  } else if (data.k === 'pt') {
    const p = data.p;
    if (!Array.isArray(p) || p.length % 2 || p.length > 4000 || !isInt(data.c, 0, COLORS - 1) || !isInt(data.w, 0, 2)) return;
    if (typeof data.s !== 'number' || data.s <= (u.model?.seq ?? s.drawing.seq)) return;
    if (data.i === 0) u.livePreview = { s: data.s, c: data.c, w: data.w, pts: [] };
    const pv = u.livePreview;
    if (!pv || pv.s !== data.s || data.i !== pv.pts.length) return; // Lücke: auf den fertigen Strich warten
    for (let i = 0; i < p.length; i += 2) {
      if (!isInt(p[i], 0, S - 1) || !isInt(p[i + 1], 0, S - 1)) return;
      pv.pts.push([p[i], p[i + 1]]);
    }
    updateDrawing(u);
  }
}

// --- Rater: Tipps ---

function bindGuess(u, signal) {
  const { el } = u.board;
  const form = el.querySelector('.mm-guess');
  const input = form.querySelector('input');
  form.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      u.game.send('raten', { text });
    },
    { signal },
  );
  // Aufgeben in zwei Schritten, damit es nicht aus Versehen passiert
  const give = el.querySelector('.mm-giveup button');
  let armed = null;
  give.addEventListener(
    'click',
    () => {
      if (armed) {
        clearTimeout(armed);
        u.game.send('aufgeben');
        return;
      }
      give.textContent = 'Wirklich aufgeben? Nochmal tippen.';
      armed = setTimeout(() => {
        armed = null;
        give.textContent = 'Aufgeben';
      }, 4000);
    },
    { signal },
  );
}

// --- Effekte auf der Malfläche ---

// Eimer: ein Ring in der Farbe läuft vom Klick aus auseinander
function rippleFx(u, x, y, c) {
  if (u.game.reducedMotion || !u.board) return;
  const ring = document.createElement('i');
  ring.className = 'mm-ripple';
  ring.style.cssText = `left:${(x / S) * 100}%;top:${(y / S) * 100}%;--c:${PAINTS[c].paint}`;
  u.board.fx.append(ring);
  ring.addEventListener('animationend', () => ring.remove());
}

// Alles löschen: das alte Blatt reißt ab und fällt weg
function tearFx(u) {
  if (u.game.reducedMotion || !u.board) return;
  const sheet = document.createElement('canvas');
  sheet.width = sheet.height = 500;
  sheet.getContext('2d').drawImage(u.board.canvas, 0, 0, 500, 500);
  sheet.className = 'mm-sheet';
  u.board.fx.append(sheet);
  sheet
    .animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'translate(-3%, 4%) rotate(-4deg)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-8%, 28%) rotate(-11deg)', opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(.6,0,.2,1)' },
    )
    .finished.then(
      () => sheet.remove(),
      () => sheet.remove(),
    );
}

// --- Ende: Galerie ---

function renderEnd(stage, s, game, u) {
  const signal = u.stage.signal;
  const tiles = s.past
    .map((r, i) => {
      const meta = r.guessed ? (r.ms === null ? 'erraten' : `in <span class="num">${fmt(r.ms, true)}</span>`) : 'nicht erraten';
      return `<li class="mm-tile ${r.guessed ? 'is-ok' : 'is-miss'}" style="--i:${i};--tilt:${[-1.4, 1.1, -0.6, 1.6, -1, 0.7][i % 6]}deg">
        <div class="mm-tile-pic"><canvas width="500" height="500" role="img" aria-label="Zeichnung zu ${game.esc(r.word)}"></canvas>${STAMP[r.guessed ? 'ok' : 'miss']}</div>
        <p class="mm-tile-word">${game.esc(r.word)}</p>
        <p class="mm-tile-meta"><span class="marker" style="color:${game.color(r.drawer)}"></span> ${game.esc(game.name(r.drawer))}, ${meta}</p>
      </li>`;
    })
    .join('');
  stage.innerHTML = `<section class="mm-gallery">
      <h3 class="mm-gallery-title">Eure Bilder</h3>
      <ol class="mm-tiles">${tiles}</ol>
    </section>`;
  // Bilder nacheinander malen, damit die Seite dabei nicht stockt
  const canvases = [...stage.querySelectorAll('.mm-tile canvas')];
  let i = 0;
  const next = () => {
    if (signal.aborted || i >= canvases.length) return;
    drawThumb(canvases[i], s.past[i].ops);
    i++;
    setTimeout(next, 0);
  };
  next();
}

export const style = `
  .mm { display: grid; gap: 20px; min-width: 0; }
  .mm-stage { min-width: 0; }

  /* Runden */
  .mm-track { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .mm-rounds { display: flex; flex-wrap: wrap; gap: 6px; }
  .mm-rounds.many { gap: 4px; }
  .mm-rounds.many .mm-round { width: 22px; height: 22px; }
  .mm-rounds.many .mm-round svg { width: 18px; height: 18px; }
  .mm-round {
    position: relative; width: 28px; height: 28px; border: 1px solid var(--hairline); border-radius: var(--radius);
    display: grid; place-items: center;
  }
  .mm-round > i { width: 8px; height: 8px; background: var(--c); opacity: .35; }
  .mm-round.is-now { border: 2px solid var(--ink); background: color-mix(in srgb, var(--c) 12%, white); }
  .mm-round.is-now > i { opacity: 1; }
  .mm-round svg { width: 24px; height: 24px; overflow: visible; }
  .mm-ink { fill: none; stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; }
  .mm-ink.ok { stroke: var(--ok); }
  .mm-ink.miss { stroke: var(--bad); }
  .mm-rounds.intro .mm-round { animation: mm-pop 300ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 70ms) backwards; }
  .mm-round.fresh .mm-ink { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mm-draw 300ms cubic-bezier(.3,.7,.2,1) 700ms forwards; }
  .mm-round.fresh .mm-ink + .mm-ink { animation-delay: 860ms; }
  .mm-track-cap { font-size: var(--t-sm); color: var(--muted); }
  .mm-track-cap .marker { margin-left: 2px; }

  @keyframes mm-pop { from { opacity: 0; transform: translateY(6px) scale(.9); } }
  @keyframes mm-draw { to { stroke-dashoffset: 0; } }
  @keyframes mm-rise { from { opacity: 0; transform: translateY(10px); } }

  /* Galgenmännchen-Striche */
  /* Schriftgröße nach Länge, und nie breiter als der Platz (ein Wort wird nicht umbrochen) */
  .mm-slots {
    --fs: var(--t-xl); container-type: inline-size; display: flex; flex-wrap: wrap; gap: 6px 14px;
    font-family: var(--font-display); font-weight: 800; line-height: 1;
  }
  .mm-slots.size-m { --fs: var(--t-lg); }
  .mm-slots.size-s { --fs: var(--t-md); }
  .mm-slots.size-xs, .mm-slots.tiny { --fs: var(--t-base); }
  .mm-grp { display: inline-flex; align-items: flex-end; gap: .12em; font-size: min(var(--fs), calc(100cqw / (var(--n) * .76 + .4))); }
  .mm-slot { position: relative; display: inline-block; width: .62em; height: 1.05em; text-align: center; perspective: 300px; }
  .mm-slot::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--ink); }
  .mm-slots.tiny .mm-slot::after { height: 2px; }
  .mm-slot b { display: block; font-weight: inherit; line-height: .95; }
  .mm-dash { display: inline-block; width: .4em; text-align: center; line-height: .95; }
  .mm-slots.drop .mm-slot::after { animation: mm-line 260ms cubic-bezier(.2,.8,.2,1) calc(120ms + var(--k) * 45ms) both; }
  .mm-slots.drop .mm-slot b { animation: mm-letter 260ms cubic-bezier(.2,.8,.2,1) calc(220ms + var(--k) * 45ms) both; }
  @keyframes mm-line { from { transform: scaleX(0); } }
  @keyframes mm-letter { from { opacity: 0; transform: translateY(-.3em); } }

  /* Malen */
  .mm-board { width: min(100%, 560px, max(280px, 100svh - 300px)); display: grid; gap: 12px; }
  .mm-wordline { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 8px 12px; }
  .mm-wordline > div:first-child { flex: 1 1 160px; min-width: 0; }
  .mm-count { font-size: var(--t-sm); margin-top: 4px; }
  .mm-clock { font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1; font-variant-numeric: tabular-nums; }
  .mm-clock-num { display: inline-block; }
  .mm-clock.low { color: var(--bad); }
  .mm-bar { height: 3px; background: var(--hairline); overflow: hidden; }
  .mm-bar i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 250ms linear, background-color 200ms; }
  .mm-bar.low i { background: var(--bad); }

  .mm-paper {
    position: relative; width: 100%; aspect-ratio: 1; background: #fff;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  .mm-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .is-drawer .mm-canvas { touch-action: none; cursor: none; }
  .is-drawer[data-tool="eimer"] .mm-canvas { cursor: crosshair; }
  .mm-frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .mm-frame rect { fill: none; stroke: var(--ink); stroke-width: .5; stroke-dasharray: 1; stroke-dashoffset: 1; animation: mm-draw 640ms cubic-bezier(.6,0,.2,1) 80ms forwards; }
  .mm-fx { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .mm-cursor {
    position: absolute; left: 0; top: 0; pointer-events: none; border-radius: 50%;
    border: 1.5px solid var(--ink); box-shadow: 0 0 0 1px #fff;
  }
  .mm-ripple {
    position: absolute; width: 36%; aspect-ratio: 1; border-radius: 50%; border: 3px solid var(--c);
    transform: translate(-50%, -50%) scale(0); animation: mm-ripple 520ms cubic-bezier(.2,.8,.2,1) forwards;
  }
  @keyframes mm-ripple { 60% { opacity: 1; } to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
  .mm-sheet { position: absolute; inset: 0; width: 100%; height: 100%; transform-origin: 0 0; }

  /* Werkzeuge */
  .mm-tools { display: grid; gap: 10px; }
  .mm-crayons { display: flex; height: 58px; overflow: hidden; border-bottom: 2px solid var(--ink); }
  .mm-crayon {
    flex: 1; min-width: 0; position: relative; appearance: none; border: 0; background: none; padding: 0; cursor: pointer;
    display: flex; justify-content: center; align-items: flex-start;
  }
  .mm-crayon svg {
    width: 23px; height: 58px; transform: translateY(16px);
    transition: transform 200ms cubic-bezier(.2,.8,.2,1);
  }
  .mm-crayon:hover svg { transform: translateY(11px); }
  .mm-crayon[aria-pressed="true"] svg { transform: translateY(2px); }
  .mm-crayon:active svg { transform: translateY(6px) scale(.96); }
  .is-drawer[data-tool="radierer"] .mm-crayon[aria-pressed="true"] svg { transform: translateY(11px); }
  .mm-crayon:focus-visible { box-shadow: inset 0 0 0 2px var(--ink); }
  .mm-board .mm-crayons .mm-crayon svg { animation: mm-crayon 420ms cubic-bezier(.2,.8,.2,1) calc(260ms + var(--i) * 60ms) backwards; }
  @keyframes mm-crayon { from { transform: translateY(60px); } }

  .mm-toolrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .mm-seg { display: flex; gap: 4px; }
  .mm-tool {
    appearance: none; width: 44px; height: 44px; padding: 5px; display: grid; place-items: center; cursor: pointer;
    border: 2px solid transparent; border-radius: var(--radius); background: none; color: var(--ink);
    transition: background-color 120ms ease-out, border-color 120ms ease-out, transform 120ms ease-out;
    animation: mm-rise 300ms cubic-bezier(.2,.8,.2,1) calc(420ms + var(--i) * 50ms) backwards;
  }
  .mm-tool svg { width: 32px; height: 32px; overflow: visible; }
  .mm-tool:hover { background: var(--wash); }
  .mm-tool:active { transform: scale(.96); }
  .mm-tool[aria-pressed="true"] { border-color: var(--ink); background: var(--wash); }
  .mm-size i { width: var(--d); height: var(--d); border-radius: 50%; background: var(--mm-cur); box-shadow: 0 0 0 1.5px var(--ink); }
  .is-drawer[data-tool="radierer"] .mm-size i { background: #fff; }
  .mm-cmds { justify-content: flex-start; gap: 6px; }
  .mm-cmd { min-height: 44px; padding: 6px 10px; gap: 4px; font-size: var(--t-sm); flex: 0 1 auto; }
  .mm-cmd svg { width: 22px; height: 22px; flex: none; }
  .mm-cmd[data-cmd="c"] { margin-left: auto; }
  .mm-cmd:active:not(:disabled) { transform: scale(.96); }

  /* Raten */
  .mm-guess .row { gap: 8px; }
  .mm-guess input { flex: 1; }
  .mm-note:empty { display: none; }
  .mm-tries-title { font-size: var(--t-sm); font-weight: 700; margin-bottom: 6px; }
  .mm-tries-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .mm-try {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--hairline);
    border-radius: var(--radius); max-width: 100%; overflow-wrap: anywhere;
  }
  .mm-try.enter { animation: mm-try 280ms cubic-bezier(.2,.8,.2,1) both; }
  @keyframes mm-try { from { opacity: 0; transform: translateX(-14px); } }
  .mm-try.close { border-color: var(--ink); }
  .mm-close {
    font-family: var(--font-display); font-weight: 800; text-transform: uppercase; letter-spacing: .04em;
    font-size: var(--t-sm); color: var(--p1); border: 2px solid var(--p1); padding: 0 4px; border-radius: var(--radius);
    transform: rotate(-4deg);
  }
  .mm-try.enter .mm-close { animation: mm-stamp 320ms cubic-bezier(.2,.8,.2,1) 160ms both; }
  @keyframes mm-stamp { from { opacity: 0; transform: rotate(-12deg) scale(1.6); } }
  .mm-giveup { margin-top: -4px; }

  /* Wort aussuchen, warten, bereit */
  .mm-wordform { display: grid; gap: 0; max-width: 420px; animation: mm-rise 320ms cubic-bezier(.2,.8,.2,1) 120ms both; }
  .mm-wordform .row { margin-top: 16px; }
  .mm-preview { min-height: 30px; margin-top: 12px; }
  .mm-wait { display: grid; gap: 8px; justify-items: start; }
  .mm-scribble { width: 120px; height: 48px; }
  .mm-scribble-line {
    fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 1; stroke-dashoffset: 1; animation: mm-scribble 2400ms cubic-bezier(.6,0,.2,1) infinite;
  }
  @keyframes mm-scribble { 55% { stroke-dashoffset: 0; } 80% { stroke-dashoffset: 0; opacity: 1; } to { stroke-dashoffset: 0; opacity: 0; } }
  .mm-ready { display: grid; gap: 14px; justify-items: start; max-width: 480px; }
  .mm-ready .mm-slots { justify-self: stretch; }
  .mm-ready .label { margin: 0; }

  /* Auflösung */
  .mm-reveal { display: grid; grid-template-columns: minmax(0, 42%) 1fr; gap: 16px; align-items: center; margin-bottom: 28px;
    padding-bottom: 20px; border-bottom: 1px solid var(--hairline); }
  .mm-thumb { position: relative; aspect-ratio: 1; border: 1px solid var(--ink); background: #fff; }
  .mm-thumb canvas, .mm-tile-pic canvas { display: block; width: 100%; height: 100%; }
  .mm-reveal-cap { font-size: var(--t-sm); color: var(--muted); margin-bottom: 6px; }
  .mm-reveal-res { margin-top: 8px; font-weight: 700; }
  .mm-reveal.is-ok .mm-reveal-res { color: var(--ok); }
  .mm-reveal.is-miss .mm-reveal-res { color: var(--bad); }
  .mm-reveal .mm-slots { --fs: var(--t-lg); }
  .mm-slots.flip .mm-slot b { animation: mm-flip 300ms cubic-bezier(.2,.8,.2,1) calc(320ms + var(--k) * var(--step, 50ms)) both; transform-origin: 50% 100%; }
  @keyframes mm-flip { from { transform: rotateX(90deg); opacity: 0; } }
  .mm-reveal-res { animation: mm-rise 300ms cubic-bezier(.2,.8,.2,1) var(--after, 700ms) both; }

  .mm-stamp { position: absolute; right: -10px; bottom: -10px; width: 46%; max-width: 92px; overflow: visible; }
  .mm-stamp path { fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
  .mm-stamp .mm-ring { fill: #fff; }
  .mm-stamp.ok path { stroke: var(--ok); }
  .mm-stamp.miss path { stroke: var(--bad); }
  .mm-stamp path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mm-draw 360ms cubic-bezier(.3,.7,.2,1) var(--after, 700ms) forwards; }
  .mm-stamp .mm-tick { animation-delay: calc(var(--after, 700ms) + 260ms); }
  .mm-stamp .mm-tick.two { animation-delay: calc(var(--after, 700ms) + 400ms); }
  .mm-stamp { animation: mm-press 420ms cubic-bezier(.2,.8,.2,1) var(--after, 700ms) both; }
  @keyframes mm-press { from { transform: scale(1.35) rotate(-10deg); opacity: 0; } 30% { opacity: 1; } }

  /* Galerie */
  .mm-gallery-title { font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1; margin-bottom: 14px; }
  .mm-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 16px; }
  @media (min-width: 600px) { .mm-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .mm-tile { animation: mm-tile 460ms cubic-bezier(.2,.8,.2,1) calc(150ms + var(--i) * 120ms) both; }
  @keyframes mm-tile { from { opacity: 0; transform: translateY(18px) rotate(calc(var(--tilt) * 3)); } }
  .mm-tile-pic { position: relative; aspect-ratio: 1; border: 1px solid var(--ink); background: #fff; transform: rotate(var(--tilt)); }
  .mm-tile .mm-stamp { width: 38%; --after: calc(450ms + var(--i) * 120ms); }
  .mm-tile.is-miss .mm-tile-pic canvas { opacity: .82; }
  .mm-tile-word { font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1.1; margin-top: 10px; overflow-wrap: anywhere; }
  .mm-tile-meta { font-size: var(--t-sm); color: var(--muted); }

  @media (prefers-reduced-motion: reduce) {
    .mm *, .mm *::after { animation: none !important; transition: none !important; }
    .mm .mm-frame rect, .mm .mm-ink, .mm .mm-stamp path, .mm .mm-scribble-line { stroke-dashoffset: 0 !important; }
  }
`;
