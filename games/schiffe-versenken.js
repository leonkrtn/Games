// Schiffe versenken: Flotte verstecken, die des anderen suchen.
//
// Zehn mal zehn Felder, klassische Flotte: Schlachtschiff (fünf), Kreuzer (vier), zwei Zerstörer (drei),
// U-Boot (zwei). Schiffe dürfen sich nicht berühren, auch nicht über Eck. Erst stellen beide geheim auf
// (selbst setzen, drehen oder zufällig), dann wird abwechselnd geschossen. Wer trifft, schießt nochmal.
// Um versenkte Schiffe herum wird das Wasser automatisch markiert. Wer zuerst alle Schiffe versenkt,
// gewinnt.
//
// Geheim: die Aufstellung des anderen. view() verrät nur Schüsse, Treffer und versenkte Schiffe, erst am
// Ende die ganze Flotte.
//
// Motion: Schiffe gleiten beim Aufstellen an ihren Platz und drehen sich, das Meer baut sich diagonal
// auf, jeder Schuss fällt sichtbar (Fadenkreuz, Einschlag, Spritzer oder Explosion), versenkte Schiffe
// tauchen beim Angreifer auf und sinken beim Besitzer, das ruhige Wasser darum breitet sich aus, und die
// beiden Meere tauschen den Platz, je nachdem, wer gerade beschossen wird.

export const meta = {
  name: 'Schiffe versenken',
  description: 'Versteckt eure Flotte und sucht die des anderen. Wer zuerst alle Schiffe versenkt, gewinnt.',
  players: [2, 2],
};

const N = 10;
const FLEET = [
  { id: 's', name: 'Schlachtschiff', size: 5, art: 'schlachtschiff' },
  { id: 'k', name: 'Kreuzer', size: 4, art: 'kreuzer' },
  { id: 'z1', name: 'Zerstörer', size: 3, art: 'zerstoerer' },
  { id: 'z2', name: 'Zerstörer', size: 3, art: 'zerstoerer' },
  { id: 'u', name: 'U-Boot', size: 2, art: 'uboot' },
];
const SHIP = Object.fromEntries(FLEET.map((f) => [f.id, f]));

const otherOf = (s, id) => s.players.find((p) => p.id !== id).id;
const nameOf = (s, id) => s.players.find((p) => p.id === id).name;
const coord = (i) => `${'ABCDEFGHIJ'[i % N]}${Math.floor(i / N) + 1}`;

const cellsOf = (id, p) => Array.from({ length: SHIP[id].size }, (_, k) => (p.v ? (p.y + k) * N + p.x : p.y * N + p.x + k));
function around(i) {
  const x = i % N;
  const y = Math.floor(i / N);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) out.push((y + dy) * N + x + dx);
    }
  }
  return out;
}

// Nur die bekannten Schiffe mit sauberen Zahlen übernehmen.
function clean(layout) {
  const out = {};
  for (const f of FLEET) {
    const p = layout?.[f.id];
    if (p) out[f.id] = { x: Number(p.x), y: Number(p.y), v: p.v === true };
  }
  return out;
}

// Fehler einer Aufstellung als Satz, oder null, wenn alles passt.
function problem(layout, complete = true) {
  const taken = new Map();
  for (const f of FLEET) {
    const p = layout[f.id];
    if (!p) {
      if (complete) return `${f.name} fehlt noch.`;
      continue;
    }
    if (![p.x, p.y].every((n) => Number.isInteger(n) && n >= 0 && n < N)) return `${f.name} liegt außerhalb.`;
    if ((p.v ? p.y : p.x) + f.size > N) return `${f.name} ragt über den Rand.`;
    for (const c of cellsOf(f.id, p)) {
      if (taken.has(c)) return 'Schiffe dürfen nicht übereinander liegen.';
      taken.set(c, f.id);
    }
  }
  for (const [c, id] of taken) {
    if (around(c).some((n) => taken.has(n) && taken.get(n) !== id)) return 'Schiffe dürfen sich nicht berühren, auch nicht über Eck.';
  }
  return null;
}

