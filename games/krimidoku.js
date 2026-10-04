// Krimidoku: Sudoku für Kriminalfälle. Zwei bis vier Spieler lösen zusammen, ohne Zeitlimit.
//
// Ein Haus, eine Nacht: Jeder Spieler bekommt ein Stockwerk (zu zweit Erdgeschoss und Obergeschoss,
// zu dritt dazu den Dachboden, zu viert auch den Keller), und auf jedem Stockwerk ist etwas passiert.
// Ein Stockwerk ist ein Grundriss aus n × n Feldern mit Räumen und Möbeln. Auf ihm waren n Personen,
// das Opfer und die Verdächtigen, und zwar so, dass in jeder Zeile und jeder Spalte genau eine stand.
// Hinweise sagen, wo jemand war („Berta saß auf einem Stuhl“). Täter ist, wer als Einziger mit dem
// Opfer im selben Raum war.
//
// Verzahnt: Manche Hinweise führen in das Stockwerk darüber oder darunter („Anton war genau über
// Berta“). Kein Stockwerk lässt sich allein lösen, alle zusammen schon (siehe generate). Jeder sieht
// alle Stockwerke; je nach Einstellung setzt man bei den anderen mit oder zeigt nur auf Felder
// (game.live). Ein Stockwerk ist gelöst, sobald alle Personen richtig stehen; sind alle gelöst, gewinnen alle.
//
// Motion: Das Haus baut sich Stockwerk für Stockwerk auf, Wände zeichnen sich ein, Möbel kommen
// gestaffelt dazu. Figuren gleiten aus der Leiste auf ihr Feld, Kreuze zeichnen sich ein, erfüllte
// Hinweise bekommen einen Haken. Beim Wechsel des Stockwerks fährt der Grundriss nach oben oder unten.
// Gelöst: Die anderen Räume treten zurück, der Tatraum wird umrandet, das Opfer kippt um (bei Mord),
// der Stempel „Täter“ schlägt auf, im Haus oben bekommt das Stockwerk seinen Stempel.

export const meta = {
  name: 'Krimidoku',
  description:
    'Sudoku für Kriminalfälle. Jeder löst ein Stockwerk desselben Hauses, aber die Hinweise führen auch in die anderen. Ihr spielt zusammen.',
  players: [2, 4],
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
    {
      id: 'helfen',
      label: 'Bei den anderen',
      choices: [
        { value: 'zeigen', label: 'Zuschauen und zeigen' },
        { value: 'mit', label: 'Mitlösen' },
      ],
    },
  ],
};

// ---------- Das Haus (Server und Browser) ----------

// Stockwerke von unten nach oben
const STACKS = { 2: ['eg', 'og'], 3: ['eg', 'og', 'dach'], 4: ['keller', 'eg', 'og', 'dach'] };

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

// Was auf einem Stockwerk passiert ist. Bei Mord liegt das Opfer.
const CRIMES = {
  mord: 'wurde ermordet',
  raub: 'wurde bestohlen',
  gift: 'wurde vergiftet und hat knapp überlebt',
  schlag: 'wurde niedergeschlagen',
  erpressung: 'wurde erpresst',
};

// ---------- Texte ----------

const FLOOR_IN = { keller: 'im Keller', eg: 'im Erdgeschoss', og: 'im Obergeschoss', dach: 'auf dem Dachboden' };
const FLOOR_SHORT = { keller: 'K', eg: 'EG', og: 'OG', dach: 'DG' };
// „in der Villa Seerose“, „im Haus Falkenstein“, „auf Gut Mühlbach“
const houseIn = (house) => (house.startsWith('Villa') ? 'in der ' : house.startsWith('Gut') ? 'auf ' : 'im ') + house;
const roomIn = (key) => (ROOMS[key]?.g === 'f' ? 'in der ' : 'im ') + (ROOMS[key]?.name ?? 'Raum');
const roomDat = (key) => (ROOMS[key]?.g === 'f' ? 'der ' : 'dem ') + (ROOMS[key]?.name ?? 'Raum');
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Ein Hinweis als Satz in Teilen: Text und Verweise auf Personen ({ f, p }), damit die Anzeige Namen
 * hervorheben und zu anderen Stockwerken springen kann. floors = Stockwerke (Grundrisse), f = Stockwerk
 * des Hinweises.
 */
function clueParts(floors, f, clue) {
  const fl = floors[f];
  const S = { f, p: clue.p };
  const Q = { f: clue.g ?? f, p: clue.q };
  const room = fl.names[clue.r];
  const dir = clue.g < f ? 'über' : 'unter';
  switch (clue.t) {
    case 'raum':
      return [S, ` war ${roomIn(room)}.`];
    case 'nicht':
      return [S, ` war nicht ${roomIn(room)}.`];
    case 'auf':
      return [S, ` ${ITEMS[clue.k]?.on ?? 'war dort'}.`];
    case 'neben':
      return [S, ` war neben ${ITEMS[clue.k]?.dat ?? 'etwas'}.`];
    case 'fenster':
      return [S, ' war an einem Fenster.'];
    case 'allein':
      return [S, ' war allein in einem Raum.'];
    case 'mit':
      return [S, ' war mit ', Q, ' im selben Raum.'];
    case 'leer':
      return [`${cap(roomIn(room))} war niemand.`];
    case 'genau':
      return [S, ` war genau ${dir} `, Q, '.'];
    case 'ueber': {
      const g = floors[clue.g];
      return [S, ` war ${dir} ${roomDat(g.names[clue.r])} ${FLOOR_IN[g.t]}.`];
    }
    case 'zimmer':
      return [S, ` war ${dir} dem Raum, in dem `, Q, ' war.'];
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

// Lösung eines Stockwerks: eine Person pro Zeile und Spalte, nur auf freien Feldern; im Raum des
// Opfers genau eine weitere Person (der Täter). near = Lösung des Stockwerks darunter (gleiche Felder
// werden bevorzugt, damit es Hinweise wie „genau über“ geben kann).
function placePeople(n, layout, near) {
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const cols = shuffle([...Array(n).keys()]);
    const cells = cols.map((x, y) => y * n + x);
    if (!cells.every((c) => free(layout.items[c]))) continue;
    const perRoom = {};
    for (const c of cells) perRoom[layout.rooms[c]] = (perRoom[layout.rooms[c]] ?? 0) + 1;
    const pairs = cells.filter((c) => perRoom[layout.rooms[c]] === 2);
    if (!pairs.length) continue;
    const shared = near ? cells.filter((c) => near.includes(c)).length : 1;
    const score = (shared >= 1 && shared <= 2 ? 2 : 0) + Math.random();
    if (!best || score > best.score) best = { score, cells, pairs };
    if (score >= 2) break;
  }
  if (!best) return null;
  const victim = pick(best.pairs);
  const rest = shuffle(best.cells.filter((c) => c !== victim));
  return [victim, ...rest]; // Person 0 ist das Opfer
}

// ---------- Hinweise und Löser ----------

// Ein Hinweis: { f: Stockwerk, p: Person (−1 = über einen Raum), t: Art, ... }
// raum r · nicht r · auf k · neben k · fenster · allein · mit q · leer r (niemand im Raum)
// Zwischen Stockwerken (g = anderes Stockwerk): genau q (genau über/unter q) · ueber r (über/unter Raum r
// von g) · zimmer q (über/unter dem Raum, in dem q auf g war)
const CROSS = ['genau', 'zimmer']; // brauchen die Lösung eines anderen Stockwerks

// Bedingungen eines Hinweises: unary = [[gid, (c) => bool]], binary = [[a, b, (ca, cb) => bool, key]]
// key(c) = was man über b wissen muss, um auf a zu schließen (Feld oder Raum), siehe propagate
function compile(H, clue, unary, binary) {
  const { n } = H;
  const fl = H.floors[clue.f];
  const gid = (f, p) => f * n + p;
  const me = gid(clue.f, clue.p);
  const other = clue.g !== undefined ? H.floors[clue.g] : null;
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
      for (let q = 0; q < n; q++) {
        if (q !== clue.p) binary.push([me, gid(clue.f, q), (a, b) => fl.rooms[a] !== fl.rooms[b], (c) => fl.rooms[c]]);
      }
      break;
    case 'mit':
      binary.push([me, gid(clue.f, clue.q), (a, b) => fl.rooms[a] === fl.rooms[b], (c) => fl.rooms[c]]);
      break;
    case 'leer':
      for (let q = 0; q < n; q++) unary.push([gid(clue.f, q), (c) => fl.rooms[c] !== clue.r]);
      break;
    case 'genau':
      binary.push([me, gid(clue.g, clue.q), (a, b) => a === b, (c) => c]);
      break;
    case 'ueber':
      unary.push([me, (c) => other.rooms[c] === clue.r]);
      break;
    case 'zimmer':
      binary.push([me, gid(clue.g, clue.q), (a, b) => other.rooms[a] === other.rooms[b], (c) => other.rooms[c]]);
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
 * floors = Stockwerke, die mitgerechnet werden (die anderen bleiben außen vor).
 * Rückgabe: Kandidaten pro Person (gid = f * n + p) oder null bei Widerspruch.
 */
function propagate(H, clues, { level = 2, floors = null } = {}) {
  const subsets = level >= 3;
  const { n } = H;
  const F = H.floors.length;
  const active = floors ?? [...Array(F).keys()];
  const unary = [];
  const binary = [];
  for (const clue of clues) compile(H, clue, unary, binary);
  const on = new Set(active);
  const D = [];
  for (let f = 0; f < F; f++) {
    const cells = [...Array(n * n).keys()].filter((c) => free(H.floors[f].items[c]));
    for (let p = 0; p < n; p++) D[f * n + p] = on.has(f) ? cells : [];
  }
  for (const [g, test] of unary) if (on.has(Math.floor(g / n))) D[g] = D[g].filter(test);
  const links = binary.filter(([a, b]) => on.has(Math.floor(a / n)) && on.has(Math.floor(b / n)));
  const row = (c) => Math.floor(c / n);
  const col = (c) => c % n;
  const full = (1 << n) - 1;

  for (let round = 0; round < 200; round++) {
    let changed = false;
    const set = (g, next) => {
      if (next.length === D[g].length) return true;
      D[g] = next;
      changed = true;
      return next.length > 0;
    };
    for (const f of active) {
      const P = [...Array(n).keys()].map((p) => f * n + p);
      for (const axis of [row, col]) {
        const bits = P.map((g) => D[g].reduce((m, c) => m | (1 << axis(c)), 0));
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
            if (!set(P[i], D[P[i]].filter((c) => !(union & (1 << axis(c)))))) return null;
            bits[i] = D[P[i]].reduce((m, c) => m | (1 << axis(c)), 0);
          }
        }
      }
    }
    for (const [a, b, rel, key] of links) {
      const same = Math.floor(a / n) === Math.floor(b / n);
      const ok = (x, y) => rel(x, y) && (!same || (row(x) !== row(y) && col(x) !== col(y)));
      const known = (g) => level >= 3 || D[g].every((c) => key(c) === key(D[g][0]));
      if (known(b) && !set(a, D[a].filter((x) => D[b].some((y) => ok(x, y))))) return null;
      if (known(a) && !set(b, D[b].filter((y) => D[a].some((x) => ok(x, y))))) return null;
    }
    if (!changed) break;
  }
  return D;
}

