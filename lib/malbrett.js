// Malbrett für die Malspiele (Montagsmaler, Kunstkritik), ohne React. Nur im Browser aufrufen (aus render).
// Zeichnung und Raster: lib/malen.js (Skill „malflaeche“). Herkunft: das Malbrett des Tagesbilds
// (components/tagesbild-board.js), hier ohne Speichern: Das macht das Spiel (Befehle mit laufender Nummer,
// gesammelt an den Server, bei Montagsmaler dazu live an die Rater).
//
// Das Brett: Werkzeuge (Stift, Eimer, Radierer, Linie, Rechteck, Kreis), vierundzwanzig Farben im Malkasten,
// fünf Dicken, Zurück/Vor/Alles löschen, Zoomen und Verschieben (zwei Finger, Strg + Mausrad, mittlere
// Maustaste, Knöpfe), Vorschau beim Aufziehen einer Form, Ring in Stiftgröße unter der Maus. Effekte: Der Eimer
// zieht einen Ring, „Alles löschen“ reißt das Blatt ab. Zuschauer (Rater, Bildschirm) bekommen dieselbe
// Malfläche ohne Eingaben, auf Wunsch mit der Vorschau einer Form, die gerade aufgezogen wird (showShape).
//
// So bindet ein Spiel es ein:
//   stage.innerHTML = `… ${paperHtml({ cls: 'mm-paper', input: true, extra })} ${toolsHtml()} …`;
//   const pad = createPad(boardEl, { signal, reducedMotion, input: true, tools, canDraw, nextSeq, issue, update });
//   update = () => pad.sync(sichtbarerStand)   // gespeicherter Stand plus eigene offene Befehle
// Das CSS steht in MALBRETT_CSS; das Spiel hängt es an sein eigenes `style` an.

import { BLACK, LUT, PALETTE, PEN, S, SIZE_NAMES, createRaster, encodePoints, radius, shapePoints, syncRaster } from './malen.js';

const ZOOM_MAX = 6;
const TOOLS = [
  ['stift', 'Stift'],
  ['eimer', 'Eimer: Fläche füllen'],
  ['radierer', 'Radierer'],
  ['linie', 'Linie'],
  ['rechteck', 'Rechteck'],
  ['kreis', 'Kreis'],
];
export const SHAPES = new Set(['linie', 'rechteck', 'kreis']);
const DOTS = [3, 6, 10, 15, 22]; // Durchmesser der Punkte auf den Dicke-Knöpfen (px)

/** Werkzeug, Farbe und Dicke zu Beginn einer Partie (das Spiel hebt das Objekt auf, es überlebt neue Bretter). */
export const defaultTools = () => ({ tool: 'stift', color: BLACK, size: 2 });

// ---------- Zeichnungen (Skill „zeichnen“): Werkzeuge, aus dem Tagesbild ----------

const INK = '#141414';
const WOOD = '#ecc995';
const ROSE = '#e9a3a0'; // Radiergummi
const SLEEVE = '#3a6b98';

// Die aktuelle Farbe (--mb-cur) steckt in Stiftmine, Eimer, Klecks und den Formen.
const shapeStroke = (d, extra = '') =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" ${extra}/>
   <path d="${d}" fill="none" style="stroke:var(--mb-cur)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const handle = (x, y) => `<rect x="${x - 2.6}" y="${y - 2.6}" width="5.2" height="5.2" rx=".8" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
const lens = (sign) => `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
    <path d="M26.2 25.5 L34.5 33.8" stroke-width="7.6"/>
    <path d="M26.2 25.5 L34.5 33.8" stroke="${WOOD}" stroke-width="4.2"/>
    <circle cx="19" cy="17" r="10.5" fill="#fff" stroke-width="1.8"/>
    <circle cx="19" cy="17" r="7.6" fill="none" stroke-width=".8" opacity=".35"/>
    <path d="${sign}" fill="none" stroke-width="2.6"/>
  </g></svg>`;

