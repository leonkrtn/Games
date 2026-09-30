// VORLAGE für ein neues Spiel.
// Kopiere diese Datei, z.B. nach games/mein-spiel.js (ohne _ am Anfang),
// dann taucht das Spiel automatisch in der Lobby auf (lokal: `npm run dev` neu starten).
//
// Beispiel-Spiel "Bis 10": Abwechselnd zählt jeder 1 oder 2 weiter.
// Wer die 10 erreicht, gewinnt.

// 1) Name, Beschreibung und erlaubte Spielerzahl [min, max]
export const meta = {
  name: 'Bis 10',
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

// 3) Ein Spielzug. Läuft auf dem Server (kann bei gleichzeitigen Zügen wiederholt werden).
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
    state.result = { winners: [player], text: `${name} hat die 10.` };
  } else {
    state.turn = state.players.find((p) => p.id !== player).id;
  }
}

// 4) Optional: Was darf welcher Spieler sehen? (für Geheimnisse wie Handkarten)
//    Ohne view() sieht jeder den ganzen Zustand.
// export function view(state, me) {
//   return { ...state, geheim: undefined };
// }

// 4b) Optional: Auf wen wartet das Spiel gerade? (Liste von Spieler-IDs)
//     Diese Spieler bekommen eine Benachrichtigung "Du bist dran", wenn sie die App nicht offen haben.
//     Ohne waitingFor() werden bei jedem Zug alle anderen benachrichtigt.
export function waitingFor(state) {
  return [state.turn];
}

// 5) Anzeige. Läuft im Browser und wird bei jeder Änderung neu aufgerufen.
//    game.me = eigene id, game.players, game.name(id), game.color(id) (Spielerfarbe),
//    game.send(type, data), game.esc(text) (für Texte von Spielern!), game.result
//    Für Animationen: game.prev (Stand vor der Änderung), game.first, game.signal, game.reducedMotion.
//    Jedes Spiel soll hochwertige Animationen haben, siehe CLAUDE.md, Abschnitt „Motion und Optik“.
//
//    Abkürzung: <button data-action="zaehlen" data-value="2"> sendet den Zug automatisch.
//    Formulare: <form data-action="x"><label for="t">…</label><input id="t" name="text"></form>
//    sendet { text: '...' }.
export function render(el, s, game) {
  const myTurn = s.turn === game.me && !game.result;
  el.innerHTML = `
    <p class="display bis10-count ${game.prev && game.prev.count !== s.count ? 'bump' : ''}">${s.count}</p>
    ${game.result ? '' : `<p class="status"><span class="marker" style="color:${game.color(s.turn)}"></span>
      ${myTurn ? 'Du bist dran.' : `${game.esc(game.name(s.turn))} ist dran.`}</p>`}
    <div class="row">
      <button class="btn primary" data-action="zaehlen" data-value="1" ${myTurn ? '' : 'disabled'}>1 weiter</button>
      <button class="btn" data-action="zaehlen" data-value="2" ${myTurn ? '' : 'disabled'}>2 weiter</button>
    </div>`;
}

// 6) Optional: eigenes CSS für dieses Spiel (Klassen mit dem Spielnamen beginnen).
//    Gestaltungsregeln und vorhandene Klassen stehen in CLAUDE.md.
//    Die Zahl springt beim Weiterzählen kurz von unten herein (nur wenn sie sich geändert hat).
export const style = `
  .bis10-count { font-size: var(--t-4xl); font-variant-numeric: tabular-nums; }
  .bis10-count.bump { animation: bis10-bump 320ms cubic-bezier(.2,.8,.2,1); }
  @keyframes bis10-bump { from { opacity: 0; transform: translateY(24px) scale(.9); } }
  @media (prefers-reduced-motion: reduce) { .bis10-count.bump { animation: none; } }
`;
