// Spielerfarben in Beitrittsreihenfolge: Rot gegen Schwarz, in Gruppen dazu Blau, Ocker, Grün und Rostbraun.
export const PLAYER_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)'];

// Wer keine Farbe hat (nicht in der Liste, oder der siebte in einer Gruppe ohne Bildschirm): grau
export function playerColor(players, id) {
  const i = players.findIndex((p) => p.id === id);
  return PLAYER_COLORS[i] ?? 'var(--muted)';
}
