-- Ausgangsstand des Spielzimmers (Räume, Verlauf, Konten, Freunde, Geräte).
-- Absichtlich mit "if not exists": läuft auch auf einer Datenbank, in der schema.sql schon ausgeführt wurde.


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

-- Konten: Benutzername und Passwort (als scrypt-Hash, nie im Klartext).
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique, -- klein geschrieben, zum Suchen und Anmelden
  display_name text not null, -- so wie eingegeben, zum Anzeigen
  password_hash text not null,
  invite_code text not null unique, -- für Einladungslinks
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- Angemeldete Geräte. Gespeichert wird nur ein Hash des Sitzungs-Tokens.
create table if not exists public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on public.sessions (user_id);

-- Freundschaften. Jedes Paar hat genau einen Eintrag und nach dem Annehmen ein gemeinsames Spielzimmer.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.users (id) on delete cascade,
  addressee uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  room_code text references public.rooms (code) on delete set null,
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);

create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- Benachrichtigungen: ein Eintrag pro Gerät (Push-Abo des Browsers).
-- active_until/active_view: solange das Gerät diese Ansicht offen hat, keine Benachrichtigung dafür.
create table if not exists public.devices (
  endpoint text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  subscription jsonb not null,
  active_view text,
  active_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists devices_user_idx on public.devices (user_id);

-- Alte Tabelle aus der Zeit ohne Konten
drop table if exists public.push_subscriptions;

-- Nur der Server (mit dem Secret Key) darf lesen und schreiben.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.friendships enable row level security;
alter table public.devices enable row level security;
