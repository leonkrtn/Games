# Spielzimmer

Selbst ausgedachte Spiele zu zweit live spielen, am Handy oder Laptop.

Jeder legt ein Konto an (Benutzername und Passwort), dann fügt ihr euch als Freunde hinzu. Jede Freundschaft hat ein eigenes Spielzimmer mit Punktestand und Verlauf. Züge erscheinen sofort beim anderen.

Dabei sind drei Beispielspiele:

| Spiel | Zeigt, wie man … |
| --- | --- |
| Tic-Tac-Toe | abwechselnd zieht |
| Schere, Stein, Papier | gleichzeitig und geheim wählt |
| Wie gut kennst du mich? | eigene Fragen stellt, rät und bewertet |

## So funktioniert es

- **Next.js auf Vercel** liefert die Seite aus und rechnet jeden Spielzug aus (`app/api/room`).
- **Supabase (Postgres)** speichert Konten, Freundschaften, Spielzimmer, Punktestände und den Verlauf.
- **Supabase Realtime** sagt allen im Raum sofort Bescheid, wenn sich etwas geändert hat, und zeigt an, wer gerade online ist.
- Jedes Spiel ist eine einzelne Datei in `games/`.

## Online stellen

### 1. Supabase einrichten

1. Auf [supabase.com](https://supabase.com) ein neues Projekt anlegen. Als Region **Central EU (Frankfurt)** wählen, denn dort laufen auch die Vercel-Funktionen (`vercel.json`), und das macht die Züge schneller.
2. Im Dashboard **SQL Editor** öffnen, den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und auf **Run** klicken.
3. Unter **Project Settings → API Keys** (bzw. über den Button **Connect**) diese drei Werte heraussuchen: die Project URL, den **Publishable key** und einen **Secret key**.

### 2. Vercel einrichten

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden: **Add New → Project** und dieses Repository importieren.
2. Unter **Environment Variables** eintragen:

   | Name | Wert |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL, z.B. `https://abcd1234.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`), **niemals weitergeben** |

3. **Deploy** klicken. Danach habt ihr eine Adresse wie `https://spielzimmer.vercel.app`.

Wer Supabase über die Vercel-Integration verbindet, bekommt die Variablen automatisch. Die dort verwendeten älteren Namen (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) funktionieren ebenfalls.

Jede Änderung auf dem Hauptzweig wird automatisch online gestellt. Andere Zweige bekommen eine eigene Vorschau-Adresse.

**Hinweis:** Kostenlose Supabase-Projekte werden nach etwa einer Woche ohne Nutzung pausiert. Dann im Supabase-Dashboard auf „Restore“ klicken. Die Daten bleiben erhalten.

### 3. Benachrichtigungen einrichten

Damit das Handy meldet „Du bist dran“, braucht der Server ein Schlüsselpaar (VAPID). Zusätzlich in Vercel eintragen:

| Name | Wert |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | öffentlicher Schlüssel |
| `VAPID_PRIVATE_KEY` | privater Schlüssel, **niemals weitergeben** |

Ein neues Paar erzeugt `npx web-push generate-vapid-keys`. Danach `supabase/schema.sql` noch einmal im SQL Editor ausführen (legt die Tabelle für die Benachrichtigungen an, Vorhandenes bleibt unverändert) und neu deployen.

Auf der Startseite erscheint dann „Benachrichtigen, wenn ich dran bin“. Auf dem iPhone geht das nur in der App vom Home-Bildschirm (ab iOS 16.4). Benachrichtigt wird nur, wer die App gerade nicht offen hat.

## Auf dem iPhone als App

In Safari (oder einem anderen Browser) auf **Teilen** tippen und **Zum Home-Bildschirm** wählen. Das Spielzimmer startet dann mit eigenem Icon im Vollbild, ohne Browserleiste. Die Seite zeigt dazu auf dem iPhone selbst einen kurzen Hinweis.

Die App auf dem Home-Bildschirm hat einen eigenen Speicher, getrennt von Safari. Beim ersten Öffnen meldet man sich dort einmal an; Freunde und Punkte hängen am Konto.

## Lokal ausprobieren

Du brauchst [Node.js](https://nodejs.org) (Version 20.9 oder neuer).

```bash
npm install
npm run dev
```

Dann <http://localhost:3000> öffnen. Ohne Supabase-Zugangsdaten läuft ein **Testmodus**: Alles bleibt nur im Arbeitsspeicher, und die Browser fragen jede Sekunde nach dem neuen Stand. Zum Testen mit zwei Spielern ein zweites Browser-Fenster im privaten Modus öffnen.

Mit echter Datenbank: `.env.example` nach `.env.local` kopieren und die Werte eintragen.

## Konten und Freunde

- **Konto erstellen** mit Benutzername und Passwort. Es gibt keine E-Mail, also auch kein Zurücksetzen des Passworts per Mail.
- **Freund hinzufügen** per Benutzername: Die andere Person bekommt eine Anfrage und nimmt sie an.
- **Einladungslink teilen**: Wer den Link öffnet und sich anmeldet, ist sofort befreundet.
- Auf der Startseite steht bei jedem Freund der Punktestand und wer gerade dran ist. Antippen öffnet euer Spielzimmer.

## Ein neues Spiel erfinden

Jedes Spiel ist **eine einzige Datei** im Ordner `games/`. Mehr ist nicht nötig, die Lobby findet sie automatisch.

**Weg 1, beschreiben lassen:** Erzähl Claude einfach deine Idee, z.B.:

> Bau ein neues Spiel: Jeder schreibt heimlich 3 Wörter auf, dann werden sie gemischt und der andere muss raten, welche von mir sind.

Die Datei `CLAUDE.md` erklärt Claude, wie Spiele hier aufgebaut sind, und verlangt für jedes Spiel hochwertige Animationen und eine ansprechende Optik.

**Weg 2, selbst schreiben:** Kopiere `games/_vorlage.js` nach z.B. `games/mein-spiel.js` und passe sie an. Die Vorlage ist ein kleines, fertiges Spiel mit Erklärungen zu jedem Teil. Mit `npm run check` prüfst du, ob alles passt. Nach dem Anlegen einer neuen Datei `npm run dev` einmal neu starten.
