// Auf die Nüsse! Würfeln, bis man sich nicht mehr traut.
//
// Ablauf: Wer dran ist, würfelt mit fünf Eichhörnchenwürfeln (je drei Seiten Nuss, zwei Eichhörnchen,
// ein Tannenhäher). Jede Nuss zählt für diese Runde. Tannenhäher bleiben liegen, mit den übrigen
// Würfeln darf man weiterwürfeln, so oft man will, oder die Nüsse sichern. Ist in einem Wurf keine Nuss
// dabei, sind die Nüsse der Runde weg. Zeigen dabei alle Würfel Eichhörnchen, beginnt die Sonderrunde
// „Auf die Nüsse!“: ein Live-Wettlauf. Wer dran war, würfelt so schnell es geht mit allen fünf Würfeln
// und sammelt jede Nuss, der andere würfelt seinen Hundewürfel (ein Hund, fünf Hütten), bis der Hund
// kommt. Wer zuerst das Ziel erreicht (Einstellung in der Lobby), gewinnt.
//
// Wettlauf übers Netz: Der Server begrenzt das Tempo (die Würfel müssen erst landen), damit schnelles
// Tippen fair bleibt, und nimmt mehrere Tipper in einer Anfrage an. Würfelt der andere nicht selbst,
// rollt sein Hund nach kurzer Zeit von allein (tick).
//
// Motion: 3D-Würfel rollen über den Tisch, Nüsse fliegen in den Topf und beim Sichern in die Anzeige,
// Tannenhäher treten zur Seite, verlorene Nüsse werden durchgestrichen, die Sonderrunde startet mit
// Countdown, am Ende stempelt der Hund „Wuff! Wuff!“.

export const meta = {
  name: 'Auf die Nüsse!',
  description: 'Würfelt Nüsse, bis ihr euch nicht mehr traut. Wer zuerst das Ziel erreicht, gewinnt.',
  players: [2, 2],
  options: [
    {
      id: 'ziel',
      label: 'Ziel',
      choices: [
        { value: 50, label: 'Fünfzig Nüsse' },
        { value: 30, label: 'Dreißig Nüsse' },
      ],
    },
  ],
};

const SQUIRREL_DIE = ['nuss', 'nuss', 'nuss', 'hoernchen', 'hoernchen', 'haeher'];
const DOG_CHANCE = 1 / 6; // ein Hund, fünf Hütten
const COUNTDOWN = 3500; // ms bis zum Start der Sonderrunde
const NUT_MS = 450; // so oft dürfen die Nusswürfel in der Sonderrunde fliegen
const DOG_MS = 250; // so oft der Hundewürfel
const AUTO_AFTER = 1200; // würfelt der andere so lange nicht selbst, rollt sein Hund von allein …
const AUTO_MS = 260; // … in diesem Takt

const otherOf = (s, id) => s.players.find((p) => p.id !== id).id;
const nameOf = (s, id) => s.players.find((p) => p.id === id).name;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup(players, options = {}) {
  return {
    players,
    target: options.ziel === 30 ? 30 : 50,
    turn: pick(players).id,
    phase: 'wuerfeln', // wuerfeln → entscheiden → … ; sonder (Wettlauf) ; ende
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    pot: 0, // Nüsse dieser Runde, noch nicht gesichert
    dice: [null, null, null, null, null], // letzter Wurf: 'nuss' | 'hoernchen' | 'haeher'
    out: [false, false, false, false, false], // Tannenhäher, die in dieser Runde liegen bleiben
    rolls: 0,
    rounds: 0,
    last: null, // wie die letzte Runde ausging: { n, by, kind: 'gesichert' | 'pech' | 'sonder', nuts, lost }
    special: null, // der Wettlauf, bleibt nach dem Ende bis zum nächsten Wurf stehen
  };
}

export function action(s, { player, type, data }) {
  if (!(player in s.scores)) throw new Error('Du spielst nicht mit.');
  if (s.phase === 'ende') return;
  const now = Date.now();
  if (type === 'sonder' || type === 'hund') return raceAction(s, player, type, data, now);

  if (data?.roll !== s.rolls) return; // gehört zu einem älteren Wurf (doppelt getippt)
  if (s.phase !== 'wuerfeln' && s.phase !== 'entscheiden') return;
  if (player !== s.turn) throw new Error(`${nameOf(s, s.turn)} ist dran.`);
  if (type === 'wuerfeln') return roll(s, now);
  if (type === 'sichern' && s.phase === 'entscheiden') return bank(s);
}

// Würfelt der andere seinen Hund nicht selbst, rollt er von allein (sonst gäbe es endlos Nüsse).
export function tick(s, now) {
  const sp = s.special;
  if (s.phase !== 'sonder' || sp.done) return;
  while (!sp.done && sp.nextAuto <= now) {
    sp.auto++;
    sp.nextAuto += AUTO_MS;
    dogRoll(s);
  }
}

export function waitingFor(s) {
  if (s.phase === 'ende') return [];
  if (s.phase === 'sonder') return [s.special.by, s.special.dog];
  return [s.turn];
}

export function notices(s, before, player) {
  if (s.phase === 'sonder' && before.phase !== 'sonder') {
    const by = nameOf(s, s.special.by);
    return [{ to: s.special.dog, text: `Auf die Nüsse! ${by} würfelt um die Wette. Schnell, würfle deinen Hund.` }];
  }
  if (s.phase === 'wuerfeln' && (before.phase !== 'wuerfeln' || before.turn !== s.turn)) {
    return [{ to: s.turn, text: `${lastText(s)} Du bist dran.` }];
  }
  return [];
}

function lastText(s) {
  const l = s.last;
  if (!l) return '';
  const name = nameOf(s, l.by);
  if (l.kind === 'gesichert') return `${name} hat ${nutsText(l.nuts)} gesichert.`;
  if (l.kind === 'pech') return `${name} hatte keine Nuss im Wurf.`;
  return `${name} hat in der Sonderrunde ${nutsText(l.nuts)} ergattert.`;
}

// --- Ablauf ---

function roll(s, now) {
  if (s.phase === 'wuerfeln') {
    // neue Runde: alle fünf Würfel, leerer Topf
    s.pot = 0;
    s.out = [false, false, false, false, false];
    s.special = null;
  }
  s.rolls++;
  const rolled = [];
  s.dice = s.dice.map((face, i) => {
    if (s.out[i]) return face;
    rolled.push(i);
    return pick(SQUIRREL_DIE);
  });
  const faces = rolled.map((i) => s.dice[i]);
  const nuts = faces.filter((f) => f === 'nuss').length;
  if (!nuts) {
    const lost = s.pot;
    s.pot = 0;
    if (faces.every((f) => f === 'hoernchen')) return startRace(s, now, lost);
    endRound(s, { kind: 'pech', lost });
    return nextTurn(s);
  }
  s.pot += nuts;
  rolled.forEach((i) => {
    if (s.dice[i] === 'haeher') s.out[i] = true;
  });
  s.phase = 'entscheiden';
}

function bank(s) {
  const by = s.turn;
  s.scores[by] += s.pot;
  endRound(s, { kind: 'gesichert', nuts: s.pot });
  s.pot = 0;
  if (!won(s, by)) nextTurn(s);
}

function endRound(s, info) {
  s.rounds++;
  s.last = { n: s.rounds, by: s.turn, ...info };
}

