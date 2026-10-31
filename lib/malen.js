// Malfläche: Zeichnung als Liste von Befehlen, Raster mit einer Farbnummer pro Punkt. Für das Tagesbild und
// die Malspiele (Montagsmaler, Kunstkritik). Läuft auf dem Server (Befehle prüfen und speichern,
// lib/tagesbild-server.js, action der Spiele) und im Browser (malen, components/tagesbild-board.js bzw.
// lib/malbrett.js). Keine Imports, nur reine Funktionen; was den Browser braucht (Leinwand), steht unten und
// wird nur dort aufgerufen.
//
// Herkunft: Raster, Striche und Befehle aus games/kunstkritik.js (Skill „malflaeche“), erweitert um
// vierundzwanzig Farben, fünf Dicken, Formen (Linie, Rechteck, Kreis) und einen Eimer, der fast
// geschlossene Flächen füllt, ohne durch die Lücke auszulaufen.

export const S = 1000; // Malfläche: S × S Rasterpunkte

// Farben (Index wie in den Befehlen, nur hinten anhängen): 0 ist das Papier (Radierer), danach drei
// Reihen zu acht, hell, mittel, dunkel; jede Spalte ein Farbton.
export const PALETTE = [
  { name: 'Papier', paint: '#ffffff' },
  { name: 'Hellgrau', paint: '#cfcfcf' },
  { name: 'Rosa', paint: '#f5afbd' },
  { name: 'Apricot', paint: '#f9c594' },
  { name: 'Hellgelb', paint: '#fbe7a0' },
  { name: 'Hellgrün', paint: '#b3da8c' },
  { name: 'Hellblau', paint: '#a3d0ef' },
  { name: 'Flieder', paint: '#cbb4de' },
  { name: 'Hautton hell', paint: '#f3d1b3' },
  { name: 'Grau', paint: '#828282' },
  { name: 'Rot', paint: '#d6362a' },
  { name: 'Orange', paint: '#ee7b1f' },
  { name: 'Gelb', paint: '#f5c22b' },
  { name: 'Grün', paint: '#379a4d' },
  { name: 'Blau', paint: '#2e6eb3' },
  { name: 'Lila', paint: '#7c4a90' },
  { name: 'Hautton mittel', paint: '#c98b5b' },
  { name: 'Schwarz', paint: '#141414' },
  { name: 'Weinrot', paint: '#87202a' },
  { name: 'Rostbraun', paint: '#a34a1f' },
  { name: 'Ocker', paint: '#bf8e1f' },
  { name: 'Tannengrün', paint: '#1b5634' },
  { name: 'Nachtblau', paint: '#1b3462' },
  { name: 'Aubergine', paint: '#4a2552' },
  { name: 'Braun', paint: '#6b4127' },
];
export const BLACK = 17;
const COLORS = PALETTE.length;

export const PEN = [2, 5, 10, 18, 32]; // Stiftdicke als Radius in Rasterpunkten, von fein bis breit
export const RUBBER = [6, 12, 24, 40, 64]; // Radierer
export const SIZE_NAMES = ['Fein', 'Dünn', 'Mittel', 'Dick', 'Breit'];
export const radius = (c, w) => (c === 0 ? RUBBER : PEN)[w];

export const MAX_OPS = 4000;
export const MAX_CHARS = 400_000; // Summe aller Punkt-Codes einer Zeichnung
const LIMITS = { ops: MAX_OPS, chars: MAX_CHARS };
const MAX_STROKE = 6000; // Zeichen eines Strichs
const MAX_SHAPE = 1200; // Zeichen einer Form (ein Kreis hat höchstens 160 Punkte)

// ---------- Punkte als kurzer Text ----------

// Pro Achse ein Zeichen für den Abstand zum vorigen Punkt (−31 bis 31), sonst „_“ und zwei Zeichen für den Wert.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const IDX = new Map([...ABC].map((c, i) => [c, i]));

