-- bilder-fuer-spiele
-- Bilder, die Spieler in einem Spiel hochladen (z.B. Screenshots bei Racker-Jagd).
-- Gehören zu einem Spielzimmer und werden gelöscht, sobald dort ein neues Spiel startet
-- oder jemand in die Lobby geht; spätestens nach ein paar Tagen (siehe lib/uploads.js).
-- Die Spiele kennen nur die id; geladen wird über /api/image, nur von Spielern des Zimmers.

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms (code) on delete cascade,
  owner uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('image/jpeg', 'image/png', 'image/webp')),
  data text not null, -- Base64
  size integer not null,
  created_at timestamptz not null default now()
);

create index if not exists uploads_room_idx on public.uploads (room_code, owner);
create index if not exists uploads_created_idx on public.uploads (created_at);

alter table public.uploads enable row level security;
