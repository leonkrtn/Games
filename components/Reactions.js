'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playerColor } from '@/lib/colors';

/*
  Reaktionen im Spielzimmer: zwölf gezeichnete Gesichter und ein paar Sprüche („Ouuufff“), die man den
  anderen schicken kann, in jedem Spiel und in der Lobby. Sie gehen über den Live-Kanal des Raums (wie game.live, siehe live.js),
  werden nicht gespeichert und erreichen nur, wer gerade im Raum ist. Ein Gesicht steigt mit dem Namen
  über dem Spiel auf; onShow meldet es dem Raum, der es kurz neben dem Namen in der Anzeigetafel zeigt.
  Höchstens eine Reaktion pro Sekunde; der Empfänger bremst jeden Absender ebenfalls.

  useReactions (im Raum) schickt und empfängt. Auf dem Handy öffnet ein Knopf unten rechts die Leiste
  (Reactions), am PC stehen die Gesichter fest in der Seitenleiste unter der Anzeigetafel (ReactionDock).
*/

// Reihenfolge = Reihenfolge in der Leiste. Die ids gehen über den Live-Kanal: nicht umbenennen.
export const REACTIONS = [
  { id: 'lachen', label: 'Lachen', verb: 'lacht' },
  { id: 'traenen', label: 'Tränen lachen', verb: 'lacht Tränen' },
  { id: 'verliebt', label: 'Verliebt', verb: 'ist verliebt' },
  { id: 'zwinkern', label: 'Zwinkern', verb: 'zwinkert' },
  { id: 'frech', label: 'Zunge zeigen', verb: 'zeigt die Zunge' },
  { id: 'cool', label: 'Cool', verb: 'ist cool' },
  { id: 'staunen', label: 'Staunen', verb: 'staunt' },
  { id: 'nervoes', label: 'Nervös', verb: 'ist nervös' },
  { id: 'augenrollen', label: 'Augen verdrehen', verb: 'verdreht die Augen' },
  { id: 'gaehnen', label: 'Gähnen', verb: 'gähnt' },
  { id: 'traurig', label: 'Traurig', verb: 'ist traurig' },
  { id: 'wuetend', label: 'Wütend', verb: 'ist wütend' },
];
// Sprüche: steigen als Sprechblase auf statt als Gesicht.
export const WORDS = [
  { id: 'ouf', text: 'Ouuufff' },
  { id: 'puh', text: 'Puh' },
  { id: 'oha', text: 'Oha' },
  { id: 'jaaa', text: 'Jaaa' },
  { id: 'neeein', text: 'Neeein' },
  { id: 'na-warte', text: 'Na warte' },
  { id: 'glueck', text: 'Glück gehabt' },
  { id: 'gg', text: 'Gut gespielt' },
];
const BY_ID = new Map([...REACTIONS, ...WORDS.map((w) => ({ ...w, label: w.text, word: true }))].map((r) => [r.id, r]));
const GAP = 1000; // ms zwischen zwei eigenen Reaktionen
const AUTO_CLOSE = 5000; // die Leiste klappt nach so langer Ruhe wieder zu

// Gezeichnet nach dem Skill „zeichnen“ (40er-viewBox, Tuschekontur, Licht oben links). Alle Gesichter haben
// dieselbe Grundform: Fläche, Schattensichel unten rechts innerhalb der Kontur, Glanz oben links, Kontur.
const INK = '#141414';
const face = (inner, fill = '#f2c230', shade = '#d9a521') =>
  `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="${fill}"/> <path d="M30.71 6.79 A17 17 0 1 1 6.79 30.71 A17 17 0 0 0 30.71 6.79 Z" fill="${shade}"/> <path d="M8.5 13.5 A13 13 0 0 1 16 6.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/> <circle cx="20" cy="20" r="17" fill="none" stroke="${INK}" stroke-width="1.8"/> ${inner}</svg>`;
