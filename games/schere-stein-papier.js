// Schere, Stein, Papier – Beispiel für geheime, gleichzeitige Züge.
// Die Funktion view() sorgt dafür, dass man die Wahl des anderen erst sieht,
// wenn beide gewählt haben.

export const meta = {
  name: 'Schere, Stein, Papier',
  emoji: '✂️',
  description: 'Beide wählen gleichzeitig. Wer zuerst 3 Runden gewinnt, gewinnt.',
  players: [2, 2],
};

const MOVES = { schere: '✂️', stein: '🪨', papier: '📄' };
const BEATS = { schere: 'papier', stein: 'schere', papier: 'stein' };
const TARGET = 3;

export function setup(players) {
  return {
    players,
    score: Object.fromEntries(players.map((p) => [p.id, 0])),
    picks: {}, // geheime Wahl der laufenden Runde
    rounds: [], // aufgedeckte Runden
  };
}

export function action(state, { player, type, data }) {
  if (type !== 'waehlen') return;
  if (!(player in state.score)) throw new Error('Du spielst nicht mit.');
  if (!(data in MOVES)) throw new Error('Unbekannter Zug.');
  if (state.picks[player]) throw new Error('Du hast schon gewählt.');

  state.picks[player] = data;
  const [a, b] = state.players.map((p) => p.id);
  if (!state.picks[a] || !state.picks[b]) return;

  const pa = state.picks[a];
  const pb = state.picks[b];
  const winner = BEATS[pa] === pb ? a : BEATS[pb] === pa ? b : null;
  if (winner) state.score[winner]++;
  state.rounds.push({ picks: { [a]: pa, [b]: pb }, winner });
  state.picks = {};

  if (winner && state.score[winner] >= TARGET) {
    const name = state.players.find((p) => p.id === winner).name;
    state.result = { winners: [winner], text: `${name} gewinnt ${state.score[a]}:${state.score[b]}!` };
  }
}

// Was jeder Spieler sehen darf: nur die eigene Wahl, vom Gegner nur ob er schon gewählt hat.
export function view(state, me) {
  return {
    ...state,
    picks: undefined,
    myPick: state.picks[me] ?? null,
    otherPicked: Object.keys(state.picks).some((id) => id !== me),
  };
}

export function render(el, s, game) {
  const me = s.players.find((p) => p.id === game.me) ?? s.players[0];
  const other = s.players.find((p) => p.id !== me.id);
  const last = s.rounds.at(-1);

  let lastRound = '<p class="muted center">Wählt gleichzeitig – niemand sieht die Wahl des anderen.</p>';
  if (last) {
    const verdict = !last.winner
      ? 'Gleichstand'
      : last.winner === me.id ? '<span class="ok">Runde für dich!</span>' : `<span class="bad">Runde für ${game.esc(other.name)}</span>`;
    lastRound = `
      <div class="ssp-reveal">
        <div><div class="ssp-big">${MOVES[last.picks[me.id]]}</div><div class="muted">Du</div></div>
        <div class="muted">vs</div>
        <div><div class="ssp-big">${MOVES[last.picks[other.id]]}</div><div class="muted">${game.esc(other.name)}</div></div>
      </div>
      <p class="center big">${verdict}</p>`;
  }

  let status = '';
  if (!game.result) {
    if (s.myPick) status = `Warte auf ${game.esc(other.name)} …`;
    else if (s.otherPicked) status = `${game.esc(other.name)} hat schon gewählt!`;
    else status = 'Deine Wahl:';
  }

  el.innerHTML = `
    <div class="card center ssp-score">
      <span>Du <b>${s.score[me.id]}</b></span>
      <span class="muted">:</span>
      <span><b>${s.score[other.id]}</b> ${game.esc(other.name)}</span>
    </div>
    ${lastRound}
    <p class="status">${status}</p>
    <div class="row center">
      ${Object.entries(MOVES)
        .map(([move, icon]) => `
          <button class="btn ssp-move ${s.myPick === move ? 'chosen' : ''}" data-action="waehlen" data-value="${move}"
                  ${s.myPick || game.result ? 'disabled' : ''}>
            <span class="ssp-big">${icon}</span>
            <span>${move[0].toUpperCase() + move.slice(1)}</span>
          </button>`)
        .join('')}
    </div>`;
}

export const style = `
  .ssp-score { display: flex; gap: 12px; justify-content: center; font-size: 1.2rem; }
  .ssp-reveal { display: flex; align-items: center; justify-content: center; gap: 24px; text-align: center; }
  .ssp-big { font-size: 3rem; line-height: 1.2; }
  .ssp-move { display: flex; flex-direction: column; align-items: center; border-radius: var(--radius); min-width: 96px; }
  .ssp-move.chosen { opacity: 1; border-color: var(--accent); background: var(--accent-soft); }
`;