function randomLayout() {
  const rand = (n) => Math.floor(Math.random() * n);
  for (;;) {
    const layout = {};
    const blocked = new Set();
    let ok = true;
    for (const f of FLEET) {
      let placed = false;
      for (let a = 0; a < 300 && !placed; a++) {
        const v = Math.random() < 0.5;
        const p = { x: rand(v ? N : N - f.size + 1), y: rand(v ? N - f.size + 1 : N), v };
        const cells = cellsOf(f.id, p);
        if (cells.some((c) => blocked.has(c))) continue;
        layout[f.id] = p;
        for (const c of cells) [c, ...around(c)].forEach((n) => blocked.add(n));
        placed = true;
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return layout;
  }
}

const shipAt = (fleet, i) => FLEET.find((f) => fleet[f.id] && cellsOf(f.id, fleet[f.id]).includes(i))?.id ?? null;
const sunkBy = (fleet, id, shots) => cellsOf(id, fleet[id]).every((c) => shots.includes(c));

// Wasser rund um versenkte Schiffe: dort kann nichts mehr liegen.
function calmCells(fleet, shots) {
  const calm = new Set();
  for (const f of FLEET) {
    if (!sunkBy(fleet, f.id, shots)) continue;
    for (const c of cellsOf(f.id, fleet[f.id])) for (const n of around(c)) if (!shipAt(fleet, n)) calm.add(n);
  }
  return calm;
}

export function setup(players) {
  return {
    players,
    phase: 'aufstellen', // aufstellen → schiessen → ende
    fleets: Object.fromEntries(players.map((p) => [p.id, null])), // { [schiff]: { x, y, v } }
    layoutSeq: Object.fromEntries(players.map((p) => [p.id, 0])), // zählt, wenn der Server eine Aufstellung setzt
    ready: Object.fromEntries(players.map((p) => [p.id, false])),
    shots: Object.fromEntries(players.map((p) => [p.id, []])), // Felder, auf die jemand geschossen hat
    turn: null,
    seq: 0,
    last: null, // letzter Schuss: { n, by, i, hit, sunk }
  };
}

export function action(s, { player, type, data }) {
  if (!(player in s.ready)) throw new Error('Du spielst nicht mit.');
  if (s.phase === 'ende') return;

  if (type === 'zufall') {
    if (s.phase !== 'aufstellen' || s.ready[player]) return;
    s.fleets[player] = randomLayout();
    s.layoutSeq[player]++;
    return;
  }
  if (type === 'bereit') {
    if (s.phase !== 'aufstellen' || s.ready[player]) return;
    const layout = clean(data?.layout);
    const err = problem(layout);
    if (err) throw new Error(err);
    s.fleets[player] = layout;
    s.layoutSeq[player]++;
    s.ready[player] = true;
    if (s.players.every((p) => s.ready[p.id])) {
      s.phase = 'schiessen';
      s.turn = s.players[Math.floor(Math.random() * s.players.length)].id;
      s.seq++;
    }
    return;
  }
  if (type === 'aendern') {
    if (s.phase === 'aufstellen') s.ready[player] = false;
    return;
  }
  if (type !== 'schuss' || s.phase !== 'schiessen' || data?.at !== s.seq) return; // veraltet: doppelt getippt
  if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);
  const i = Number(data.i);
  if (!Number.isInteger(i) || i < 0 || i >= N * N) throw new Error('Dieses Feld gibt es nicht.');
  const shots = s.shots[player];
  if (shots.includes(i)) throw new Error('Dorthin hast du schon geschossen.');
  const other = otherOf(s, player);
  const fleet = s.fleets[other];
  if (calmCells(fleet, shots).has(i)) throw new Error('Neben einem versenkten Schiff kann keins liegen.');

  shots.push(i);
  s.seq++;
  const ship = shipAt(fleet, i);
  if (!ship) {
    s.last = { n: s.seq, by: player, i, hit: false, sunk: null };
    s.turn = other;
    return;
  }
  const sunk = sunkBy(fleet, ship, shots) ? ship : null;
  s.last = { n: s.seq, by: player, i, hit: true, sunk };
  if (sunk && FLEET.every((f) => sunkBy(fleet, f.id, shots))) {
    s.phase = 'ende';
    s.result = { winners: [player], text: `${nameOf(s, player)} hat nach ${word(shots.length)} Schüssen alle Schiffe versenkt.` };
  }
}

// Was `me` weiß: die eigene Flotte, alle Schüsse und Treffer, vom anderen nur versenkte Schiffe.
export function view(s, me) {
  const other = otherOf(s, me);
  return {
    players: s.players,
    phase: s.phase,
    turn: s.turn,
    seq: s.seq,
    last: s.last,
    result: s.result,
    ready: s.ready,
    layoutSeq: s.layoutSeq[me],
    mine: s.fleets[me],
    attack: sea(s, me, other, Boolean(s.result)),
    defense: sea(s, other, me, true),
  };
}

function sea(s, shooter, owner, reveal) {
  const fleet = s.fleets[owner];
  const shots = s.shots[shooter];
  if (!fleet || s.phase === 'aufstellen') return { marks: [], ships: [], calm: [], sunk: [] };
  const sunk = FLEET.filter((f) => sunkBy(fleet, f.id, shots)).map((f) => f.id);
  const ships = FLEET.filter((f) => reveal || sunk.includes(f.id)).map((f) => ({ id: f.id, ...fleet[f.id], sunk: sunk.includes(f.id) }));
  return {
    marks: shots.map((i) => ({ i, hit: Boolean(shipAt(fleet, i)) })),
    ships,
    calm: [...calmCells(fleet, shots)].filter((i) => !shots.includes(i)), // ohne Felder, die schon eine Marke haben
    sunk,
  };
}

export function waitingFor(s) {
  if (s.phase === 'aufstellen') return s.players.filter((p) => !s.ready[p.id]).map((p) => p.id);
  if (s.phase === 'schiessen') return [s.turn];
  return [];
}

export function notices(s, before, player) {
  if (before.phase === 'aufstellen' && s.phase === 'schiessen') {
    return s.players
      .filter((p) => p.id !== player)
      .map((p) => ({ to: p.id, text: s.turn === p.id ? 'Beide Flotten stehen. Du schießt zuerst.' : `Beide Flotten stehen. ${nameOf(s, s.turn)} schießt zuerst.` }));
  }
  const other = otherOf(s, player);
  if (s.phase === 'aufstellen' && s.ready[player] && !before.ready[player] && !s.ready[other]) {
    return [{ to: other, text: `${nameOf(s, player)} ist bereit. Stell deine Flotte auf.` }];
  }
  if (s.phase === 'schiessen' && s.turn !== before.turn) {
    return [{ to: s.turn, text: `${nameOf(s, player)} hat ${coord(s.last.i)} verfehlt. Du bist dran.` }];
  }
  return [];
}

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// Zahlen im Text als Wort (die Textschrift hat eine durchgestrichene Null).
function word(n) {
  if (n < 20) return ONES[n];
  const unit = (k) => (k === 1 ? 'ein' : ONES[k]);
  if (n < 100) return n % 10 ? `${unit(n % 10)}und${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  return `${unit(Math.floor(n / 100))}hundert${n % 100 ? word(n % 100) : ''}`;
}

// ---------- Anzeige (nur im Browser) ----------

// Eigene Illustrationen (Skill „zeichnen“): Schiffe von oben, Bug nach links, ein Feld = 100 Einheiten.
const INK = '#141414';
const C = {
  hull: '#6f7c86', deck: '#c2ad86', plank: '#9c8a66', turret: '#56616a', barrel: '#2f363b', top: '#8c979f',
  bridge: '#d9d6cc', funnel: '#3a4248', rim: '#8a949b', sub: '#4f5a62', tower: '#3d464d', water: '#3a6b98', fire: '#e0b24a',
};

// Rumpf mit spitzem Bug links, beam = halbe Breite (Schlachtschiff breit, Zerstörer schlank)
const hull = (L, beam) => {
  const t = 50 - beam;
  const b = 50 + beam;
  return `<path class="rumpf" d="M4 50 C18 ${t + 8} 52 ${t} 92 ${t} L${L - 22} ${t} C${L - 10} ${t} ${L - 5} ${t + 8} ${L - 5} ${t + 18} L${L - 5} ${b - 18} C${L - 5} ${b - 8} ${L - 10} ${b} ${L - 22} ${b} L92 ${b} C52 ${b} 18 ${b - 8} 4 50 Z" fill="${C.hull}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
};
const deck = (L, beam) => {
  const t = 59 - beam;
  const b = 41 + beam;
  return `<path d="M17 50 C29 ${t + 6} 56 ${t} 92 ${t} L${L - 25} ${t} C${L - 16} ${t} ${L - 13} ${t + 5} ${L - 13} ${t + 13} L${L - 13} ${b - 13} C${L - 13} ${b - 5} ${L - 16} ${b} ${L - 25} ${b} L92 ${b} C56 ${b} 29 ${b - 6} 17 50 Z" fill="${C.deck}"/>
  <path d="M44 ${50 - beam * 0.36} H${L - 16} M38 50 H${L - 14} M44 ${50 + beam * 0.36} H${L - 16}" stroke="${C.plank}" stroke-width="1.6"/>
  <g class="anker" fill="${INK}"><circle cx="30" cy="${50 - beam * 0.32}" r="2.6"/><circle cx="30" cy="${50 + beam * 0.32}" r="2.6"/></g>
  <path class="flaggenstock" d="M${L - 13} 50 H${L - 2}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
};
// Geschützturm: Rohre zeigen zum Bug (dir -1) oder nach achtern (dir 1); überhöhte Türme haben kurze Rohre
const turret = (x, dir = -1, r = 15, len = 28) => `<g class="turm">
  <path d="M${x} 44.5 h${dir * (r + len)} M${x} 55.5 h${dir * (r + len)}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
  <path d="M${x} 44.5 h${dir * (r + len)} M${x} 55.5 h${dir * (r + len)}" stroke="${C.barrel}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="${x}" cy="50" r="${r}" fill="${C.turret}" stroke="${INK}" stroke-width="3.5"/>
  <circle cx="${x - dir * 4}" cy="45" r="${r * 0.35}" fill="${C.top}"/>
</g>`;
const bridge = (x, w) => `<g class="bruecke">
  <rect x="${x}" y="31" width="${w}" height="38" rx="8" fill="${C.bridge}" stroke="${INK}" stroke-width="3.5"/>
  <rect x="${x + 7}" y="38" width="${w - 14}" height="24" rx="4" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".5"/>
  ${Array.from({ length: 4 }, (_, k) => `<rect x="${x + 2.5}" y="${36 + k * 7.5}" width="4" height="4" fill="${INK}"/>`).join('')}
</g>`;
const funnel = (x) => `<g class="schornstein">
  <ellipse cx="${x}" cy="50" rx="12" ry="15" fill="${C.funnel}" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="${x}" cy="50" rx="7" ry="9.5" fill="${INK}"/>
  <path d="M${x - 9} 42 C${x - 6} 37 ${x + 1} 36 ${x + 5} 38" fill="none" stroke="${C.rim}" stroke-width="2" stroke-linecap="round"/>
</g>`;
const art = (L, inner) => `<svg viewBox="0 0 ${L} 100" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;

const ART = {
  schlachtschiff: art(500, `${hull(500, 34)}${deck(500, 34)}
    ${turret(112)}${turret(172, -1, 17, 6)}
    ${bridge(208, 76)}${funnel(316)}
    <g class="flak" fill="${C.turret}" stroke="${INK}" stroke-width="2.5">${[[352, 36], [352, 64], [376, 36], [376, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5"/>`).join('')}</g>
    ${turret(418, 1)}`),
  kreuzer: art(400, `${hull(400, 30)}${deck(400, 30)}
    ${turret(110)}
    ${bridge(150, 62)}${funnel(240)}${funnel(276)}
    ${turret(330, 1, 14)}`),
  zerstoerer: art(300, `${hull(300, 26)}${deck(300, 26)}
    ${turret(100, -1, 13)}
    ${bridge(134, 50)}${funnel(208)}
    <g class="torpedo">
      <rect x="232" y="40" width="40" height="20" rx="5" fill="${C.turret}" stroke="${INK}" stroke-width="3"/>
      <path d="M238 46 H266 M238 54 H266" stroke="${INK}" stroke-width="1.6" opacity=".6"/>
    </g>`),
  uboot: art(200, `
    <g class="ruder" fill="${C.tower}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
      <path d="M170 28 L186 16 L190 22 L180 33 Z"/><path d="M170 72 L186 84 L190 78 L180 67 Z"/>
      <path d="M30 31 L20 24 L16 29 L26 36 Z"/><path d="M30 69 L20 76 L16 71 L26 64 Z"/>
    </g>
    <path class="rumpf" d="M6 50 C6 31 36 23 70 23 L150 23 C178 23 195 35 195 50 C195 65 178 77 150 77 L70 77 C36 77 6 69 6 50 Z" fill="${C.sub}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="28" y="43" width="146" height="14" rx="7" fill="${C.top}" stroke="${INK}" stroke-width="2"/>
    <path d="${Array.from({ length: 9 }, (_, k) => `M${44 + k * 14} 44.5 V55.5`).join(' ')}" stroke="${INK}" stroke-width="1.2" opacity=".35"/>
    <g class="turm">
      <path d="M86 50 C86 40 98 35 116 36 C130 37 140 43 140 50 C140 57 130 63 116 64 C98 65 86 60 86 50 Z" fill="${C.tower}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="104" cy="50" r="4.5" fill="${C.rim}" stroke="${INK}" stroke-width="1.8"/>
      <path d="M104 50 L88 41" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="124" cy="50" r="3" fill="${INK}"/>
    </g>
    <path d="M40 32 C54 28 70 27.5 84 27.5" fill="none" stroke="${C.rim}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`),
};

// Treffer: Explosionsstern in der Farbe des Schützen. Wasser: Spritzring mit Tropfen.
const star = (n, R, r, rot) =>
  `${Array.from({ length: n * 2 }, (_, k) => {
    const a = (Math.PI / n) * k + rot;
    const rad = k % 2 ? r : R * (k % 4 === 0 ? 1 : 0.86);
    return `${k ? 'L' : 'M'}${(50 + rad * Math.cos(a)).toFixed(1)} ${(50 + rad * Math.sin(a)).toFixed(1)}`;
  }).join(' ')} Z`;
const HIT = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="${star(10, 44, 24, -Math.PI / 2)}" style="fill:var(--sc)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="${star(7, 24, 13, -Math.PI / 2 + 0.3)}" fill="${C.fire}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="5.5" fill="#fff" stroke="${INK}" stroke-width="2"/>
</svg>`;
const SPLASH = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="24" fill="none" stroke="${C.water}" stroke-width="7"/>
  <circle cx="50" cy="50" r="10" fill="${C.water}"/>
  <g class="tropfen" fill="${C.water}">${[[50, 11], [83, 31], [81, 74], [19, 76], [16, 32]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5"/>`).join('')}</g>
