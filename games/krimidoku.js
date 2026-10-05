// Krimidoku: Sudoku für Kriminalfälle. Zwei bis sechs Spieler lösen einen Fall zusammen, ohne Zeitlimit.
//
// Ein Grundriss aus n × n Feldern mit Räumen und Möbeln. Darauf waren n Personen, das Opfer und die
// Verdächtigen, und zwar so, dass in jeder Zeile und jeder Spalte genau eine stand. Hinweise sagen, wo
// jemand war („Berta saß auf einem Stuhl“). Täter ist, wer als Einziger mit dem Opfer im selben Raum war.
//
// Zusammen: Alle arbeiten am selben Grundriss, setzen Personen, machen Kreuze und füllen dieselbe
// Notiztabelle. In der Leiste steht, wer eine Person gesetzt hat; setzt jemand anderes eine, leuchtet das
// Feld mit seinem Namen auf; wer gerade eine Person in der Hand hat, sehen die anderen live (game.live).
// Steht jede Person richtig, ist der Fall gelöst und alle gewinnen.
//
// Motion: Der Grundriss baut sich auf, Wände zeichnen sich ein, Möbel kommen gestaffelt dazu. Figuren
// gleiten aus der Leiste auf ihr Feld, Kreuze zeichnen sich ein, erfüllte Hinweise bekommen einen Haken.
// Gelöst: Die anderen Räume treten zurück, der Tatraum wird umrandet, das Opfer kippt um (bei Mord),
// der Stempel „Täter“ schlägt auf.

export const meta = {
  name: 'Krimidoku',
  description: 'Sudoku für Kriminalfälle. Ihr löst einen Fall zusammen: Wer stand wo, und wer war es?',
  players: [2, 6],
  options: [
    {
      id: 'stufe',
      label: 'Schwierigkeit',
      choices: [
        { value: 5, label: 'Mittel, fünf mal fünf' },
        { value: 4, label: 'Leicht, vier mal vier' },
        { value: 6, label: 'Schwer, sechs mal sechs' },
      ],
    },
  ],
};

// ---------- Das Haus (Server und Browser) ----------

// Grundrisse: welche Räume es gibt (im Keller ohne Fenster)
const FLOORS = {
  keller: { name: 'Keller', windows: false, rooms: ['weinkeller', 'vorrat', 'werkstatt', 'waschkueche', 'heizung', 'kohlen'] },
  eg: { name: 'Erdgeschoss', windows: true, rooms: ['salon', 'kueche', 'speise', 'bibliothek', 'halle', 'wintergarten', 'musik'] },
  og: { name: 'Obergeschoss', windows: true, rooms: ['schlaf', 'gaeste', 'bad', 'arbeit', 'ankleide', 'kinder', 'nähzimmer'] },
  dach: { name: 'Dachboden', windows: true, rooms: ['speicher', 'atelier', 'mansarde', 'kammer', 'abstell', 'sternwarte'] },
};
const HALL = { keller: 'gang', eg: 'flur', og: 'flur', dach: 'gang' }; // lange, schmale Räume

// Räume: Name, Geschlecht (für „im Salon“, „in der Küche“), Fußboden und Möbel, die dort stehen
const ROOMS = {
  salon: { name: 'Salon', g: 'm', floor: 'holz', items: ['sessel', 'sessel', 'teppich', 'pflanze', 'klavier', 'tisch'] },
  kueche: { name: 'Küche', g: 'f', floor: 'fliese', items: ['herd', 'tisch', 'stuhl', 'stuhl', 'regal'] },
  speise: { name: 'Speisezimmer', g: 'n', floor: 'holz', items: ['tisch', 'tisch', 'stuhl', 'stuhl', 'pflanze'] },
  bibliothek: { name: 'Bibliothek', g: 'f', floor: 'holz', items: ['regal', 'regal', 'sessel', 'teppich', 'tisch'] },
  halle: { name: 'Halle', g: 'f', floor: 'stein', items: ['teppich', 'pflanze', 'stuhl', 'klavier'] },
  wintergarten: { name: 'Wintergarten', g: 'm', floor: 'fliese', items: ['pflanze', 'pflanze', 'sessel', 'stuhl', 'tisch'] },
  musik: { name: 'Musikzimmer', g: 'n', floor: 'holz', items: ['klavier', 'stuhl', 'teppich', 'sessel'] },
  flur: { name: 'Flur', g: 'm', floor: 'holz', items: ['teppich', 'pflanze', 'stuhl'] },
  schlaf: { name: 'Schlafzimmer', g: 'n', floor: 'holz', items: ['bett', 'bett', 'teppich', 'sessel', 'regal'] },
  gaeste: { name: 'Gästezimmer', g: 'n', floor: 'holz', items: ['bett', 'stuhl', 'tisch', 'pflanze'] },
  bad: { name: 'Bad', g: 'n', floor: 'fliese', items: ['wanne', 'teppich', 'pflanze', 'stuhl'] },
  arbeit: { name: 'Arbeitszimmer', g: 'n', floor: 'holz', items: ['tisch', 'stuhl', 'regal', 'sessel'] },
  ankleide: { name: 'Ankleide', g: 'f', floor: 'holz', items: ['regal', 'stuhl', 'teppich', 'kiste'] },
  kinder: { name: 'Kinderzimmer', g: 'n', floor: 'holz', items: ['bett', 'kiste', 'teppich', 'stuhl'] },
  'nähzimmer': { name: 'Nähzimmer', g: 'n', floor: 'holz', items: ['tisch', 'stuhl', 'kiste', 'sessel'] },
  weinkeller: { name: 'Weinkeller', g: 'm', floor: 'stein', items: ['fass', 'fass', 'regal', 'stuhl'] },
  vorrat: { name: 'Vorratskammer', g: 'f', floor: 'stein', items: ['regal', 'kiste', 'fass', 'stuhl'] },
  werkstatt: { name: 'Werkstatt', g: 'f', floor: 'stein', items: ['tisch', 'stuhl', 'kiste', 'regal'] },
  waschkueche: { name: 'Waschküche', g: 'f', floor: 'fliese', items: ['wanne', 'kiste', 'stuhl', 'teppich'] },
  heizung: { name: 'Heizungsraum', g: 'm', floor: 'stein', items: ['kiste', 'fass', 'stuhl'] },
  kohlen: { name: 'Kohlenkeller', g: 'm', floor: 'stein', items: ['kiste', 'kiste', 'fass'] },
  gang: { name: 'Gang', g: 'm', floor: 'stein', items: ['kiste', 'teppich', 'stuhl'] },
  speicher: { name: 'Speicher', g: 'm', floor: 'holz', items: ['kiste', 'kiste', 'stuhl', 'teppich', 'regal'] },
  atelier: { name: 'Atelier', g: 'n', floor: 'holz', items: ['tisch', 'stuhl', 'teppich', 'sessel'] },
  mansarde: { name: 'Mansarde', g: 'f', floor: 'holz', items: ['bett', 'stuhl', 'pflanze', 'teppich'] },
  kammer: { name: 'Kammer', g: 'f', floor: 'holz', items: ['bett', 'kiste', 'stuhl'] },
  abstell: { name: 'Abstellraum', g: 'm', floor: 'holz', items: ['kiste', 'regal', 'kiste', 'stuhl'] },
  sternwarte: { name: 'Sternwarte', g: 'f', floor: 'holz', items: ['tisch', 'stuhl', 'sessel', 'teppich'] },
};

// Möbel: auf manchen kann man sein (sitzen, liegen, stehen), die anderen versperren das Feld
const ITEMS = {
  stuhl: { on: 'saß auf einem Stuhl', dat: 'einem Stuhl', name: 'Stuhl' },
  sessel: { on: 'saß in einem Sessel', dat: 'einem Sessel', name: 'Sessel' },
  bett: { on: 'lag auf einem Bett', dat: 'einem Bett', name: 'Bett' },
  teppich: { on: 'stand auf einem Teppich', dat: 'einem Teppich', name: 'Teppich' },
  tisch: { dat: 'einem Tisch', name: 'Tisch' },
  pflanze: { dat: 'einer Pflanze', name: 'Pflanze' },
  regal: { dat: 'einem Regal', name: 'Regal' },
  kiste: { dat: 'einer Kiste', name: 'Kiste' },
  fass: { dat: 'einem Fass', name: 'Fass' },
  herd: { dat: 'einem Herd', name: 'Herd' },
  wanne: { dat: 'einer Badewanne', name: 'Badewanne' },
  klavier: { dat: 'einem Klavier', name: 'Klavier' },
};
const free = (item) => !item || Boolean(ITEMS[item]?.on);

// Personen: Vorname (in den Hinweisen) und Rolle. Auf einem Stockwerk haben alle verschiedene Anfangsbuchstaben.
const PEOPLE = `Anton Butler, Berta Köchin, Clara Gräfin, Dietrich Doktor, Elsa Erbin, Franz Förster, Gustav Gärtner,
  Hilde Hausdame, Ida Malerin, Jakob Juwelier, Karl Kapitän, Lotte Lehrerin, Moritz Major, Nora Notarin, Otto Oberst,
  Paul Pfarrer, Rosa Reporterin, Selma Sängerin, Trude Tante, Udo Uhrmacher, Vera Verlegerin, Wilma Witwe,
  Emil Chauffeur, Greta Gouvernante, Hugo Hausmeister, Klara Zofe, Leo Leutnant, Margot Mäzenin, Felix Fotograf,
  Agathe Archäologin, Bruno Boxer, Ilse Imkerin, Theo Tänzer, Wanda Wahrsagerin, Ruth Reiseleiterin, Siegfried Sommelier,
  Kurt Kunsthändler, Olga Opernsängerin, Henri Hutmacher, Marta Magd, Viktor Varietékünstler, Edith Erfinderin`
  .split(',')
  .map((t) => t.trim().split(' '))
  .map(([name, role]) => ({ name, role }));

const HOUSES = ['Haus Falkenstein', 'Villa Lindenhof', 'Schloss Rabenhorst', 'Gut Eichengrund', 'Haus Sturmfels',
  'Villa Weidenau', 'Haus Birkenwald', 'Gut Mühlbach', 'Villa Seerose', 'Haus Nebelstein'];

// Was passiert ist. Bei Mord liegt das Opfer.
const CRIMES = {
  mord: 'wurde ermordet',
  raub: 'wurde bestohlen',
  gift: 'wurde vergiftet und hat knapp überlebt',
  schlag: 'wurde niedergeschlagen',
  erpressung: 'wurde erpresst',
};

// ---------- Texte ----------

// „in der Villa Seerose“, „im Haus Falkenstein“, „auf Gut Mühlbach“
const houseIn = (house) => (house.startsWith('Villa') ? 'in der ' : house.startsWith('Gut') ? 'auf ' : 'im ') + house;
const roomIn = (key) => (ROOMS[key]?.g === 'f' ? 'in der ' : 'im ') + (ROOMS[key]?.name ?? 'Raum');
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Ein Hinweis als Satz in Teilen: Text und Verweise auf Personen (Zahlen), damit die Anzeige Namen
 * hervorheben kann. fl = der Fall (Grundriss mit Räumen und Möbeln).
 */
function clueParts(fl, clue) {
  const room = fl.names[clue.r];
  switch (clue.t) {
    case 'raum':
      return [clue.p, ` war ${roomIn(room)}.`];
    case 'nicht':
      return [clue.p, ` war nicht ${roomIn(room)}.`];
    case 'auf':
      return [clue.p, ` ${ITEMS[clue.k]?.on ?? 'war dort'}.`];
    case 'neben':
      return [clue.p, ` war neben ${ITEMS[clue.k]?.dat ?? 'etwas'}.`];
    case 'fenster':
      return [clue.p, ' war an einem Fenster.'];
    case 'allein':
      return [clue.p, ' war allein in einem Raum.'];
    case 'mit':
      return [clue.p, ' war mit ', clue.q, ' im selben Raum.'];
    case 'leer':
      return [`${cap(roomIn(room))} war niemand.`];
  }
  return [''];
}

// ---------- Kleine Hilfen ----------

const rnd = (k) => Math.floor(Math.random() * k);
const pick = (a) => a[rnd(a.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weighted(list, w) {
  const total = list.reduce((sum, x) => sum + w(x), 0);
  let r = Math.random() * total;
  for (const x of list) if ((r -= w(x)) < 0) return x;
  return list[list.length - 1];
}
const popcount = (m) => {
  let k = 0;
  for (; m; m &= m - 1) k++;
  return k;
};

// Nachbarn eines Feldes (waagerecht und senkrecht)
function around(n, c) {
  const r = Math.floor(c / n);
  const x = c % n;
  const out = [];
  if (r > 0) out.push(c - n);
  if (x < n - 1) out.push(c + 1);
  if (r < n - 1) out.push(c + n);
  if (x > 0) out.push(c - 1);
  return out;
}

// ---------- Grundriss bauen ----------

// Räume als Rechtecke: das größte Rechteck wird geteilt, bis es genug sind. Manchmal werden zwei
// Rechtecke, die sich nur teilweise berühren, zu einem L-förmigen Raum.
function splitRooms(n, k) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let rects = [{ x: 0, y: 0, w: n, h: n }];
    const want = k + (Math.random() < 0.45 ? 1 : 0);
    while (rects.length < want) {
      const big = rects.filter((r) => r.w * r.h >= 4);
      if (!big.length) break;
      const r = weighted(big, (q) => (q.w * q.h) ** 2);
      const vertical = r.w === r.h ? Math.random() < 0.5 : r.w > r.h;
      const len = vertical ? r.w : r.h;
      if (len < 2) continue;
      const cut = 1 + rnd(len - 1);
      const a = vertical ? { ...r, w: cut } : { ...r, h: cut };
      const b = vertical ? { ...r, x: r.x + cut, w: r.w - cut } : { ...r, y: r.y + cut, h: r.h - cut };
      if (a.w * a.h < 2 || b.w * b.h < 2) continue;
      rects = rects.filter((q) => q !== r).concat([a, b]);
    }
    const grid = Array(n * n).fill(0);
    rects.forEach((r, i) => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y * n + x] = i;
    });
    let count = rects.length;
    if (count > k) {
      // L-Form: zwei Rechtecke, die sich an einer Kante nur teilweise berühren
      const pairs = [];
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = rects[i];
          const b = rects[j];
          const touchV = (a.x + a.w === b.x || b.x + b.w === a.x) && a.y < b.y + b.h && b.y < a.y + a.h;
          const touchH = (a.y + a.h === b.y || b.y + b.h === a.y) && a.x < b.x + b.w && b.x < a.x + a.w;
          const full = (touchV && a.y === b.y && a.h === b.h) || (touchH && a.x === b.x && a.w === b.w);
          if ((touchV || touchH) && !full && a.w * a.h + b.w * b.h <= Math.ceil((n * n) / 2.5)) pairs.push([i, j]);
        }
      }
      if (!pairs.length) continue;
      const [i, j] = pick(pairs);
      for (let c = 0; c < n * n; c++) if (grid[c] === j) grid[c] = i;
      // Nummern lückenlos
      const order = [...new Set(grid)];
      for (let c = 0; c < n * n; c++) grid[c] = order.indexOf(grid[c]);
      count = order.length;
    }
    if (count !== k) continue;
    return grid;
  }
  return null;
}

