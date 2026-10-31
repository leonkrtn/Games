// Montagsmaler: Einer zeichnet, die anderen raten. Zu zweit bis zu sechst, gemeinsam.
//
// Ablauf pro Runde: Der Zeichner schreibt ein Wort (oder nimmt einen Vorschlag) → die Rater sehen nur
// die Striche wie beim Galgenmännchen, einer tippt auf „Bereit“ → die Zeit läuft ab dem ersten Strich,
// die Rater sehen live, was gezeichnet wird, und tippen Rateversuche ein → erraten (von irgendwem),
// Zeit um oder alle haben aufgegeben: nächste Runde, der Nächste zeichnet. Schafft ihr alle Wörter,
// gewinnt ihr alle. Am Ende zeigt eine Galerie alle Bilder der Partie.
//
// Zeichnen: Die Zeichnung ist eine Liste von Befehlen (Strich, Form, Füllen, Löschen, Zurück, Vor), die der
// Server und alle Browser gleich anwenden (lib/malen.js, wie beim Tagesbild). Gemalt wird auf ein eigenes
// Raster (S × S Punkte, jede Zelle eine Farbnummer) statt mit den Canvas-Funktionen: So ergibt der Eimer
// überall exakt dieselbe Fläche, auch wenn Browser Linien unterschiedlich glätten. Das Malbrett mit
// vierundzwanzig Farben, fünf Dicken, Linie, Rechteck, Kreis, Eimer, der Lücken schließt, und Zoomen kommt
// aus lib/malbrett.js. Damit die Rater flüssig zusehen, gehen Striche und Formen schon während des Zeichnens
// über game.live an die anderen Browser; gespeichert wird jeder fertige Befehl mit einer laufenden Nummer
// (seq), damit nichts doppelt oder in falscher Reihenfolge ankommt.
//
// Bildschirm (ein Gruppenmitglied, das nicht mitspielt, z.B. ein Fernseher): screen() zeigt, was die Rater
// sehen, present() zeichnet es groß ohne Eingaben: Zeichnung live, Zeit, Wortstriche, Versuche aller, wer
// zeichnet und wer es erraten hat, die Auflösung und am Ende die Galerie.
//
// Motion: Die Runden bauen sich als Kästchen auf, die Buchstaben-Striche fallen ein, Werkzeuge und
// Näpfchen des Malkastens rücken ein, der Eimer zieht einen Ring, „Alles löschen“ reißt das Blatt ab, falsche
// Versuche rutschen in die Liste. Ist das Wort erraten, schrumpft die Zeichnung in die Auflösung,
// die Buchstaben klappen um und ein Haken zeichnet sich ein. Am Ende kommt die Galerie Bild für Bild.

import { PALETTE, PEN, S, applyCmd, emptyDrawing, fromSmallPalette, paintRaster, rasterOf } from '../lib/malen.js';
import { MALBRETT_CSS, createPad, defaultTools, paperHtml, toolsHtml } from '../lib/malbrett.js';

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