export const ICON = {
  stift: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="rotate(45 20 20)">
    <path d="M15.5 9 H24.5 V31 H15.5 Z" fill="#fff"/>
    <path d="M20 10 V30" stroke-width=".9" opacity=".5"/>
    <path d="M15.5 9 L20 0.5 L24.5 9 Z" fill="${WOOD}"/>
    <path d="M17.6 5.2 L20 0.5 L22.4 5.2 Q20 6.2 17.6 5.2 Z" style="fill:var(--mb-cur)" stroke-width="1.2"/>
    <rect x="15.5" y="31" width="9" height="3" fill="#bdbdbd"/>
    <path d="M15.5 34 H24.5 V36 Q24.5 38.5 22 38.5 H18 Q15.5 38.5 15.5 36 Z" fill="${ROSE}"/>
  </g></svg>`,
  eimer: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <g transform="rotate(-40 23 19)">
      <path d="M13.5 14.5 Q23 1.5 32.5 14.5" fill="none"/>
      <path d="M13 14 L15.5 32 Q23 34.5 30.5 32 L33 14" fill="#fff"/>
      <path d="M14.3 23 Q23 25.5 31.7 23" fill="none" stroke-width="1"/>
      <ellipse cx="23" cy="14" rx="10" ry="3.2" style="fill:var(--mb-cur)"/>
    </g>
    <path d="M10.2 18 C 7.4 21.8, 9 27, 7.9 31.6" fill="none" style="stroke:var(--mb-cur)" stroke-width="3"/>
    <path d="M7.9 30.5 C 5.6 33.6, 6 37.3, 7.9 37.3 C 9.8 37.3, 10.3 33.6, 7.9 30.5 Z" style="fill:var(--mb-cur)" stroke-width="1.3"/>
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

// ---------- HTML ----------

/**
 * Die Malfläche. label: Name für Vorleser (vom Spiel schon maskiert), input: Zeichner (Ring unter der Maus,
 * Zoomanzeige), extra: HTML, das über dem Blatt liegt und nicht mitzoomt (Rahmen, Countdown), cls: Klassen.
 */
export function paperHtml({ cls = '', label = 'Malfläche', input = false, extra = '' } = {}) {
  return `<div class="mb-paper ${input ? 'mb-input' : ''} ${cls}">
    <div class="mb-zoom">
      <canvas class="mb-canvas" width="${S}" height="${S}" role="img" aria-label="${label}"></canvas>
      <canvas class="mb-overlay" width="${S}" height="${S}" aria-hidden="true"></canvas>
      <div class="mb-fx" aria-hidden="true"></div>
    </div>
    ${extra}
    ${input ? '<div class="mb-cursor" hidden></div><span class="mb-zoomlabel num" aria-hidden="true"></span>' : ''}
  </div>`;
}

/** Die Werkzeuge: Art, Malkasten, Dicke, Ansicht, Zurück/Vor/Alles löschen. */
export function toolsHtml() {
  const kinds = TOOLS.map(
    ([id, label], i) =>
      `<button type="button" class="mb-tool" data-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="false" style="--i:${i}">${ICON[id]}</button>`,
  ).join('');
  const swatches = PALETTE.slice(1)
    .map(
      (p, i) =>
        `<button type="button" class="mb-swatch" data-color="${i + 1}" aria-label="${p.name}" title="${p.name}" aria-pressed="false" style="--c:${p.paint};--i:${i}"></button>`,
    )
    .join('');
  const sizes = SIZE_NAMES.map(
    (label, i) =>
      `<button type="button" class="mb-tool mb-size" data-size="${i}" aria-label="${label}" title="${label}" aria-pressed="false"><i style="--d:${DOTS[i]}px"></i></button>`,
  ).join('');
  return `<div class="mb-tools"><div class="mb-grid">
    <div class="mb-kinds" role="group" aria-label="Werkzeug">${kinds}</div>
    <div class="mb-view" role="group" aria-label="Ansicht">
      <button type="button" class="mb-tool" data-zoom="out" aria-label="Verkleinern" title="Verkleinern">${ICON.weiter}</button>
      <button type="button" class="mb-tool" data-zoom="in" aria-label="Vergrößern" title="Vergrößern">${ICON.naeher}</button>
      <button type="button" class="mb-tool" data-zoom="fit" aria-label="Ganzes Bild" title="Ganzes Bild">${ICON.ganz}</button>
    </div>
    <div class="mb-palette" role="group" aria-label="Farbe">${swatches}</div>
    <div class="mb-sizes" role="group" aria-label="Dicke">${sizes}</div>
    <div class="mb-cmds">
      <button type="button" class="btn mb-cmd" data-cmd="u" aria-label="Zurück">${ICON.zurueck}<span>Zurück</span></button>
      <button type="button" class="btn mb-cmd" data-cmd="r" aria-label="Vor">${ICON.vor}<span>Vor</span></button>
      <button type="button" class="btn mb-cmd" data-cmd="c">${ICON.leeren}<span>Alles löschen</span></button>
    </div>
  </div></div>`;
}

// ---------- Brett ----------

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isPoint = (p) => Array.isArray(p) && p.length === 2 && isInt(p[0], 0, S - 1) && isInt(p[1], 0, S - 1);

/** Kommt eine Form von außen (live), nur so weiter: { kind, c, w, a, b } oder null. */
export function cleanShape(sh) {
  if (!sh || !SHAPES.has(sh.kind) || !isInt(sh.c, 1, PALETTE.length - 1) || !isInt(sh.w, 0, PEN.length - 1)) return null;
  return isPoint(sh.a) && isPoint(sh.b) ? { kind: sh.kind, c: sh.c, w: sh.w, a: sh.a, b: sh.b } : null;
}

/**
 * Hängt das Brett an das HTML von paperHtml (und bei input: toolsHtml) in `root`. root bekommt data-tool
 * und --mb-cur (aktuelle Farbe).
 * opts: {
 *   signal, reducedMotion,
 *   input: true = Zeichner (Eingaben und Werkzeuge), sonst nur Anzeige (Rater, Bildschirm),
 *   tools: { tool, color, size } (wird verändert; das Spiel hebt es für die nächste Runde auf),
 *   canDraw(): ob gerade gemalt werden darf,
 *   nextSeq(): Nummer für einen neuen Strich,
 *   issue(cmd): neuer Befehl (ohne s, außer bei Strichen); das Spiel vergibt die Nummer, merkt ihn sich,
 *     zeichnet über sync und speichert,
 *   update(): das Spiel soll neu zeichnen (ruft sync mit seinem Stand),
 *   onStroke?(stroke): Strich begonnen oder neue Punkte (für Live),
 *   onShape?(shape | null): Form wird aufgezogen ({ kind, c, w, a, b }) bzw. null: eine Vorschau (Form oder
 *     gerade begonnener Strich) wurde verworfen, ohne dass ein Befehl kommt (für Live),
 *   onTools?(): Werkzeug, Farbe oder Dicke geändert,
 * }
 */
export function createPad(root, opts) {
  const { signal } = opts;
  const input = Boolean(opts.input);
  const tools = opts.tools ?? defaultTools();
  const paper = root.querySelector('.mb-paper');
  const layer = paper.querySelector('.mb-zoom');
  const canvas = paper.querySelector('.mb-canvas');
  const overlay = paper.querySelector('.mb-overlay');
  const fx = paper.querySelector('.mb-fx');
  const cursor = paper.querySelector('.mb-cursor');
  const zoomLabel = paper.querySelector('.mb-zoomlabel');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');
  const img = ctx.createImageData(S, S);
  const px = new Uint32Array(img.data.buffer);
  px.fill(LUT[0]);
  ctx.putImageData(img, 0, 0);
  const raster = createRaster();
  const u = {
    model: null,
    stroke: null,
    shape: null, // eigene Form beim Aufziehen
    shown: null, // Form, die gerade als Vorschau zu sehen ist (eigene oder live)
    fillAt: null,
    pointers: new Map(),
    pinch: null,
    pan: null,
    hold: false, // nach zwei Fingern: nichts malen, bis alle Finger weg sind
    zoom: { z: 1, x: 0, y: 0 }, // Verschiebung in Bruchteilen der Blattbreite
    queued: false,
  };

  // ---------- Stand und Anzeige ----------

  /** Raster auf den Stand bringen: model = { ops, n, seq }, preview = Strich, der entsteht (Vorgabe: der eigene). */
  function sync(model, preview = u.stroke) {
    u.model = model;
    syncRaster(raster, model.ops.slice(0, model.n), preview);
    if (!u.queued) {
      u.queued = true;
      requestAnimationFrame(() => {
        u.queued = false;
        paint();
      });
    }
    if (input && !u.stroke) syncCmds();
  }

  function paint() {
    const d = raster.dirty;
    if (!d || signal.aborted) return;
    raster.dirty = null;
    const buf = raster.buf;
    for (let y = d.y0; y <= d.y1; y++) {
      const row = y * S;
      for (let x = d.x0; x <= d.x1; x++) px[row + x] = LUT[buf[row + x]];
    }
    ctx.putImageData(img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
  }

  function syncTools() {
    root.style.setProperty('--mb-cur', PALETTE[tools.color].paint);
    root.dataset.tool = tools.tool;
    for (const b of root.querySelectorAll('[data-color]')) b.setAttribute('aria-pressed', String(Number(b.dataset.color) === tools.color));
    for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tools.tool));
    for (const b of root.querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === tools.size));
    syncCmds();
  }

  function syncCmds() {
    const m = u.model;
    const set = (sel, on) => {
      const b = root.querySelector(sel);
      if (b && b.disabled === on) b.disabled = !on;
    };
    if (m) {
      set('[data-cmd="u"]', m.n > 0);
      set('[data-cmd="r"]', m.n < m.ops.length);
      set('[data-cmd="c"]', m.n > 0 && m.ops[m.n - 1].t !== 'c');
    }
    set('[data-zoom="out"]', u.zoom.z > 1);
    set('[data-zoom="fit"]', u.zoom.z > 1);
    set('[data-zoom="in"]', u.zoom.z < ZOOM_MAX);
  }

  // ---------- Befehle ----------

  function command(t) {
    endStroke();
    cancelShape();
    const m = u.model;
    if (!m || !opts.canDraw()) return;
    if (t === 'u' && !m.n) return;
    if (t === 'r' && m.n >= m.ops.length) return;
    if (t === 'c') {
      if (!m.n || m.ops[m.n - 1].t === 'c') return;
      tear();
    }
    opts.issue({ t });
  }

  function startStroke(p) {
    u.stroke = { s: opts.nextSeq(), c: tools.tool === 'radierer' ? 0 : tools.color, w: tools.size, pts: [p], t0: performance.now(), sent: 0 };
    opts.update();
    opts.onStroke?.(u.stroke);
  }

  // Neuer Punkt nur, wenn der Finger ein Stück weiter ist (hält die Zeichnung klein)
  function addPoint(p) {
    const st = u.stroke;
    const [lx, ly] = st.pts[st.pts.length - 1];
    const min = Math.max(4, radius(st.c, st.w) * 0.3);
    if ((p[0] - lx) ** 2 + (p[1] - ly) ** 2 < min * min) return false;
    st.pts.push(p);
    if (st.pts.length >= 1200) {
      // sehr langer Strich: abschließen und nahtlos weitermachen
      endStroke();
      startStroke(p);
    }
    return true;
  }

  function endStroke() {
    const st = u.stroke;
    if (!st) return;
    u.stroke = null;
    opts.issue({ s: st.s, t: 's', c: st.c, w: st.w, p: encodePoints(st.pts) });
  }

  // Ein gerade erst begonnener Strich zählt nicht (der zweite Finger kam dazu, um zu zoomen)
  function cancelStroke() {
    u.stroke = null;
    opts.update();
    opts.onShape?.(null);
  }

  // ---------- Formen ----------

  // Vorschau einer Form auf der zweiten Leinwand (nur Vorschau: gemalt wird aus den gespeicherten Punkten)
  function drawShape(sh) {
    u.shown = sh;
    octx.clearRect(0, 0, S, S);
    if (!sh) return;
    const pts = shapePoints(sh.kind, sh.a, sh.b);
    octx.strokeStyle = PALETTE[sh.c].paint;
    octx.lineWidth = 2 * radius(sh.c, sh.w);
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.beginPath();
    pts.forEach(([x, y], i) => (i ? octx.lineTo(x + 0.5, y + 0.5) : octx.moveTo(x + 0.5, y + 0.5)));
    octx.stroke();
  }

  function cancelShape() {
    if (!u.shape) return;
    u.shape = null;
    drawShape(null);
    opts.onShape?.(null);
  }

  function commitShape(ok) {
    const sh = u.shape;
    u.shape = null;
    drawShape(null);
    const [ax, ay] = sh.a;
    const [bx, by] = sh.b;
    if (!ok || !opts.canDraw() || (Math.abs(bx - ax) < 3 && Math.abs(by - ay) < 3)) {
      opts.onShape?.(null); // abgebrochen oder nur getippt
      return;
    }
    opts.issue({ t: 'l', c: sh.c, w: sh.w, p: encodePoints(shapePoints(sh.kind, sh.a, sh.b)) });
  }

  function fillAt([x, y]) {
    const c = tools.color;
    if (raster.buf[y * S + x] === c) return;
    ripple(x, y, c);
    opts.issue({ t: 'f', c, x, y });
  }

  // ---------- Effekte ----------

  // Eimer: ein Ring in der Farbe läuft vom Klick aus auseinander
  function ripple(x, y, c) {
    if (opts.reducedMotion || signal.aborted) return;
    const ring = document.createElement('i');
    ring.className = 'mb-ripple';
    ring.style.cssText = `left:${(x / S) * 100}%;top:${(y / S) * 100}%;--c:${PALETTE[c].paint}`;
    fx.append(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  // Alles löschen: das alte Blatt reißt ab und fällt weg
  function tear() {
    if (opts.reducedMotion || signal.aborted) return;
    const sheet = document.createElement('canvas');
    sheet.width = sheet.height = 500;
    sheet.getContext('2d').drawImage(canvas, 0, 0, 500, 500);
    sheet.className = 'mb-torn';
    fx.append(sheet);
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

  const api = {
    paper,
    canvas,
    raster,
    get stroke() {
      return u.stroke;
    },
    sync,
    command,
    endStroke,
    /** Strich abschließen, Form verwerfen (Zeit um, „Fertig“). */
    finish() {
      endStroke();
      cancelShape();
      if (cursor) cursor.hidden = true;
    },
    /** Vorschau einer Form, die jemand anderes gerade aufzieht ({ kind, c, w, a, b } oder null). */
    showShape(sh) {
      if (!u.shape) drawShape(sh ? cleanShape(sh) : null);
    },
    get liveShape() {
      return u.shape ? null : u.shown;
    },
    ripple,
    tear,
  };
  if (!input) return api;

  // ---------- Zoomen (nur beim Zeichner) ----------

  function applyZoom(animate) {
    const { z, x, y } = u.zoom;
    const w = paper.clientWidth;
    layer.classList.toggle('mb-anim', Boolean(animate) && !opts.reducedMotion);
    layer.style.transform = z === 1 ? '' : `translate(${x * w}px, ${y * w}px) scale(${z})`;
    paper.classList.toggle('is-zoomed', z > 1);
    if (zoomLabel) zoomLabel.textContent = z > 1 ? `${Math.round(z * 10) / 10}×` : '';
    syncCmds();
  }

  const clampPan = ({ z, x, y }) => ({ z, x: Math.min(0, Math.max(1 - z, x)), y: Math.min(0, Math.max(1 - z, y)) });

  // Zoom auf z, der Punkt (cx, cy) im Blatt (Pixel) bleibt, wo er ist
  function zoomTo(z, cx, cy, animate) {
    const w = paper.clientWidth || 1;
    const old = u.zoom;
    const nz = Math.min(ZOOM_MAX, Math.max(1, z));
    const qx = (cx / w - old.x) / old.z;
    const qy = (cy / w - old.y) / old.z;
    u.zoom = clampPan({ z: nz, x: cx / w - qx * nz, y: cy / w - qy * nz });
    applyZoom(animate);
  }

  function panBy(dx, dy) {
    const w = paper.clientWidth || 1;
    u.zoom = clampPan({ ...u.zoom, x: u.zoom.x + dx / w, y: u.zoom.y + dy / w });
    applyZoom(false);
  }

  window.addEventListener('resize', () => applyZoom(false), { signal });

  // ---------- Werkzeugknöpfe und Tasten ----------

  root.querySelector('.mb-tools')?.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.zoom) {
        const w = paper.clientWidth;
        if (b.dataset.zoom === 'fit') {
          u.zoom = { z: 1, x: 0, y: 0 };
          applyZoom(true);
        } else zoomTo(u.zoom.z * (b.dataset.zoom === 'in' ? 1.6 : 1 / 1.6), w / 2, w / 2, true);
        return;
      }
      if (b.dataset.cmd) return command(b.dataset.cmd);
      if (b.dataset.color) {
        tools.color = Number(b.dataset.color);
        if (tools.tool === 'radierer') tools.tool = 'stift';
      } else if (b.dataset.tool) tools.tool = b.dataset.tool;
      else if (b.dataset.size) tools.size = Number(b.dataset.size);
      else return;
      syncTools();
      opts.onTools?.();
    },
    { signal },
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) command('u');
      else if ((k === 'z' && e.shiftKey) || k === 'y') command('r');
      else return;
      e.preventDefault();
    },
    { signal },
  );

  // ---------- Finger, Stift oder Maus auf dem Blatt ----------

  const pos = (e) => {
    const rect = canvas.getBoundingClientRect(); // stimmt auch vergrößert
    const fit = (v) => Math.min(S - 1, Math.max(0, Math.floor(v)));
    return [fit(((e.clientX - rect.left) / rect.width) * S), fit(((e.clientY - rect.top) / rect.height) * S)];
  };
  const local = (e) => {
    const r = paper.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function startPinch() {
    const [a, b] = [...u.pointers.values()];
    u.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom: { ...u.zoom } };
  }

  function movePinch() {
    const [a, b] = [...u.pointers.values()];
    const p = u.pinch;
    const r = paper.getBoundingClientRect();
    const w = r.width || 1;
    const z = Math.min(ZOOM_MAX, Math.max(1, (p.zoom.z * Math.hypot(a.x - b.x, a.y - b.y)) / p.d));
    const m0x = (p.mx - r.left) / w;
    const m0y = (p.my - r.top) / w;
    const mx = ((a.x + b.x) / 2 - r.left) / w;
    const my = ((a.y + b.y) / 2 - r.top) / w;
    const qx = (m0x - p.zoom.x) / p.zoom.z;
    const qy = (m0y - p.zoom.y) / p.zoom.z;
    u.zoom = clampPan({ z, x: mx - qx * z, y: my - qy * z });
    applyZoom(false);
  }

  paper.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      try {
        paper.setPointerCapture(e.pointerId);
      } catch {}
      u.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (u.pointers.size === 2) {
        // Zweiter Finger: Zoomen statt Malen. Ein gerade begonnener Strich zählt nicht.
        if (u.stroke) {
          if (performance.now() - u.stroke.t0 < 350 || u.stroke.pts.length < 8) cancelStroke();
          else endStroke();
        }
        u.fillAt = null;
        cancelShape();
        u.hold = true;
        startPinch();
        return;
      }
      if (u.pointers.size > 2 || u.hold) return;
      if (e.button === 1) {
        u.pan = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!opts.canDraw()) return;
      const p = pos(e);
      if (tools.tool === 'eimer') u.fillAt = p;
      else if (SHAPES.has(tools.tool)) {
        u.shape = { kind: tools.tool, c: tools.color, w: tools.size, a: p, b: p };
        drawShape(u.shape);
      } else startStroke(p);
    },
    { signal },
  );

  paper.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse') moveCursor(e);
      if (!u.pointers.has(e.pointerId)) return;
      u.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (u.pinch && u.pointers.size >= 2) return movePinch();
      if (u.pan) {
        panBy(e.clientX - u.pan.x, e.clientY - u.pan.y);
        u.pan = { x: e.clientX, y: e.clientY };
        return;
      }
      if (u.shape) {
        const b = pos(e);
        if (b[0] === u.shape.b[0] && b[1] === u.shape.b[1]) return;
        u.shape = { ...u.shape, b };
        drawShape(u.shape);
        opts.onShape?.(u.shape);
        return;
      }
      if (!u.stroke) return;
      const events = e.getCoalescedEvents?.() ?? [];
      let added = false;
      for (const ev of events.length ? events : [e]) added = addPoint(pos(ev)) || added;
      if (!added) return;
      opts.update();
      opts.onStroke?.(u.stroke);
    },
    { signal },
  );

  const end = (e) => {
    if (!u.pointers.has(e.pointerId)) return;
    u.pointers.delete(e.pointerId);
    if (u.pinch) {
      if (u.pointers.size < 2) u.pinch = null;
      if (!u.pointers.size) u.hold = false;
      return;
    }
    if (u.hold) {
      if (!u.pointers.size) u.hold = false;
      return;
    }
    if (u.pan) {
      u.pan = null;
      return;
    }
    if (u.fillAt) {
      const p = u.fillAt;
      u.fillAt = null;
      if (e.type === 'pointerup' && opts.canDraw()) fillAt(p);
    } else if (u.shape) commitShape(e.type === 'pointerup');
    else endStroke();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) paper.addEventListener(type, end, { signal });
  paper.addEventListener('pointerleave', () => cursor && (cursor.hidden = true), { signal });
  // iOS: die Seite nicht verschieben oder vergrößern, solange auf dem Blatt gemalt oder gezoomt wird
  const hold = (e) => e.cancelable && e.preventDefault();
  paper.addEventListener('touchstart', hold, { signal, passive: false });
  paper.addEventListener('touchmove', hold, { signal, passive: false });

  // Mausrad: mit Strg (oder Zwei-Finger-Zoom am Touchpad) zoomen, sonst im vergrößerten Bild verschieben
  paper.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const [cx, cy] = local(e);
        zoomTo(u.zoom.z * Math.exp(-e.deltaY * 0.01), cx, cy, false);
      } else if (u.zoom.z > 1) {
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
    },
    { signal, passive: false },
  );

  function moveCursor(e) {
    if (!cursor) return;
    if (tools.tool === 'eimer' || u.pan || !opts.canDraw()) {
      cursor.hidden = true;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const [lx, ly] = local(e);
    const d = Math.max(4, (2 * radius(tools.tool === 'radierer' ? 0 : tools.color, tools.size) * rect.width) / S);
    cursor.hidden = false;
    cursor.style.width = cursor.style.height = `${d}px`;
    cursor.style.transform = `translate(${lx - d / 2}px, ${ly - d / 2}px)`;
  }

  syncTools();
  applyZoom(false);
  return api;
}

// ---------- CSS (das Spiel hängt es an sein `style` an) ----------

export const MALBRETT_CSS = `
  .mb-paper {
    position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: #fff;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  .mb-paper.mb-input { touch-action: none; cursor: none; }
  [data-tool="eimer"] .mb-paper.mb-input, [data-tool="linie"] .mb-paper.mb-input,
  [data-tool="rechteck"] .mb-paper.mb-input, [data-tool="kreis"] .mb-paper.mb-input { cursor: crosshair; }
  .mb-zoom { position: absolute; inset: 0; transform-origin: 0 0; }
  .mb-zoom.mb-anim { transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
  .mb-canvas, .mb-overlay { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
  .mb-overlay, .mb-fx { pointer-events: none; }
  .mb-fx { position: absolute; inset: 0; overflow: hidden; }
  .mb-ripple {
    position: absolute; width: 36%; aspect-ratio: 1; border: 3px solid var(--c); border-radius: 50%;
    transform: translate(-50%, -50%) scale(0); animation: mb-ripple 520ms cubic-bezier(.2,.8,.2,1) forwards;
  }
  @keyframes mb-ripple { 60% { opacity: 1; } to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
  .mb-torn { position: absolute; inset: 0; width: 100%; height: 100%; transform-origin: 0 0; }
  .mb-cursor {
    position: absolute; left: 0; top: 0; border: 1.5px solid var(--ink); border-radius: 50%;
    box-shadow: 0 0 0 1px #fff; pointer-events: none;
  }
  .mb-zoomlabel {
    position: absolute; right: 6px; bottom: 4px; padding: 0 4px; background: #fff;
    font-size: var(--t-md); line-height: 1.1; pointer-events: none;
  }
  .mb-zoomlabel:empty { visibility: hidden; }

  /* Werkzeuge: schmal untereinander, ab 500 px Breite Ansicht neben den Werkzeugen und Zurück neben den Dicken */
  .mb-tools { container-type: inline-size; min-width: 0; }
  .mb-grid {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 8px; align-items: center;
    grid-template-areas: "kinds kinds" "palette palette" "sizes view" "cmds cmds";
  }
  .mb-kinds { grid-area: kinds; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
  .mb-view { grid-area: view; display: flex; gap: 2px; }
  .mb-palette { grid-area: palette; }
  .mb-sizes { grid-area: sizes; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; max-width: 220px; }
  .mb-cmds { grid-area: cmds; display: flex; align-items: center; gap: 6px; }
  @container (min-width: 500px) {
    .mb-grid { grid-template-areas: "kinds view" "palette palette" "sizes cmds"; }
    .mb-cmds { justify-content: flex-end; }
    .mb-cmd[data-cmd="u"] span, .mb-cmd[data-cmd="r"] span { display: none; }
  }
  .mb-tool {
    appearance: none; display: grid; place-items: center; min-width: 0; min-height: 46px; padding: 2px;
    border: 1.5px solid transparent; border-radius: var(--radius); background: none; color: var(--ink); cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  .mb-tool svg { display: block; width: 34px; height: 34px; overflow: visible; }
  .mb-tool:hover:not(:disabled) { background: var(--wash); }
  .mb-tool:active:not(:disabled) { transform: scale(.96); }
  .mb-tool[aria-pressed="true"] { border-color: var(--ink); background: var(--wash); }
  .mb-tool:disabled { opacity: .3; cursor: default; }
  .mb-kinds .mb-tool { animation: mb-in 320ms cubic-bezier(.2,.8,.2,1) calc(120ms + var(--i) * 40ms) backwards; }
  @keyframes mb-in { from { opacity: 0; transform: translateY(8px); } }
  .mb-view .mb-tool { min-width: 40px; }
  .mb-size i { display: block; width: var(--d); height: var(--d); border-radius: 50%; background: var(--mb-cur); box-shadow: 0 0 0 1px var(--ink); }
  [data-tool="radierer"] .mb-size i { background: #fff; }

  /* Farben wie Näpfchen in einem Malkasten: Kasten aus Pappe, Näpfchen mit Rand und Licht oben links.
     Drei Reihen (hell, mittel, dunkel), jede Spalte ein Farbton. Flach, damit Blatt und Werkzeuge ins Bild passen. */
  .mb-palette {
    display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 5px; padding: 6px;
    border: 2px solid var(--ink); border-radius: var(--radius-m); background: #f3efe6;
  }
  .mb-swatch {
    appearance: none; position: relative; min-width: 0; height: 28px; padding: 0;
    border: 1.5px solid var(--ink); border-radius: var(--radius-m); background: var(--c); cursor: pointer;
    transition: transform 140ms cubic-bezier(.2,.8,.2,1);
    animation: mb-in 300ms cubic-bezier(.2,.8,.2,1) calc(160ms + var(--i) * 12ms) backwards;
  }
  .mb-swatch::after {
    content: ''; position: absolute; left: 14%; top: 16%; width: 30%; height: 26%;
    border-top: 2px solid #fff; border-left: 2px solid #fff; border-radius: 60% 0 0 0; opacity: .5;
  }
  .mb-swatch:active { transform: scale(.94); }
  .mb-swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px #f3efe6, 0 0 0 4px var(--ink); transform: translateY(-2px); }
  [data-tool="radierer"] .mb-swatch[aria-pressed="true"] { box-shadow: none; transform: none; }

  .mb-cmd { min-height: 44px; padding: 6px 10px; gap: 4px; font-size: var(--t-sm); flex: 0 1 auto; white-space: nowrap; }
  .mb-cmd svg { width: 24px; height: 24px; flex: none; }
  .mb-cmd[data-cmd="c"] { margin-left: auto; }
  .mb-cmd:active:not(:disabled) { transform: scale(.96); }
  @container (min-width: 500px) { .mb-cmd[data-cmd="c"] { margin-left: 0; } }

  @container (max-width: 339px) {
    .mb-cmd[data-cmd="u"] span, .mb-cmd[data-cmd="r"] span { display: none; }
    .mb-view .mb-tool { min-width: 36px; }
  }
  /* Schmal (Handy): etwas flacher, damit Blatt und Werkzeuge möglichst zusammen ins Bild passen */
  @container (max-width: 459px) {
    .mb-grid { gap: 8px 6px; }
    .mb-tool { min-height: 42px; }
    .mb-tool svg { width: 31px; height: 31px; }
    .mb-swatch { height: 25px; }
    .mb-cmd { min-height: 40px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .mb-kinds .mb-tool, .mb-swatch, .mb-ripple { animation: none; }
    .mb-zoom.mb-anim, .mb-swatch { transition: none; }
  }
`;