</svg>`;

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;
const num = (t) => `<span class="num">${t}</span>`;

const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, ctrl: null, layout: {}, layoutSeq: -1, sel: null, hover: null, big: null, log: '' };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => u.ctrl?.abort());
  }
  return u;
}

export function render(el, s, game) {
  const u = local(el, game);
  u.ctrl?.abort();
  u.ctrl = new AbortController();
  const signal = u.ctrl.signal;
  const me = game.me;
  const them = s.players.find((p) => p.id !== me).id;

  let root = el.querySelector(':scope > .sv');
  if (!root) {
    el.innerHTML = `<div class="sv">
      <p class="status sv-status"></p>
      <div class="sv-stage">
        ${boardShell('attack')}
        ${boardShell('defense')}
      </div>
      <div class="sv-dock"></div>
      <p class="sv-log"></p>
      ${RULES}
    </div>`;
    root = el.firstElementChild;
  }
  const q = (sel) => root.querySelector(sel);
  const attack = q('[data-board="attack"]');
  const defense = q('[data-board="defense"]');

  // Eine neue Aufstellung vom Server (Zufall oder bestätigt) ersetzt die lokale.
  if (u.layoutSeq !== s.layoutSeq) {
    u.layoutSeq = s.layoutSeq;
    u.layout = s.mine ? structuredClone(s.mine) : {};
    u.sel = null;
  }

  const fresh = game.prev && s.last && s.last.n !== game.prev.last?.n ? s.last : null;
  const started = game.prev?.phase === 'aufstellen' && s.phase !== 'aufstellen';
  const placing = s.phase === 'aufstellen';

  root.classList.toggle('placing', placing);
  q('.sv-status').innerHTML = statusHTML(s, game);
  attack.querySelector('.sv-title').innerHTML = `${marker(game, them)} Meer von ${game.esc(game.name(them))}`;
  defense.querySelector('.sv-title').innerHTML = `${marker(game, me)} Deine Flotte`;
  attack.style.setProperty('--sc', game.color(me)); // Schüsse, die ich abgebe
  defense.style.setProperty('--sc', game.color(them)); // Schüsse auf mich

  const paint = () => {
    drawSea(attack, s, game, s.attack, { shoot: s.phase === 'schiessen' && s.turn === me && !s.result, fresh: fresh?.by === me ? fresh : null });
    drawSea(defense, s, game, s.defense, { own: true, placing: placing && !s.ready[me], u, fresh: fresh && fresh.by !== me ? fresh : null });
    fleetStatus(attack, s.attack.sunk, s.phase !== 'aufstellen', game);
    fleetStatus(defense, s.defense.sunk, s.phase !== 'aufstellen', game);
    q('.sv-dock').innerHTML = placing ? dockHTML(s, game, u) : '';
  };
  paint();

  const logText = logHTML(s, game);
  const log = q('.sv-log');
  if (log.innerHTML !== logText) {
    log.innerHTML = logText;
    if (!game.first && !game.reducedMotion) log.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: fresh ? 700 : 0, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }

  // Wer gerade beschossen wird, dessen Meer ist groß (nach dem Schuss, damit man ihn noch sieht).
  const big = placing || (s.phase === 'schiessen' && s.turn !== me) ? 'defense' : 'attack';
  const swap = () => arrange(root, big, u, game);
  if (fresh && u.big && u.big !== big && !game.reducedMotion) {
    const t = setTimeout(swap, 1250);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      arrange(root, big, u, { ...game, reducedMotion: true });
    });
  } else swap();

  if (!game.reducedMotion) {
    if (game.first) intro(root);
    else if (started) intro(root, attack);
    if (fresh) shotFx(root, s, game, fresh);
    if (s.result && game.prev && !game.prev.result) finale(root);
  }
  root.classList.toggle('over', Boolean(s.result));
  u.seq = s.seq;

  // Schießen: Feld antippen. Das Fadenkreuz rastet sofort ein, der Einschlag kommt mit der Antwort.
  if (s.phase === 'schiessen' && s.turn === me && !s.result) {
    attack.querySelector('.sv-cells').addEventListener('click', async (e) => {
      const cell = e.target.closest('.sv-cell.aim');
      if (!cell || u.aiming === s.seq) return;
      u.aiming = s.seq;
      const i = Number(cell.dataset.i);
      const fx = attack.querySelector('.sv-fx');
      fx.querySelector('.sv-cross.pending')?.remove();
      fx.insertAdjacentHTML('beforeend', `<span class="sv-cross pending" style="--x:${i % N};--y:${Math.floor(i / N)}"></span>`);
      await game.send('schuss', { i, at: s.seq });
      // Hat der Server abgelehnt, bleibt der Stand gleich: Fadenkreuz weg, nochmal zielen.
      requestAnimationFrame(() => {
        if (u.seq !== s.seq) return;
        u.aiming = null;
        fx.querySelector('.sv-cross.pending')?.remove();
      });
    }, { signal });
  }

  // Aufstellen: Schiff wählen, setzen, drehen (nur lokal, erst „Bereit“ schickt es ab)
  if (placing && !s.ready[me]) {
    root.addEventListener('click', (e) => onPlaceClick(e, root, s, game, u, paint), { signal });
    defense.querySelector('.sv-cells').addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return; // Vorschau nur mit Maus, beim Tippen stört sie
      const cell = e.target.closest('[data-i]');
      u.hover = cell ? Number(cell.dataset.i) : null;
      ghost(defense, u);
    }, { signal });
    defense.querySelector('.sv-cells').addEventListener('pointerleave', () => {
      u.hover = null;
      ghost(defense, u);
    }, { signal });
  }
}

function boardShell(kind) {
  const letters = 'ABCDEFGHIJ'.split('');
  return `<section class="sv-board" data-board="${kind}">
    <header class="sv-head"><span class="sv-title"></span><span class="sv-fleet"></span></header>
    <div class="sv-grid">
      <span></span>${letters.map((l) => `<span class="sv-lab">${l}</span>`).join('')}
      ${Array.from({ length: N }, (_, r) => `<span class="sv-lab" style="grid-row:${r + 2};grid-column:1">${r + 1}</span>`).join('')}
      <div class="sv-sea">
        <div class="sv-cells">${Array.from({ length: N * N }, (_, i) => `<button type="button" class="sv-cell" data-i="${i}" style="--x:${i % N};--y:${Math.floor(i / N)}" aria-label="${coord(i)}" disabled></button>`).join('')}</div>
        <div class="sv-calm"></div>
        <div class="sv-ships"></div>
        <div class="sv-marks"></div>
        <div class="sv-fx"></div>
      </div>
    </div>
  </section>`;
}

// Ein Meer zeichnen: Felder (klickbar oder nicht), Schiffe, Marken, ruhiges Wasser.
function drawSea(board, s, game, info, o) {
  const marks = new Map(info.marks.map((m) => [m.i, m]));
  const calm = new Set(info.calm);
  const ships = o.own ? ownShips(s, o, info) : info.ships;
  const occupied = o.placing ? occupiedBy(o.u.layout) : null;

  board.querySelectorAll('.sv-cell').forEach((cell) => {
    const i = Number(cell.dataset.i);
    const m = marks.get(i);
    const aim = Boolean(o.shoot && !m && !calm.has(i));
    cell.disabled = !(aim || o.placing);
    cell.classList.toggle('aim', aim);
    cell.classList.toggle('place', Boolean(o.placing));
    cell.classList.toggle('taken', Boolean(occupied?.has(i)));
    const label = `${coord(i)}${m ? (m.hit ? ', Treffer' : ', Wasser') : calm.has(i) ? ', frei' : ''}`;
    if (cell.getAttribute('aria-label') !== label) cell.setAttribute('aria-label', label);
  });

  // Schiffe bleiben als Elemente bestehen, damit Verschieben und Drehen gleiten.
  const layer = board.querySelector('.sv-ships');
  const keep = new Set();
  let reveals = 0;
  for (const sh of ships) {
    keep.add(sh.id);
    let node = layer.querySelector(`[data-ship="${sh.id}"]`);
    if (!node) {
      node = document.createElement('div');
      node.className = 'sv-ship';
      node.dataset.ship = sh.id;
      node.innerHTML = ART[SHIP[sh.id].art];
      layer.append(node);
      if (!game.first && !game.reducedMotion) {
        if (o.fresh?.sunk === sh.id && !o.own) node.classList.add('surfacing');
        else if (o.placing) node.classList.add('drop');
        else if (!o.own && !o.fresh) {
          // Am Ende taucht die restliche Flotte des anderen nacheinander auf
          node.classList.add('reveal');
          node.style.animationDelay = `${300 + reveals++ * 140}ms`;
        }
      }
    }
    node.style.setProperty('--x', sh.x);
    node.style.setProperty('--y', sh.y);
    node.style.setProperty('--n', SHIP[sh.id].size);
    node.style.setProperty('--r', sh.v ? '90deg' : '0deg');
    node.classList.toggle('sunk', Boolean(sh.sunk));
    node.classList.toggle('sinking', Boolean(o.own && o.fresh?.sunk === sh.id));
    node.classList.toggle('sel', Boolean(o.placing && o.u.sel === sh.id));
  }
  layer.querySelectorAll('.sv-ship').forEach((n) => keep.has(n.dataset.ship) || n.remove());

  board.querySelector('.sv-marks').innerHTML = info.marks
    .map((m) => {
      const isNew = o.fresh && m.i === o.fresh.i;
      return `<span class="sv-mark ${m.hit ? 'hit' : 'miss'} ${isNew ? 'new' : ''}" style="--x:${m.i % N};--y:${Math.floor(m.i / N)}">${m.hit ? HIT : SPLASH}</span>`;
    })
    .join('');
  const wasCalm = new Set(board.dataset.calm ? board.dataset.calm.split(',').map(Number) : []);
  board.querySelector('.sv-calm').innerHTML = info.calm
    .map((i) => {
      const fx = o.fresh?.sunk && !wasCalm.has(i);
      const d = fx ? Math.hypot((i % N) - (o.fresh.i % N), Math.floor(i / N) - Math.floor(o.fresh.i / N)) : 0;
      return `<span class="sv-dot ${fx ? 'new' : ''}" style="--x:${i % N};--y:${Math.floor(i / N)};--d:${Math.round(d * 45)}ms"></span>`;
    })
    .join('');
  board.dataset.calm = info.calm.join(',');
}

// Auf dem eigenen Meer: beim Aufstellen die lokale Aufstellung, danach die echte Flotte mit „versenkt“.
function ownShips(s, o, info) {
  if (o.placing || s.phase === 'aufstellen') {
    const layout = o.u?.layout ?? s.mine ?? {};
    return FLEET.filter((f) => layout[f.id]).map((f) => ({ id: f.id, ...layout[f.id], sunk: false }));
  }
  return info.ships;
}

function occupiedBy(layout) {
  const map = new Map();
  for (const f of FLEET) if (layout[f.id]) for (const c of cellsOf(f.id, layout[f.id])) map.set(c, f.id);
  return map;
}

// Kleine Flottenleiste über jedem Meer; ein gerade versenktes Schiff verblasst dort mit.
function fleetStatus(board, sunk, show, game) {
  const before = board.dataset.sunk === undefined ? null : board.dataset.sunk.split(',');
  board.dataset.sunk = show ? sunk.join(',') : '';
  board.querySelector('.sv-fleet').innerHTML = show
    ? FLEET.map((f) => {
        const gone = sunk.includes(f.id);
        const now = gone && before && !before.includes(f.id) && !game.first;
        return `<span class="sv-mini ${gone ? 'gone' : ''} ${now ? 'now' : ''}" style="--n:${f.size}" title="${f.name}${gone ? ', versenkt' : ''}">${ART[f.art]}</span>`;
      }).join('')
    : '';
}

function statusHTML(s, game) {
  const me = game.me;
  const them = s.players.find((p) => p.id !== me).id;
  const name = game.esc(game.name(them));
  if (s.result) return ''; // steht schon im Ergebnis-Banner
  if (s.phase === 'aufstellen') {
    return s.ready[me] ? `${marker(game, me)} Deine Flotte steht. Warte auf ${name}.` : `${marker(game, me)} Stell deine Flotte auf.`;
  }
  const l = s.last;
  if (s.turn === me) {
    if (l?.by === me && l.hit) return `${marker(game, me)} ${l.sunk ? `${SHIP[l.sunk].name} versenkt.` : 'Treffer.'} Du darfst nochmal.`;
    return `${marker(game, me)} Du bist dran: Wähl ein Feld im Meer von ${name}.`;
  }
  if (l?.by === them && l.hit) return `${marker(game, them)} ${name} hat getroffen und schießt nochmal.`;
  return `${marker(game, them)} ${name} zielt auf dein Meer.`;
}

function logHTML(s, game) {
  const l = s.last;
  if (!l || s.phase === 'aufstellen') return '';
  const you = l.by === game.me;
  const who = you ? 'Du schießt' : `${game.esc(game.name(l.by))} schießt`;
  const what = !l.hit ? 'Wasser' : l.sunk ? `${you ? '' : 'dein '}${SHIP[l.sunk].name} versenkt` : 'Treffer';
  return `${marker(game, l.by)} ${who} auf ${num(coord(l.i))}: ${what}.`;
}

// --- Aufstellen ---

function dockHTML(s, game, u) {
  const me = game.me;
  const them = s.players.find((p) => p.id !== me).id;
  const theirState = s.ready[them] ? `${game.esc(game.name(them))} ist bereit.` : `${game.esc(game.name(them))} stellt noch auf.`;
  if (s.ready[me]) return `<div class="sv-dock-row"><button class="link" data-action="aendern" data-value="1">Flotte ändern</button></div>`;
  const harbor = FLEET.filter((f) => !u.layout[f.id]);
  const err = problem(u.layout);
  const value = game.esc(JSON.stringify({ layout: u.layout }));
  const hint = u.sel
    ? u.layout[u.sel]
      ? `${SHIP[u.sel].name}: Nochmal antippen dreht es, ein freies Feld verschiebt es.`
      : `${SHIP[u.sel].name}: Tippe auf das Feld für den Bug.`
    : harbor.length
      ? 'Tippe ein Schiff im Hafen an und dann ein Feld im Meer.'
      : 'Alle Schiffe stehen. Zum Ändern ein Schiff antippen.';
  return `${harbor.length ? `<div class="sv-harbor" aria-label="Hafen">
      ${harbor.map((f) => `<button type="button" class="sv-dockship ${u.sel === f.id ? 'sel' : ''}" data-dock="${f.id}" style="--n:${f.size}" aria-label="${f.name} setzen">${ART[f.art]}</button>`).join('')}
    </div>` : ''}
    <p class="sv-hint">${hint}</p>
    <div class="sv-dock-row">
      <button class="btn" data-action="zufall" data-value="1">Zufällig</button>
      <button class="btn primary" data-action="bereit" data-value="${value}" ${err ? 'disabled' : ''}>Bereit</button>
      <span class="muted">${theirState}</span>
    </div>`;
}

function onPlaceClick(e, root, s, game, u, paint) {
  const dock = e.target.closest('[data-dock]');
  if (dock) {
    u.sel = u.sel === dock.dataset.dock ? null : dock.dataset.dock;
    paint();
    return;
  }
  const cell = e.target.closest('[data-board="defense"] .sv-cell');
  if (!cell) return;
  const i = Number(cell.dataset.i);
  const owner = occupiedBy(u.layout).get(i);
  const board = root.querySelector('[data-board="defense"]');
  let from = null;
  if (owner && owner === u.sel) {
    // Nochmal antippen: drehen (um den Bug), wenn es passt
    const p = u.layout[owner];
    const next = { ...u.layout, [owner]: { ...p, v: !p.v } };
    if (problem(next, false)) return nope(board, owner, game);
    u.layout = next;
  } else if (owner) {
    u.sel = owner; // ein gesetztes Schiff aufnehmen
  } else if (u.sel) {
    // Bug auf das Feld; passt es so nicht, dann andersherum gedreht
    const v = u.layout[u.sel]?.v ?? false;
    const at = (vv) => ({ ...u.layout, [u.sel]: { x: i % N, y: Math.floor(i / N), v: vv } });
    const next = [at(v), at(!v)].find((l) => !problem(l, false));
    if (!next) return nope(board, u.sel, game, i);
    if (!u.layout[u.sel]) from = root.querySelector(`[data-dock="${u.sel}"] svg`)?.getBoundingClientRect();
    u.layout = next;
  } else return;
  paint();
  ghost(board, u);
  if (from && !game.reducedMotion) sail(board, u.sel, from, u.layout[u.sel].v);
}

// Ein Schiff gleitet aus dem Hafen auf sein Feld (FLIP am inneren SVG, das Schiff selbst ist gedreht).
function sail(board, id, from, v) {
  const node = board.querySelector(`[data-ship="${id}"]`);
  const svg = node?.firstElementChild;
  if (!svg) return;
  node.classList.remove('drop');
  const to = svg.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const k = from.width / (v ? to.height : to.width);
  const [lx, ly] = v ? [dy, -dx] : [dx, dy];
  svg.animate([{ transform: `translate(${lx}px, ${ly}px) scale(${k})` }, { transform: 'none' }], {
    duration: 380,
    easing: 'cubic-bezier(.6,0,.2,1)',
  });
}

// Passt nicht: kurz rot aufblinken lassen
function nope(board, id, game, at) {
  const layer = board.querySelector('.sv-fx');
  const x = at !== undefined ? at % N : null;
  const y = at !== undefined ? Math.floor(at / N) : null;
  const target = at !== undefined ? null : board.querySelector(`[data-ship="${id}"]`);
  if (target && !game.reducedMotion) {
    target.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 300 });
  }
  if (x !== null) {
    const n = document.createElement('span');
    n.className = 'sv-nope';
    n.style.setProperty('--x', x);
    n.style.setProperty('--y', y);
    layer.append(n);
    setTimeout(() => n.remove(), 600);
  }
}

// Vorschau beim Darüberfahren: wo das gewählte Schiff landen würde
function ghost(board, u) {
  const layer = board.querySelector('.sv-fx');
  layer.querySelector('.sv-ghost')?.remove();
  if (u.sel === null || u.hover === null || occupiedBy(u.layout).has(u.hover)) return;
  const p = { x: u.hover % N, y: Math.floor(u.hover / N), v: u.layout[u.sel]?.v ?? false };
  const bad = Boolean(problem({ ...u.layout, [u.sel]: p }, false));
  const n = document.createElement('div');
  n.className = `sv-ship sv-ghost ${bad ? 'bad' : ''}`;
  n.style.cssText = `--x:${p.x};--y:${p.y};--n:${SHIP[u.sel].size};--r:${p.v ? '90deg' : '0deg'}`;
  n.innerHTML = ART[SHIP[u.sel].art];
  layer.append(n);
}

// --- Bewegung ---

// Meere anordnen; wechselt das große, gleiten beide an ihren neuen Platz (FLIP).
function arrange(root, big, u, game) {
  const boards = [...root.querySelectorAll('.sv-board')];
  if (u.big === big) return;
  const before = boards.map((b) => b.getBoundingClientRect());
  for (const b of boards) b.classList.toggle('big', b.dataset.board === big);
  const first = u.big === null;
  u.big = big;
  if (first || game.reducedMotion) return;
  boards.forEach((b, k) => {
    if (b.offsetParent === null) return;
    const a = before[k];
    const r = b.getBoundingClientRect();
    if (!a.width || !r.width) return;
    b.animate(
      [{ transformOrigin: 'top left', transform: `translate(${a.left - r.left}px, ${a.top - r.top}px) scale(${a.width / r.width})` }, { transformOrigin: 'top left', transform: 'none' }],
      { duration: 460, easing: 'cubic-bezier(.6,0,.2,1)' },
    );
  });
}

// Auftakt: das Meer baut sich diagonal auf
function intro(root, only) {
  const boards = only ? [only] : [...root.querySelectorAll('.sv-board')];
  for (const b of boards) {
    b.querySelectorAll('.sv-cell').forEach((c) => {
      const i = Number(c.dataset.i);
      c.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        delay: ((i % N) + Math.floor(i / N)) * 22,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      });
    });
    b.querySelectorAll('.sv-lab').forEach((l, k) => l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200 + k * 12, fill: 'backwards' }));
  }
}

// Ein Schuss: Fadenkreuz, die Granate fällt, dann Spritzer oder Explosion.
function shotFx(root, s, game, shot) {
  const board = root.querySelector(`[data-board="${shot.by === game.me ? 'attack' : 'defense'}"]`);
  const layer = board.querySelector('.sv-fx');
  const pos = `--x:${shot.i % N};--y:${Math.floor(shot.i / N)}`;
  const pending = layer.querySelector('.sv-cross.pending');
  if (pending) pending.classList.replace('pending', 'done'); // schon eingerastet: nur noch ausblenden
  layer.insertAdjacentHTML(
    'beforeend',
    `${pending ? '' : `<span class="sv-cross" style="${pos}"></span>`}<span class="sv-shell" style="${pos}"></span>${shot.hit ? '' : `<span class="sv-ripple" style="${pos}"></span><span class="sv-ripple two" style="${pos}"></span>`}`,
  );
  const made = [...layer.querySelectorAll('.sv-cross:not(.pending), .sv-shell, .sv-ripple')];
  setTimeout(() => made.forEach((n) => n.remove()), 1600);
  if (shot.hit) {
    board.querySelector('.sv-sea').animate(
      [{ transform: 'none' }, { transform: 'translate(2px, -1px)' }, { transform: 'translate(-2px, 1px)' }, { transform: 'none' }],
      { duration: 240, delay: 420, easing: 'ease-out' },
    );
  }
}

// Spielende: Nach dem letzten Einschlag läuft eine Welle über alle Treffer im Meer des anderen,
// seine übrige Flotte taucht auf (drawSea), das eigene Meer tritt zurück (CSS .over).
function finale(root) {
  const marks = [...root.querySelectorAll('[data-board="attack"] .sv-mark.hit')];
  const at = (m) => Number(m.style.getPropertyValue('--x')) + Number(m.style.getPropertyValue('--y'));
  marks
    .sort((a, b) => at(a) - at(b))
    .forEach((m, k) => {
      m.firstElementChild.animate([{ transform: 'none' }, { transform: 'scale(1.3) rotate(12deg)' }, { transform: 'none' }], {
        duration: 380,
        delay: 1000 + k * 30,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
    });
}

const RULES = `<details class="sv-rules">
  <summary>Regeln</summary>
  <ol>
    <li>Jeder versteckt seine Flotte auf dem eigenen Meer: ein Schlachtschiff mit fünf Feldern, ein Kreuzer mit vier, zwei Zerstörer mit drei und ein U-Boot mit zwei.</li>
    <li>Schiffe liegen waagerecht oder senkrecht und dürfen sich nicht berühren, auch nicht über Eck.</li>
    <li>Dann wird abwechselnd auf das Meer des anderen geschossen. Wer trifft, darf nochmal.</li>
    <li>Ist ein Schiff an allen Feldern getroffen, ist es versenkt. Das Wasser rundherum wird markiert, dort kann nichts mehr liegen.</li>
    <li>Wer zuerst alle Schiffe des anderen versenkt, gewinnt.</li>
  </ol>
