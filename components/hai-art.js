// Zeichnungen für den Hai (Skill „zeichnen“): der Kuscheltier-Hai, Flecken, Essen und Trinken, die Orte
// der Weltkarte als Bühnenbilder und die Karte selbst. Alles als SVG-Zeichenketten, ohne React, damit die
// Vorschau des Skills sie direkt laden kann.

export const INK = '#141414';
const C = {
  hai: '#9ba4a9',
  haiDark: '#838c91',
  haiLight: '#c4cbce',
  bauch: '#f3ede1',
  bauchDark: '#e1d8c5',
  naht: '#b7ab93',
  mund: '#d33a2c',
  mundInnen: '#6e2219',
  wange: '#ec9a8f',
  fleck: '#7a5d3f',
  fleckDark: '#5e4630',
};

// --- Der Hai (viewBox 0 0 170 124, schaut nach links) ---

const BODY =
  'M10 66 C12 50 34 34 66 31 C96 28 120 40 136 54 C139 60 138 67 132 73 C122 86 104 96 82 98 C54 100 28 92 16 80 C11 75 9 70 10 66 Z';
const BELLY = 'M10 66 C20 60 36 58 50 64 C66 71 76 84 82 98 C54 100 28 92 16 80 C11 75 9 70 10 66 Z';
const TAIL = 'M124 57 C133 49 143 37 151 22 C157 23 160 30 158 38 C156 48 153 56 149 62 C155 66 159 72 160 79 C157 83 151 83 145 80 C138 77 131 75 124 72 Z';
const DORSAL = 'M58 34 C64 24 72 12 84 4 C88 4 90 7 89 11 C88 20 91 28 97 35 Z';
const FIN_FAR = 'M86 90 C93 98 101 104 110 107 C112 105 111 101 108 97 C105 93 101 90 97 86 Z';
const FIN_NEAR = 'M49 85 C48 96 52 106 59 114 C62 117 66 116 67 112 C70 104 72 96 72 88 C64 83 56 83 49 85 Z';

// Mund und Augen je nach Stimmung (alle gezeichnet, CSS zeigt die passende: data-mund, data-auge)
const MOUTHS = {
  froh: `<path d="M16 70 C22 77.5 31 79.5 39.5 76.5" fill="none" stroke="${C.mund}" stroke-width="3.6" stroke-linecap="round"/>`,
  mittel: `<path d="M17 72 C23 76 30 77.5 38 76.5" fill="none" stroke="${C.mund}" stroke-width="3.6" stroke-linecap="round"/>`,
  traurig: `<path d="M18 77 C23 73 30 72.5 38 75.5" fill="none" stroke="${C.mund}" stroke-width="3.6" stroke-linecap="round"/>`,
  auf: `<path d="M15.5 69.5 C23 72 31 74 39.5 73.5 C39 81 31.5 87 24 84 C19 82 16 76 15.5 69.5 Z" fill="${C.mundInnen}" stroke="${C.mund}" stroke-width="2.8" stroke-linejoin="round"/><path d="M21.5 81.5 C25.5 79 31.5 79.5 35 82.5 C31.5 85.5 25.5 85.5 21.5 81.5 Z" fill="#e2675a"/>`,
  baeh: `<path d="M17 74 Q20.5 70.5 24 74 T31 74 T38 74" fill="none" stroke="${C.mund}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  schlaf: `<path d="M20 73 C24 76 29 77 34 76" fill="none" stroke="${C.mund}" stroke-width="3.4" stroke-linecap="round"/>`,
};
const EYES = {
  auf: `<circle cx="33" cy="51" r="3.6" fill="${INK}"/><circle cx="31.8" cy="49.8" r="1.15" fill="#fff"/>`,
  froh: `<path d="M28.8 53 Q33 47.5 37.2 53" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  zu: `<path d="M28.8 51.5 Q33 55.5 37.2 51.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  muede: `<circle cx="33" cy="52" r="3.4" fill="${INK}"/><circle cx="31.6" cy="52.6" r="1" fill="#fff"/><path d="M28.6 47.6 L38.2 47.6 L37.8 52.6 C35 50.8 31.8 49.6 28.6 49.6 Z" fill="${C.hai}"/><path d="M28.4 49.5 C31.8 49.5 35 50.7 37.9 52.8" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/><path d="M38.4 56.4 Q41 60.2 41 61.6 A2.6 2.6 0 0 1 35.8 61.6 Q35.8 60.2 38.4 56.4 Z" fill="#5a8fc8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
};

