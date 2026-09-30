# Spielzimmer

Kleine Web-Plattform, um selbst erfundene Spiele zu zweit live gegeneinander zu spielen (Handy oder Laptop). Oberfläche und Texte sind **auf Deutsch**. Next.js (App Router, JavaScript) auf Vercel, Supabase als Datenbank und für Live-Updates.

## Aufbau

- `games/*.js`: **ein Spiel = eine Datei.** Dateien mit `_` am Anfang erscheinen nicht in der Lobby (`_vorlage.js` ist die kommentierte Vorlage).
- `scripts/generate-games.js`: erzeugt `lib/games.generated.js` (gitignored) mit allen Spielen; läuft automatisch in `npm run dev`/`npm run build`.
- `lib/room.js`: Räume, Spieler, Züge. Lädt den Raum, wendet die Anfrage an und speichert mit Versionsprüfung (optimistisches Sperren, bei Konflikt neu laden und wiederholen).
- `app/api/room/route.js`: eine POST-Route für alles (`t: join | state | choose | restart | lobby | action | leave`). Nach einer Änderung wird per Supabase Realtime Broadcast (`room:<CODE>`, Event `update`, Payload `{ version }`) Bescheid gesagt; die Browser holen sich dann ihre eigene Ansicht (`t: 'state'`).
- `lib/store/`: Datenbankzugriff: `supabase.js` (Secret Key, nur Server), `memory.js` (lokaler Testmodus ohne Supabase; die Browser fragen dann jede Sekunde nach).
- `components/App.js`: Startseite, Raum, Lobby, Verlauf, Realtime-Abo und Presence (wer online ist). `components/GameView.js` ruft `render()` des Spiels auf.
- `supabase/schema.sql`: Tabellen `rooms` (ein Raum = eine Zeile, alles in `data` jsonb, `version` für die Konfliktprüfung) und `results` (Verlauf). RLS an, keine Policies: nur der Server liest und schreibt.

Spieler identifizieren sich mit `playerId` (öffentlich) und `token` (geheim, beides im `localStorage`). Der Token steht in `rooms.data.players` und darf nie in einer Antwort an den Browser landen.

Tritt jemand mit einem Namen bei, den es im Raum schon gibt (Groß-/Kleinschreibung egal), antwortet der Server mit 409 `name_taken`. Nach „Ja, das bin ich“ (`join` mit `takeover: true`) bekommt der bestehende Platz den neuen Token, und der Browser übernimmt dessen `playerId`. Das alte Gerät bekommt danach 403. Wichtig vor allem fürs iPhone: Web-Apps auf dem Home-Bildschirm haben einen eigenen Speicher, getrennt von Safari.

iPhone-Web-App: `app/manifest.js`, `appleWebApp` und `apple-mobile-web-app-capable` in `app/layout.js`, Abstände über `env(safe-area-inset-*)` in `app/globals.css`, Installationshinweis `InstallHint` in `components/App.js` (nur iOS, nicht im Vollbildmodus).

## Ein neues Spiel bauen

Wenn der Nutzer ein Spiel beschreibt: neue Datei `games/<kurzer-name>.js` anlegen (Kleinbuchstaben, Bindestriche). Sonst nichts ändern, außer das Spiel braucht wirklich eine neue Plattform-Funktion. `games/_vorlage.js` und die drei Beispielspiele zeigen die Muster:

- `tic-tac-toe.js`: abwechselnd ziehen
- `schere-stein-papier.js`: gleichzeitige geheime Züge (`view`)
- `kennst-du-mich.js`: Phasen, Texteingaben per Formular, geheime Antwort

Die Datei läuft **sowohl auf dem Server als auch im Browser** und wird von Next.js gebündelt: keine `import`s von Node-Modulen oder npm-Paketen, kein React, keine Browser-Globals außerhalb von `render`.

```js
export const meta = { name, description, players: [min, max] };

// Server: Startzustand. players = [{ id, name }]
export function setup(players) { return state; }

// Server: ein Zug. state direkt verändern (oder neuen Zustand zurückgeben).
// Ungültig → throw new Error('Text für den Spieler')   (wird als Hinweis angezeigt)
// Ende    → state.result = { winners: [playerId, ...], text: 'X gewinnt!' }
//           (winners bekommen je einen Punkt und es gibt einen Eintrag im Verlauf; [] = niemand)
export function action(state, { player, type, data }) {}

// Optional, Server: was `me` sehen darf (versteckte Infos entfernen). Standard: ganzer state.
export function view(state, me) { return state; }

// Browser: zeichnet die Ansicht, wird bei jeder Änderung neu aufgerufen (innerHTML neu setzen ist ok).
// game = { me, players, name(id), color(id), send(type, data), esc(text), result }
export function render(el, view, game) {}

// Optional: CSS nur für dieses Spiel (Klassen mit Spielnamen präfixen).
export const style = `...`;
```