const solvedBy = (H, D, floors) => D && floors.every((f) => [...Array(H.n).keys()].every((p) => D[f * H.n + p].length === 1));

// Alle wahren Hinweise über eine Lösung, mit Gewicht (wie gern sie genommen werden)
function candidates(H, sol) {
  const { n } = H;
  const out = [];
  const F = H.floors.length;
  for (let f = 0; f < F; f++) {
    const fl = H.floors[f];
    const roomOf = (p) => fl.rooms[sol[f][p]];
    for (let p = 0; p < n; p++) {
      const c = sol[f][p];
      const r = fl.rooms[c];
      const add = (clue, w) => out.push({ f, p, ...clue, w });
      add({ t: 'raum', r }, 3);
      for (let x = 0; x < fl.names.length; x++) if (x !== r) add({ t: 'nicht', r: x }, 0.4);
      if (fl.items[c]) add({ t: 'auf', k: fl.items[c] }, 3.5);
      for (const k of new Set(around(n, c).map((d) => fl.items[d]).filter(Boolean))) add({ t: 'neben', k }, 2.5);
      if (fl.win[c]) add({ t: 'fenster' }, 2);
      const mates = [...Array(n).keys()].filter((q) => q !== p && roomOf(q) === r);
      if (p !== 0 && !mates.length) add({ t: 'allein' }, 2);
      for (const q of mates) if (q > p && p !== 0 && q !== 0) add({ t: 'mit', q }, 2.5);
      for (const g of [f - 1, f + 1]) {
        if (g < 0 || g >= F) continue;
        const og = H.floors[g];
        add({ t: 'ueber', g, r: og.rooms[c] }, 1.2);
        for (let q = 0; q < n; q++) {
          if (sol[g][q] === c) add({ t: 'genau', g, q }, 4);
          else if (og.rooms[sol[g][q]] === og.rooms[c]) add({ t: 'zimmer', g, q }, 2.5);
        }
      }
    }
    for (let r = 0; r < fl.names.length; r++) {
      if (![...Array(n).keys()].some((p) => roomOf(p) === r)) out.push({ f, p: -1, t: 'leer', r, w: 1 });
    }
  }
  return out;
}

// Ein ganzes Haus mit Hinweisen. Gesucht: Alle Stockwerke zusammen sind eindeutig lösbar (mit dem Löser
// oben, also ohne Raten), keins allein. Allein soll man aber anfangen können: Auf jedem Stockwerk lassen
// sich ohne die anderen schon einige Personen sicher setzen (start), der Rest braucht die Nachbarn.
// Jeder übrige Hinweis wird gebraucht.
function generate(F, n) {
  const level = n - 3;
  const start = Math.ceil(n / 3);
  const types = STACKS[F];
  const all = Array.from({ length: F }, (_, f) => f);
  const isCross = (c) => CROSS.includes(c.t);
  let fallback = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const floors = [];
    const sol = [];
    for (let f = 0; f < F; f++) {
      const layout = buildLayout(n, types[f]);
      const cells = layout && placePeople(n, layout, sol[f - 1]);
      if (!cells) break;
      floors.push(layout);
      sol.push(cells);
    }
    if (floors.length < F) continue;
    const H = { n, floors };
    const pool = candidates(H, sol);
    const joint = (clues) => solvedBy(H, propagate(H, clues, { level }), all);
    // Wie viele Personen eines Stockwerks stehen allein fest (ohne Hinweise, die ein anderes brauchen)?
    const fixedAlone = (clues, f) => {
      const D = propagate(H, clues.filter((c) => c.f === f && !isCross(c)), { level, floors: [f] });
      return D ? [...Array(n).keys()].filter((p) => D[f * n + p].length === 1).length : 0;
    };

    // Anfang: pro Person ein, zwei Hinweise, dazu Verbindungen zwischen den Stockwerken
    const chosen = new Set();
    for (let f = 0; f < F; f++) {
      for (let p = 0; p < n; p++) {
        const own = pool.filter((c) => c.f === f && c.p === p && !isCross(c));
        for (let i = 0; i < 1 + rnd(2) && own.length; i++) chosen.add(weighted(own, (c) => c.w));
      }
      const cross = pool.filter((c) => c.f === f && isCross(c));
      for (let i = 0; i < 2 && cross.length; i++) chosen.add(weighted(cross, (c) => c.w));
    }
    const add = (from) => {
      const c = weighted(from, (x) => x.w);
      chosen.add(c);
    };
    for (let f = 0; f < F; f++) {
      for (let i = 0; i < 12 && fixedAlone([...chosen], f) < start; i++) {
        const own = pool.filter((c) => c.f === f && !isCross(c) && !chosen.has(c));
        if (!own.length) break;
        add(own);
      }
    }
    for (let i = 0; i < 60 && !joint([...chosen]); i++) {
      const rest = pool.filter((c) => !chosen.has(c));
      if (!rest.length) break;
      add(rest);
    }
    if (!joint([...chosen])) continue;

    // Weglassen, was nicht gebraucht wird: zuerst Hinweise innerhalb eines Stockwerks, damit die
    // Verbindungen bleiben. Ein Stockwerk behält genug, um allein anzufangen.
    let clues = [...chosen];
    const order = [...shuffle(clues.filter((c) => !isCross(c))), ...shuffle(clues.filter(isCross))];
    const aloneNow = all.map((f) => fixedAlone(clues, f));
    for (const c of order) {
      const without = clues.filter((x) => x !== c);
      // zuerst die billige Prüfung (ein Stockwerk), dann der ganze Löser
      const k = isCross(c) ? null : fixedAlone(without, c.f);
      if (k !== null && k < start && aloneNow[c.f] >= start) continue;
      if (!joint(without)) continue;
      clues = without;
      if (k !== null) aloneNow[c.f] = k;
    }
    // Verzahnt: kein Stockwerk allein lösbar, und jedes kann anfangen
    const counts = all.map((f) => fixedAlone(clues, f));
    const alone = counts.filter((k) => k === n).length;
    const slow = counts.filter((k) => k < start).length;
    const result = { floors, sol, clues };
    if (alone || slow) {
      const score = alone * 10 + slow;
      if (!fallback || score < fallback.score) fallback = { ...result, score };
      continue;
    }
    // Leicht: Personen ohne Hinweis bekommen einen, solange das Stockwerk dadurch nicht allein lösbar wird
    if (n === 4) {
      for (let f = 0; f < F; f++) {
        for (let p = 0; p < n; p++) {
          if (clues.some((c) => c.f === f && c.p === p)) continue;
          const extra = pool.filter((c) => c.f === f && c.p === p && !isCross(c) && c.t !== 'nicht');
          if (!extra.length) continue;
          const c = weighted(extra, (x) => x.w);
          if (fixedAlone([...clues, c], f) < n) clues.push(c);
        }
      }
    }
    return result;
  }
  return fallback ?? generate(F, n);
}

// ---------- Spielablauf (Server) ----------
// Züge (alle mit f = Stockwerk): setzen { p, c } (c = −1: zurück in die Leiste), kreuz { c }, leeren,
// notiz { p, r, v } (Feld der Notiztabelle auf v), notizen-leeren

