// Tic-Tac-Toe (Beispiel für ein Spiel, bei dem man abwechselnd zieht).

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

export function render(el, s, game) {
  const myTurn = s.turn === game.me && !game.result;
  const status = myTurn ? `Du bist dran. Du setzt ${s.marks[game.me]}.` : `${game.esc(game.name(s.turn))} ist dran.`;

  el.innerHTML = `
    ${game.result ? '' : `<p class="status"><span class="marker" style="color:${game.color(s.turn)}"></span> ${status}</p>`}
    <div class="ttt">
      ${s.board
        .map((owner, i) => {
          const win = s.line?.includes(i);
          const color = owner ? game.color(owner) : 'inherit';
          return `<button class="ttt-cell ${win ? 'win' : ''}" style="--mark:${color}"
                    data-action="setzen" data-value="${i}" ${owner || !myTurn ? 'disabled' : ''}
                    aria-label="Feld ${i + 1}${owner ? `, ${s.marks[owner]}` : ''}">${owner ? s.marks[owner] : ''}</button>`;
        })
        .join('')}
    </div>`;
}

export const style = `
  .ttt {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    width: min(100%, 360px);
  }
  .ttt-cell {
    aspect-ratio: 1;
    border: 0;
    border-radius: 0;
    background: none;
    color: var(--mark);
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(3rem, 18vw, 5rem);
    line-height: 1;
    cursor: pointer;
  }
  /* Nur die inneren Linien, wie auf Papier gezeichnet */
  .ttt-cell:nth-child(3n + 1), .ttt-cell:nth-child(3n + 2) { border-right: 3px solid var(--ink); }
  .ttt-cell:nth-child(-n + 6) { border-bottom: 3px solid var(--ink); }
  .ttt-cell:disabled { cursor: default; }
  .ttt-cell:not(:disabled):hover { background: var(--wash); }
  .ttt-cell.win { background: color-mix(in srgb, var(--mark) 12%, white); }
`;
