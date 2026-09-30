// Tic-Tac-Toe (Beispiel für abwechselnde Züge und für Animationen).
//
// Motion: Das Spielfeld zeichnet sich zu Beginn wie mit dem Stift, jedes neue X oder O wird
// Strich für Strich gezogen, und die Gewinnreihe wird am Ende durchgestrichen. Welche Elemente
// neu sind, ergibt sich aus dem Vergleich mit game.prev (dem Stand vor dem letzten Zug).

export const meta = {
  name: 'Tic-Tac-Toe',
  description: 'Drei in einer Reihe gewinnt.',
  players: [2, 2],
};

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function setup(players) {
  // Zufällig auslosen, wer anfängt.
  const [first, second] = Math.random() < 0.5 ? players : [players[1], players[0]];
  return {
    players,
    marks: { [first.id]: 'X', [second.id]: 'O' },
    board: Array(9).fill(null),
    turn: first.id,
    line: null,
  };
}

export function action(state, { player, type, data }) {
  if (type !== 'setzen') return;
  if (player !== state.turn) throw new Error('Du bist nicht dran.');
  const i = Number(data);
  if (!(i >= 0 && i < 9) || state.board[i]) throw new Error('Das Feld ist schon belegt.');

  state.board[i] = player;
  const line = LINES.find((l) => l.every((j) => state.board[j] === player));
  if (line) {
    state.line = line;
    const name = state.players.find((p) => p.id === player).name;
    state.result = { winners: [player], text: `${name} gewinnt.` };
  } else if (state.board.every(Boolean)) {
    state.result = { winners: [], text: 'Unentschieden.' };
  } else {
    state.turn = state.players.find((p) => p.id !== player).id;
  }
}

// Für Benachrichtigungen: auf wen wartet das Spiel gerade?
export function waitingFor(state) {
  return [state.turn];
}

// Zeichen als SVG, damit sie sich Strich für Strich zeichnen lassen (pathLength=1 macht das einfach).
const MARK = {
  X: '<svg viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M22 22 L78 78"/><path pathLength="1" d="M78 22 L22 78"/></svg>',
  O: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle pathLength="1" cx="50" cy="50" r="29" transform="rotate(-90 50 50)"/></svg>',
};

// Mittelpunkte der Felder im 300×300-Raster, für die Gewinnlinie
const center = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];

export function render(el, s, game) {
  const myTurn = s.turn === game.me && !game.result;
  const before = game.prev?.board ?? [];
  const status = myTurn ? `Du bist dran. Du setzt ${s.marks[game.me]}.` : `${game.esc(game.name(s.turn))} ist dran.`;

  const cells = s.board
    .map((owner, i) => {
      const fresh = owner && !before[i]; // gerade gesetzt → einzeichnen
      const content = owner ? MARK[s.marks[owner]] : myTurn ? `<span class="ttt-ghost">${MARK[s.marks[game.me]]}</span>` : '';
      return `<button class="ttt-cell ${fresh ? 'enter' : ''} ${s.line?.includes(i) ? 'win' : ''}"
                style="--mark:${owner ? game.color(owner) : game.color(game.me)}"
                data-action="setzen" data-value="${i}" ${owner || !myTurn ? 'disabled' : ''}
                aria-label="Feld ${i + 1}${owner ? `, ${s.marks[owner]}` : ''}">${content}</button>`;
    })
    .join('');

  let winLine = '';
  if (s.line) {
    const [x1, y1] = center(s.line[0]);
    const [x2, y2] = center(s.line[2]);
    const winner = s.board[s.line[0]];
    // Linie über die äußeren Felder hinaus verlängern, damit sie wie ein Durchstreichen wirkt
    const dx = (x2 - x1) * 0.18;
    const dy = (y2 - y1) * 0.18;
    const coords = `x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 + dx}" y2="${y2 + dy}"`;
    // Weißer Rand darunter schneidet die Linie sauber aus den gleichfarbigen Zeichen frei.
    winLine = `<svg class="ttt-win ${game.prev?.line ? '' : 'draw'}" viewBox="0 0 300 300" aria-hidden="true">
      <line class="ttt-win-halo" pathLength="1" ${coords}/>
      <line pathLength="1" ${coords} style="stroke:${game.color(winner)}"/>
    </svg>`;
  }

  el.innerHTML = `
    ${game.result ? '' : `<p class="status ttt-status" ${game.prev?.turn !== s.turn ? 'data-new' : ''}><span class="marker" style="color:${game.color(s.turn)}"></span> ${status}</p>`}
    <div class="ttt">
      <svg class="ttt-grid ${game.first ? 'draw' : ''}" viewBox="0 0 300 300" aria-hidden="true">
        <line pathLength="1" x1="100" y1="6" x2="100" y2="294"/>
        <line pathLength="1" x1="200" y1="6" x2="200" y2="294"/>
        <line pathLength="1" x1="6" y1="100" x2="294" y2="100"/>
        <line pathLength="1" x1="6" y1="200" x2="294" y2="200"/>
      </svg>
      ${cells}
      ${winLine}
    </div>`;
}