// Stellen für Flecken (Koordinaten im Hai, r = Größe), Reihenfolge mischt der Zustand (stainOrder)
export const SPOTS = [
  { x: 58, y: 46, r: 9 },
  { x: 88, y: 41, r: 8 },
  { x: 112, y: 57, r: 8.5 },
  { x: 80, y: 64, r: 9.5 },
  { x: 103, y: 80, r: 8 },
  { x: 33, y: 86, r: 7.5 },
  { x: 58, y: 88, r: 8.5 },
  { x: 125, y: 66, r: 6.5 },
];

/** Unregelmäßiger Klecks um (x, y), immer gleich für dieselbe Nummer. */
export function blob(x, y, r, n) {
  const k = 7;
  const pts = Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2 + n;
    const rr = r * (0.72 + 0.28 * Math.abs(Math.sin(n * 3.1 + i * 1.7)));
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8];
  });
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let d = `M${f(mid(pts[k - 1], pts[0]))}`;
  for (let i = 0; i < k; i++) d += ` Q${f(pts[i])} ${f(mid(pts[i], pts[(i + 1) % k]))}`;
  return `${d} Z`;
}

/** Ein Fleck mit Spritzern als Gruppe (data-fleck = Nummer der Stelle). */
export function stain(i) {
  const s = SPOTS[i];
  const drops = [0, 1].map((j) => {
    const a = i * 2.3 + j * 2.6;
    const d = s.r + 3 + j * 1.5;
    return `<circle cx="${(s.x + Math.cos(a) * d).toFixed(1)}" cy="${(s.y + Math.sin(a) * d * 0.8).toFixed(1)}" r="${1.3 - j * 0.3}" fill="${C.fleck}"/>`;
  });
  return `<g class="hai-fleck" data-fleck="${i}"><path d="${blob(s.x, s.y, s.r, i + 1)}" fill="${C.fleck}" opacity=".9"/><path d="${blob(s.x - 1, s.y - 1, s.r * 0.45, i + 4)}" fill="${C.fleckDark}" opacity=".55"/>${drops.join('')}</g>`;
}

// Kleine Schlingen wie bei Frottee, nur angedeutet
const TERRY = [
  [48, 40],
  [68, 36],
  [92, 35],
  [110, 45],
  [62, 52],
  [84, 51],
  [100, 64],
  [120, 58],
  [74, 70],
  [112, 74],
]
  .map(([x, y]) => `<path d="M${x - 1.8} ${y} a1.8 1.8 0 0 0 3.6 0" />`)
  .join('');

/**
 * Der Hai als <g> (ohne äußeres svg). Teile mit Klassen, damit die Seite sie einzeln bewegen kann:
 * hai-tail, hai-dorsal, hai-fin, hai-body, hai-eye, hai-mouth, hai-stains (für die Flecken).
 */
export function shark({ stains = '', eye, mouth, cheek = true } = {}) {
  const eyes = Object.entries(EYES)
    .filter(([k]) => !eye || k === eye)
    .map(([k, d]) => `<g class="hai-eye" data-auge="${k}">${d}</g>`)
    .join('');
  const mouths = Object.entries(MOUTHS)
    .filter(([k]) => !mouth || k === mouth)
    .map(([k, d]) => `<g class="hai-mouth" data-mund="${k}">${d}</g>`)
    .join('');
  return `<g class="hai-figure">
  <g class="hai-tail"><path d="${TAIL}" fill="${C.hai}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M149 62 C144 63 136 64 129 64" fill="none" stroke="${C.haiDark}" stroke-width="1.2" stroke-linecap="round"/></g>
  <g class="hai-dorsal"><path d="${DORSAL}" fill="${C.hai}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M81 12 C80 18 81 25 85 31" fill="none" stroke="${C.haiDark}" stroke-width="1.2" stroke-linecap="round"/></g>
  <g class="hai-fin-far"><path d="${FIN_FAR}" fill="${C.haiDark}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></g>
  <g class="hai-body">
    <path d="M108 89 L110.5 99 L117.5 97.2 L115 88 Z" fill="#fff" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/><path d="M110.6 94 L115.8 92.7 M111.3 96.6 L116.6 95.2" stroke="${C.mund}" stroke-width=".9"/>
    <path d="${BODY}" fill="${C.hai}"/>
    <path d="M136 54 C139 60 138 67 132 73 C122 86 104 96 82 98 C99 91 114 82 124 70 C129 64 132 59 136 54 Z" fill="${C.haiDark}"/>
    <path d="${BELLY}" fill="${C.bauch}"/>
    <path d="M82 98 C54 100 28 92 16 80 C28 87 48 92 68 92 C74 94 78 96 82 98 Z" fill="${C.bauchDark}"/>
    <g fill="none" stroke="${C.haiDark}" stroke-width="1.1" stroke-linecap="round" opacity=".7">${TERRY}</g>
    <path d="M22 46 C30 39 42 35 54 34" fill="none" stroke="${C.haiLight}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M13.5 69 C22 63.5 36 62 48.5 67.5 C62.5 74 72 85 77.5 96.5" fill="none" stroke="${C.naht}" stroke-width="1.2" stroke-dasharray="2.2 2.4" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <g class="hai-stains">${stains}</g>
    ${cheek ? `<ellipse class="hai-cheek" cx="44.5" cy="71" rx="4.2" ry="2.5" fill="${C.wange}"/>` : ''}
    ${eyes}
    ${mouths}
  </g>
  <g class="hai-fin"><path d="${FIN_NEAR}" fill="${C.hai}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M56 89 C56 97 58 104 62 110" fill="none" stroke="${C.haiDark}" stroke-width="1.2" stroke-linecap="round"/></g>
</g>`;
}