export function encodePoints(pts) {
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
export function decodePoints(p, max = MAX_STROKE) {
  if (typeof p !== 'string' || !p.length || p.length > max) return null;
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

// ---------- Befehle (Server und Browser) ----------

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Befehl → gespeicherter Schritt der Zeichnung (oder null, wenn er keiner ist bzw. nicht stimmt).
// s Strich (geglättet), l Form aus geraden Stücken (Linie, Rechteck, Kreis), f Füllen, c Alles löschen.
function cleanOp(cmd) {
  const { s, t } = cmd;
  if (t === 's' && isInt(cmd.c, 0, COLORS - 1) && isInt(cmd.w, 0, PEN.length - 1) && decodePoints(cmd.p)) {
    return { s, t, c: cmd.c, w: cmd.w, p: cmd.p };
  }
  if (t === 'l' && isInt(cmd.c, 0, COLORS - 1) && isInt(cmd.w, 0, PEN.length - 1) && decodePoints(cmd.p, MAX_SHAPE)?.length >= 2) {
    return { s, t, c: cmd.c, w: cmd.w, p: cmd.p };
  }
  if (t === 'f' && isInt(cmd.c, 0, COLORS - 1) && isInt(cmd.x, 0, S - 1) && isInt(cmd.y, 0, S - 1)) {
    return { s, t, c: cmd.c, x: cmd.x, y: cmd.y };
  }
  if (t === 'c') return { s, t };
  return null;
}

const charsOf = (ops) => ops.reduce((sum, op) => sum + (op.p?.length ?? 8), 0);

export const emptyDrawing = () => ({ ops: [], n: 0, seq: 0 });

/**
 * Wendet einen Befehl auf die Zeichnung d = { ops, n, seq } an (verändert d).
 * ops.slice(0, n) ist zu sehen, der Rest lässt sich mit „Vor“ zurückholen. Befehle: s, l, f, c (siehe
 * cleanOp), u Zurück, r Vor; jeder mit laufender Nummer s = seq + 1.
 * limits: Obergrenzen der Zeichnung { ops, chars }. Spiele setzen kleinere (ihr ganzer Zustand wird bei
 * jedem Zug gespeichert), das Tagesbild nimmt die Vorgabe.
 * Rückgabe: false = passt nicht an diese Stelle, 'voll' = verworfen, weil die Zeichnung voll ist, sonst true.
 */
export function applyCmd(d, cmd, limits = LIMITS) {
  if (!cmd || typeof cmd !== 'object' || cmd.s !== d.seq + 1) return false;
  d.seq = cmd.s;
  if (cmd.t === 'u') d.n = Math.max(0, d.n - 1);
  else if (cmd.t === 'r') d.n = Math.min(d.ops.length, d.n + 1);
  else {
    const op = cleanOp(cmd);
    if (!op || (op.t === 'c' && !d.n)) return true;
    const ops = d.ops.slice(0, d.n);
    if (ops.length >= limits.ops || charsOf(ops) + (op.p?.length ?? 8) > limits.chars) return 'voll';
    ops.push(op);
    d.ops = ops;
    d.n = ops.length;
  }
  return true;
}

// Zeichnungen aus Montagsmaler und Kunstkritik von vor der großen Palette (sieben Farben: Papier, Schwarz, Rot,
// Blau, Grün, Gelb, Braun; drei Dicken): Farbe und Dicke auf die heutigen Nummern umschreiben. Die Punkte
// bleiben, das Raster ist dasselbe. Die Dicken liegen danach nah an den alten (Radius 4, 10, 22 → 5, 10, 18).
const OLD_COLORS = [0, BLACK, 10, 14, 13, 12, 24];
export function fromSmallPalette(op) {
  if (!op || (op.t !== 's' && op.t !== 'f')) return op;
  const c = OLD_COLORS[op.c] ?? BLACK;
  return op.t === 's' ? { ...op, c, w: Math.min(PEN.length - 1, (op.w ?? 1) + 1) } : { ...op, c };
}

/** Was von einer Zeichnung bleibt: die sichtbaren Schritte ab dem letzten „Alles löschen“, ohne Nummern. */
export function finalOps(d) {
  const vis = d.ops.slice(0, d.n);
  let k = vis.length;
  while (k > 0 && vis[k - 1].t !== 'c') k--;
  return vis.slice(k).map(({ s, ...op }) => op);
}

// ---------- Formen (im Browser berechnet, als Punkte gespeichert) ----------

const fit = (v) => Math.min(S - 1, Math.max(0, Math.round(v)));

/** Punkte einer Form von a nach b (zwei Ecken bzw. Anfang und Ende): 'linie' | 'rechteck' | 'kreis'. */
export function shapePoints(kind, [ax, ay], [bx, by]) {
  if (kind === 'linie') return [
    [ax, ay],
    [bx, by],
  ];
  if (kind === 'rechteck') return [
    [ax, ay],
    [bx, ay],
    [bx, by],
    [ax, by],
    [ax, ay],
  ];
  // Ellipse im Rechteck a–b. Winkelfunktionen nur hier: gespeichert werden die gerundeten Punkte, und die
  // malt jeder Browser gleich.
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  const rx = Math.abs(bx - ax) / 2;
  const ry = Math.abs(by - ay) / 2;
  const around = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.min(160, Math.max(16, Math.round(around / 10)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const p = [fit(cx + rx * Math.cos(a)), fit(cy + ry * Math.sin(a))];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (pts.length < 2) pts.push([...pts[0]]);
  return pts;
}

// ---------- Raster ----------

export function createRaster() {
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

// Form: gerade Stücke von Punkt zu Punkt, ohne Glätten (Ecken bleiben Ecken)
function polyline(r, pts, c, rad) {
  for (let i = 1; i < pts.length; i++) capsule(r, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], rad, c);
}

// ---------- Eimer, der Lücken schließt ----------

// Lücken bis etwa zweimal GAP Rasterpunkte gelten als geschlossen. Kleinere Ausbuchtungen als CORE_MIN
// (Fläche des Kerns) zählen nicht als eigene Fläche.
export const GAP = 12;
const CORE_MIN = GAP * GAP;

// Arbeitsspeicher für den Eimer, einmal angelegt (eine Füllung nach der anderen)
let work = null;
const workspace = () =>
  (work ??= {
    mask: new Uint8Array(S * S), // 1 = gehört zur gleichfarbigen Fläche
    dist: new Uint16Array(S * S), // Abstand zum Rand der Fläche (×3, Schachbrett-Näherung 3-4)
    label: new Int32Array(S * S), // Kern bzw. zugeteilter Kern
    queue: new Int32Array(S * S),
  });

/**
 * Eimer: färbt die Fläche um (x, y) in Farbe c. Wie ein normaler Eimer füllt er die zusammenhängende
 * Fläche gleicher Farbe; hängt sie aber nur durch eine schmale Lücke (unter 2 × GAP) mit einer anderen
 * großen Fläche zusammen, endet die Füllung in der Mitte der Lücke.
 *
 * So geht es: Kerne sind die Punkte der Fläche, die weiter als GAP vom Rand entfernt sind. Zerfällt der
 * Kern in mehrere große Teile, trennt eine Engstelle sie. Jeder Punkt der Fläche gehört zum nächsten Kern
 * (Breitensuche von allen Kernen gleichzeitig), gefüllt wird, was zum Kern des Klickpunkts gehört. Spitzen
 * und schmale Zipfel hängen nur an einem Kern und werden mitgefüllt. Nur ganze Zahlen: jeder Browser
 * füllt exakt dieselben Punkte.
 */
function flood(r, x, y, c) {
  const buf = r.buf;
  const target = buf[y * S + x];
  if (target === c) return;
  const { mask, dist, label, queue } = workspace();

  // 1. Die ganze gleichfarbige Fläche markieren (Zeilen-Füllung), mit Rechteck drumherum
  let x0 = x;
  let x1 = x;
  let y0 = y;
  let y1 = y;
  let area = 0;
  let stack = [x, y];
  while (stack.length) {
    const sy = stack.pop();
    const sx = stack.pop();
    const row = sy * S;
    if (mask[row + sx] || buf[row + sx] !== target) continue;
    let l = sx;
    let rr = sx;
    while (l > 0 && buf[row + l - 1] === target && !mask[row + l - 1]) l--;
    while (rr < S - 1 && buf[row + rr + 1] === target && !mask[row + rr + 1]) rr++;
    mask.fill(1, row + l, row + rr + 1);
    area += rr - l + 1;
    if (l < x0) x0 = l;
    if (rr > x1) x1 = rr;
    if (sy < y0) y0 = sy;
    if (sy > y1) y1 = sy;
    for (let ny = sy - 1; ny <= sy + 1; ny += 2) {
      if (ny < 0 || ny >= S) continue;
      const nrow = ny * S;
      let open = false;
      for (let k = l; k <= rr; k++) {
        if (buf[nrow + k] === target && !mask[nrow + k]) {
          if (!open) stack.push(k, ny);
          open = true;
        } else open = false;
      }
    }
  }

  // Ergebnis: umfärben (alles oder nur, was zum Kern des Klickpunkts gehört), Arbeitsspeicher leeren
  const finish = (mine) => {
    let fx0 = S;
    let fy0 = S;
    let fx1 = -1;
    let fy1 = -1;
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * S;
      for (let xx = x0; xx <= x1; xx++) {
        const i = row + xx;
        if (mask[i] && (mine === 0 || label[i] === mine)) {
          buf[i] = c;
          if (xx < fx0) fx0 = xx;
          if (xx > fx1) fx1 = xx;
          if (yy < fy0) fy0 = yy;
          if (yy > fy1) fy1 = yy;
        }
      }
      const a = row + x0;
      const b = row + x1 + 1;
      mask.fill(0, a, b);
      dist.fill(0, a, b);
      label.fill(0, a, b);
    }
    if (fx1 >= 0) touch(r, fx0, fy0, fx1, fy1);
  };

  // Eine kleine Fläche kann keine zwei Kerne haben
  if (area < 2 * (CORE_MIN + Math.PI * GAP * GAP)) return finish(0);

  // 2. Abstand zum Rand der Fläche, Schachbrett-Näherung (gerade 3, schräg 4). Außerhalb der Fläche
  // steht überall null (Wand), auch außerhalb des Rechtecks; der Rand der Malfläche zählt als Wand.
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * S;
    const edgeRow = yy === 0 || yy === S - 1;
    for (let xx = x0; xx <= x1; xx++) {
      const i = row + xx;
      if (!mask[i]) continue;
      if (edgeRow || xx === 0 || xx === S - 1) {
        dist[i] = 3;
        continue;
      }
      let d = dist[i - 1] + 3;
      const a = dist[i - S - 1] + 4;
      const b = dist[i - S] + 3;
      const e = dist[i - S + 1] + 4;
      if (a < d) d = a;
      if (b < d) d = b;
      if (e < d) d = e;
      dist[i] = d;
    }
  }
  for (let yy = y1; yy >= y0; yy--) {
    const row = yy * S;
    if (yy === 0 || yy === S - 1) continue;
    for (let xx = x1; xx >= x0; xx--) {
      const i = row + xx;
      if (!mask[i] || xx === 0 || xx === S - 1) continue;
      let d = dist[i];
      const a = dist[i + 1] + 3;
      const b = dist[i + S + 1] + 4;
      const e = dist[i + S] + 3;
      const f = dist[i + S - 1] + 4;
      if (a < d) d = a;
      if (b < d) d = b;
      if (e < d) d = e;
      if (f < d) d = f;
      dist[i] = d;
    }
  }

  // 3. Kerne finden und nummerieren (Zeilen-Füllung). Zu kleine bekommen -1 und zählen nicht.
  const LIMIT = 3 * GAP;
  const core = (i) => mask[i] === 1 && label[i] === 0 && dist[i] > LIMIT;
  let cores = 0;
  let next = 1;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (!core(yy * S + xx)) continue;
      const id = next++;
      let size = 0;
      const spans = [];
      stack = [xx, yy];
      while (stack.length) {
        const sy = stack.pop();
        const sx = stack.pop();
        const row = sy * S;
        if (!core(row + sx)) continue;
        let l = sx;
        let rr = sx;
        while (l > x0 && core(row + l - 1)) l--;
        while (rr < x1 && core(row + rr + 1)) rr++;
        label.fill(id, row + l, row + rr + 1);
        size += rr - l + 1;
        spans.push(row + l, row + rr + 1);
        for (let ny = sy - 1; ny <= sy + 1; ny += 2) {
          if (ny < y0 || ny > y1) continue;
          const nrow = ny * S;
          let open = false;
          for (let k = l; k <= rr; k++) {
            if (core(nrow + k)) {
              if (!open) stack.push(k, ny);
              open = true;
            } else open = false;
          }
        }
      }
      if (size < CORE_MIN) for (let q = 0; q < spans.length; q += 2) label.fill(-1, spans[q], spans[q + 1]);
      else cores++;
    }
  }
  if (cores < 2) return finish(0);

  // 4. Jeden übrigen Punkt dem nächsten Kern zuteilen: Breitensuche von allen Kernrändern gleichzeitig,
  // in Zeilenfolge begonnen (so teilt jeder Browser gleich zu).
  let head = 0;
  let tail = 0;
  const open = (k) => mask[k] === 1 && label[k] <= 0;
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * S;
    for (let xx = x0; xx <= x1; xx++) {
      const i = row + xx;
      if (label[i] < 0) label[i] = 0;
    }
  }
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * S;
    for (let xx = x0; xx <= x1; xx++) {
      const i = row + xx;
      if (label[i] > 0 && ((xx > 0 && open(i - 1)) || (xx < S - 1 && open(i + 1)) || (yy > 0 && open(i - S)) || (yy < S - 1 && open(i + S)))) {
        queue[tail++] = i;
      }
    }
  }
  let id = 0;
  const claim = (k) => {
    if (mask[k] === 1 && label[k] === 0) {
      label[k] = id;
      queue[tail++] = k;
    }
  };
  while (head < tail) {
    const j = queue[head++];
    const jx = j % S;
    id = label[j];
    if (jx > 0) claim(j - 1);
    if (jx < S - 1) claim(j + 1);
    if (j >= S) claim(j - S);
    if (j < S * S - S) claim(j + S);
  }

  // 5. Füllen, was zum Kern des Klickpunkts gehört
  finish(label[y * S + x]);
}