function nextTurn(s) {
  s.turn = otherOf(s, s.turn);
  s.phase = 'wuerfeln';
}

function won(s, id) {
  if (s.scores[id] < s.target) return false;
  s.phase = 'ende';
  const other = otherOf(s, id);
  s.result = { winners: [id], text: `${nameOf(s, id)} gewinnt mit ${word(s.scores[id])} zu ${word(s.scores[other])} Nüssen.` };
  return true;
}

// --- Sonderrunde: Wettlauf ---

function startRace(s, now, lost) {
  s.phase = 'sonder';
  const startsAt = now + COUNTDOWN;
  s.special = {
    id: s.rolls,
    by: s.turn, // würfelt Nüsse
    dog: otherOf(s, s.turn), // würfelt den Hund
    lost, // Nüsse der Runde, die durch die Eichhörnchen weg sind
    startsAt,
    rolls: 0,
    nuts: 0,
    faces: null, // letzter Wurf der fünf Würfel
    dogRolls: 0,
    dogFace: null, // 'hund' | 'huette'
    manual: 0, // selbst gewürfelte Hundewürfe
    auto: 0, // von allein gerollte
    nutReady: startsAt,
    dogReady: startsAt,
    nextAuto: startsAt + AUTO_AFTER,
    done: false,
  };
}

function raceAction(s, player, type, data, now) {
  const sp = s.special;
  if (s.phase !== 'sonder' || sp.done || data?.id !== sp.id || now < sp.startsAt) return;
  const taps = Math.min(Math.max(1, Math.floor(Number(data.n) || 1)), 6);
  if (type === 'sonder') {
    if (player !== sp.by) throw new Error('Du würfelst den Hund.');
    for (let k = 0; k < taps && now >= sp.nutReady; k++) {
      // Höchstens zwei Würfe auf einmal, auch wenn lange nicht getippt wurde
      sp.nutReady = Math.max(sp.nutReady, now - NUT_MS) + NUT_MS;
      sp.faces = Array.from({ length: 5 }, () => pick(SQUIRREL_DIE));
      sp.nuts += sp.faces.filter((f) => f === 'nuss').length;
      sp.rolls++;
    }
    return;
  }
  if (player !== sp.dog) throw new Error('Du würfelst Nüsse.');
  for (let k = 0; k < taps && now >= sp.dogReady && !sp.done; k++) {
    sp.dogReady = Math.max(sp.dogReady, now - DOG_MS) + DOG_MS;
    sp.manual++;
    sp.nextAuto = now + AUTO_AFTER; // wer selbst würfelt, braucht keine Hilfe
    dogRoll(s);
  }
}

function dogRoll(s) {
  const sp = s.special;
  sp.dogRolls++;
  sp.dogFace = Math.random() < DOG_CHANCE ? 'hund' : 'huette';
  if (sp.dogFace !== 'hund') return;
  sp.done = true;
  s.scores[sp.by] += sp.nuts;
  endRound(s, { kind: 'sonder', nuts: sp.nuts, lost: sp.lost });
  if (!won(s, sp.by)) nextTurn(s);
}

// --- Texte ---

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

const nutsText = (n) => (n === 0 ? 'keine Nüsse' : n === 1 ? 'eine Nuss' : `${word(n)} Nüsse`);

// ---------- Anzeige (nur im Browser) ----------

// Eigene Illustrationen (Skill „zeichnen“): Tuschekontur, gedämpfte Druckfarben, viewBox 100 × 100.
// Teile, die sich bewegen könnten (Schwanz, Ohren, Kopf), sind eigene Gruppen.
const INK = '#141414';
const C = {
  nut: '#b07436', nutDark: '#8a5626', nutBase: '#e6c48f', nutDot: '#b8915a', leaf: '#6f8a2c',
  fur: '#c0622b', furDark: '#9c4a1f', furLight: '#d98a4f', cream: '#f2dcc0',
  jay: '#5b4434', jayDark: '#2f241c', fir: '#2e5e3a', branch: '#6b4a31',
  dog: '#d9b88a', dogDark: '#6b4a31', dogLight: '#f3e3c8', tongue: '#d77a7a', collar: '#2e7d4f', tag: '#c48a1e',
  wood: '#b77a4c', woodDark: '#7a4a2c', woodLight: '#d49a62', roof: '#6e4128', grass: '#4f7a2c',
};
const pic = (inner) => `<svg viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`;
// Tannennadeln am Zweig des Tannenhähers
const NEEDLES = Array.from({ length: 14 }, (_, i) => {
  const x = 16 + i * 5.6;
  const y = 84.5 - Math.sin((x - 10) / 84 * Math.PI) * 3.6;
  return `M${x} ${y.toFixed(1)} l-4.5 -5 M${x + 1} ${y.toFixed(1)} l-4 4.6`;
}).join(' ');

