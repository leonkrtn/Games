// Die Bühne des Hais: Bühnenbild des Orts, der Hai und alle Bewegungen (Futter fliegt ins Maul, Glas kippt,
// Flecken wegschrubben, Herzchen, Wegschwimmen). Ohne React: Die Seite (components/Hai.js) baut die Bühne
// einmal und ruft danach nur Methoden auf, damit laufende Animationen nicht neu starten.

import { shark, stain, SPOTS, FOOD_ART, SPONGE, heart, INK } from './hai-art';
import { scene, NIGHT } from './hai-orte';

export const ACTOR = { x: 8, y: 96 };
const MOUTH = { x: ACTOR.x + 27, y: ACTOR.y + 76 };
const HEAD = { x: ACTOR.x + 46, y: ACTOR.y + 28 };
const FACES = {
  froh: { auge: 'auf', mund: 'froh', wange: true },
  mittel: { auge: 'auf', mund: 'mittel' },
  traurig: { auge: 'muede', mund: 'traurig' },
  schlaf: { auge: 'zu', mund: 'schlaf' },
  weg: { auge: 'auf', mund: 'mittel' },
};
// Krümel in der Farbe des Essens, Tropfen in der Farbe des Getränks
const CRUMB = {
  fischstaebchen: '#dc9b3f',
  apfel: '#d33a2c',
  spaghetti: '#f0d07a',
  croissant: '#d9963f',
  pizza: '#f2c94c',
  datteln: '#7a4425',
  banane: '#f2c94c',
  onigiri: '#fbfaf3',
  melone: '#e2574c',
  ananas: '#e9b53c',
  pancakes: '#e8b468',
  taco: '#f0c25a',
  wasser: '#a9cde3',
  milch: '#f7f2e4',
  apfelsaft: '#e7a93c',
  lassi: '#f0a830',
  tee: '#c2b25a',
  kokos: '#e6efe9',
  kakao: '#6b3f22',
};
const ARRIVE = 'cubic-bezier(.2,.8,.2,1)';
const PATH = 'cubic-bezier(.6,0,.2,1)';
const NS = 'http://www.w3.org/2000/svg';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (anim) => anim.finished.catch(() => {});

function node(parent, cls, html = '') {
  const g = document.createElementNS(NS, 'g');
  if (cls) g.setAttribute('class', cls);
  g.innerHTML = html;
  parent.append(g);
  return g;
}