export function applyOp(r, op) {
  if (op.t === 's') {
    const pts = decodePoints(op.p);
    if (pts) strokePieces(r, pts, op.c, radius(op.c, op.w), 0, true);
  } else if (op.t === 'l') {
    const pts = decodePoints(op.p, MAX_SHAPE);
    if (pts) polyline(r, pts, op.c, radius(op.c, op.w));
  } else if (op.t === 'f') flood(r, op.x, op.y, op.c);
  else if (op.t === 'c') {
    r.buf.fill(0);
    touch(r, 0, 0, S - 1, S - 1);
  }
}

const opKey = (op) =>
  op.t === 's' || op.t === 'l'
    ? `${op.s}${op.t}${op.c}.${op.w}:${op.p.length}:${op.p.slice(0, 6)}${op.p.slice(-6)}`
    : op.t === 'f'
      ? `${op.s}f${op.c}:${op.x},${op.y}`
      : `${op.s}c`;

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
export function syncRaster(r, active, preview) {
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

/** Raster mit allen Schritten einer fertigen Zeichnung (finalOps). */
export function rasterOf(ops) {
  const r = createRaster();
  for (const op of ops ?? []) applyOp(r, op);
  return r;
}

// ---------- Anzeige (nur im Browser) ----------

export const RGB = PALETTE.map(({ paint }) => [1, 3, 5].map((i) => parseInt(paint.slice(i, i + 2), 16)));
export const LUT = new Uint32Array(RGB.map(([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r)); // RGBA im Speicher

/** Raster in eine Leinwand malen: in voller Größe Punkt für Punkt, kleiner gemittelt (glättet die Kanten). */
export function paintRaster(canvas, r) {
  const n = canvas.width;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  if (n === S) {
    const px = new Uint32Array(img.data.buffer);
    for (let i = 0; i < S * S; i++) px[i] = LUT[r.buf[i]];
  } else {
    // Jeder Bildpunkt mittelt die Rasterpunkte, die er überdeckt (auch bei krummen Verhältnissen)
    const out = img.data;
    for (let y = 0; y < n; y++) {
      const ya = Math.floor((y * S) / n);
      const yb = Math.max(ya + 1, Math.floor(((y + 1) * S) / n));
      for (let x = 0; x < n; x++) {
        const xa = Math.floor((x * S) / n);
        const xb = Math.max(xa + 1, Math.floor(((x + 1) * S) / n));
        let rs = 0;
        let gs = 0;
        let bs = 0;
        for (let yy = ya; yy < yb; yy++) {
          const row = yy * S;
          for (let xx = xa; xx < xb; xx++) {
            const [cr, cg, cb] = RGB[r.buf[row + xx]];
            rs += cr;
            gs += cg;
            bs += cb;
          }
        }
        const area = (yb - ya) * (xb - xa);
        const o = (y * n + x) * 4;
        out[o] = rs / area;
        out[o + 1] = gs / area;
        out[o + 2] = bs / area;
        out[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Kleines Vorschaubild als JPEG-Daten-URL (Galerie), aus einem Raster. */
export function thumbnail(r, n = 160) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  paintRaster(canvas, r);
  return canvas.toDataURL('image/jpeg', 0.82);
}
