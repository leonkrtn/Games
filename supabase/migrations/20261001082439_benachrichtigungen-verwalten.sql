-- benachrichtigungen-verwalten
-- Einstellungen pro Konto, worüber und von wem man benachrichtigt wird (gelten für alle Geräte):
-- { "turn": bool, "start": bool, "end": bool, "friends": bool, "muted": [Konto-IDs] }. Fehlt ein Schlüssel, ist er an.
alter table public.users add column if not exists notify_settings jsonb not null default '{}'::jsonb;

-- Geräteliste: lesbarer Name (z.B. "iPhone, App") und ob das Gerät benachrichtigt wird.
-- enabled = false: aus der Liste entfernt. Das Gerät bekommt nichts mehr, bis man dort selbst wieder einschaltet.
alter table public.devices add column if not exists label text;
alter table public.devices add column if not exists enabled boolean not null default true;
