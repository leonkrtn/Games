-- tagesbild
-- Tagesbild: Zwei Freunde malen jeden Tag ein Bild zur selben Aufgabe (lib/tagesbild.js).
-- Eine Tabelle für alle Teile, jede Zeile mit eigener Version für das Speichern mit Versionsprüfung:
--   kind 'paar'  id '<Raum>:paar'                    Zustand des Paars (Mitglieder, Aufgaben, wer fertig ist)
--   kind 'tag'   id '<Raum>:tag:<Tag>'               ein Tag: Aufgabe, Herzen, Kommentare
--   kind 'bild'  id '<Raum>:bild:<Tag>:<Konto>'      die Zeichnung als Befehle (lib/malen.js)
--   kind 'mini'  id '<Raum>:mini:<Tag>:<Konto>'      kleines Vorschaubild für die Galerie (JPEG als Daten-URL)
-- Gehört zum Spielzimmer der Freundschaft: Endet sie, wird der Raum und damit alles hier gelöscht.

create table if not exists public.tagesbild (
  id text primary key,
  room_code text not null references public.rooms (code) on delete cascade,
  kind text not null check (kind in ('paar', 'tag', 'bild', 'mini')),
  day date,
  user_id uuid references public.users (id) on delete cascade,
  version integer not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists tagesbild_room_idx on public.tagesbild (room_code, kind, day);
create index if not exists tagesbild_paar_idx on public.tagesbild (kind) where kind = 'paar';

alter table public.tagesbild enable row level security;