const SVG = {
  lachen: face(`<g fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"><path d="M11 17 Q14 12.5 17 17"/><path d="M23 17 Q26 12.5 29 17"/></g> <circle cx="9.6" cy="21" r="2" fill="#ec9a8f"/><circle cx="30.4" cy="21" r="2" fill="#ec9a8f"/> <path d="M11.5 21.5 H28.5 Q28 31.5 20 31.5 Q12 31.5 11.5 21.5 Z" fill="${INK}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/> <path d="M14.5 28.6 Q20 24.6 25.5 28.6 Q23.5 31 20 31 Q16.5 31 14.5 28.6 Z" fill="#d33a2c"/> <path d="M13 22.6 H27 V24 Q20 25 13 24 Z" fill="#fff"/>`),
  verliebt: face(`<path transform="translate(13.5 16.5) scale(1)" d="M0 3.2 C -1.6 0.4, -5.6 0.6, -5.6 -2.6 C -5.6 -5, -2.6 -6.2, 0 -3.4 C 2.6 -6.2, 5.6 -5, 5.6 -2.6 C 5.6 0.6, 1.6 0.4, 0 3.2 Z" fill="#d33a2c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path transform="translate(26.5 16.5) scale(1)" d="M0 3.2 C -1.6 0.4, -5.6 0.6, -5.6 -2.6 C -5.6 -5, -2.6 -6.2, 0 -3.4 C 2.6 -6.2, 5.6 -5, 5.6 -2.6 C 5.6 0.6, 1.6 0.4, 0 3.2 Z" fill="#d33a2c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/> <path d="M13 24.5 Q20 31.5 27 24.5" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/> <circle cx="9.8" cy="23" r="2" fill="#ec9a8f"/><circle cx="30.2" cy="23" r="2" fill="#ec9a8f"/>`),
  staunen: face(`<g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M10.5 10.5 Q13.5 8 16.5 10"/><path d="M23.5 10 Q26.5 8 29.5 10.5"/></g> <circle cx="14" cy="16.5" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1.5"/><circle cx="26" cy="16.5" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1.5"/> <circle cx="14.3" cy="17" r="1.6" fill="${INK}"/><circle cx="26.3" cy="17" r="1.6" fill="${INK}"/> <ellipse cx="20" cy="27.5" rx="3.4" ry="4.2" fill="${INK}"/>`),
  traurig: face(`<g fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"><path d="M10.5 13.5 Q13.5 13.5 16.5 10.8"/><path d="M23.5 10.8 Q26.5 13.5 29.5 13.5"/></g> <ellipse cx="14" cy="18" rx="1.7" ry="2.2" fill="${INK}"/><ellipse cx="26" cy="18" rx="1.7" ry="2.2" fill="${INK}"/> <path d="M14 29.5 Q19.5 24.5 25 29.5" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/> <path d="M28.6 20.6 Q31.2 24.5 31.2 25.9 A2.6 2.6 0 0 1 26 25.9 Q26 24.5 28.6 20.6 Z" fill="#5a8fc8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`),
  wuetend: face(`<g fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"><path d="M10 12 L17 15"/><path d="M30 12 L23 15"/></g> <ellipse cx="14.5" cy="18.5" rx="1.7" ry="1.9" fill="${INK}"/><ellipse cx="25.5" cy="18.5" rx="1.7" ry="1.9" fill="${INK}"/> <rect x="13" y="25" width="14" height="5.5" rx="1.6" fill="#fff" stroke="${INK}" stroke-width="1.6"/> <path d="M13.5 27.7 H26.5 M17.7 25.4 V30 M22.3 25.4 V30" stroke="${INK}" stroke-width="1"/>`, '#ec7a3c', '#c95f26'),
  zwinkern: face(`<g fill="none" stroke="${INK}" stroke-linecap="round"><path d="M23.5 11.2 Q26.5 9.6 29.5 11.4" stroke-width="1.5"/><path d="M11 17.6 Q14 15 17 17.6" stroke-width="1.9"/></g> <ellipse cx="26.2" cy="17" rx="1.8" ry="2.3" fill="${INK}"/> <path d="M13 25 Q20.5 31.2 27.6 24.4" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/> <path d="M26.4 23.2 L28.6 25.6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/> <circle cx="9.8" cy="22" r="2" fill="#ec9a8f"/>`),
  traenen: face(`<g fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 13.5 L16.5 16 L11 18.5"/><path d="M29 13.5 L23.5 16 L29 18.5"/></g> <path d="M11 21 H29 Q28.5 32 20 32 Q11.5 32 11 21 Z" fill="${INK}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/> <path d="M14.2 28.8 Q20 24.6 25.8 28.8 Q23.6 31.4 20 31.4 Q16.4 31.4 14.2 28.8 Z" fill="#d33a2c"/> <path d="M12.6 22.1 H27.4 V23.6 Q20 24.6 12.6 23.6 Z" fill="#fff"/> <path transform="translate(7.6 17.4) scale(1.05)" d="M0 0 Q2.6 3.9 2.6 5.3 A2.6 2.6 0 0 1 -2.6 5.3 Q-2.6 3.9 0 0 Z" fill="#5a8fc8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/> <path transform="translate(32.4 17.4) scale(1.05)" d="M0 0 Q2.6 3.9 2.6 5.3 A2.6 2.6 0 0 1 -2.6 5.3 Q-2.6 3.9 0 0 Z" fill="#5a8fc8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`),
  frech: face(`<g fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"><path d="M11 16.6 Q14 14 17 16.6"/></g> <ellipse cx="26" cy="16" rx="1.8" ry="2.3" fill="${INK}"/> <path d="M12.5 23.5 Q20 27.5 27.5 23.5" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/> <path d="M17 25.4 Q17 32.6 21.5 32.6 Q26 32.6 25.8 24.6 Q21.5 26.4 17 25.4 Z" fill="#e0655a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/> <path d="M21.4 26.4 V30" stroke="${INK}" stroke-width="1" stroke-linecap="round"/> <circle cx="9.8" cy="21.5" r="2" fill="#ec9a8f"/><circle cx="30.2" cy="21.5" r="2" fill="#ec9a8f"/>`),
  cool: face(`<path d="M7.4 13.6 H32.6" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/> <path d="M8.6 13.6 H18.4 V16.4 Q18 21.2 13.4 21.2 Q9 21.2 8.6 16.4 Z" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/> <path d="M21.6 13.6 H31.4 V16.4 Q31 21.2 26.6 21.2 Q22 21.2 21.6 16.4 Z" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/> <g stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".8"><path d="M10.6 15.6 L13 15.2"/><path d="M23.6 15.6 L26 15.2"/></g> <path d="M15 27.6 Q21.5 30 26.5 25" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`),
  nervoes: face(`<g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M10.5 12 Q13.5 9.4 16.5 10.6"/><path d="M23.5 10.6 Q26.5 9.4 29.5 12"/></g> <circle cx="14" cy="17" r="3.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="26" cy="17" r="3.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/> <circle cx="14" cy="17.4" r="1.4" fill="${INK}"/><circle cx="26" cy="17.4" r="1.4" fill="${INK}"/> <path d="M12.5 27 Q14.4 24.8 16.2 27 Q18.1 29.2 20 27 Q21.9 24.8 23.8 27 Q25.6 29.2 27.5 27" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/> <path transform="translate(30 7.6) scale(1.05)" d="M0 0 Q2.6 3.9 2.6 5.3 A2.6 2.6 0 0 1 -2.6 5.3 Q-2.6 3.9 0 0 Z" fill="#5a8fc8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`),
  augenrollen: face(`<g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M10.5 10.2 Q13.5 8.8 16.5 9.8"/><path d="M23.5 9.8 Q26.5 8.8 29.5 10.2"/></g> <circle cx="14" cy="16.5" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1.5"/><circle cx="26" cy="16.5" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1.5"/> <circle cx="15.2" cy="14.5" r="1.6" fill="${INK}"/><circle cx="27.2" cy="14.5" r="1.6" fill="${INK}"/> <path d="M15 28 Q19 26.6 25.5 26.4" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`),
  gaehnen: face(`<g fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"><path d="M10.8 16.4 Q13.8 18.6 16.8 16.4"/><path d="M23.2 16.4 Q26.2 18.6 29.2 16.4"/></g> <g fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"><path d="M10.6 11.6 Q13.6 10.8 16.4 12.2"/><path d="M23.6 12.2 Q26.4 10.8 29.4 11.6"/></g> <ellipse cx="20" cy="27" rx="4.4" ry="5.2" fill="${INK}"/> <path d="M16.6 29.6 Q20 26.8 23.4 29.6 Q22 31.8 20 31.8 Q18 31.8 16.6 29.6 Z" fill="#d33a2c"/> <path d="M26.6 4.6 H30.6 L26.6 8.6 H30.6 M31.6 0.8 H34.2 L31.6 3.4 H34.2" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`),
};