// Befehle, Raster und Eimer: lib/malen.js (wie beim Tagesbild), Malbrett mit Werkzeugen: lib/malbrett.js.
// Kleinere Obergrenzen als dort: Der Zustand wird bei jedem Zug ganz gespeichert.
const LIMITS = { ops: 1500, chars: 60_000 };
const apply = (d, cmd) => applyCmd(d, cmd, LIMITS);
const MAX_WORD = 24;
const GRACE = 800; // ms nach Ablauf: Tipps, die gerade unterwegs sind, zählen noch
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

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
  Palme Wasserfall Feuerwehrauto Zahnarzt Kran Kaffeemaschine Mikrofon Kopfhörer Briefkasten Vogelscheuche
  Eichhörnchen Fledermaus Flamingo Papagei Pfau Storch Adler Taube Rabe Specht Hamster Nashorn Nilpferd
  Kamel Känguru Koala Panda Eisbär Wolf Hirsch Elch Seepferdchen Qualle Seestern Delfin Tintenfisch Libelle
  Ameise Raupe Käfer Gorilla Esel Ziege Truthahn Robbe Otter Biber Faultier Waschbär Brot Käse Spiegelei
  Hamburger Pommes Popcorn Lutscher Schokolade Keks Donut Wassermelone Zitrone Orange Weintraube Mais
  Brokkoli Zwiebel Paprika Gurke Kartoffel Spaghetti Muffin Kokosnuss Eimer Handtuch Staubsauger Kamin
  Kissen Vorhang Teppich Regal Tisch Uhr Radio Computer Bleistift Handtasche Mütze Jacke Kleid Sonnenbrille
  Angel Fackel Laterne Waage Zeitung Motorrad Skateboard Schlitten Kanu Raumschiff Bus Straßenbahn
  Schornstein Tür Turm Strand Wald Tennisschläger Basketball Bogen Pfeil Schwert Schild Puzzle Schlittschuh
  Ski Surfbrett Trampolin Hängematte Vampir Zombie Riese Weihnachtsmann`
  .split(/\s+/)
  .filter(Boolean);
const SUGGEST_EACH = 6; // so viele Vorschläge bekommt ein Zeichner pro Runde

const NUMBERS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig', 'einundzwanzig',
  'zweiundzwanzig', 'dreiundzwanzig', 'vierundzwanzig'];
const word = (n) => NUMBERS[n] ?? String(n);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const names = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} und ${l.at(-1)}`);

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
    mal: 2, // Zeichnungen mit der großen Palette (lib/malen.js); ohne: alte Partie, siehe upgrade
  };
}

// Partien von vor der großen Palette (sieben Farben, drei Dicken): Farben und Dicken der gespeicherten
// Zeichnungen umschreiben. Laufende Partien in tick (wird gespeichert), fertige nur für die Ansicht in view.
function upgrade(s) {
  if (s.mal === 2) return s;
  s.drawing = { ...s.drawing, ops: s.drawing.ops.map(fromSmallPalette) };
  s.past = s.past.map((r) => (r.ops ? { ...r, ops: r.ops.map(fromSmallPalette) } : r));
  s.mal = 2;
  return s;
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
        if (!apply(s.drawing, cmd)) break;
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
  upgrade(s);
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
export function view(state, me) {
  const s = state.mal === 2 ? state : upgrade({ ...state });
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

// Bildschirm: was die Rater sehen (kein Wort, keine Vorschläge)
export function screen(s) {
  return view(s, null);
}


// ---------- Anzeige (nur im Browser) ----------

// Kleines Bild einer Zeichnung (Auflösung, Galerie), gemittelt, das glättet die Kanten.
const drawThumb = (canvas, ops) => paintRaster(canvas, rasterOf(ops));

// --- Zeichnungen (Skill „zeichnen“) ---

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
    u = { signal: game.signal, key: null, stage: null, tools: defaultTools(), suggest: 0, lastRefresh: 0 };
    reset(u);
    ui.set(el, u);
    game.live.on((data) => onLive(u, data));
    game.signal.addEventListener('abort', () => u.stage?.abort());
  }
  return u;
}

// Alles, was nur für eine Ansicht (Phase einer Runde) gilt
function reset(u) {
  clearTimeout(u.liveTimer);
  clearTimeout(u.shapeTimer);
  clearTimeout(u.retry);
  Object.assign(u, {
    board: null,
    pad: null, // Malbrett (lib/malbrett.js): Raster, Werkzeuge, Eingaben
    model: null,
    pending: [], // eigene Zeichenbefehle, die der Server noch nicht hat
    sending: false,
    livePreview: null, // Rater: Strich des anderen, der gerade entsteht
    liveCmds: new Map(), // Rater: fertige Befehle, die live schon da sind
    liveTimer: null, // Zeichner: neue Punkte gehen gesammelt alle 50 ms raus
    shapeTimer: null,
    liveShape: null, // Zeichner: Form, die gerade aufgezogen wird
    seenSeq: 0, // Rater: gespeicherter Stand, bis zu dem die Vorschau einer Form gilt
    full: false,
    triesShown: 0,
    tickClock: null,
  });
}

