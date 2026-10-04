'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playerColor } from '@/lib/colors';

/*
  Reaktionen im Spielzimmer: fünf gezeichnete Gesichter, die man den anderen schicken kann, in jedem
  Spiel und in der Lobby. Sie gehen über den Live-Kanal des Raums (wie game.live, siehe live.js),
  werden nicht gespeichert und erreichen nur, wer gerade im Raum ist. Ein Gesicht steigt mit dem Namen
  über dem Spiel auf; onShow meldet es dem Raum, der es kurz neben dem Namen in der Anzeigetafel zeigt.
  Höchstens eine Reaktion pro Sekunde; der Empfänger bremst jeden Absender ebenfalls.

  useReactions (im Raum) schickt und empfängt. Auf dem Handy öffnet ein Knopf unten rechts die Leiste
  (Reactions), am PC stehen die Gesichter fest in der Seitenleiste unter der Anzeigetafel (ReactionDock).
*/

export const REACTIONS = [
  { id: 'lachen', label: 'Lachen', verb: 'lacht' },
  { id: 'verliebt', label: 'Verliebt', verb: 'ist verliebt' },
  { id: 'staunen', label: 'Staunen', verb: 'staunt' },
  { id: 'traurig', label: 'Traurig', verb: 'ist traurig' },
  { id: 'wuetend', label: 'Wütend', verb: 'ist wütend' },
];
const BY_ID = new Map(REACTIONS.map((r) => [r.id, r]));
const GAP = 1000; // ms zwischen zwei eigenen Reaktionen
const AUTO_CLOSE = 5000; // die Leiste klappt nach so langer Ruhe wieder zu

