// Tic-Tac-Toe – Beispiel für ein Spiel, bei dem man abwechselnd zieht.

export const meta = {
  name: 'Tic-Tac-Toe',
  emoji: '⭕',
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
    marks: { [first.id]: '✕', [second.id]: '◯' },
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
    state.result = { winners: [player], text: `${name} gewinnt!` };
  } else if (state.board.every(Boolean)) {
    state.result = { winners: [], text: 'Unentschieden!' };
  } else {
    state.turn = state.players.find((p) => p.id !== player).id;
  }
}

export function render(el, s, game) {
  const myTurn = s.turn === game.me && !game.result;
  const status = game.result
    ? ''
    : myTurn
      ? `Du bist dran (${s.marks[game.me]})`
      : `${game.esc(game.name(s.turn))} ist dran …`;

  el.innerHTML = `
    <p class="status">${status}</p>
    <div class="ttt">
      ${s.board
        .map((owner, i) => `
          <button class="ttt-cell ${owner ? (s.marks[owner] === '✕' ? 'x' : 'o') : ''} ${s.line?.includes(i) ? 'win' : ''}"
                  data-action="setzen" data-value="${i}" ${owner || !myTurn ? 'disabled' : ''}
                  aria-label="Feld ${i + 1}">${owner ? s.marks[owner] : ''}</button>`)
        .join('')}
    </div>`;
}

export const style = `
  .ttt {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    width: min(100%, 360px); margin: 0 auto;
  }
  .ttt-cell {
    aspect-ratio: 1; font-size: clamp(2rem, 12vw, 3.5rem); font-weight: 700;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--surface); color: var(--text); cursor: pointer;
  }
  .ttt-cell:disabled { cursor: default; }
  .ttt-cell:not(:disabled):hover { background: var(--surface-2); }
  .ttt-cell.x { color: var(--accent); }
  .ttt-cell.o { color: var(--second); }
  .ttt-cell.win { background: var(--accent-soft); border-color: var(--accent); }
`;