/** Ein Gesicht als Bild (Bedeutung steht im umgebenden Element). */
export function Face({ id, className = '' }) {
  return <span className={`face ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SVG[id] ?? '' }} />;
}

/** Gesicht oder Spruch, klein (neben dem Namen in der Anzeigetafel). */
export function Mark({ id, className = '' }) {
  const r = BY_ID.get(id);
  if (!r?.word) return <Face id={id} className={className} />;
  return (
    <span className={`word-mark ${className}`} aria-hidden="true">
      {r.text}
    </span>
  );
}

const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

// Ein Gesicht (oder ein Spruch als Sprechblase) steigt von unten über dem Spiel auf und verblasst (eigene
// rechts, die der anderen verteilt). Auch am PC von unten: Die Seitenleiste steht oben, von dort aus flöge es
// aus dem Bild.
function fly(layer, id, name, color, own) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const word = BY_ID.get(id).word;
  const el = document.createElement('div');
  el.className = 'react-fly';
  el.style.left = `${own ? (word ? 66 : 74) + Math.random() * 10 : 14 + Math.random() * 58}%`;
  el.style.setProperty('--pc', color);
  el.innerHTML = word ? '<span class="react-bubble"></span><span class="react-name"></span>' : `<span class="face">${SVG[id]}</span><span class="react-name"></span>`;
  if (word) el.querySelector('.react-bubble').textContent = BY_ID.get(id).text;
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
  // Gesichter schaukeln, Sprechblasen kippen leicht hin und her
  const sway = word
    ? [{ transform: 'rotate(-5deg)' }, { transform: 'rotate(3deg)' }]
    : [{ transform: 'translateX(-7px) rotate(-6deg)' }, { transform: 'translateX(7px) rotate(6deg)' }];
  el.firstElementChild.animate(sway, { duration: 650, direction: 'alternate', iterations: 4, easing: 'ease-in-out' });
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
      const r = BY_ID.get(id);
      if (!own) setSaid(r.word ? `${p.name}: „${r.text}“` : `${p.name} ${r.verb}.`);
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

// Gesichter als Raster, darunter die Sprüche (Leiste auf dem Handy und Seitenleiste am PC)
function Choices({ reactions }) {
  return (
    <>
      <div className="react-faces">
        {REACTIONS.map((r, i) => (
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
        ))}
      </div>
      <div className="react-words">
        {WORDS.map((w, i) => (
          <button
            key={w.id}
            type="button"
            className="react-word"
            data-react={w.id}
            style={{ '--i': REACTIONS.length + i }}
            onClick={() => reactions.send(w.id)}
          >
            {w.text}
          </button>
        ))}
      </div>
    </>
  );
}

/** PC (breite Ansicht): Gesichter und Sprüche fest in der Seitenleiste, unter der Anzeigetafel. */
export function ReactionDock({ reactions }) {
  return (
    <div className="react-dock">
      <p className="board-caption" id="react-dock-label">
        Reagieren
      </p>
      <div className={`react-row ${reactions.cool ? 'cool' : ''}`} role="group" aria-labelledby="react-dock-label">
        <Choices reactions={reactions} />
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
            <Choices reactions={reactions} />
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