const SIZES = [5, 4, 6];
const ids = (s) => s.players.map((p) => p.id);
const nameOf = (s, id) => s.players.find((p) => p.id === id)?.name ?? '?';

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn'];
const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`);

// Personen für ein Haus: alle Namen verschieden, pro Stockwerk verschiedene Anfangsbuchstaben
function cast(F, n) {
  const pool = shuffle([...PEOPLE]);
  const floors = [];
  for (let f = 0; f < F; f++) {
    const floor = [];
    for (let i = 0; i < pool.length && floor.length < n; i++) {
      if (floor.some((p) => p.name[0] === pool[i].name[0])) continue;
      floor.push(pool.splice(i, 1)[0]);
      i--;
    }
    floors.push(floor);
  }
  return floors;
}

export function setup(players, options = {}) {
  const n = SIZES.includes(options.stufe) ? options.stufe : 5;
  const F = Math.min(4, Math.max(2, players.length));
  const house = generate(F, n);
  const people = cast(F, n);
  const owners = shuffle(players.map((p) => p.id));
  const crimes = shuffle(Object.keys(CRIMES).filter((k) => k !== 'mord')).slice(0, F - 1);
  crimes.splice(rnd(F), 0, 'mord'); // in jedem Haus genau ein Mord
  return {
    players: players.map(({ id, name }) => ({ id, name })),
    n,
    helfen: options.helfen === 'mit' ? 'mit' : 'zeigen',
    house: pick(HOUSES),
    floors: house.floors.map((layout, f) => ({
      ...layout,
      owner: owners[f % owners.length],
      crime: crimes[f],
      people: people[f],
      clues: house.clues.filter((c) => c.f === f).map(({ f: _, w, ...c }) => c),
      sol: house.sol[f],
      pos: Array(n).fill(-1),
      notes: Array(n * layout.names.length).fill(0), // Notiztabelle Personen × Räume: 0 leer, 1 Kreuz, 2 Haken
      marks: [],
      solved: false,
    })),
  };
}

function floorOf(s, data) {
  const f = data?.f;
  if (!Number.isInteger(f) || !s.floors[f]) throw new Error('Dieses Stockwerk gibt es nicht.');
  return s.floors[f];
}

export function action(s, { player, type, data }) {
  if (s.result || !ids(s).includes(player)) return;
  const fl = floorOf(s, data);
  if (fl.solved) return; // gelöst: nichts mehr zu ändern
  if (s.helfen !== 'mit' && fl.owner !== player) {
    throw new Error(`Das ist das Stockwerk von ${nameOf(s, fl.owner)}. Du kannst zuschauen und zeigen.`);
  }
  const N2 = s.n * s.n;
  const cell = data?.c;
  const validCell = Number.isInteger(cell) && cell >= 0 && cell < N2;

  if (type === 'setzen') {
    const p = data?.p;
    if (!Number.isInteger(p) || p < 0 || p >= s.n) throw new Error('Diese Person gibt es nicht.');
    if (cell === -1) {
      fl.pos[p] = -1;
    } else {
      if (!validCell) throw new Error('Dieses Feld gibt es nicht.');
      if (!free(fl.items[cell])) throw new Error(`Auf ${ITEMS[fl.items[cell]]?.dat ?? 'diesem Feld'} kann niemand stehen.`);
      const there = fl.pos.indexOf(cell);
      if (there >= 0 && there !== p) fl.pos[there] = -1; // wer dort stand, geht zurück in die Leiste
      fl.pos[p] = cell;
      fl.marks = fl.marks.filter((c) => c !== cell);
    }
    if (fl.pos.every((c, i) => c === fl.sol[i])) solve(s);
    return;
  }
  if (type === 'kreuz') {
    if (!validCell) throw new Error('Dieses Feld gibt es nicht.');
    if (fl.pos.includes(cell) || !free(fl.items[cell])) return;
    fl.marks = fl.marks.includes(cell) ? fl.marks.filter((c) => c !== cell) : [...fl.marks, cell];
    return;
  }
  if (type === 'leeren') {
    fl.pos = Array(s.n).fill(-1);
    fl.marks = [];
    return;
  }
  const k = fl.names.length;
  if (type === 'notiz') {
    const { p, r, v } = data ?? {};
    if (!Number.isInteger(p) || p < 0 || p >= s.n || !Number.isInteger(r) || r < 0 || r >= k || ![0, 1, 2].includes(v)) {
      throw new Error('Diese Notiz gibt es nicht.');
    }
    fl.notes ??= Array(s.n * k).fill(0); // Partien von vor der Notiztabelle
    fl.notes[p * k + r] = v;
    return;
  }
  if (type === 'notizen-leeren') fl.notes = Array(s.n * k).fill(0);
}

// Ein Stockwerk steht richtig. Sind alle gelöst, gewinnen alle zusammen.
function solve(s) {
  for (const fl of s.floors) if (fl.pos.every((c, i) => c === fl.sol[i])) fl.solved = true;
  if (!s.floors.every((x) => x.solved)) return;
  const F = s.floors.length;
  s.result = {
    winners: ids(s),
    text: `${F === 2 ? 'Beide' : `Alle ${ONES[F]}`} Fälle ${houseIn(s.house)} sind gelöst.`,
  };
}

// Wer noch ein offenes Stockwerk hat
export function waitingFor(s) {
  if (s.result) return [];
  return [...new Set(s.floors.filter((x) => !x.solved).map((x) => x.owner))];
}

// Nachrichten nur, wenn ein Stockwerk gelöst ist, nicht bei jedem Setzen
export function notices(s, before, player) {
  if (s.result) return [];
  const fresh = s.floors.filter((x, f) => x.solved && !before.floors[f].solved);
  if (!fresh.length) return [];
  const fl = fresh[0];
  const open = s.floors.filter((x) => !x.solved);
  const text = `${cap(FLOOR_IN[fl.t])} ist der Fall gelöst. Noch offen: ${list(open.map((x) => FLOORS[x.t].name))}.`;
  return ids(s).map((to) => ({ to, text }));
}

// Geheim ist nur die Lösung offener Stockwerke
export function view(s) {
  return { ...s, floors: s.floors.map((fl) => (fl.solved ? fl : { ...fl, sol: null })) };
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

// Durchsicht: Wände, Räume und gesetzte Personen eines anderen Stockwerks, darübergelegt
function xraySvg(fl, n, pos, people) {
  const W = n * 100;
  const size = 3.4 * n + 2;
  const walls = wallLines(fl, n)
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"/>`)
    .join('');
  const labels = fl.names
    .map((key, r) => {
      const cells = roomCells(fl, r);
      const c = Math.max(...cells);
      const x = (c % n) * 100 + 92;
      const y = Math.floor(c / n) * 100 + 90;
      return `<text x="${x}" y="${y}" text-anchor="end" style="font-size:${(size * 0.9).toFixed(1)}px">${ROOMS[key]?.name ?? ''}</text>`;
    })
    .join('');
  const ghosts = pos
    .map((c, p) => {
      if (c < 0) return '';
      const x = (c % n) * 100 + 50;
      const y = Math.floor(c / n) * 100 + 50;
      const [body] = p === 0 ? VICTIM : SUSPECT[(p - 1) % SUSPECT.length];
      return `<g class="kd-ghost" data-p="${p}"><circle cx="${x}" cy="${y}" r="27" fill="${PAPER}" fill-opacity=".85" stroke="${p === 0 ? INK : body}" stroke-width="6" stroke-dasharray="9 6"/>
        <text x="${x}" y="${y + 11}" text-anchor="middle" style="font:800 32px var(--font-display)" fill="${p === 0 ? INK : body}">${people[p].name[0]}</text></g>`;
    })
    .join('');
  return `<svg class="kd-xray" viewBox="-8 -8 ${W + 16} ${W + 16}" aria-hidden="true">
    <g class="kd-xray-walls" fill="none">${walls}<rect x="0" y="0" width="${W}" height="${W}"/></g>
    <g class="kd-xray-labels">${labels}</g>${ghosts}</svg>`;
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
const SOLVED_MARK = `<svg class="kd-seal" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="16" fill="${PAPER}" stroke="${C.stempel}" stroke-width="2.6"/>
  <circle cx="20" cy="20" r="12.5" fill="none" stroke="${C.stempel}" stroke-width="1.1"/>
  <path pathLength="1" d="M13 20.5 L18 25.5 L27.5 14.5" fill="none" stroke="${C.stempel}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Haus im Schnitt: Dach mit Schornstein, darunter ein Streifen pro Stockwerk
const ROOF = `<svg class="kd-roof-svg" viewBox="0 0 80 34" aria-hidden="true"><g ${sw(2.2)}>
  <path d="M55 6 H63 V20 H55 Z" fill="${C.rost}"/><path d="M53.5 4 H64.5 V7.5 H53.5 Z" fill="${INK}"/>
  <path d="M3 33 L40 6 L77 33 Z" fill="${C.rostDunkel}"/>
  <path d="M14 25 L40 7.5 M23 28 L45 12 M33 31 L52 17" stroke="#fff" stroke-width="1.2" opacity=".35"/>
  <circle cx="40" cy="22" r="4.2" fill="${PAPER}"/><path d="M40 18 V26 M36 22 H44" stroke-width="1.2"/>
