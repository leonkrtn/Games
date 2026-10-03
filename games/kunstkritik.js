// Kunstkritik: Alle malen dasselbe Wort gegen die Uhr, dann wird jedes Bild ohne Namen bewertet.
// Zwei bis sechs Spieler.
//
// Ablauf einer Runde: Jeder schlägt geheim ein Wort vor → das Los zieht einen Vorschlag, reihum in
// zufälliger Reihenfolge (jeder ist einmal dran, bevor jemand zum zweiten Mal kommt) → jeder tippt auf
// „Los“ und hat ab da seine eigene Zeit (drei Sekunden Vorlauf, dann die gewählte Malzeit), so geht es
// auch, wenn nicht alle gleichzeitig da sind → sind alle fertig (oder ihre Zeit samt Nachfrist um),
// hängen die Bilder in zufälliger Reihenfolge ohne Namen in der Galerie → Bild für Bild geben alle
// anderen gleichzeitig eine Note von eins bis zehn (geheim, bis alle bewertet haben; bis dahin lässt
// sie sich ändern) → Auflösung: wer es gemalt hat, wer welche Note gegeben hat und die Summe → „Weiter“
// (alle) oder nach einigen Sekunden von selbst. Nach der letzten Runde gewinnt, wer insgesamt die
// meisten Punkte hat; teilen sich mehrere den ersten Platz, gewinnen sie zusammen.
//
// Zeichnen wie bei Montagsmaler (Skill „malflaeche“): Befehle mit laufender Nummer auf einem eigenen
// Raster, damit jeder Browser dasselbe Bild malt. Beim Malen sieht niemand zu, deshalb kein game.live.
// Der Browser speichert höchstens alle zwei Sekunden (bis zu sechs Leute malen gleichzeitig im selben
// Raum, und jede Speicherung schreibt den ganzen Zustand) und am Schluss den Rest mit „fertig“.
//
// Motion: Vor dem Malen zählt die Malfläche drei, zwei, eins herunter, das Wort fällt Buchstabe für
// Buchstabe ein. Ein fertiges Bild schrumpft in seinen Goldrahmen. Beim Bewerten gleitet Bild für Bild
// herein, die Kritiker heben verdeckte Wertungstafeln, bei der Auflösung drehen sich die Tafeln
// nacheinander um, das Namensschild klappt auf und die Summe zählt hoch, die Punkte oben ziehen nach.
// Zwischen den Runden hängt die Rückschau als kleine Galerie an der Wand, am Ende kommen die Plätze von
// hinten nach vorn, die Rosette des Siegers dreht sich herein und alle Bilder schwingen an ihre Nägel.

export const meta = {
  name: 'Kunstkritik',
  description: 'Alle malen dasselbe Wort gegen die Uhr. Dann bewertet ihr jedes Bild ohne Namen von eins bis zehn.',
  players: [2, 6],
  options: [
    {
      id: 'zeit',
      label: 'Zeit zum Malen',
      choices: [
        { value: 60, label: 'Eine Minute' },
        { value: 30, label: 'Dreißig Sekunden' },
        { value: 90, label: 'Anderthalb Minuten' },
        { value: 120, label: 'Zwei Minuten' },
      ],
    },
    {
      id: 'runden',
      label: 'Runden',
      choices: [
        { value: 3, label: 'Drei Runden' },
        { value: 1, label: 'Eine Runde' },
        { value: 2, label: 'Zwei Runden' },
        { value: 4, label: 'Vier Runden' },
        { value: 5, label: 'Fünf Runden' },
      ],
    },
  ],
};

// ---------- Zeichnung (Server und Browser) ----------

const S = 1000; // Malfläche: S × S Rasterpunkte
const PEN = [4, 10, 22]; // Stiftdicke als Radius in Rasterpunkten: dünn, mittel, dick
const RUBBER = [10, 24, 48]; // Radierer
const COLORS = 7; // 0 = Papier (Radierer), 1–6 = Farben
const MAX_OPS = 1000;
const MAX_CHARS = 30_000; // Summe aller Strich-Codes einer Zeichnung; alle Bilder der Partie stehen im Zustand
const MAX_STROKE = 6000; // Zeichen eines Strichs

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

// Was von einer Zeichnung übrig bleibt: die sichtbaren Schritte ab dem letzten „Alles löschen“,
// ohne Nummern. Leer = nichts gemalt.
function finalOps(d) {
  const vis = d.ops.slice(0, d.n);
  let k = vis.length;
  while (k > 0 && vis[k - 1].t !== 'c') k--;
  return vis.slice(k).map(({ s, ...op }) => op);
}

// ---------- Wörter und Zahlen ----------