// Weg auf einem Bogen von a nach b als Keyframes (nur transform)
function arc(a, b, lift, extra = () => '', n = 18) {
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x;
    const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y;
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${extra(t)}` };
  });
}
const at = (p, extra = '') => `translate(${p.x}px, ${p.y}px) ${extra}`;

/**
 * Baut die Bühne in `host`. onScrubbed() meldet, dass beim Putzen alle Flecken weg sind.
 * Rückgabe: Methoden zum Steuern, siehe unten.
 */
export function createStage(host, { onScrubbed } = {}) {
  host.innerHTML = `<svg class="hai-stage" viewBox="0 0 360 260" aria-hidden="true">
<svg class="hai-backdrop" width="360" height="260" viewBox="0 0 360 260"><g class="hai-scene"></g><g class="hai-scene-old"></g><g class="hai-night">${NIGHT}</g></svg>
<g class="hai-actor" transform="translate(${ACTOR.x} ${ACTOR.y})"><g class="hai-swim"><g class="hai-bob">${shark()}</g></g></g>
<g class="hai-zzz">${[0, 1, 2].map((i) => `<text x="${ACTOR.x + 70 + i * 12}" y="${ACTOR.y + 4 - i * 14}" style="animation-delay:${i * 0.8}s">Z</text>`).join('')}</g>
<g class="hai-fx"></g>
</svg>`;
  const svg = host.querySelector('.hai-stage');
  const $ = (sel) => svg.querySelector(sel);
  const fx = $('.hai-fx');
  const swim = $('.hai-swim');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctl = new AbortController();

  let state = { place: null, mood: 'froh', stains: [], away: false, night: false };
  let busy = 0; // laufende Animationen mit eigenem Gesicht
  let cleaning = null;

  const face = ({ auge, mund, wange }) => {
    if (auge) svg.dataset.auge = auge;
    if (mund) svg.dataset.mund = mund;
    if (wange !== undefined) svg.dataset.wange = wange ? '1' : '';
  };
  const restFace = () => {
    if (!busy) face({ wange: false, ...FACES[state.mood] });
  };
  const setStains = (list) => {
    $('.hai-stains').innerHTML = list.map(stain).join('');
  };

  // Bildschirmpunkt → Bühnenkoordinaten
  const toStage = (x, y) => {
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };

  function hearts(n = 4) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const g = node(fx, '', heart(0, 0, 1.3));
      const x = HEAD.x - 10 + i * 14;
      const sway = i % 2 ? 8 : -8;
      done(
        g.animate(
          [
            { transform: at({ x, y: HEAD.y }, 'scale(.3)'), opacity: 0 },
            { transform: at({ x: x + sway, y: HEAD.y - 22 }, 'scale(1)'), opacity: 1, offset: 0.3 },
            { transform: at({ x: x - sway, y: HEAD.y - 58 }, 'scale(.9)'), opacity: 0 },
          ],
          { duration: 1300, delay: i * 130, easing: ARRIVE, fill: 'both' },
        ),
      ).then(() => g.remove());
    }
  }

  function crumbs(item, p, n = 5) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const g = node(fx, '', `<circle r="${1.6 + (i % 3) * 0.6}" fill="${CRUMB[item] ?? '#d9963f'}" stroke="${INK}" stroke-width=".7"/>`);
      const dx = (Math.random() - 0.5) * 40;
      done(
        g.animate(
          [
            { transform: at(p), opacity: 1 },
            { transform: at({ x: p.x + dx * 0.6, y: p.y - 10 - Math.random() * 8 }), opacity: 1, offset: 0.35 },
            { transform: at({ x: p.x + dx, y: p.y + 26 }), opacity: 0 },
          ],
          { duration: 520, easing: 'ease-out', fill: 'both' },
        ),
      ).then(() => g.remove());
    }
  }

  function sparkle(p, n = 4, spread = 20) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const g = node(
        fx,
        '',
        `<path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#f2c94c" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`,
      );
      done(
        g.animate(
          [
            { transform: at(p, 'scale(.2) rotate(0deg)'), opacity: 0 },
            { transform: at({ x: p.x + Math.cos(a) * spread * 0.7, y: p.y + Math.sin(a) * spread * 0.7 }, 'scale(1) rotate(45deg)'), opacity: 1, offset: 0.45 },
            { transform: at({ x: p.x + Math.cos(a) * spread, y: p.y + Math.sin(a) * spread }, 'scale(.4) rotate(90deg)'), opacity: 0 },
          ],
          { duration: 700, delay: i * 60, easing: ARRIVE, fill: 'both' },
        ),
      ).then(() => g.remove());
    }
  }

  function bubble(p) {
    const r = 3 + Math.random() * 4;
    const g = node(fx, 'hai-bubble', `<circle r="${r.toFixed(1)}" fill="#fff" stroke="${INK}" stroke-width=".8"/><circle cx="${(-r * 0.35).toFixed(1)}" cy="${(-r * 0.35).toFixed(1)}" r="${(r * 0.25).toFixed(1)}" fill="#cfe3ee"/>`);
    const q = { x: p.x + (Math.random() - 0.5) * 18, y: p.y + (Math.random() - 0.5) * 12 };
    done(
      g.animate(
        [
          { transform: at(q, 'scale(.3)'), opacity: 1 },
          { transform: at({ x: q.x, y: q.y - 6 }, 'scale(1)'), opacity: 1, offset: 0.4 },
          { transform: at({ x: q.x + 4, y: q.y - 18 }, 'scale(1.1)'), opacity: 0 },
        ],
        { duration: 800, easing: 'ease-out', fill: 'both' },
      ),
    ).then(() => g.remove());
  }

  // Reaktion nach dem Essen oder Trinken: mag / nicht / normal
  async function react(r) {
    if (r === 'mag') {
      face({ auge: 'froh', mund: 'froh', wange: true });
      hearts(5);
      if (!reduced())
        await done(swim.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }], { duration: 700, easing: 'ease-in-out' }));
      await wait(reduced() ? 900 : 500);
    } else if (r === 'nicht') {
      face({ auge: 'froh', mund: 'baeh', wange: false });
      if (!reduced())
        await done(swim.animate([0, -5, 5, -4, 4, 0].map((d) => ({ transform: `rotate(${d}deg)` })), { duration: 620, easing: 'ease-in-out' }));
      await wait(reduced() ? 900 : 400);
    } else {
      face({ auge: 'froh', mund: 'froh', wange: true });
      if (!reduced()) await done(swim.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }], { duration: 380, easing: 'ease-in-out' }));
      await wait(reduced() ? 700 : 300);
    }
  }

  function flyer(item) {
    return node(fx, 'hai-flying', `<g transform="translate(-20 -20)">${FOOD_ART[item] ?? ''}</g>`);
  }
  async function dropAway(g, p) {
    if (!reduced()) await done(g.animate([{ transform: at(p), opacity: 1 }, { transform: at({ x: p.x + 10, y: p.y + 70 }, 'rotate(40deg)'), opacity: 0 }], { duration: 420, easing: 'ease-in', fill: 'forwards' }));
    g.remove();
  }

  const api = {
    svg,
    /** Zustand zeigen: { place, mood, stains: [Stellen], away, night }. first = Auftakt beim Öffnen. */
    update(next, { first = false } = {}) {
      const prev = state;
      state = { ...state, ...next };
      if (state.place !== prev.place) {
        const old = $('.hai-scene');
        const leaving = $('.hai-scene-old');
        if (prev.place && !reduced()) {
          leaving.innerHTML = old.innerHTML;
          done(leaving.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' })).then(() => {
            leaving.innerHTML = '';
          });
          done(swim.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 520, easing: 'ease-in-out' }));
        }
        old.innerHTML = scene(state.place);
      }
      svg.dataset.nacht = state.night ? '1' : '';
      svg.dataset.schlaf = state.mood === 'schlaf' && !state.away ? '1' : '';
      if (!cleaning && state.stains.join() !== prev.stains.join()) setStains(state.stains);
      if (state.away !== prev.away) {
        if (state.away) {
          if (!first && !reduced()) {
            done(swim.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-260px)' }], { duration: 900, easing: PATH, fill: 'forwards' })).then(() => {
              svg.dataset.weg = state.away ? '1' : '';
            });
          } else svg.dataset.weg = '1';
        } else {
          svg.dataset.weg = '';
          if (!first && !reduced()) swim.animate([{ transform: 'translateX(-260px)' }, { transform: 'translateX(0)' }], { duration: 900, easing: ARRIVE });
        }
      }
      restFace();
      if (first && !reduced()) {
        $('.hai-backdrop').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: ARRIVE });
        if (!state.away)
          swim.animate([{ transform: 'translateX(-180px)', opacity: 0 }, { transform: 'translateX(-60px)', opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 760, delay: 120, easing: ARRIVE, fill: 'backwards' });
      }
    },

    /** Futter fliegt von `from` (Bildschirmpunkt) ins Maul. result = Promise der Server-Antwort. */
    async feed(item, from, result) {
      busy++;
      const start = from ? toStage(from.x, from.y) : { x: 230, y: 300 };
      const end = { x: MOUTH.x + 4, y: MOUTH.y - 2 };
      const g = flyer(item);
      try {
        if (!reduced()) {
          setTimeout(() => face({ mund: 'auf', auge: 'auf' }), 360);
          await done(g.animate(arc(start, end, 60, (t) => `rotate(${(-40 + 40 * t).toFixed(1)}deg) scale(${(0.85 + 0.15 * t).toFixed(2)})`), { duration: 620, easing: PATH, fill: 'forwards' }));
        } else g.style.transform = at(end);
        let res;
        try {
          res = await result;
        } catch (err) {
          face(FACES[state.mood]);
          await dropAway(g, end);
          throw err;
        }
        for (const s of [0.7, 0.4, 0]) {
          face({ mund: 'auf' });
          if (!reduced()) await wait(110);
          face({ mund: 'mittel' });
          crumbs(item, end, 3);
          g.style.transform = at(end, `scale(${s})`);
          if (!reduced()) await wait(130);
        }
        g.remove();
        await react(res?.event?.r);
        return res;
      } finally {
        g.remove();
        busy--;
        restFace();
      }
    },

    /** Glas fliegt ans Maul, kippt, wird leer. */
    async drink(item, from, result) {
      busy++;
      const start = from ? toStage(from.x, from.y) : { x: 230, y: 300 };
      const end = { x: MOUTH.x - 12, y: MOUTH.y - 14 };
      const g = flyer(item);
      try {
        if (!reduced()) {
          await done(g.animate(arc(start, end, 50), { duration: 560, easing: PATH, fill: 'forwards' }));
          face({ mund: 'auf' });
          await done(g.animate([{ transform: at(end) }, { transform: at(end, 'rotate(52deg)') }], { duration: 260, easing: ARRIVE, fill: 'forwards' }));
        } else g.style.transform = at(end);
        let res;
        try {
          res = await result;
        } catch (err) {
          face(FACES[state.mood]);
          await dropAway(g, end);
          throw err;
        }
        if (!reduced()) {
          const liquid = g.querySelector('.hai-liquid');
          liquid?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)' }], { duration: 900, easing: 'ease-in-out', fill: 'forwards' });
          for (let i = 0; i < 3; i++) {
            crumbs(item, { x: MOUTH.x + 2, y: MOUTH.y }, 1);
            await done(swim.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025, .975)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-in-out' }));
          }
          face({ mund: 'mittel' });
          await done(g.animate([{ transform: at(end, 'rotate(52deg)'), opacity: 1 }, { transform: at({ x: end.x + 40, y: end.y + 90 }, 'rotate(10deg) scale(.7)'), opacity: 0 }], { duration: 420, easing: PATH, fill: 'forwards' }));
        }
        g.remove();
        await react(res?.event?.r);
        return res;
      } finally {
        g.remove();
        busy--;
        restFace();
      }
    },

    /** Kurze Anzeige, dass jemand anderes gefüttert oder geputzt hat (ohne Flug). */
    async remote(kind, item) {
      if (busy || cleaning || state.away) return;
      busy++;
      try {
        if (kind === 'putzen') {
          sparkle({ x: ACTOR.x + 80, y: ACTOR.y + 50 }, 6, 60);
          await react(null);
        } else if (item) {
          const g = flyer(item);
          const p = { x: MOUTH.x + 4, y: MOUTH.y - 2 };
          g.style.transform = at(p, 'scale(.8)');
          face({ mund: 'auf' });
          await wait(reduced() ? 400 : 260);
          for (const s of [0.5, 0]) {
            crumbs(item, p, 2);
            g.style.transform = at(p, `scale(${s})`);
            face({ mund: s ? 'mittel' : 'auf' });
            await wait(reduced() ? 100 : 160);
          }
          g.remove();
          await react(null);
        }
      } finally {
        busy--;
        restFace();
      }
    },

    /** Freuen (z.B. nach dem Putzen). */
    async cheer(r = null) {
      busy++;
      try {
        await react(r);
      } finally {
        busy--;
        restFace();
      }
    },

    /** Kopfschütteln, z.B. wenn er satt ist. */
    async refuse() {
      busy++;
      face({ auge: 'zu', mund: 'mittel', wange: false });
      if (!reduced()) await done(swim.animate([0, -4, 4, -3, 3, 0].map((d) => ({ transform: `rotate(${d}deg)` })), { duration: 560, easing: 'ease-in-out' }));
      else await wait(600);
      busy--;
      restFace();
    },

    /** Putzen: Schwamm folgt dem Finger, Flecken verblassen beim Schrubben. */
    startCleaning() {
      if (cleaning) return;
      const dirt = new Map(state.stains.map((i) => [i, 1]));
      const sponge = node(fx, 'hai-sponge', `<g transform="translate(-22 -26) scale(1.1)">${SPONGE}</g>`);
      sponge.style.transform = at({ x: 250, y: 190 }, 'rotate(-12deg)');
      svg.classList.add('putzen');
      const local = new AbortController();
      cleaning = { dirt, sponge, local, last: null, lastBubble: 0, finished: false };
      const finish = () => {
        if (cleaning.finished) return;
        cleaning.finished = true;
        sparkle({ x: ACTOR.x + 80, y: ACTOR.y + 50 }, 8, 70);
        onScrubbed?.();
      };
      const scrub = (p, dist) => {
        const lx = p.x - ACTOR.x;
        const ly = p.y - ACTOR.y;
        for (const [i, d] of dirt) {
          const s = SPOTS[i];
          if (Math.hypot(lx - s.x, ly - s.y) > s.r + 16) continue;
          const left = d - dist * 0.03;
          const el = svg.querySelector(`.hai-fleck[data-fleck="${i}"]`);
          if (left <= 0) {
            dirt.delete(i);
            if (el) el.style.opacity = '0';
            sparkle({ x: ACTOR.x + s.x, y: ACTOR.y + s.y }, 3, 14);
          } else {
            dirt.set(i, left);
            if (el) el.style.opacity = String(Math.max(0.15, left));
          }
        }
        if (!dirt.size) finish();
      };
      cleaning.scrub = scrub;
      const move = (e, pressed) => {
        const p = toStage(e.clientX, e.clientY);
        sponge.style.transform = at(p, 'rotate(-12deg)');
        if (!pressed) return;
        const dist = cleaning.last ? Math.hypot(p.x - cleaning.last.x, p.y - cleaning.last.y) : 6;
        cleaning.last = p;
        scrub(p, Math.min(dist, 30));
        const now = performance.now();
        if (now - cleaning.lastBubble > 45 && !reduced()) {
          cleaning.lastBubble = now;
          bubble(p);
        }
      };
      let down = false;
      svg.addEventListener(
        'pointerdown',
        (e) => {
          down = true;
          cleaning.last = null;
          svg.setPointerCapture?.(e.pointerId);
          move(e, true);
          e.preventDefault();
        },
        { signal: local.signal },
      );
      svg.addEventListener('pointermove', (e) => move(e, down), { signal: local.signal });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'])
        svg.addEventListener(
          t,
          () => {
            down = false;
            cleaning && (cleaning.last = null);
          },
          { signal: local.signal },
        );
      if (!dirt.size) finish();
    },

    /** Für Tastatur und alle, die nicht schrubben mögen: der Schwamm fährt selbst über jeden Fleck. */
    async autoScrub() {
      if (!cleaning) return;
      const { sponge, dirt } = cleaning;
      for (const i of [...dirt.keys()]) {
        if (!cleaning) return;
        const s = SPOTS[i];
        const p = { x: ACTOR.x + s.x, y: ACTOR.y + s.y };
        if (!reduced()) {
          await done(sponge.animate([{ transform: sponge.style.transform || at(p) }, { transform: at(p, 'rotate(-12deg)') }], { duration: 260, easing: PATH, fill: 'forwards' }));
          sponge.style.transform = at(p, 'rotate(-12deg)');
          for (let k = 0; k < 4 && cleaning; k++) {
            const q = { x: p.x + (k % 2 ? 7 : -7), y: p.y + (k % 2 ? -3 : 3) };
            await done(sponge.animate([{ transform: sponge.style.transform }, { transform: at(q, 'rotate(-12deg)') }], { duration: 90, fill: 'forwards' }));
            sponge.style.transform = at(q, 'rotate(-12deg)');
            bubble(q);
            cleaning?.scrub(q, 9);
          }
        }
        cleaning?.scrub(p, 100);
      }
    },

    stopCleaning() {
      if (!cleaning) return;
      cleaning.local.abort();
      cleaning.sponge.remove();
      cleaning = null;
      svg.classList.remove('putzen');
      setStains(state.stains);
    },

    get cleaning() {
      return Boolean(cleaning);
    },

    destroy() {
      api.stopCleaning();
      ctl.abort();
      host.innerHTML = '';
    },
  };
  return api;
}
