// Zeichnungen fürs Tagesbild (Skill „zeichnen“): Werkzeuge der Malfläche, Herz, Rückseite der Blätter,
// Abreißkalender für Startseite und Seite. Inline-SVG als Zeichenketten, ohne React.
// Stift, Eimer, Radierer, Zurück, Vor und Leeren stammen aus games/kunstkritik.js.

export const INK = '#141414';
const WOOD = '#ecc995';
const WOOD_D = '#c99a5c';
const ROSE = '#e9a3a0'; // Radiergummi
const SLEEVE = '#3a6b98';
const BACK = '#f3efe6'; // Rückseite der Blätter
export const HEART = '#d7301f';
const SUN = '#f2b630';
const HILL = '#5f9b52';
const SKY = '#a3d0ef';

// Die aktuelle Farbe (--tb-cur) steckt in Stiftmine, Eimer, Klecks und den Formen.
const shapeStroke = (d, extra = '') =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" ${extra}/>
   <path d="${d}" fill="none" style="stroke:var(--tb-cur)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const handle = (x, y) => `<rect x="${x - 2.6}" y="${y - 2.6}" width="5.2" height="5.2" rx=".8" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;

export const ICON = {
  stift: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="rotate(45 20 20)">
    <path d="M15.5 9 H24.5 V31 H15.5 Z" fill="#fff"/>
    <path d="M20 10 V30" stroke-width=".9" opacity=".5"/>
    <path d="M15.5 9 L20 0.5 L24.5 9 Z" fill="${WOOD}"/>
    <path d="M17.6 5.2 L20 0.5 L22.4 5.2 Q20 6.2 17.6 5.2 Z" style="fill:var(--tb-cur)" stroke-width="1.2"/>
    <rect x="15.5" y="31" width="9" height="3" fill="#bdbdbd"/>
    <path d="M15.5 34 H24.5 V36 Q24.5 38.5 22 38.5 H18 Q15.5 38.5 15.5 36 Z" fill="${ROSE}"/>
  </g></svg>`,
  eimer: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <g transform="rotate(-40 23 19)">
      <path d="M13.5 14.5 Q23 1.5 32.5 14.5" fill="none"/>
      <path d="M13 14 L15.5 32 Q23 34.5 30.5 32 L33 14" fill="#fff"/>
      <path d="M14.3 23 Q23 25.5 31.7 23" fill="none" stroke-width="1"/>
      <ellipse cx="23" cy="14" rx="10" ry="3.2" style="fill:var(--tb-cur)"/>
    </g>
    <path d="M10.2 18 C 7.4 21.8, 9 27, 7.9 31.6" fill="none" style="stroke:var(--tb-cur)" stroke-width="3"/>
    <path d="M7.9 30.5 C 5.6 33.6, 6 37.3, 7.9 37.3 C 9.8 37.3, 10.3 33.6, 7.9 30.5 Z" style="fill:var(--tb-cur)" stroke-width="1.3"/>
  </g></svg>`,
  radierer: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="rotate(-35 20 21)">
    <rect x="6" y="14" width="28" height="13" rx="2" fill="${ROSE}"/>
    <path d="M17 14 H34 V27 H17 Z" fill="${SLEEVE}"/>
    <path d="M21 18.5 H30" stroke="#fff" stroke-width="1.2" opacity=".6"/>
    <path d="M6 22 H17"/>
  </g>
  <g fill="${INK}"><circle cx="9" cy="33.5" r="1"/><circle cx="12.5" cy="35.5" r=".8"/><circle cx="6.5" cy="36.5" r=".7"/></g></svg>`,
  linie: `<svg viewBox="0 0 40 40" aria-hidden="true">${shapeStroke('M8 31 L32 9')}${handle(8, 31)}${handle(32, 9)}</svg>`,
  rechteck: `<svg viewBox="0 0 40 40" aria-hidden="true">${shapeStroke('M7.5 11 H32.5 V29 H7.5 Z')}${handle(7.5, 11)}${handle(32.5, 29)}</svg>`,
  kreis: `<svg viewBox="0 0 40 40" aria-hidden="true">${shapeStroke('M20 8.5 A12.5 11.5 0 1 1 19.99 8.5 Z')}
    <path d="M7.5 8.5 H32.5 V31.5 H7.5 Z" fill="none" stroke="${INK}" stroke-width=".9" stroke-dasharray="2 2" opacity=".55"/>${handle(7.5, 8.5)}${handle(32.5, 31.5)}</svg>`,
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
  // Lupe mit Plus bzw. Minus, Griff aus Holz
  naeher: lens('M14 17 H24 M19 12 V22'),
  weiter: lens('M14 17 H24'),
  // Ganzes Bild: vier Ecken um ein kleines Blatt
  ganz: `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 13 V6 H13 M27 6 H34 V13 M34 27 V34 H27 M13 34 H6 V27"/></g>
    <rect x="13" y="13" width="14" height="14" rx="1" fill="#fff" stroke="currentColor" stroke-width="1.8"/>
    <path d="M15.5 23.5 L19 19.5 L21.5 22 L23 20.5 L25 23.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
};