const ICON = {
  nuss: pic(`
  <g class="blatt">
    <path d="M53 22 C55.5 15.5 61 11 67.5 9.5 L69.5 7.2 L71.8 8.8 C75.5 7.6 79.5 7.2 83.5 7.8 L86.2 6.2 L87.5 9.2 C86 14.5 83 18.5 78.5 21.2 L79.2 23.8 L76 23.6 C70 26.4 61.5 26.8 53 22 Z" fill="${C.leaf}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M55.5 21.5 C64 17 73 13 84.5 9.8" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M63 18.5 L64 13.5 M71 15 L73.5 10.5 M64 18 L68 22 M72 14.5 L77 18" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>
  </g>
  <g class="schale">
    <path d="M50 16 C58 21.5 81 37.5 81 59 C81 77 67 89 50 89 C33 89 19 77 19 59 C19 37.5 42 21.5 50 16 Z" fill="${C.nut}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M43 23.5 C33 34 28.5 50 30.5 68 M57 23.5 C67 34 71.5 50 69.5 68 M50 21 C48.5 38 48.5 56 50 72" fill="none" stroke="${C.nutDark}" stroke-width="1.8" stroke-linecap="round"/>
  </g>
  <g class="boden">
    <path d="M23.5 70 C33 79.5 67 79.5 76.5 70 C73.5 82.5 63 89 50 89 C37 89 26.5 82.5 23.5 70 Z" fill="${C.nutBase}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <g fill="${C.nutDot}">${[[36, 80], [43, 84], [50, 81], [57, 84], [64, 80], [47, 87], [55, 87.5], [40, 79], [60, 79]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2"/>`).join('')}</g>
  </g>
  <g class="spitze">
    <path d="M50 16.5 V10" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 11 L46.5 7 M50 11 L53.5 7 M50 10.5 V5.5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  </g>
  <g class="licht" fill="none" stroke="#fff" stroke-linecap="round" opacity=".8">
    <path d="M36 32 C31 40 28.5 49 29 57" stroke-width="4.5"/>
    <path d="M31 64 L31 64.5" stroke-width="3.5"/>
  </g>`),
  hoernchen: pic(`
  <g class="schwanz">
    <path d="M58 84 C80 88 92 72 87 55 C84 43 74 38 76 26 C77 18 83 13 89 15" fill="none" stroke="${INK}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 84 C80 88 92 72 87 55 C84 43 74 38 76 26 C77 18 83 13 89 15" fill="none" stroke="${C.fur}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M66 80 C80 81 87 70 84 57 C82 48 74 42 75.5 31" fill="none" stroke="${C.furLight}" stroke-width="4" stroke-linecap="round"/>
    <path d="M80 72.5 C83.5 71 85.5 68 86 64.5 M84.5 52 C86.5 49.5 87 46.5 86 43.5 M78 37 C80 35 80.5 32 79.5 29 M73 81 C76 80.5 78.5 79 80 77" fill="none" stroke="${C.furDark}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M84 13.5 C85 8 89.5 4.5 95.5 5 C93.5 7.5 93 10 94.5 12.5 C92 15 89 16.5 86.5 16.5 Z" fill="${C.fur}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <path class="ohr-hinten" d="M44 25 L50 9.5 L54.5 26 Z" fill="${C.furDark}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <g class="koerper">
    <ellipse cx="56" cy="77" rx="13" ry="10.5" fill="${C.fur}" stroke="${INK}" stroke-width="4"/>
    <path d="M30 60 C28 46 36 38 47 38 C59 38 66 48 66 62 C66 76 58 86 46 86 C35 86 31 74 30 60 Z" fill="${C.fur}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M35.5 50 C33 61 34 73 40.5 82 C45 75 46.5 63 44.5 51 Z" fill="${C.cream}"/>
    <path d="M57 50 L61 53 M60 63 L64 65 M54 72 L58 73" stroke="${C.furDark}" stroke-width="2" stroke-linecap="round"/>
    <path d="M35 89 C37 84.5 50 84 61 88 C58.5 92 39.5 92.5 35 89 Z" fill="${C.fur}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <g class="kopf">
    <path d="M20 37 C17 32 20 25 27 23 C31 18 40 17 45 21 C51 25 52 33 49 39 C46 46 37 48 31 46 C26 45 22 42 20 37 Z" fill="${C.fur}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M21.5 39.5 C25.5 44 31 46 37 45 C33 48.5 26 48 22.5 44 Z" fill="${C.cream}"/>
    <g class="ohr">
      <path d="M35.5 22.5 L37 6.5 L45 21 Z" fill="${C.fur}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M35.5 8.5 C34 5 34.5 2 36.8 0.8 C37.6 3 39.6 5 39 8.5 Z" fill="${INK}"/>
    </g>
    <circle cx="33" cy="31" r="5.6" fill="${C.cream}"/>
    <ellipse cx="32.5" cy="31" rx="3.4" ry="3.9" fill="${INK}"/>
    <circle cx="31.3" cy="29.5" r="1.3" fill="#fff"/>
    <ellipse cx="19.6" cy="33.5" rx="2.1" ry="1.7" fill="${INK}"/>
    <path d="M20 35.5 L12.5 34.5 M20.5 37 L13.5 39.5" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
  </g>
  <g class="pfoten" fill="${C.fur}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M28.5 55.5 C25 54.5 24.5 59.5 28 61 C31 62 34 59 32.5 56.5 Z"/>
    <path d="M34 58 C31 57.5 31 62 34 63 C37 63.5 39.5 61 38 58.5 Z"/>
  </g>`),
  haeher: pic(`
  <g class="zweig">
    <path d="${NEEDLES}" stroke="${C.fir}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 86 C34 82 62 82 94 86" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M10 86 C34 82 62 82 94 86" fill="none" stroke="${C.branch}" stroke-width="3.6" stroke-linecap="round"/>
  </g>
  <g class="schwanz">
    <path d="M62 60.5 C72 64 83 67.5 93.5 69.5 L89.5 81.5 C79 78 68 73.5 58 70 Z" fill="${C.jayDark}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M66.5 66.5 L88 74.5 M64 69.5 L86 78" stroke="${C.jay}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M86.5 68.6 L93.5 69.5 L89.5 81.5 L83 79.4 Z" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
  <g class="beine" stroke="${INK}" stroke-linecap="round">
    <path d="M42 72 L40 83 M52 73 L53 83" stroke-width="3.5"/>
    <path d="M35.5 84 H45 M48 84 H58" stroke-width="3"/>
  </g>
  <g class="koerper">
    <path d="M24 50 C24 36 37 28 52 30 C66 32 74 44 72 58 C70 70 58 76 45 74 C33 72 24 63 24 50 Z" fill="${C.jay}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <g class="fluegel">
      <path d="M44 41 C57 37 71 44 77 59 C66 65 52 62 45 54 C42 50 42 45 44 41 Z" fill="${C.jayDark}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M51 50 C59 54 67 56 74 58 M50 45 C58 47 66 51 71 55" fill="none" stroke="${C.jay}" stroke-width="1.6" stroke-linecap="round"/>
    </g>
  </g>
  <g class="kopf">
    <circle cx="30" cy="35" r="13" fill="${C.jay}" stroke="${INK}" stroke-width="4"/>
    <path d="M19 31.5 C20.5 23.5 28 20 35 21.5 C40 22.5 43 27.5 43 33 C35 29 26.5 28.5 19 31.5 Z" fill="${C.jayDark}"/>
    <path d="M19 31 C13 32 7 34 2 37 C8 38.5 13 39.5 19 40 Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="26" cy="33.5" r="3.2" fill="${INK}"/>
    <circle cx="25" cy="32.3" r="1.2" fill="#fff"/>
    <path d="M23 38.5 C26 40 30 39.5 32.5 37.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
  </g>
  <g class="tupfen" fill="#fff">${[[34, 41, 1.3], [38.5, 44.5, 1.5], [30.5, 45.5, 1.3], [36, 50.5, 1.8], [29.5, 55, 1.6], [40, 58, 1.8], [34, 63, 1.7], [43.5, 66.5, 1.6], [51.5, 69, 1.4], [28, 50, 1.2], [36.5, 34, 1], [40, 38, 1.1], [57, 67, 1.2], [61, 51, 1], [67, 55, 1]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
    .join('')}</g>`),
  hund: pic(`
  <g class="ohren" fill="${C.dogDark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round">
    <path d="M29 25 C14 25 7.5 45 13.5 64 C20 62.5 26 52 30.5 39 Z"/>
    <path d="M71 25 C85 23 93 38 89.5 55 C83.5 53.5 76 46 70 37.5 Z"/>
  </g>
  <g class="kopf">
    <path d="M50 15 C68 15 78 29 78 47 C78 67 66 80 50 80 C34 80 22 67 22 47 C22 29 32 15 50 15 Z" fill="${C.dog}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M46 17 C44 29 42.5 38 41 49 L59 49 C57.5 38 56 29 54 17 C52.5 16.4 47.5 16.4 46 17 Z" fill="${C.dogLight}"/>
    <ellipse cx="63" cy="39.5" rx="9.5" ry="8.5" fill="${C.dogDark}"/>
    <path d="M32 31.5 Q37 28.5 42 30.5 M58 30.5 Q63 28 68 31" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="62.5" cy="39.5" r="6" fill="none" stroke="${C.dogLight}" stroke-width="1.8"/>
    <circle cx="37.5" cy="39.5" r="4.2" fill="${INK}"/><circle cx="62.5" cy="39.5" r="4.2" fill="${INK}"/>
    <circle cx="36.2" cy="38" r="1.5" fill="#fff"/><circle cx="61.2" cy="38" r="1.5" fill="#fff"/>
  </g>
  <g class="schnauze">
    <path d="M32 58 C32 50 40 47 50 47 C60 47 68 50 68 58 C68 68 60 74 50 74 C40 74 32 68 32 58 Z" fill="${C.dogLight}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M46 66 C46 75.5 54 75.5 54 66 Z" fill="${C.tongue}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M50 67 V71.5" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
    <path d="M50 59.5 V64 M41 63.5 C44.5 68 55.5 68 59 63.5" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M42.5 52 C43.5 48 56.5 48 57.5 52 C57.5 57 53.5 59.5 50 59.5 C46.5 59.5 42.5 57 42.5 52 Z" fill="${INK}"/>
    <ellipse cx="47" cy="51.3" rx="2.4" ry="1.3" fill="#fff" opacity=".85"/>
  </g>
  <g class="halsband">
    <path d="M31 75 C40 82 60 82 69 75 L70 81 C60 88.5 40 88.5 30 81 Z" fill="${C.collar}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="90" r="5" fill="${C.tag}" stroke="${INK}" stroke-width="2.6"/>
    <path d="M50 85 V86.5" stroke="${INK}" stroke-width="2"/>
  </g>`),
  huette: pic(`
  <g class="boden">
    <path d="M5 89 H95" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M9 88 l-1.5 -5 M11 88 l1 -6 M13 88 l2.5 -4.5 M86 88 l-2 -4.5 M88 88 l.5 -6 M90.5 88 l2.5 -4.5" stroke="${C.grass}" stroke-width="2.2" stroke-linecap="round"/>
  </g>
  <g class="wand">
    <path d="M20 89 V48 L50 23 L80 48 V89 Z" fill="${C.wood}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M20.5 58 H79.5 M20.5 68 H79.5 M20.5 78 H79.5" stroke="${C.woodDark}" stroke-width="1.6"/>
    <g fill="${C.woodDark}">${[[25, 63], [75, 63], [25, 73], [75, 73], [25, 83], [75, 83]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1"/>`).join('')}</g>
  </g>
  <g class="tuer">
    <path d="M34.5 89 V69 A15.5 15.5 0 0 1 65.5 69 V89 Z" fill="${C.woodLight}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M39 89 V69.5 A11 11 0 0 1 61 69.5 V89 Z" fill="${INK}"/>
  </g>
  <g class="schild">
    <path d="M42 44.5 H58" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M42 44.5 H58" stroke="${C.dogLight}" stroke-width="3.6" stroke-linecap="round"/>
    <g fill="${C.dogLight}" stroke="${INK}" stroke-width="1.6">${[[41.5, 42.3], [41.5, 46.7], [58.5, 42.3], [58.5, 46.7]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.7"/>`).join('')}</g>
    <path d="M42 44.5 H58" stroke="${C.dogLight}" stroke-width="3.6" stroke-linecap="round"/>
  </g>
  <g class="dach">
    <path d="M9 52 L50 14 L91 52 L83 58 L50 28 L17 58 Z" fill="${C.roof}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M20 46 L25.5 51 M27.5 39 L33 44 M35 32 L40.5 37 M42.5 25 L47 29.5 M80 46 L74.5 51 M72.5 39 L67 44 M65 32 L59.5 37 M57.5 25 L53 29.5" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".8"/>
  </g>`),
};
const NAME = { nuss: 'Nuss', hoernchen: 'Eichhörnchen', haeher: 'Tannenhäher', hund: 'Hund', huette: 'Hütte' };

// 3D-Würfel: Lage der Seiten im Würfel und Drehung, mit der eine Seite oben liegt
const FACE = { 1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const POS_FACE = { 1: 'nuss', 2: 'hoernchen', 3: 'nuss', 4: 'haeher', 5: 'nuss', 6: 'hoernchen' };
const POS = { nuss: [1, 3, 5], hoernchen: [2, 6], haeher: [4] };

// Fester Zufall für die Anzeige (render darf kein Math.random benutzen)
function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;

// Lokaler Zustand pro Spielfeld (überlebt neues Zeichnen, neu bei jeder Partie)
const ui = new WeakMap();
function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, ctrl: null, tray: '', raceId: null, race: null, shown: null, pending: 0, inflight: false, lastTap: 0, role: null, tossAt: 0 };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => u.ctrl?.abort());
  }
  return u;
}

export function render(el, s, game) {
  const u = local(el, game);
  u.ctrl?.abort();
  u.ctrl = new AbortController();

  let root = el.querySelector(':scope > .adn');
  if (!root) {
    el.innerHTML = `<div class="adn">
      <div class="adn-board"></div>
      <p class="status adn-status"></p>
      <div class="adn-race"></div>
      <div class="adn-pot"></div>
      <div class="adn-tray"></div>
      <div class="adn-bar"></div>
      <p class="adn-last"></p>
      ${rulesHTML(s)}
    </div>`;
    root = el.firstElementChild;
  }
  const q = (sel) => root.querySelector(sel);
  const fx = changes(s, game);

  q('.adn-board').innerHTML = boardHTML(s, game, fx);
  const status = q('.adn-status');
  const text = statusHTML(s, game);
  if (status.innerHTML !== text) {
    status.innerHTML = text;
    if (!fx.first && !game.reducedMotion) status.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  renderRace(q('.adn-race'), s, game, u, fx);
  q('.adn-pot').innerHTML = potHTML(s, fx, game);
  renderTray(q('.adn-tray'), s, game, u, fx);
  q('.adn-bar').innerHTML = barHTML(s, game);
  const last = q('.adn-last');
  last.innerHTML = lastHTML(s, game);
  last.classList.toggle('enter', fx.lastChanged);

  root.addEventListener(
    'click',
    (e) => {
      if (e.target.closest('[data-action="wuerfeln"]') && !game.reducedMotion) {
        const tray = q('.adn-tray');
        tray.classList.add('shaking'); // bis der Wurf vom Server da ist
        setTimeout(() => tray.classList.remove('shaking'), 2000);
      }
    },
    { signal: u.ctrl.signal },
  );

  if (fx.prev && !game.reducedMotion) animate(root, s, game, fx);
}

// Was hat sich seit dem letzten Stand geändert? (nur das wird animiert)
function changes(s, game) {
  const prev = game.prev;
  const fx = { first: game.first, prev, rolled: false, lastChanged: false, raceStart: false, raceEnd: false, ended: false };
  if (!prev) return fx;
  fx.rolled = s.rolls !== prev.rolls;
  fx.lastChanged = (s.last?.n ?? 0) !== (prev.last?.n ?? 0);
  fx.raceStart = s.phase === 'sonder' && prev.phase !== 'sonder';
  fx.raceEnd = Boolean(s.special?.done && prev.special && !prev.special.done);
  fx.ended = Boolean(s.result && !prev.result);
  return fx;
}

// --- Anzeige oben: Nüsse beider Spieler auf dem Weg zum Ziel ---

function boardHTML(s, game, fx) {
  const rows = s.players
    .map((p, k) => {
      const score = s.scores[p.id];
      const cls = ['adn-row'];
      if (!s.result && s.phase !== 'sonder' && s.turn === p.id) cls.push('is-turn');
      if (s.result) cls.push(s.result.winners.includes(p.id) ? 'win' : 'lose');
      if (fx.ended) cls.push('just-ended');
      if (fx.first) cls.push('intro');
      return `<div class="${cls.join(' ')}" data-id="${p.id}" style="--pc:${game.color(p.id)};--k:${k}">
        <span class="adn-name">${marker(game, p.id)} ${p.id === game.me ? 'Du' : game.esc(p.name)}</span>
        <span class="adn-score num" data-score aria-label="${nutsText(score)}">${score}</span>
        <span class="adn-track" aria-hidden="true"><i style="transform:scaleX(${Math.min(1, score / s.target)})"></i></span>
      </div>`;
    })
    .join('');
  return `${rows}<p class="adn-goal ${fx.first ? 'intro' : ''}">Ziel: ${word(s.target)} Nüsse.</p>`;
}

function statusHTML(s, game) {
  const me = game.me;
  const name = (id) => game.esc(game.name(id));
  if (s.result) {
    const w = s.result.winners[0];
    return `${marker(game, w)} ${w === me ? 'Du hast' : `${name(w)} hat`} das Ziel erreicht.`;
  }
  if (s.phase === 'sonder') {
    const sp = s.special;
    return sp.by === me
      ? `${marker(game, me)} Alle Würfel zeigen Eichhörnchen. Würfle so schnell du kannst, bis der Hund kommt.`
      : `${marker(game, me)} Würfle deinen Hund, bevor ${name(sp.by)} zu viele Nüsse sammelt.`;
  }
  const who = marker(game, s.turn);
  if (s.phase === 'entscheiden') {
    return s.turn === me ? `${who} Weiterwürfeln oder Nüsse sichern?` : `${who} ${name(s.turn)} überlegt: weiterwürfeln oder sichern?`;
  }
  return s.turn === me ? `${who} Du bist dran mit Würfeln.` : `${who} ${name(s.turn)} ist dran mit Würfeln.`;
}

// Der Topf: Nüsse dieser Runde, oder die eben verlorenen (durchgestrichen)
function potHTML(s, fx, game) {
  if (s.phase === 'entscheiden') {
    // Beim Wurf zeigt der Topf erst den alten Stand, die Nüsse fliegen dann einzeln hinein.
    const flying = fx.rolled && fx.prev && !game.reducedMotion;
    const from = flying ? (fx.prev.phase === 'entscheiden' ? fx.prev.pot : 0) : s.pot;
    return `<div class="adn-potbox">${ICON.nuss}<b class="num" data-pot>${from}</b><span>${s.pot === 1 ? 'Nuss' : 'Nüsse'} in dieser Runde</span></div>`;
  }
  let lost = 0;
  if (s.phase === 'sonder') lost = s.special.lost;
  else if (s.phase === 'wuerfeln' && s.last?.kind === 'pech') lost = s.last.lost;
  if (!lost) return '';
  const striking = fx.lastChanged || fx.raceStart;
  return `<div class="adn-potbox lost ${striking ? 'striking' : ''}">${ICON.nuss}<b class="num">${lost}<svg class="adn-strike" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 15 L98 5"/></svg></b><span>${lost === 1 ? 'Nuss' : 'Nüsse'} verloren</span></div>`;
}

function barHTML(s, game) {
  if (s.result || s.phase === 'sonder' || s.turn !== game.me) return '';
  const value = game.esc(JSON.stringify({ roll: s.rolls }));
  if (s.phase === 'wuerfeln') return `<button class="btn primary" data-action="wuerfeln" data-value="${value}">Würfeln</button>`;
  const left = s.out.filter((o) => !o).length;
  return `<button class="btn" data-action="wuerfeln" data-value="${value}">Weiterwürfeln</button>
    <button class="btn primary" data-action="sichern" data-value="${value}">Nüsse sichern</button>
    <span class="adn-note">${left === 1 ? 'Noch ein Würfel' : `Noch ${word(left)} Würfel`} im Spiel.</span>`;
}

function lastHTML(s, game) {
  const l = s.last;
  if (s.phase !== 'wuerfeln' || !l || s.special) return '';
  const you = l.by === game.me;
  const who = `${marker(game, l.by)} ${you ? 'Du' : game.esc(game.name(l.by))}`;
  if (l.kind === 'gesichert') return `${who} ${you ? 'hast' : 'hat'} ${nutsText(l.nuts)} gesichert.`;
  if (l.kind === 'pech') return `${who} ${you ? 'hattest' : 'hatte'} keine Nuss im Wurf.`;
  return '';
}

// --- Würfeltisch ---

function renderTray(tray, s, game, u, fx) {
  tray.classList.toggle('stale', Boolean(s.special) || s.phase === 'ende' || (s.phase === 'wuerfeln' && s.rolls > 0));
  const key = JSON.stringify([s.rolls, s.dice, s.out]);
  if (u.tray === key && !fx.first) return;
  u.tray = key;
  tray.classList.remove('shaking');

  // Welche Würfel lagen vor diesem Wurf schon beiseite?
  const before = fx.prev?.phase === 'entscheiden' ? fx.prev.out : [false, false, false, false, false];
  tray.innerHTML = s.dice
    .map((face, i) => {
      const rolled = fx.rolled && !before[i];
      return dieHTML(s, i, face, { rolled, out: s.out[i], going: rolled && s.out[i], intro: fx.first });
    })
    .join('');
  if (fx.rolled && !game.reducedMotion) rollDice(tray, s);
}

function dieHTML(s, i, face, o) {
  const f = face ?? 'nuss';
  const options = POS[f];
  const pos = options[Math.floor(hash(s.rolls, i, 'pos') * options.length)];
  const [fx0, fy0] = SHOW[pos];
  const rz = (hash(s.rolls, i, 'rz') - 0.5) * 16;
  const faces = [1, 2, 3, 4, 5, 6]
    .map((n) => `<span class="adn-face" style="transform:${FACE[n]} translateZ(var(--h))">${ICON[POS_FACE[n]]}</span>`)
    .join('');
  const cls = ['adn-die', o.out && 'out', o.going && 'going', o.intro && 'intro', o.rolled && 'rolled', !face && 'idle'].filter(Boolean);
  return `<div class="${cls.join(' ')}" data-slot="${i}" data-face="${fx0},${fy0}" data-rz="${rz}" style="--k:${i};--rz:${rz}deg"
      role="img" aria-label="${face ? NAME[face] : 'Würfel'}${o.out ? ', liegt beiseite' : ''}">
    <div class="adn-lift"><div class="adn-cube" style="transform:rotateX(${fx0}deg) rotateY(${fy0}deg)">
      <i class="adn-core"></i><i class="adn-core adn-core-x"></i><i class="adn-core adn-core-y"></i>${faces}
    </div></div>
  </div>`;
}

// Die geworfenen Würfel kommen von links über den Tisch, überschlagen sich und landen auf ihrer Seite.
function rollDice(tray, s) {
  tray.querySelectorAll('.adn-die.rolled').forEach((n) => {
    const k = Number(n.dataset.slot);
    const rz = Number(n.dataset.rz);
    const [fx0, fy0] = n.dataset.face.split(',').map(Number);
    const spinX = 540 + Math.floor(hash(s.rolls, k, 'sx') * 3) * 180;
    const spinY = 360 + Math.floor(hash(s.rolls, k, 'sy') * 3) * 90;
    const dir = hash(s.rolls, k, 'dir') < 0.5 ? -1 : 1;
    const timing = { duration: 860, delay: k * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
    n.animate(
      [
        { transform: `translate(${-170 - k * 12}px, ${-30 + hash(s.rolls, k, 'y') * 44}px) rotate(${rz - 160}deg) scale(1.2)`, opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { transform: `translate(0px, 0px) rotate(${rz}deg) scale(1)` },
      ],
      timing,
    );
    n.classList.add('rolling');
    n.querySelector('.adn-cube')
      .animate(
        [
          { transform: `rotateX(${fx0 + spinX * dir}deg) rotateY(${fy0 - spinY}deg)` },
          { transform: `rotateX(${fx0}deg) rotateY(${fy0}deg)` },
        ],
        timing,
      )
      .finished.then(() => n.classList.remove('rolling'), () => {});
  });
}

// --- Sonderrunde: Wettlauf ---

function renderRace(box, s, game, u, fx) {
  const sp = s.special;
  u.race = sp;
  if (!sp) {
    if (u.raceId !== null) box.innerHTML = '';
    u.raceId = null;
    return;
  }
  if (u.raceId !== sp.id) {
    u.raceId = sp.id;
    buildRace(box, s, game, u, fx);
  }
  updateRace(box, s, game, u, fx);
  if (!sp.done) startClock(box, sp, game, u.ctrl.signal);
}

function buildRace(box, s, game, u, fx) {
  const sp = s.special;
  const me = game.me;
  const role = sp.by === me ? 'sonder' : sp.dog === me ? 'hund' : null;
  const nm = (id) => (id === me ? 'Du' : game.esc(game.name(id)));
  box.innerHTML = `<section class="adn-sp ${fx.raceStart ? 'arrive' : ''}" style="--a:${game.color(sp.by)};--b:${game.color(sp.dog)}" aria-label="Sonderrunde">
    <h3 class="adn-sp-title">Auf die Nüsse!</h3>
    <div class="adn-lane adn-lane-nuts">
      <span class="adn-lane-who">${marker(game, sp.by)} ${nm(sp.by)}</span>
      <span class="adn-sp-dice">${Array.from({ length: 5 }, () => `<span class="adn-fdie">${ICON.hoernchen}</span>`).join('')}</span>
      <span class="adn-sp-num num" data-nuts aria-label="Nüsse">0</span>
    </div>
    <div class="adn-lane adn-lane-dog">
      <span class="adn-lane-who">${marker(game, sp.dog)} ${nm(sp.dog)}</span>
      <span class="adn-fdie adn-dogdie" data-dog>${ICON.huette}</span>
      <span class="adn-dognote"><span data-dognote></span><span class="adn-wuff" data-wuff hidden>Wuff! Wuff!</span></span>
    </div>
    ${role ? `<button type="button" class="btn primary adn-tap" data-tap disabled>${role === 'sonder' ? 'Würfeln' : 'Hund würfeln'}</button>` : ''}
    <p class="adn-sp-result" data-result></p>
    <div class="adn-count" data-count hidden></div>
  </section>`;
  u.shown = { rolls: 0, dogRolls: 0, nuts: 0, fresh: !fx.raceStart }; // fresh: ohne Animation nachholen
  u.pending = 0;
  box.querySelector('[data-tap]')?.addEventListener('click', () => tap(box, game, u, role), { signal: game.signal });
}

function updateRace(box, s, game, u, fx) {
  const sp = s.special;
  const quiet = u.shown.fresh || game.reducedMotion; // Stand nachholen, ohne alles nochmal zu würfeln
  u.shown.fresh = false;
  const recent = (role) => u.role === role && performance.now() - u.tossAt < 600; // schon lokal gewürfelt
  const panel = box.querySelector('.adn-sp');
  panel.classList.toggle('done', sp.done);
  panel.classList.toggle('just-done', fx.raceEnd);

  if (sp.faces && sp.rolls !== u.shown.rolls) {
    const dice = [...box.querySelectorAll('.adn-sp-dice .adn-fdie')];
    dice.forEach((d, i) => {
      d.innerHTML = ICON[sp.faces[i]];
      d.classList.toggle('nut', sp.faces[i] === 'nuss');
    });
    if (!quiet && !recent('sonder')) toss(dice, NUT_MS);
    u.shown.rolls = sp.rolls;
  }
  const num = box.querySelector('[data-nuts]');
  if (sp.nuts !== u.shown.nuts) {
    if (quiet) num.textContent = sp.nuts;
    else countUp(num, u.shown.nuts, sp.nuts, 0, 220, game.signal);
    u.shown.nuts = sp.nuts;
  }

  const dog = box.querySelector('[data-dog]');
  if (sp.dogRolls !== u.shown.dogRolls) {
    dog.innerHTML = ICON[sp.dogFace];
    dog.classList.toggle('is-dog', sp.dogFace === 'hund');
    if (!quiet && !recent('hund')) toss([dog], DOG_MS);
    u.shown.dogRolls = sp.dogRolls;
  }
  let note = '';
  if (!sp.done) {
    note = sp.dogRolls ? 'Hütte. Noch kein Hund.' : 'Noch nicht gewürfelt.';
    if (sp.auto > 0 && sp.dog !== game.me) note = 'Der Hund würfelt von allein.';
  }
  box.querySelector('[data-dognote]').textContent = note;

  const btn = box.querySelector('[data-tap]');
  if (sp.done) btn?.remove();
  const wuff = box.querySelector('[data-wuff]');
  wuff.hidden = !sp.done;
  const result = box.querySelector('[data-result]');
  if (sp.done) {
    const you = sp.by === game.me;
    result.textContent = `${you ? 'Du hast' : `${game.name(sp.by)} hat`} ${nutsText(sp.nuts)} ergattert.`;
    box.querySelector('[data-count]').hidden = true;
  }
}

// Countdown nach Serverzeit; danach wird regelmäßig nachgefragt, damit der Hund notfalls von allein rollt.
function startClock(box, sp, game, signal) {
  const count = box.querySelector('[data-count]');
  const btn = box.querySelector('[data-tap]');
  let shown = null;
  const step = () => {
    const left = sp.startsAt - game.now();
    const text = left > 0 ? String(Math.ceil(left / 1000)) : left > -700 ? 'Los!' : '';
    if (btn) btn.disabled = left > 0;
    if (text === shown) return;
    shown = text;
    count.textContent = text;
    count.hidden = !text;
    if (text && !game.reducedMotion) {
      count.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  };
  step();
  const clock = setInterval(step, 80);
  const poll = setInterval(() => game.now() > sp.startsAt && game.refresh(), 700);
  signal.addEventListener('abort', () => {
    clearInterval(clock);
    clearInterval(poll);
  });
}

// Tippen im Wettlauf: sofort sichtbar würfeln, gesammelt an den Server schicken (eine Anfrage zur Zeit).
function tap(box, game, u, role) {
  const sp = u.race;
  if (!sp || sp.done || !role) return;
  const now = game.now();
  if (now < sp.startsAt) return;
  const gap = role === 'sonder' ? NUT_MS : DOG_MS;
  if (now - u.lastTap < gap) return; // die Würfel sind noch in der Luft
  u.lastTap = now;
  u.role = role;
  u.tossAt = performance.now();
  if (!game.reducedMotion) {
    toss(role === 'sonder' ? [...box.querySelectorAll('.adn-sp-dice .adn-fdie')] : [box.querySelector('[data-dog]')], gap);
  }
  u.pending++;
  flush(game, u, role);
}

async function flush(game, u, role) {
  const sp = u.race;
  if (u.inflight || !u.pending || !sp || sp.done) return;
  u.inflight = true;
  const n = Math.min(u.pending, 6);
  u.pending = 0;
  try {
    await game.send(role, { id: sp.id, n });
  } finally {
    u.inflight = false;
  }
  flush(game, u, role);
}

function toss(nodes, ms) {
  nodes.forEach((n, i) => {
    const dir = i % 2 ? 1 : -1;
    n.animate(
      [
        { transform: `translateY(-10px) rotate(${dir * 200}deg) scale(.7)`, opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: ms - 40, delay: i * 18, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  });
}

// --- Bewegung zwischen den Bereichen ---

function animate(root, s, game, fx) {
  const signal = game.signal;

  // Nach einem Wurf fliegen die Nüsse einzeln in den Topf.
  if (fx.rolled && s.phase === 'entscheiden') {
    const potNum = root.querySelector('[data-pot]');
    const target = root.querySelector('.adn-potbox svg');
    let shown = Number(potNum.textContent);
    [...root.querySelectorAll('.adn-die.rolled')]
      .filter((d) => s.dice[d.dataset.slot] === 'nuss')
      .forEach((d, k) =>
        fly(root, d, target, {
          delay: 860 + k * 90,
          duration: 520,
          signal,
          onArrive: () => {
            potNum.textContent = ++shown;
            potNum.animate([{ transform: 'scale(1.2)' }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
          },
        }),
      );
  }

  // Gesicherte oder in der Sonderrunde ergatterte Nüsse fliegen zur Anzeige, der Balken wächst mit.
  for (const p of s.players) {
    const from = fx.prev.scores[p.id];
    const to = s.scores[p.id];
    if (from === to) continue;
    const row = root.querySelector(`.adn-row[data-id="${p.id}"]`);
    const score = row.querySelector('[data-score]');
    const source = fx.raceEnd ? root.querySelector('[data-nuts]') : root.querySelector('.adn-tray');
    const start = fx.raceEnd ? 900 : 0;
    const k = Math.min(to - from, 8);
    for (let j = 0; j < k; j++) fly(root, source, score, { delay: start + j * 60, duration: 560, signal });
    countUp(score, from, to, start + 400, 380 + k * 60, signal);
    row.querySelector('.adn-track i').animate(
      [{ transform: `scaleX(${Math.min(1, from / s.target)})` }, { transform: `scaleX(${Math.min(1, to / s.target)})` }],
      { delay: start + 400, duration: 420 + k * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    );
  }
}

function fly(root, from, to, { delay, duration, signal, onArrive }) {
  const r = root.getBoundingClientRect();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2 - r.left;
  const y0 = a.top + a.height / 2 - r.top;
  const dx = b.left + b.width / 2 - r.left - x0;
  const dy = b.top + b.height / 2 - r.top - y0;
  const nut = document.createElement('span');
  nut.className = 'adn-fly';
  nut.innerHTML = ICON.nuss;
  nut.style.left = `${x0}px`;
  nut.style.top = `${y0}px`;
  root.append(nut);
  const lift = Math.min(60, Math.abs(dx) * 0.3 + 30); // im Bogen
  nut
    .animate(
      [
        { transform: 'translate(-50%, -50%) scale(.5)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0.9 },
      ],
      { duration, delay, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'backwards' },
    )
    .finished.then(
      () => {
        nut.remove();
        onArrive?.();
      },
      () => nut.remove(),
    );
  signal.addEventListener('abort', () => nut.remove());
}

function countUp(node, from, to, delay, duration, signal) {
  if (from === to) return;
  node.textContent = from;
  const start = performance.now() + delay;
  const step = (t) => {
    if (signal.aborted) return;
    const p = Math.min(1, Math.max(0, (t - start) / duration));
    node.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function rulesHTML(s) {
  return `<details class="adn-rules">
    <summary>Regeln</summary>
    <ol>
      <li>Wer dran ist, würfelt mit fünf Eichhörnchenwürfeln. Jeder hat drei Seiten Nuss, zwei Eichhörnchen und einen Tannenhäher.</li>
      <li>Jede Nuss zählt für diese Runde. Tannenhäher bleiben liegen, mit den übrigen Würfeln darf man weiterwürfeln.</li>
      <li>Nach jedem Wurf heißt es: weiterwürfeln oder die Nüsse sichern.</li>
      <li>Ist in einem Wurf keine Nuss dabei, sind die Nüsse der Runde weg.</li>
      <li>Zeigen dabei alle Würfel Eichhörnchen, heißt es „Auf die Nüsse!“. Wer dran war, würfelt so schnell es geht mit allen fünf Würfeln und sammelt jede Nuss. Der andere würfelt seinen Hundewürfel, bis der Hund kommt. Dann zählen die gesammelten Nüsse.</li>
      <li>Würfelt der andere nicht selbst, rollt sein Hund nach kurzer Zeit von allein.</li>
      <li>Wer zuerst ${word(s.target)} Nüsse hat, gewinnt.</li>
    </ol>
  </details>`;
}

export const style = `
  .adn { position: relative; display: grid; gap: 16px; width: 100%; max-width: 560px; }

  /* ---------- Anzeige: Nüsse auf dem Weg zum Ziel ---------- */
  .adn-board { display: grid; gap: 12px; padding-top: 12px; border-top: 2px solid var(--line); }
  .adn-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 4px 12px; }
  .adn-name {
    display: flex; align-items: baseline; gap: 8px; min-width: 0;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    color: var(--muted); font-weight: 700;
  }
  .adn-row.is-turn .adn-name { color: var(--ink); }
  .adn-score { color: var(--pc); font: 800 var(--t-2xl) / .9 var(--font-display); font-variant-numeric: tabular-nums; }
  .adn-track { grid-column: 1 / -1; position: relative; height: 6px; overflow: hidden; border-radius: var(--radius); background: var(--hairline); }
  .adn-track i { position: absolute; inset: 0; background: var(--pc); transform-origin: left; }
  .adn-goal { color: var(--muted); font-size: var(--t-sm); }
  .adn-row.intro { animation: adn-rise 420ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 90ms); }
  .adn-goal.intro { animation: adn-rise 420ms cubic-bezier(.2,.8,.2,1) 180ms both; }
  @keyframes adn-rise { from { opacity: 0; transform: translateY(8px); } }

  /* Spielende: der Sieger tritt hervor, der Rest zurück */
  .adn-row.lose { opacity: .45; }
  .adn-row.just-ended.lose { animation: adn-recede 420ms ease-out 1100ms both; }
  .adn-row.just-ended.win .adn-score { animation: adn-win 520ms cubic-bezier(.2,.8,.2,1) 1000ms both; }
  @keyframes adn-recede { from { opacity: 1; } }
  @keyframes adn-win { 40% { transform: scale(1.22); } }

  /* ---------- Topf ---------- */
  .adn-pot:empty, .adn-bar:empty, .adn-last:empty, .adn-race:empty { display: none; }
  .adn-potbox { display: flex; align-items: center; gap: 10px; }
  .adn-potbox > svg { flex: none; width: 34px; height: 34px; }
  .adn-potbox b { position: relative; font: 800 var(--t-3xl) / 1 var(--font-display); font-variant-numeric: tabular-nums; }
  .adn-potbox > span { color: var(--muted); }
  .adn-potbox.lost b { color: var(--muted); }
  .adn-strike { position: absolute; left: -12%; top: 30%; width: 124%; height: 40%; overflow: visible; }
  .adn-strike path { fill: none; stroke: var(--bad); stroke-width: 5; stroke-linecap: square; }
  .adn-potbox.striking .adn-strike path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: adn-draw 300ms cubic-bezier(.6,0,.2,1) 950ms forwards; }
  @keyframes adn-draw { to { stroke-dashoffset: 0; } }

  /* ---------- Würfeltisch ---------- */
  .adn-tray { display: flex; justify-content: center; gap: 10px; padding: 16px 0 20px; border-bottom: 1px solid var(--hairline); }
  .adn-die {
    --s: 52px; --h: calc(var(--s) / 2);
    position: relative; width: var(--s); height: var(--s);
    perspective: 340px;
    transform: rotate(var(--rz));
    transition: opacity 220ms ease-out;
  }
  .adn-lift { width: 100%; height: 100%; transform-style: preserve-3d; }
  .adn-cube { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
  .adn-face {
    position: absolute; inset: 0; display: grid; place-items: center;
    border: 1.6px solid var(--ink); border-radius: 18%; background: var(--paper);
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .adn-face svg { width: 84%; height: 84%; }
  /* Innere Flächen füllen die runden Ecken, solange sich der Würfel dreht */
  .adn-core { position: absolute; inset: 2px; border-radius: 18%; background: var(--ink); visibility: hidden; }
  .adn-core-x { transform: rotateX(90deg); }
  .adn-core-y { transform: rotateY(90deg); }
  .adn-die.rolling .adn-core { visibility: visible; }

  /* Tannenhäher treten zur Seite und bleiben liegen */
  .adn-die.out { opacity: .38; transform: translateY(10px) rotate(var(--rz)) scale(.8); }
  .adn-die.going { animation: adn-out 420ms cubic-bezier(.6,0,.2,1) both; animation-delay: calc(980ms + var(--k) * 60ms); }
  @keyframes adn-out { from { opacity: 1; transform: rotate(var(--rz)); } }
  .adn-tray.stale .adn-die { opacity: .5; }
  .adn-tray.stale .adn-die.out { opacity: .25; }
  .adn-tray .adn-die.idle { opacity: .3; }
  .adn-die.intro { animation: adn-drop 520ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(120ms + var(--k) * 70ms); }
  @keyframes adn-drop { from { opacity: 0; transform: translateY(-22px) rotate(calc(var(--rz) - 30deg)) scale(1.12); } }
  .adn-tray.shaking .adn-die:not(.out) .adn-lift { animation: adn-shake 130ms ease-in-out infinite alternate; }
  .adn-tray.shaking .adn-die:nth-child(2n) .adn-lift { animation-delay: -65ms; }
  @keyframes adn-shake { from { transform: translateY(-2px) rotate(-7deg); } to { transform: translateY(1px) rotate(7deg); } }

  /* ---------- Knöpfe und letzte Runde ---------- */
  .adn-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
  .adn-note { flex: 1 1 100%; color: var(--muted); font-size: var(--t-sm); }
  .adn-last { font-size: var(--t-sm); }
  .adn-last.enter { animation: adn-rise 260ms cubic-bezier(.2,.8,.2,1); }

  /* ---------- Sonderrunde ---------- */
  .adn-sp { position: relative; display: grid; gap: 12px; padding: 14px 0 16px; border-top: 2px solid var(--line); border-bottom: 2px solid var(--line); }
  .adn-sp.arrive { animation: adn-sp-in 420ms cubic-bezier(.2,.8,.2,1) 900ms both; }
  .adn-sp.arrive .adn-sp-title { animation: adn-slam 380ms cubic-bezier(.2,.8,.2,1) 1000ms both; }
  @keyframes adn-sp-in { from { opacity: 0; transform: scale(.94); } }
  @keyframes adn-slam { from { opacity: 0; transform: scale(1.5); } }
  .adn-sp-title { font: 800 var(--t-3xl) / 1 var(--font-display); text-align: center; }
  .adn-lane { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; min-height: 52px; }
  .adn-lane + .adn-lane { padding-top: 10px; border-top: 1px solid var(--hairline); }
  .adn-lane-who { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }
  .adn-sp-dice { display: flex; gap: 4px; }
  .adn-fdie { display: grid; place-items: center; width: 30px; height: 30px; border: 1.5px solid var(--ink); border-radius: 18%; background: var(--paper); }
  .adn-fdie svg { width: 86%; height: 86%; }
  .adn-sp-dice .adn-fdie:not(.nut) { opacity: .55; }
  .adn-sp-num { min-width: 2.2ch; color: var(--a); font: 800 var(--t-2xl) / 1 var(--font-display); font-variant-numeric: tabular-nums; text-align: right; }
  .adn-dogdie { width: 48px; height: 48px; }
  .adn-dogdie.is-dog { border: 3px solid var(--b); }
  .adn-dognote { min-width: 9.5em; color: var(--muted); font-size: var(--t-sm); }
  .adn-tap { width: 100%; min-height: 64px; font: 800 var(--t-xl) / 1 var(--font-display); }
  .adn-tap:active:not(:disabled) { transform: scale(.97); }
  .adn-count {
    position: absolute; inset: 0; display: grid; place-items: center;
    background: color-mix(in srgb, var(--paper) 84%, transparent);
    font: 800 var(--t-4xl) / 1 var(--font-display);
    pointer-events: none;
  }
  .adn-sp-result:empty { display: none; }
  .adn-sp-result { font-weight: 700; text-align: center; }
  .adn-sp.done .adn-sp-dice { opacity: .6; }

  /* Der Hund ist da: Stempel */
  .adn-wuff {
    display: inline-block;
    padding: 4px 10px; border: 3px solid var(--b); border-radius: var(--radius-m);
    color: var(--b); font: 800 var(--t-xl) / 1 var(--font-display); white-space: nowrap;
    transform: rotate(-6deg);
  }
  .adn-wuff[hidden] { display: none; }
  .adn-sp.just-done .adn-wuff { animation: adn-stamp 360ms cubic-bezier(.2,.8,.2,1) both; }
  .adn-sp.just-done .adn-dogdie { animation: adn-dog 420ms cubic-bezier(.2,.8,.2,1) both; }
  .adn-sp.just-done .adn-sp-result { animation: adn-rise 320ms cubic-bezier(.2,.8,.2,1) 380ms both; }
  @keyframes adn-stamp { from { opacity: 0; transform: rotate(-6deg) scale(1.8); } }
  @keyframes adn-dog { 40% { transform: scale(1.25); } }

  /* Fliegende Nüsse */
  .adn-fly { position: absolute; z-index: 5; width: 22px; height: 22px; pointer-events: none; }
  .adn-fly svg { display: block; width: 100%; height: 100%; }

  /* ---------- Regeln ---------- */
  .adn-rules { padding-top: 10px; border-top: 1px solid var(--hairline); font-size: var(--t-sm); }
  .adn-rules summary {
    width: max-content; cursor: pointer; font-weight: 700;
    text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px;
  }
  .adn-rules ol { display: grid; gap: 4px; max-width: 60ch; margin-top: 8px; padding-left: 1.4em; list-style: decimal; }

  @media (min-width: 600px) {
    .adn-die { --s: 60px; }
    .adn-fdie { width: 36px; height: 36px; }
    .adn-dogdie { width: 56px; height: 56px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .adn *, .adn *::before, .adn *::after { animation: none !important; transition: none !important; }
    .adn .adn-strike path { stroke-dashoffset: 0 !important; }
  }
`;
