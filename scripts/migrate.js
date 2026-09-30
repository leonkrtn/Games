// Führt alle noch nicht gelaufenen Migrationen aus supabase/migrations/ aus.
//
//   npm run migrate            (lokal, liest DATABASE_URL aus .env.local)
//   automatisch in npm run build, aber nur beim Production-Deploy auf Vercel
//
// Welche Migrationen gelaufen sind, steht in supabase_migrations.schema_migrations –
// derselben Tabelle, die auch die Supabase CLI benutzt (`supabase db push` passt also dazu).
// Jede Migration läuft in einer Transaktion: ganz oder gar nicht.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');
const duringBuild = process.argv.includes('--build');

try {
  process.loadEnvFile(path.join(root, '.env.local'));
} catch {}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

if (duringBuild && process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
  console.log(`Migrationen übersprungen (Vercel-Umgebung "${process.env.VERCEL_ENV}", nur Production migriert).`);
  process.exit(0);
}
if (!url) {
  if (process.argv.includes('--strict')) {
    console.error('Keine Datenbank-Verbindung: DATABASE_URL fehlt (in .env.local oder als Umgebungsvariable).');
    process.exit(1);
  }
  console.log('Migrationen übersprungen: DATABASE_URL ist nicht gesetzt.');
  process.exit(0);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d{14}_[\w-]+\.sql$/.test(f))
  .sort();

// Supabase verlangt SSL. Mit DATABASE_CA (Zertifikat aus dem Supabase-Dashboard) wird es auch geprüft.
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ssl = local ? false : process.env.DATABASE_CA ? { ca: process.env.DATABASE_CA } : { rejectUnauthorized: false };
const connectionString = new URL(url);
connectionString.searchParams.delete('sslmode'); // SSL wird oben festgelegt
const client = new pg.Client({ connectionString: connectionString.href, ssl });

try {
  await client.connect();
  // Nur ein Deploy migriert gleichzeitig.
  await client.query(`select pg_advisory_lock(hashtext('spielzimmer-migrationen'))`);
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text not null primary key,
      statements text[],
      name text
    );
  `);
  const done = new Set(
    (await client.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version),
  );
  const pending = files.filter((f) => !done.has(f.slice(0, 14)));

  if (!pending.length)
    console.log(`Datenbank ist aktuell (${files.length} ${files.length === 1 ? 'Migration' : 'Migrationen'}).`);
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const version = file.slice(0, 14);
    const name = file.slice(15, -4);
    process.stdout.write(`Migration ${file} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)',
        [version, [sql], name],
      );
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.log('FEHLER');
      throw new Error(`Migration ${file} ist fehlgeschlagen und wurde zurückgenommen: ${err.message}`, { cause: err });
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
