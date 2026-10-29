// Malbrett des Tagesbilds, ohne React: einmal bauen, danach nur Klassen, Attribute und die Leinwand ändern.
// Zeichnung und Raster: lib/malen.js (Skill „malflaeche“). Hier: Werkzeuge, Palette, Dicken, Formen mit
// Vorschau, Zoomen und Verschieben (zwei Finger, Mausrad mit Strg, Knöpfe), Zurück/Vor, Speichern.
//
// Speichern: eigene Befehle bleiben in `pending`, bis der Server sie bestätigt (höchstens alle zwei Sekunden,
// immer nur eine Anfrage unterwegs). `saved` ist der bestätigte Stand, gerechnet mit derselben Funktion wie
// auf dem Server (applyCmd). Offene Befehle liegen zusätzlich im Gerätespeicher: Schließt jemand die App
// ohne Netz, kommen sie beim nächsten Öffnen nach.

import {
  BLACK,
  PALETTE,
  S,
  SIZE_NAMES,
  applyCmd,
  createRaster,
  encodePoints,
  LUT,
  radius,
  shapePoints,
  syncRaster,
  thumbnail,
} from '@/lib/malen';
import { ICON } from './tagesbild-art';
import { storage } from './api';

const SAVE_EVERY = 2000;
const THUMB_EVERY = 20_000;
const ZOOM_MAX = 6;
const BATCH = 200;
const TOOLS = [
  ['stift', 'Stift'],
  ['eimer', 'Eimer: Fläche füllen'],
  ['radierer', 'Radierer'],
  ['linie', 'Linie'],
  ['rechteck', 'Rechteck'],
  ['kreis', 'Kreis'],
];
const SHAPES = new Set(['linie', 'rechteck', 'kreis']);
const DOTS = [3, 6, 10, 15, 22]; // Durchmesser der Punkte auf den Dicke-Knöpfen (px)

const clone = (d) => ({ ops: d.ops.slice(), n: d.n, seq: d.seq });
const randomId = () => Math.random().toString(36).slice(2, 12);

/**
 * Baut das Malbrett in `host`.
 * opts: { room, day, drawing ({ ops, n, seq }), send(msg) → Promise<Antwort>, onSaved(antwort), onNote?(text),
 *         reducedMotion }
 * @returns {{ finish(): Promise<Antwort>, lock(), unlock(), flush(), pendingCount(), paperRect(), destroy() }}
 */
