// Prüft alle Spiele in games/ auf die Grundregeln: `npm run check`
// (lädt jede Datei, startet ein Spiel und schaut, ob der Zustand verschickt werden kann).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'games');
let failed = 0;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
  const problems = [];
  try {
    const mod = await import(pathToFileURL(path.join(dir, file)));
    if (!mod.meta?.name) problems.push('export const meta = { name: ... } fehlt');
    for (const fn of ['setup', 'action', 'render']) {
      if (typeof mod[fn] !== 'function') problems.push(`export function ${fn} fehlt`);
    }
    if (typeof mod.setup === 'function') {
      const [min = 1, max = 99] = mod.meta?.players ?? [];
      // Spieloptionen: einmal mit den Vorgaben, dann jede Wahl einzeln.
      const options = mod.meta?.options ?? [];
      const defaults = Object.fromEntries(options.map((o) => [o.id, o.choices?.[0]?.value]));
      const variants = [defaults];
      for (const o of options) {
        if (!o.id || !o.choices?.length) problems.push('meta.options: jede Option braucht id und choices');
        for (const c of (o.choices ?? []).slice(1)) variants.push({ ...defaults, [o.id]: c.value });
      }
      // Jede erlaubte Spielerzahl bis sechs (so groß werden Gruppen)
      for (let n = min; n <= Math.min(max, 6); n++) {
        const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Spieler ${i + 1}` }));
        for (const chosen of variants) {
          const state = mod.setup(players, chosen);
          if (!state || typeof state !== 'object') problems.push('setup() muss ein Objekt zurückgeben');
          structuredClone(state);
          JSON.stringify(state);
          for (const p of players) JSON.stringify(mod.view ? mod.view(state, p.id) : state);
        }
      }
    }
  } catch (err) {
    problems.push(err.stack ?? String(err));
  }
  if (problems.length) {
    failed++;
    console.log(`✗ ${file}\n  ${problems.join('\n  ')}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

process.exit(failed ? 1 : 0);
