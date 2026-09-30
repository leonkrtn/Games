// Erzeugt lib/games.generated.js mit allen Spielen aus games/.
// Läuft automatisch bei `npm run dev` und `npm run build`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs
  .readdirSync(path.join(root, 'games'))
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
  .sort();

const lines = [
  '// Automatisch erzeugt von scripts/generate-games.js – nicht von Hand ändern.',
  ...files.map((f, i) => `import * as g${i} from '../games/${f}';`),
  '',
  'export default {',
  ...files.map((f, i) => `  ${JSON.stringify(f.slice(0, -3))}: g${i},`),
  '};',
  '',
];

fs.writeFileSync(path.join(root, 'lib', 'games.generated.js'), lines.join('\n'));
console.log(`Spiele: ${files.map((f) => f.slice(0, -3)).join(', ') || '(keine)'}`);
