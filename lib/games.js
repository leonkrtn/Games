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
      options: cleanOptions(id, mod.meta.options),
    },
  });
}

export const gameList = [...games.values()].map(({ id, meta }) => ({ id, ...meta }));

// Spieloptionen (meta.options): werden in der Lobby vor dem Start gewählt.
// [{ id, label, choices: [{ value, label }] }], die erste Wahl ist die Vorgabe.
function cleanOptions(gameId, options) {
  if (!Array.isArray(options)) return [];
  return options.flatMap((o) => {
    const choices = Array.isArray(o?.choices)
      ? o.choices
          .filter((c) => ['string', 'number', 'boolean'].includes(typeof c?.value))
          .map((c) => ({ value: c.value, label: String(c.label ?? c.value) }))
      : [];
    if (typeof o?.id !== 'string' || !o.id || !choices.length) {
      console.error(`Spiel "${gameId}": Option ohne id oder ohne choices wird übersprungen.`);
      return [];
    }
    return [{ id: o.id, label: String(o.label ?? o.id), choices }];
  });
}

/** Gewählte Optionen prüfen: Unbekanntes fällt auf die Vorgabe zurück. */
export function resolveOptions(options, wanted) {
  return Object.fromEntries(
    options.map((o) => {
      const value = wanted?.[o.id];
      return [o.id, o.choices.some((c) => c.value === value) ? value : o.choices[0].value];
    }),
  );
}