const ONCE = ['klavier', 'herd', 'wanne'];

function buildLayout(n, type) {
  const k = { 4: 3 + rnd(2), 5: 4 + rnd(2), 6: 5 + rnd(2) }[n];
  const rooms = splitRooms(n, k) ?? splitRooms(n, k);
  if (!rooms) return null;
  // Raumnamen: lange, schmale Räume werden Flur oder Gang, die anderen zufällig
  const cellsOf = (r) => rooms.map((x, c) => (x === r ? c : -1)).filter((c) => c >= 0);
  const names = [];
  const pool = shuffle([...FLOORS[type].rooms]);
  for (let r = 0; r < k; r++) {
    const cells = cellsOf(r);
    const xs = cells.map((c) => c % n);
    const ys = cells.map((c) => Math.floor(c / n));
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const thin = Math.min(w, h) === 1 && Math.max(w, h) >= 3 && cells.length === w * h;
    if (thin && !names.includes(HALL[type])) names.push(HALL[type]);
    else names.push(pool.pop());
  }
  // Möbel: in jedem Raum einige aus seiner Auswahl, versperrende höchstens etwa ein Viertel der Felder
  const items = Array(n * n).fill('');
  let blocked = 0;
  for (let r = 0; r < k; r++) {
    const cells = shuffle(cellsOf(r));
    const room = ROOMS[names[r]];
    const want = Math.max(1, Math.round(cells.length * (0.4 + Math.random() * 0.2)));
    const count = {};
    for (const c of cells.slice(0, want)) {
      const item = pick(room.items);
      // ein Klavier, ein Herd, eine Wanne pro Raum, von allem anderen höchstens zwei
      if ((count[item] ?? 0) >= (ONCE.includes(item) ? 1 : 2)) continue;
      if (!free(item) && blocked >= Math.floor(n * n * 0.26)) continue;
      if (!free(item)) blocked++;
      count[item] = (count[item] ?? 0) + 1;
      items[c] = item;
    }
  }
  // Fenster in der Außenwand (Bitmaske pro Feld: 1 oben, 2 rechts, 4 unten, 8 links)
  const win = Array(n * n).fill(0);
  if (FLOORS[type].windows) {
    for (let i = 0; i < n; i++) {
      const sides = [
        [i, 1],
        [i * n + n - 1, 2],
        [(n - 1) * n + i, 4],
        [i * n, 8],
      ];
      for (const [c, bit] of sides) if (Math.random() < 0.2) win[c] |= bit;
    }
  }
  return { t: type, rooms, names, items, win };
}

// Lösung: eine Person pro Zeile und Spalte, nur auf freien Feldern; im Raum des Opfers genau eine
// weitere Person (der Täter)
function placePeople(n, layout) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const cells = shuffle([...Array(n).keys()]).map((x, y) => y * n + x);
    if (!cells.every((c) => free(layout.items[c]))) continue;
    const perRoom = {};
    for (const c of cells) perRoom[layout.rooms[c]] = (perRoom[layout.rooms[c]] ?? 0) + 1;
    const pairs = cells.filter((c) => perRoom[layout.rooms[c]] === 2);
    if (!pairs.length) continue;
    const victim = pick(pairs);
    return [victim, ...shuffle(cells.filter((c) => c !== victim))]; // Person 0 ist das Opfer
  }
  return null;
}

// ---------- Hinweise und Löser ----------

// Ein Hinweis: { p: Person (−1 = über einen Raum), t: Art, ... }
// raum r · nicht r · auf k · neben k · fenster · allein · mit q · leer r (niemand im Raum)

// Bedingungen eines Hinweises: unary = [[p, (c) => bool]], binary = [[p, q, (cp, cq) => bool, key]]
// key(c) = was man über q wissen muss, um auf p zu schließen (Feld oder Raum), siehe propagate
function compile(fl, n, clue, unary, binary) {
  const me = clue.p;
  const sameRoom = (a, b) => fl.rooms[a] === fl.rooms[b];
  const roomKey = (c) => fl.rooms[c];
  switch (clue.t) {
    case 'raum':
      unary.push([me, (c) => fl.rooms[c] === clue.r]);
      break;
    case 'nicht':
      unary.push([me, (c) => fl.rooms[c] !== clue.r]);
      break;
    case 'auf':
      unary.push([me, (c) => fl.items[c] === clue.k]);
      break;
    case 'neben':
      unary.push([me, (c) => around(n, c).some((d) => fl.items[d] === clue.k)]);
      break;
    case 'fenster':
      unary.push([me, (c) => fl.win[c] !== 0]);
      break;
    case 'allein':
      for (let q = 0; q < n; q++) if (q !== me) binary.push([me, q, (a, b) => !sameRoom(a, b), roomKey]);
      break;
    case 'mit':
      binary.push([me, clue.q, sameRoom, roomKey]);
      break;
    case 'leer':
      for (let q = 0; q < n; q++) unary.push([q, (c) => fl.rooms[c] !== clue.r]);
      break;
  }
}

/**
 * Schließt aus, was nicht gehen kann, so wie ein Mensch mit Bleistift: Hinweise, eine Person pro Zeile
 * und Spalte (steht jemand fest, ist seine Zeile und Spalte für die anderen weg; hat eine Zeile nur noch
 * einen Kandidaten, steht er dort), Beziehungen zwischen zwei Personen.
 * level 1 und 2: Aus einer Beziehung folgt erst etwas, wenn man von der anderen Person weiß, wo bzw. in
 * welchem Raum sie war. Level 3 (schwer): jede Folgerung aus den Kandidaten beider, dazu Gruppen (passen
 * k Personen nur noch in k Zeilen, sind diese Zeilen für alle anderen weg).
 * Rückgabe: mögliche Felder pro Person oder null bei Widerspruch.
 */
function propagate(fl, n, clues, level = 2) {
  const subsets = level >= 3;
  const unary = [];
  const binary = [];
  for (const clue of clues) compile(fl, n, clue, unary, binary);
  const cells = [...Array(n * n).keys()].filter((c) => free(fl.items[c]));
  const D = Array.from({ length: n }, () => cells);
  for (const [p, test] of unary) D[p] = D[p].filter(test);
  const row = (c) => Math.floor(c / n);
  const col = (c) => c % n;
  const full = (1 << n) - 1;

  for (let round = 0; round < 200; round++) {
    let changed = false;
    const set = (p, next) => {
      if (next.length === D[p].length) return true;
      D[p] = next;
      changed = true;
      return next.length > 0;
    };
    for (const axis of [row, col]) {
      const bits = D.map((d) => d.reduce((m, c) => m | (1 << axis(c)), 0));
      // Gruppen von k Personen, die zusammen nur k Zeilen (Spalten) haben. Ohne subsets nur k = 1
      // (steht fest) und k = n − 1 (eine Zeile hat nur noch einen Kandidaten).
      for (let mask = 1; mask < full; mask++) {
        const k = popcount(mask);
        if (!subsets && k !== 1 && k !== n - 1) continue;
        let union = 0;
        for (let i = 0; i < n; i++) if (mask & (1 << i)) union |= bits[i];
        const u = popcount(union);
        if (u < k) return null;
        if (u > k) continue;
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) continue;
          if (!set(i, D[i].filter((c) => !(union & (1 << axis(c)))))) return null;
          bits[i] = D[i].reduce((m, c) => m | (1 << axis(c)), 0);
        }
      }
    }
    for (const [a, b, rel, key] of binary) {
      const ok = (x, y) => rel(x, y) && row(x) !== row(y) && col(x) !== col(y);
      const known = (p) => level >= 3 || D[p].every((c) => key(c) === key(D[p][0]));
      if (known(b) && !set(a, D[a].filter((x) => D[b].some((y) => ok(x, y))))) return null;
      if (known(a) && !set(b, D[b].filter((y) => D[a].some((x) => ok(x, y))))) return null;
    }
    if (!changed) break;
  }
  return D;
}

const solvedBy = (D) => Boolean(D) && D.every((d) => d.length === 1);

// Alle wahren Hinweise über eine Lösung, mit Gewicht (wie gern sie genommen werden)
function candidates(fl, n, sol) {
  const out = [];
  const roomOf = (p) => fl.rooms[sol[p]];
  for (let p = 0; p < n; p++) {
    const c = sol[p];
    const r = fl.rooms[c];
    const add = (clue, w) => out.push({ p, ...clue, w });
    add({ t: 'raum', r }, 3);
    for (let x = 0; x < fl.names.length; x++) if (x !== r) add({ t: 'nicht', r: x }, 0.4);
    if (fl.items[c]) add({ t: 'auf', k: fl.items[c] }, 3.5);
    for (const k of new Set(around(n, c).map((d) => fl.items[d]).filter(Boolean))) add({ t: 'neben', k }, 2.5);
    if (fl.win[c]) add({ t: 'fenster' }, 2);
    const mates = [...Array(n).keys()].filter((q) => q !== p && roomOf(q) === r);
    if (p !== 0 && !mates.length) add({ t: 'allein' }, 2);
    for (const q of mates) if (q > p && p !== 0 && q !== 0) add({ t: 'mit', q }, 2.5);
  }
  for (let r = 0; r < fl.names.length; r++) {
    if (![...Array(n).keys()].some((p) => roomOf(p) === r)) out.push({ p: -1, t: 'leer', r, w: 1 });
  }
  return out;
}

// Ein Fall mit Hinweisen: eindeutig lösbar mit dem Löser oben (also ohne Raten), jeder Hinweis wird
// gebraucht. Grundriss eines zufälligen Stockwerks (Räume und Möbel), aber immer nur einer.
function generate(n) {
  const level = n - 3;
  for (let attempt = 0; attempt < 200; attempt++) {
    const fl = buildLayout(n, pick(Object.keys(FLOORS)));
    const sol = fl && placePeople(n, fl);
    if (!sol) continue;
    const pool = candidates(fl, n, sol);
    const enough = (clues) => solvedBy(propagate(fl, n, clues, level));

    // Anfang: pro Person ein, zwei Hinweise nach Gewicht, dann zufällig weitere, bis alles feststeht
    const chosen = new Set();
    for (let p = 0; p < n; p++) {
      const own = pool.filter((c) => c.p === p);
      for (let i = 0; i < 1 + rnd(2) && own.length; i++) chosen.add(weighted(own, (c) => c.w));
    }
    for (let i = 0; i < 60 && !enough([...chosen]); i++) {
      const rest = pool.filter((c) => !chosen.has(c));
      if (!rest.length) break;
      chosen.add(weighted(rest, (c) => c.w));
    }
    if (!enough([...chosen])) continue;

    // Weglassen, was nicht gebraucht wird
    let clues = [...chosen];
    for (const c of shuffle([...clues])) {
      const without = clues.filter((x) => x !== c);
      if (enough(without)) clues = without;
    }
    // Leicht: Personen ohne Hinweis bekommen einen
    if (n === 4) {
      for (let p = 0; p < n; p++) {
        if (clues.some((c) => c.p === p)) continue;
        const extra = pool.filter((c) => c.p === p && c.t !== 'nicht');
        if (extra.length) clues.push(weighted(extra, (x) => x.w));
      }
    }
    return { ...fl, sol, clues };
  }
  return generate(n);
}

// ---------- Spielablauf (Server) ----------
// Züge: setzen { p, c } (c = −1: zurück in die Leiste), kreuz { c, v } (v = Kreuz an oder aus), leeren,
// notiz { p, r, v } (Feld der Notiztabelle auf v), notizen-leeren. Jeder darf alles, der letzte Zug gilt.

const SIZES = [5, 4, 6];
const ids = (s) => s.players.map((p) => p.id);

// Personen mit verschiedenen Anfangsbuchstaben (den tragen die Figuren)
function cast(n) {
  const out = [];
  for (const person of shuffle([...PEOPLE])) {
    if (out.length < n && !out.some((p) => p.name[0] === person.name[0])) out.push(person);
  }
  return out;
}

export function setup(players, options = {}) {
  const n = SIZES.includes(options.stufe) ? options.stufe : 5;
  const { sol, clues, ...layout } = generate(n);
  return {
    players: players.map(({ id, name }) => ({ id, name })),
    n,
    house: pick(HOUSES),
    crime: Math.random() < 0.5 ? 'mord' : pick(Object.keys(CRIMES).filter((k) => k !== 'mord')),
    ...layout, // t, rooms, names, items, win
    people: cast(n),
    clues: clues.map(({ w, ...c }) => c),
    sol,
    pos: Array(n).fill(-1),
    by: Array(n).fill(null), // wer die Person gesetzt hat
    marks: [],
    notes: Array(n * layout.names.length).fill(0), // Notiztabelle Personen × Räume: 0 leer, 1 Kreuz, 2 Haken
    last: null, // letzter Zug: { k: laufende Nummer, by, t, p, c }
    solved: false,
  };
}

/**
 * Ein Zug auf dem Stand { pos, by, marks, notes }, ohne Prüfung. Läuft auf dem Server und im Browser,
 * der eigene Züge sofort zeigt und sie auf jeden neuen Stand des Servers noch einmal anwendet, bis sie
 * dort angekommen sind. Deshalb ändert ein Zug nichts, wenn er zweimal kommt (Kreuz an statt umschalten).
 * k = Zahl der Räume (Spalten der Notiztabelle).
 */
function move(st, k, player, type, data) {
  const n = st.pos.length;
  if (type === 'setzen') {
    const { p, c } = data;
    if (c >= 0) {
      const there = st.pos.indexOf(c);
      if (there >= 0 && there !== p) {
        st.pos[there] = -1; // wer dort stand, geht zurück in die Leiste
        st.by[there] = null;
      }
      st.marks = st.marks.filter((x) => x !== c);
    }
    if (st.pos[p] !== c) st.by[p] = c >= 0 ? player : null;
    st.pos[p] = c;
  } else if (type === 'kreuz') {
    if (st.pos.includes(data.c)) return;
    const has = st.marks.includes(data.c);
    const on = typeof data.v === 'boolean' ? data.v : !has;
    if (on && !has) st.marks = [...st.marks, data.c];
    if (!on && has) st.marks = st.marks.filter((x) => x !== data.c);
  } else if (type === 'leeren') {
    st.pos = Array(n).fill(-1);
    st.by = Array(n).fill(null);
    st.marks = [];
  } else if (type === 'notiz') {
    st.notes[data.p * k + data.r] = data.v;
  } else if (type === 'notizen-leeren') {
    st.notes = st.notes.map(() => 0);
  }
}