// Bildschirm: dieselbe Ansicht wie für die Rater, ohne Eingaben und groß (game.tv)
export function present(el, s, game) {
  render(el, s, { ...game, tv: true });
}

export function render(el, s, game) {
  const u = local(el, game);
  u.s = s;
  u.game = game;
  u.drawer = !s.result && s.drawer === game.me;

  let root = el.querySelector(':scope > .mm');
  if (!root) {
    el.innerHTML = `<div class="mm ${game.tv ? 'mm-tv' : ''}"><div class="mm-track"></div><div class="mm-stage"></div></div>`;
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
  const by = (s.players.length > 2 || game.tv) && r.by ? `${r.by === game.me ? 'Du hast' : `${game.esc(game.name(r.by))} hat`} es erraten` : 'Erraten';
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
    ${game.tv ? '<p class="status">Sobald jemand auf Bereit tippt, geht es los.</p>' : '<div class="row"><button class="btn primary" data-action="bereit">Bereit</button></div>'}
  </div>`;
}

// --- Malen und raten ---

function renderBoard(stage, s, game, u) {
  const signal = u.stage.signal;
  const drawer = u.drawer;
  const tv = Boolean(game.tv);
  const many = guessersOf(s).length > 1;
  const otherName = game.esc(game.name(drawer ? guessersOf(s)[0] : s.drawer));
  const triesTitle = drawer ? (many ? 'Versuche der anderen' : `Versuche von ${otherName}`) : many || tv ? 'Versuche' : 'Deine Versuche';
  const n = slotCount(s.pattern);
  const frame = '<svg class="mm-frame" viewBox="0 0 100 100" aria-hidden="true"><rect pathLength="1" x=".4" y=".4" width="99.2" height="99.2"/></svg>';
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
      ${paperHtml({ cls: 'mm-paper', label: drawer ? 'Malfläche' : `Zeichnung von ${otherName}`, input: drawer, extra: frame })}
      ${
        tv
          ? ''
          : drawer
          ? toolsHtml()
          : `<form class="mm-guess" autocomplete="off">
              <label for="mm-guess-in">Dein Tipp</label>
              <div class="row nowrap">
                <input id="mm-guess-in" name="tipp" maxlength="30" autocomplete="off" spellcheck="false" enterkeyhint="send">
                <button class="btn primary" type="submit">Raten</button>
              </div>
            </form>`
      }
      ${drawer || tv ? '' : '<div class="mm-giveup"><button type="button" class="link">Aufgeben</button></div>'}
      <p class="status mm-note" aria-live="polite"></p>
      <section class="mm-tries" hidden>
        <h3 class="mm-tries-title">${triesTitle}</h3>
        <ol class="mm-tries-list" aria-live="polite"></ol>
      </section>
    </div>`; /* „Aufgeben“ über den Tipps: Die Liste wächst nach unten und schiebt den Knopf nicht weg */

  const board = stage.firstElementChild;
  u.pad = createPad(board, {
    signal,
    reducedMotion: game.reducedMotion,
    input: drawer,
    tools: u.tools,
    canDraw: () => u.s.phase === 'malen' && !u.s.result && !(u.s.deadline && u.game.now() > u.s.deadline),
    nextSeq: () => nextSeq(u),
    issue: (cmd) => issue(u, cmd),
    update: () => updateDrawing(u),
    onStroke: () => (u.pad.stroke?.sent ? scheduleLivePoints(u) : sendLivePoints(u)),
    onShape: (sh) => sendLiveShape(u, sh),
  });
  u.board = {
    el: board,
    paper: u.pad.paper,
    note: board.querySelector('.mm-note'),
    tries: board.querySelector('.mm-tries'),
    list: board.querySelector('.mm-tries-list'),
    clock: board.querySelector('.mm-clock'),
    num: board.querySelector('.mm-clock-num'),
    bar: board.querySelector('.mm-bar i'),
  };

  if (!drawer && !tv) bindGuess(u, signal);
  startClock(u, signal);
  updateBoard(u);
  if (tv) return;

  // Malfläche und Werkzeuge (bzw. Eingabe) ganz ins Bild holen
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    const top = board.querySelector('.mm-wordline').getBoundingClientRect().top;
    const bottom = board.querySelector(drawer ? '.mb-tools' : '.mm-guess').getBoundingClientRect().bottom;
    const free = innerHeight - 64; // unten rechts schwebt der Reaktionsknopf der Plattform
    let dy = 0;
    if (top < 0 || bottom - top > free - 16) dy = top - 8;
    else if (bottom > free) dy = bottom - free + 8;
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
    // Neues im gespeicherten Stand: Eine Form, die live aufgezogen wurde, ist darin schon fertig
    // (falls ihr Befehl live verloren ging). Die nächste Live-Nachricht zeigt sie sonst gleich wieder.
    if (d.seq !== u.seenSeq) {
      u.seenSeq = d.seq;
      u.pad?.showShape(null);
    }
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
    if (!apply(m, cmd)) break;
  }
  return m;
}