/** Der Hai als eigenständiges kleines Bild (Startseite, Karte). mood: froh | mittel | traurig | schlaf */
export function sharkSvg(mood = 'froh', className = '') {
  const eye = mood === 'schlaf' ? 'zu' : mood === 'traurig' ? 'muede' : 'auf';
  return `<svg class="hai-pic ${className}" viewBox="4 0 160 124" aria-hidden="true">${shark({ eye, mouth: mood, cheek: mood === 'froh' })}</svg>`;
}

// --- Essen und Trinken (viewBox 0 0 40 40, Licht oben links) ---
// Getränke haben eine Gruppe .hai-liquid, die beim Trinken sinkt.

const heartPath = 'M0 3.2 C-1.6 0.4 -5.6 0.6 -5.6 -2.6 C-5.6 -5 -2.6 -6.2 0 -3.4 C2.6 -6.2 5.6 -5 5.6 -2.6 C5.6 0.6 1.6 0.4 0 3.2 Z';
export const heart = (x, y, s = 1, fill = C.mund, stroke = INK) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="${heartPath}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${(1.2 / s).toFixed(2)}" stroke-linejoin="round"` : ''}/>`;

const ln = (d, color, w = 1) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const sh = (d, fill, w = 1.6) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;

// Ein Glas (Wasser, Milch, Apfelsaft, Lassi): Flüssigkeit, Glanz, Kontur
function glass(liquid, top, extra = '', { tall = false } = {}) {
  const [x1, x2, y1, b1, b2] = tall ? [12, 28, 5, 14.5, 25.5] : [10, 30, 8, 13, 27];
  const lv = y1 + 7;
  const at = (y) => x1 + ((b1 - x1) * (y - y1)) / (35 - y1);
  const atR = (y) => x2 - ((x2 - b2) * (y - y1)) / (35 - y1);
  return `<path d="M${x1} ${y1} L${x2} ${y1} L${b2} 35 L${b1} 35 Z" fill="#eef4f6"/>
<g class="hai-liquid"><path d="M${at(lv).toFixed(1)} ${lv} L${atR(lv).toFixed(1)} ${lv} L${b2 - 0.6} 34.3 L${b1 + 0.6} 34.3 Z" fill="${liquid}"/><ellipse cx="20" cy="${lv}" rx="${((atR(lv) - at(lv)) / 2).toFixed(1)}" ry="1.6" fill="${top}"/></g>
${ln(`M${x1 + 3} ${y1 + 4} L${b1 + 2.4} 31`, '#fff', 1.8)}
${extra}
<path d="M${x1} ${y1} L${x2} ${y1} L${b2} 35 L${b1} 35 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
<ellipse cx="20" cy="${y1}" rx="${(x2 - x1) / 2}" ry="1.4" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
}

export const FOOD_ART = {
  fischstaebchen: `<g transform="rotate(-14 20 21)">${[
    [6, 24, 28],
    [8, 16.5, 26],
    [6, 9, 27],
  ]
    .map(
      ([x, y, w]) =>
        `${sh(`M${x + 2.5} ${y} H${x + w - 2.5} Q${x + w} ${y} ${x + w} ${y + 3.5} Q${x + w} ${y + 7} ${x + w - 2.5} ${y + 7} H${x + 2.5} Q${x} ${y + 7} ${x} ${y + 3.5} Q${x} ${y} ${x + 2.5} ${y} Z`, '#dc9b3f', 1.5)}${ln(`M${x + 3} ${y + 1.6} H${x + w - 4}`, '#f2c477', 1.3)}<circle cx="${x + 7}" cy="${y + 4.6}" r=".7" fill="#a86a22"/><circle cx="${x + 15}" cy="${y + 5}" r=".7" fill="#a86a22"/><circle cx="${x + 21}" cy="${y + 4.2}" r=".7" fill="#a86a22"/>`,
    )
    .join('')}${sh('M30.4 9.4 Q33 9.4 33 12.5 Q33 15.6 30.4 15.6 Q29 12.5 30.4 9.4 Z', '#f7f0e0', 1.2)}</g>`,
  apfel: `${ln('M20 12 C20 9 21 6 23.5 3.5', '#6b4a2b', 2)}${sh('M21.5 8.6 C24 4.4 29 3.8 31.4 5.2 C29.6 8.6 25.4 9.8 21.5 8.6 Z', '#5f8f4e', 1.2)}${ln('M22.5 8.2 C25.5 7 28 6 30.5 5.4', '#3f6b35', 0.8)}
<path d="M20 12 C14 8 6 11 6 20 C6 29 12 35 17 35 C18.5 35 19 34 20 34 C21 34 21.5 35 23 35 C28 35 34 29 34 20 C34 11 26 8 20 12 Z" fill="${C.mund}"/>
<path d="M33.9 18.5 C34.5 28 28.4 35 23 35 C21.5 35 21 34 20 34 C24 33 30.5 28 33.9 18.5 Z" fill="#a92a1f"/>
${ln('M10.5 17 C11.5 14 13.5 12.5 16 12.2', '#fff', 1.6)}
<path d="M20 12 C14 8 6 11 6 20 C6 29 12 35 17 35 C18.5 35 19 34 20 34 C21 34 21.5 35 23 35 C28 35 34 29 34 20 C34 11 26 8 20 12 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  spaghetti: `<ellipse cx="20" cy="27" rx="17.5" ry="8" fill="#fff" stroke="${INK}" stroke-width="1.6"/><ellipse cx="20" cy="27" rx="12.5" ry="5.2" fill="none" stroke="#d6d6d6" stroke-width="1"/>
${sh('M7.5 26 C8 17 14 12 20 12 C26 12 32 17 32.5 26 C26 29.5 14 29.5 7.5 26 Z', '#f0d07a', 1.4)}
<g fill="none" stroke="#c9a04a" stroke-width="1" stroke-linecap="round"><path d="M10 24 C12 18 17 16 21 18 C25 20 22 25 17 24"/><path d="M14 27 C14 22 19 20 24 22 C29 24 28 27 25 27.6"/><path d="M27 18 C30 20 31 23 29.5 25.5"/><path d="M11 21 C13 15.5 19 14 24 15"/></g>
${sh('M13.5 17.5 C14 13.5 18 12 21 13 C24.5 12 27.5 14.5 26.5 18 C27 21 23.5 22.5 20.5 21.5 C17 23 13 21 13.5 17.5 Z', '#c8382a', 1.3)}
${sh('M17 16.5 A3.4 3.2 0 1 1 23.8 16.5 A3.4 3.2 0 1 1 17 16.5 Z', '#8a4b2a', 1.2)}${ln('M18.4 15 Q19.4 14 20.6 14', '#c27b4f', 1)}`,
  wasser: glass('#a9cde3', '#c9e1ee', '<circle cx="23" cy="26" r="1" fill="#fff"/><circle cx="18.5" cy="30" r=".8" fill="#fff"/><circle cx="21.5" cy="21" r=".7" fill="#fff"/>'),
  milch: glass('#f7f2e4', '#e6dbc2', ''),
  apfelsaft: glass('#e7a93c', '#f2c56a', `${sh('M26 9.5 A6 6 0 0 1 33.5 3.6 L29.6 9 Z', '#f6e7b8', 1.2)}${ln('M26.6 8.6 A5 5 0 0 1 32.7 4.3', C.mund, 1.3)}`),
  croissant: [
    ['7.5', '26', 4.6, 3.4, 40],
    ['32.5', '26', 4.6, 3.4, -40],
    ['12', '19.5', 6.2, 5.2, 30],
    ['28', '19.5', 6.2, 5.2, -30],
    ['20', '16.5', 7.2, 6.6, 0],
  ]
    .map(
      ([x, y, rx, ry, r]) =>
        `<g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#d9963f" stroke="${INK}" stroke-width="1.4"/><path d="M${x - rx * 0.5} ${y - ry * 0.45} Q${x} ${y - ry * 0.9} ${Number(x) + rx * 0.45} ${y - ry * 0.5}" fill="none" stroke="#f0c27a" stroke-width="1.3" stroke-linecap="round"/><path d="M${x - rx * 0.6} ${Number(y) + ry * 0.5} Q${x} ${Number(y) + ry * 0.85} ${Number(x) + rx * 0.6} ${Number(y) + ry * 0.5}" fill="none" stroke="#b5702a" stroke-width="1" stroke-linecap="round"/></g>`,
    )
    .join(''),
  pizza: `${sh('M6 10 Q20 5 34 10 L20.5 36 Q20 36.6 19.5 36 Z', '#f2c94c')}
${sh('M5.2 10.4 Q20 3.8 34.8 10.4 L33.4 13.4 Q20 7.8 6.6 13.4 Z', '#d18a3b', 1.4)}${ln('M8 9.6 Q20 4.8 32 9.6', '#eab06a', 1.2)}
${[
  [14, 17, 3],
  [24, 18, 3.2],
  [19, 26, 2.8],
]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#c0392b" stroke="${INK}" stroke-width="1.1"/><circle cx="${x - 0.8}" cy="${y - 0.6}" r=".55" fill="#f2c94c"/><circle cx="${x + 1}" cy="${y + 0.8}" r=".5" fill="#f2c94c"/>`)
  .join('')}