</details>`;

export const style = `
  .sv { --line-sea: color-mix(in srgb, ${C.water} 22%, white); container-type: inline-size; display: grid; gap: 14px; width: 100%; max-width: 720px; }
  .sv-stage { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 18px 24px; }

  /* ---------- Meere ---------- */
  .sv-board { --cell: min(20px, calc(56cqw / 11)); order: 2; display: grid; gap: 6px; }
  .sv-board.big { --cell: min(40px, calc((100cqw - 2px) / 11)); order: 1; }
  .sv.placing [data-board="attack"] { display: none; }
  .sv-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; min-height: 24px; }
  .sv-title { display: flex; align-items: baseline; gap: 8px; font-size: var(--t-md); font-weight: 700; }
  .sv-board:not(.big) .sv-title { font-size: var(--t-sm); }
  .sv-fleet { display: flex; align-items: center; gap: 4px; }
  .sv-mini { display: block; width: calc(var(--n) * 9px); height: 9px; }
  .sv-mini svg { display: block; width: 100%; height: 100%; }
  .sv-mini.gone { opacity: .3; }
  .sv-mini.now { animation: sv-gone 500ms ease-out 900ms backwards; }
  @keyframes sv-gone { from { opacity: 1; } }

  .sv-grid { display: grid; grid-template-columns: repeat(11, var(--cell)); grid-template-rows: repeat(11, var(--cell)); }
  .sv-lab { display: grid; place-items: center; color: var(--muted); font: 800 max(10px, calc(var(--cell) * .42)) / 1 var(--font-display); }
  .sv-sea {
    position: relative; grid-row: 2 / 12; grid-column: 2 / 12;
    --c: calc(var(--cell) - .4px); /* der Rand nimmt zweimal 2px von zehn Feldern */
    border: 2px solid var(--line); border-radius: var(--radius);
  }
  .sv-cells { display: grid; grid-template-columns: repeat(10, 1fr); width: 100%; height: 100%; }
  .sv-cell {
    appearance: none; -webkit-appearance: none; position: relative; margin: 0; padding: 0;
    border: 0; border-right: 1px solid var(--line-sea); border-bottom: 1px solid var(--line-sea); border-radius: 0;
    background: var(--paper); cursor: default;
  }
  .sv-cell:nth-child(10n) { border-right: 0; }
  .sv-cell:nth-child(n + 91) { border-bottom: 0; }
  .sv-cell.aim, .sv-cell.place { cursor: pointer; }
  .sv-cell.aim:hover, .sv-cell.place:hover { background: var(--wash); }
  .sv-cell.aim:active { transform: scale(.92); }
  /* Fadenkreuz beim Zielen */
  .sv-cell.aim::before, .sv-cell.aim::after { content: ''; position: absolute; opacity: 0; transition: opacity 140ms ease-out; pointer-events: none; }
  .sv-cell.aim::before { inset: 18%; border: 2px solid var(--sc); border-radius: 50%; }
  .sv-cell.aim::after { left: 50%; top: 50%; width: 16%; height: 16%; transform: translate(-50%, -50%); border-radius: 50%; background: var(--sc); }
  @media (hover: hover) { .sv-cell.aim:hover::before, .sv-cell.aim:hover::after { opacity: .85; } }

  /* Ebenen über den Feldern: alles an Feldern ausgerichtet */
  .sv-calm, .sv-ships, .sv-marks, .sv-fx { position: absolute; inset: 0; pointer-events: none; }
  .sv-ship, .sv-mark, .sv-dot, .sv-cross, .sv-shell, .sv-ripple, .sv-nope {
    position: absolute; left: 0; top: 0; width: var(--c); height: var(--c);
    transform: translate(calc(var(--x) * var(--c)), calc(var(--y) * var(--c)));
  }
  .sv-ship {
    width: calc(var(--n) * var(--c));
    transform-origin: calc(var(--c) / 2) calc(var(--c) / 2);
    transform: translate(calc(var(--x) * var(--c)), calc(var(--y) * var(--c))) rotate(var(--r));
    transition: transform 260ms cubic-bezier(.2,.8,.2,1), opacity 300ms ease-out;
  }
  .sv-ship svg { display: block; width: 100%; height: 100%; }
  .sv-ship.sel { outline: 2px solid var(--ink); outline-offset: 1px; border-radius: var(--radius); }
  .sv-ship.sunk { opacity: .55; }
  .sv-ship.sinking { animation: sv-sink 900ms cubic-bezier(.6,0,.2,1) 450ms backwards; }
  .sv-ship.sinking svg { animation: sv-list 900ms cubic-bezier(.6,0,.2,1) 450ms; }
  @keyframes sv-sink { from { opacity: 1; } }
  @keyframes sv-list { 45% { transform: scale(.9) rotate(-3deg); } }
  .sv-ship.drop svg { animation: sv-place 280ms cubic-bezier(.2,.8,.2,1) backwards; }
  @keyframes sv-place { from { opacity: 0; transform: scale(1.15); } }
  .sv-ship.surfacing { animation: sv-surface 520ms cubic-bezier(.2,.8,.2,1) 480ms backwards; }
  .sv-ship.reveal { animation: sv-surface 520ms cubic-bezier(.2,.8,.2,1) backwards; }
  @keyframes sv-surface { from { opacity: 0; } }
  .sv-ghost { opacity: .4; transition: none; }
  .sv-ghost.bad { opacity: .3; }
  .sv-ghost.bad::after { content: ''; position: absolute; inset: 2px; border: 2px dashed var(--bad); border-radius: var(--radius); }

  .sv-mark svg { position: absolute; inset: 10%; width: 80%; height: 80%; }
  .sv-mark.miss svg { inset: 13%; width: 74%; height: 74%; }
  .sv-mark.new.hit svg { animation: sv-burst 420ms cubic-bezier(.2,.8,.2,1) 380ms backwards; }
  .sv-mark.new.miss svg { animation: sv-drop 360ms cubic-bezier(.2,.8,.2,1) 380ms backwards; }
  @keyframes sv-burst { from { opacity: 0; transform: scale(.3) rotate(-30deg); } }
  @keyframes sv-drop { from { opacity: 0; transform: scale(.4); } }
  .sv-dot::after { content: ''; position: absolute; left: 50%; top: 50%; width: 14%; height: 14%; transform: translate(-50%, -50%); border-radius: 50%; background: color-mix(in srgb, ${C.water} 35%, white); }
  .sv-dot.new::after { animation: sv-dot 300ms ease-out backwards; animation-delay: calc(900ms + var(--d)); }
  @keyframes sv-dot { from { opacity: 0; transform: translate(-50%, -50%) scale(2.4); } }

  /* Schuss: Fadenkreuz, fallende Granate, Wellen */
  .sv-cross::before { content: ''; position: absolute; inset: 8%; border: 2px solid var(--sc); border-radius: 50%; animation: sv-lock 260ms cubic-bezier(.2,.8,.2,1) backwards, sv-out 200ms ease-in 520ms forwards; }
  .sv-cross.pending::before { animation: sv-lock 200ms cubic-bezier(.2,.8,.2,1) backwards; }
  .sv-cross.done::before { animation: sv-out 200ms ease-in 300ms forwards; }
  @keyframes sv-lock { from { opacity: 0; transform: scale(1.8); } }
  @keyframes sv-out { to { opacity: 0; } }
  .sv-shell::before { content: ''; position: absolute; left: 50%; top: 50%; width: 30%; height: 30%; border-radius: 50%; background: var(--ink); transform: translate(-50%, -50%) scale(.6); opacity: 0; animation: sv-fall 300ms cubic-bezier(.6,0,.2,1) 120ms; }
  @keyframes sv-fall { from { opacity: .25; transform: translate(-50%, -50%) scale(3); } to { opacity: 1; transform: translate(-50%, -50%) scale(.6); } }
  .sv-ripple::before { content: ''; position: absolute; inset: 20%; border: 2px solid ${C.water}; border-radius: 50%; opacity: 0; animation: sv-ripple 640ms ease-out 400ms; }
  .sv-ripple.two::before { animation-delay: 560ms; }
  @keyframes sv-ripple { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(2.2); } }
  .sv-nope::before { content: ''; position: absolute; inset: 6%; border: 2px dashed var(--bad); border-radius: var(--radius); animation: sv-out 500ms ease-in forwards; }

  /* ---------- Hafen ---------- */
  .sv-harbor { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; min-height: 30px; }
  .sv-dockship {
    appearance: none; -webkit-appearance: none; margin: 0; padding: 3px; border: 2px solid transparent; border-radius: var(--radius);
    width: calc(var(--n) * 24px + 10px); height: 34px; background: none; cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  .sv-dockship svg { display: block; width: 100%; height: 100%; }
  .sv-dockship:hover { background: var(--wash); }
  .sv-dockship:active { transform: scale(.96); }
  .sv-dockship.sel { border-color: var(--ink); }
  .sv-hint { color: var(--muted); font-size: var(--t-sm); }
  .sv-dock-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
  .sv-dock:empty { display: none; }
  .sv-dock { display: grid; gap: 10px; }

  /* Spielende: das eigene Meer tritt zurück */
  .sv.over [data-board="defense"] .sv-grid { opacity: .5; transition: opacity 600ms ease-out 1100ms; }
  .sv-log { font-size: var(--t-sm); }
  .sv-log .num { font-size: 1.2em; letter-spacing: .05em; }
  .sv-log:empty, .sv-status:empty { display: none; }

  /* ---------- Regeln ---------- */
  .sv-rules { padding-top: 10px; border-top: 1px solid var(--hairline); font-size: var(--t-sm); }
  .sv-rules summary { width: max-content; cursor: pointer; font-weight: 700; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .sv-rules ol { display: grid; gap: 4px; max-width: 60ch; margin-top: 8px; padding-left: 1.4em; list-style: decimal; }

  @media (prefers-reduced-motion: reduce) {
    .sv *, .sv *::before, .sv *::after { animation: none !important; transition: none !important; }
    .sv .sv-cross, .sv .sv-shell, .sv .sv-ripple { display: none; }
  }
`;
