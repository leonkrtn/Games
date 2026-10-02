-- gruppen
-- Gruppen-Spielzimmer: ein Raum für bis zu sechs Leute (Freundschaften haben weiter ihren Raum zu zweit).
-- Wer mitspielt, Punkte und der Name der Gruppe stehen wie bei jedem Raum in rooms.data
-- (data.players, data.group.name). Diese Tabelle ist nur das Verzeichnis für die Startseite:
-- In welchen Gruppen ist ein Konto? Maßgeblich bleibt data.players.

create table if not exists public.group_members (
  room_code text not null references public.rooms (code) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.group_members enable row level security;