export function action(s, { player, type, data }) {
  if (s.result || s.solved || !ids(s).includes(player)) return;
  const n = s.n;
  const k = s.names.length;
  const c = data?.c;
  const validCell = Number.isInteger(c) && c >= 0 && c < n * n;
  if (type === 'setzen') {
    const p = data?.p;
    if (!Number.isInteger(p) || p < 0 || p >= n) throw new Error('Diese Person gibt es nicht.');
    if (c !== -1 && !validCell) throw new Error('Dieses Feld gibt es nicht.');
    if (c !== -1 && !free(s.items[c])) throw new Error(`Auf ${ITEMS[s.items[c]]?.dat ?? 'diesem Feld'} kann niemand stehen.`);
  } else if (type === 'kreuz') {
    if (!validCell) throw new Error('Dieses Feld gibt es nicht.');
    if (!free(s.items[c])) return;
  } else if (type === 'notiz') {
    const { p, r, v } = data ?? {};
    if (!Number.isInteger(p) || p < 0 || p >= n || !Number.isInteger(r) || r < 0 || r >= k || ![0, 1, 2].includes(v)) {
      throw new Error('Diese Notiz gibt es nicht.');
    }
  } else if (type !== 'leeren' && type !== 'notizen-leeren') {
    return;
  }
  s.by ??= Array(n).fill(null);
  s.notes ??= Array(n * k).fill(0);
  const before = JSON.stringify([s.pos, s.by, s.marks, s.notes]);
  move(s, k, player, type, data);
  if (JSON.stringify([s.pos, s.by, s.marks, s.notes]) === before) return; // nichts geändert: nicht speichern
  // Was zuletzt passiert ist, damit die anderen sehen, von wem es kam
  s.last = { k: (s.last?.k ?? 0) + 1, by: player, t: type };
  if (type === 'setzen') Object.assign(s.last, { p: data.p, c });
  if (s.pos.every((x, i) => x === s.sol[i])) {
    s.solved = true;
    s.result = { winners: ids(s), text: `Der Fall ${houseIn(s.house)} ist gelöst.` };
  }
}

// Partien von vor dem gemeinsamen Fall (jeder ein Stockwerk): mit einem neuen Fall weiterspielen
export function tick(s) {
  if (Array.isArray(s.floors)) return setup(s.players, { stufe: s.n });
}

// Alle können jederzeit etwas tun
export function waitingFor(s) {
  return s.result ? [] : ids(s);
}

// Keine Nachricht bei jedem Setzen; Start und Ende meldet die Plattform
export function notices() {
  return [];
}

// Geheim ist nur die Lösung, bis der Fall gelöst ist
export function view(s) {
  return s.solved ? s : { ...s, sol: null };
}

// ---------- Anzeige (nur im Browser) ----------

// Palette (Skill „zeichnen“): Tusche, flache Druckfarben, Licht von oben links
const INK = '#141414';
const PAPER = '#fffdf8';
const C = {
  holz: '#c58a4b', holzHell: '#dcae76', holzDunkel: '#8a5a2b',
  rost: '#c0622b', rostDunkel: '#97461a', ocker: '#e0b04a',
  gruen: '#2e7d4f', gruenHell: '#5a9e6f', gruenDunkel: '#215c39',
  blau: '#3a6b98', blauHell: '#6f97bd', eisen: '#3b3b3b', eisenHell: '#6a6a6a',
  wasser: '#cfe2ec', kiste: '#d3ad66', stempel: '#a8322a',
};
// Fußböden: Fläche und Fugen
const FLOOR_ART = {
  holz: { fill: '#f4e8d3', line: '#e5d1b0' },
  fliese: { fill: '#eef1ee', line: '#d6ddd8' },
  stein: { fill: '#ece7de', line: '#d8cfc0' },
};

// Möbel von oben, im Feld 0..100, Lehne bzw. Kopfende oben (gedreht wird beim Einsetzen)
const sw = (w = 3.6) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const ITEM_ART = {
  stuhl: `<g ${sw()}>
    <rect x="29" y="33" width="42" height="42" rx="8" fill="${C.holzHell}"/>
    <circle cx="50" cy="56" r="12" fill="${C.rost}" stroke-width="2.4"/>
    <path d="M43 50 Q46 46 51 45.5" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
    <path d="M24 33 Q50 15 76 33 L72 40 Q50 25 28 40 Z" fill="${C.holzDunkel}"/>
    <path d="M33 30 Q42 24.5 50 24" fill="none" stroke="#fff" stroke-width="2" opacity=".4"/>
  </g>`,
  sessel: `<g ${sw()}>
    <rect x="30" y="34" width="40" height="48" rx="6" fill="${C.gruenHell}"/>
    <path d="M36 72 H64" stroke-width="1.8" opacity=".5"/>
    <rect x="13" y="25" width="19" height="60" rx="8" fill="${C.gruen}"/>
    <rect x="68" y="25" width="19" height="60" rx="8" fill="${C.gruen}"/>
    <rect x="15" y="13" width="70" height="22" rx="9" fill="${C.gruenDunkel}"/>
    <path d="M24 20 Q34 17 46 17" fill="none" stroke="#fff" stroke-width="2.4" opacity=".4"/>
    <path d="M18 34 V48" stroke="#fff" stroke-width="2.4" opacity=".35"/>
  </g>`,
  bett: `<g ${sw()}>
    <rect x="17" y="7" width="66" height="86" rx="4" fill="${C.holz}"/>
    <rect x="21" y="13" width="58" height="76" rx="3" fill="#fff" stroke-width="2.6"/>
    <rect x="28" y="17" width="44" height="17" rx="7" fill="#fff" stroke-width="2.6"/>
    <path d="M34 25 Q50 22 66 25" fill="none" stroke-width="1.6" opacity=".45"/>
    <path d="M21 42 H79 V86 Q79 89 76 89 H24 Q21 89 21 86 Z" fill="${C.blau}" stroke-width="2.6"/>
    <path d="M21 48 H79" stroke="#fff" stroke-width="3" opacity=".75"/>
    <path d="M30 60 L44 74 M44 60 L58 74 M58 60 L72 74" stroke="${C.blauHell}" stroke-width="2.4"/>
    <rect x="17" y="7" width="66" height="6" fill="${C.holzDunkel}" stroke-width="2.6"/>
  </g>`,
  teppich: `<g ${sw(3)}>
    <path d="${Array.from({ length: 8 }, (_, i) => `M8 ${26 + i * 7} H14 M86 ${26 + i * 7} H92`).join(' ')}" stroke-width="2"/>
    <rect x="13" y="20" width="74" height="60" rx="2" fill="${C.rost}"/>
    <rect x="20" y="27" width="60" height="46" rx="1" fill="none" stroke="${C.ocker}" stroke-width="3.2"/>
    <path d="M50 35 L64 50 L50 65 L36 50 Z" fill="${C.ocker}" stroke-width="2.4"/>
    <circle cx="50" cy="50" r="4" fill="${C.rostDunkel}" stroke-width="1.8"/>
  </g>`,
  tisch: `<g ${sw()}>
    <circle cx="50" cy="50" r="33" fill="${C.holz}"/>
    <circle cx="50" cy="50" r="26" fill="none" stroke="${C.holzDunkel}" stroke-width="2.2"/>
    <path d="M28 36 Q34 26 45 22.5" fill="none" stroke="#fff" stroke-width="2.6" opacity=".45"/>
    <circle cx="45" cy="47" r="10.5" fill="#fff" stroke-width="2.4"/>
    <circle cx="45" cy="47" r="5.5" fill="none" stroke-width="1.6" opacity=".45"/>
    <path d="M68 61 h4.5" stroke-width="3"/>
    <circle cx="63" cy="62" r="6" fill="#fff" stroke-width="2.2"/>
    <circle cx="63" cy="62" r="3" fill="${C.holzDunkel}" stroke-width="1.2"/>
  </g>`,
  pflanze: `<g ${sw(2.6)}>
    ${Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * 360 + 12;
      const fill = i % 2 ? C.gruenHell : C.gruen;
      return `<g transform="rotate(${a.toFixed(1)} 50 50)"><path d="M50 50 Q38 32 50 11 Q62 32 50 50 Z" fill="${fill}"/><path d="M50 46 V18" stroke-width="1.4" opacity=".55"/></g>`;
    }).join('')}
    <circle cx="50" cy="50" r="13" fill="${C.rost}" stroke-width="3.2"/>
    <circle cx="50" cy="50" r="8.5" fill="#6b4a2b" stroke-width="1.8"/>
  </g>`,
  regal: `<g ${sw()}>
    <rect x="6" y="9" width="88" height="34" rx="2" fill="${C.holzDunkel}"/>
    ${[[11, 9, C.rost], [21, 7, C.blau], [29, 10, C.ocker], [40, 6, C.gruen], [47, 9, '#fff'], [57, 8, C.rost], [66, 6, INK], [73, 10, C.blauHell], [84, 6, C.gruen]]
      .map(([x, w, c], i) => `<rect x="${x}" y="${i % 3 === 1 ? 17 : 14}" width="${w}" height="${i % 3 === 1 ? 21 : 24}" fill="${c}" stroke-width="1.8"/>`)
      .join('')}
    <path d="M6 43 H94" stroke-width="4"/>
  </g>`,
  kiste: `<g ${sw()}>
    <rect x="17" y="17" width="66" height="66" rx="2" fill="${C.kiste}"/>
    <path d="M17 39 H83 M17 61 H83" stroke-width="2.2"/>
    <rect x="17" y="17" width="66" height="66" rx="2" fill="none" stroke-width="7" stroke="${C.holzDunkel}"/>
    <rect x="17" y="17" width="66" height="66" rx="2" fill="none"/>
    <path d="M24 76 L76 24" stroke="${C.holzDunkel}" stroke-width="8" stroke-linecap="butt"/>
    <path d="M22 72 L72 22 M28 78 L78 28" stroke-width="1.6"/>
    <g fill="${INK}" stroke="none"><circle cx="22" cy="22" r="2.2"/><circle cx="78" cy="22" r="2.2"/><circle cx="22" cy="78" r="2.2"/><circle cx="78" cy="78" r="2.2"/></g>
  </g>`,
  fass: `<g ${sw()}>
    <circle cx="50" cy="50" r="35" fill="${C.holz}"/>
    <circle cx="50" cy="50" r="30" fill="none" stroke="#4a4a4a" stroke-width="5"/>
    <circle cx="50" cy="50" r="35" fill="none"/>
    <circle cx="50" cy="50" r="25.5" fill="${C.holzHell}" stroke-width="2.2"/>
    <path d="M37.5 28 V72 M50 24.5 V75.5 M62.5 28 V72" stroke-width="1.6" opacity=".7"/>
    <circle cx="58" cy="58" r="4" fill="${C.holzDunkel}" stroke-width="1.8"/>
    <path d="M30 34 Q35 26 44 23" fill="none" stroke="#fff" stroke-width="2.4" opacity=".5"/>
  </g>`,
  herd: `<g ${sw()}>
    <rect x="10" y="12" width="80" height="78" rx="4" fill="${C.eisen}"/>
    <rect x="10" y="76" width="80" height="14" rx="3" fill="${C.eisenHell}"/>
    <g fill="${C.eisenHell}" stroke-width="2.2"><circle cx="31" cy="35" r="11"/><circle cx="31" cy="60" r="9"/><circle cx="69" cy="60" r="9"/></g>
    <g fill="none" stroke="#9a9a9a" stroke-width="1.6"><circle cx="31" cy="35" r="6"/><circle cx="31" cy="60" r="4.5"/><circle cx="69" cy="60" r="4.5"/></g>
    <path d="M80 34 H92" stroke-width="4.2"/>
    <circle cx="68" cy="34" r="14" fill="${C.rost}"/>
    <circle cx="68" cy="34" r="9.5" fill="${C.rostDunkel}" stroke-width="2"/>
    <path d="M60 27 Q63 23 68 22" fill="none" stroke="#fff" stroke-width="2.2" opacity=".55"/>
    <g fill="#fff" stroke-width="1.6"><circle cx="24" cy="83" r="3"/><circle cx="40" cy="83" r="3"/><circle cx="60" cy="83" r="3"/><circle cx="76" cy="83" r="3"/></g>
  </g>`,
  wanne: `<g ${sw()}>
    <rect x="15" y="6" width="70" height="88" rx="18" fill="#fff"/>
    <rect x="23" y="17" width="54" height="69" rx="14" fill="${C.wasser}" stroke-width="2.4"/>
    <path d="M31 30 Q35 24 42 23" fill="none" stroke="#fff" stroke-width="2.6"/>
    <path d="M36 52 Q42 49 48 52 T60 52 M42 63 Q48 60 54 63 T66 63" fill="none" stroke="${C.blauHell}" stroke-width="2"/>
    <rect x="44" y="5" width="12" height="9" rx="2" fill="#c9c9c9" stroke-width="2.4"/>
    <circle cx="50" cy="76" r="3.2" fill="#fff" stroke-width="1.8"/>
  </g>`,
  klavier: `<g ${sw()}>
    <path d="M20 83 V24 Q20 9 35 9 Q51 9 55 27 Q59 45 73 50 Q84 54 84 67 V83 Z" fill="#1e1e1e"/>
    <path d="M26 79 V27 Q26 15 36 15 Q47 15 50 30 Q54 49 70 55 Q78 58 78 68 V79" fill="none" stroke="#5c5c5c" stroke-width="2"/>
    <path d="M33 74 L46 22 M41 74 L52 44 M49 74 L58 52 M57 74 L64 60" stroke="#7a7a7a" stroke-width="1.4"/>
    <path d="M28 18 Q32 14 37 13" fill="none" stroke="#fff" stroke-width="2.2" opacity=".5"/>
    <rect x="18" y="81" width="68" height="12" rx="1.5" fill="#fff"/>
    <path d="${Array.from({ length: 9 }, (_, i) => `M${25 + i * 7} 81 V88`).join(' ')}" stroke-width="3"/>
  </g>`,
};