</g></svg>`;
function sliceSvg(type, bottom) {
  const panes = type === 'eg' ? [14, 50, 66] : [14, 32, 50, 66];
  const wins =
    type === 'keller'
      ? ''
      : panes.map((x) => `<rect x="${x}" y="8" width="9" height="11" fill="${C.wasser}" stroke="${INK}" stroke-width="1.6"/><path d="M${x + 4.5} 8 V19" stroke="${INK}" stroke-width="1"/>`).join('');
  const door = type === 'eg' ? `<path d="M34 30 V16 Q38.5 12 43 16 V30 Z" fill="${C.holzDunkel}" stroke="${INK}" stroke-width="1.6"/>` : '';
  // Keller: Erdreich oben am Rand, kleine Kellerfenster
  const ground =
    type === 'keller'
      ? `<path d="M2 1 H78" stroke="${C.gruen}" stroke-width="3"/><g stroke="${INK}" stroke-width=".9" opacity=".35">${Array.from({ length: 9 }, (_, i) => `<path d="M${4 + i * 9} 5 l5 5"/>`).join('')}</g>
    <rect x="16" y="13" width="10" height="6" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/><rect x="54" y="13" width="10" height="6" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`
      : '';
  return `<svg class="kd-slice-svg" viewBox="0 0 80 30" preserveAspectRatio="none" aria-hidden="true">
    <rect x="7" y="0" width="66" height="30" fill="${type === 'keller' ? '#ddd5c6' : '#f1e5cf'}"/>${wins}${door}${ground}
    <path d="M7 0 V30 M73 0 V30" stroke="${INK}" stroke-width="3"/>
    ${bottom ? `<path d="M2 29 H78" stroke="${INK}" stroke-width="3"/>` : `<path d="M7 29.5 H73" stroke="${INK}" stroke-width="1.4"/>`}
  </svg>`;
}

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

// Täter: wer im Raum des Opfers stand (nur für gelöste Stockwerke, dann ist pos die Lösung)
function culpritOf(fl) {
  const room = fl.rooms[fl.pos[0]];
  return fl.pos.findIndex((c, p) => p > 0 && c >= 0 && fl.rooms[c] === room);
}

// Ist ein Hinweis mit den gesetzten Personen erfüllt? 'ok', 'bad' oder '' (noch offen)
function clueState(floors, f, clue, posOf) {
  const fl = floors[f];
  const n = fl.pos.length;
  const pos = posOf(f);
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
    case 'genau': {
      const b = posOf(clue.g)[clue.q];
      return b < 0 ? '' : test(b === at);
    }
    case 'ueber':
      return test(floors[clue.g].rooms[at] === clue.r);
    case 'zimmer': {
      const b = posOf(clue.g)[clue.q];
      const other = floors[clue.g].rooms;
      return b < 0 ? '' : test(other[at] === other[b]);
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

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = {
      signal: game.signal,
      floor: null, // welches Stockwerk gerade zu sehen ist
      drawn: null, // welches gezeichnet ist (Schlüssel)
      sel: null, // ausgewählte Person auf diesem Stockwerk
      over: {}, // eigene Züge, die der Server noch nicht bestätigt hat: { [f]: { pos, marks, notes, done } }
      pending: {}, // wie viele Anfragen pro Stockwerk noch unterwegs sind
      queue: Promise.resolve(),
      xray: null,
      shownPos: {}, // was gerade auf dem Brett steht (für Bewegungen)
      shownMarks: {},
      shownNotes: {},
      shownSolved: {},
      clueShown: {},
      fly: null, // Person, die gerade aus der Leiste kommt: { p, rect }
      confirm: 0,
      pingAt: 0,
      looking: {}, // wer gerade welches Stockwerk ansieht: { [id]: { f, at } }
    };
    ui.set(el, u);
    game.live.on((data, from) => onLive(el, u, data, from));
  }
  return u;
}

const posOfShown = (u, s) => (f) => u.over[f]?.pos ?? s.floors[f].pos;
const marksOfShown = (u, s, f) => u.over[f]?.marks ?? s.floors[f].marks;
const notesOfShown = (u, s, f) => u.over[f]?.notes ?? s.floors[f].notes ?? Array(s.n * s.floors[f].names.length).fill(0);
const canEdit = (s, f, game) => !game.result && !s.floors[f].solved && (s.helfen === 'mit' || s.floors[f].owner === game.me);

// ---------- Anzeige ----------

export function render(el, s, game) {
  const u = local(el, game);
  u.s = s;
  u.game = game;
  // Bestätigt: Der Server-Stand enthält die eigenen Züge
  for (const f of Object.keys(u.over)) if (u.over[f].done) delete u.over[f];
  if (u.floor === null) {
    const mine = s.floors.findIndex((fl) => fl.owner === game.me);
    u.floor = mine >= 0 ? mine : 0;
  }

  let root = el.querySelector(':scope > .kd');
  if (!root) {
    el.innerHTML = `<div class="kd ${game.first && !game.reducedMotion ? 'intro' : ''}" style="--n:${s.n}">
      <ol class="kd-house" aria-label="Stockwerke"></ol>
      <section class="kd-sheet">
        <div class="kd-case"></div>
        <div class="kd-main">
          <div class="kd-board">
            <div class="kd-cols" aria-hidden="true">${Array.from({ length: s.n }, (_, i) => `<span>${'ABCDEF'[i]}</span>`).join('')}</div>
            <div class="kd-rows" aria-hidden="true">${Array.from({ length: s.n }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
            <div class="kd-plan"><div class="kd-planbox"></div><div class="kd-xraybox"></div><div class="kd-cells"></div><div class="kd-tokens"></div><div class="kd-fx"></div></div>
          </div>
          <div class="kd-side">
            <p class="kd-hint" aria-live="polite"></p>
            <div class="kd-tray"></div>
            <div class="kd-tools"></div>
            <div class="kd-clues"></div>
            <div class="kd-notes-box"></div>
          </div>
        </div>
      </section>
      <div class="kd-end"></div>
      <details class="kd-rules"><summary>So geht’s</summary>${rulesHtml(s)}</details>
    </div>`;
    root = el.firstElementChild;
    if (root.classList.contains('intro')) setTimeout(() => root.classList.remove('intro'), 1500);
    bind(root, u);
  }
  u.root = root;
  draw(u);
}

function rulesHtml(s) {
  return `<ol class="kd-rules-list">
    <li>Jeder hat ein Stockwerk. Auf jedem stand in jeder Zeile und jeder Spalte genau eine Person.</li>
    <li>Niemand stand auf Tischen, Pflanzen, Regalen, Kisten, Fässern, Herden, Badewannen oder Klavieren. Auf Stühlen und Sesseln saß man, auf Betten lag man, auf Teppichen stand man.</li>
    <li>„Neben“ heißt waagerecht oder senkrecht daneben. „Über“ und „unter“ heißt: auf demselben Feld ein Stockwerk höher oder tiefer. Die Durchsicht legt das Stockwerk darunter oder darüber auf den Grundriss.</li>
    <li>Täter ist, wer als Einziger mit dem Opfer im selben Raum war.</li>
    <li>${s.helfen === 'mit' ? 'Ihr dürft überall mitlösen.' : 'Bei den anderen könnt ihr zuschauen und auf Felder zeigen.'} Sind alle Stockwerke gelöst, habt ihr zusammen gewonnen.</li>
  </ol>
  <p class="kd-rules-tip">Ein Tipp auf ein leeres Feld setzt ein Kreuz: Hier war niemand. In der Notiztabelle setzt ein Tipp ein Kreuz (nicht in diesem Raum), der zweite einen Haken (in diesem Raum), der dritte leert das Feld.</p>`;
}

// Alles neu zeichnen, was sich geändert haben kann (auch nach eigenen Zügen, bevor der Server antwortet)
function draw(u) {
  const { s, game, root } = u;
  const f = u.floor;
  const fl = s.floors[f];
  const n = s.n;
  const posOf = posOfShown(u, s);
  const pos = posOf(f);
  const marks = marksOfShown(u, s, f);
  const edit = canEdit(s, f, game);
  if (u.sel !== null && (!edit || u.sel >= n)) u.sel = null;

  renderHouse(u);

  // Stockwerk wechseln: Grundriss neu, fährt aus der Richtung herein
  const key = `${f}`;
  const plan = root.querySelector('.kd-plan');
  if (u.drawn !== key) {
    const from = u.drawn === null ? null : Number(u.drawn);
    u.drawn = key;
    u.sel = null;
    u.xray = null;
    put(plan.querySelector('.kd-planbox'), planSvg(fl, n));
    plan.querySelector('.kd-cells').innerHTML = Array.from({ length: n * n }, (_, c) => {
      const blocked = !free(fl.items[c]);
      return `<button class="kd-cell ${blocked ? 'blocked' : ''}" data-c="${c}" style="--x:${c % n};--y:${Math.floor(c / n)}"></button>`;
    }).join('');
    plan.querySelector('.kd-tokens').innerHTML = '';
    plan.querySelector('.kd-fx').innerHTML = '';
    delete u.shownPos[f];
    delete u.shownMarks[f];
    u.shownSolved[f] = fl.solved;
    u.clueShown = {};
    if (from !== null && !game.reducedMotion) {
      const up = f > from;
      plan.animate(
        [
          { transform: `translateY(${up ? -22 : 22}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
    sendLooking(u);
  }
  root.querySelector('.kd-sheet').dataset.floor = fl.t;

  renderCase(u, fl);
  renderCells(u, fl, pos, marks, edit);
  renderTokens(u, fl, pos, edit);
  renderXray(u);
  renderTray(u, fl, pos, edit);
  renderHint(u, fl, pos, edit);
  renderTools(u, fl, edit);
  renderClues(u, posOf);
  renderNotes(u, fl, edit);
  renderSolved(u, fl);
  renderEnd(u);
}

function renderHouse(u) {
  const { s, game, root } = u;
  const F = s.floors.length;
  const rows = [];
  // Gerade gelöst: Das Siegel im Haus kommt nach der Auflösung
  const fresh = game.reducedMotion || !u.sealShown ? [] : s.floors.map((fl, f) => (fl.solved && !u.sealShown[f] ? f : -1)).filter((f) => f >= 0);
  u.sealShown = s.floors.map((fl) => fl.solved);
  for (let f = F - 1; f >= 0; f--) {
    const fl = s.floors[f];
    const pos = posOfShown(u, s)(f);
    const placed = pos.filter((c) => c >= 0).length;
    const pips = pos.map((c) => `<i class="${c >= 0 ? 'on' : ''}"></i>`).join('');
    rows.push(`<li style="--i:${f}"><button class="kd-level ${f === u.floor ? 'is-current' : ''} ${fl.solved ? 'is-solved' : ''}" data-floor="${f}"
        aria-pressed="${f === u.floor}" aria-label="${FLOORS[fl.t].name}, ${game.esc(game.name(fl.owner))}${fl.solved ? ', gelöst' : ''}">
      <span class="kd-slice">${sliceSvg(fl.t, f === 0)}${fl.solved ? SOLVED_MARK.replace('kd-seal', `kd-seal ${fresh.includes(f) ? 'fresh' : ''}`) : ''}</span>
      <span class="kd-level-text"><span class="kd-level-name">${FLOORS[fl.t].name}</span>
        <span class="kd-level-who">${marker(game, fl.owner)}${fl.owner === game.me ? 'Du' : game.esc(game.name(fl.owner))}<span class="kd-looks" data-f="${f}"></span></span></span>
      <span class="kd-level-state">${fl.solved ? '<span class="kd-solved-word">Gelöst</span>' : `<span class="kd-pips" aria-label="${placed} von ${s.n} gesetzt">${pips}</span>`}</span>
    </button></li>`);
  }
  put(
    root.querySelector('.kd-house'),
    `<li class="kd-roof" style="--i:${F}"><span class="kd-slice">${ROOF}</span><span class="kd-house-name">${game.esc(s.house)}</span></li>${rows.join('')}`,
  );
  renderLooks(u);
}

// Wer gerade welches Stockwerk ansieht: ein Punkt in seiner Farbe hinter dem Namen
function renderLooks(u) {
  const { game, root } = u;
  for (const box of root.querySelectorAll('.kd-looks')) {
    const f = Number(box.dataset.f);
    const html = Object.entries(u.looking)
      .filter(([id, l]) => l.f === f && id !== game.me && Date.now() - l.at < 30000)
      .map(([id]) => `<span class="kd-look" title="${game.esc(game.name(id))} schaut hier">${marker(game, id)}</span>`)
      .join('');
    put(box, html);
  }
}

function renderCase(u, fl) {
  const { game, root } = u;
  const victim = fl.people[0];
  const solved = fl.solved;
  let text;
  if (solved) {
    const t = fl.people[culpritOf(fl)];
    text = `Nur ${game.esc(t.name)} war mit ${game.esc(victim.name)} ${roomIn(fl.names[fl.rooms[fl.pos[0]]])}. ${game.esc(t.role)} ${game.esc(t.name)} hat ${game.esc(victim.role)} ${game.esc(victim.name)} ${CRIME_DONE[fl.crime] ?? 'überfallen'}.`;
  } else {
    text = `${game.esc(victim.role)} ${game.esc(victim.name)} ${CRIMES[fl.crime] ?? 'wurde überfallen'}. Wer war es?`;
  }
  const owner = fl.owner === game.me ? 'Dein Stockwerk' : `Stockwerk von ${game.esc(game.name(fl.owner))}`;
  put(
    root.querySelector('.kd-case'),
    `<h3 class="kd-title">${FLOORS[fl.t].name}<span class="kd-owner">${marker(game, fl.owner)}${owner}</span></h3>
     <p class="kd-crime ${solved ? 'is-solved' : ''}">${text}</p>`,
  );
}

function renderCells(u, fl, pos, marks, edit) {
  const { s, game, root } = u;
  const n = s.n;
  const f = u.floor;
  const before = u.shownMarks[f];
  const zeigen = !edit && !fl.solved && !game.result && s.helfen !== 'mit';
  root.querySelector('.kd-plan').classList.toggle('is-locked', !edit && !zeigen);
  root.querySelector('.kd-plan').classList.toggle('is-pointing', zeigen);
  root.querySelector('.kd-plan').classList.toggle('is-picking', edit && u.sel !== null);
  for (const cell of root.querySelectorAll('.kd-cell')) {
    const c = Number(cell.dataset.c);
    const marked = marks.includes(c);
    const has = cell.querySelector('.kd-x');
    if (marked && !has) {
      cell.insertAdjacentHTML('beforeend', XMARK);
      if (before && !before.includes(c)) cell.querySelector('.kd-x').classList.add('enter');
    } else if (!marked && has) has.remove();
    const p = pos.indexOf(c);
    const room = ROOMS[fl.names[fl.rooms[c]]]?.name ?? '';
    const item = fl.items[c] ? `, ${ITEMS[fl.items[c]]?.name}` : '';
    const who = p >= 0 ? `, ${fl.people[p].name}` : marked ? ', Kreuz' : '';
    const label = `${coord(n, c)}, ${room}${item}${who}`;
    if (cell.getAttribute('aria-label') !== label) cell.setAttribute('aria-label', label);
    cell.disabled = !edit && !zeigen;
  }
  u.shownMarks[f] = [...marks];
}

function renderTokens(u, fl, pos, edit) {
  const { s, game, root } = u;
  const n = s.n;
  const f = u.floor;
  const box = root.querySelector('.kd-tokens');
  const before = u.shownPos[f];
  const bad = clashes(pos, n);
  for (let p = 0; p < n; p++) {
    let tok = box.querySelector(`.kd-token[data-p="${p}"]`);
    const c = pos[p];
    if (c < 0) {
      if (tok && u.flyBack?.p === p && u.flyBack.f === f && !game.reducedMotion) {
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
      box.insertAdjacentHTML(
        'beforeend',
        `<button class="kd-token" data-p="${p}" style="--x:${x};--y:${y}">${pawn(fl.people[p], p)}</button>`,
      );
      tok = box.lastElementChild;
      if (before && !game.reducedMotion) {
        const fly = u.fly?.p === p && u.fly.f === f ? u.fly : null;
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
      const fly = u.fly?.p === p && u.fly.f === f && !game.reducedMotion ? u.fly : null;
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
    tok.setAttribute('aria-label', `${fl.people[p].name}, ${coord(n, c)}${u.sel === p ? ', ausgewählt' : ''}`);
  }
  u.fly = null;
  u.flyBack = null;
  u.shownPos[f] = [...pos];
}

function renderXray(u) {
  const { s, root } = u;
  const box = root.querySelector('.kd-xraybox');
  if (u.xray === null) {
    put(box, '');
    return;
  }
  const g = s.floors[u.xray];
  put(box, xraySvg(g, s.n, posOfShown(u, s)(u.xray), g.people));
}

function renderTray(u, fl, pos, edit) {
  const { s, game, root } = u;
  const n = s.n;
  const html = fl.people
    .map((person, p) => {
      const c = pos[p];
      const where = c >= 0 ? `<span class="kd-at num">${coord(n, c)}</span>` : '';
      return `<button class="kd-person ${c >= 0 ? 'is-placed' : ''} ${u.sel === p ? 'sel' : ''}" data-p="${p}" ${edit ? '' : 'disabled'}
          aria-pressed="${u.sel === p}" aria-label="${game.esc(person.role)} ${game.esc(person.name)}${p === 0 ? ', Opfer' : ''}${c >= 0 ? `, steht auf ${coord(n, c)}` : ''}">
        <span class="kd-person-pawn">${pawn(person, p)}</span>
        <span class="kd-person-text"><b>${game.esc(person.name)}</b><small>${p === 0 ? 'Opfer' : game.esc(person.role)}</small></span>${where}
      </button>`;
    })
    .join('');
  put(root.querySelector('.kd-tray'), html);
}

function renderHint(u, fl, pos, edit) {
  const { s, game, root } = u;
  const hint = root.querySelector('.kd-hint');
  let html;
  if (game.result) html = '';
  else if (fl.solved) {
    const open = s.floors.map((g, i) => [g, i]).filter(([g]) => !g.solved);
    html = `Hier ist alles gelöst. Offen: ${open.map(([g, i]) => `<button class="link kd-go" type="button" data-floor="${i}">${FLOORS[g.t].name}</button>`).join(', ')}.`;
  }
  else if (!edit) {
    html = s.helfen === 'mit' ? '' : `Tippe auf ein Feld, um es allen zu zeigen. Setzen kann ${game.esc(game.name(fl.owner))}.`;
  } else if (u.sel !== null) {
    const person = fl.people[u.sel];
    html = `Wohin mit ${game.esc(person.name)}? Tippe auf ein Feld.${pos[u.sel] >= 0 ? ' <button class="link kd-back" type="button">Zurück in die Leiste</button>' : ''}`;
  } else if (pos.every((c) => c >= 0)) {
    html = 'Alle stehen, aber es stimmt noch nicht. Prüfe die Hinweise und die Stockwerke daneben.';
  } else {
    html = 'Wähle eine Person und tippe auf ihr Feld. Ein Tipp auf ein leeres Feld setzt ein Kreuz.';
  }
  put(hint, html);
}

function renderTools(u, fl, edit) {
  const { s, root } = u;
  const f = u.floor;
  const near = [f + 1, f - 1].filter((g) => g >= 0 && g < s.floors.length);
  const xray = near
    .map((g) => {
      const on = u.xray === g;
      return `<button class="kd-xbtn ${on ? 'on' : ''}" type="button" data-xray="${g}" aria-pressed="${on}">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="${g > f ? 'M10 15 V5 M5.5 9.5 L10 5 L14.5 9.5' : 'M10 5 V15 M5.5 10.5 L10 15 L14.5 10.5'}"/></svg>${FLOORS[s.floors[g].t].name}</button>`;
    })
    .join('');
  const reset =
    edit && (fl.marks.length || fl.pos.some((c) => c >= 0) || u.over[f])
      ? `<button class="link kd-reset" type="button">${u.confirm > Date.now() ? 'Wirklich alles wegnehmen?' : 'Alles wegnehmen'}</button>`
      : '';
  put(root.querySelector('.kd-tools'), `<div class="kd-xrays"><span>Durchsicht</span>${xray}</div>${reset}`);
}

function refHtml(u, ref, here) {
  const { s, game } = u;
  const g = s.floors[ref.f];
  const person = g.people[ref.p];
  if (!person) return '';
  const other = ref.f !== here ? `<small>${FLOOR_SHORT[g.t]}</small>` : '';
  return `<button class="kd-ref" type="button" data-f="${ref.f}" data-p="${ref.p}" style="--pc:${personColor(ref.p)}"><i></i>${game.esc(person.name)}${other}</button>`;
}

function clueHtml(u, f, clue, i, posOf, from) {
  const { s } = u;
  const parts = clueParts(s.floors, from, clue)
    .map((x) => (typeof x === 'string' ? x : refHtml(u, x, f)))
    .join('');
  const state = clueState(s.floors, from, clue, posOf);
  const key = `${from}:${i}`;
  const fresh = u.clueShown[key] !== undefined && u.clueShown[key] !== state;
  u.clueShown[key] = state;
  return `<li class="kd-clue ${state ? `is-${state}` : ''} ${fresh ? 'fresh' : ''}" style="--i:${Math.min(i, 12)}">
    <span class="kd-clue-mark">${state === 'ok' ? CHECK : state === 'bad' ? CROSS_ICON : '<i></i>'}</span><span class="kd-clue-text">${parts}</span></li>`;
}

function renderClues(u, posOf) {
  const { s, root } = u;
  const f = u.floor;
  const fl = s.floors[f];
  // Hinweise dieses Stockwerks nach Personen geordnet, dazu Hinweise anderer Stockwerke über Personen von hier
  const own = fl.clues.map((c, i) => [c, i]).sort((a, b) => (a[0].p < 0 ? 99 : a[0].p) - (b[0].p < 0 ? 99 : b[0].p) || a[1] - b[1]);
  const mine = own.map(([c, i]) => clueHtml(u, f, c, i, posOf, f)).join('');
  const foreign = s.floors
    .flatMap((g, gi) => g.clues.map((c, i) => [c, i, gi]))
    .filter(([c, , gi]) => gi !== f && c.g === f && CROSS.includes(c.t))
    .map(([c, i, gi]) => clueHtml(u, f, c, i, posOf, gi))
    .join('');
  const html = `<h4 class="kd-clues-head">Hinweise</h4><ol class="kd-clue-list">${mine}</ol>
    ${foreign ? `<h4 class="kd-clues-head">Aus den anderen Stockwerken</h4><ol class="kd-clue-list">${foreign}</ol>` : ''}`;
  const box = root.querySelector('.kd-clues');
  // Frisch abgehakte Hinweise: nur dieses Mal animieren
  if (put(box, html)) {
    for (const li of box.querySelectorAll('.kd-clue.fresh')) li.addEventListener('animationend', () => li.classList.remove('fresh'), { once: true });
  }
}

// Notiztabelle wie im Rätselbuch: Personen × Räume, ein Tipp Kreuz, zwei Haken, drei leer.
// Die Tabelle wird einmal pro Stockwerk gebaut, danach ändern sich nur die Felder (Knöpfe bleiben unter
// dem Finger). Räume stehen in Lesereihenfolge des Grundrisses (oben links zuerst).
const NOTE_X = '<svg class="kd-nx" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M5.5 5 Q10 10.5 14.8 15.2"/><path pathLength="1" d="M14.6 4.8 Q9.6 10.4 5.2 15.3"/></svg>';
const NOTE_OK = '<svg class="kd-nok" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M4 10.8 Q6.5 12.6 8.4 15.6 Q11.5 8.6 16.4 4.4"/></svg>';
const NOTE_WORD = ['offen', 'nicht dort', 'dort'];

function renderNotes(u, fl, edit) {
  const { s, game, root } = u;
  const f = u.floor;
  const k = fl.names.length;
  const box = root.querySelector('.kd-notes-box');
  const order = fl.names.map((_, r) => r).sort((a, b) => Math.min(...roomCells(fl, a)) - Math.min(...roomCells(fl, b)));
  if (box.dataset.floor !== String(f)) {
    box.dataset.floor = f;
    u.shownNotes[f] = null;
    const head = order.map((r) => `<th scope="col"><span>${ROOMS[fl.names[r]]?.name ?? ''}</span></th>`).join('');
    const rows = fl.people
      .map((person, p) => {
        const cells = order
          .map((r) => `<td><button class="kd-note" type="button" data-p="${p}" data-r="${r}" data-v=""></button></td>`)
          .join('');
        return `<tr data-p="${p}"><th scope="row"><span class="kd-notes-pawn">${pawn(person, p)}</span><span class="kd-notes-name">${game.esc(person.name)}</span></th>${cells}</tr>`;
      })
      .join('');
    box.innerHTML = `<h4 class="kd-clues-head">Notizen</h4>
      <table class="kd-notes" style="--k:${k}"><colgroup><col class="kd-notes-who">${order.map(() => '<col>').join('')}</colgroup>
        <thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table>
      <p class="kd-notes-foot"></p>`;
  }
  const notes = notesOfShown(u, s, f);
  const before = u.shownNotes[f];
  for (const btn of box.querySelectorAll('.kd-note')) {
    const p = Number(btn.dataset.p);
    const r = Number(btn.dataset.r);
    const i = p * k + r;
    const v = notes[i] ?? 0;
    if (btn.dataset.v !== String(v)) {
      btn.dataset.v = v;
      btn.innerHTML = v === 1 ? NOTE_X : v === 2 ? NOTE_OK : '';
      if (before && before[i] !== v && v && !game.reducedMotion) btn.firstElementChild.classList.add('enter');
      btn.setAttribute('aria-label', `${fl.people[p].name}, ${ROOMS[fl.names[r]]?.name}: ${NOTE_WORD[v]}`);
    }
    btn.disabled = !edit;
  }
  for (const tr of box.querySelectorAll('tbody tr')) tr.classList.toggle('sel', Number(tr.dataset.p) === u.sel);
  const any = notes.some(Boolean);
  put(
    box.querySelector('.kd-notes-foot'),
    edit && any ? `<button class="link kd-notes-clear" type="button">${u.confirmNotes > Date.now() ? 'Wirklich alle Notizen löschen?' : 'Notizen löschen'}</button>` : '',
  );
  u.shownNotes[f] = [...notes];
}

// Gelöst: andere Räume treten zurück, der Tatraum wird umrandet, Stempel auf den Täter
function renderSolved(u, fl) {
  const { s, game, root } = u;
  const f = u.floor;
  const n = s.n;
  const sheet = root.querySelector('.kd-sheet');
  const was = u.shownSolved[f];
  u.shownSolved[f] = fl.solved;
  sheet.classList.toggle('is-solved', fl.solved);
  const layer = root.querySelector('.kd-solved');
  const fx = root.querySelector('.kd-fx');
  if (!fl.solved) {
    if (layer) layer.innerHTML = '';
    fx.querySelector('.kd-stampbox')?.remove();
    return;
  }
  if (fx.querySelector('.kd-stampbox')) return;
  const animate = was === false && !game.reducedMotion;
  sheet.classList.toggle('solving', animate);
  if (animate) setTimeout(() => sheet.classList.remove('solving'), 2000);
  const room = fl.rooms[fl.pos[0]];
  for (const g of root.querySelectorAll('.kd-room')) g.classList.toggle('dim', Number(g.dataset.r) !== room);
  // Umriss des Tatraums
  const segs = [];
  for (const c of roomCells(fl, room)) {
    const x = (c % n) * 100;
    const y = Math.floor(c / n) * 100;
    const same = (d, ok) => ok && fl.rooms[d] === room;
    if (!same(c - n, y > 0)) segs.push([x, y, x + 100, y]);
    if (!same(c + n, y < (n - 1) * 100)) segs.push([x, y + 100, x + 100, y + 100]);
    if (!same(c - 1, x > 0)) segs.push([x, y, x, y + 100]);
    if (!same(c + 1, x < (n - 1) * 100)) segs.push([x + 100, y, x + 100, y + 100]);
  }
  if (layer) {
    layer.innerHTML = segs
      .map(([x1, y1, x2, y2]) => `<line pathLength="1" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
      .join('');
  }
  const k = culpritOf(fl);
  const c = fl.pos[k];
  fx.insertAdjacentHTML(
    'beforeend',
    `<div class="kd-stampbox" style="--x:${c % n};--y:${Math.floor(c / n)}">${STAMP}</div>`,
  );
  const victimTok = root.querySelector('.kd-token[data-p="0"]');
  if (victimTok && fl.crime === 'mord') victimTok.classList.add('fallen');
  root.querySelector(`.kd-token[data-p="${k}"]`)?.classList.add('culprit');
}

function renderEnd(u) {
  const { s, game, root } = u;
  const box = root.querySelector('.kd-end');
  if (!game.result) {
    put(box, '');
    return;
  }
  const rows = [...s.floors]
    .map((fl, f) => [fl, f])
    .reverse()
    .map(([fl], i) => {
      const k = culpritOf(fl);
      const t = fl.people[k];
      const v = fl.people[0];
      return `<li style="--i:${i}"><span class="kd-end-floor">${FLOORS[fl.t].name}</span>
        <span>${game.esc(t.role)} ${game.esc(t.name)} hat ${game.esc(v.role)} ${game.esc(v.name)} ${CRIME_DONE[fl.crime] ?? 'überfallen'}.</span></li>`;
    })
    .join('');
  if (put(box, `<h3 class="kd-end-title">Die Nacht ${game.esc(houseIn(s.house))}</h3><ol>${rows}</ol>`) && !game.first) {
    box.classList.add('enter');
  }
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
      const level = t.closest('.kd-level, .kd-go');
      if (level) return goFloor(u, Number(level.dataset.floor));
      const xb = t.closest('.kd-xbtn');
      if (xb) {
        const g = Number(xb.dataset.xray);
        u.xray = u.xray === g ? null : g;
        return draw(u);
      }
      const ref = t.closest('.kd-ref');
      if (ref) return showRef(u, Number(ref.dataset.f), Number(ref.dataset.p));
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
  if (!src || src.disabled || src.dataset.p === undefined || !canEdit(u.s, u.floor, u.game)) return;
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
  const n = u.s.n;
  const fl = u.s.floors[u.floor];

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
    if (!free(fl.items[c])) el?.classList.add('bad');
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
    d.node.innerHTML = pawn(fl.people[p], p);
    // an body: .kd hat container-type und wäre sonst der Bezug für position: fixed
    document.body.append(d.node);
    src.classList.add('lifted');
    root.querySelector(`.kd-token[data-p="${p}"]`)?.classList.add('lifted');
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
    const pos = posOfShown(u, u.s)(u.floor);
    if (cancel) return draw(u);
    if (d.cell === null) {
      if (fromBoard && pos[p] >= 0) return place(u, p, -1);
      return draw(u);
    }
    if (!free(fl.items[d.cell])) return nope(u, d.cell, `Auf ${ITEMS[fl.items[d.cell]].dat} kann niemand stehen.`);
    if (pos[p] === d.cell) return draw(u);
    u.fly = { f: u.floor, p, rect };
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

function goFloor(u, f) {
  if (f === u.floor || !u.s.floors[f]) return;
  u.floor = f;
  draw(u);
  u.root.querySelector('.kd-case').scrollIntoView?.({ block: 'nearest', behavior: u.game.reducedMotion ? 'auto' : 'smooth' });
}

function choose(u, p) {
  u.sel = u.sel === p ? null : p;
  draw(u);
}

function tapCell(u, c) {
  const { s, game } = u;
  const f = u.floor;
  const fl = s.floors[f];
  if (!canEdit(s, f, game)) {
    if (!fl.solved && !game.result && s.helfen !== 'mit') point(u, f, c);
    return;
  }
  const pos = posOfShown(u, s)(f);
  if (u.sel !== null) {
    if (!free(fl.items[c])) return nope(u, c, `Auf ${ITEMS[fl.items[c]].dat} kann niemand stehen.`);
    if (pos[u.sel] === c) {
      u.sel = null;
      return draw(u);
    }
    return place(u, u.sel, c);
  }
  const there = pos.indexOf(c);
  if (there >= 0) return choose(u, there);
  if (!free(fl.items[c])) return;
  act(u, 'kreuz', { c });
}

function nope(u, c, text) {
  const cell = u.root.querySelector(`.kd-cell[data-c="${c}"]`);
  if (cell && !u.game.reducedMotion) cell.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  put(u.root.querySelector('.kd-hint'), text);
}

function place(u, p, c) {
  const f = u.floor;
  if (p === null || p === undefined) return;
  const pos = posOfShown(u, u.s)(f);
  if (pos[p] < 0 && c >= 0) {
    const from = u.root.querySelector(`.kd-person[data-p="${p}"] .kd-person-pawn`);
    if (from) u.fly = { f, p, rect: from.getBoundingClientRect() };
  }
  if (pos[p] >= 0 && c < 0) u.flyBack = { f, p };
  u.sel = null;
  act(u, 'setzen', { p, c });
}

// Eigener Zug: sofort zeigen, dann in Reihe an den Server
function act(u, type, data) {
  const { s, game } = u;
  const f = u.floor;
  const pos = [...posOfShown(u, s)(f)];
  let marks = [...marksOfShown(u, s, f)];
  let notes = [...notesOfShown(u, s, f)];
  if (type === 'notiz') {
    notes[data.p * s.floors[f].names.length + data.r] = data.v;
  } else if (type === 'notizen-leeren') {
    notes = notes.map(() => 0);
  } else if (type === 'setzen') {
    if (data.c >= 0) {
      const there = pos.indexOf(data.c);
      if (there >= 0 && there !== data.p) pos[there] = -1;
      marks = marks.filter((x) => x !== data.c);
    }
    pos[data.p] = data.c;
  } else if (type === 'kreuz') {
    marks = marks.includes(data.c) ? marks.filter((x) => x !== data.c) : [...marks, data.c];
  } else if (type === 'leeren') {
    pos.fill(-1);
    marks = [];
  }
  u.over[f] = { pos, marks, notes, done: false };
  u.pending[f] = (u.pending[f] ?? 0) + 1;
  draw(u);
  u.queue = u.queue
    .then(() => game.send(type, { f, ...data }))
    .then((ok) => {
      u.pending[f]--;
      if (u.signal.aborted) return;
      if (ok === false) {
        // abgelehnt: zurück zum Stand des Servers
        delete u.over[f];
        draw(u);
        return;
      }
      const o = u.over[f];
      if (u.pending[f] > 0 || !o) return;
      // Der neue Stand kommt mit dem nächsten Zeichnen (render räumt dann auf); kommt keiner, weil sich
      // nichts geändert hat, hier aufräumen
      o.done = true;
      setTimeout(() => {
        if (u.over[f] === o && !u.signal.aborted) {
          delete u.over[f];
          draw(u);
        }
      }, 1500);
    });
}

// Hinweis auf eine Person: auf diesem Stockwerk die Figur kurz hervorheben, auf einem anderen die Durchsicht
function showRef(u, f, p) {
  const { s, root, game } = u;
  if (f !== u.floor) {
    if (Math.abs(f - u.floor) !== 1) return goFloor(u, f);
    u.xray = f;
    draw(u);
    const ghost = root.querySelector(`.kd-ghost[data-p="${p}"]`);
    if (ghost && !game.reducedMotion) ghost.animate([{ opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 900 });
    if (!ghost) put(root.querySelector('.kd-hint'), `${game.esc(s.floors[f].people[p].name)} steht ${FLOOR_IN[s.floors[f].t]} noch nicht.`);
    return;
  }
  const tok = root.querySelector(`.kd-token[data-p="${p}"]`) ?? root.querySelector(`.kd-person[data-p="${p}"]`);
  if (tok && !game.reducedMotion) tok.animate([{ transform: getComputedStyle(tok).transform }, { transform: `${getComputedStyle(tok).transform === 'none' ? '' : getComputedStyle(tok).transform} translateY(-10%)` }, { transform: getComputedStyle(tok).transform }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// ---------- Zeigen und wer wo schaut (game.live) ----------

function point(u, f, c) {
  if (Date.now() - u.pingAt < 350) return;
  u.pingAt = Date.now();
  u.game.live.send({ t: 'zeig', f, c });
  ping(u, f, c, u.game.me);
}

function ping(u, f, c, from) {
  const { root, game, s } = u;
  if (!Number.isInteger(f) || !Number.isInteger(c) || !s.floors[f] || c < 0 || c >= s.n * s.n) return;
  if (f === u.floor) {
    const fx = root.querySelector('.kd-fx');
    fx.insertAdjacentHTML(
      'beforeend',
      `<div class="kd-ping" style="--x:${c % s.n};--y:${Math.floor(c / s.n)};--pc:${game.color(from)}"><i></i><span>${game.esc(from === game.me ? 'Du' : game.name(from))}</span></div>`,
    );
    const el = fx.lastElementChild;
    setTimeout(() => el.remove(), 2600);
  } else {
    const level = root.querySelector(`.kd-level[data-floor="${f}"]`);
    if (level && !game.reducedMotion) level.animate([{ backgroundColor: 'var(--wash)' }, { backgroundColor: 'transparent' }], { duration: 900, iterations: 2 });
  }
}

// Den anderen sagen, welches Stockwerk man ansieht (das Haus oben zeigt es als Punkt in ihrer Farbe)
function sendLooking(u) {
  u.game.live.send({ t: 'hier', f: u.floor });
  if (u.lookTimer) return;
  u.lookTimer = setInterval(() => u.game.live.send({ t: 'hier', f: u.floor }), 12000);
  u.signal.addEventListener('abort', () => clearInterval(u.lookTimer), { once: true });
}

function onLive(el, u, data, from) {
  if (!u.s || u.signal.aborted || !data || typeof data !== 'object') return;
  if (data.t === 'zeig') ping(u, data.f, data.c, from);
  if (data.t === 'hier' && Number.isInteger(data.f)) {
    const was = u.looking[from]?.f;
    u.looking[from] = { f: data.f, at: Date.now() };
    if (was !== data.f) renderLooks(u);
  }
}

export const style = `
  .kd { display: grid; gap: 24px; container-type: inline-size; }

  /* --- Haus im Schnitt: ein Streifen pro Stockwerk --- */
  .kd-house { list-style: none; margin: 0; padding: 0; display: grid; }
  .kd-roof { display: flex; align-items: flex-end; gap: 12px; padding-left: 6px; }
  .kd-slice { position: relative; display: block; flex: none; width: 72px; }
  .kd-roof-svg { display: block; width: 72px; height: 31px; }
  .kd-house-name { font: 800 var(--t-md)/1 var(--font-display); padding-bottom: 3px; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kd-level { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; margin: 0;
    padding: 0 10px 0 6px; border: 0; border-radius: var(--radius); background: none; color: inherit;
    font: inherit; text-align: left; cursor: pointer; }
  .kd-level:hover { background: var(--wash); }
  .kd-level.is-current { background: var(--wash); }
  .kd-level:active { transform: translateY(1px); }
  .kd-slice-svg { display: block; width: 72px; height: 40px; }
  .kd-level-text { display: grid; flex: 1 1 auto; min-width: 0; }
  .kd-level-name { font: 700 var(--t-base)/1.1 var(--font-display); }
  .kd-level.is-current .kd-level-name { font-weight: 900; }
  .kd-level-who { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: var(--t-sm); color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kd-looks { display: inline-flex; gap: 2px; }
  .kd-look { display: inline-flex; margin-left: 2px; animation: kd-fade 300ms ease-out; }
  .kd-look .marker { width: 7px; height: 7px; border-radius: 50%; }
  .kd-level-state { flex: none; }
  .kd-pips { display: flex; gap: 3px; }
  .kd-pips i { width: 7px; height: 7px; border: 1.5px solid var(--ink); border-radius: 50%; }
  .kd-pips i.on { background: var(--ink); }
  .kd-solved-word { font: 800 var(--t-sm)/1 var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: ${C.stempel}; }
  .kd-seal { position: absolute; right: -9px; top: 6px; width: 28px; height: 28px; }

  /* --- Fall: Überschrift und Tat --- */
  .kd-case { display: grid; gap: 4px; }
  .kd-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin: 0;
    font: 800 var(--t-xl)/1 var(--font-display); }
  .kd-owner { display: inline-flex; align-items: center; gap: 6px; font: 400 var(--t-sm)/1.2 var(--font-body); color: var(--muted); }
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
  .kd-planbox, .kd-xraybox { position: absolute; inset: calc(-8% / var(--n)); pointer-events: none; }
  .kd-plan-svg, .kd-xray { display: block; width: 100%; height: 100%; overflow: visible; }
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
  .kd-plan.is-pointing .kd-cell { cursor: crosshair; }
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
  .kd-token:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }
  .kd-token:active:not(:disabled) .kd-pawn { transform: scale(.94); }
  .kd-token.drop .kd-pawn { animation: kd-drop 300ms cubic-bezier(.2,.8,.2,1); }
  .kd-token.leave .kd-pawn { animation: kd-leave 240ms ease-in forwards; }
  .kd-token.fallen .kd-pawn { transform: translate(6%, -6%) rotate(-90deg); }
  .kd-plan.is-locked .kd-token, .kd-plan.is-pointing .kd-token { pointer-events: none; }

  .kd-token.lifted .kd-pawn, .kd-person.lifted .kd-person-pawn { opacity: .25; }
  .kd-cell.drop { background: rgba(20, 20, 20, .14); outline: 3px dashed ${INK}; outline-offset: -5px; }
  .kd-cell.drop.bad { background: none; outline-color: var(--bad); }
  .kd-float { position: fixed; left: 0; top: 0; z-index: 50; pointer-events: none; }
  .kd-float .kd-pawn { position: absolute; left: 15%; top: 3%; width: 70%; height: 86%; overflow: visible; transform: scale(1.12); transform-origin: 50% 90%; }

  /* Durchsicht */
  .kd-xray { animation: kd-fade 220ms ease-out; }
  .kd-xray-walls { stroke: ${C.blau}; stroke-width: 5; stroke-dasharray: 14 9; }
  .kd-xray-labels text { font-family: var(--font-display); font-weight: 700; fill: ${C.blau};
    paint-order: stroke; stroke: ${PAPER}; stroke-width: 5px; }

  /* Zeigen */
  .kd-ping { position: absolute; left: calc(var(--x) * 100% / var(--n)); top: calc(var(--y) * 100% / var(--n));
    width: calc(100% / var(--n)); height: calc(100% / var(--n)); }
  .kd-ping i { position: absolute; inset: 8%; border: 3px solid var(--pc); border-radius: 50%;
    animation: kd-ping 1100ms cubic-bezier(.2,.8,.2,1) 2 both; }
  .kd-ping span { position: absolute; left: 50%; top: -2px; transform: translate(-50%, -100%); padding: 1px 5px;
    background: var(--paper); border: 1.5px solid var(--pc); border-radius: var(--radius); font: 700 12px/1.2 var(--font-display);
    white-space: nowrap; animation: kd-fade 200ms ease-out; }

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
  .kd-person-pawn { flex: none; width: 38px; height: 46px; transition: opacity 200ms; }
  .kd-person-pawn svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .kd-person.is-placed .kd-person-pawn { opacity: .3; }
  .kd-person-text { display: grid; flex: 1 1 auto; min-width: 0; line-height: 1.15; }
  .kd-person-text b { font: 700 var(--t-base)/1.1 var(--font-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kd-person-text small { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kd-at { flex: none; font: 800 var(--t-sm)/1 var(--font-display); }

  .kd-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
  .kd-xrays { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .kd-xrays > span { font-size: var(--t-sm); color: var(--muted); margin-right: 2px; }
  .kd-xbtn { display: inline-flex; align-items: center; gap: 4px; margin: 0; padding: 5px 10px 5px 6px; border: 1px solid var(--line);
    border-radius: var(--radius); background: var(--paper); color: var(--ink); font: inherit; font-size: var(--t-sm); cursor: pointer; }
  .kd-xbtn:hover { background: var(--wash); }
  .kd-xbtn:active { transform: translateY(1px); }
  .kd-xbtn.on { background: var(--ink); color: var(--paper); }
  .kd-xbtn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
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
  .kd-ref small { font: 800 10px/1 var(--font-display); color: var(--muted); letter-spacing: .04em; }

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

  /* Ende: alle Fälle untereinander */
  .kd-end:empty { display: none; }
  .kd-end-title { margin: 0 0 8px; font: 800 var(--t-lg)/1.1 var(--font-display); }
  .kd-end ol { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--line); }
  .kd-end li { display: grid; gap: 2px; padding: 10px 0; border-bottom: 1px solid var(--hairline); }
  .kd-end-floor { font: 800 12px/1 var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: ${C.stempel}; }

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
  @keyframes kd-seal { from { opacity: 0; transform: scale(1.8) rotate(-30deg); } }

  /* Auftakt: Stockwerke von unten nach oben, Wände zeichnen sich ein, Möbel kommen dazu */
  .kd.intro .kd-house > li { animation: kd-rise 380ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i) * 90ms); }
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
  .kd-seal.fresh { animation: kd-seal 320ms cubic-bezier(.2,.8,.2,1) 1150ms both; }
  .kd-seal.fresh path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kd-draw 260ms ease-out 1400ms forwards; }
  .kd-end.enter li { animation: kd-rise 380ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(1400ms + var(--i) * 180ms); }
  .kd-end.enter .kd-end-title { animation: kd-fade 400ms ease-out 1200ms both; }

  @media (prefers-reduced-motion: reduce) {
    .kd *, .kd *::before { animation: none !important; transition: none !important; }
    .kd .kd-nx path, .kd .kd-nok path, .kd .kd-x path, .kd .kd-check path, .kd .kd-cross path, .kd .kd-solved line, .kd .kd-walls line, .kd .kd-outer, .kd .kd-seal path { stroke-dashoffset: 0 !important; }
  }
`;
