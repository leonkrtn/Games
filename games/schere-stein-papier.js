// Schere, Stein, Papier (Beispiel für geheime, gleichzeitige Züge).
// Die Funktion view() sorgt dafür, dass man die Wahl der anderen erst sieht,
// wenn alle gewählt haben.
//
// Zu mehreren: Liegen genau zwei verschiedene Zeichen auf dem Tisch, bekommt jeder mit dem
// stärkeren einen Punkt. Sind alle drei dabei oder haben alle dasselbe, gibt es keinen.

export const meta = {
  name: 'Schere, Stein, Papier',
  description: 'Alle wählen gleichzeitig. Wer zuerst drei Runden gewinnt, gewinnt.',
  players: [2, 6],
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
    rounds: [], // aufgedeckte Runden: { picks, winners }
  };
}

export function action(state, { player, type, data }) {
  if (type !== 'waehlen') return;
  if (!(player in state.score)) throw new Error('Du spielst nicht mit.');
  if (!(data in MOVES)) throw new Error('Unbekannter Zug.');
  if (state.picks[player]) throw new Error('Du hast schon gewählt.');

  state.picks[player] = data;
  const ids = state.players.map((p) => p.id);
  if (!ids.every((id) => state.picks[id])) return;

  const picks = Object.fromEntries(ids.map((id) => [id, state.picks[id]]));
  const strong = strongest(Object.values(picks));
  const winners = strong ? ids.filter((id) => picks[id] === strong) : [];
  for (const id of winners) state.score[id]++;
  state.rounds.push({ picks, winners });
  state.picks = {};

  const done = winners.filter((id) => state.score[id] >= TARGET);
  if (!done.length) return;
  const names = done.map((id) => state.players.find((p) => p.id === id).name);
  if (ids.length === 2) {
    const loser = ids.find((id) => id !== done[0]);
    state.result = { winners: done, text: `${names[0]} gewinnt ${WORD[state.score[done[0]]]} zu ${WORD[state.score[loser]]}.` };
  } else {
    state.result = { winners: done, text: `${list(names)} ${done.length > 1 ? 'gewinnen' : 'gewinnt'} mit drei Runden.` };
  }
}

// Das Zeichen, das in dieser Runde Punkte bringt, oder null (alle gleich oder alle drei dabei).
function strongest(moves) {
  const kinds = [...new Set(moves)];
  if (kinds.length !== 2) return null;
  return BEATS[kinds[0]] === kinds[1] ? kinds[0] : kinds[1];
}

// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
function list(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

// Für Benachrichtigungen: wer hat in dieser Runde noch nicht gewählt?
export function waitingFor(state) {
  return state.players.map((p) => p.id).filter((id) => !state.picks[id]);
}

// Was jeder Spieler sehen darf: nur die eigene Wahl, von den anderen nur, ob sie schon gewählt haben.
export function view(state, me) {
  return {
    ...state,
    picks: undefined,
    myPick: state.picks[me] ?? null,
    picked: Object.keys(state.picks),
  };
}

export function render(el, s, game) {
  const e = game.esc;
  const me = game.me;
  const ids = s.players.map((p) => p.id);
  const others = ids.filter((id) => id !== me);
  const who = (id) => (id === me ? 'dich' : e(game.name(id)));
  const last = s.rounds.at(-1);
  const fresh = last && game.prev && game.prev.rounds.length < s.rounds.length; // gerade aufgedeckt
  const winnersOf = (r) => r.winners ?? (r.winner ? [r.winner] : []);

  let lastRound = '';
  if (last) {
    const winners = winnersOf(last);
    const moves = new Set(Object.values(last.picks));
    let verdict;
    if (winners.length) verdict = `${WHY[last.picks[winners[0]]]} Punkt für ${list(winners.map(who))}.`;
    else if (moves.size === 1) verdict = 'Gleiche Wahl, kein Punkt.';
    else verdict = 'Alle drei Zeichen dabei, kein Punkt.';
    const order = [me, ...others].filter((id) => id in last.picks);
    lastRound = `
      <div class="ssp-last ${fresh ? 'enter' : ''}">
        <p class="muted">Runde <span class="num">${s.rounds.length}</span></p>
        <ul class="ssp-picks ${order.length > 2 ? 'many' : ''}">
          ${order
            .map(
              (id, k) => `
            <li class="ssp-pick ${winners.length && !winners.includes(id) ? 'lost' : ''}" style="--c:${game.color(id)};--k:${k}">
              <span class="ssp-who"><span class="marker" style="color:var(--c)"></span> ${id === me ? 'Du' : e(game.name(id))}</span>
              <span class="ssp-sign">${MOVES[last.picks[id]]}</span>
            </li>`,
            )
            .join('')}
        </ul>
        <p class="ssp-verdict">${verdict}</p>
      </div>`;
  }

  const missing = ids.filter((id) => !s.picked.includes(id) && id !== me).map((id) => e(game.name(id)));
  let status = '';
  if (!game.result) {
    if (s.myPick) status = `Du hast ${MOVES[s.myPick]} gewählt. Warte auf ${list(missing)}.`;
    else if (s.picked.length) status = `${list(s.picked.map((id) => e(game.name(id))))} ${s.picked.length > 1 ? 'haben' : 'hat'} schon gewählt. Jetzt du.`;
    else if (!last) status = 'Wähle geheim. Aufgedeckt wird, sobald alle gewählt haben.';
    else status = 'Nächste Runde. Wähle geheim.';
  }

  el.innerHTML = `
    <div class="ssp-score ${game.first ? 'intro' : ''}">
      ${[me, ...others]
        .map(
          (id, k) => `
        <span class="ssp-team" style="--k:${k}">
          <span class="ssp-team-name"><span class="marker" style="color:${game.color(id)}"></span> ${id === me ? 'Du' : e(game.name(id))}</span>
          <span class="num ssp-num" style="color:${game.color(id)}">${s.score[id]}</span>
        </span>`,
        )
        .join('')}
      <span class="muted ssp-goal">Wer zuerst drei Runden hat, gewinnt.</span>
    </div>
    ${lastRound}
    ${status ? `<p class="status">${status}</p>` : ''}
    ${game.result ? '' : `
      <div class="ssp-moves ${game.first ? 'intro' : ''}">
        ${Object.entries(MOVES)
          .map(([move, label], k) => `
            <button class="btn ssp-move ${s.myPick === move ? 'chosen' : ''}" style="--k:${k}" data-action="waehlen" data-value="${move}"
                    ${s.myPick ? 'disabled' : ''} aria-pressed="${s.myPick === move}">${label}</button>`)
          .join('')}
      </div>`}`;
}

export const style = `
  .ssp-score { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 20px; }
  .ssp-team { display: inline-flex; align-items: baseline; gap: 8px; }
  .ssp-team-name { font-weight: 700; }
  .ssp-num { font-size: var(--t-2xl); line-height: 1; }
  .ssp-goal { flex: 1 1 100%; font-size: var(--t-sm); }
  .ssp-last { border-top: 1px solid var(--hairline); padding-top: 14px; }
  .ssp-picks { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 6px 0 8px; }
  .ssp-pick { display: grid; gap: 0; }
  .ssp-who { font-size: var(--t-sm); color: var(--muted); }
  .ssp-sign { color: var(--c); font: 800 var(--t-2xl) / 1.05 var(--font-display); transition: opacity 200ms ease-out; }
  .ssp-picks.many .ssp-sign { font-size: var(--t-xl); }
  .ssp-pick.lost .ssp-sign { opacity: .4; }
  .ssp-moves { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; max-width: 520px; }
  .ssp-move {
    min-height: 80px; padding: 8px 4px;
    font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg);
  }
  .ssp-move:active:not(:disabled) { transform: scale(.96); }
  .ssp-move.chosen:disabled { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  @media (min-width: 600px) { .ssp-move { font-size: var(--t-xl); min-height: 96px; } }

  /* Auftakt: Punktestand und Knöpfe bauen sich nacheinander auf */
  .ssp-score.intro .ssp-team, .ssp-moves.intro .ssp-move {
    animation: ssp-rise 360ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 80ms);
  }
  /* Aufdecken: die Zeichen drehen sich nacheinander um, wer verliert, tritt danach zurück */
  .ssp-last.enter .ssp-sign { animation: ssp-flip 380ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 90ms); }
  .ssp-last.enter .ssp-pick.lost .ssp-sign { animation: ssp-flip 380ms cubic-bezier(.2,.8,.2,1) both, ssp-recede 300ms ease-out both; animation-delay: calc(var(--k) * 90ms), 700ms; }
  .ssp-last.enter .ssp-verdict { animation: ssp-rise 300ms cubic-bezier(.2,.8,.2,1) 500ms both; }
  @keyframes ssp-rise { from { opacity: 0; transform: translateY(6px); } }
  @keyframes ssp-flip { from { opacity: 0; transform: perspective(300px) rotateX(-80deg); } }
  @keyframes ssp-recede { from { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .ssp-score *, .ssp-last *, .ssp-moves * { animation: none !important; transition: none !important; }
  }
`;