// Spielfigur mit Hut nach Rolle (seitlich, steht auf dem Grundriss), viewBox 0 0 40 48
const HATS = {
  zylinder: `<g ${sw(1.5)}><rect x="14" y="-1.5" width="12" height="10" rx="1" fill="${INK}"/><path d="M14 5.4 H26" stroke="#9a2a24" stroke-width="2"/><ellipse cx="20" cy="9" rx="10" ry="2.3" fill="${INK}"/></g>`,
  melone: `<g ${sw(1.5)}><path d="M13 9 Q13 0.5 20 0.5 Q27 0.5 27 9 Z" fill="${INK}"/><ellipse cx="20" cy="9" rx="10.5" ry="2.2" fill="${INK}"/><path d="M16 4 Q17.5 2.2 20 2" fill="none" stroke="#fff" stroke-width="1" opacity=".5"/></g>`,
  koch: `<g ${sw(1.4)}><rect x="14" y="5" width="12" height="5.5" fill="#fff"/><path d="M13 6 Q10 2 13.5 -0.5 Q15 -4 19 -2.5 Q22 -5 25 -2 Q29.5 -2 27.5 2.5 Q29.5 5.5 27 6.5 Z" fill="#fff"/></g>`,
  haube: `<g ${sw(1.4)}><path d="M11.5 11 Q11 3.5 20 3.2 Q29 3.5 28.5 11 Q26.5 7.5 20 7.5 Q13.5 7.5 11.5 11 Z" fill="#fff"/><path d="M14 6.5 L15 4.5 M18 5.4 L18.5 3.4 M22 5.4 L21.5 3.4 M26 6.5 L25 4.5" stroke-width="1"/></g>`,
  diadem: `<g ${sw(1.3)}><path d="M13 9.5 L14.5 4 L17.2 7.5 L20 2.5 L22.8 7.5 L25.5 4 L27 9.5 Z" fill="${C.ocker}"/><circle cx="20" cy="6.3" r="1.2" fill="${C.rost}" stroke-width="0.9"/></g>`,
  muetze: `<g ${sw(1.4)}><path d="M12 8.5 Q12 2.5 20 2.5 Q28 2.5 28 8.5 Z" fill="${C.blau}"/><path d="M12 8.5 H28 V10.3 H12 Z" fill="${INK}"/><path d="M19 10.3 Q26 10.5 30 12.5 Q24 13.2 19 11.8 Z" fill="${INK}"/><circle cx="20" cy="5.6" r="1.4" fill="${C.ocker}" stroke-width="0.9"/></g>`,
  barett: `<g ${sw(1.4)}><path d="M10.5 9 Q9 3 19 2.5 Q30 2.2 30.5 6.5 Q30 9.5 27 9.8 Q20 8 13 10 Z" fill="${INK}"/><path d="M14 5.5 Q17 3.8 21 3.6" fill="none" stroke="#fff" stroke-width="1" opacity=".45"/><path d="M20 2.6 L21 0.2" stroke-width="1.6"/></g>`,
  strohhut: `<g ${sw(1.4)}><ellipse cx="20" cy="9" rx="13" ry="2.8" fill="${C.ocker}"/><path d="M14.5 8.8 Q14.5 2 20 2 Q25.5 2 25.5 8.8 Z" fill="${C.ocker}"/><path d="M14.6 6.4 H25.4" stroke="${C.rost}" stroke-width="1.8"/></g>`,
  schleier: `<g ${sw(1.4)}><path d="M12.5 10.5 Q20 14.5 27.5 10.5 L26.5 15.5 Q20 17.6 13.5 15.5 Z" fill="${INK}" fill-opacity=".35" stroke-width="0.9"/><path d="M14.5 12.3 L15.5 16 M18 13.3 L18.4 16.9 M22 13.3 L21.6 16.9 M25.5 12.3 L24.5 16" stroke-width="0.7" opacity=".7"/><path d="M14 8.5 Q14 2.6 20 2.6 Q26 2.6 26 8.5 Z" fill="${INK}"/><ellipse cx="20" cy="9" rx="10.5" ry="2" fill="${INK}"/><path d="M23 4 Q26 1 29 2.6 Q26.5 4 25 6" fill="${C.stempel}" stroke-width="1"/></g>`,
};
const HAT_OF = {
  Butler: 'zylinder', Notarin: 'melone', Juwelier: 'zylinder', Kunsthändler: 'zylinder', Verlegerin: 'barett',
  Köchin: 'koch', Hausdame: 'haube', Zofe: 'haube', Magd: 'haube', Gouvernante: 'haube',
  Gräfin: 'diadem', Erbin: 'diadem', Mäzenin: 'diadem', Opernsängerin: 'diadem', Sängerin: 'diadem',
  Kapitän: 'muetze', Chauffeur: 'muetze', Major: 'muetze', Oberst: 'muetze', Leutnant: 'muetze', Hausmeister: 'muetze',
  Malerin: 'barett', Fotograf: 'barett', Erfinderin: 'barett', Varietékünstler: 'zylinder',
  Gärtner: 'strohhut', Förster: 'strohhut', Imkerin: 'strohhut', Archäologin: 'strohhut', Reiseleiterin: 'strohhut',
  Witwe: 'schleier', Wahrsagerin: 'schleier', Tante: 'melone', Doktor: 'melone', Uhrmacher: 'melone',
  Reporterin: 'melone', Lehrerin: 'haube', Pfarrer: null, Boxer: null, Tänzer: null, Sommelier: null, Zahnarzt: null,
};
// Farben der Verdächtigen: Körper, Licht (oben links), Schatten
const SUSPECT = [
  ['#c0622b', '#d9864f', '#97461a'],
  ['#2e7d4f', '#4f9a6c', '#215c39'],
  ['#3a6b98', '#6290bb', '#2a5075'],
  ['#c99a2e', '#ddb75a', '#9c7520'],
  ['#8c4a5a', '#a96a79', '#6b3442'],
  ['#4f6b6b', '#718c8c', '#3a5050'],
];
const VICTIM = [PAPER, '#ffffff', '#e4ddd0'];

// Figur: Sockel, Glockenkörper mit Schatten rechts, Kragen, Kopf mit Licht, Hut, Anfangsbuchstabe
function pawn(person, i, extra = '') {
  const [body, light, dark] = i === 0 ? VICTIM : SUSPECT[(i - 1) % SUSPECT.length];
  const hat = HATS[HAT_OF[person.role]] ?? '';
  const letter = i === 0 ? INK : '#fff';
  return `<svg class="kd-pawn ${extra}" viewBox="0 0 40 48" aria-hidden="true">
    <g ${sw(1.6)}>
      <ellipse cx="20" cy="42.5" rx="14.5" ry="4.2" fill="${dark}"/>
      <path d="M13.2 23.5 Q12.6 33 7.6 40.6 Q20 44.6 32.4 40.6 Q27.4 33 26.8 23.5 Z" fill="${body}"/>
      <path d="M24.4 25.5 Q25.4 34 29.6 40.9 Q27.6 41.8 25.4 42.2 Q22.6 34.5 22.4 25.6 Z" fill="${dark}" stroke="none"/>
      <path d="M15.3 27 Q14.7 32.5 12.3 37" fill="none" stroke="${light}" stroke-width="1.8"/>
      <ellipse cx="20" cy="23.6" rx="8.4" ry="2.6" fill="${body}"/>
      <circle cx="20" cy="14.6" r="7.6" fill="${body}"/>
      <path d="M24.5 10.4 A7.6 7.6 0 0 1 22 21.9 A6.6 6.6 0 0 0 24.5 10.4 Z" fill="${dark}" stroke="none"/>
      <path d="M15.6 11.6 Q16.8 9.4 19.2 8.9" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>
    </g>
    ${hat}
    <text x="20" y="37.6" text-anchor="middle" style="font:800 11.5px var(--font-display)" fill="${letter}">${person.name[0]}</text>
  </svg>`;
}

// ---------- Grundriss als SVG (100 Einheiten pro Feld) ----------

const WALL = 7; // Innenwände
const OUTER = 11; // Außenwand
const coord = (n, c) => `${'ABCDEF'[c % n]}${Math.floor(c / n) + 1}`;
const roomCells = (fl, r) => fl.rooms.map((x, c) => (x === r ? c : -1)).filter((c) => c >= 0);

// Wohin ein Möbel schaut: Lehne, Kopfende und Regalrücken an die Wand (oben, links, rechts, unten)
function facing(fl, n, c) {
  const item = fl.items[c];
  if (!['stuhl', 'sessel', 'bett', 'klavier', 'wanne', 'regal', 'herd'].includes(item)) return 0;
  const x = c % n;
  const y = Math.floor(c / n);
  const wall = (dx, dy) => {
    const xx = x + dx;
    const yy = y + dy;
    return xx < 0 || yy < 0 || xx >= n || yy >= n || fl.rooms[yy * n + xx] !== fl.rooms[c];
  };
  const table = (dx, dy) => fl.items[(y + dy) * n + x + dx] === 'tisch' && !wall(dx, dy);
  // Stühle mit dem Rücken zum Tisch weg, sonst an die Wand
  if (item === 'stuhl') {
    if (table(0, 1)) return 0;
    if (table(0, -1)) return 180;
    if (table(1, 0)) return -90;
    if (table(-1, 0)) return 90;
  }
  if (wall(0, -1)) return 0;
  if (wall(-1, 0)) return -90;
  if (wall(1, 0)) return 90;
  if (wall(0, 1)) return 180;
  return (c * 7) % 4 === 0 ? 180 : 0;
}

// Fugen und Dielen eines Feldes
function floorLines(kind, x0, y0) {
  const d = [];
  if (kind === 'fliese') {
    for (const k of [33.3, 66.7]) d.push(`M${x0} ${y0 + k}h100M${x0 + k} ${y0}v100`);
  } else if (kind === 'stein') {
    d.push(`M${x0} ${y0 + 50}h100M${x0 + 50} ${y0}v50M${x0 + 20} ${y0 + 50}v50M${x0 + 80} ${y0 + 50}v50`);
  } else {
    for (const k of [25, 50, 75]) d.push(`M${x0} ${y0 + k}h100`);
    d.push(`M${x0 + 30} ${y0}v25M${x0 + 70} ${y0 + 25}v25M${x0 + 15} ${y0 + 50}v25M${x0 + 55} ${y0 + 75}v25`);
  }
  return d.join('');
}

// Wandstücke zwischen verschiedenen Räumen, zu langen Linien zusammengefasst
function wallLines(fl, n) {
  const v = [];
  const h = [];
  for (let c = 0; c < n * n; c++) {
    const x = c % n;
    const y = Math.floor(c / n);
    if (x < n - 1 && fl.rooms[c] !== fl.rooms[c + 1]) v.push([(x + 1) * 100, y * 100]);
    if (y < n - 1 && fl.rooms[c] !== fl.rooms[c + n]) h.push([x * 100, (y + 1) * 100]);
  }
  const lines = [];
  const merge = (segs, vertical) => {
    segs.sort((a, b) => (vertical ? a[0] - b[0] || a[1] - b[1] : a[1] - b[1] || a[0] - b[0]));
    for (const [x, y] of segs) {
      const last = lines[lines.length - 1];
      if (last && last.v === vertical && (vertical ? last.x1 === x && last.y2 === y : last.y1 === y && last.x2 === x)) {
        if (vertical) last.y2 += 100;
        else last.x2 += 100;
      } else {
        lines.push(vertical ? { v: true, x1: x, y1: y, x2: x, y2: y + 100 } : { v: false, x1: x, y1: y, x2: x + 100, y2: y });
      }
    }
  };
  merge(v, true);
  merge(h, false);
  return lines;
}

// Türen: Die Räume hängen über einen Baum aus Türen zusammen (immer derselbe, aus dem Grundriss berechnet)
function doors(fl, n) {
  const between = new Map();
  for (let c = 0; c < n * n; c++) {
    const x = c % n;
    const y = Math.floor(c / n);
    for (const [d, vertical] of [
      [x < n - 1 ? c + 1 : -1, true],
      [y < n - 1 ? c + n : -1, false],
    ]) {
      if (d < 0 || fl.rooms[c] === fl.rooms[d]) continue;
      const a = Math.min(fl.rooms[c], fl.rooms[d]);
      const b = Math.max(fl.rooms[c], fl.rooms[d]);
      const key = `${a}-${b}`;
      if (!between.has(key)) between.set(key, []);
      between.get(key).push({ c, d, vertical });
    }
  }
  const linked = new Set([0]);
  const out = [];
  const k = fl.names.length;
  for (let guard = 0; guard < k * k && linked.size < k; guard++) {
    for (const [key, edges] of between) {
      const [a, b] = key.split('-').map(Number);
      if (linked.has(a) === linked.has(b)) continue;
      // Am liebsten eine Stelle, an der die Tür in ein freies Feld aufgeht
      const open = edges.filter((x) => !fl.items[x.c] || !fl.items[x.d]);
      const e = open.length ? open[Math.floor(open.length / 2)] : edges[Math.floor(edges.length / 2)];
      out.push({ ...e, into: fl.items[e.d] && !fl.items[e.c] ? e.c : e.d });
      linked.add(a);
      linked.add(b);
    }
  }
  return out;
}

function doorSvg(fl, n, { c, vertical, into }) {
  const x = c % n;
  const y = Math.floor(c / n);
  const floorKind = ROOMS[fl.names[fl.rooms[into]]]?.floor ?? 'holz';
  const gapColor = FLOOR_ART[floorKind].fill;
  const side = into === c ? -1 : 1; // in das Feld links bzw. oben oder rechts bzw. unten
  if (vertical) {
    const X = (x + 1) * 100;
    const y0 = y * 100;
    return `<path d="M${X} ${y0 + 27} V${y0 + 73}" stroke="${gapColor}" stroke-width="${WALL + 2}"/>
      <path d="M${X} ${y0 + 27} H${X + side * 46} M${X + side * 46} ${y0 + 27} A46 46 0 0 ${side > 0 ? 1 : 0} ${X} ${y0 + 73}" class="kd-door"/>
      <path d="M${X - 4.5} ${y0 + 27}H${X + 4.5}M${X - 4.5} ${y0 + 73}H${X + 4.5}" stroke="${INK}" stroke-width="3"/>`;
  }
  const Y = (y + 1) * 100;
  const x0 = x * 100;
  return `<path d="M${x0 + 27} ${Y} H${x0 + 73}" stroke="${gapColor}" stroke-width="${WALL + 2}"/>
    <path d="M${x0 + 27} ${Y} V${Y + side * 46} M${x0 + 27} ${Y + side * 46} A46 46 0 0 ${side > 0 ? 0 : 1} ${x0 + 73} ${Y}" class="kd-door"/>
    <path d="M${x0 + 27} ${Y - 4.5}V${Y + 4.5}M${x0 + 73} ${Y - 4.5}V${Y + 4.5}" stroke="${INK}" stroke-width="3"/>`;
}

// Fenster in der Außenwand: Lücke mit Glas (zwei feine Linien)
function windowSvg(n, c, bit) {
  const x = (c % n) * 100;
  const y = Math.floor(c / n) * 100;
  const W = n * 100;
  const [x1, y1, x2, y2] = {
    1: [x + 22, 0, x + 78, 0],
    2: [W, y + 22, W, y + 78],
    4: [x + 22, W, x + 78, W],
    8: [0, y + 22, 0, y + 78],
  }[bit];
  const vertical = x1 === x2;
  const t = OUTER / 2;
  const rect = vertical ? `x="${x1 - t}" y="${y1}" width="${OUTER}" height="${y2 - y1}"` : `x="${x1}" y="${y1 - t}" width="${x2 - x1}" height="${OUTER}"`;
  return `<rect ${rect} fill="${PAPER}" stroke="${INK}" stroke-width="2.4"/>
    <path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="1.6"/>`;
}

