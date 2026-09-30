// Spielerfarben in Beitrittsreihenfolge: Rot gegen Schwarz, weitere nur bei mehr als zwei.
const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];

export function playerColor(players, id) {
  const i = players.findIndex((p) => p.id === id);
  return i < 0 ? 'var(--muted)' : COLORS[i % COLORS.length];
}