Regeln und Tipps:
- `state` muss reines JSON sein (keine Funktionen, `Map`, `Set`, `Date`-Objekte) und klein bleiben, denn er wird bei jedem Zug komplett in Postgres gespeichert.
- `action` kann bei gleichzeitigen Zügen mehrmals auf einer frischen Kopie laufen: keine Nebenwirkungen außerhalb von `state`.
- Zufall (`Math.random`) nur in `setup`/`action`, **nie in `render`**.
- Jede Aktion prüfen: ist der Spieler dran, ist er Teil des Spiels, ist die Phase richtig, sind die Daten gültig.
- Geheimes (Handkarten, Antworten, Wahl des Gegners) immer in `view` für die anderen entfernen. Der Browser bekommt nur, was `view` liefert.
- Texte von Spielern und Spielernamen in `render` immer mit `game.esc()` einsetzen.
- Klicks: `<button data-action="typ" data-value="3">` sendet automatisch `send('typ', 3)` (`data-value` wird als JSON gelesen, sonst als Text). Formulare: `<form data-action="typ">` mit `<input name="x">` sendet `{ x: '...' }`.
- Rein lokale Interaktion (z.B. Vorschlag in ein Feld schreiben) per `el.querySelector(...).addEventListener` nach dem Setzen von `innerHTML`.
- Auf Handy-Breite (360px) muss alles passen, ohne seitliches Scrollen.
- Das Ergebnis-Banner mit „Nochmal“/„Anderes Spiel“ zeigt die Plattform selbst an.
- Ein Zug dauert einen Server-Aufruf plus eine Realtime-Nachricht (einige hundert Millisekunden): gut für Runden- und Rate-Spiele, nicht für Reaktions- oder Echtzeit-Action. Timer/Countdowns gibt es noch nicht als Plattform-Funktion.

## Gestaltung

Vorbild ist ein gedruckter Spielblock: weißes Papier, schwarze Schrift, Linien statt Kästen, eine einzige Farbe. Die Seite soll nicht nach KI-Standard-Design aussehen. Deshalb gilt, auch für neue Spiele:

- **Farben:** Hintergrund immer Weiß (`--paper`), Schrift `--ink`, Nebentext `--muted`, Linien `--line` (kräftig) und `--hairline` (fein), Hover-Fläche `--wash`. Spielerfarben nur über `game.color(id)` (Rot `--p1` gegen Schwarz `--p2`, in Beitrittsreihenfolge). Keine weiteren Farben, keine Verläufe, keine Violett-/Indigo-Töne, kein Leuchten.
- **Schrift:** `--font-display` (Big Shoulders, schmal) für Namen, Überschriften und große Zahlen; `--font-body` (Atkinson Hyperlegible Next) für Text. Die Textschrift hat eine durchgestrichene Null: Zahlen im Fließtext als Wort schreiben („drei zu null“), Zahlenanzeigen mit Klasse `num` oder in `--font-display`. Größen über `--t-sm`, `--t-base`, `--t-md`, `--t-lg`, `--t-xl`, `--t-2xl`, `--t-3xl`, `--t-4xl`.
- **Keine Emojis** als Icons, Spielfiguren, Deko oder in Ergebnistexten. Wörter, Buchstaben (X/O) oder die Klasse `marker` (Quadrat in Spielerfarbe) verwenden.
- **Formen:** Ecken `--radius` (2px) bzw. `--radius-m` (4px), keine Pillen, keine Schatten, keine farbigen Seitenränder an Kästen. Gruppieren mit Linien und Abstand; ein Kasten (`panel`) nur, wenn er wirklich etwas zusammenhält.
- **Bewegung:** keine Einblend- oder Hüpf-Animationen, kein Vergrößern beim Hover. Erlaubt: Hintergrundwechsel beim Hover, 1px Eindrücken beim Klick.
- **Texte:** kurz und konkret, ganze Sätze mit Punkt, keine Gedankenstriche als Satzverbindung, keine Ausrufezeichen-Häufung, keine Werbesprache. Jede Information nur einmal pro Ansicht.
- **Eingaben** haben immer ein sichtbares `<label>`, nicht nur einen Platzhalter. Pro Ansicht höchstens ein `btn primary`.
- Vorhandene Klassen: `btn`, `btn primary`, `link` (Textknopf), `panel`, `row`, `stack`, `center`, `muted`, `big`, `status`, `num`, `display`, `marker`, `ok`, `bad`.

## Prüfen

- `npm run check`: lädt alle Spiele, ruft `setup` und `view` auf und prüft, ob der Zustand verschickt werden kann.
- `npm run build`: muss fehlerfrei durchlaufen (Vercel baut genauso).
- `npm run dev` ohne `.env.local` startet den Testmodus ohne Supabase. Zum Spielen zwei getrennte Browser-Profile bzw. ein privates Fenster nutzen (die Spieler-ID liegt im `localStorage`). Nach dem Anlegen einer neuen Spieldatei `npm run dev` neu starten.