const MAX_WORD = 24;
const SUGGEST_EACH = 6; // so viele Ideen bekommt jeder pro Runde
// Ideen für die Vorschläge (200): Motive mit einem Dreh, Orte, Leute, Stimmungen. Jede muss durch cleanWord
// passen (nur Buchstaben, Leerzeichen, Bindestriche, höchstens vierundzwanzig Zeichen). Neue nur hinten anhängen.
const SUGGESTIONS = `Katze im Weltall, Hund mit Sonnenbrille, Pinguin auf Skiern, Elefant im Ballett, Giraffe mit Schal, Schnecke mit Turbo
  Krake beim Jonglieren, Eule mit Brille, Goldfisch im Glas, Bär beim Picknick, Kuh auf dem Mond, Huhn mit Krone
  Froschkönig, Hase mit Regenschirm, Igel mit Luftballons, Pferd mit Flügeln, Schwein im Schlamm, Löwe beim Friseur
  Maus mit Käse, Affe auf der Palme, Ente in der Badewanne, Fuchs im Schnee, Wal mit Fontäne, Delfin im Sprung
  Hai mit Zahnspange, Biene auf der Blume, Krokodil mit Zahnbürste, Schildkröte beim Rennen, Flamingo auf einem Bein, Papagei am Telefon
  Känguru mit Rucksack, Panda mit Bambus, Eisbär auf der Scholle, Dackel im Pullover, Kamel in der Wüste, Spinne im Netz
  Hamster im Laufrad, Tintenfisch mit Tinte, Storch mit Baby, Raupe beim Essen, Waschbär im Mülleimer, Drache trinkt Tee
  Einhorn im Regen, Roboter beim Kochen, Monster unter dem Bett, Gespenst im Schloss, Hexe auf dem Besen, Zauberer mit Hut
  Meerjungfrau am Felsen, Ritter gegen Drachen, Außerirdischer im Ufo, Vampir beim Zahnarzt, Riese in der Stadt, Gartenzwerg
  Fee im Blumenbeet, Pirat mit Holzbein, Superheld im Flug, Yeti im Schnee, Zombie beim Tanzen, Troll unter der Brücke
  Kobold mit Goldtopf, Werwolf bei Vollmond, Schneemann im Sommer, Weihnachtsmann im Urlaub, Osterhase bei der Arbeit, Zahnfee bei Nacht
  Mumie im Museum, Sonnenuntergang am Meer, Leuchtturm im Sturm, Burg auf dem Berg, Insel mit Palme, Vulkanausbruch
  Wasserfall im Dschungel, Iglu am Nordpol, Baumhaus im Wald, Stadt bei Nacht, Jahrmarkt, Unterwasserwelt
  Wüste mit Kaktus, Bauernhof, Zeltlager am See, Riesenrad, Achterbahn, Strand mit Sandburg
  Gipfelkreuz, Raumstation, Mondlandung, Regenbogen über Feldern, Gewitter über der Stadt, Herbstwald
  Winterlandschaft, Garten im Frühling, Hafen mit Schiffen, Bibliothek, Montagmorgen, Stau auf der Autobahn
  Pizza mit allem, Geburtstagstorte, Kaffee am Morgen, Verlorene Socke, Wäscheleine im Wind, Picknick im Park
  Grillabend, Wackelzahn, Schnupfen, Sonnenbrand, Zu viel Gepäck, Regenschirm im Sturm
  Eis am Stiel, Wecker klingelt, Erster Schultag, Familienfoto, Kissenschlacht, Schneeballschlacht
  Seifenblasen, Feuerwehrfrau, Astronautin, Koch mit Mütze, Gärtnerin, Clown im Zirkus
  Dirigent, Bäckerin, Taucher, Detektiv mit Lupe, Bergsteiger, Malerin an der Staffelei
  Fußballspieler, Ballerina, Cowboy auf dem Pferd, Skateboarder, Ärztin, Lehrer an der Tafel
  Pilotin im Cockpit, Zauberkünstler, Fliegender Teppich, Kaputtes Fahrrad, Rakete zum Mars, Heißluftballon
  U-Boot, Dampflok, Traktor auf dem Feld, Feuerwehrauto, Segelschiff im Sturm, Zeitmaschine
  Schatzkarte, Schatztruhe, Zauberstab, Sanduhr, Kronleuchter, Riesenhamburger
  Kuckucksuhr, Schaukelstuhl, Leiter in den Himmel, Liebe, Langeweile, Glück
  Wut, Angst im Dunkeln, Musik, Traum, Überraschung, Silvester
  Hochzeit, Karneval, Halloween, Selbstporträt, Mein Lieblingsessen, Mein Traumhaus
  Mein Haustier, Die Zukunft, Oma beim Stricken, Opa im Garten, Baby beim Krabbeln, Tanzendes Gemüse
  Banane im Urlaub, Wolke mit Gesicht, Mond mit Schlafmütze, Sonne mit Sonnenbrille, Kaktus mit Blume, Pilz im Wald
  Apfel mit Wurm, Kürbis mit Gesicht, Brezel mit Senf, Spiegelei, Pommes mit Ketchup, Popcorn im Kino
  Toaster mit Toast, Handy mit Sprung, Fernseher ohne Bild, Gitarre am Lagerfeuer, Trommelwirbel, Klavier im Regen
  Mikrofon auf der Bühne, Fußballstadion, Skispringer, Schwimmbad, Kanu auf dem Fluss, Surfer auf der Welle
  Zelt im Regen, Hängebrücke`
  .split(/\s*,\s*|\n\s*/)
  .filter(Boolean);

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
  if ([...w].filter((ch) => /\p{L}/u.test(ch)).length < 2) throw new Error('Mindestens zwei Buchstaben.');
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

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// Zahl als Wort (die Textschrift hat eine durchgestrichene Null): 0 bis 999
function zahl(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const one = n % 10;
    return one ? `${one === 1 ? 'ein' : ONES[one]}und${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  }
  const rest = n % 100;
  return `${Math.floor(n / 100) === 1 ? '' : ONES[Math.floor(n / 100)]}hundert${rest ? zahl(rest) : ''}`;
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`);
const points = (n) => (n === 1 ? 'einen Punkt' : `${zahl(n)} Punkte`);
const withPoints = (n) => (n === 1 ? 'einem Punkt' : `${zahl(n)} Punkten`); // „mit …“
const TIME_WORDS = { 30: 'dreißig Sekunden', 60: 'eine Minute', 90: 'anderthalb Minuten', 120: 'zwei Minuten' };
const NOTES = ['', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn'];

// ---------- Spielablauf (Server) ----------

const COUNTDOWN = 3000; // ms zwischen „Los“ und dem ersten Strich
const GRACE = 2500; // ms nach Ablauf der Malzeit: Striche, die noch unterwegs sind, zählen
const REVEAL = 9000; // so lange bleibt die Auflösung eines Bildes stehen, wenn nicht alle „Weiter“ tippen
const TIMES = [60, 30, 90, 120];
const ROUNDS = [3, 1, 2, 4, 5];

const ids = (s) => s.players.map((p) => p.id);
const nameOf = (s, id) => s.players.find((p) => p.id === id)?.name ?? '?';
const ratersOf = (s, pic) => ids(s).filter((id) => id !== pic.by);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const noWords = (s) => Object.fromEntries(ids(s).map((id) => [id, null]));

export function setup(players, options = {}) {
  const list_ = players.map(({ id, name }) => ({ id, name }));
  const s = {
    players: list_,
    zeit: TIMES.includes(options.zeit) ? options.zeit : 60,
    rounds: ROUNDS.includes(options.runden) ? options.runden : 3,
    round: 0,
    phase: 'wort', // wort → malen → bewerten → (nächste Runde) … → ende
    words: {}, // geheime Vorschläge dieser Runde
    word: null, // das gewählte Wort
    by: [], // wer es vorgeschlagen hat (erst in der Rückschau zu sehen)
    from: null, // wessen Vorschlag gezogen wurde (geheim bis zur Rückschau)
    chosen: [], // wessen Vorschläge in diesem Durchgang schon gezogen wurden (reihum, siehe drawSuggester)
    deck: shuffle(SUGGESTIONS.map((_, i) => i)), // Reihenfolge der Ideen
    deckPos: 0,
    draw: null, // beim Malen: { [id]: { at, end, done, d } }, at = Tipp auf Los, end = Ende der Malzeit
    pics: null, // beim Bewerten: [{ by, ops, votes: { [id]: note }, sum }] in zufälliger Reihenfolge
    blank: [], // wer in dieser Runde nichts gemalt hat
    index: 0, // welches Bild gerade bewertet wird
    shown: null, // Zeitpunkt der Auflösung des aktuellen Bildes
    ready: [], // wer nach der Auflösung „Weiter“ getippt hat
    totals: Object.fromEntries(list_.map((p) => [p.id, 0])),
    past: [], // fertige Runden: [{ word, by, from, pics, blank }]
  };
  s.words = noWords(s);
  return s;
}

export function action(s, { player, type, data }) {
  if (s.result || !s.players.some((p) => p.id === player)) return;
  const now = Date.now();

  switch (type) {
    case 'wort': {
      if (s.phase !== 'wort') return;
      const w = cleanWord(data?.wort);
      if (s.past.some((r) => norm(r.word) === norm(w))) throw new Error('Dieses Wort hattet ihr schon. Nimm ein anderes.');
      s.words[player] = w;
      if (ids(s).every((id) => s.words[id])) startDrawing(s);
      return;
    }
    case 'wort-aendern': {
      if (s.phase !== 'wort') return;
      s.words[player] = null;
      return;
    }
    case 'los': {
      if (s.phase !== 'malen') return;
      const e = s.draw[player];
      if (e.at) return;
      e.at = now;
      e.end = now + COUNTDOWN + s.zeit * 1000;
      return;
    }
    case 'malen': {
      // Zeichenbefehle kommen gebündelt; was schon da ist (gleiche Nummer), wird übersprungen.
      if (s.phase !== 'malen') return;
      const e = s.draw[player];
      if (!e.at || e.done) return;
      if (now <= e.end + GRACE) {
        const cmds = Array.isArray(data?.cmds) ? data.cmds.slice(0, 300) : [];
        for (const cmd of cmds) {
          if (typeof cmd?.s === 'number' && cmd.s <= e.d.seq) continue;
          if (!applyCmd(e.d, cmd)) break;
        }
      }
      if (data?.fertig === true) {
        e.done = true;
        if (allDrawn(s, now)) startRating(s);
      }
      return;
    }
    case 'bewerten': {
      if (s.phase !== 'bewerten' || s.shown || data?.i !== s.index) return; // alter Tipp: zählt nicht
      const pic = s.pics[s.index];
      if (pic.by === player) {
        throw new Error(s.players.length > 2 ? 'Dein eigenes Bild bewerten die anderen.' : 'Dein eigenes Bild bewertet der andere.');
      }
      const n = data?.n;
      if (!isInt(n, 1, 10)) throw new Error('Bitte eine Note von eins bis zehn.');
      pic.votes[player] = n; // ändern geht, bis alle bewertet haben
      const raters = ratersOf(s, pic);
      if (!raters.every((id) => pic.votes[id])) return;
      pic.sum = raters.reduce((sum, id) => sum + pic.votes[id], 0);
      s.totals[pic.by] += pic.sum;
      s.shown = now;
      return;
    }
    case 'weiter': {
      if (s.phase !== 'bewerten' || !s.shown || data?.i !== s.index) return;
      if (!s.ready.includes(player)) s.ready.push(player);
      if (ids(s).every((id) => s.ready.includes(id))) nextPicture(s);
      return;
    }
  }
}

// Fristen: Malzeit aller um (samt Nachfrist) → bewerten; Auflösung lange genug gezeigt → nächstes Bild.
export function tick(s, now) {
  if (s.result) return;
  if (s.phase === 'malen' && allDrawn(s, now)) startRating(s);
  else if (s.phase === 'bewerten' && s.shown && now >= s.shown + REVEAL) nextPicture(s);
}

const allDrawn = (s, now) =>
  ids(s).every((id) => {
    const e = s.draw[id];
    return e.done || (e.end && now >= e.end + GRACE);
  });

// Das Los zieht aus den Vorschlägen (gleiche Wörter zählen einmal).
// Wessen Vorschlag gemalt wird: zufällig, aber reihum. Wer gezogen wurde, kommt erst wieder infrage,
// wenn alle einmal dran waren, und nie zweimal hintereinander (zu zweit wechselt es also ab).
function drawSuggester(s) {
  const everyone = ids(s);
  let pool = everyone.filter((id) => !(s.chosen ?? []).includes(id));
  if (!pool.length) {
    s.chosen = [];
    pool = everyone;
  }
  const last = s.past[s.past.length - 1]?.from;
  if (pool.length > 1) pool = pool.filter((id) => id !== last);
  const id = pool[Math.floor(Math.random() * pool.length)];
  s.chosen = [...(s.chosen ?? []), id];
  return id;
}

function startDrawing(s) {
  const from = drawSuggester(s);
  const word = s.words[from];
  Object.assign(s, {
    phase: 'malen',
    word,
    from,
    by: ids(s).filter((id) => norm(s.words[id]) === norm(word)), // gleiche Wörter: alle stehen in der Rückschau
    words: noWords(s),
    draw: Object.fromEntries(ids(s).map((id) => [id, { at: null, end: null, done: false, d: emptyDrawing() }])),
    deckPos: (s.deckPos + s.players.length * SUGGEST_EACH) % s.deck.length,
  });
}

function startRating(s) {
  const pics = [];
  const blank = [];
  for (const id of ids(s)) {
    const ops = finalOps(s.draw[id].d);
    if (ops.length) pics.push({ by: id, ops, votes: {}, sum: null });
    else blank.push(id);
  }
  Object.assign(s, { phase: 'bewerten', draw: null, pics: shuffle(pics), blank, index: 0, shown: null, ready: [] });
  if (!pics.length) endRound(s);
}

function nextPicture(s) {
  s.index++;
  s.shown = null;
  s.ready = [];
  if (s.index >= s.pics.length) endRound(s);
}

function endRound(s) {
  s.past.push({ word: s.word, by: s.by, from: s.from ?? null, pics: s.pics, blank: s.blank });
  Object.assign(s, {
    round: s.round + 1,
    phase: 'wort',
    words: noWords(s),
    word: null,
    by: [],
    from: null,
    draw: null,
    pics: null,
    blank: [],
    index: 0,
    shown: null,
    ready: [],
  });
  if (s.round >= s.rounds) finish(s);
}

function finish(s) {
  s.phase = 'ende';
  const t = s.totals;
  const sorted = [...s.players].sort((a, b) => t[b.id] - t[a.id]);
  const top = t[sorted[0].id];
  const best = sorted.filter((p) => t[p.id] === top);
  const two = s.players.length === 2;
  let text;
  let winners = best.map((p) => p.id);
  if (top === 0) {
    text = 'Niemand hat etwas gemalt. Unentschieden.';
    winners = [];
  } else if (best.length === s.players.length) {
    text = two ? `Unentschieden, beide haben ${points(top)}.` : `Unentschieden, alle haben ${points(top)}.`;
    winners = [];
  } else if (two) {
    text = `${sorted[0].name} gewinnt ${zahl(top)} zu ${zahl(t[sorted[1].id])}.`;
  } else if (best.length > 1) {
    text = `${list(best.map((p) => p.name))} teilen sich den Sieg mit je ${withPoints(top)}.`;
  } else {
    text = `${sorted[0].name} gewinnt mit ${withPoints(top)}.`;
  }
  s.result = { winners, text };
}

export function waitingFor(s) {
  if (s.result) return [];
  if (s.phase === 'wort') return ids(s).filter((id) => !s.words[id]);
  if (s.phase === 'malen') return ids(s).filter((id) => !s.draw[id].done);
  if (s.phase === 'bewerten' && !s.shown) {
    // Ab drei Spielern alle, bis das Bild aufgelöst ist: Die Startseite zeigt diese Liste, und stünden dort
    // nur die Bewerter, die noch fehlen, verriete sie, wer das Bild gemalt hat (der steht nie darin).
    if (s.players.length > 2) return ids(s);
    const pic = s.pics[s.index];
    return ratersOf(s, pic).filter((id) => !pic.votes[id]);
  }
  return [];
}

// Benachrichtigungen nur beim Wechsel der Phase, nicht bei jedem Bild.
export function notices(s, before, player) {
  if (s.result) return [];
  const all = ids(s);
  if (s.round !== before.round) {
    return all.map((to) => ({ to, text: `Runde ${zahl(s.round + 1)} von ${zahl(s.rounds)}. Schlag ein Wort vor.` }));
  }
  if (before.phase === 'wort' && s.phase === 'malen') {
    return all.map((to) => ({ to, text: `Das Wort steht fest. Tipp auf Los, dann hast du ${TIME_WORDS[s.zeit]}.` }));
  }
  if (before.phase === 'malen' && s.phase === 'bewerten') {
    return all.map((to) => ({ to, text: 'Alle Bilder sind fertig. Jetzt wird bewertet.' }));
  }
  return [];
}

// Geheim: die Vorschläge der anderen, das Wort bis zum eigenen „Los“, wer es vorgeschlagen hat (bis zur
// Rückschau), die Bilder der anderen beim Malen und beim Bewerten, von wem ein Bild ist und welche Noten
// es bekommen hat, bis alle bewertet haben. Bilder fertiger Runden kommen erst in der Rückschau und am Ende mit.
export function view(s, me) {
  // chosen und from verrieten, wessen Vorschlag gerade gemalt wird
  const { deck, deckPos, chosen, from, ...rest } = s;
  if (s.result) return rest;
  const last = s.past.length - 1;
  const v = {
    ...rest,
    by: [],
    past: s.past.map((r, i) => (s.phase === 'wort' && i === last ? r : { ...r, pics: r.pics.map((p) => ({ ...p, ops: null })) })),
  };
  if (s.phase === 'wort') {
    v.words = { [me]: s.words[me] ?? null };
    v.sent = ids(s).filter((id) => s.words[id]);
    const k = ids(s).indexOf(me);
    // % SUGGESTIONS.length: Partien von vor dem Wechsel auf die eigene Liste haben noch Indizes bis 301.
    v.suggestions = Array.from({ length: SUGGEST_EACH }, (_, j) => SUGGESTIONS[deck[(deckPos + k * SUGGEST_EACH + j) % deck.length] % SUGGESTIONS.length]);
  } else if (s.phase === 'malen') {
    v.word = s.draw[me].at ? s.word : null;
    v.draw = Object.fromEntries(ids(s).map((id) => [id, id === me ? s.draw[id] : { ...s.draw[id], d: null }]));
  } else if (s.phase === 'bewerten') {
    v.blank = [];
    v.pics = s.pics.map((p, i) => {
      if (i < s.index || (i === s.index && s.shown)) return { ...p, ops: i === s.index ? p.ops : null };
      return {
        by: p.by === me ? me : null,
        ops: i === s.index ? p.ops : null,
        votes: p.votes[me] ? { [me]: p.votes[me] } : {},
        count: Object.keys(p.votes).length,
        sum: null,
      };
    });
  }
  return v;
}

// ---------- Anzeige (nur im Browser) ----------

const INK = '#141414';
const WOOD = '#ecc995';
const WOOD_D = '#c99a5c';
const ROSE = '#e9a3a0'; // Radiergummi
const SLEEVE = '#3a6b98';
const GOLD = ['#e6b852', '#d19d38', '#ae7c26', '#8d621c']; // Bilderrahmen: oben (Licht), links, rechts, unten
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

// Ganzes Bild in eine Leinwand malen: in voller Größe Punkt für Punkt, kleiner gemittelt (drawThumb).
function drawPicture(canvas, ops) {
  if (canvas.width !== S) return drawThumb(canvas, ops);
  const r = createRaster();
  for (const op of ops ?? []) applyOp(r, op);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < S * S; i++) px[i] = LUT[r.buf[i]];
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

// Die aktuelle Farbe (--kk-cur) steckt in der Stiftmine, der Farbe im Eimer und dem Klecks.
const ICON = {
  stift: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="rotate(45 20 20)">
    <path d="M15.5 9 H24.5 V31 H15.5 Z" fill="#fff"/>
    <path d="M20 10 V30" stroke-width=".9" opacity=".5"/>
    <path d="M15.5 9 L20 0.5 L24.5 9 Z" fill="${WOOD}"/>
    <path d="M17.6 5.2 L20 0.5 L22.4 5.2 Q20 6.2 17.6 5.2 Z" style="fill:var(--kk-cur)" stroke-width="1.2"/>
    <rect x="15.5" y="31" width="9" height="3" fill="#bdbdbd"/>
    <path d="M15.5 34 H24.5 V36 Q24.5 38.5 22 38.5 H18 Q15.5 38.5 15.5 36 Z" fill="${ROSE}"/>
  </g></svg>`,
  eimer: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <g transform="rotate(-40 23 19)">
      <path d="M13.5 14.5 Q23 1.5 32.5 14.5" fill="none"/>
      <path d="M13 14 L15.5 32 Q23 34.5 30.5 32 L33 14" fill="#fff"/>
      <path d="M14.3 23 Q23 25.5 31.7 23" fill="none" stroke-width="1"/>
      <ellipse cx="23" cy="14" rx="10" ry="3.2" style="fill:var(--kk-cur)"/>
    </g>
    <path d="M10.2 18 C 7.4 21.8, 9 27, 7.9 31.6" fill="none" style="stroke:var(--kk-cur)" stroke-width="3"/>
    <path d="M7.9 30.5 C 5.6 33.6, 6 37.3, 7.9 37.3 C 9.8 37.3, 10.3 33.6, 7.9 30.5 Z" style="fill:var(--kk-cur)" stroke-width="1.3"/>
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

// --- Zeichnungen (Skill „zeichnen“): Goldrahmen, Wertungstafel, Rosette, Staffelei ---

const NS = 'vector-effect="non-scaling-stroke"';
const knob = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="1.7" fill="${GOLD[0]}" stroke="${INK}" stroke-width="1" ${NS}/><circle cx="${x - 0.5}" cy="${y - 0.5}" r=".5" fill="#fff" opacity=".8"/>`;

// Rahmen mit Gehrung: vier Leisten im Licht von oben links, Rille, Innenleiste, Knöpfe an den Ecken.
// Das Bild liegt innen von 7 % bis 93 %.
const FRAME = `<svg class="kk-frame-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <path d="M.6 .6 H99.4 L94 6 H6 Z" fill="${GOLD[0]}"/>
  <path d="M.6 .6 L6 6 V94 L.6 99.4 Z" fill="${GOLD[1]}"/>
  <path d="M99.4 .6 V99.4 L94 94 V6 Z" fill="${GOLD[2]}"/>
  <path d="M.6 99.4 L6 94 H94 L99.4 99.4 Z" fill="${GOLD[3]}"/>
  <path d="M6 6 H94 V94 H6 Z M7 7 V93 H93 V7 Z" fill="${GOLD[0]}" fill-rule="evenodd"/>
  <g fill="none" stroke="${INK}">
    <path d="M2.2 97.8 V2.2 H97.8" stroke="#fff" stroke-width="1" opacity=".55" ${NS}/>
    <rect x="3.3" y="3.3" width="93.4" height="93.4" stroke-width=".8" opacity=".5" ${NS}/>
    <path d="M.6 .6 L6 6 M99.4 .6 L94 6 M99.4 99.4 L94 94 M.6 99.4 L6 94" stroke-width="1" ${NS}/>
    <rect x="6" y="6" width="88" height="88" stroke-width="1" ${NS}/>
    <rect x="7" y="7" width="86" height="86" stroke-width="1.2" ${NS}/>
    <rect x=".6" y=".6" width="98.8" height="98.8" stroke-width="1.8" ${NS}/>
  </g>
  ${knob(3.3, 3.3)}${knob(96.7, 3.3)}${knob(96.7, 96.7)}${knob(3.3, 96.7)}
</svg>`;

// Schraffur ↗ in einem Rechteck, selbst zugeschnitten (ein clipPath greift nicht, wenn die erste
// Zeichnung mit derselben id versteckt ist)
function hatch(x0, y0, x1, y1, step) {
  const out = [];
  for (let c = x0 - (y1 - y0); c < x1; c += step) {
    let [xa, ya, xb, yb] = [c, y1, c + (y1 - y0), y0];
    if (xa < x0) [ya, xa] = [y1 - (x0 - xa), x0];
    if (xb > x1) [yb, xb] = [y0 + (xb - x1), x1];
    if (ya > yb) out.push(`M${xa.toFixed(1)} ${ya.toFixed(1)} L${xb.toFixed(1)} ${yb.toFixed(1)}`);
  }
  return out.join(' ');
}

// Wertungstafel: Karte (dreht sich um) auf einem Holzstiel mit Blechschelle
const CARD_FRONT = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="2" y="2" width="36" height="36" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
  <path d="M2 4 Q2 2 4 2 H36 Q38 2 38 4 V9 H2 Z" style="fill:var(--c)" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M4.5 12 V35.5 H35.5" fill="none" stroke="${INK}" stroke-width=".6" opacity=".25"/>
</svg>`;
const CARD_BACK = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="2" y="2" width="36" height="36" rx="2" fill="#f3efe6" stroke="${INK}" stroke-width="1.6"/>
  <path d="${hatch(6, 6, 34, 34, 3.2)}" stroke="${INK}" stroke-width=".55" opacity=".32"/>
  <rect x="6" y="6" width="28" height="28" rx="1" fill="none" stroke="${INK}" stroke-width=".9"/>
  <circle cx="20" cy="20" r="6.5" fill="#f3efe6" stroke="${INK}" stroke-width="1.1"/>
  <path d="M15.8 20 Q20 15.6 24.2 20 Q20 24.4 15.8 20 Z" fill="#fff" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <circle cx="20" cy="20" r="1.6" fill="${INK}"/>
</svg>`;
const HANDLE = `<svg viewBox="0 0 40 26" aria-hidden="true">
  <rect x="17" y="-2" width="6" height="26" rx="1.5" fill="${WOOD}" stroke="${INK}" stroke-width="1.4"/>
  <path d="M19.2 9 V21 M21 13 V19" stroke="${INK}" stroke-width=".7" opacity=".45" stroke-linecap="round"/>
  <rect x="15.5" y="0" width="9" height="4.5" rx="1" fill="#bdbdbd" stroke="${INK}" stroke-width="1.2"/>
</svg>`;

// Rosette für den ersten Platz: gefältelte Scheibe mit zwei Bändern in der Farbe des Spielers
const RP = (r, i, n = 18) => {
  const a = (i / n) * 2 * Math.PI;
  return `${(30 + r * Math.sin(a)).toFixed(2)} ${(30 - r * Math.cos(a)).toFixed(2)}`;
};
const ROSETTE_EDGE = `M${RP(19.5, 0)}${Array.from({ length: 18 }, (_, i) => ` Q${RP(25.5, i + 0.5)} ${RP(19.5, i + 1)}`).join('')} Z`;
const ROSETTE_PLEATS = Array.from({ length: 18 }, (_, i) => `M${RP(14.5, i)} L${RP(20.5, i)}`).join(' ');
const rosette = (c) => `<svg viewBox="0 0 60 84" aria-hidden="true">
  <g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">
    <path d="M24 42 L14 76 L19.5 71.5 L24 78 L33 45 Z" style="fill:color-mix(in srgb, ${c} 78%, black)"/>
    <path d="M36 42 L46 76 L40.5 71.5 L36 78 L27 45 Z" style="fill:${c}"/>
    <path d="M39.6 47 L45 70" stroke="#fff" stroke-width="1" opacity=".4" stroke-linecap="round"/>
  </g>
  <path d="${ROSETTE_EDGE}" style="fill:${c}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="${ROSETTE_PLEATS}" stroke="${INK}" stroke-width=".8" opacity=".45"/>
  <circle cx="30" cy="30" r="12.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
  <circle cx="30" cy="30" r="10" fill="none" stroke="${INK}" stroke-width=".8"/>
  <text x="30" y="37" text-anchor="middle" style="font:800 19px var(--font-display)" fill="${INK}">1</text>
</svg>`;

// Staffelei mit Leinwand (die Kritzelei zeichnet sich immer wieder ein), Palette und Pinsel
const EASEL = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M48 10 L52 10 L63 93 L58.5 93 Z" fill="${WOOD_D}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">
    <path d="M46.5 5 L51 5 L27.5 96 L22.5 96 Z" fill="${WOOD}"/>
    <path d="M49 5 L53.5 5 L77.5 96 L72.5 96 Z" fill="${WOOD}"/>
    <rect x="47.5" y="2" width="5" height="16" rx="1" fill="${WOOD}"/>
  </g>
  <g stroke="${INK}" stroke-linejoin="round">
    <rect x="24" y="16" width="52" height="47" fill="#fff" stroke-width="1.8"/>
    <path d="M27 19 V60" stroke-width=".7" opacity=".3"/>
    <rect x="44.5" y="12" width="11" height="6.5" rx="1" fill="${WOOD_D}" stroke-width="1.4"/>
    <circle class="kk-sun" cx="62" cy="27" r="4.5" fill="#d33a2c" stroke-width="1.3"/>
    <path class="kk-doodle" pathLength="1" d="M32 52 C 35 38, 43 31, 49 37 C 54 42, 48 49, 44 45 C 40 41, 49 28, 59 31 C 66 33, 67 43, 62 52" fill="none" stroke-width="2.2" stroke-linecap="round"/>
  </g>
  <g stroke="${INK}" stroke-linejoin="round">
    <rect x="19" y="63" width="62" height="5.5" rx="1" fill="${WOOD}" stroke-width="1.6"/>
    <path d="M23 65.7 H77" stroke-width=".7" opacity=".4"/>
  </g>
  <g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">
    <path d="M64 80 C 68 72, 86 71, 92 78 C 96 83, 94 90, 88 91 C 84 91.5, 84 87, 80 88 C 76 89, 77 94, 72 94 C 64 94, 60 86, 64 80 Z" fill="${WOOD}"/>
    <ellipse cx="71.5" cy="87" rx="2.3" ry="1.9" fill="#fff" stroke-width="1.2"/>
    <circle cx="70.5" cy="80" r="2.4" fill="#d33a2c" stroke-width="1"/>
    <circle cx="78.2" cy="77.2" r="2.4" fill="#f2c230" stroke-width="1"/>
    <circle cx="85.8" cy="78.4" r="2.4" fill="#2f6fb3" stroke-width="1"/>
    <circle cx="89.4" cy="84.6" r="2.2" fill="#2e8b4e" stroke-width="1"/>
  </g>
  <g class="kk-brush" stroke="${INK}" stroke-linejoin="round" stroke-width="1.2">
    <path d="M96.5 70.5 L83.2 84.6 L81.6 83.1 L95 69 Z" fill="#8a5a2e"/>
    <path d="M83.2 84.6 L80.4 87.6 L78.6 85.9 L81.6 83.1 Z" fill="#bdbdbd"/>
    <path d="M80.4 87.6 C 78.6 90, 76.4 91.6, 74.6 92.4 C 75.2 90.4, 76.6 88, 78.6 85.9 Z" fill="#2f6fb3"/>
  </g>
</svg>`;

const CHECK = '<svg class="kk-check" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M4 10.5 L8.5 15 L16 5"/></svg>';
// Aufhänger über einem Bild an der Wand: Nagel und Schnur
const HANGER = `<svg class="kk-hanger" viewBox="0 0 100 16" aria-hidden="true">
  <path d="M14 16 L50 3.5 L86 16" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" ${NS}/>
  <circle cx="50" cy="3.5" r="2.6" fill="#bdbdbd" stroke="${INK}" stroke-width="1.2" ${NS}/>
</svg>`;
const TILT = [-1.4, 1.1, -0.6, 1.5, -1, 0.7];

// --- Hilfen ---

const fmt = (ms) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const shownHtml = new WeakMap();
// HTML nur setzen, wenn es sich geändert hat (Knöpfe bleiben unter dem Finger)
function put(el, html) {
  if (!el || shownHtml.get(el) === html) return false;
  shownHtml.set(el, html);
  el.innerHTML = html;
  return true;
}
const setText = (el, text) => {
  if (el && el.textContent !== text) el.textContent = text;
};
const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;
const who = (game, id, self = 'du') => (id === game.me ? self : game.esc(game.name(id)));

// Zahl hochzählen (Punkte), an das Abbruch-Signal gebunden
function countUp(el, from, to, delay, signal) {
  if (!el) return;
  el.textContent = String(from);
  const t0 = performance.now() + delay;
  const step = (t) => {
    if (signal.aborted || !el.isConnected) return;
    const k = Math.min(1, Math.max(0, (t - t0) / 650));
    el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Wann bei der Auflösung die Summe steht (ms): Tafeln drehen sich nacheinander um, dann zählt sie hoch
const FLIP_AT = 250;
const FLIP_STEP = 160;
const FLIP_TIME = 460;
const sumAt = (raters) => FLIP_AT + (raters - 1) * FLIP_STEP + FLIP_TIME;

// --- Zustand im Browser (überlebt neues Zeichnen) ---

const ui = new WeakMap();

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, key: null, stage: null, tool: 'stift', color: 1, size: 1, idea: 0, lastRefresh: 0, totals: null };
    reset(u);
    ui.set(el, u);
    game.signal.addEventListener('abort', () => u.stage?.abort());
  }
  return u;
}

// Alles, was nur für eine Ansicht gilt
function reset(u) {
  clearTimeout(u.saveTimer);
  clearTimeout(u.retry);
  Object.assign(u, {
    update: null,
    board: null,
    raster: null,
    model: null,
    pending: [], // eigene Zeichenbefehle, die der Server noch nicht hat
    sending: false,
    lastSave: 0,
    saveTimer: null,
    retry: null,
    finishing: false, // Zeit um oder „Fertig“: der Rest geht mit „fertig“ an den Server
    stroke: null,
    pointer: null,
    fillAt: null,
    full: false,
    tickClock: null,
    countShown: null,
    rate: null,
    myPick: null, // getippte Note, bis der Server sie bestätigt
  });
}

function refreshSoon(u) {
  if (Date.now() - u.lastRefresh < 2000) return;
  u.lastRefresh = Date.now();
  u.game.refresh();
}

function viewKey(s, me) {
  if (s.result) return 'ende';
  if (s.phase === 'wort') return `${s.round}:wort:${s.words[me] ? 1 : 0}`;
  if (s.phase === 'malen') {
    const e = s.draw[me];
    return `${s.round}:malen:${e.done ? 'fertig' : e.at ? 'malen' : 'los'}`;
  }
  return `${s.round}:bewerten`;
}

export function render(el, s, game) {
  const u = local(el, game);
  u.s = s;
  u.game = game;

  let root = el.querySelector(':scope > .kk');
  if (!root) {
    el.innerHTML = '<div class="kk"><div class="kk-head"></div><div class="kk-stage"></div></div>';
    root = el.firstElementChild;
  }
  root.dataset.phase = s.result ? 'ende' : s.phase;
  renderHead(root.querySelector('.kk-head'), s, game, u);

  const key = viewKey(s, game.me);
  if (u.key !== key) {
    // Kommt die Ansicht von der Malfläche, schrumpft das Bild in seinen Rahmen.
    const from = u.board && !game.reducedMotion ? u.board.paper.getBoundingClientRect() : null;
    u.stage?.abort();
    u.stage = new AbortController();
    u.key = key;
    reset(u);
    const stage = root.querySelector('.kk-stage');
    if (s.result) renderEnd(stage, s, game, u);
    else if (s.phase === 'wort') renderWord(stage, s, game, u);
    else if (s.phase === 'bewerten') renderRate(stage, s, game, u);
    else {
      const e = s.draw[game.me];
      if (e.done) renderDone(stage, s, game, u, from);
      else if (e.at) renderBoard(stage, s, game, u);
      else renderIntro(stage, s, game, u);
    }
  }
  u.update?.();
}

// --- Oben: Runden und Punkte ---

function renderHead(box, s, game, u) {
  const rounds = Array.from({ length: s.rounds }, (_, i) => {
    const state = i < s.round ? 'done' : i === s.round ? 'now' : 'next';
    return `<li class="is-${state}" style="--i:${i}"></li>`;
  }).join('');
  const score = s.players
    .map(
      (p) => `<li style="--c:${game.color(p.id)}">${marker(game, p.id)}<span class="kk-pts-name">${game.esc(game.name(p.id))}</span>
        <b class="kk-pts-num" data-id="${game.esc(p.id)}">${s.totals[p.id]}</b></li>`,
    )
    .join('');
  const label = `Runde ${zahl(Math.min(s.round, s.rounds - 1) + 1)} von ${zahl(s.rounds)}`;
  put(
    box,
    `<div class="kk-track"><ol class="kk-rounds" aria-label="${label}">${rounds}</ol><p class="kk-track-cap">${label}.</p></div>
     <ol class="kk-pts ${s.players.length > 2 ? 'many' : ''}" aria-label="Punkte">${score}</ol>`,
  );
  if (game.first) box.querySelector('.kk-rounds').classList.add('intro');

  // Neue Punkte zählen hoch, bei einer Auflösung erst, wenn die Summe dort steht
  const old = u.totals;
  u.totals = { ...s.totals };
  if (!old || game.reducedMotion) return;
  const fresh = s.phase === 'bewerten' && s.shown && !game.prev?.shown;
  const delay = fresh ? sumAt(s.players.length - 1) + 650 : 0;
  for (const p of s.players) {
    const from = old[p.id] ?? 0;
    const to = s.totals[p.id];
    if (from === to) continue;
    const num = box.querySelector(`.kk-pts-num[data-id="${CSS.escape(p.id)}"]`);
    if (!num) continue;
    countUp(num, from, to, delay, game.signal);
    const plus = document.createElement('i');
    plus.className = 'kk-plus';
    plus.textContent = `+${to - from}`;
    plus.style.animationDelay = `${delay}ms`;
    num.before(plus);
    plus.addEventListener('animationend', () => plus.remove());
  }
}

// Wer schon vorgeschlagen hat bzw. wie weit die anderen mit dem Malen sind
function chipsHtml(s, game, othersOnly = false) {
  const prev = game.prev;
  return s.players
    .filter((p) => !othersOnly || p.id !== game.me)
    .map((p) => {
      let done;
      let fresh;
      let label = '';
      if (s.phase === 'wort') {
        done = s.sent.includes(p.id);
        fresh = done && prev?.phase === 'wort' && prev.round === s.round && !prev.sent?.includes(p.id);
        if (!done) label = 'überlegt';
      } else {
        const e = s.draw[p.id];
        done = e.done;
        fresh = done && prev?.phase === 'malen' && !prev.draw?.[p.id]?.done;
        if (!done) label = e.at ? 'malt' : 'noch nicht angefangen';
      }
      return `<li class="kk-chip ${done ? 'is-done' : ''} ${fresh ? 'fresh' : ''}">${marker(game, p.id)}
        <span class="kk-chip-name">${game.esc(game.name(p.id))}</span>${done ? `${CHECK}<span class="kk-sr">fertig</span>` : ` <small>${label}</small>`}</li>`;
    })
    .join('');
}

// --- Wort vorschlagen (mit Rückschau auf die letzte Runde) ---

function rulesHtml(s) {
  const two = s.players.length === 2;
  return `<ol class="kk-rules">
    <li>Jeder schlägt geheim ein Wort vor. Das Los zieht einen Vorschlag, und alle malen ihn. Reihum kommt jeder einmal dran, bevor jemand zum zweiten Mal gezogen wird.</li>
    <li>Ab deinem Tipp auf Los hast du ${TIME_WORDS[s.zeit]}.</li>
    <li>${two ? 'Danach bewertet jeder das Bild des anderen' : 'Danach bewertet ihr Bild für Bild, ohne zu wissen, von wem es ist'}, mit einer Note von eins bis zehn.</li>
    <li>${s.rounds === 1 ? 'Wer die meisten Punkte bekommt, gewinnt.' : `Nach ${zahl(s.rounds)} Runden gewinnt, wer insgesamt die meisten Punkte hat.`}</li>
  </ol>`;
}

// Bilder einer Runde, beste zuerst (bei gleicher Summe in der Reihenfolge der Bewertung)
const ranked = (pics) => [...pics].sort((a, b) => b.sum - a.sum);

// zoom: Die Rahmen sind Knöpfe für die Großansicht (nur am Ende); data-i zählt über alle Wände.
function wallHtml(pics, game, offset = 0, zoom = false) {
  const best = pics[0]?.sum;
  return `<ol class="kk-wall">${pics
    .map((p, i) => {
      const top = pics.length > 1 && p.sum === best;
      const label = `Bild von ${who(game, p.by, 'dir')}, ${points(p.sum)}`;
      const inner = `<canvas width="500" height="500" ${zoom ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`}></canvas>${FRAME}
          ${top ? `<span class="kk-rosette">${rosette(game.color(p.by))}</span>` : ''}`;
      return `<li class="kk-piece kk-small" style="--i:${offset + i};--tilt:${TILT[(offset + i) % TILT.length]}deg;--c:${game.color(p.by)}">
        ${HANGER}
        ${zoom ? `<button type="button" class="kk-frame kk-zoom" data-i="${offset + i}" aria-label="${label}. Groß ansehen.">${inner}</button>` : `<div class="kk-frame">${inner}</div>`}
        <p class="kk-piece-cap">${marker(game, p.by)}<span class="kk-piece-name">${game.esc(game.name(p.by))}</span><b class="kk-piece-sum">${p.sum}</b></p>
      </li>`;
    })
    .join('')}</ol>`;
}

// Bilder nacheinander malen, damit die Seite dabei nicht stockt
function paintWall(box, pics, signal) {
  const canvases = [...box.querySelectorAll('.kk-small canvas')];
  let i = 0;
  const next = () => {
    if (signal.aborted || i >= canvases.length) return;
    drawPicture(canvases[i], pics[i].ops);
    i++;
    setTimeout(next, 0);
  };
  next();
}

function blankText(game, blank) {
  if (!blank.length) return '';
  if (blank.length === 1 && blank[0] === game.me) return 'Du hast nichts gemalt.';
  return `${cap(list(blank.map((id) => who(game, id))))} ${blank.length === 1 ? 'hat' : 'haben'} nichts gemalt.`;
}
const fromText = (game, by) => (by.length ? `Vorschlag von ${list(by.map((id) => who(game, id, 'dir')))}` : '');

function recapHtml(s, game) {
  const r = s.past[s.past.length - 1];
  const blank = blankText(game, r.blank);
  return `<section class="kk-recap" aria-label="Rückschau">
    <h3 class="kk-h">Runde ${zahl(s.past.length)}: „${game.esc(r.word)}“</h3>
    <p class="muted kk-sub">${fromText(game, r.by)}.</p>
    ${r.pics.length ? wallHtml(ranked(r.pics), game) : ''}
    ${blank ? `<p class="muted kk-blank">${blank}</p>` : ''}
  </section>`;
}

function renderWord(stage, s, game, u) {
  const signal = u.stage.signal;
  const mine = s.words[game.me];
  const body = mine
    ? `<div class="kk-wait">
        <div class="kk-easel">${EASEL}</div>
        <div class="kk-wait-text">
          <p class="label">Dein Vorschlag</p>
          <p class="kk-myword">„${game.esc(mine)}“</p>
          <p class="status kk-wait-status"></p>
          <button type="button" class="link" data-action="wort-aendern">Ändern</button>
        </div>
      </div>`
    : `<form class="kk-wordform" autocomplete="off">
        <label for="kk-word-in">Dein Vorschlag</label>
        <div class="row nowrap">
          <input id="kk-word-in" name="wort" maxlength="${MAX_WORD}" autocomplete="off" spellcheck="false" enterkeyhint="done">
          <button class="btn kk-idea" type="button">Idee</button>
        </div>
        <p class="field-hint muted">Geheim. Das Los zieht reihum, jeder kommt einmal dran.</p>
        <div class="row"><button class="btn primary" type="submit">Vorschlagen</button></div>
      </form>`;
  stage.innerHTML = `<div class="kk-word-phase">
      ${s.past.length ? recapHtml(s, game) : rulesHtml(s)}
      ${body}
      <ul class="kk-chips" aria-label="Vorschläge"></ul>
    </div>`;
  if (s.past.length) paintWall(stage, ranked(s.past[s.past.length - 1].pics), signal);

  u.update = () => {
    const st = u.s;
    put(stage.querySelector('.kk-chips'), chipsHtml(st, game));
    const open = st.players.filter((p) => !st.sent.includes(p.id)).map((p) => game.name(p.id));
    setText(stage.querySelector('.kk-wait-status'), open.length ? `Warte auf ${list(open)}.` : '');
  };
  if (mine) return;

  const form = stage.querySelector('.kk-wordform');
  const input = form.querySelector('input');
  form.querySelector('.kk-idea').addEventListener(
    'click',
    () => {
      const ideas = u.s.suggestions ?? [];
      if (!ideas.length) return;
      input.value = ideas[u.idea++ % ideas.length];
      if (!game.reducedMotion) {
        input.animate([{ transform: 'translateY(3px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
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

// --- Malen: erst „Los“, dann die Malfläche, danach warten ---

function renderIntro(stage, s, game, u) {
  stage.innerHTML = `<div class="kk-col"><div class="kk-intro">
      <div class="kk-easel">${EASEL}</div>
      <div class="kk-intro-text">
        <p class="kk-big">Das Wort steht fest.</p>
        <p>Du hast ${TIME_WORDS[s.zeit]}. Die Zeit läuft ab deinem Tipp auf Los.</p>
        <div class="row"><button type="button" class="btn primary kk-go" data-action="los">Los</button></div>
      </div>
    </div>
    <ul class="kk-chips" aria-label="Wie weit die anderen sind"></ul></div>`;
  u.update = () => put(stage.querySelector('.kk-chips'), chipsHtml(u.s, game, true));
}

function toolsHtml() {
  const crayons = PAINTS.slice(1)
    .map(
      (p, i) =>
        `<button type="button" class="kk-crayon" data-color="${i + 1}" aria-label="${p.name}" title="${p.name}" aria-pressed="false" style="--i:${i}">${pencilSvg(p.facets)}</button>`,
    )
    .join('');
  const tools = [
    ['stift', 'Stift'],
    ['eimer', 'Eimer: Fläche füllen'],
    ['radierer', 'Radierer'],
  ]
    .map(
      ([id, label], i) =>
        `<button type="button" class="kk-tool" data-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="false" style="--i:${i}">${ICON[id]}</button>`,
    )
    .join('');
  const sizes = ['Dünn', 'Mittel', 'Dick']
    .map(
      (label, i) =>
        `<button type="button" class="kk-tool kk-size" data-size="${i}" aria-label="${label}" title="${label}" aria-pressed="false" style="--i:${i + 3}"><i style="--d:${[5, 10, 18][i]}px"></i></button>`,
    )
    .join('');
  return `<div class="kk-tools">
    <div class="kk-crayons" role="group" aria-label="Farbe">${crayons}</div>
    <div class="kk-toolrow">
      <div class="kk-seg" role="group" aria-label="Werkzeug">${tools}</div>
      <div class="kk-seg" role="group" aria-label="Dicke">${sizes}</div>
    </div>
    <div class="kk-toolrow kk-cmds">
      <button type="button" class="btn kk-cmd" data-cmd="u" aria-label="Zurück">${ICON.zurueck}<span>Zurück</span></button>
      <button type="button" class="btn kk-cmd" data-cmd="r" aria-label="Vor">${ICON.vor}<span>Vor</span></button>
      <button type="button" class="btn kk-cmd" data-cmd="c">${ICON.leeren}<span>Alles löschen</span></button>
    </div>
  </div>`;
}

function renderBoard(stage, s, game, u) {
  const signal = u.stage.signal;
  const letters = [...s.word];
  const word = letters.map((ch, k) => (ch === ' ' ? '<span class="kk-gap"></span>' : `<span style="--k:${k}">${game.esc(ch)}</span>`)).join('');
  stage.innerHTML = `
    <div class="kk-board">
      <div class="kk-wordline">
        <div class="kk-wordbox"><p class="kk-word" style="--n:${letters.length}" role="img" aria-label="Das Wort: ${game.esc(s.word)}">${word}</p></div>
        <div class="kk-clock"><span class="kk-clock-num"></span></div>
      </div>
      <div class="kk-bar"><i></i></div>
      <div class="kk-paper">
        <canvas class="kk-canvas" width="${S}" height="${S}" role="img" aria-label="Malfläche"></canvas>
        <div class="kk-fx" aria-hidden="true"></div>
        <div class="kk-cursor" hidden></div>
        <svg class="kk-sheet" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect pathLength="1" x=".4" y=".4" width="99.2" height="99.2"/></svg>
        <div class="kk-count" aria-live="assertive"></div>
      </div>
      ${toolsHtml()}
      <div class="kk-finish">
        <button type="button" class="btn kk-done">Fertig</button>
        <p class="status kk-note" aria-live="polite"></p>
      </div>
      <ul class="kk-chips" aria-label="Wie weit die anderen sind"></ul>
    </div>`;

  const board = stage.firstElementChild;
  const canvas = board.querySelector('.kk-canvas');
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
    paper: board.querySelector('.kk-paper'),
    canvas,
    fx: board.querySelector('.kk-fx'),
    cursor: board.querySelector('.kk-cursor'),
    note: board.querySelector('.kk-note'),
    count: board.querySelector('.kk-count'),
    clock: board.querySelector('.kk-clock'),
    num: board.querySelector('.kk-clock-num'),
    bar: board.querySelector('.kk-bar i'),
    done: board.querySelector('.kk-done'),
    chips: board.querySelector('.kk-chips'),
  };
  bindTools(u, signal);
  bindDrawing(u, signal);
  bindDone(u, signal);
  syncTools(u);
  startClock(u, signal);
  u.update = () => updateBoard(u);

  // Malfläche und Werkzeuge ganz ins Bild holen
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    const top = board.querySelector('.kk-wordline').getBoundingClientRect().top;
    const bottom = board.querySelector('.kk-finish').getBoundingClientRect().bottom;
    const free = innerHeight - 64; // unten rechts schwebt der Reaktionsknopf der Plattform
    let dy = 0;
    if (top < 0 || bottom - top > free - 16) dy = top - 8;
    else if (bottom > free) dy = bottom - free + 8;
    if (dy) window.scrollBy({ top: dy, behavior: game.reducedMotion ? 'auto' : 'smooth' });
  });
}

const mineOf = (u) => u.s.draw?.[u.game.me];

function updateBoard(u) {
  const e = mineOf(u);
  if (!e || !u.board) return;
  u.pending = u.pending.filter((c) => c.s > e.d.seq);
  if (u.pending.length || u.finishing) flushQueue(u);
  updateDrawing(u);
  renderNote(u);
  put(u.board.chips, chipsHtml(u.s, u.game, true));
  u.tickClock?.();
}

// Was zu sehen sein soll: gespeicherter Stand plus eigene, noch nicht gespeicherte Befehle
function currentModel(u) {
  const d = mineOf(u).d;
  const m = { ops: d.ops, n: d.n, seq: d.seq };
  for (const cmd of u.pending) {
    if (cmd.s <= m.seq) continue;
    if (!applyCmd(m, cmd)) break;
  }
  return m;
}

function updateDrawing(u) {
  if (!u.raster) return;
  const m = currentModel(u);
  u.model = m;
  syncRaster(u.raster, m.ops.slice(0, m.n), u.stroke);
  if (!u.paintQueued) {
    u.paintQueued = true;
    requestAnimationFrame(() => {
      u.paintQueued = false;
      paint(u);
    });
  }
  if (!u.stroke) syncCmds(u);
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

function renderNote(u) {
  const e = mineOf(u);
  if (!e || !u.board) return;
  const now = u.game.now();
  let text = '';
  if (u.finishing) text = now >= e.end ? 'Die Zeit ist um. Dein Bild wird aufgehängt.' : 'Dein Bild wird aufgehängt.';
  else if (u.full) text = 'Das Bild ist voll. Nimm etwas zurück oder lösche alles.';
  else if (now < e.at + COUNTDOWN) text = 'Gleich geht es los.';
  setText(u.board.note, text);
}

// Uhr: drei Sekunden Vorlauf, dann die Malzeit. Bei null wird automatisch abgegeben.
function startClock(u, signal) {
  const { num, bar, clock } = u.board;
  const tick = () => {
    const { s, game } = u;
    const e = mineOf(u);
    if (!e?.at || !u.board) return;
    const now = game.now();
    const total = s.zeit * 1000;
    const left = Math.max(0, Math.min(total, e.end - now));
    const text = fmt(left);
    const low = left < 10_500;
    if (num.textContent !== text) {
      const first = !num.textContent;
      num.textContent = text;
      if (low && left > 0 && !first && !game.reducedMotion) {
        num.animate([{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    bar.style.transform = `scaleX(${left / total})`;
    clock.classList.toggle('low', low);
    bar.parentElement.classList.toggle('low', low);
    showCount(u, Math.ceil((e.at + COUNTDOWN - now) / 1000));
    if (now >= e.end && !u.finishing) finishDrawing(u);
    if (u.finishing && now >= e.end + GRACE + 600) refreshSoon(u);
    renderNote(u);
  };
  u.tickClock = tick;
  const timer = setInterval(tick, 100);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// Drei, zwei, eins über der Malfläche
function showCount(u, n) {
  const v = Math.max(0, n);
  // nur abwärts: die geschätzte Serverzeit springt mit jeder Antwort ein wenig
  if (u.countShown === v || (u.countShown !== null && v > u.countShown)) return;
  u.countShown = v;
  u.board.el.classList.toggle('is-waiting', v > 0);
  if (!v) {
    u.board.count.replaceChildren();
    return;
  }
  const span = document.createElement('span');
  span.className = 'kk-count-n';
  span.textContent = String(v);
  u.board.count.replaceChildren(span);
}

function finishDrawing(u) {
  if (u.finishing || !u.board) return;
  endStroke(u);
  u.finishing = true;
  u.board.el.classList.add('is-finished');
  u.board.done.disabled = true;
  if (u.board.cursor) u.board.cursor.hidden = true;
  flushQueue(u);
  renderNote(u);
}

// „Fertig“ in zwei Schritten, damit es nicht aus Versehen passiert
function bindDone(u, signal) {
  const btn = u.board.done;
  let armed = null;
  btn.addEventListener(
    'click',
    () => {
      if (u.finishing) return;
      if (armed) {
        clearTimeout(armed);
        armed = null;
        finishDrawing(u);
        return;
      }
      btn.textContent = 'Sicher? Nochmal tippen.';
      armed = setTimeout(() => {
        armed = null;
        btn.textContent = 'Fertig';
      }, 4000);
    },
    { signal },
  );
  signal.addEventListener('abort', () => clearTimeout(armed));
}

// --- Werkzeuge ---

function bindTools(u, signal) {
  u.board.el.querySelector('.kk-tools').addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('button');
      if (!b || u.finishing) return;
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
  el.style.setProperty('--kk-cur', PAINTS[u.color].paint);
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
  if (!m || !canDraw(u)) return;
  if (t === 'u' && !m.n) return;
  if (t === 'r' && m.n >= m.ops.length) return;
  if (t === 'c') {
    if (!m.n || m.ops[m.n - 1].t === 'c') return;
    tearFx(u);
  }
  issue(u, { t });
}

const nextSeq = (u) => Math.max(mineOf(u).d.seq, u.pending[u.pending.length - 1]?.s ?? 0, u.stroke?.s ?? 0) + 1;

// Neuer eigener Befehl: sofort zeigen, dann (gesammelt) speichern
function issue(u, cmd) {
  if (cmd.s === undefined) cmd.s = nextSeq(u);
  u.full = applyCmd(currentModel(u), cmd) === 'voll';
  u.pending.push(cmd);
  updateDrawing(u);
  renderNote(u);
  flushQueue(u);
}

// Immer nur eine Anfrage unterwegs (sonst kommen Befehle in falscher Reihenfolge an), höchstens alle
// SAVE_EVERY ms, außer zum Schluss. Was der Server schon hat (laut Stand), fällt in updateBoard heraus.
const SAVE_EVERY = 2000;

async function flushQueue(u) {
  if (u.sending || !u.raster) return;
  const e = mineOf(u);
  if (!e || e.done) return;
  const left = u.pending.filter((c) => c.s > e.d.seq);
  if (!left.length && !u.finishing) return;
  const wait = u.lastSave + SAVE_EVERY - Date.now();
  if (!u.finishing && wait > 0) {
    if (!u.saveTimer) {
      u.saveTimer = setTimeout(() => {
        u.saveTimer = null;
        flushQueue(u);
      }, wait);
    }
    return;
  }
  clearTimeout(u.saveTimer);
  u.saveTimer = null;
  const batch = left.slice(0, 150);
  const fertig = u.finishing && batch.length === left.length;
  const signal = u.stage.signal;
  u.sending = true;
  u.lastSave = Date.now();
  const ok = await u.game.send('malen', fertig ? { cmds: batch, fertig: true } : { cmds: batch });
  if (signal.aborted) return;
  u.sending = false;
  // Danach weiter (der neue Stand ist vielleicht noch nicht gezeichnet), nach einem Fehler etwas später
  clearTimeout(u.retry);
  u.retry = setTimeout(() => !signal.aborted && flushQueue(u), ok && !u.finishing ? 50 : 900);
}

// --- Finger, Stift oder Maus auf der Malfläche ---

function canDraw(u) {
  const e = mineOf(u);
  const now = u.game.now();
  return u.s.phase === 'malen' && !u.s.result && e && !e.done && !u.finishing && now >= e.at + COUNTDOWN && now < e.end;
}

function bindDrawing(u, signal) {
  const { canvas } = u.board;
  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const fit = (v) => Math.min(S - 1, Math.max(0, Math.floor(v)));
    return [fit(((e.clientX - rect.left) / rect.width) * S), fit(((e.clientY - rect.top) / rect.height) * S)];
  };
  const opts = { signal };

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (u.pointer !== null || !canDraw(u) || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
      if (added) updateDrawing(u);
    },
    opts,
  );
  const end = (e) => {
    if (e.pointerId !== u.pointer) return;
    u.pointer = null;
    if (u.fillAt) {
      const p = u.fillAt;
      u.fillAt = null;
      if (e.type === 'pointerup' && canDraw(u)) fillAt(u, p);
    } else endStroke(u);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, end, opts);
  canvas.addEventListener('pointerleave', () => u.board?.cursor && (u.board.cursor.hidden = true), opts);
  // iOS: die Seite nicht verschieben oder vergrößern, solange auf der Malfläche gemalt werden kann
  const hold = (e) => mineOf(u) && !u.finishing && e.cancelable && e.preventDefault();
  canvas.addEventListener('touchstart', hold, { signal, passive: false });
  canvas.addEventListener('touchmove', hold, { signal, passive: false });
}

function moveCursor(u, e) {
  const cur = u.board?.cursor;
  if (!cur) return;
  if (u.tool === 'eimer' || u.finishing) {
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
  u.stroke = { s: nextSeq(u), c: u.tool === 'radierer' ? 0 : u.color, w: u.size, pts: [p] };
  updateDrawing(u);
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
  issue(u, { s: st.s, t: 's', c: st.c, w: st.w, p: encodePoints(st.pts) });
}

function fillAt(u, [x, y]) {
  if (u.raster.buf[y * S + x] === u.color) return;
  rippleFx(u, x, y, u.color);
  issue(u, { t: 'f', c: u.color, x, y });
}

// Eimer: ein Ring in der Farbe läuft vom Klick aus auseinander
function rippleFx(u, x, y, c) {
  if (u.game.reducedMotion || !u.board) return;
  const ring = document.createElement('i');
  ring.className = 'kk-ripple';
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
  sheet.className = 'kk-torn';
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

// --- Abgegeben: das eigene Bild hängt, die anderen malen noch ---

function renderDone(stage, s, game, u, from) {
  const signal = u.stage.signal;
  const ops = finalOps(s.draw[game.me].d);
  stage.innerHTML = `<div class="kk-col"><div class="kk-donebox">
      <figure class="kk-piece kk-mine">
        <div class="kk-frame"><canvas width="500" height="500" role="img" aria-label="Dein Bild"></canvas>${FRAME}</div>
      </figure>
      <div class="kk-done-text">
        <p class="kk-big">${ops.length ? 'Dein Bild hängt.' : 'Dein Blatt ist leer geblieben.'}</p>
        <p class="status kk-done-status"></p>
      </div>
    </div>
    <ul class="kk-chips" aria-label="Wie weit die anderen sind"></ul></div>`;
  const frame = stage.querySelector('.kk-frame');
  drawPicture(frame.querySelector('canvas'), ops);

  // FLIP: Die Malfläche wird zum Bild im Rahmen (die Leinwand liegt bei 7 % bis 93 % des Rahmens).
  const to = frame.getBoundingClientRect();
  if (from && to.width && !game.reducedMotion) {
    const k = from.width / (to.width * 0.86);
    const dx = from.left - to.left - 0.07 * to.width * k;
    const dy = from.top - to.top - 0.07 * to.height * k;
    frame.style.transformOrigin = '0 0';
    frame.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }], {
      duration: 520,
      easing: 'cubic-bezier(.6,0,.2,1)',
    });
    frame.querySelector('.kk-frame-svg').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 160, easing: 'ease-out', fill: 'backwards' });
  }

  u.update = () => {
    const st = u.s;
    const open = st.players.filter((p) => !st.draw[p.id].done).map((p) => game.name(p.id));
    setText(stage.querySelector('.kk-done-status'), open.length ? `Warte auf ${list(open)}.` : 'Gleich wird bewertet.');
    put(stage.querySelector('.kk-chips'), chipsHtml(st, game, true));
  };
  // Ist bei allen die Zeit um, fragt der Browser nach (tick schaltet dann zum Bewerten).
  const timer = setInterval(() => {
    const st = u.s;
    const now = game.now();
    if (st.phase === 'malen' && Object.values(st.draw).every((e) => e.done || (e.end && now >= e.end + GRACE + 300))) refreshSoon(u);
  }, 500);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// --- Bewerten: Bild für Bild ---

function renderRate(stage, s, game, u) {
  stage.innerHTML = `<div class="kk-rate">
      <div class="kk-progress"><span class="kk-progress-text"></span><ol class="kk-dots" aria-hidden="true"></ol></div>
      <div class="kk-hang"></div>
      <div class="kk-judges" aria-hidden="true"></div>
      <div class="kk-panel"></div>
    </div>`;
  const el = stage.firstElementChild;
  u.rate = {
    el,
    hang: el.querySelector('.kk-hang'),
    judges: el.querySelector('.kk-judges'),
    panel: el.querySelector('.kk-panel'),
    progress: el.querySelector('.kk-progress-text'),
    dots: el.querySelector('.kk-dots'),
    piece: null,
    sub: null,
  };
  u.update = () => updateRate(u);
  const signal = u.stage.signal;
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.45) window.scrollBy({ top: top - 12, behavior: game.reducedMotion ? 'auto' : 'smooth' });
  });
}

function updateRate(u) {
  const { s, game } = u;
  const R = u.rate;
  const pic = s.pics[s.index];
  if (!pic || !R) return;
  const sub = `${s.index}:${s.shown ? 1 : 0}`;
  if (R.sub !== sub) {
    const newPic = !R.sub || Number(R.sub.split(':')[0]) !== s.index;
    if (newPic) {
      u.myPick = null;
      hangPiece(u, pic, Boolean(R.sub));
      R.judges.innerHTML = Array.from({ length: s.players.length - 1 }, (_, k) => judgeHtml(k)).join('');
    }
    R.el.classList.toggle('is-shown', Boolean(s.shown));
    R.el.classList.toggle('is-mine', pic.by === game.me);
    if (s.shown) revealPiece(u, pic, !newPic);
    R.panel.innerHTML = panelHtml(u, pic);
    bindPanel(u);
    R.sub = sub;
  }

  put(R.progress, `Bild ${zahl(s.index + 1)} von ${zahl(s.pics.length)}`);
  put(
    R.dots,
    s.pics
      .map((p, i) => {
        const open = i < s.index || (i === s.index && s.shown);
        return `<li class="${i < s.index ? 'done' : i === s.index ? 'now' : ''}" style="--c:${open ? game.color(p.by) : 'var(--ink)'}"></li>`;
      })
      .join(''),
  );

  if (s.shown) {
    const btn = R.panel.querySelector('.kk-next');
    if (btn && s.ready.includes(game.me) && !btn.disabled) {
      btn.disabled = true;
      btn.textContent = 'Gleich geht es weiter.';
    }
    return;
  }
  const count = pic.count ?? 0;
  R.judges.querySelectorAll('.kk-judge').forEach((j, k) => j.classList.toggle('up', k < count));
  if (u.myPick && pic.votes?.[game.me] === u.myPick.n) u.myPick = null;
  const mine = u.myPick?.n ?? pic.votes?.[game.me] ?? null;
  R.panel.querySelectorAll('.kk-score').forEach((b) => {
    const on = Number(b.dataset.n) === mine;
    b.classList.toggle('picked', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const n = s.players.length - 1;
  let text = '';
  if (n > 1) {
    text = count === 0 ? 'Noch keine Note.' : count === 1 ? `Eine von ${zahl(n)} Noten ist da.` : `${cap(zahl(count))} von ${zahl(n)} Noten sind da.`;
    if (mine && pic.by !== game.me) text += ' Ändern geht, bis alle bewertet haben.';
  }
  setText(R.panel.querySelector('.kk-count-text'), text);
}

// Neues Bild an die Wand: das alte gleitet hinaus, das neue herein
function hangPiece(u, pic, animate) {
  const { s, game } = u;
  const R = u.rate;
  const old = R.piece;
  const fig = document.createElement('figure');
  fig.className = `kk-piece kk-main ${game.reducedMotion ? '' : animate ? 'next' : 'intro'}`;
  fig.innerHTML = `<div class="kk-frame"><canvas width="${S}" height="${S}" role="img" aria-label="Bild ${zahl(s.index + 1)} zu ${game.esc(s.word)}"></canvas>${FRAME}</div>
    <figcaption class="kk-plaque"><span class="kk-plaque-word">„${game.esc(s.word)}“</span><span class="kk-plaque-by">${pic.by === game.me ? 'Dein Bild' : 'Unbekannt'}</span></figcaption>`;
  R.hang.append(fig);
  drawPicture(fig.querySelector('canvas'), pic.ops);
  R.piece = fig;
  if (!old) return;
  if (game.reducedMotion) {
    old.remove();
    return;
  }
  old.classList.remove('intro', 'next');
  old.classList.add('leave');
  const drop = () => old.remove();
  old.addEventListener('animationend', drop, { once: true });
  setTimeout(drop, 900);
}

const judgeHtml = (k, front = '', name = '') => `<div class="kk-judge" style="--i:${k}">
    <div class="kk-card"><div class="kk-card-in">
      <div class="kk-face kk-back">${CARD_BACK}</div>
      <div class="kk-face kk-front">${front}</div>
    </div></div>
    <div class="kk-stick">${HANDLE}</div>
    <span class="kk-judge-name">${name}</span>
  </div>`;

// Auflösung: Tafeln mit Namen und Noten drehen sich nacheinander um, das Schild nennt den Maler
function revealPiece(u, pic, animate) {
  const { s, game } = u;
  const R = u.rate;
  const raters = ratersOf(s, pic);
  const play = animate && !game.reducedMotion;
  R.judges.innerHTML = raters
    .map((id, k) =>
      judgeHtml(
        k,
        `<div class="kk-front-in" style="--c:${game.color(id)}">${CARD_FRONT}<b>${pic.votes[id]}</b></div>`,
        game.esc(game.name(id)),
      ),
    )
    .join('');
  R.judges.setAttribute('aria-hidden', 'false');
  R.judges.setAttribute('aria-label', `Noten: ${raters.map((id) => `${game.name(id)} ${zahl(pic.votes[id])}`).join(', ')}`);
  R.judges.setAttribute('role', 'img');
  const judges = [...R.judges.querySelectorAll('.kk-judge')];
  judges.forEach((j) => j.classList.add('up'));
  R.el.style.setProperty('--sum-delay', `${play ? sumAt(raters.length) : 0}ms`);
  if (play) {
    void R.judges.offsetWidth; // erst zugedeckt zeichnen, dann umdrehen
    judges.forEach((j) => j.classList.add('open'));
  } else judges.forEach((j) => j.classList.add('open', 'instant'));

  const by = R.piece.querySelector('.kk-plaque-by');
  by.innerHTML = `${marker(game, pic.by)} ${pic.by === game.me ? 'Dein Bild' : `von ${game.esc(game.name(pic.by))}`}`;
  by.classList.add('known');
  if (play) by.classList.add('enter');
}

function panelHtml(u, pic) {
  const { s, game } = u;
  if (s.shown) {
    return `<div class="kk-result" style="--c:${game.color(pic.by)}">
      <p class="kk-sum"><b class="kk-sum-num">${pic.sum}</b> <span>${pic.sum === 1 ? 'Punkt' : 'Punkte'} für ${pic.by === game.me ? 'dich' : game.esc(game.name(pic.by))}</span></p>
      <div class="kk-nextrow"><button type="button" class="btn primary kk-next">Weiter</button><span class="kk-auto" aria-hidden="true"><i></i></span></div>
    </div>`;
  }
  if (pic.by === game.me) {
    const others = s.players.filter((p) => p.id !== game.me);
    return `<div class="kk-ask-box">
      <p class="status">${others.length === 1 ? `${game.esc(game.name(others[0].id))} bewertet es.` : 'Die anderen bewerten es, ohne zu wissen, von wem es ist.'}</p>
      <p class="status muted kk-count-text"></p>
    </div>`;
  }
  const scale = Array.from(
    { length: 10 },
    (_, k) => `<button type="button" class="kk-score" data-n="${k + 1}" style="--i:${k}" aria-label="Note ${zahl(k + 1)}" aria-pressed="false">${k + 1}</button>`,
  ).join('');
  return `<div class="kk-ask-box">
    <p class="kk-ask">Deine Note</p>
    <div class="kk-scale ${s.index === 0 ? 'intro' : ''}" style="--c:${game.color(game.me)}">${scale}</div>
    <p class="status muted kk-count-text"></p>
  </div>`;
}

function bindPanel(u) {
  const { game } = u;
  const R = u.rate;
  const signal = u.stage.signal;
  R.panel.querySelector('.kk-scale')?.addEventListener(
    'click',
    async (e) => {
      const b = e.target.closest('.kk-score');
      if (!b) return;
      const i = u.s.index;
      const n = Number(b.dataset.n);
      u.myPick = { i, n };
      updateRate(u);
      const ok = await game.send('bewerten', { i, n });
      if (!ok && !signal.aborted && u.myPick?.i === i && u.myPick.n === n) {
        u.myPick = null;
        updateRate(u);
      }
    },
    { signal },
  );

  const next = R.panel.querySelector('.kk-next');
  if (!next) return;
  next.addEventListener(
    'click',
    () => {
      next.disabled = true;
      next.textContent = 'Gleich geht es weiter.';
      game.send('weiter', { i: u.s.index });
    },
    { signal },
  );
  // Nach REVEAL geht es von selbst weiter: Balken läuft ab, dann fragt der Browser nach.
  const s = u.s;
  const idx = s.index;
  const left = Math.max(0, s.shown + REVEAL - game.now());
  const bar = R.panel.querySelector('.kk-auto i');
  bar.style.transform = `scaleX(${left / REVEAL})`;
  if (!game.reducedMotion) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (signal.aborted) return;
        bar.style.transition = `transform ${left}ms linear`;
        bar.style.transform = 'scaleX(0)';
      }),
    );
  }
  let timer = setTimeout(function again() {
    if (signal.aborted || u.s.index !== idx || !u.s.shown) return;
    refreshSoon(u);
    timer = setTimeout(again, 2000);
  }, left + 300);
  signal.addEventListener('abort', () => clearTimeout(timer));
}

// --- Ende: Plätze und die ganze Ausstellung ---

function renderEnd(stage, s, game, u) {
  const signal = u.stage.signal;
  const play = !game.reducedMotion && !game.prev?.result;
  const t = s.totals;
  const order = [...s.players].sort((a, b) => t[b.id] - t[a.id]);
  const n = order.length;
  let place = 0;
  const rows = order
    .map((p, k) => {
      if (k === 0 || t[p.id] !== t[order[k - 1].id]) place = k + 1;
      const won = s.result.winners.includes(p.id);
      return `<li class="kk-row ${won ? 'won' : ''}" style="--i:${n - 1 - k};--c:${game.color(p.id)}">
        <span class="kk-place">${place}</span>${marker(game, p.id)}
        <span class="kk-row-name">${game.esc(game.name(p.id))}${p.id === game.me ? ' <small>du</small>' : ''}</span>
        ${won ? `<span class="kk-row-rosette">${rosette(game.color(p.id))}</span>` : ''}
        <b class="kk-row-num" data-to="${t[p.id]}">${t[p.id]}</b>
      </li>`;
    })
    .join('');

  let offset = 0;
  const walls = s.past
    .map((r, ri) => {
      const pics = ranked(r.pics);
      const html = `<section class="kk-round-wall">
        <h4 class="kk-h4">„${game.esc(r.word)}“ <small>Runde ${zahl(ri + 1)}, ${fromText(game, r.by)}</small></h4>
        ${pics.length ? wallHtml(pics, game, offset, true) : ''}
        ${r.blank.length ? `<p class="muted kk-blank">${blankText(game, r.blank)}</p>` : ''}
      </section>`;
      offset += pics.length;
      return html;
    })
    .join('');

  const rowsEnd = 250 + n * 140 + 650;
  stage.innerHTML = `<div class="kk-end ${play ? 'play' : ''}" style="--rosette-delay:${rowsEnd}ms;--wall-delay:${rowsEnd + 300}ms;--step:${Math.min(90, Math.round(1200 / Math.max(1, offset)))}ms">
      <section class="kk-final" aria-label="Endstand">
        <h3 class="kk-h">Endstand</h3>
        <ol class="kk-rank">${rows}</ol>
      </section>
      <section class="kk-gallery" aria-label="Alle Bilder">
        <h3 class="kk-h">Die Ausstellung</h3>
        ${walls}
      </section>
    </div>`;

  if (play) {
    stage.querySelectorAll('.kk-row-num').forEach((num) => {
      const i = Number(num.closest('.kk-row').style.getPropertyValue('--i'));
      countUp(num, 0, Number(num.dataset.to), 250 + i * 140 + 200, signal);
    });
  }
  // Alle Bilder nacheinander malen; antippen zeigt eins groß
  const all = s.past.flatMap((r) => ranked(r.pics));
  paintWall(stage.querySelector('.kk-gallery'), all, signal);
  stage.querySelector('.kk-gallery').addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('.kk-zoom');
      if (btn) openZoom(u, all[Number(btn.dataset.i)], btn);
    },
    { signal },
  );
}

// --- Großansicht eines Bildes (am Ende) ---

const CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;

// Das Bild wächst aus seinem Platz an der Wand (FLIP) und schrumpft beim Schließen dorthin zurück.
function openZoom(u, pic, btn) {
  const { game } = u;
  if (!pic) return;
  closeZoom(u, true);
  const layer = document.createElement('div');
  layer.className = 'kk-zoom-layer';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', `Bild von ${game.name(pic.by)}`);
  layer.innerHTML = `<div class="kk-zoom-back"></div>
    <figure class="kk-zoom-piece" style="--c:${game.color(pic.by)}">
      <div class="kk-frame"><canvas width="${S}" height="${S}" role="img" aria-label="Bild von ${who(game, pic.by, 'dir')}, ${points(pic.sum)}"></canvas>${FRAME}</div>
      <figcaption class="kk-zoom-cap">${marker(game, pic.by)}<span class="kk-zoom-name">${game.esc(game.name(pic.by))}</span>
        <b class="kk-zoom-sum">${pic.sum}</b><span class="kk-zoom-unit">${pic.sum === 1 ? 'Punkt' : 'Punkte'}</span></figcaption>
    </figure>
    <button type="button" class="kk-zoom-close" aria-label="Schließen">${CLOSE}</button>`;
  document.body.append(layer);
  drawPicture(layer.querySelector('canvas'), pic.ops);
  document.documentElement.classList.add('kk-locked');

  const ctrl = new AbortController();
  u.zoom = { layer, btn, ctrl };
  const opts = { signal: ctrl.signal };
  layer.addEventListener('click', (e) => !e.target.closest('.kk-frame') && closeZoom(u), opts);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') closeZoom(u);
      else if (e.key === 'Tab') {
        e.preventDefault(); // einziger Knopf im Fenster: der Fokus bleibt auf „Schließen“
        layer.querySelector('.kk-zoom-close').focus();
      }
    },
    opts,
  );
  u.stage.signal.addEventListener('abort', () => closeZoom(u, true), opts);
  layer.querySelector('.kk-zoom-close').focus({ preventScroll: true });

  if (game.reducedMotion) return;
  const frame = layer.querySelector('.kk-frame');
  frame.animate([{ transform: flipFrom(btn, frame) }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  layer.querySelector('.kk-zoom-back').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
  for (const el of layer.querySelectorAll('.kk-zoom-cap, .kk-zoom-close')) {
    el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }
}

// Verschiebung und Maßstab, mit denen der große Rahmen genau auf dem kleinen liegt (Ursprung oben links)
function flipFrom(small, big) {
  const a = small.getBoundingClientRect();
  const b = big.getBoundingClientRect();
  return `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`;
}

function closeZoom(u, instant = false) {
  const z = u.zoom;
  if (!z) return;
  u.zoom = null;
  z.ctrl.abort();
  document.documentElement.classList.remove('kk-locked');
  const back = z.btn.isConnected;
  if (!instant && back) z.btn.focus({ preventScroll: true });
  if (instant || u.game.reducedMotion || !back) {
    z.layer.remove();
    return;
  }
  z.layer.style.pointerEvents = 'none';
  const frame = z.layer.querySelector('.kk-frame');
  const fade = [{ opacity: 1 }, { opacity: 0 }];
  for (const el of z.layer.querySelectorAll('.kk-zoom-back, .kk-zoom-cap, .kk-zoom-close')) el.animate(fade, { duration: 200, easing: 'ease-in', fill: 'forwards' });
  frame
    .animate([{ transform: 'none' }, { transform: flipFrom(z.btn, frame) }], { duration: 320, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' })
    .finished.then(
      () => z.layer.remove(),
      () => z.layer.remove(),
    );
}

export const style = `
  .kk { display: grid; gap: 22px; min-width: 0; }
  /* Spalten nie breiter als der Platz: sonst drücken Namen mit nowrap ihre volle Breite durch (seitliches Scrollen) */
  .kk, .kk-head, .kk-col, .kk-word-phase, .kk-board, .kk-rate, .kk-end { grid-template-columns: minmax(0, 1fr); }
  .kk-stage { min-width: 0; }
  .kk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  /* Oben: Runden und Punkte */
  .kk-head { display: grid; gap: 12px; min-width: 0; }
  .kk[data-phase="malen"] .kk-pts, .kk[data-phase="ende"] .kk-head { display: none; }
  .kk-track { display: flex; align-items: center; gap: 12px; }
  .kk-rounds { display: flex; gap: 5px; }
  .kk-rounds li { width: 16px; height: 16px; border: 1px solid var(--hairline); border-radius: var(--radius); }
  .kk-rounds li.is-done { background: var(--ink); border-color: var(--ink); }
  .kk-rounds li.is-now { border: 2px solid var(--ink); }
  .kk-rounds.intro li { animation: kk-pop 300ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 70ms) backwards; }
  .kk-track-cap { font-size: var(--t-sm); color: var(--muted); }
  .kk-pts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; border-top: 1px solid var(--line); }
  .kk-pts.many { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .kk-pts li { position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--hairline); min-width: 0; }
  .kk-pts-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kk-pts-num { font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1; font-variant-numeric: tabular-nums; }
  .kk-plus {
    flex: none; font: 800 var(--t-base)/1 var(--font-display); font-style: normal; color: var(--c);
    pointer-events: none; animation: kk-plus 1200ms cubic-bezier(.2,.8,.2,1) both;
  }
  @keyframes kk-plus { from { opacity: 0; transform: translateY(8px); } 25% { opacity: 1; transform: none; } 75% { opacity: 1; } to { opacity: 0; transform: translateY(-10px); } }

  @keyframes kk-pop { from { opacity: 0; transform: translateY(6px) scale(.9); } }
  @keyframes kk-rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes kk-draw { to { stroke-dashoffset: 0; } }

  .kk-h { font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1.05; overflow-wrap: anywhere; }
  .kk-h4 { font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1.1; overflow-wrap: anywhere; }
  .kk-h4 small { font-family: var(--font-body); font-weight: 400; font-size: var(--t-sm); color: var(--muted); }
  .kk-big { font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1.1; }
  .kk-sub { font-size: var(--t-sm); margin-top: 2px; }
  .kk-blank { font-size: var(--t-sm); margin-top: 10px; }

  /* Wer ist wie weit */
  .kk-chips { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: var(--t-sm); }
  .kk-chips:empty { display: none; }
  .kk-chip { position: relative; display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
  .kk-chip small { flex: none; font-size: inherit; color: var(--muted); white-space: nowrap; }
  .kk-chip-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 11em; }
  .kk-check { width: 16px; height: 16px; flex: none; overflow: visible; }
  .kk-check path { fill: none; stroke: var(--ok); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
  .kk-chip.fresh .kk-check path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kk-draw 300ms cubic-bezier(.3,.7,.2,1) 80ms forwards; }

  /* Wort vorschlagen */
  .kk-word-phase, .kk-col { display: grid; gap: 24px; min-width: 0; }
  .kk-rules { display: grid; gap: 6px; max-width: 48ch; padding-left: 1.3em; list-style: decimal; }
  .kk-rules li::marker { font-family: var(--font-display); font-weight: 800; }
  .kk-wordform { display: grid; max-width: 420px; animation: kk-rise 320ms cubic-bezier(.2,.8,.2,1) 120ms both; }
  .kk-wordform .row.nowrap { gap: 8px; }
  .kk-wordform input { flex: 1; min-width: 0; }
  .kk-wordform .row:last-child { margin-top: 16px; }
  /* Text neben Staffelei oder Rahmen rutscht darunter, sobald er schmaler als etwa dreizehn Zeichen würde */
  .kk-wait, .kk-intro, .kk-donebox { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 18px; min-width: 0; }
  .kk-wait-text, .kk-intro-text, .kk-done-text { flex: 1 1 13em; display: grid; gap: 6px; justify-items: start; min-width: 0; }
  .kk-intro-text .row { margin-top: 8px; }
  .kk-myword { font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1.05; overflow-wrap: anywhere; }
  .kk-wait-text .label { margin: 0; }
  .kk-easel { width: 112px; flex: none; }
  .kk-easel svg { display: block; width: 100%; height: auto; overflow: visible; animation: kk-rise 420ms cubic-bezier(.2,.8,.2,1) both; }
  .kk-doodle { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kk-doodle 3400ms cubic-bezier(.6,0,.2,1) 400ms infinite; }
  @keyframes kk-doodle { 50% { stroke-dashoffset: 0; } 85% { stroke-dashoffset: 0; opacity: 1; } to { stroke-dashoffset: 0; opacity: 0; } }
  .kk-brush { transform-box: fill-box; transform-origin: 100% 0; animation: kk-brush 3400ms ease-in-out 400ms infinite; }
  @keyframes kk-brush { 0%, 100% { transform: none; } 50% { transform: rotate(-7deg); } }
  .kk-go { min-width: 120px; }

  /* Malen */
  .kk-board { width: min(100%, 560px, max(280px, 100svh - 290px)); display: grid; gap: 12px; }
  .kk-wordline { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  .kk-wordbox { flex: 1 1 auto; min-width: 0; container-type: inline-size; }
  .kk-word {
    display: flex; font-family: var(--font-display); font-weight: 800; line-height: 1; white-space: nowrap;
    font-size: min(var(--t-2xl), calc(100cqw / (var(--n) * .6 + .2)));
  }
  .kk-word span { display: inline-block; animation: kk-letter 320ms cubic-bezier(.2,.8,.2,1) calc(120ms + var(--k) * 50ms) backwards; }
  .kk-word .kk-gap { width: .3em; }
  @keyframes kk-letter { from { opacity: 0; transform: translateY(-.35em); } }
  .kk-clock { flex: none; font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1; font-variant-numeric: tabular-nums; }
  .kk-clock-num { display: inline-block; }
  .kk-clock.low { color: var(--bad); }
  .kk-bar { height: 3px; background: var(--hairline); overflow: hidden; }
  .kk-bar i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 100ms linear, background-color 200ms; }
  .kk-bar.low i { background: var(--bad); }

  .kk-paper {
    position: relative; width: 100%; aspect-ratio: 1; background: #fff;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  .kk-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: none; }
  .kk-board[data-tool="eimer"] .kk-canvas { cursor: crosshair; }
  .kk-board.is-waiting .kk-canvas, .kk-board.is-finished .kk-canvas { cursor: default; }
  .kk-sheet { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .kk-sheet rect { fill: none; stroke: var(--ink); stroke-width: .5; stroke-dasharray: 1; stroke-dashoffset: 1; animation: kk-draw 640ms cubic-bezier(.6,0,.2,1) 80ms forwards; }
  .kk-fx { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .kk-cursor { position: absolute; left: 0; top: 0; pointer-events: none; border-radius: 50%; border: 1.5px solid var(--ink); box-shadow: 0 0 0 1px #fff; }
  .kk-count { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .kk-count-n { font-family: var(--font-display); font-weight: 800; font-size: min(9rem, 40vw); line-height: 1; animation: kk-count 1000ms cubic-bezier(.2,.8,.2,1) both; }
  @keyframes kk-count { from { opacity: 0; transform: scale(1.4); } 18% { opacity: 1; transform: none; } 82% { opacity: 1; transform: scale(.96); } to { opacity: 0; transform: scale(.85); } }
  .kk-ripple {
    position: absolute; width: 36%; aspect-ratio: 1; border-radius: 50%; border: 3px solid var(--c);
    transform: translate(-50%, -50%) scale(0); animation: kk-ripple 520ms cubic-bezier(.2,.8,.2,1) forwards;
  }
  @keyframes kk-ripple { 60% { opacity: 1; } to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
  .kk-torn { position: absolute; inset: 0; width: 100%; height: 100%; transform-origin: 0 0; }

  /* Werkzeuge (wie bei Montagsmaler) */
  .kk-tools { display: grid; gap: 10px; transition: opacity 200ms ease-out; }
  .kk-board.is-finished .kk-tools { opacity: .35; pointer-events: none; }
  .kk-crayons { display: flex; height: 58px; overflow: hidden; border-bottom: 2px solid var(--ink); }
  .kk-crayon {
    flex: 1; min-width: 0; position: relative; appearance: none; border: 0; background: none; padding: 0; cursor: pointer;
    display: flex; justify-content: center; align-items: flex-start;
  }
  .kk-crayon svg { width: 23px; height: 58px; transform: translateY(16px); transition: transform 200ms cubic-bezier(.2,.8,.2,1); }
  .kk-crayon:hover svg { transform: translateY(11px); }
  .kk-crayon[aria-pressed="true"] svg { transform: translateY(2px); }
  .kk-crayon:active svg { transform: translateY(6px) scale(.96); }
  .kk-board[data-tool="radierer"] .kk-crayon[aria-pressed="true"] svg { transform: translateY(11px); }
  .kk-crayon:focus-visible { box-shadow: inset 0 0 0 2px var(--ink); }
  .kk-crayons .kk-crayon svg { animation: kk-crayon 420ms cubic-bezier(.2,.8,.2,1) calc(260ms + var(--i) * 60ms) backwards; }
  @keyframes kk-crayon { from { transform: translateY(60px); } }
  .kk-toolrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .kk-seg { display: flex; gap: 4px; }
  .kk-tool {
    appearance: none; width: 44px; height: 44px; padding: 5px; display: grid; place-items: center; cursor: pointer;
    border: 2px solid transparent; border-radius: var(--radius); background: none; color: var(--ink);
    transition: background-color 120ms ease-out, border-color 120ms ease-out, transform 120ms ease-out;
    animation: kk-rise 300ms cubic-bezier(.2,.8,.2,1) calc(420ms + var(--i) * 50ms) backwards;
  }
  .kk-tool svg { width: 32px; height: 32px; overflow: visible; }
  .kk-tool:hover { background: var(--wash); }
  .kk-tool:active { transform: scale(.96); }
  .kk-tool[aria-pressed="true"] { border-color: var(--ink); background: var(--wash); }
  .kk-size i { width: var(--d); height: var(--d); border-radius: 50%; background: var(--kk-cur); box-shadow: 0 0 0 1.5px var(--ink); }
  .kk-board[data-tool="radierer"] .kk-size i { background: #fff; }
  .kk-cmds { justify-content: flex-start; gap: 6px; }
  .kk-cmd { min-height: 44px; padding: 6px 10px; gap: 4px; font-size: var(--t-sm); flex: 0 1 auto; white-space: nowrap; }
  @media (max-width: 359px) { .kk-cmd[data-cmd="u"] span, .kk-cmd[data-cmd="r"] span { display: none; } }
  .kk-cmd svg { width: 22px; height: 22px; flex: none; }
  .kk-cmd[data-cmd="c"] { margin-left: auto; }
  .kk-cmd:active:not(:disabled) { transform: scale(.96); }
  .kk-finish { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 44px; }
  .kk-finish .kk-note { flex: 1 1 12em; min-width: 0; }
  .kk-finish .kk-note:empty { display: none; }
  .kk-done { flex: none; } /* links: unten rechts schwebt der Reaktionsknopf der Plattform */

  /* Bilder im Goldrahmen */
  .kk-piece { margin: 0; min-width: 0; position: relative; }
  .kk-frame { position: relative; aspect-ratio: 1; background: #fff; }
  .kk-frame canvas { position: absolute; left: 7%; top: 7%; width: 86%; height: 86%; display: block; }
  .kk-frame-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .kk-mine { width: min(46%, 220px); flex: none; }

  /* Bewerten */
  .kk-rate { display: grid; gap: 16px; justify-items: center; min-width: 0; }
  .kk-progress { justify-self: stretch; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: var(--t-sm); color: var(--muted); }
  .kk-dots { display: flex; gap: 5px; }
  .kk-dots li { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--c); transition: background-color 200ms; }
  .kk-dots li.done { background: var(--c); }
  .kk-dots li.now { background: color-mix(in srgb, var(--c) 30%, white); transform: scale(1.25); }
  .kk-hang { display: grid; justify-items: center; width: 100%; }
  .kk-hang > * { grid-area: 1 / 1; }
  .kk-main { width: min(100%, 420px, max(230px, 100svh - 440px)); }
  .kk-main.intro { animation: kk-hangin 560ms cubic-bezier(.2,.8,.2,1) both; transform-origin: 50% 0; }
  @keyframes kk-hangin { from { opacity: 0; transform: translateY(-18px) rotate(-2deg); } }
  .kk-main.next { animation: kk-next 460ms cubic-bezier(.2,.8,.2,1) 140ms backwards; }
  @keyframes kk-next { from { opacity: 0; transform: translateX(48px); } }
  .kk-main.leave { animation: kk-leave 380ms cubic-bezier(.6,0,.2,1) forwards; pointer-events: none; z-index: 1; }
  @keyframes kk-leave { to { opacity: 0; transform: translateX(-56px) rotate(-3deg); } }
  .kk-plaque {
    display: grid; justify-items: center; width: max-content; max-width: 100%; margin: 12px auto 0; padding: 4px 14px 6px;
    border: 1px solid var(--line); border-radius: var(--radius); background: #fff; text-align: center; perspective: 300px;
  }
  .kk-plaque-word { font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1.15; overflow-wrap: anywhere; }
  .kk-plaque-by { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--muted); max-width: 100%; }
  .kk-plaque-by.known { color: var(--ink); font-weight: 700; }
  .kk-plaque-by.enter { animation: kk-flip 420ms cubic-bezier(.2,.8,.2,1) var(--sum-delay, 0ms) backwards; transform-origin: 50% 0; }
  @keyframes kk-flip { from { opacity: 0; transform: rotateX(80deg); } }

  /* Kritiker mit Wertungstafeln */
  .kk-judges { display: flex; justify-content: center; gap: 10px; width: 100%; }
  .kk-rate:not(.is-shown):not(.is-mine) .kk-judges { display: none; }
  .kk-judge {
    flex: 0 1 88px; min-width: 0; display: grid; justify-items: center; opacity: .45; transform: translateY(14px);
    transition: transform 320ms cubic-bezier(.2,.8,.2,1), opacity 320ms ease-out;
  }
  .kk-judge.up { opacity: 1; transform: none; }
  .kk-card { position: relative; width: min(100%, 56px); aspect-ratio: 1; perspective: 400px; }
  .kk-card-in { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform ${FLIP_TIME}ms cubic-bezier(.6,0,.2,1) calc(${FLIP_AT}ms + var(--i) * ${FLIP_STEP}ms); }
  .kk-judge.open .kk-card-in { transform: rotateY(180deg); }
  .kk-judge.instant .kk-card-in { transition: none; }
  .kk-face { position: absolute; inset: 0; -webkit-backface-visibility: hidden; backface-visibility: hidden; }
  .kk-front { transform: rotateY(180deg); }
  .kk-face svg { display: block; width: 100%; height: 100%; }
  .kk-front-in { position: absolute; inset: 0; }
  .kk-front-in b {
    position: absolute; left: 0; right: 0; top: 24%; bottom: 4%; display: grid; place-items: center;
    font-family: var(--font-display); font-weight: 800; font-size: clamp(1.1rem, 7vw, 1.75rem); line-height: 1;
  }
  .kk-stick { width: min(100%, 56px); margin-top: -1px; }
  .kk-stick svg { display: block; width: 100%; height: auto; }
  .kk-judge-name {
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--t-sm); line-height: 1.3;
    opacity: 0; transition: opacity 240ms ease-out calc(${FLIP_AT + FLIP_TIME}ms + var(--i) * ${FLIP_STEP}ms);
  }
  .kk-judge.open .kk-judge-name { opacity: 1; }
  .kk-judge.instant .kk-judge-name { transition: none; }

  /* Noten tippen */
  .kk-panel { display: grid; justify-items: center; text-align: center; width: 100%; }
  .kk-ask-box { display: grid; gap: 10px; justify-items: center; width: 100%; }
  .kk-ask { font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1.1; }
  .kk-count-text:empty { display: none; }
  .kk-scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; width: 100%; max-width: 420px; }
  @media (min-width: 700px) { .kk-scale { grid-template-columns: repeat(10, minmax(0, 1fr)); max-width: 640px; } }
  .kk-score {
    appearance: none; position: relative; height: 54px; padding: 8px 0 0; overflow: hidden; cursor: pointer;
    border: 2px solid var(--ink); border-radius: var(--radius-m); background: #fff; color: var(--ink);
    font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1;
    transition: transform 140ms cubic-bezier(.2,.8,.2,1), background-color 140ms ease-out;
  }
  .kk-score::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 7px; background: var(--hairline); transition: background-color 140ms ease-out; }
  .kk-score:hover { background: var(--wash); }
  .kk-score:active { transform: scale(.96); }
  .kk-score.picked { background: color-mix(in srgb, var(--c) 12%, white); transform: translateY(-4px); }
  .kk-score.picked::before { background: var(--c); }
  .kk-score:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .kk-scale.intro .kk-score { animation: kk-pop 280ms cubic-bezier(.2,.8,.2,1) calc(300ms + var(--i) * 30ms) backwards; }

  /* Auflösung */
  .kk-result { display: grid; gap: 14px; justify-items: center; }
  .kk-sum { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 0 10px; animation: kk-rise 320ms cubic-bezier(.2,.8,.2,1) var(--sum-delay, 0ms) backwards; }
  .kk-sum-num { font-family: var(--font-display); font-weight: 800; font-size: var(--t-3xl); line-height: 1; color: var(--c); }
  .kk-nextrow { display: flex; align-items: center; gap: 12px; }
  .kk-auto { width: 64px; height: 3px; background: var(--hairline); overflow: hidden; }
  .kk-auto i { display: block; height: 100%; background: var(--ink); transform-origin: left; }

  /* Galerie an der Wand (Rückschau und Ende) */
  .kk-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 24px 26px; margin-top: 14px; }
  .kk-small { transform: rotate(var(--tilt)); transform-origin: 50% 0; animation: kk-swing 600ms cubic-bezier(.2,.8,.2,1) calc(var(--wall-delay, 150ms) + var(--i) * var(--step, 90ms)) backwards; }
  @keyframes kk-swing { from { opacity: 0; transform: translateY(-14px) rotate(calc(var(--tilt) * -4)); } }
  .kk-hanger { display: block; width: 46%; height: auto; margin: 0 auto -1px; overflow: visible; }
  .kk-piece-cap { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: var(--t-sm); min-width: 0; }
  .kk-piece-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kk-piece-sum { font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1; }
  .kk-rosette { position: absolute; right: -4%; top: -8%; width: 26%; transform: rotate(10deg); }
  .kk-rosette svg { display: block; width: 100%; height: auto; overflow: visible; }
  .kk-small .kk-rosette { animation: kk-rosette 480ms cubic-bezier(.2,.8,.2,1) calc(var(--wall-delay, 150ms) + var(--i) * var(--step, 90ms) + 380ms) backwards; }
  @keyframes kk-rosette { from { opacity: 0; transform: scale(1.3) rotate(-40deg); } }

  /* Großansicht: Rahmen der Ausstellung sind Knöpfe */
  button.kk-frame { appearance: none; display: block; width: 100%; padding: 0; border: 0; border-radius: 0; background: #fff; cursor: zoom-in; transition: transform 160ms cubic-bezier(.2,.8,.2,1); }
  button.kk-frame:hover { transform: translateY(-3px); }
  button.kk-frame:active { transform: scale(.97); }
  button.kk-frame:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
  html.kk-locked { overflow: hidden; }
  .kk-zoom-layer {
    position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; overscroll-behavior: contain;
    padding: max(64px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
  .kk-zoom-back { position: absolute; inset: 0; background: rgba(255, 255, 255, .97); }
  .kk-zoom-piece { position: relative; margin: 0; width: min(100%, 720px, 100svh - 180px); display: grid; gap: 16px; }
  .kk-zoom-piece .kk-frame { transform-origin: 0 0; cursor: default; }
  .kk-zoom-cap { display: flex; align-items: baseline; justify-content: center; gap: 8px; min-width: 0; }
  .kk-zoom-cap .marker { align-self: center; }
  .kk-zoom-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1.1; }
  .kk-zoom-sum { flex: none; margin-left: 6px; font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1; color: var(--c); }
  .kk-zoom-unit { flex: none; font-size: var(--t-sm); color: var(--muted); }
  .kk-zoom-close {
    position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
    width: 44px; height: 44px; display: grid; place-items: center; padding: 0; cursor: pointer;
    border: 2px solid var(--ink); border-radius: var(--radius-m); background: #fff; color: var(--ink);
    transition: background-color 120ms ease-out, transform 120ms ease-out;
  }
  .kk-zoom-close svg { width: 22px; height: 22px; }
  .kk-zoom-close:hover { background: var(--wash); }
  .kk-zoom-close:active { transform: scale(.96); }

  /* Ende */
  .kk-end { display: grid; gap: 30px; min-width: 0; }
  .kk-rank { display: grid; border-top: 2px solid var(--line); margin-top: 10px; }
  .kk-row { display: flex; align-items: center; gap: 10px; padding: 10px 6px; border-bottom: 1px solid var(--hairline); min-width: 0; }
  .kk-place { width: 1.2em; flex: none; font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1; color: var(--muted); }
  .kk-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1.2; }
  .kk-row-name small { font-family: var(--font-body); font-weight: 400; font-size: var(--t-sm); color: var(--muted); }
  .kk-row-num { flex: none; font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1; font-variant-numeric: tabular-nums; }
  .kk-row.won { background: color-mix(in srgb, var(--c) 10%, white); }
  .kk-row.won .kk-place { color: var(--ink); }
  .kk-row-rosette { width: 30px; flex: none; margin: -12px 0; }
  .kk-row-rosette svg { display: block; width: 100%; height: auto; overflow: visible; }
  .kk-end.play .kk-row { animation: kk-row 420ms cubic-bezier(.2,.8,.2,1) calc(250ms + var(--i) * 140ms) backwards; }
  @keyframes kk-row { from { opacity: 0; transform: translateX(-16px); } }
  .kk-end.play .kk-row-rosette { animation: kk-rosette 520ms cubic-bezier(.2,.8,.2,1) var(--rosette-delay) backwards; }
  .kk-end:not(.play) .kk-small { animation: none; }
  .kk-round-wall + .kk-round-wall { margin-top: 30px; }
  .kk-gallery .kk-h { margin-bottom: 14px; }

  @media (min-width: 700px) {
    .kk-easel { width: 140px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .kk *, .kk *::before, .kk *::after { animation: none !important; transition: none !important; }
    .kk .kk-sheet rect, .kk .kk-check path, .kk .kk-doodle { stroke-dashoffset: 0 !important; }
  }
`;