export function createBoard(host, opts) {
  const ac = new AbortController();
  const { signal } = ac;
  const draftKey = `tagesbild.entwurf.${opts.room}.${opts.day}`;
  const u = {
    saved: clone(opts.drawing),
    pending: [],
    acked: opts.drawing.seq,
    dev: randomId(),
    tool: 'stift',
    color: BLACK,
    size: 2,
    stroke: null,
    shape: null,
    fillAt: null,
    pointers: new Map(),
    pinch: null,
    pan: null,
    hold: false, // nach zwei Fingern: nichts malen, bis alle Finger weg sind
    zoom: { z: 1, x: 0, y: 0 }, // Verschiebung in Bruchteilen der Blattbreite
    sending: false,
    lastSave: 0,
    lastThumb: 0,
    thumbSeq: opts.drawing.seq,
    locked: false,
    full: false,
    offline: false,
    note: '',
  };

  // Offene Befehle vom letzten Mal (App ohne Netz geschlossen)?
  try {
    const draft = JSON.parse(storage.get(draftKey) ?? 'null');
    const rest = draft?.cmds?.filter((c) => c.s > u.saved.seq) ?? [];
    if (rest.length && rest[0].s === u.saved.seq + 1) {
      const m = clone(u.saved);
      if (rest.every((c) => applyCmd(m, c))) {
        u.pending = rest;
        u.dev = draft.dev || u.dev;
      }
    } else if (draft) storage.remove(draftKey);
  } catch {}

  host.innerHTML = `
    <div class="tb-board" data-tool="stift">
      <div class="tb-paper">
        <div class="tb-zoom">
          <canvas class="tb-canvas" width="${S}" height="${S}" role="img" aria-label="Malfläche"></canvas>
          <canvas class="tb-overlay" width="${S}" height="${S}" aria-hidden="true"></canvas>
          <div class="tb-fx" aria-hidden="true"></div>
        </div>
        <div class="tb-cursor" hidden></div>
        <span class="tb-zoomlabel num" aria-hidden="true"></span>
      </div>
      <div class="tb-tools">
        <div class="tb-kinds" role="group" aria-label="Werkzeug">${TOOLS.map(
          ([id, label], i) =>
            `<button type="button" class="tb-tool" data-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="false" style="--i:${i}">${ICON[id]}</button>`,
        ).join('')}</div>
        <div class="tb-palette" role="group" aria-label="Farbe">${PALETTE.slice(1)
          .map(
            (p, i) =>
              `<button type="button" class="tb-swatch" data-color="${i + 1}" aria-label="${p.name}" title="${p.name}" aria-pressed="false" style="--c:${p.paint};--i:${i}"></button>`,
          )
          .join('')}</div>
        <div class="tb-row">
          <div class="tb-sizes" role="group" aria-label="Dicke">${SIZE_NAMES.map(
            (label, i) =>
              `<button type="button" class="tb-tool tb-size" data-size="${i}" aria-label="${label}" title="${label}" aria-pressed="false"><i style="--d:${DOTS[i]}px"></i></button>`,
          ).join('')}</div>
          <div class="tb-view" role="group" aria-label="Ansicht">
            <button type="button" class="tb-tool" data-zoom="out" aria-label="Verkleinern" title="Verkleinern">${ICON.weiter}</button>
            <button type="button" class="tb-tool" data-zoom="in" aria-label="Vergrößern" title="Vergrößern">${ICON.naeher}</button>
            <button type="button" class="tb-tool" data-zoom="fit" aria-label="Ganzes Bild" title="Ganzes Bild">${ICON.ganz}</button>
          </div>
        </div>
        <div class="tb-row tb-cmds">
          <button type="button" class="btn tb-cmd" data-cmd="u" aria-label="Zurück">${ICON.zurueck}<span>Zurück</span></button>
          <button type="button" class="btn tb-cmd" data-cmd="r" aria-label="Vor">${ICON.vor}<span>Vor</span></button>
          <button type="button" class="btn tb-cmd" data-cmd="c">${ICON.leeren}<span>Alles löschen</span></button>
        </div>
        <p class="tb-note" aria-live="polite"></p>
      </div>
    </div>`;

  const board = host.firstElementChild;
  const paper = board.querySelector('.tb-paper');
  const layer = board.querySelector('.tb-zoom');
  const canvas = board.querySelector('.tb-canvas');
  const overlay = board.querySelector('.tb-overlay');
  const fx = board.querySelector('.tb-fx');
  const cursor = board.querySelector('.tb-cursor');
  const zoomLabel = board.querySelector('.tb-zoomlabel');
  const noteEl = board.querySelector('.tb-note');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');
  const img = ctx.createImageData(S, S);
  const px = new Uint32Array(img.data.buffer);
  px.fill(LUT[0]);
  ctx.putImageData(img, 0, 0);
  const raster = createRaster();
  let model = currentModel();
  let paintQueued = false;

  // ---------- Stand und Anzeige ----------

  function currentModel() {
    const m = clone(u.saved);
    for (const cmd of u.pending) {
      if (cmd.s <= m.seq) continue;
      if (!applyCmd(m, cmd)) break;
    }
    return m;
  }

  function updateDrawing() {
    model = currentModel();
    syncRaster(raster, model.ops.slice(0, model.n), u.stroke);
    if (!paintQueued) {
      paintQueued = true;
      requestAnimationFrame(() => {
        paintQueued = false;
        paint();
      });
    }
    if (!u.stroke) syncCmds();
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

  function setNote(text) {
    u.note = text;
    const t = u.full ? 'Das Bild ist voll. Nimm etwas zurück oder lösche alles.' : text;
    if (noteEl.textContent !== t) noteEl.textContent = t;
  }

  function syncTools() {
    board.style.setProperty('--tb-cur', PALETTE[u.color].paint);
    board.dataset.tool = u.tool;
    for (const b of board.querySelectorAll('[data-color]')) b.setAttribute('aria-pressed', String(Number(b.dataset.color) === u.color));
    for (const b of board.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === u.tool));
    for (const b of board.querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === u.size));
    syncCmds();
  }

  function syncCmds() {
    const set = (sel, on) => {
      const b = board.querySelector(sel);
      if (b && b.disabled === on) b.disabled = !on;
    };
    const open = !u.locked;
    set('[data-cmd="u"]', open && model.n > 0);
    set('[data-cmd="r"]', open && model.n < model.ops.length);
    set('[data-cmd="c"]', open && model.n > 0 && model.ops[model.n - 1].t !== 'c');
    set('[data-zoom="out"]', u.zoom.z > 1);
    set('[data-zoom="fit"]', u.zoom.z > 1);
    set('[data-zoom="in"]', u.zoom.z < ZOOM_MAX);
  }

  // ---------- Befehle ----------

  const nextSeq = () => Math.max(u.saved.seq, u.pending[u.pending.length - 1]?.s ?? 0, u.stroke?.s ?? 0) + 1;

  // Neuer eigener Befehl: sofort zeigen, im Gerät merken, dann (gesammelt) speichern
  function issue(cmd) {
    if (cmd.s === undefined) cmd.s = nextSeq();
    u.full = applyCmd(currentModel(), cmd) === 'voll';
    u.pending.push(cmd);
    updateDrawing();
    setNote(u.note);
    keepDraft();
    flush();
  }

  let draftTimer = null;
  function keepDraft() {
    if (draftTimer) return;
    draftTimer = setTimeout(() => {
      draftTimer = null;
      if (u.pending.length) storage.set(draftKey, JSON.stringify({ dev: u.dev, cmds: u.pending }));
      else storage.remove(draftKey);
    }, 400);
  }

  function command(t) {
    endStroke();
    cancelShape();
    if (u.locked) return;
    if (t === 'u' && !model.n) return;
    if (t === 'r' && model.n >= model.ops.length) return;
    if (t === 'c') {
      if (!model.n || model.ops[model.n - 1].t === 'c') return;
      tearFx();
    }
    issue({ t });
  }

  // ---------- Speichern ----------

  let saveTimer = null;
  let retryTimer = null;
  let thumbTimer = null;

  async function flush(final = false) {
    if (u.sending || signal.aborted) return null;
    const left = u.pending.filter((c) => c.s > u.acked);
    const thumbDue = !u.stroke && u.thumbSeq !== (left.at(-1)?.s ?? u.acked);
    if (!left.length && !final && !(thumbDue && Date.now() - u.lastSave > 3000)) {
      if (thumbDue) scheduleThumb();
      return null;
    }
    const wait = u.lastSave + SAVE_EVERY - Date.now();
    if (!final && left.length && wait > 0) {
      if (!saveTimer) {
        saveTimer = setTimeout(() => {
          saveTimer = null;
          flush();
        }, wait);
      }
      return null;
    }
    clearTimeout(saveTimer);
    saveTimer = null;
    const batch = left.slice(0, BATCH);
    const all = batch.length === left.length;
    const msg = { t: 'malen', room: opts.room, day: opts.day, base: u.acked, dev: u.dev, cmds: batch };
    if (final && all) msg.fertig = true;
    if (all && !u.stroke && (final || Date.now() - u.lastThumb >= THUMB_EVERY || !batch.length)) {
      msg.thumb = thumbnail(raster);
      msg.thumbSeq = batch.at(-1)?.s ?? u.acked;
    }
    u.sending = true;
    u.lastSave = Date.now();
    if (!final) setNote('Speichert …');
    let body;
    try {
      body = await opts.send(msg);
    } catch (err) {
      u.sending = false;
      if (signal.aborted) return null;
      u.offline = Boolean(err.offline);
      setNote(err.offline ? 'Keine Verbindung. Dein Bild bleibt hier, bis sie wieder da ist.' : err.message);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => flush(final), err.offline ? 3000 : 6000);
      if (final) throw err;
      return null;
    }
    u.sending = false;
    if (signal.aborted) return body;
    u.offline = false;
    if (body.conflict) {
      // Auf einem anderen Gerät wurde inzwischen weitergemalt: dessen Stand gilt
      u.saved = clone(body.d);
      u.acked = body.d.seq;
      u.pending = [];
      u.thumbSeq = -1;
      storage.remove(draftKey);
      updateDrawing();
      setNote('Auf einem anderen Gerät wurde weitergemalt. Hier ist jetzt der neueste Stand.');
      if (final) throw Object.assign(new Error('Auf einem anderen Gerät wurde weitergemalt. Schau es dir an und schick dann nochmal ab.'), { conflict: true });
      return body;
    }
    if (body.done || body.late) {
      u.locked = true;
      board.classList.add('is-locked');
      opts.onSaved?.(body);
      return body;
    }
    // Bestätigte Befehle in den gespeicherten Stand übernehmen (wie der Server)
    const keep = [];
    for (const cmd of u.pending) {
      if (cmd.s <= body.seq) {
        if (cmd.s > u.saved.seq) applyCmd(u.saved, cmd);
      } else keep.push(cmd);
    }
    u.saved.seq = Math.max(u.saved.seq, body.seq);
    u.pending = keep;
    u.acked = body.seq;
    if (msg.thumb) {
      u.lastThumb = Date.now();
      u.thumbSeq = msg.thumbSeq;
    }
    keepDraft();
    setNote(u.pending.length ? 'Speichert …' : 'Alles gespeichert.');
    if (body.round) opts.onSaved?.(body);
    if (final && !msg.fertig) return flush(true);
    if (u.pending.length) flush();
    else scheduleThumb();
    return body;
  }

  // Nach einer Pause ein frisches Vorschaubild für die Galerie
  function scheduleThumb() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => !u.stroke && flush(), 4000);
  }

  // Beim Schließen der App: Offenes noch losschicken (die Antwort kommt nicht mehr an)
  const sendRest = () => {
    if (!u.pending.length || u.locked) return;
    const msg = { t: 'malen', room: opts.room, day: opts.day, base: u.acked, dev: u.dev, cmds: u.pending.slice(0, BATCH) };
    navigator.sendBeacon?.('/api/tagesbild', new Blob([JSON.stringify(msg)], { type: 'application/json' }));
  };
  window.addEventListener('pagehide', sendRest, { signal });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && sendRest(), { signal });

  // ---------- Zoomen ----------

  function applyZoom(animate) {
    const { z, x, y } = u.zoom;
    const w = paper.clientWidth;
    layer.classList.toggle('tb-anim', Boolean(animate) && !opts.reducedMotion);
    layer.style.transform = z === 1 ? '' : `translate(${x * w}px, ${y * w}px) scale(${z})`;
    paper.classList.toggle('is-zoomed', z > 1);
    zoomLabel.textContent = z > 1 ? `${Math.round(z * 10) / 10}×` : '';
    syncCmds();
  }

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

  const clampPan = ({ z, x, y }) => ({ z, x: Math.min(0, Math.max(1 - z, x)), y: Math.min(0, Math.max(1 - z, y)) });

  function panBy(dx, dy) {
    const w = paper.clientWidth || 1;
    u.zoom = clampPan({ ...u.zoom, x: u.zoom.x + dx / w, y: u.zoom.y + dy / w });
    applyZoom(false);
  }

  window.addEventListener('resize', () => applyZoom(false), { signal });

  // ---------- Werkzeugknöpfe und Tasten ----------

  board.querySelector('.tb-tools').addEventListener(
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
      if (u.locked) return;
      if (b.dataset.color) {
        u.color = Number(b.dataset.color);
        if (u.tool === 'radierer') u.tool = 'stift';
      } else if (b.dataset.tool) u.tool = b.dataset.tool;
      else if (b.dataset.size) u.size = Number(b.dataset.size);
      else if (b.dataset.cmd) command(b.dataset.cmd);
      syncTools();
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
    const rect = canvas.getBoundingClientRect();
    const fit = (v) => Math.min(S - 1, Math.max(0, Math.floor(v)));
    return [fit(((e.clientX - rect.left) / rect.width) * S), fit(((e.clientY - rect.top) / rect.height) * S)];
  };
  const local = (e) => {
    const r = paper.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function startPinch() {
    const [a, b] = [...u.pointers.values()];
    u.pinch = {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      zoom: { ...u.zoom },
    };
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
      if (u.locked) return;
      const p = pos(e);
      if (u.tool === 'eimer') u.fillAt = p;
      else if (SHAPES.has(u.tool)) u.shape = { kind: u.tool, a: p, b: p };
      else startStroke(p);
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
        u.shape.b = pos(e);
        drawShapePreview();
        return;
      }
      if (!u.stroke) return;
      const events = e.getCoalescedEvents?.() ?? [];
      let added = false;
      for (const ev of events.length ? events : [e]) added = addPoint(pos(ev)) || added;
      if (added) updateDrawing();
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
      if (e.type === 'pointerup' && !u.locked) fillAt(p);
    } else if (u.shape) commitShape(e.type === 'pointerup');
    else endStroke();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) paper.addEventListener(type, end, { signal });
  paper.addEventListener('pointerleave', () => (cursor.hidden = true), { signal });
  // iOS: die Seite nicht verschieben oder vergrößern, solange auf dem Blatt gemalt wird
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
    if (u.tool === 'eimer' || u.locked || u.pan) {
      cursor.hidden = true;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const [lx, ly] = local(e);
    const d = Math.max(4, (2 * radius(u.tool === 'radierer' ? 0 : u.color, u.size) * rect.width) / S);
    cursor.hidden = false;
    cursor.style.width = cursor.style.height = `${d}px`;
    cursor.style.transform = `translate(${lx - d / 2}px, ${ly - d / 2}px)`;
  }

  function startStroke(p) {
    u.stroke = { s: nextSeq(), c: u.tool === 'radierer' ? 0 : u.color, w: u.size, pts: [p], t0: performance.now() };
    updateDrawing();
  }

  // Neuer Punkt nur, wenn der Finger ein Stück weiter ist (hält die Zeichnung klein)
  function addPoint(p) {
    const st = u.stroke;
    const [lx, ly] = st.pts[st.pts.length - 1];
    const min = Math.max(2, radius(st.c, st.w) * 0.3);
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
    issue({ s: st.s, t: 's', c: st.c, w: st.w, p: encodePoints(st.pts) });
  }

  function cancelStroke() {
    u.stroke = null;
    updateDrawing();
  }

  function drawShapePreview() {
    const sh = u.shape;
    octx.clearRect(0, 0, S, S);
    if (!sh) return;
    const pts = shapePoints(sh.kind, sh.a, sh.b);
    octx.strokeStyle = PALETTE[u.color].paint;
    octx.lineWidth = 2 * radius(u.color, u.size);
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.beginPath();
    pts.forEach(([x, y], i) => (i ? octx.lineTo(x + 0.5, y + 0.5) : octx.moveTo(x + 0.5, y + 0.5)));
    octx.stroke();
  }

  function cancelShape() {
    if (!u.shape) return;
    u.shape = null;
    drawShapePreview();
  }

  function commitShape(ok) {
    const sh = u.shape;
    u.shape = null;
    drawShapePreview();
    if (!ok || u.locked) return;
    const [ax, ay] = sh.a;
    const [bx, by] = sh.b;
    if (Math.abs(bx - ax) < 3 && Math.abs(by - ay) < 3) return; // nur getippt
    issue({ t: 'l', c: u.color, w: u.size, p: encodePoints(shapePoints(sh.kind, sh.a, sh.b)) });
  }

  function fillAt([x, y]) {
    if (raster.buf[y * S + x] === u.color) return;
    rippleFx(x, y, u.color);
    issue({ t: 'f', c: u.color, x, y });
  }

  // Eimer: ein Ring in der Farbe läuft vom Klick aus auseinander
  function rippleFx(x, y, c) {
    if (opts.reducedMotion) return;
    const ring = document.createElement('i');
    ring.className = 'tb-ripple';
    ring.style.cssText = `left:${(x / S) * 100}%;top:${(y / S) * 100}%;--c:${PALETTE[c].paint}`;
    fx.append(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  // Alles löschen: das alte Blatt reißt ab und fällt weg
  function tearFx() {
    if (opts.reducedMotion) return;
    const sheet = document.createElement('canvas');
    sheet.width = sheet.height = 500;
    sheet.getContext('2d').drawImage(canvas, 0, 0, 500, 500);
    sheet.className = 'tb-torn';
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

  // ---------- Los ----------

  updateDrawing();
  syncTools();
  applyZoom(false);
  setNote(u.pending.length ? 'Speichert …' : '');
  if (u.pending.length) flush();

  return {
    // Abschicken: alles Offene mit „fertig“ speichern. Wirft bei Fehlern (Brett bleibt offen).
    async finish() {
      endStroke();
      cancelShape();
      u.locked = true;
      board.classList.add('is-locked');
      syncCmds();
      while (u.sending) await new Promise((r) => setTimeout(r, 60));
      try {
        const body = await flush(true);
        storage.remove(draftKey);
        return body;
      } catch (err) {
        u.locked = false;
        board.classList.remove('is-locked');
        syncCmds();
        throw err;
      }
    },
    // 23 Uhr: nicht mehr malen, Offenes noch speichern
    lock() {
      endStroke();
      cancelShape();
      u.locked = true;
      board.classList.add('is-locked');
      cursor.hidden = true;
      syncCmds();
      flush(false);
    },
    pendingCount: () => u.pending.length,
    paperRect: () => paper.getBoundingClientRect(),
    canvas,
    raster,
    destroy() {
      sendRest();
      ac.abort();
      clearTimeout(saveTimer);
      clearTimeout(retryTimer);
      clearTimeout(thumbTimer);
      clearTimeout(draftTimer);
      if (u.pending.length) storage.set(draftKey, JSON.stringify({ dev: u.dev, cmds: u.pending }));
    },
  };
}
