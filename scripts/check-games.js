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
      for (const n of new Set([min, Math.min(max, min + 1)])) {
        const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Spieler ${i + 1}` }));
        const state = mod.setup(players);
        if (!state || typeof state !== 'object') problems.push('setup() muss ein Objekt zurückgeben');
        structuredClone(state);
        JSON.stringify(state);
        for (const p of players) JSON.stringify(mod.view ? mod.view(state, p.id) : state);
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