${sh('M27.6 22.2 Q29.5 25.5 28 27.5 Q26.6 25.4 27.6 22.2 Z', '#f2c94c', 1.1)}<circle cx="11.5" cy="22" r=".8" fill="#5f8f4e"/><circle cx="22" cy="31" r=".7" fill="#5f8f4e"/>`,
  datteln: [
    [-28, 13, 20],
    [28, 27, 20],
    [0, 20, 22],
  ]
    .map(
      ([r, x, y]) =>
        `<g transform="rotate(${r} ${x} ${y})">${sh(`M${x} ${y - 11} C${x + 5} ${y - 11} ${x + 5.5} ${y + 11} ${x} ${y + 11} C${x - 5.5} ${y + 11} ${x - 5} ${y - 11} ${x} ${y - 11} Z`, '#7a4425', 1.4)}${ln(`M${x - 2} ${y - 6} C${x - 2.8} ${y - 2} ${x - 2.8} ${y + 2} ${x - 2} ${y + 5}`, '#b06c3e', 1.3)}${ln(`M${x + 1} ${y - 2} q1.6 1.5 0 3 M${x + 1.2} ${y + 3.5} q1.4 1.3 0 2.6`, '#4f2a15', 0.8)}<path d="M${x - 2} ${y - 10.6} Q${x} ${y - 13.4} ${x + 2} ${y - 10.6} Z" fill="#c9a46a" stroke="${INK}" stroke-width=".9"/></g>`,
    )
    .join(''),
  banane: `${sh('M8.6 9.4 C8.6 23 16 33 30 34 C33.2 34.2 35.6 32.6 35.6 30.4 C25 28.4 18.6 21.6 15.4 10 C14.8 7.8 8.8 7.4 8.6 9.4 Z', '#f2c94c')}