// Raumname in der Ecke oben links; zu breit für die Zeile, aber hoch genug: senkrecht an der linken Wand
function labelSvg(fl, n, r, size) {
  const cells = roomCells(fl, r);
  const c = Math.min(...cells);
  const x = c % n;
  const y = Math.floor(c / n);
  let run = 0;
  while (x + run < n && fl.rooms[y * n + x + run] === r) run++;
  let down = 0;
  while (y + down < n && fl.rooms[(y + down) * n + x] === r) down++;
  const name = ROOMS[fl.names[r]]?.name ?? '';
  const width = name.length * size * 0.5;
  let font = size;
  let vertical = false;
  if (width > run * 100 - 16) {
    if (down > run && width <= down * 100 - 16) vertical = true;
    else font = Math.max(size * 0.72, (size * (run * 100 - 16)) / width);
  }
  const tx = x * 100 + 9;
  const ty = y * 100 + 9;
  const attrs = `class="kd-label" style="font-size:${font.toFixed(1)}px"`;
  return vertical
    ? `<text ${attrs} transform="translate(${tx + font * 0.15} ${ty}) rotate(90)" dy="${(-font * 0.05).toFixed(1)}">${name}</text>`
    : `<text ${attrs} x="${tx}" y="${(ty + font * 0.82).toFixed(1)}">${name}</text>`;
}

// Der ganze Grundriss eines Stockwerks
function planSvg(fl, n) {
  const W = n * 100;
  const size = 3.4 * n + 2;
  let rooms = '';
  for (let r = 0; r < fl.names.length; r++) {
    const kind = ROOMS[fl.names[r]]?.floor ?? 'holz';
    const cells = roomCells(fl, r);
    const area = cells.map((c) => `M${(c % n) * 100} ${Math.floor(c / n) * 100}h100v100h-100Z`).join('');
    const lines = cells.map((c) => floorLines(kind, (c % n) * 100, Math.floor(c / n) * 100)).join('');
    const items = cells
      .filter((c) => fl.items[c] && ITEM_ART[fl.items[c]])
      .map((c) => {
        const x = c % n;
        const y = Math.floor(c / n);
        const scale = fl.items[c] === 'teppich' ? 1 : 0.86;
        return `<g transform="translate(${x * 100 + 50} ${y * 100 + 50})"><g class="kd-item" style="--d:${(x + y) * 45}ms">
          <g transform="rotate(${facing(fl, n, c)}) scale(${scale}) translate(-50 -50)">${ITEM_ART[fl.items[c]]}</g></g></g>`;
      })
      .join('');
    rooms += `<g class="kd-room" data-r="${r}"><path d="${area}" fill="${FLOOR_ART[kind].fill}"/>
      <path d="${lines}" fill="none" stroke="${FLOOR_ART[kind].line}" stroke-width="2"/>
      ${items}</g>`;
  }
  const ds = doors(fl, n);
  const swings = ds.map((d) => doorSvg(fl, n, d)).join('');
  const walls = wallLines(fl, n)
    .map((l, i) => `<line pathLength="1" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" style="--d:${Math.min(600, i * 45)}ms"/>`)
    .join('');
  const wins = [];
  for (let c = 0; c < n * n; c++) for (const bit of [1, 2, 4, 8]) if (fl.win[c] & bit) wins.push(windowSvg(n, c, bit));
  const labels = fl.names.map((_, r) => labelSvg(fl, n, r, size)).join('');
  return `<svg class="kd-plan-svg" viewBox="-8 -8 ${W + 16} ${W + 16}" aria-hidden="true">
    <g class="kd-rooms">${rooms}</g>
    <g class="kd-walls" stroke="${INK}" stroke-width="${WALL}" stroke-linecap="square">${walls}
      <rect class="kd-outer" pathLength="1" x="0" y="0" width="${W}" height="${W}" fill="none" stroke-width="${OUTER}"/></g>
    <g class="kd-doors" fill="none">${swings}</g>
    <g class="kd-windows">${wins.join('')}</g>
    <g class="kd-labels">${labels}</g>
    <g class="kd-solved"></g>
  </svg>`;
}

// ---------- Kleine Zeichnungen ----------

const CHECK = '<svg class="kd-check" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M4 10.5 L8.5 15 L16 5"/></svg>';
const CROSS_ICON = '<svg class="kd-cross" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M5 5 L15 15"/><path pathLength="1" d="M15 5 L5 15"/></svg>';
const XMARK = '<svg class="kd-x" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M28 28 L72 72"/><path pathLength="1" d="M72 28 L28 72"/></svg>';
const STAMP = `<svg class="kd-stamp" viewBox="0 0 120 44" aria-hidden="true">
  <rect x="4" y="4" width="112" height="36" rx="4" fill="${PAPER}" fill-opacity=".85" stroke="${C.stempel}" stroke-width="4"/>
  <rect x="9" y="9" width="102" height="26" rx="2" fill="none" stroke="${C.stempel}" stroke-width="1.6"/>
  <text x="60" y="31.5" text-anchor="middle" style="font:900 25px var(--font-display);letter-spacing:4px" fill="${C.stempel}">TÄTER</text>
</svg>`;

// Dach mit Schornstein, neben dem Namen des Hauses
const ROOF = `<svg class="kd-roof-svg" viewBox="0 0 80 34" aria-hidden="true"><g ${sw(2.2)}>
  <path d="M55 6 H63 V20 H55 Z" fill="${C.rost}"/><path d="M53.5 4 H64.5 V7.5 H53.5 Z" fill="${INK}"/>
  <path d="M3 33 L40 6 L77 33 Z" fill="${C.rostDunkel}"/>
  <path d="M14 25 L40 7.5 M23 28 L45 12 M33 31 L52 17" stroke="#fff" stroke-width="1.2" opacity=".35"/>
  <circle cx="40" cy="22" r="4.2" fill="${PAPER}"/><path d="M40 18 V26 M36 22 H44" stroke-width="1.2"/>
</g></svg>`;

// ---------- Hilfen für die Anzeige ----------

const shownHtml = new WeakMap();
// HTML nur setzen, wenn es sich geändert hat (Knöpfe bleiben unter dem Finger)
function put(el, html) {
  if (!el || shownHtml.get(el) === html) return false;
  shownHtml.set(el, html);
  el.innerHTML = html;
  return true;
}
const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;
const personColor = (p) => (p === 0 ? INK : SUSPECT[(p - 1) % SUSPECT.length][0]);
const CRIME_DONE = { mord: 'ermordet', raub: 'bestohlen', gift: 'vergiftet', schlag: 'niedergeschlagen', erpressung: 'erpresst' };

// Täter: wer im Raum des Opfers stand (nur für gelöste Fälle, dann ist pos die Lösung)
function culpritOf(fl) {
  const room = fl.rooms[fl.pos[0]];
  return fl.pos.findIndex((c, p) => p > 0 && c >= 0 && fl.rooms[c] === room);
}

// Ist ein Hinweis mit den gesetzten Personen erfüllt? 'ok', 'bad' oder '' (noch offen)
function clueState(fl, clue, pos) {
  const n = pos.length;
  const at = pos[clue.p];
  const roomAt = (c) => fl.rooms[c];
  const test = (ok) => (ok ? 'ok' : 'bad');
  if (clue.t === 'leer') {
    if (pos.some((c) => c >= 0 && roomAt(c) === clue.r)) return 'bad';
    return pos.every((c) => c >= 0) ? 'ok' : '';
  }
  if (at === undefined || at < 0) return '';
  switch (clue.t) {
    case 'raum':
      return test(roomAt(at) === clue.r);
    case 'nicht':
      return test(roomAt(at) !== clue.r);
    case 'auf':
      return test(fl.items[at] === clue.k);
    case 'neben':
      return test(around(n, at).some((d) => fl.items[d] === clue.k));
    case 'fenster':
      return test(fl.win[at] !== 0);
    case 'allein':
      return test(!pos.some((c, q) => q !== clue.p && c >= 0 && roomAt(c) === roomAt(at)));
    case 'mit': {
      const b = pos[clue.q];
      return b < 0 ? '' : test(roomAt(b) === roomAt(at));
    }
  }
  return '';
}

// Zeilen und Spalten mit mehr als einer Person
function clashes(pos, n) {
  const bad = new Set();
  pos.forEach((a, p) => {
    if (a < 0) return;
    pos.forEach((b, q) => {
      if (q === p || b < 0) return;
      if (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n) bad.add(p);
    });
  });
  return bad;
}

// ---------- Zustand im Browser (überlebt neues Zeichnen) ----------

const ui = new WeakMap();
const HOLD_MS = 20000; // so lange gilt „hat X in der Hand“ ohne neue Nachricht

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = {
      signal: game.signal,
      sel: null, // ausgewählte Person
      ops: [], // eigene Züge, die der Server noch nicht bestätigt hat: { type, data, done }
      queue: Promise.resolve(),
      shownPos: null, // was gerade auf dem Brett steht (für Bewegungen)
      shownMarks: null,
      shownNotes: null,
      shownSolved: null,
      clueShown: [],
      fly: null, // Person, die gerade aus der Leiste kommt: { p, rect }
      flyBack: null, // Person, die gerade zurück in die Leiste geht
      confirm: 0,
      confirmNotes: 0,
      lastK: null, // Nummer des letzten Zugs, der schon gezeigt wurde
      flash: null, // Satz über einen Zug der anderen: { text, until }
      hand: null, // wen ich gerade in der Hand habe (den anderen gesagt)
      holding: {}, // wen die anderen in der Hand haben: { [id]: { p, at } }
    };
    ui.set(el, u);
    game.live.on((data, from) => onLive(u, data, from));
    game.signal.addEventListener('abort', () => clearInterval(u.handTimer), { once: true });
  }
  return u;
}

// Was auf dem Brett steht: Stand des Servers und darauf die eigenen Züge, die noch unterwegs sind
function shown(u) {
  const { s, game } = u;
  const st = {
    pos: [...s.pos],
    by: [...(s.by ?? s.pos.map(() => null))],
    marks: [...s.marks],
    notes: [...(s.notes ?? Array(s.n * s.names.length).fill(0))],
  };
  for (const op of u.ops) move(st, s.names.length, game.me, op.type, op.data);
  return st;
}
const canEdit = (u) => !u.game.result && !u.s.solved;

// ---------- Anzeige ----------

export function render(el, s, game) {
  // Fertige Partien von vor dem gemeinsamen Fall: das erste Stockwerk zeigen
  if (Array.isArray(s.floors)) s = { ...s, ...s.floors[0], clues: s.floors[0].clues.filter((c) => c.g === undefined) };
  const u = local(el, game);
  u.s = s;
  u.game = game;
  // Bestätigt: Der Stand des Servers enthält diese eigenen Züge schon
  u.ops = u.ops.filter((op) => !op.done);

  let root = el.querySelector(':scope > .kd');
  if (!root) {
    el.innerHTML = pageHtml(s, game);
    root = el.firstElementChild;
    if (root.classList.contains('intro')) setTimeout(() => root.classList.remove('intro'), 1500);
    bind(root, u);
  }
  u.root = root;

  // Ein Zug der anderen: wer es war
  const last = s.last;
  const fresh = last && u.lastK !== null && last.k !== u.lastK && last.by !== game.me ? last : null;
  u.lastK = last?.k ?? 0;
  if (fresh) {
    delete u.holding[fresh.by];
    const who = game.esc(game.name(fresh.by));
    const text = { leeren: `${who} hat alle Personen und Kreuze weggenommen.`, 'notizen-leeren': `${who} hat alle Notizen gelöscht.` }[fresh.t];
    if (text) {
      u.flash = { text, until: Date.now() + 6000 };
      setTimeout(() => !u.signal.aborted && draw(u), 6100);
    }
  }
  draw(u);
  if (fresh?.t === 'setzen' && fresh.c >= 0) ping(u, fresh.c, fresh.by);
}

const RULES = `<ol class="kd-rules-list">
    <li>In jeder Zeile und jeder Spalte stand genau eine Person.</li>
    <li>Niemand stand auf Tischen, Pflanzen, Regalen, Kisten, Fässern, Herden, Badewannen oder Klavieren. Auf Stühlen und Sesseln saß man, auf Betten lag man, auf Teppichen stand man.</li>
    <li>„Neben“ heißt waagerecht oder senkrecht daneben.</li>
    <li>Täter ist, wer als Einziger mit dem Opfer im selben Raum war.</li>
    <li>Ihr löst zusammen: Jeder kann Personen setzen, Kreuze machen und Notizen eintragen, die anderen sehen es sofort. Steht jede Person richtig, ist der Fall gelöst.</li>
  </ol>
  <p class="kd-rules-tip">Ein Tipp auf ein leeres Feld setzt ein Kreuz: Hier war niemand. In der Notiztabelle setzt ein Tipp ein Kreuz (nicht in diesem Raum), der zweite einen Haken (in diesem Raum), der dritte leert das Feld.</p>`;