function updateDrawing(u) {
  if (!u.pad) return;
  const m = currentModel(u);
  u.model = m;
  let preview = u.drawer ? u.pad.stroke : u.livePreview;
  if (preview && preview.s <= m.seq) {
    preview = null;
    if (!u.drawer) u.livePreview = null;
  }
  u.pad.sync(m, preview);
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
    // Auf dem Bildschirm steht bei jedem Versuch, von wem er ist
    const who = !g.by
      ? ''
      : game.tv
        ? `<span class="marker" style="color:${game.color(g.by)}"></span><span class="mm-try-by">${game.esc(game.name(g.by))}</span> `
        : many
          ? `<span class="marker" style="color:${game.color(g.by)}" title="${game.esc(game.name(g.by))}"></span> `
          : '';
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
  if (game.tv) {
    const gave = (s.gaveUp ?? []).map((id) => game.name(id));
    if (!s.startedAt && !u.livePreview && !u.liveCmds.size && !u.pad?.liveShape) text = `${game.name(s.drawer)} fängt gleich an.`;
    else if (gave.length) text = `${names(gave)} ${gave.length === 1 ? 'hat' : 'haben'} aufgegeben.`;
  } else if (u.full) text = 'Das Bild ist voll. Nimm etwas zurück oder lösche alles.';
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

// --- Zeichner: Befehle speichern und live schicken ---

const nextSeq = (u) => Math.max(u.s.drawing.seq, u.pending[u.pending.length - 1]?.s ?? 0, u.pad?.stroke?.s ?? 0) + 1;

// Neuer eigener Befehl (vom Malbrett): sofort zeigen, live an die anderen, dann (gebündelt) speichern.
function issue(u, cmd) {
  if (cmd.s === undefined) cmd.s = nextSeq(u);
  clearTimeout(u.shapeTimer); // eine Form, die gerade fertig wurde, nicht nochmal als Vorschau schicken
  u.shapeTimer = null;
  u.liveShape = null;
  u.full = apply(currentModel(u), cmd) === 'voll';
  u.pending.push(cmd);
  u.game.live.send({ k: 'cmd', r: u.s.round, cmd });
  updateDrawing(u);
  renderNote(u);
  flushQueue(u);
}

// Immer nur eine Anfrage unterwegs, damit die Befehle in der richtigen Reihenfolge ankommen.
// Was der Server schon hat (laut Stand), fällt in updateBoard aus der Liste.
async function flushQueue(u) {
  if (u.sending || !u.pad) return;
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

// Neue Punkte des laufenden Strichs live an die anderen (alle 50 ms gesammelt, der Anfang sofort)
function scheduleLivePoints(u) {
  if (!u.liveTimer) u.liveTimer = setTimeout(() => sendLivePoints(u), 50);
}

function sendLivePoints(u) {
  clearTimeout(u.liveTimer);
  u.liveTimer = null;
  const st = u.pad?.stroke;
  if (!st || st.sent >= st.pts.length) return;
  u.game.live.send({ k: 'pt', r: u.s.round, s: st.s, c: st.c, w: st.w, i: st.sent, p: st.pts.slice(st.sent).flat() });
  st.sent = st.pts.length;
}

// Form beim Aufziehen live an die anderen (alle 50 ms die neueste); null: Vorschau verworfen
function sendLiveShape(u, sh) {
  if (!sh) {
    clearTimeout(u.shapeTimer);
    u.shapeTimer = null;
    u.liveShape = null;
    u.game.live.send({ k: 'off', r: u.s.round });
    return;
  }
  u.liveShape = sh;
  if (u.shapeTimer) return;
  u.shapeTimer = setTimeout(() => {
    u.shapeTimer = null;
    if (u.liveShape) u.game.live.send({ k: 'sh', r: u.s.round, ...u.liveShape });
  }, 50);
}

// --- Rater: live mitsehen ---

function onLive(u, data) {
  const s = u.s;
  const pad = u.pad;
  if (!s || !pad || u.drawer || s.phase !== 'malen' || s.result || data?.r !== s.round) return;
  const tvNote = () => u.game.tv && renderNote(u); // Bildschirm: „fängt gleich an“ verschwindet mit dem ersten Strich
  if (data.k === 'cmd') {
    const cmd = data.cmd;
    if (!cmd || typeof cmd.s !== 'number' || cmd.s <= s.drawing.seq) return;
    const known = u.liveCmds.get(cmd.s);
    if (known && JSON.stringify(known) === JSON.stringify(cmd)) return;
    u.liveCmds.set(cmd.s, cmd);
    if (u.livePreview && u.livePreview.s <= cmd.s) u.livePreview = null;
    pad.showShape(null);
    if (cmd.t === 'c') pad.tear();
    updateDrawing(u);
    tvNote();
    if (cmd.t === 'f' && isInt(cmd.x, 0, S - 1) && isInt(cmd.y, 0, S - 1) && isInt(cmd.c, 1, PALETTE.length - 1)) pad.ripple(cmd.x, cmd.y, cmd.c);
  } else if (data.k === 'pt') {
    const p = data.p;
    if (!Array.isArray(p) || p.length % 2 || p.length > 4000 || !isInt(data.c, 0, PALETTE.length - 1) || !isInt(data.w, 0, PEN.length - 1)) return;
    if (typeof data.s !== 'number' || data.s <= (u.model?.seq ?? s.drawing.seq)) return;
    if (data.i === 0) {
      u.livePreview = { s: data.s, c: data.c, w: data.w, pts: [] };
      tvNote();
    }
    const pv = u.livePreview;
    if (!pv || pv.s !== data.s || data.i !== pv.pts.length) return; // Lücke: auf den fertigen Strich warten
    for (let i = 0; i < p.length; i += 2) {
      if (!isInt(p[i], 0, S - 1) || !isInt(p[i + 1], 0, S - 1)) return;
      pv.pts.push([p[i], p[i + 1]]);
    }
    updateDrawing(u);
  } else if (data.k === 'sh') {
    pad.showShape(data);
    tvNote();
  } else if (data.k === 'off') {
    u.livePreview = null;
    pad.showShape(null);
    updateDrawing(u);
    tvNote();
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
  .mm-clock { min-width: 2.4em; text-align: right; font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); line-height: 1; } /* feste Breite: „1:00“ und „0:59“ sind verschieden breit */
  .mm-clock-num { display: inline-block; }
  .mm-clock.low { color: var(--bad); }
  .mm-bar { height: 3px; background: var(--hairline); overflow: hidden; }
  .mm-bar i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 250ms linear, background-color 200ms; }
  .mm-bar.low i { background: var(--bad); }

  .mm-board.is-drawer { width: min(100%, 560px, max(300px, 100svh - 380px)); } /* Werkzeuge brauchen Platz darunter */
  .mm-paper { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .mm-frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .mm-frame rect { fill: none; stroke: var(--ink); stroke-width: .5; stroke-dasharray: 1; stroke-dashoffset: 1; animation: mm-draw 640ms cubic-bezier(.6,0,.2,1) 80ms forwards; }

  /* Malbrett (lib/malbrett.js) */
  ${MALBRETT_CSS}

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

  /* Bildschirm (present): groß, am Fernseher Zeichnung links, Wort, Zeit und Versuche rechts */
  .mm-tv { gap: 2.5vh; }
  .mm-tv .mm-track-cap { font-size: var(--t-md); color: var(--ink); }
  .mm-tv .mm-rounds:not(.many) .mm-round { width: 1.8rem; height: 1.8rem; }
  .mm-tv .mm-rounds:not(.many) .mm-round svg { width: 1.5rem; height: 1.5rem; }
  .mm-tv .mm-board { width: 100%; gap: 2vh; }
  .mm-tv .mm-paper { width: min(100%, 70vh); border: 1px solid var(--hairline); }
  .mm-tv .mm-slots { --fs: var(--t-3xl); }
  .mm-tv .mm-slots.size-m { --fs: var(--t-2xl); }
  .mm-tv .mm-slots.size-s { --fs: var(--t-xl); }
  .mm-tv .mm-slots.size-xs { --fs: var(--t-lg); }
  .mm-tv .mm-count { font-size: var(--t-base); }
  .mm-tv .mm-clock { font-size: var(--t-3xl); }
  .mm-tv .mm-bar { height: 4px; margin-top: 1.5vh; }
  .mm-tv .mm-note { font-size: var(--t-md); }
  .mm-tv .mm-tries-title { font-size: var(--t-base); }
  .mm-tv .mm-tries-list { gap: .5em; font-size: var(--t-md); }
  .mm-tv .mm-try { padding: .25em .6em; }
  .mm-try-by { font-weight: 700; margin-left: .35em; }
  .mm-try-by::after { content: ':'; }
  .mm-tv .mm-ready, .mm-tv .mm-wait { max-width: none; font-size: var(--t-md); }
  .mm-tv .mm-ready > .status:first-child, .mm-tv .mm-wait .status { font-family: var(--font-display); font-weight: 800; font-size: var(--t-2xl); line-height: 1.1; }
  .mm-tv .mm-reveal { grid-template-columns: minmax(0, min(42%, 48vh)) 1fr; gap: 4vw; }
  .mm-tv .mm-reveal .mm-slots { --fs: var(--t-3xl); }
  .mm-tv .mm-reveal-cap, .mm-tv .mm-reveal-res { font-size: var(--t-md); }
  .mm-tv .mm-scribble { width: 10rem; height: auto; }
  .mm-tv .mm-gallery-title { font-size: var(--t-2xl); margin-bottom: 3vh; }
  .mm-tv .mm-tiles { grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr)); gap: 4vh 2.5vw; }
  .mm-tv .mm-tile-word { font-size: var(--t-lg); }
  .mm-tv .mm-tile-meta { font-size: var(--t-base); }
  @media (min-width: 880px) and (orientation: landscape) {
    .mm-tv .mm-board {
      grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto auto 1fr;
      grid-template-areas: "paper word" "paper bar" "paper note" "paper tries"; column-gap: 4vw; align-items: start;
    }
    .mm-tv .mm-paper { grid-area: paper; width: min(72vh, 52vw); }
    .mm-tv .mm-wordline { grid-area: word; flex-direction: column-reverse; align-items: stretch; }
    .mm-tv .mm-wordline > div:first-child { flex: none; }
    .mm-tv .mm-clock { align-self: flex-start; }
    .mm-tv .mm-bar { grid-area: bar; }
    .mm-tv .mm-note { grid-area: note; }
    .mm-tv .mm-tries { grid-area: tries; }
  }

  @media (prefers-reduced-motion: reduce) {
    .mm *, .mm *::after { animation: none !important; transition: none !important; }
    .mm .mm-frame rect, .mm .mm-ink, .mm .mm-stamp path, .mm .mm-scribble-line { stroke-dashoffset: 0 !important; }
  }
`;