<path d="M35.6 30.4 C25 28.4 18.6 21.6 15.4 10 C17.8 19.6 24.2 25.6 34.2 28.2 C35 28.8 35.6 29.6 35.6 30.4 Z" fill="#d9a521"/>
${ln('M11 12.5 C12 22 17.4 29.4 26.6 32', '#f8e3a0', 1.6)}${ln('M12.4 10.2 C13.6 19.6 19.4 27.6 31 31.4', '#d9a521', 0.9)}
<path d="M9 9.4 L8.2 5.8 L11.2 5.2 L12.9 8.8 Z" fill="#6b4a2b" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="34.4" cy="31.6" r="1.1" fill="#4f3a24"/>
<path d="M8.6 9.4 C8.6 23 16 33 30 34 C33.2 34.2 35.6 32.6 35.6 30.4 C25 28.4 18.6 21.6 15.4 10 C14.8 7.8 8.8 7.4 8.6 9.4 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  lassi: glass(
    '#f0a830',
    '#f7d27a',
    `${ln('M24 2.5 L21.5 20', '#fff', 2.6)}${ln('M24 2.5 L21.5 20', C.mund, 2.6)}<path d="M23.8 4 L23.5 6.2 M23.3 8.6 L23 10.8 M22.7 13.2 L22.4 15.4" stroke="#fff" stroke-width="2.4"/>${ln('M24.1 2.6 L21.6 20', INK, 0.6)}${sh('M27 9.6 C27 5.6 33 4.6 34.6 7.6 C32.8 9.6 29.4 10.2 27 9.6 Z', '#f0a830', 1.2)}`,
    { tall: true },
  ),
  tee: `<ellipse cx="20" cy="33" rx="15" ry="3.6" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
${ln('M15 12 C13 9 17 7 15 4', '#9aa3a8', 1.3)}${ln('M21 11 C19 8 23 6 21 3', '#9aa3a8', 1.3)}${ln('M27 12 C25 9 29 7 27 4', '#9aa3a8', 1.3)}
<path d="M7 16 L33 16 C33 26 28 32.5 20 32.5 C12 32.5 7 26 7 16 Z" fill="#fbfaf6"/>
<g class="hai-liquid"><ellipse cx="20" cy="16" rx="13" ry="2.6" fill="#c2b25a"/></g>
${ln('M10 22 H30', '#3a6b98', 1.6)}<path d="M11 25.5 q2 -2 4 0 t4 0 t4 0 t4 0 t3 0" fill="none" stroke="#3a6b98" stroke-width="1.1"/>
${ln('M10.5 18.5 C11 24 13.6 28.6 17 30.4', '#fff', 1.6)}
<path d="M7 16 L33 16 C33 26 28 32.5 20 32.5 C12 32.5 7 26 7 16 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="20" cy="16" rx="13" ry="2.6" fill="none" stroke="${INK}" stroke-width="1.2"/>`,
  onigiri: `${sh('M20 6 C23 6 25 8 26.6 11 L33.6 24.6 C35.8 29 33.6 33 28.6 33 L11.4 33 C6.4 33 4.2 29 6.4 24.6 L13.4 11 C15 8 17 6 20 6 Z', '#fbfaf3')}
<g fill="none" stroke="#d9d4c3" stroke-width=".9" stroke-linecap="round"><path d="M16 13 a1.4 1.4 0 0 1 2.4 0"/><path d="M22 15 a1.4 1.4 0 0 1 2.4 0"/><path d="M12 22 a1.4 1.4 0 0 1 2.4 0"/><path d="M26.5 22 a1.4 1.4 0 0 1 2.4 0"/><path d="M18.5 19 a1.4 1.4 0 0 1 2.4 0"/></g>
${ln('M14.4 12.6 C16 9.6 17.6 8.4 19.6 8.2', '#fff', 1.4)}
${sh('M14 23.4 H26 V33 H14 Z', '#26302a', 1.3)}${ln('M16.5 25.5 V31.5 M20 25.5 V31.5 M23.5 25.5 V31.5', '#3d4a40', 0.8)}<circle cx="21" cy="17.5" r=".6" fill="#141414"/><circle cx="17.5" cy="20.5" r=".6" fill="#141414"/>`,
  melone: `${sh('M3.5 13 L36.5 13 A16.5 16.5 0 0 1 3.5 13 Z', '#4c8a4a')}
<path d="M6 13 L34 13 A14 14 0 0 1 6 13 Z" fill="#cfe0a8"/><path d="M7.6 13 L32.4 13 A12.4 12.4 0 0 1 7.6 13 Z" fill="#e2574c"/>
${ln('M9 15 L31 15', '#f08a7f', 1.4)}
${[
  [13, 18, -25],
  [20, 20, 0],
  [27, 18, 25],
  [16.5, 23.5, -15],
  [23.5, 23.5, 15],
]
  .map(([x, y, r]) => `<path transform="rotate(${r} ${x} ${y})" d="M${x} ${y - 1.8} Q${x + 1.2} ${y} ${x} ${y + 1.6} Q${x - 1.2} ${y} ${x} ${y - 1.8} Z" fill="#141414"/>`)
  .join('')}
<path d="M3.5 13 L36.5 13 A16.5 16.5 0 0 1 3.5 13 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  ananas: (() => {
    const cx = 20,
      cy = 26.5,
      rx = 9.5,
      ry = 10.5;
    const hatch = [];
    for (let k = -3; k <= 3; k++) {
      // Rauten: zwei Scharen schräger Linien, auf die Ellipse gekürzt
      for (const dir of [1, -1]) {
        const pts = [];
        for (let t = -1; t <= 1.0001; t += 0.02) {
          const x = cx + t * rx;
          const y = cy + dir * (t * rx * 0.9) + k * 5.2;
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 0.86) pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        if (pts.length > 1) hatch.push(`M${pts[0]} L${pts[pts.length - 1]}`);
      }
    }
    return `${sh('M20 16 L14 3.5 L18.4 9 L20 1.5 L21.6 9 L26 3.5 Z', '#5f8f4e', 1.3)}${sh('M20 17 L10 7.5 L17 11 Z', '#4c7a3e', 1.2)}${sh('M20 17 L30 7.5 L23 11 Z', '#4c7a3e', 1.2)}
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e9b53c"/>
<path d="M${cx + rx} ${cy} A${rx} ${ry} 0 0 1 ${cx} ${cy + ry} A${rx * 0.8} ${ry * 0.85} 0 0 0 ${cx + rx} ${cy} Z" fill="#c98f22"/>
<g stroke="#a8761a" stroke-width=".9" fill="none" stroke-linecap="round">${hatch.map((d) => `<path d="${d}"/>`).join('')}</g>
${ln('M13.4 22 C14 19.6 15.6 18 17.6 17.2', '#f8dd8a', 1.4)}
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  })(),
  pancakes: `<ellipse cx="20" cy="31.5" rx="17" ry="5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
${[26, 21, 16]
  .map(
    (y) =>
      `${sh(`M6.5 ${y} A13.5 4.2 0 0 0 33.5 ${y} V${y + 3.6} A13.5 4.2 0 0 1 6.5 ${y + 3.6} Z`, '#c88a3e', 1.3)}<ellipse cx="20" cy="${y}" rx="13.5" ry="4.2" fill="#e8b468" stroke="${INK}" stroke-width="1.3"/>`,
  )
  .join('')}
${sh('M9 15.6 C10 12.6 30 12.6 31 15.6 C31 17.6 29 18.4 28.4 21 C27.8 22.6 26.6 22.6 26.4 21 C26 18.8 22 19.6 20 19.6 C17 19.6 14 19.2 13.2 21.4 C12.8 23.6 11.2 23.6 11 21.4 C10.8 19.2 9 18 9 15.6 Z', '#9c5a1e', 1.2)}
${sh('M17 12.2 L22.6 11.4 L24 14.4 L18.4 15.2 Z', '#f6dc7a', 1.1)}${ln('M12 15 Q14 14 16 14.2', '#c27f43', 1.2)}`,
  taco: `<g transform="rotate(-8 20 22)">${sh('M5 19 Q7.5 11 12 14.5 Q14.5 8.5 19.5 12.5 Q24 8 27.5 13.5 Q32 10 35 19 Z', '#6aa84f', 1.3)}
<circle cx="12.6" cy="16" r="2.4" fill="#d33a2c" stroke="${INK}" stroke-width="1"/><circle cx="26.4" cy="15.4" r="2.4" fill="#d33a2c" stroke="${INK}" stroke-width="1"/>${ln('M17.6 14.6 L19.2 18.4 M22 14 L21 18', '#f2c94c', 1.7)}<path d="M8 18.6 Q20 16.4 32 18.6 L32 19.6 L8 19.6 Z" fill="#8a4b2a"/>
${sh('M4 19 H36 A16 15.5 0 0 1 4 19 Z', '#f0c25a')}
${ln('M7.6 22.6 C9.6 28.6 14.4 32 20 32.4', '#f9dc97', 1.5)}<circle cx="13.5" cy="25.5" r=".8" fill="#c28f2c"/><circle cx="22" cy="28.5" r=".8" fill="#c28f2c"/><circle cx="28.5" cy="23.5" r=".8" fill="#c28f2c"/><circle cx="17.5" cy="30" r=".7" fill="#c28f2c"/></g>`,
  kokos: `<circle cx="20" cy="24" r="13" fill="#7a5230"/>
<path d="M32.8 21.7 A13 13 0 0 1 13.5 35.3 C21 34.6 30 30 32.8 21.7 Z" fill="#5e3d22"/>
<g stroke="#a47a4e" stroke-width=".9" stroke-linecap="round"><path d="M10 24 l2 1.6"/><path d="M14 30 l2 1"/><path d="M26 30 l2 -1"/><path d="M29 22 l1.6 1.4"/><path d="M12.6 19 l2 .6"/></g>
${ln('M28.4 13.6 L33 2.6', '#fff', 2.6)}${ln('M28.4 13.6 L33 2.6', C.mund, 2.6)}<path d="M28.9 12.2 L29.7 10.4 M30.5 8.4 L31.3 6.6 M32 4.6 L32.6 3.4" stroke="#fff" stroke-width="2.4"/>
<ellipse cx="20" cy="14" rx="10" ry="3.4" fill="#fbf8ef" stroke="${INK}" stroke-width="1.3"/><g class="hai-liquid"><ellipse cx="20" cy="14.3" rx="7.4" ry="2.1" fill="#e6efe9"/></g>
${ln('M11.4 18.4 C12 21 13.4 23 15 24', '#a8825a', 1.3)}
<circle cx="20" cy="24" r="13" fill="none" stroke="${INK}" stroke-width="1.6"/>`,
  kakao: `${ln('M15 9 C13 6 17 4.5 15 1.8', '#9aa3a8', 1.3)}${ln('M22 9 C20 6 24 4.5 22 1.8', '#9aa3a8', 1.3)}
${sh('M29 15.5 C35 15 36 25 29 27', 'none', 2.6)}${ln('M29 15.5 C35 15 36 25 29 27', '#c0622b', 1.4)}
<path d="M9 11.5 L30 11.5 L29 33.5 C29 34.8 28 35.5 26.5 35.5 L12.5 35.5 C11 35.5 10 34.8 10 33.5 Z" fill="#c0622b"/>
<path d="M30 11.5 L29 33.5 C29 34.8 28 35.5 26.5 35.5 L24 35.5 C26 35 26.6 34 26.8 32.5 L27.6 11.5 Z" fill="#9c4c1f"/>
<g class="hai-liquid"><ellipse cx="19.5" cy="11.8" rx="10.2" ry="2.6" fill="#6b3f22"/></g>
<rect x="13.5" y="8.6" width="4.6" height="4" rx="1" fill="#fff" stroke="${INK}" stroke-width="1" transform="rotate(-12 15.8 10.6)"/><rect x="19.6" y="9" width="4.4" height="3.8" rx="1" fill="#fff" stroke="${INK}" stroke-width="1" transform="rotate(10 21.8 10.9)"/>
${heart(19.6, 23.5, 0.8, '#f3ede1', null)}
${ln('M12.4 15 L13 30', '#e08a52', 1.4)}
<path d="M9 11.5 L30 11.5 L29 33.5 C29 34.8 28 35.5 26.5 35.5 L12.5 35.5 C11 35.5 10 34.8 10 33.5 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="19.5" cy="11.5" rx="10.5" ry="2.6" fill="none" stroke="${INK}" stroke-width="1.2"/>`,
};

