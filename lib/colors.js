// Spielerfarben in Beitrittsreihenfolge: Rot gegen Schwarz, in Gruppen dazu Blau, Ocker, Grün und Rostbraun.
export const PLAYER_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)'];

export function playerColor(players, id) {
  const i = players.findIndex((p) => p.id === id);
  return i < 0 ? 'var(--muted)' : PLAYER_COLORS[i % PLAYER_COLORS.length];
}