// Gezeichnet nach dem Skill „zeichnen“ (40er-viewBox, Tuschekontur, Licht oben links)
const SVG = {
  lachen: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#f2c230"/> <path d="M30.71 6.79 A17 17 0 1 1 6.79 30.71 A17 17 0 0 0 30.71 6.79 Z" fill="#d9a521"/> <path d="M8.5 13.5 A13 13 0 0 1 16 6.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/> <circle cx="20" cy="20" r="17" fill="none" stroke="#141414" stroke-width="1.8"/> <g fill="none" stroke="#141414" stroke-width="1.9" stroke-linecap="round"><path d="M11 17 Q14 12.5 17 17"/><path d="M23 17 Q26 12.5 29 17"/></g> <circle cx="9.6" cy="21" r="2" fill="#ec9a8f"/><circle cx="30.4" cy="21" r="2" fill="#ec9a8f"/> <path d="M11.5 21.5 H28.5 Q28 31.5 20 31.5 Q12 31.5 11.5 21.5 Z" fill="#141414" stroke="#141414" stroke-width="1.4" stroke-linejoin="round"/> <path d="M14.5 28.6 Q20 24.6 25.5 28.6 Q23.5 31 20 31 Q16.5 31 14.5 28.6 Z" fill="#d33a2c"/> <path d="M13 22.6 H27 V24 Q20 25 13 24 Z" fill="#fff"/></svg>`,
  verliebt: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#f2c230"/> <path d="M30.71 6.79 A17 17 0 1 1 6.79 30.71 A17 17 0 0 0 30.71 6.79 Z" fill="#d9a521"/> <path d="M8.5 13.5 A13 13 0 0 1 16 6.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/> <circle cx="20" cy="20" r="17" fill="none" stroke="#141414" stroke-width="1.8"/> <path transform="translate(13.5 16.5) scale(1)" d="M0 3.2 C -1.6 0.4, -5.6 0.6, -5.6 -2.6 C -5.6 -5, -2.6 -6.2, 0 -3.4 C 2.6 -6.2, 5.6 -5, 5.6 -2.6 C 5.6 0.6, 1.6 0.4, 0 3.2 Z" fill="#d33a2c" stroke="#141414" stroke-width="1.1" stroke-linejoin="round"/><path transform="translate(26.5 16.5) scale(1)" d="M0 3.2 C -1.6 0.4, -5.6 0.6, -5.6 -2.6 C -5.6 -5, -2.6 -6.2, 0 -3.4 C 2.6 -6.2, 5.6 -5, 5.6 -2.6 C 5.6 0.6, 1.6 0.4, 0 3.2 Z" fill="#d33a2c" stroke="#141414" stroke-width="1.1" stroke-linejoin="round"/> <path d="M13 24.5 Q20 31.5 27 24.5" fill="none" stroke="#141414" stroke-width="1.9" stroke-linecap="round"/> <circle cx="9.8" cy="23" r="2" fill="#ec9a8f"/><circle cx="30.2" cy="23" r="2" fill="#ec9a8f"/></svg>`,
  staunen: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#f2c230"/> <path d="M30.71 6.79 A17 17 0 1 1 6.79 30.71 A17 17 0 0 0 30.71 6.79 Z" fill="#d9a521"/> <path d="M8.5 13.5 A13 13 0 0 1 16 6.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/> <circle cx="20" cy="20" r="17" fill="none" stroke="#141414" stroke-width="1.8"/> <g fill="none" stroke="#141414" stroke-width="1.6" stroke-linecap="round"><path d="M10.5 10.5 Q13.5 8 16.5 10"/><path d="M23.5 10 Q26.5 8 29.5 10.5"/></g> <circle cx="14" cy="16.5" r="3.6" fill="#fff" stroke="#141414" stroke-width="1.5"/><circle cx="26" cy="16.5" r="3.6" fill="#fff" stroke="#141414" stroke-width="1.5"/> <circle cx="14.3" cy="17" r="1.6" fill="#141414"/><circle cx="26.3" cy="17" r="1.6" fill="#141414"/> <ellipse cx="20" cy="27.5" rx="3.4" ry="4.2" fill="#141414"/></svg>`,
  traurig: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#f2c230"/> <path d="M30.71 6.79 A17 17 0 1 1 6.79 30.71 A17 17 0 0 0 30.71 6.79 Z" fill="#d9a521"/> <path d="M8.5 13.5 A13 13 0 0 1 16 6.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/> <circle cx="20" cy="20" r="17" fill="none" stroke="#141414" stroke-width="1.8"/> <g fill="none" stroke="#141414" stroke-width="1.7" stroke-linecap="round"><path d="M10.5 13.5 Q13.5 13.5 16.5 10.8"/><path d="M23.5 10.8 Q26.5 13.5 29.5 13.5"/></g> <ellipse cx="14" cy="18" rx="1.7" ry="2.2" fill="#141414"/><ellipse cx="26" cy="18" rx="1.7" ry="2.2" fill="#141414"/> <path d="M14 29.5 Q19.5 24.5 25 29.5" fill="none" stroke="#141414" stroke-width="1.9" stroke-linecap="round"/> <path d="M28.6 20.6 Q31.2 24.5 31.2 25.9 A2.6 2.6 0 0 1 26 25.9 Q26 24.5 28.6 20.6 Z" fill="#5a8fc8" stroke="#141414" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
  wuetend: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#ec7a3c"/> <path d="M30.71 6.79 A17 17 0 1 1 6.79 30.71 A17 17 0 0 0 30.71 6.79 Z" fill="#c95f26"/> <path d="M8.5 13.5 A13 13 0 0 1 16 6.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/> <circle cx="20" cy="20" r="17" fill="none" stroke="#141414" stroke-width="1.8"/> <g fill="none" stroke="#141414" stroke-width="2.2" stroke-linecap="round"><path d="M10 12 L17 15"/><path d="M30 12 L23 15"/></g> <ellipse cx="14.5" cy="18.5" rx="1.7" ry="1.9" fill="#141414"/><ellipse cx="25.5" cy="18.5" rx="1.7" ry="1.9" fill="#141414"/> <rect x="13" y="25" width="14" height="5.5" rx="1.6" fill="#fff" stroke="#141414" stroke-width="1.6"/> <path d="M13.5 27.7 H26.5 M17.7 25.4 V30 M22.3 25.4 V30" stroke="#141414" stroke-width="1"/></svg>`,
};