/** Essen oder Trinken als Bild. */
export const foodSvg = (id, className = '') =>
  `<svg class="hai-food ${className}" viewBox="0 0 40 40" aria-hidden="true">${FOOD_ART[id] ?? ''}</svg>`;

// --- Werkzeuge und Kleinigkeiten ---

export const SPONGE = `${sh('M4 15 Q4 12 7 12 H33 Q36 12 36 15 V30 Q36 33 33 33 H7 Q4 33 4 30 Z', '#e8c547')}
${sh('M4 15 Q4 12 7 12 H33 Q36 12 36 15 V19 H4 Z', '#5f8f4e', 1.4)}${ln('M7 14.6 H30', '#86b36f', 1.3)}
${[
  [10, 24, 1.4],
  [16, 28, 1.1],
  [22, 23.5, 1.6],
  [29, 27.5, 1.2],
  [13, 30.5, 0.8],
  [31, 22.6, 0.9],
  [25, 30.6, 0.9],
]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9a52c"/>`)
  .join('')}`;
export const spongeSvg = (className = '') =>
  `<svg class="${className}" viewBox="0 0 40 40" aria-hidden="true">${SPONGE}</svg>`;

export const MAP_ICON = `${sh('M5 9 L14 6 L26 10 L35 7 V31 L26 34 L14 30 L5 33 Z', '#f3ede1')}
<path d="M14 6 V30 M26 10 V34" stroke="${INK}" stroke-width="1.2"/>
<path d="M14 6 L26 10 V34 L14 30 Z" fill="#e1d8c5"/>
${ln('M7 26 C10 20 16 22 19 17 C21 14 25 15 28 18', C.mund, 1.4)}<path d="M7 26 L5 33" stroke="none"/>
${heart(30, 19.5, 0.55, C.mund, INK)}
<path d="M5 9 L14 6 L26 10 L35 7 V31 L26 34 L14 30 L5 33 Z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
export const mapIconSvg = (className = '') =>
  `<svg class="${className}" viewBox="0 0 40 40" aria-hidden="true">${MAP_ICON}</svg>`;