// Die ganze Ansicht, einmal pro Partie gebaut; danach ändern sich nur Klassen, Texte und Figuren
function pageHtml(s, game) {
  const n = s.n;
  const cells = Array.from({ length: n * n }, (_, c) => {
    const blocked = !free(s.items[c]);
    return `<button class="kd-cell ${blocked ? 'blocked' : ''}" type="button" data-c="${c}" style="--x:${c % n};--y:${Math.floor(c / n)}"></button>`;
  }).join('');
  return `<div class="kd ${game.first && !game.reducedMotion ? 'intro' : ''}" style="--n:${n}">
    <section class="kd-sheet">
      <header class="kd-case">
        <h3 class="kd-title"><span class="kd-roof">${ROOF}</span><span class="kd-house-name">${game.esc(s.house)}</span></h3>
        <p class="kd-crime"></p>
      </header>
      <div class="kd-main">
        <div class="kd-board">
          <div class="kd-cols" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span>${'ABCDEF'[i]}</span>`).join('')}</div>
          <div class="kd-rows" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
          <div class="kd-plan"><div class="kd-planbox">${planSvg(s, n)}</div><div class="kd-cells">${cells}</div><div class="kd-tokens"></div><div class="kd-fx"></div></div>
        </div>
        <div class="kd-side">
          <p class="kd-hint" aria-live="polite"></p>
          <div class="kd-tray">${trayHtml(s, game)}</div>
          <div class="kd-tools"></div>
          <div class="kd-clues">${cluesHtml(s, game)}</div>
          <div class="kd-notes-box">${notesHtml(s, game)}</div>
        </div>
      </div>
    </section>
    <details class="kd-rules"><summary>So geht’s</summary>${RULES}</details>
  </div>`;
}

function trayHtml(s, game) {
  return s.people
    .map(
      (person, p) => `<button class="kd-person" type="button" data-p="${p}">
        <span class="kd-person-pawn">${pawn(person, p)}</span>
        <span class="kd-person-text"><b>${game.esc(person.name)}</b><small><span class="kd-role">${p === 0 ? 'Opfer' : game.esc(person.role)}</span><span class="kd-held"></span></small></span>
        <span class="kd-at num"></span>
      </button>`,
    )
    .join('');
}

function refHtml(s, game, p) {
  const person = s.people[p];
  if (!person) return '';
  return `<button class="kd-ref" type="button" data-p="${p}" style="--pc:${personColor(p)}"><i></i>${game.esc(person.name)}</button>`;
}

// Hinweise nach Personen geordnet, Räume ohne Person am Ende
function cluesHtml(s, game) {
  const items = s.clues
    .map((c, i) => [c, i])
    .sort((a, b) => (a[0].p < 0 ? 99 : a[0].p) - (b[0].p < 0 ? 99 : b[0].p) || a[1] - b[1])
    .map(([clue, i], j) => {
      const text = clueParts(s, clue)
        .map((x) => (typeof x === 'string' ? x : refHtml(s, game, x)))
        .join('');
      return `<li class="kd-clue" data-i="${i}" style="--i:${Math.min(j, 12)}"><span class="kd-clue-mark"><i></i></span><span class="kd-clue-text">${text}</span></li>`;
    })
    .join('');
  return `<h4 class="kd-clues-head">Hinweise</h4><ol class="kd-clue-list">${items}</ol>`;
}

// Notiztabelle wie im Rätselbuch: Personen × Räume, ein Tipp Kreuz, zwei Haken, drei leer. Räume in
// Lesereihenfolge des Grundrisses (oben links zuerst).
const NOTE_X = '<svg class="kd-nx" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M5.5 5 Q10 10.5 14.8 15.2"/><path pathLength="1" d="M14.6 4.8 Q9.6 10.4 5.2 15.3"/></svg>';
const NOTE_OK = '<svg class="kd-nok" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M4 10.8 Q6.5 12.6 8.4 15.6 Q11.5 8.6 16.4 4.4"/></svg>';
const NOTE_WORD = ['offen', 'nicht dort', 'dort'];

function notesHtml(s, game) {
  const order = s.names.map((_, r) => r).sort((a, b) => Math.min(...roomCells(s, a)) - Math.min(...roomCells(s, b)));
  const head = order.map((r) => `<th scope="col"><span>${ROOMS[s.names[r]]?.name ?? ''}</span></th>`).join('');
  const rows = s.people
    .map((person, p) => {
      const cells = order
        .map((r) => `<td><button class="kd-note" type="button" data-p="${p}" data-r="${r}" data-v=""></button></td>`)
        .join('');
      return `<tr data-p="${p}"><th scope="row"><span class="kd-notes-pawn">${pawn(person, p)}</span><span class="kd-notes-name">${game.esc(person.name)}</span></th>${cells}</tr>`;
    })
    .join('');
  return `<h4 class="kd-clues-head">Notizen</h4>
    <table class="kd-notes" style="--k:${s.names.length}"><colgroup><col class="kd-notes-who">${order.map(() => '<col>').join('')}</colgroup>
      <thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table>
    <p class="kd-notes-foot"></p>`;
}

// Alles neu zeichnen, was sich geändert haben kann (auch nach eigenen Zügen, bevor der Server antwortet)
function draw(u) {
  const st = shown(u);
  const edit = canEdit(u);
  if (!edit) u.sel = null;
  renderCase(u);
  renderCells(u, st, edit);
  renderTokens(u, st, edit);
  renderTray(u, st, edit);
  renderHint(u, st, edit);
  renderTools(u, st, edit);
  renderClues(u, st);
  renderNotes(u, st, edit);
  renderSolved(u);
  renderHolding(u);
  syncHand(u, edit ? (u.drag?.moved ? u.drag.p : u.sel) : null);
}

function renderCase(u) {
  const { s, game, root } = u;
  const victim = s.people[0];
  let text;
  if (s.solved) {
    const t = s.people[culpritOf(s)];
    text = `Nur ${game.esc(t.name)} war mit ${game.esc(victim.name)} ${roomIn(s.names[s.rooms[s.pos[0]]])}. ${game.esc(t.role)} ${game.esc(t.name)} hat ${game.esc(victim.role)} ${game.esc(victim.name)} ${CRIME_DONE[s.crime] ?? 'überfallen'}.`;
  } else {
    text = `${game.esc(victim.role)} ${game.esc(victim.name)} ${CRIMES[s.crime] ?? 'wurde überfallen'}. Wer war es?`;
  }
  const crime = root.querySelector('.kd-crime');
  put(crime, text);
  crime.classList.toggle('is-solved', Boolean(s.solved));
}

function renderCells(u, st, edit) {
  const { s, game, root } = u;
  const n = s.n;
  const plan = root.querySelector('.kd-plan');
  plan.classList.toggle('is-locked', !edit);
  plan.classList.toggle('is-picking', edit && u.sel !== null);
  for (const cell of root.querySelectorAll('.kd-cell')) {
    const c = Number(cell.dataset.c);
    const marked = st.marks.includes(c);
    const has = cell.querySelector('.kd-x');
    if (marked && !has) {
      cell.insertAdjacentHTML('beforeend', XMARK);
      if (u.shownMarks && !u.shownMarks.includes(c) && !game.reducedMotion) cell.querySelector('.kd-x').classList.add('enter');
    } else if (!marked && has) has.remove();
    const p = st.pos.indexOf(c);
    const room = ROOMS[s.names[s.rooms[c]]]?.name ?? '';
    const item = s.items[c] ? `, ${ITEMS[s.items[c]]?.name}` : '';
    const who = p >= 0 ? `, ${s.people[p].name}` : marked ? ', Kreuz' : '';
    const label = `${coord(n, c)}, ${room}${item}${who}`;
    if (cell.getAttribute('aria-label') !== label) cell.setAttribute('aria-label', label);
    cell.disabled = !edit;
  }
  u.shownMarks = [...st.marks];
}

function renderTokens(u, st, edit) {
  const { s, game, root } = u;
  const n = s.n;
  const pos = st.pos;
  const box = root.querySelector('.kd-tokens');
  const before = u.shownPos;
  const bad = clashes(pos, n);
  for (let p = 0; p < n; p++) {
    let tok = box.querySelector(`.kd-token[data-p="${p}"]`);
    const c = pos[p];
    if (c < 0) {
      if (tok && u.flyBack === p && !game.reducedMotion) {
        // zurück in die Leiste: Figur gleitet zu ihrem Platz dort
        const target = root.querySelector(`.kd-person[data-p="${p}"] .kd-person-pawn`);
        if (target) {
          const a = tok.getBoundingClientRect();
          const b = target.getBoundingClientRect();
          tok.removeAttribute('data-p');
          tok.disabled = true;
          tok.style.zIndex = 3;
          const anim = tok.animate(
            [{ transform: getComputedStyle(tok).transform }, { transform: `${getComputedStyle(tok).transform} translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.8)`, opacity: 0.4 }],
            { duration: 340, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' },
          );
          anim.onfinish = () => tok.remove();
          continue;
        }
      }
      if (tok) {
        if (!game.reducedMotion && before) {
          tok.classList.add('leave');
          tok.removeAttribute('data-p');
          tok.disabled = true;
          setTimeout(() => tok.remove(), 260);
        } else tok.remove();
      }
      continue;
    }
    const x = c % n;
    const y = Math.floor(c / n);
    if (!tok) {
      box.insertAdjacentHTML('beforeend', `<button class="kd-token" type="button" data-p="${p}" style="--x:${x};--y:${y}">${pawn(s.people[p], p)}</button>`);
      tok = box.lastElementChild;
      if (before && !game.reducedMotion) {
        const fly = u.fly?.p === p ? u.fly : null;
        if (fly) {
          // aus der Leiste auf das Feld gleiten
          const to = tok.getBoundingClientRect();
          const dx = fly.rect.left + fly.rect.width / 2 - (to.left + to.width / 2);
          const dy = fly.rect.top + fly.rect.height / 2 - (to.top + to.height / 2);
          tok.animate(
            [
              { transform: `translate(${x * 100}%, ${y * 100}%) translate(${dx}px, ${dy}px) scale(.8)` },
              { transform: `translate(${x * 100}%, ${y * 100}%)` },
            ],
            { duration: 360, easing: 'cubic-bezier(.6,0,.2,1)' },
          );
        } else tok.classList.add('drop');
      }
    } else if (tok.style.getPropertyValue('--x') !== String(x) || tok.style.getPropertyValue('--y') !== String(y)) {
      const fly = u.fly?.p === p && !game.reducedMotion ? u.fly : null;
      if (fly) tok.style.transition = 'none';
      tok.style.setProperty('--x', x);
      tok.style.setProperty('--y', y);
      if (fly) {
        // Mit dem Finger abgesetzt: von dort, wo die Figur schwebte, auf das Feld
        const to = tok.getBoundingClientRect();
        const dx = fly.rect.left - to.left;
        const dy = fly.rect.top - to.top;
        tok.animate(
          [{ transform: `translate(${x * 100}%, ${y * 100}%) translate(${dx}px, ${dy}px)` }, { transform: `translate(${x * 100}%, ${y * 100}%)` }],
          { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
        requestAnimationFrame(() => (tok.style.transition = ''));
      }
    }
    tok.classList.toggle('sel', u.sel === p);
    tok.classList.toggle('clash', bad.has(p));
    tok.disabled = !edit;
    tok.setAttribute('aria-label', `${s.people[p].name}, ${coord(n, c)}${u.sel === p ? ', ausgewählt' : ''}`);
  }
  u.fly = null;
  u.flyBack = null;
  u.shownPos = [...pos];
}

// Leiste: wird nie neu gebaut, damit kein Knopf unter dem Finger verschwindet, wenn die anderen ziehen
function renderTray(u, st, edit) {
  const { s, game, root } = u;
  for (const btn of root.querySelectorAll('.kd-person')) {
    const p = Number(btn.dataset.p);
    const c = st.pos[p];
    const by = c >= 0 ? st.by[p] : null;
    btn.classList.toggle('is-placed', c >= 0);
    btn.classList.toggle('sel', u.sel === p);
    btn.disabled = !edit;
    btn.setAttribute('aria-pressed', String(u.sel === p));
    // wo die Person steht, davor ein Quadrat in der Farbe dessen, der sie gesetzt hat
    put(btn.querySelector('.kd-at'), c >= 0 ? `${by ? marker(game, by) : ''}${coord(s.n, c)}` : '');
    const person = s.people[p];
    const where = c >= 0 ? `, steht auf ${coord(s.n, c)}${by ? `, gesetzt von ${by === game.me ? 'dir' : game.name(by)}` : ''}` : '';
    const label = `${person.role} ${person.name}${p === 0 ? ', Opfer' : ''}${where}`;
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
  }
}

function renderHint(u, st, edit) {
  const { s, game, root } = u;
  const all = st.pos.every((c) => c >= 0);
  let html;
  if (!edit) html = '';
  else if (u.flash && u.flash.until > Date.now()) html = u.flash.text;
  else if (u.sel !== null) {
    const back = st.pos[u.sel] >= 0 ? ' <button class="link kd-back" type="button">Zurück in die Leiste</button>' : '';
    html = `Wohin mit ${game.esc(s.people[u.sel].name)}? Tippe auf ein Feld.${back}`;
  } else if (all && u.ops.length) return; // der letzte Zug ist noch unterwegs, vielleicht ist es gelöst
  else if (all) html = 'Alle stehen, aber es stimmt noch nicht. Prüfe die Hinweise.';
  else html = 'Wähle eine Person und tippe auf ihr Feld. Ein Tipp auf ein leeres Feld setzt ein Kreuz.';
  put(root.querySelector('.kd-hint'), html);
}

function renderTools(u, st, edit) {
  const any = st.marks.length || st.pos.some((c) => c >= 0);
  const text = u.confirm > Date.now() ? 'Wirklich alles wegnehmen, auch bei den anderen?' : 'Alles wegnehmen';
  put(u.root.querySelector('.kd-tools'), edit && any ? `<button class="link kd-reset" type="button">${text}</button>` : '');
}

// Hinweise haken sich aus dem Stand selbst ab; nur was sich gerade geändert hat, wird animiert
function renderClues(u, st) {
  const { s, game, root } = u;
  for (const li of root.querySelectorAll('.kd-clue')) {
    const i = Number(li.dataset.i);
    const state = clueState(s, s.clues[i], st.pos);
    if (u.clueShown[i] === state) continue;
    const fresh = u.clueShown[i] !== undefined && !game.reducedMotion;
    u.clueShown[i] = state;
    li.classList.toggle('is-ok', state === 'ok');
    li.classList.toggle('is-bad', state === 'bad');
    li.querySelector('.kd-clue-mark').innerHTML = state === 'ok' ? CHECK : state === 'bad' ? CROSS_ICON : '<i></i>';
    if (fresh) {
      li.classList.remove('fresh');
      void li.offsetWidth; // Animation von vorn
      li.classList.add('fresh');
      setTimeout(() => li.classList.remove('fresh'), 600);
    }
  }
}

function renderNotes(u, st, edit) {
  const { s, game, root } = u;
  const k = s.names.length;
  const box = root.querySelector('.kd-notes-box');
  const before = u.shownNotes;
  for (const btn of box.querySelectorAll('.kd-note')) {
    const p = Number(btn.dataset.p);
    const r = Number(btn.dataset.r);
    const i = p * k + r;
    const v = st.notes[i] ?? 0;
    if (btn.dataset.v !== String(v)) {
      btn.dataset.v = v;
      btn.innerHTML = v === 1 ? NOTE_X : v === 2 ? NOTE_OK : '';
      if (before && before[i] !== v && v && !game.reducedMotion) btn.firstElementChild.classList.add('enter');
      btn.setAttribute('aria-label', `${s.people[p].name}, ${ROOMS[s.names[r]]?.name}: ${NOTE_WORD[v]}`);
    }
    btn.disabled = !edit;
  }
  for (const tr of box.querySelectorAll('tbody tr')) tr.classList.toggle('sel', Number(tr.dataset.p) === u.sel);
  const any = st.notes.some(Boolean);
  const text = u.confirmNotes > Date.now() ? 'Wirklich alle Notizen löschen, auch bei den anderen?' : 'Notizen löschen';
  put(box.querySelector('.kd-notes-foot'), edit && any ? `<button class="link kd-notes-clear" type="button">${text}</button>` : '');
  u.shownNotes = [...st.notes];
}

// Gelöst: andere Räume treten zurück, der Tatraum wird umrandet, Stempel auf den Täter
function renderSolved(u) {
  const { s, game, root } = u;
  const n = s.n;
  const sheet = root.querySelector('.kd-sheet');
  const was = u.shownSolved;
  u.shownSolved = Boolean(s.solved);
  sheet.classList.toggle('is-solved', Boolean(s.solved));
  const fx = root.querySelector('.kd-fx');
  if (!s.solved || fx.querySelector('.kd-stampbox')) return;
  const animate = was === false && !game.reducedMotion;
  sheet.classList.toggle('solving', animate);
  if (animate) setTimeout(() => sheet.classList.remove('solving'), 2000);
  const room = s.rooms[s.pos[0]];
  for (const g of root.querySelectorAll('.kd-room')) g.classList.toggle('dim', Number(g.dataset.r) !== room);
  // Umriss des Tatraums
  const segs = [];
  for (const c of roomCells(s, room)) {
    const x = (c % n) * 100;
    const y = Math.floor(c / n) * 100;
    const same = (d, ok) => ok && s.rooms[d] === room;
    if (!same(c - n, y > 0)) segs.push([x, y, x + 100, y]);
    if (!same(c + n, y < (n - 1) * 100)) segs.push([x, y + 100, x + 100, y + 100]);
    if (!same(c - 1, x > 0)) segs.push([x, y, x, y + 100]);
    if (!same(c + 1, x < (n - 1) * 100)) segs.push([x + 100, y, x + 100, y + 100]);
  }
  root.querySelector('.kd-solved').innerHTML = segs
    .map(([x1, y1, x2, y2]) => `<line pathLength="1" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    .join('');
  const k = culpritOf(s);
  const c = s.pos[k];
  fx.insertAdjacentHTML('beforeend', `<div class="kd-stampbox" style="--x:${c % n};--y:${Math.floor(c / n)}">${STAMP}</div>`);
  const victimTok = root.querySelector('.kd-token[data-p="0"]');
  if (victimTok && s.crime === 'mord') victimTok.classList.add('fallen');
  root.querySelector(`.kd-token[data-p="${k}"]`)?.classList.add('culprit');
}