function lens(sign) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
    <path d="M26.2 25.5 L34.5 33.8" stroke-width="7.6"/>
    <path d="M26.2 25.5 L34.5 33.8" stroke="${WOOD}" stroke-width="4.2"/>
    <circle cx="19" cy="17" r="10.5" fill="#fff" stroke-width="1.8"/>
    <circle cx="19" cy="17" r="7.6" fill="none" stroke-width=".8" opacity=".35"/>
    <path d="${sign}" fill="none" stroke-width="2.6"/>
  </g></svg>`;
}

/** Herz: voll (gegeben) oder als Umriss. */
export const heartSvg = (full) => `<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M20 34.5 C 12 28.5, 4.5 22.5, 4.5 14.5 C 4.5 9, 8.5 5.5, 13 5.5 C 16.3 5.5, 18.6 7.4, 20 10 C 21.4 7.4, 23.7 5.5, 27 5.5 C 31.5 5.5, 35.5 9, 35.5 14.5 C 35.5 22.5, 28 28.5, 20 34.5 Z"
    fill="${full ? HEART : '#fff'}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  ${full ? '<path d="M9.5 13.5 C 9.8 11.2, 11.2 9.8, 13.3 9.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".75"/>' : ''}
</svg>`;

// Schraffur ↗ in einem Rechteck, selbst zugeschnitten (wie in games/kunstkritik.js)
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
const HATCH = hatch(8, 8, 92, 92, 4);

/** Rückseite eines Blatts vor dem Aufdecken: Schraffur, Stempel mit Stift und Tag. */
export const backSvg = (dayNumber) => `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <rect x="0" y="0" width="100" height="100" fill="${BACK}"/>
  <path d="${HATCH}" stroke="${INK}" stroke-width=".5" opacity=".22"/>
  <rect x="8" y="8" width="84" height="84" fill="none" stroke="${INK}" stroke-width=".8" opacity=".5"/>
  <g transform="translate(50 50)">
    <circle r="27" fill="${BACK}" stroke="${INK}" stroke-width="1.8"/>
    <circle r="22.5" fill="none" stroke="${INK}" stroke-width=".8"/>
    <g transform="translate(0 -4) rotate(-38)">
      <path d="M-14 -3.4 H7 V3.4 H-14 Z" fill="#fff" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M7 -3.4 L15 0 L7 3.4 Z" fill="${WOOD}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M12.4 -1.1 L15 0 L12.4 1.1 Z" fill="${INK}"/>
      <path d="M-14 -3.4 H-17.5 Q-19.5 -3.4 -19.5 -1.4 V1.4 Q-19.5 3.4 -17.5 3.4 H-14 Z" fill="${ROSE}" stroke="${INK}" stroke-width="1.3"/>
    </g>
    <text y="17.5" text-anchor="middle" style="font:800 11px var(--font-display);fill:${INK}">${dayNumber}</text>
  </g>
</svg>`;

/** Abreißkalender mit einer kleinen Zeichnung, Eselsohr und einem Stift davor (Startseite, Seite ohne Tagesbild). */
export const calendarSvg = `<svg viewBox="0 0 104 100" aria-hidden="true">
  <g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" transform="translate(-4 0)">
    <g class="tb-cal-block">
      <rect x="14" y="20" width="72" height="72" fill="#fff" stroke-width="1.6"/>
      <rect x="14" y="20" width="72" height="69.5" fill="#fff" stroke-width="1.6"/>
    </g>
    <g class="tb-cal-sheet">
      <path d="M14 20 H86 V73 L72 87 H14 Z" fill="#fff" stroke-width="1.8"/>
      <rect x="22" y="29" width="56" height="43" fill="${SKY}" stroke-width="1.3"/>
      <path d="M22 62 Q37 50 50 58 Q63 66 78 54 V72 H22 Z" fill="${HILL}" stroke-width="1.3"/>
      <circle cx="61" cy="41" r="6.5" fill="${SUN}" stroke-width="1.3"/>
      <path d="M61 30.5 V32.3 M71.4 41 H69.6 M68.4 33.6 L67.1 34.9 M53.6 33.6 L54.9 34.9" stroke-width="1.2"/>
      <path d="M31 44 Q33.2 41.8 35.4 44 Q37.6 41.8 39.8 44" fill="none" stroke-width="1.2"/>
      <path d="M86 73 L72 87 L74.5 75.5 Z" fill="${BACK}" stroke-width="1.6"/>
    </g>
    <g class="tb-cal-bar">
      <rect x="11" y="10" width="78" height="12" rx="2" fill="${HEART}" stroke-width="1.8"/>
      <circle cx="31" cy="16" r="2.5" fill="#fff" stroke-width="1.3"/>
      <circle cx="69" cy="16" r="2.5" fill="#fff" stroke-width="1.3"/>
    </g>
    <g class="tb-cal-pencil" transform="rotate(10 92 62)">
      <path d="M88 32 H96 V78 H88 Z" fill="${SUN}" stroke-width="1.6"/>
      <path d="M92 33 V77" stroke-width=".8" opacity=".5"/>
      <path d="M88 78 L92 89 L96 78 Z" fill="${WOOD}" stroke-width="1.5"/>
      <path d="M90.6 85.2 L92 89 L93.4 85.2 Q92 86 90.6 85.2 Z" fill="${INK}" stroke-width="1"/>
      <rect x="88" y="28" width="8" height="4" fill="#bdbdbd" stroke-width="1.4"/>
      <path d="M88 28 V25.5 Q88 23 90.5 23 H93.5 Q96 23 96 25.5 V28 Z" fill="${ROSE}" stroke-width="1.4"/>
    </g>
  </g>
</svg>`;
