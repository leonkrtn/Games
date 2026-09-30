// Legt eine neue, leere Migration an:  npm run migration -- kurze-beschreibung
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const name = (process.argv[2] ?? '')
  .toLowerCase()
  .replace(/ä/g, 'ae')
  .replace(/ö/g, 'oe')
  .replace(/ü/g, 'ue')
  .replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
if (!name) {
  console.error('Bitte einen Namen angeben, z.B.:  npm run migration -- spitznamen-fuer-freunde');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14); // JJJJMMTTHHMMSS in UTC
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const file = path.join(dir, `${stamp}_${name}.sql`);
fs.writeFileSync(
  file,
  `-- ${name}\n-- Neue Tabellen mit "alter table ... enable row level security" (ohne Policies: nur der Server hat Zugriff).\n\n`,
);
console.log(`Angelegt: supabase/migrations/${path.basename(file)}`);