// ---------- Eingaben ----------

function bind(root, u) {
  const { signal } = u;
  root.addEventListener('pointerdown', (e) => startDrag(e, u), { signal });
  root.addEventListener(
    'click',
    (e) => {
      if (performance.now() - (u.dragEnd ?? -1e9) < 350) return; // Klick direkt nach dem Ziehen
      const t = e.target;
      const ref = t.closest('.kd-ref');
      if (ref) return showRef(u, Number(ref.dataset.p));
      if (t.closest('.kd-back')) return place(u, u.sel, -1);
      const note = t.closest('.kd-note');
      if (note && !note.disabled) {
        const v = (Number(note.dataset.v) + 1) % 3;
        return act(u, 'notiz', { p: Number(note.dataset.p), r: Number(note.dataset.r), v });
      }
      if (t.closest('.kd-notes-clear')) {
        if (u.confirmNotes > Date.now()) {
          u.confirmNotes = 0;
          return act(u, 'notizen-leeren', {});
        }
        u.confirmNotes = Date.now() + 4000;
        setTimeout(() => !u.signal.aborted && draw(u), 4100);
        return draw(u);
      }
      if (t.closest('.kd-reset')) {
        if (u.confirm > Date.now()) {
          u.confirm = 0;
          return act(u, 'leeren', {});
        }
        u.confirm = Date.now() + 4000;
        setTimeout(() => !u.signal.aborted && draw(u), 4100);
        return draw(u);
      }
      const person = t.closest('.kd-person');
      if (person && !person.disabled) return choose(u, Number(person.dataset.p));
      const tok = t.closest('.kd-token');
      if (tok && tok.dataset.p !== undefined && !tok.disabled) return choose(u, Number(tok.dataset.p));
      const cell = t.closest('.kd-cell');
      if (cell) return tapCell(u, Number(cell.dataset.c));
    },
    { signal },
  );
  root.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && u.sel !== null) {
        u.sel = null;
        draw(u);
      }
    },
    { signal },
  );
}

// Ziehen mit dem Finger: Figur aus der Leiste oder vom Brett auf ein Feld; vom Brett daneben losgelassen
// geht sie zurück in die Leiste. Erst ab sechs Pixeln Weg ist es Ziehen, sonst ein Tippen (siehe click).
function startDrag(e, u) {
  if (e.button > 0 || u.drag) return;
  const src = e.target.closest('.kd-token, .kd-person');
  if (!src || src.disabled || src.dataset.p === undefined || !canEdit(u)) return;
  const p = Number(src.dataset.p);
  const fromBoard = src.classList.contains('kd-token');
  const { root, game } = u;
  const plan = root.querySelector('.kd-plan');
  const d = { p, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, node: null, cell: null, ctrl: new AbortController() };
  u.drag = d;
  const stop = () => {
    d.ctrl.abort();
    d.node?.remove();
  };
  game.signal.addEventListener('abort', stop, { once: true });
  const opts = { signal: d.ctrl.signal };
  const s = u.s;
  const n = s.n;

  const cellAt = (x, y) => {
    const r = plan.getBoundingClientRect();
    const cx = Math.floor(((x - r.left) / r.width) * n);
    const cy = Math.floor(((y - r.top) / r.height) * n);
    return cx < 0 || cy < 0 || cx >= n || cy >= n ? null : cy * n + cx;
  };
  const mark = (c) => {
    for (const el of plan.querySelectorAll('.kd-cell.drop')) el.classList.remove('drop', 'bad');
    if (c === null) return;
    const el = plan.querySelector(`.kd-cell[data-c="${c}"]`);
    el?.classList.add('drop');
    if (!free(s.items[c])) el?.classList.add('bad');
  };
  const follow = (ev) => {
    const size = plan.getBoundingClientRect().width / n;
    d.node.style.width = `${size}px`;
    d.node.style.height = `${size}px`;
    d.node.style.transform = `translate(${ev.clientX - size / 2}px, ${ev.clientY - size * 0.72}px)`;
    d.cell = cellAt(ev.clientX, ev.clientY - size * 0.22);
    mark(d.cell);
  };
  const begin = () => {
    d.moved = true;
    u.sel = null;
    d.node = document.createElement('div');
    d.node.className = 'kd-float';
    d.node.innerHTML = pawn(s.people[p], p);
    // an body: .kd hat container-type und wäre sonst der Bezug für position: fixed
    document.body.append(d.node);
    src.classList.add('lifted');
    root.querySelector(`.kd-token[data-p="${p}"]`)?.classList.add('lifted');
    syncHand(u, p);
  };
  const end = (ev, cancel) => {
    if (ev.pointerId !== d.pointer) return;
    const rect = d.node?.getBoundingClientRect();
    stop();
    game.signal.removeEventListener('abort', stop);
    u.drag = null;
    if (!d.moved) return; // nur getippt: das erledigt click
    u.dragEnd = performance.now();
    mark(null);
    for (const el of root.querySelectorAll('.lifted')) el.classList.remove('lifted');
    const pos = shown(u).pos;
    if (cancel || !canEdit(u)) return draw(u);
    if (d.cell === null) {
      if (fromBoard && pos[p] >= 0) return place(u, p, -1);
      return draw(u);
    }
    if (!free(s.items[d.cell])) return nope(u, d.cell, `Auf ${ITEMS[s.items[d.cell]].dat} kann niemand stehen.`);
    if (pos[p] === d.cell) return draw(u);
    u.fly = { p, rect };
    u.sel = null;
    act(u, 'setzen', { p, c: d.cell });
  };
  window.addEventListener(
    'pointermove',
    (ev) => {
      if (ev.pointerId !== d.pointer) return;
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return;
        begin();
      }
      ev.preventDefault();
      follow(ev);
    },
    opts,
  );
  window.addEventListener('pointerup', (ev) => end(ev, false), opts);
  window.addEventListener('pointercancel', (ev) => end(ev, true), opts);
}

function choose(u, p) {
  u.sel = u.sel === p ? null : p;
  draw(u);
}

function tapCell(u, c) {
  const { s } = u;
  if (!canEdit(u)) return;
  const st = shown(u);
  if (u.sel !== null) {
    if (!free(s.items[c])) return nope(u, c, `Auf ${ITEMS[s.items[c]].dat} kann niemand stehen.`);
    if (st.pos[u.sel] === c) {
      u.sel = null;
      return draw(u);
    }
    return place(u, u.sel, c);
  }
  const there = st.pos.indexOf(c);
  if (there >= 0) return choose(u, there);
  if (!free(s.items[c])) return;
  act(u, 'kreuz', { c, v: !st.marks.includes(c) });
}

function nope(u, c, text) {
  const cell = u.root.querySelector(`.kd-cell[data-c="${c}"]`);
  if (cell && !u.game.reducedMotion) cell.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  put(u.root.querySelector('.kd-hint'), text);
}

function place(u, p, c) {
  if (p === null || p === undefined) return;
  const pos = shown(u).pos;
  if (pos[p] < 0 && c >= 0) {
    const from = u.root.querySelector(`.kd-person[data-p="${p}"] .kd-person-pawn`);
    if (from) u.fly = { p, rect: from.getBoundingClientRect() };
  }
  if (pos[p] >= 0 && c < 0) u.flyBack = p;
  u.sel = null;
  act(u, 'setzen', { p, c });
}

// Eigener Zug: sofort zeigen, dann in Reihe an den Server. Bis er dort angekommen ist, wird er auf jeden
// neuen Stand noch einmal angewendet (shown), so sieht man die Züge der anderen trotzdem gleich.
function act(u, type, data) {
  const op = { type, data, done: false };
  u.ops.push(op);
  draw(u);
  const drop = () => {
    u.ops = u.ops.filter((x) => x !== op);
    draw(u);
  };
  u.queue = u.queue
    .then(() => u.game.send(type, data))
    .then((ok) => {
      if (u.signal.aborted) return;
      if (ok === false) return drop(); // abgelehnt: zurück zum Stand des Servers
      // Der neue Stand kommt mit dem nächsten Zeichnen (render räumt dann auf); kommt keiner, weil sich
      // nichts geändert hat, hier aufräumen
      op.done = true;
      setTimeout(() => !u.signal.aborted && u.ops.includes(op) && drop(), 1500);
    });
}

