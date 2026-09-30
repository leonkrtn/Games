-- Spielzimmer: Datenbank-Schema für Supabase.
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.

-- Ein Raum mit Spielern, Punktestand und laufendem Spiel.
-- Alles steckt in `data`, damit ein Zug immer in einem Schritt gespeichert wird.
-- `version` verhindert, dass sich zwei gleichzeitige Züge gegenseitig überschreiben.
create table if not exists public.rooms (
  code text primary key,
  version integer not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verlauf: jedes beendete Spiel.
create table if not exists public.results (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms (code) on delete cascade,
  game_id text not null,
  game_name text not null,
  winners jsonb not null default '[]',
  text text,
  finished_at timestamptz not null default now()
);

create index if not exists results_room_idx on public.results (room_code, finished_at desc);

-- Nur der Server (mit dem Secret Key) darf lesen und schreiben.
-- Ohne Policies kommt der öffentliche Schlüssel aus dem Browser nicht an die Daten.
alter table public.rooms enable row level security;
alter table public.results enable row level security;
