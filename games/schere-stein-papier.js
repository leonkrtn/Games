// Schere, Stein, Papier (Beispiel für geheime, gleichzeitige Züge).
// Die Funktion view() sorgt dafür, dass man die Wahl des anderen erst sieht,
// wenn beide gewählt haben.

export const meta = {
  name: 'Schere, Stein, Papier',
  description: 'Beide wählen gleichzeitig. Wer zuerst drei Runden gewinnt, gewinnt.',
  players: [2, 2],
};

const MOVES = { schere: 'Schere', stein: 'Stein', papier: 'Papier' };
const BEATS = { schere: 'papier', stein: 'schere', papier: 'stein' };
const WHY = { schere: 'Schere schneidet Papier.', stein: 'Stein macht Schere stumpf.', papier: 'Papier wickelt Stein ein.' };
const TARGET = 3;
const WORD = ['null', 'eins', 'zwei', 'drei'];

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
    state.result = { winners: [winner], text: `${name} gewinnt ${WORD[state.score[winner]]} zu ${WORD[state.score[winner === a ? b : a]]}.` };
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
  const e = game.esc;
  const me = s.players.find((p) => p.id === game.me) ?? s.players[0];
  const other = s.players.find((p) => p.id !== me.id);
  const last = s.rounds.at(-1);

  let lastRound = '';
  if (last) {
    const mine = last.picks[me.id];
    const theirs = last.picks[other.id];
    let verdict = 'Gleiche Wahl, kein Punkt.';
    if (last.winner) {
      const w = last.winner === me.id ? mine : theirs;
      verdict = `${WHY[w]} Punkt für ${last.winner === me.id ? 'dich' : e(other.name)}.`;
    }
    lastRound = `
      <div class="ssp-last">
        <p class="muted">Runde ${s.rounds.length}</p>
        <p class="ssp-duel">
          <span style="color:${game.color(me.id)}">${MOVES[mine]}</span>
          <span class="ssp-vs">gegen</span>
          <span style="color:${game.color(other.id)}">${MOVES[theirs]}</span>
        </p>
        <p>${verdict}</p>
      </div>`;
  }

  let status = '';
  if (!game.result) {
    if (s.myPick) status = `Du hast ${MOVES[s.myPick]} gewählt. Warte auf ${e(other.name)}.`;
    else if (s.otherPicked) status = `${e(other.name)} hat schon gewählt. Jetzt du.`;
    else if (!last) status = 'Wähle geheim. Aufgedeckt wird, sobald ihr beide gewählt habt.';
    else status = 'Nächste Runde. Wähle geheim.';
  }

  el.innerHTML = `
    <div class="ssp-score">
      <span class="muted">Runden</span>
      <span class="num ssp-num" style="color:${game.color(me.id)}">${s.score[me.id]}</span>
      <span class="num ssp-num">:</span>
      <span class="num ssp-num" style="color:${game.color(other.id)}">${s.score[other.id]}</span>
      <span class="muted">wer zuerst drei hat, gewinnt</span>
    </div>
    ${lastRound}
    ${status ? `<p class="status">${status}</p>` : ''}
    ${game.result ? '' : `
      <div class="ssp-moves">
        ${Object.entries(MOVES)
          .map(([move, label]) => `
            <button class="btn ssp-move ${s.myPick === move ? 'chosen' : ''}" data-action="waehlen" data-value="${move}"
                    ${s.myPick ? 'disabled' : ''} aria-pressed="${s.myPick === move}">${label}</button>`)
          .join('')}
      </div>`}`;
}

export const style = `
  .ssp-score { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 8px; }
  .ssp-num { font-size: var(--t-2xl); line-height: 1; }
  .ssp-last { border-top: 1px solid var(--hairline); padding-top: 14px; }
  .ssp-duel {
    font-family: var(--font-display); font-weight: 800; font-size: var(--t-2xl); line-height: 1.05;
    margin: 4px 0 6px;
  }
  .ssp-vs { font-family: var(--font-body); font-weight: 400; font-size: var(--t-base); color: var(--muted); margin: 0 6px; }
  .ssp-moves { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; max-width: 520px; }
  .ssp-move {
    min-height: 80px; padding: 8px 4px;
    font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg);
  }
  .ssp-move.chosen:disabled { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  @media (min-width: 600px) { .ssp-move { font-size: var(--t-xl); min-height: 96px; } }
`;