// Hinweis auf eine Person: ihre Figur hebt sich kurz
function showRef(u, p) {
  const { root, game } = u;
  const tok = root.querySelector(`.kd-token[data-p="${p}"]`) ?? root.querySelector(`.kd-person[data-p="${p}"]`);
  if (!tok || game.reducedMotion) return;
  const t = getComputedStyle(tok).transform;
  const from = t === 'none' ? 'none' : t;
  tok.animate([{ transform: from }, { transform: `${t === 'none' ? '' : t} translateY(-10%)` }, { transform: from }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// ---------- Zusammen: wer was tut (game.live und der letzte Zug) ----------

// Zug der anderen: das Feld leuchtet in ihrer Farbe auf, mit Namen
function ping(u, c, from) {
  const { root, game, s } = u;
  if (!Number.isInteger(c) || c < 0 || c >= s.n * s.n) return;
  const x = c % s.n;
  const edge = x === 0 ? 'left' : x === s.n - 1 ? 'right' : ''; // Name am Rand nach innen
  const fx = root.querySelector('.kd-fx');
  fx.insertAdjacentHTML(
    'beforeend',
    `<div class="kd-ping ${edge}" style="--x:${x};--y:${Math.floor(c / s.n)};--pc:${game.color(from)}"><i></i><span>${game.esc(game.name(from))}</span></div>`,
  );
  const el = fx.lastElementChild;
  setTimeout(() => el.remove(), 2600);
}

// Den anderen sagen, wen ich gerade in der Hand habe (ausgewählt oder beim Ziehen); solange ich jemanden
// halte, alle acht Sekunden wieder (falls eine Nachricht verloren geht oder jemand neu dazukommt)
function syncHand(u, hand) {
  if (hand === u.hand) return;
  u.hand = hand;
  const say = () => u.game.live.send({ t: 'hand', p: u.hand });
  say();
  clearInterval(u.handTimer);
  if (hand !== null) u.handTimer = setInterval(say, 8000);
}

function onLive(u, data, from) {
  if (!u.s || !u.root || u.signal.aborted || !data || data.t !== 'hand') return;
  if (!u.s.players.some((pl) => pl.id === from)) return;
  const p = data.p;
  if (p === null) delete u.holding[from];
  else if (Number.isInteger(p) && p >= 0 && p < u.s.n) u.holding[from] = { p, at: Date.now() };
  else return;
  renderHolding(u);
  setTimeout(() => !u.signal.aborted && renderHolding(u), HOLD_MS + 100);
}

// Wer gerade welche Person in der Hand hat: Ring in seiner Farbe, in der Leiste sein Name statt der Rolle
function renderHolding(u) {
  const { s, game, root } = u;
  const held = {};
  if (canEdit(u)) {
    for (const [id, h] of Object.entries(u.holding)) {
      if (Date.now() - h.at > HOLD_MS || id === game.me) continue;
      (held[h.p] ??= []).push(id);
    }
  }
  for (const el of root.querySelectorAll('.kd-person, .kd-token[data-p]')) {
    const who = held[el.dataset.p] ?? [];
    el.classList.toggle('held', who.length > 0);
    if (who.length) el.style.setProperty('--hc', game.color(who[0]));
    const tag = el.querySelector('.kd-held');
    if (tag) put(tag, who.map((id) => `${marker(game, id)}${game.esc(game.name(id))}`).join(' '));
  }
}

export const style = `
  .kd { display: grid; gap: 24px; container-type: inline-size; }

  .kd-sheet { display: grid; gap: 16px; }

  /* --- Fall: Haus und Tat --- */
  .kd-case { display: grid; gap: 6px; }
  .kd-title { display: flex; align-items: flex-end; gap: 10px; min-width: 0; margin: 0;
    font: 800 var(--t-xl)/1 var(--font-display); }
  .kd-roof { flex: none; width: 52px; }
  .kd-roof-svg { display: block; width: 52px; height: 22px; }
  .kd-house-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kd-crime { margin: 0; max-width: 46ch; }
  .kd-crime.is-solved { font-weight: 700; }

  .kd-main { display: grid; gap: 18px; }
  @container (min-width: 600px) {
    .kd-main { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 28px; align-items: start; }
    .kd-board { position: sticky; top: 16px; }
    .kd-tray { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  }
  .kd-side { display: grid; gap: 14px; min-width: 0; }

  /* --- Grundriss --- */
  .kd-board { display: grid; grid-template-columns: 14px minmax(0, 1fr); grid-template-rows: 16px auto; gap: 3px 5px;
    width: 100%; max-width: 480px; }
  .kd-cols { grid-column: 2; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  .kd-rows { grid-row: 2; display: grid; grid-template-rows: repeat(var(--n), minmax(0, 1fr)); }
  .kd-cols span, .kd-rows span { display: grid; place-items: center; font: 700 12px/1 var(--font-display); color: var(--muted); }
  .kd-plan { grid-column: 2; grid-row: 2; position: relative; aspect-ratio: 1; }
  .kd-planbox { position: absolute; inset: calc(-8% / var(--n)); pointer-events: none; }
  .kd-plan-svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .kd-cells, .kd-tokens, .kd-fx { position: absolute; inset: 0; }
  .kd-tokens, .kd-fx { pointer-events: none; }
  .kd-label { font-family: var(--font-display); font-weight: 700; letter-spacing: .03em; fill: ${INK};
    paint-order: stroke; stroke: ${PAPER}; stroke-width: 5px; stroke-linejoin: round; }
  .kd-door { stroke: ${INK}; stroke-width: 1.8; opacity: .55; }
  .kd-room { transition: opacity 500ms ease-out 150ms; }
  .kd-room.dim { opacity: .38; }
  .kd-item { transform-box: fill-box; transform-origin: center; }
  .kd-solved line { stroke: ${C.stempel}; stroke-width: 12; stroke-linecap: square; }

  .kd-cell { position: absolute; left: calc(var(--x) * 100% / var(--n)); top: calc(var(--y) * 100% / var(--n));
    width: calc(100% / var(--n)); height: calc(100% / var(--n)); margin: 0; padding: 0; border: 0; border-radius: 0;
    background: none; -webkit-appearance: none; appearance: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .kd-cell:disabled { cursor: default; }
  .kd-cell.blocked { cursor: default; }
  .kd-plan:not(.is-locked) .kd-cell:not(.blocked):hover { background: rgba(20, 20, 20, .07); }
  .kd-plan.is-picking .kd-cell:not(.blocked):hover { background: rgba(20, 20, 20, .12); }
  .kd-cell:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }
  .kd-x { position: absolute; inset: 0; width: 100%; height: 100%; }
  .kd-x path { fill: none; stroke: ${INK}; stroke-width: 8; stroke-linecap: round; opacity: .8; }
  .kd-x.enter path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kd-draw 150ms cubic-bezier(.3,.7,.2,1) forwards; }
  .kd-x.enter path + path { animation-delay: 90ms; }

  /* Figuren auf dem Brett */
  .kd-token { position: absolute; left: 0; top: 0; width: calc(100% / var(--n)); height: calc(100% / var(--n));
    margin: 0; padding: 0; border: 0; background: none; pointer-events: auto; cursor: pointer;
    transform: translate(calc(var(--x) * 100%), calc(var(--y) * 100%));
    transition: transform 320ms cubic-bezier(.6,0,.2,1);
    touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
  .kd-token:disabled { cursor: default; }
  .kd-token .kd-pawn { position: absolute; left: 15%; top: 3%; width: 70%; height: 86%; overflow: visible;
    transform-origin: 50% 88%; transition: transform 180ms cubic-bezier(.2,.8,.2,1); }
  .kd-token::before { content: ''; position: absolute; left: 14%; right: 14%; bottom: 3%; height: 22%; border-radius: 50%;
    border: 3px solid transparent; }
  .kd-token.sel .kd-pawn { transform: translateY(-10%); }
  .kd-token.sel::before { border-color: ${INK}; border-style: dashed; }
  .kd-token.clash::before { border-color: var(--bad); }
  .kd-token.held:not(.sel)::before { border-color: var(--hc); border-style: dashed; animation: kd-fade 200ms ease-out; }
  .kd-token:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }
  .kd-token:active:not(:disabled) .kd-pawn { transform: scale(.94); }
  .kd-token.drop .kd-pawn { animation: kd-drop 300ms cubic-bezier(.2,.8,.2,1); }
  .kd-token.leave .kd-pawn { animation: kd-leave 240ms ease-in forwards; }
  .kd-token.fallen .kd-pawn { transform: translate(6%, -6%) rotate(-90deg); }
  .kd-plan.is-locked .kd-token { pointer-events: none; }

  .kd-token.lifted .kd-pawn, .kd-person.lifted .kd-person-pawn { opacity: .25; }
  .kd-cell.drop { background: rgba(20, 20, 20, .14); outline: 3px dashed ${INK}; outline-offset: -5px; }
  .kd-cell.drop.bad { background: none; outline-color: var(--bad); }
  .kd-float { position: fixed; left: 0; top: 0; z-index: 50; pointer-events: none; }
  .kd-float .kd-pawn { position: absolute; left: 15%; top: 3%; width: 70%; height: 86%; overflow: visible; transform: scale(1.12); transform-origin: 50% 90%; }

  /* Zug der anderen: Ring und Name in ihrer Farbe */
  .kd-ping { position: absolute; left: calc(var(--x) * 100% / var(--n)); top: calc(var(--y) * 100% / var(--n));
    width: calc(100% / var(--n)); height: calc(100% / var(--n)); }
  .kd-ping i { position: absolute; inset: 8%; border: 3px solid var(--pc); border-radius: 50%;
    animation: kd-ping 1100ms cubic-bezier(.2,.8,.2,1) 2 both; }
  .kd-ping span { position: absolute; left: 50%; top: -2px; transform: translate(-50%, -100%); padding: 1px 5px;
    background: var(--paper); border: 1.5px solid var(--pc); border-radius: var(--radius); font: 700 12px/1.2 var(--font-display);
    white-space: nowrap; animation: kd-fade 200ms ease-out; }
  .kd-ping span { max-width: 9em; overflow: hidden; text-overflow: ellipsis; }
  .kd-ping.left span { left: 0; transform: translateY(-100%); }
  .kd-ping.right span { left: auto; right: 0; transform: translateY(-100%); }

  /* Gelöst: Stempel */
  .kd-stampbox { position: absolute; width: calc(150% / var(--n));
    left: calc(min(max(var(--x) - .25, 0), var(--n) - 1.5) * 100% / var(--n));
    top: calc(min(var(--y) + .5, var(--n) - .6) * 100% / var(--n)); }
  .kd-stamp { display: block; width: 100%; transform: rotate(-9deg); }

  .kd-hint { margin: 0; min-height: 2.7em; font-size: var(--t-sm); color: var(--muted); }
  .kd-hint:empty { display: none; }
  .kd-sheet.is-solved .kd-token:not(.culprit):not([data-p="0"]) .kd-pawn { opacity: .45; transition: opacity 500ms ease-out 150ms; }
  .kd-hint .link { font-size: inherit; }

  /* Leiste mit den Personen */
  .kd-tray { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
  @container (min-width: 440px) and (max-width: 599px) { .kd-tray { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .kd-person { display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 54px; margin: 0; padding: 3px 8px 3px 2px;
    border: 1px solid var(--hairline); border-radius: var(--radius-m); background: var(--paper); color: inherit; font: inherit;
    text-align: left; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent; }
  .kd-person:hover:not(:disabled) { background: var(--wash); }
  .kd-person:active:not(:disabled) { transform: scale(.97); }
  .kd-person:disabled { cursor: default; }
  .kd-person.sel { outline: 2px solid var(--ink); outline-offset: -2px; }
  .kd-person.held:not(.sel) { outline: 2px dashed var(--hc); outline-offset: -2px; }
  .kd-person-pawn { flex: none; width: 38px; height: 46px; transition: opacity 200ms; }
  .kd-person-pawn svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .kd-person.is-placed .kd-person-pawn { opacity: .3; }
  .kd-person-text { display: grid; flex: 1 1 auto; min-width: 0; line-height: 1.15; }
  .kd-person-text b { font: 700 var(--t-base)/1.1 var(--font-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kd-person-text small { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kd-held { display: none; color: var(--ink); font-weight: 700; }
  .kd-held .marker { margin-right: 4px; }
  .kd-person.held .kd-role { display: none; }
  .kd-person.held .kd-held { display: inline; animation: kd-fade 200ms ease-out; }
  .kd-at { display: inline-flex; align-items: center; gap: 4px; flex: none; font: 800 var(--t-sm)/1 var(--font-display); }
  .kd-at .marker { width: 8px; height: 8px; }

  .kd-tools { display: flex; justify-content: flex-end; }
  .kd-tools:empty { display: none; }
  .kd-reset { font-size: var(--t-sm); }

  /* Hinweise */
  .kd-clues-head { margin: 0 0 6px; font: 700 12px/1 var(--font-body); letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
  .kd-clue-list { list-style: none; margin: 0 0 18px; padding: 0; border-top: 1px solid var(--line); }
  .kd-clue { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--hairline); line-height: 1.4; }
  .kd-clue-mark { display: grid; place-items: center; flex: none; width: 20px; height: 22px; }
  .kd-clue-mark i { width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid #b5b5b5; }
  .kd-clue-mark svg { width: 20px; height: 20px; }
  .kd-check path { fill: none; stroke: var(--ok); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
  .kd-cross path { fill: none; stroke: var(--bad); stroke-width: 2.8; stroke-linecap: round; }
  .kd-clue.is-ok .kd-clue-text { color: var(--muted); }
  .kd-clue.is-bad .kd-clue-text { color: var(--bad); }
  .kd-clue.fresh.is-ok path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kd-draw 240ms cubic-bezier(.3,.7,.2,1) forwards; }
  .kd-clue.fresh.is-bad path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kd-draw 150ms cubic-bezier(.3,.7,.2,1) forwards; }
  .kd-clue.fresh.is-bad path + path { animation-delay: 90ms; }
  .kd-clue.fresh.is-bad .kd-clue-text { animation: kd-shake 260ms ease-out; }
  .kd-ref { display: inline-flex; align-items: baseline; gap: 3px; margin: 0; padding: 0 1px; border: 0; background: none;
    color: inherit; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline dotted 1.5px; text-underline-offset: 3px; }
  .kd-ref:hover { background: var(--wash); }
  .kd-ref i { display: inline-block; width: 8px; height: 8px; border-radius: 1px; background: var(--pc); }

  /* Notiztabelle: Linien wie im Rätselbuch, Raumnamen senkrecht */
  .kd-notes { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .kd-notes .kd-notes-who { width: 30%; }
  .kd-notes thead th { padding: 0 0 6px; vertical-align: bottom; font-weight: 700; text-align: center; font: 700 13px/1 var(--font-display); }
  .kd-notes thead th span { display: inline-block; max-height: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    writing-mode: vertical-rl; transform: rotate(180deg); }
  .kd-notes tbody th { padding: 0 6px 0 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font: 700 var(--t-base)/1 var(--font-display); }
  .kd-notes-pawn { display: inline-block; width: 18px; height: 22px; margin-right: 5px; vertical-align: -6px; }
  .kd-notes-pawn svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .kd-notes tbody td { padding: 0; border: 1px solid var(--hairline); }
  .kd-notes thead th { border-left: 1px solid var(--hairline); }
  .kd-notes tbody tr:first-child td { border-top: 1.5px solid var(--line); }
  .kd-notes tbody td:first-of-type { border-left: 1.5px solid var(--line); }
  .kd-notes tr.sel th, .kd-notes tr.sel td { background: var(--wash); }
  .kd-note { display: grid; place-items: center; width: 100%; height: 38px; margin: 0; padding: 0; border: 0; border-radius: 0;
    background: none; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .kd-note:hover:not(:disabled) { background: var(--wash); }
  .kd-note:disabled { cursor: default; }
  .kd-note:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }
  .kd-note svg { width: 24px; height: 24px; transition: transform 120ms cubic-bezier(.2,.8,.2,1); }
  .kd-note:active:not(:disabled) svg { transform: scale(.85); }
  .kd-nx path { fill: none; stroke: ${INK}; stroke-width: 2.4; stroke-linecap: round; }
  .kd-nok path { fill: none; stroke: var(--ok); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
  .kd-nx.enter path, .kd-nok.enter path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kd-draw 150ms cubic-bezier(.3,.7,.2,1) forwards; }
  .kd-nx.enter path + path { animation-delay: 90ms; }
  .kd-nok.enter path { animation-duration: 220ms; }
  .kd-notes-foot { margin: 8px 0 0; font-size: var(--t-sm); }
  .kd-notes-foot:empty { display: none; }

  .kd-rules summary { cursor: pointer; font-weight: 700; }
  .kd-rules-list { margin: 10px 0 8px; padding-left: 1.3em; max-width: 60ch; }
  .kd-rules-list li { margin-bottom: 6px; }
  .kd-rules-tip { margin: 0; color: var(--muted); font-size: var(--t-sm); }

  /* --- Bewegung --- */
  @keyframes kd-draw { to { stroke-dashoffset: 0; } }
  @keyframes kd-fade { from { opacity: 0; } }
  @keyframes kd-rise { from { opacity: 0; transform: translateY(12px); } }
  @keyframes kd-pop { from { opacity: 0; transform: scale(.55); } }
  @keyframes kd-drop { from { opacity: 0; transform: translateY(-34%); } }
  @keyframes kd-leave { to { opacity: 0; transform: translateY(-26%) scale(.9); } }
  @keyframes kd-ping { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.25); opacity: 0; } }
  @keyframes kd-shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
  @keyframes kd-fall { from { transform: none; } }
  @keyframes kd-stamp { from { opacity: 0; transform: scale(2) rotate(-18deg); } to { opacity: 1; transform: rotate(-9deg); } }

  /* Auftakt: Stockwerke von unten nach oben, Wände zeichnen sich ein, Möbel kommen dazu */
  .kd.intro .kd-case { animation: kd-rise 380ms cubic-bezier(.2,.8,.2,1) both; }
  .kd.intro .kd-walls line, .kd.intro .kd-outer { stroke-dasharray: 1; stroke-dashoffset: 1;
    animation: kd-draw 420ms cubic-bezier(.3,.7,.2,1) var(--d, 0ms) forwards; }
  .kd.intro .kd-item { animation: kd-pop 300ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d) + 320ms); }
  .kd.intro .kd-rooms > g > path { animation: kd-fade 400ms ease-out both; }
  .kd.intro .kd-doors, .kd.intro .kd-windows, .kd.intro .kd-labels { animation: kd-fade 380ms ease-out 650ms both; }
  .kd.intro .kd-cols, .kd.intro .kd-rows { animation: kd-fade 400ms ease-out 500ms both; }
  .kd.intro .kd-tray > * { animation: kd-rise 340ms cubic-bezier(.2,.8,.2,1) both; }
  .kd.intro .kd-tray > :nth-child(2) { animation-delay: 60ms; }
  .kd.intro .kd-tray > :nth-child(3) { animation-delay: 120ms; }
  .kd.intro .kd-tray > :nth-child(4) { animation-delay: 180ms; }
  .kd.intro .kd-tray > :nth-child(5) { animation-delay: 240ms; }
  .kd.intro .kd-tray > :nth-child(6) { animation-delay: 300ms; }
  .kd.intro .kd-clue { animation: kd-rise 320ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(400ms + var(--i) * 50ms); }

  /* Auflösung: Räume treten zurück, Tatraum wird umrandet, das Opfer kippt (Mord), der Stempel schlägt auf */
  .kd-sheet.solving .kd-solved line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kd-draw 520ms cubic-bezier(.3,.7,.2,1) 300ms forwards; }
  .kd-sheet.solving .kd-token.fallen .kd-pawn { animation: kd-fall 440ms cubic-bezier(.6,0,.2,1) 650ms both; }
  .kd-sheet.solving .kd-stamp { animation: kd-stamp 280ms cubic-bezier(.2,.8,.2,1) 950ms both; }
  .kd-sheet.solving .kd-crime { animation: kd-rise 360ms cubic-bezier(.2,.8,.2,1) 1100ms both; }

  @media (prefers-reduced-motion: reduce) {
    .kd *, .kd *::before { animation: none !important; transition: none !important; }
    .kd .kd-nx path, .kd .kd-nok path, .kd .kd-x path, .kd .kd-check path, .kd .kd-cross path, .kd .kd-solved line, .kd .kd-walls line, .kd .kd-outer { stroke-dashoffset: 0 !important; }
  }
`;