/** Ein Gesicht als Bild (Bedeutung steht im umgebenden Element). */
export function Face({ id, className = '' }) {
  return <span className={`face ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SVG[id] ?? '' }} />;
}

const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

// Ein Gesicht steigt von unten über dem Spiel auf und verblasst (eigene rechts, die der anderen verteilt).
// Auch am PC von unten: Die Seitenleiste steht oben, von dort aus flöge es aus dem Bild.
function fly(layer, id, name, color, own) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'react-fly';
  el.style.left = `${own ? 74 + Math.random() * 10 : 14 + Math.random() * 58}%`;
  el.innerHTML = `<span class="face">${SVG[id]}</span><span class="react-name"></span>`;
  const label = el.querySelector('.react-name');
  label.textContent = name;
  label.style.color = color;
  layer.append(el);
  const done = () => el.remove();
  if (reduced) {
    el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1800 }).finished.then(done, done);
    return;
  }
  el.animate(
    [
      { transform: 'translate(-50%, 0) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%, -7vh) scale(1)', opacity: 1, offset: 0.16 },
      { transform: 'translate(-50%, -24vh) scale(1)', opacity: 1, offset: 0.62 },
      { transform: 'translate(-50%, -36vh) scale(.92)', opacity: 0 },
    ],
    { duration: 2600, easing: 'cubic-bezier(.2,.8,.2,1)' },
  ).finished.then(done, done);
  el.querySelector('.face').animate([{ transform: 'translateX(-7px) rotate(-6deg)' }, { transform: 'translateX(7px) rotate(6deg)' }], {
    duration: 650,
    direction: 'alternate',
    iterations: 4,
    easing: 'ease-in-out',
  });
}

/**
 * Schicken und Empfangen. live = Live-Kanal des Raums (createLive), players = Spieler des Raums,
 * onShow(from, id) für die Anzeigetafel. Rückgabe für Reactions und ReactionDock:
 * { send(id), cool (eine Sekunde nach dem Schicken), said (Ansage), layer (Ebene für die Gesichter) }
 */
export function useReactions({ live, players, me, onShow }) {
  const [cool, setCool] = useState(false);
  const [said, setSaid] = useState('');
  const layer = useRef(null);
  const lastSent = useRef(0);
  const lastFrom = useRef(new Map());
  const playersRef = useRef(players);
  playersRef.current = players;

  const show = useCallback(
    (from, id, own) => {
      const list = playersRef.current;
      const p = list.find((q) => q.id === from);
      if (!p || !layer.current) return;
      fly(layer.current, id, p.name, playerColor(list, from), own);
      onShow?.(from, id);
      if (!own) setSaid(`${p.name} ${BY_ID.get(id).verb}.`);
    },
    [onShow],
  );

  // Reaktionen der anderen: nur bekannte Gesichter von Mitspielern, höchstens etwa eine pro Sekunde und Person
  useEffect(
    () =>
      live.on((m) => {
        if (!m || typeof m.react !== 'string' || !BY_ID.has(m.react) || m.from === me) return;
        const t = Date.now();
        if (t - (lastFrom.current.get(m.from) ?? 0) < GAP * 0.8) return;
        lastFrom.current.set(m.from, t);
        show(m.from, m.react, false);
      }),
    [live, me, show],
  );

  const send = useCallback(
    (id) => {
      const t = Date.now();
      if (!me || t - lastSent.current < GAP) return;
      lastSent.current = t;
      live.send({ react: id, from: me });
      show(me, id, true);
      setCool(true);
      setTimeout(() => setCool(false), GAP);
    },
    [live, me, show],
  );

  return { send, cool, said, layer };
}

function FaceButtons({ reactions }) {
  return REACTIONS.map((r, i) => (
    <button
      key={r.id}
      type="button"
      className="react-face"
      data-react={r.id}
      style={{ '--i': i }}
      aria-label={r.label}
      title={r.label}
      onClick={() => reactions.send(r.id)}
    >
      <Face id={r.id} />
    </button>
  ));
}

/** PC (breite Ansicht): die fünf Gesichter fest in der Seitenleiste, unter der Anzeigetafel. */
export function ReactionDock({ reactions }) {
  return (
    <div className="react-dock">
      <p className="board-caption" id="react-dock-label">
        Reagieren
      </p>
      <div className={`react-row ${reactions.cool ? 'cool' : ''}`} role="group" aria-labelledby="react-dock-label">
        <FaceButtons reactions={reactions} />
      </div>
    </div>
  );
}

/**
 * Ebene für aufsteigende Gesichter, Ansage für Bildschirmleser und (Handy) der Knopf unten rechts mit
 * ausklappbarer Leiste. Am PC blendet das CSS den Knopf aus, dort gibt es ReactionDock.
 */
export default function Reactions({ reactions }) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const box = useRef(null);
  const closeTimer = useRef(null);

  const keepOpen = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), AUTO_CLOSE);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Zuklappen: Tippen daneben oder Escape
  useEffect(() => {
    if (!open) return;
    keepOpen();
    const outside = (e) => !box.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open, keepOpen]);

  // Solange ein Textfeld den Fokus hat (Tastatur auf dem Handy), weicht der Knopf aus.
  useEffect(() => {
    const field = (t) => t instanceof HTMLElement && t.matches('input:not([type=checkbox]):not([type=radio]), textarea, select');
    const on = (e) => field(e.target) && setTyping(true);
    const off = (e) => field(e.target) && setTyping(false);
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => {
      document.removeEventListener('focusin', on);
      document.removeEventListener('focusout', off);
    };
  }, []);

  return (
    <>
      <div className="react-layer" ref={reactions.layer} aria-hidden="true" />
      <div className="sr-only" role="status" aria-live="polite">
        {reactions.said}
      </div>
      <div className={`react ${typing ? 'away' : ''}`} ref={box} id="reactions" onClick={() => open && keepOpen()}>
        {open && (
          <div className={`react-tray ${reactions.cool ? 'cool' : ''}`} role="group" aria-label="Reaktion schicken">
            <FaceButtons reactions={reactions} />
          </div>
        )}
        <button
          type="button"
          className="react-toggle"
          aria-expanded={open}
          aria-label={open ? 'Reaktionen schließen' : 'Reaktion schicken'}
          onClick={() => setOpen(!open)}
        >
          {open ? <span className="react-close" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CLOSE }} /> : <Face id="lachen" />}
        </button>
      </div>
    </>
  );
}
