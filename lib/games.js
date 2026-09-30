// Alle Spiele aus games/ – wird auf dem Server und im Browser benutzt.
import modules from './games.generated.js';

export const games = new Map();

for (const [id, mod] of Object.entries(modules)) {
  const missing = ['setup', 'action', 'render'].filter((fn) => typeof mod[fn] !== 'function');
  if (!mod.meta?.name) missing.push('meta.name');
  if (missing.length) {
    console.error(`Spiel "${id}" wird übersprungen, es fehlt: ${missing.join(', ')}`);
    continue;
  }
  const [min = 1, max = 99] = mod.meta.players ?? [];
  games.set(id, {
    id,
    mod,
    meta: {
      name: mod.meta.name,
      description: mod.meta.description ?? '',
      players: [min, max],
    },
  });
}

export const gameList = [...games.values()].map(({ id, meta }) => ({ id, ...meta }));