export const style = `
  .ttt {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    width: min(100%, 360px);
  }
  .ttt-grid, .ttt-win {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; overflow: visible;
  }
  .ttt-grid line { stroke: var(--ink); stroke-width: 3; vector-effect: non-scaling-stroke; }
  .ttt-win line { stroke-width: 7; stroke-linecap: square; vector-effect: non-scaling-stroke; }
  .ttt-win .ttt-win-halo { stroke: var(--paper); stroke-width: 15; }

  .ttt-cell {
    position: relative;
    aspect-ratio: 1;
    padding: 12%;
    border: 0; border-radius: 0; background: none;
    color: var(--mark);
    cursor: pointer;
  }
  .ttt-cell:disabled { cursor: default; }
  .ttt-cell svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .ttt-cell path, .ttt-cell circle { fill: none; stroke: currentColor; stroke-width: 11; stroke-linecap: square; }

  /* Vorschau des eigenen Zeichens beim Darüberfahren */
  .ttt-ghost { display: block; width: 100%; height: 100%; opacity: 0; transform: scale(.86);
    transition: opacity 140ms ease-out, transform 180ms cubic-bezier(.2,.8,.2,1); }
  .ttt-cell:hover .ttt-ghost, .ttt-cell:focus-visible .ttt-ghost { opacity: .14; transform: scale(1); }
  .ttt-cell:active .ttt-ghost { opacity: .3; transform: scale(.96); }

  /* Striche einzeichnen */
  .ttt-cell.enter path, .ttt-cell.enter circle,
  .ttt-grid.draw line, .ttt-win.draw line {
    stroke-dasharray: 1; stroke-dashoffset: 1;
    animation: ttt-draw var(--d, 240ms) cubic-bezier(.3,.7,.2,1) var(--delay, 0ms) forwards;
  }
  .ttt-cell.enter path:nth-child(2) { --delay: 150ms; }
  .ttt-cell.enter circle { --d: 420ms; }
  .ttt-grid.draw line { --d: 460ms; }
  .ttt-grid.draw line:nth-child(2) { --delay: 90ms; }
  .ttt-grid.draw line:nth-child(3) { --delay: 180ms; }
  .ttt-grid.draw line:nth-child(4) { --delay: 270ms; }
  .ttt-win.draw line { --d: 520ms; --delay: 380ms; }
  @keyframes ttt-draw { to { stroke-dashoffset: 0; } }

  /* Neues Zeichen setzt mit kleinem Druck auf */
  .ttt-cell.enter svg { animation: ttt-press 320ms cubic-bezier(.2,.8,.2,1); }
  @keyframes ttt-press { from { transform: scale(.82); } to { transform: scale(1); } }

  /* Gewinnfelder heben sich ab, der Rest tritt zurück */
  .ttt:has(.ttt-win) .ttt-cell:not(.win) svg { opacity: .28; }
  .ttt:has(.ttt-win.draw) .ttt-cell:not(.win) svg { animation: ttt-dim 420ms ease-out 300ms both; }
  @keyframes ttt-dim { from { opacity: 1; } to { opacity: .28; } }

  .ttt-status[data-new] { animation: ttt-status 260ms cubic-bezier(.2,.8,.2,1); }
  @keyframes ttt-status { from { opacity: 0; transform: translateY(4px); } }

  @media (prefers-reduced-motion: reduce) {
    .ttt *, .ttt-status { animation: none !important; transition: none !important; stroke-dashoffset: 0 !important; }
  }
`;
