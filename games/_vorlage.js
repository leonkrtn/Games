// VORLAGE für ein neues Spiel.
// Kopiere diese Datei, z.B. nach games/mein-spiel.js (ohne _ am Anfang),
// dann taucht das Spiel automatisch in der Lobby auf.
//
// Beispiel-Spiel "Bis 10": Abwechselnd zählt jeder 1 oder 2 weiter.
// Wer die 10 erreicht, gewinnt.

// 1) Name, Emoji, Beschreibung und erlaubte Spielerzahl [min, max]
export const meta = {
  name: 'Bis 10',
  emoji: '🔟',
  description: 'Zählt abwechselnd 1 oder 2 weiter. Wer die 10 sagt, gewinnt.',
  players: [2, 2],
};

// 2) Startzustand. players = [{ id, name }, ...]
//    Der Zustand muss aus einfachen Daten bestehen (Zahlen, Texte, Listen, Objekte).
export function setup(players) {
  return {
    players,
    count: 0,
    turn: players[0].id,
  };
}

// 3) Ein Spielzug. Läuft auf dem Server.
//    - Zustand einfach direkt ändern.
//    - Ungültiger Zug? → throw new Error('Text für den Spieler')
//    - Spiel vorbei? → state.result = { winners: [id, ...], text: 'Wer gewonnen hat' }
export function action(state, { player, type, data }) {
  if (type !== 'zaehlen') return;
  if (player !== state.turn) throw new Error('Du bist nicht dran.');
  if (data !== 1 && data !== 2) throw new Error('Nur 1 oder 2!');

  state.count = Math.min(10, state.count + data);
  if (state.count === 10) {
    const name = state.players.find((p) => p.id === player).name;
    state.result = { winners: [player], text: `${name} hat die 10!` };
  } else {
    state.turn = state.players.find((p) => p.id !== player).id;
  }
}

// 4) Optional: Was darf welcher Spieler sehen? (für Geheimnisse wie Handkarten)
//    Ohne view() sieht jeder den ganzen Zustand.
// export function view(state, me) {
//   return { ...state, geheim: undefined };
// }

// 5) Anzeige. Läuft im Browser und wird bei jeder Änderung neu aufgerufen.
//    game.me = eigene id, game.players, game.name(id), game.send(type, data),
//    game.esc(text) (für Texte von Spielern!), game.result
//
//    Abkürzung: <button data-action="zaehlen" data-value="2"> sendet den Zug automatisch.
//    Formulare: <form data-action="x"><input name="text"></form> sendet { text: '...' }.
export function render(el, s, game) {
  const myTurn = s.turn === game.me && !game.result;
  el.innerHTML = `
    <p class="center" style="font-size:4rem;font-weight:800">${s.count}</p>
    <p class="status">${game.result ? '' : myTurn ? 'Du bist dran' : `${game.esc(game.name(s.turn))} ist dran …`}</p>
    <div class="row center">
      <button class="btn primary" data-action="zaehlen" data-value="1" ${myTurn ? '' : 'disabled'}>+1</button>
      <button class="btn primary" data-action="zaehlen" data-value="2" ${myTurn ? '' : 'disabled'}>+2</button>
    </div>`;
}

// 6) Optional: eigenes CSS für dieses Spiel.
//    Vorhandene Klassen: card, btn, btn primary, row, stack, center, muted, big, status, ok, bad
// export const style = `.mein-spiel { ... }`;
