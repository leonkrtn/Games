# Spielzimmer

Kleine Web-Plattform, um selbst erfundene Spiele mit Freunden live gegeneinander zu spielen (Handy oder Laptop). Oberfläche und Texte sind **auf Deutsch**. Next.js (App Router, JavaScript) auf Vercel, Supabase als Datenbank und für Live-Updates.

## Arbeitsweise

Änderungen immer direkt auf `master` committen und pushen (Vercel stellt `master` automatisch online). Keine Feature-Branches und keine Pull Requests, außer der Nutzer bittet ausdrücklich darum. Vor dem Push `npm run check` und `npm run build` laufen lassen.

**Datenbank nur über Migrationen ändern.** Jede Änderung am Schema ist eine neue Datei in `supabase/migrations/` (anlegen mit `npm run migration -- kurze-beschreibung`, Name `JJJJMMTTHHMMSS_beschreibung.sql`). Bereits vorhandene Migrationen nie bearbeiten, auch nicht für Korrekturen: dafür eine weitere Migration schreiben. Neue Tabellen mit `enable row level security` (ohne Policies). Der Production-Build führt fehlende Migrationen automatisch aus (`scripts/migrate.js`, braucht `DATABASE_URL`); es gibt keine `schema.sql` mehr zum Einfügen. Nach einer Schema-Änderung auch `lib/store/memory.js` anpassen, damit der lokale Testmodus gleich funktioniert. Keine Befehle, die nicht in einer Transaktion laufen (z.B. `create index concurrently`).

## Aufbau

Ablauf für Nutzer: Konto erstellen (Benutzername + Passwort, keine E-Mail) → Freunde hinzufügen → jede Freundschaft hat ein eigenes Spielzimmer mit Punktestand und Verlauf → darin Spiele starten.

- `games/*.js`: **ein Spiel = eine Datei.** Dateien mit `_` am Anfang erscheinen nicht in der Lobby (`_vorlage.js` ist die kommentierte Vorlage).
- `scripts/generate-games.js`: erzeugt `lib/games.generated.js` (gitignored) mit allen Spielen; läuft automatisch in `npm run dev`/`npm run build`.
- `lib/auth.js`: Passwörter (scrypt), Sitzungen (zufälliger Token im httpOnly-Cookie `sz_session`, in der Datenbank nur als SHA-256-Hash), Sperre nach mehreren Fehlversuchen.
- `lib/account.js` + `app/api/account/route.js`: Konto (`me`, `signup`, `login`, `logout`, `invite-info`), Startseite (`home`: Freunde mit Punkten und wer dran ist, Anfragen), Freunde (`friend-add` per Benutzername → die andere Person muss annehmen; `friend-invite` per Einladungslink → sofort befreundet; `friend-accept`; `friend-remove` löscht auch das Spielzimmer; `invite-reset` macht den alten Einladungslink ungültig), Benachrichtigungen pro Gerät (`push-subscribe`, `push-unsubscribe`, `seen`, `push-test`, `push-remove`) und pro Konto (`notify-get`, `notify-set`).
- `lib/room.js` + `app/api/room/route.js`: Spielzimmer und Züge (`t: state | choose | restart | lobby | action`). Lädt den Raum, ruft `tick()` des Spiels auf (abgelaufene Fristen), wendet die Anfrage an und speichert mit Versionsprüfung (optimistisches Sperren, bei Konflikt neu laden und wiederholen). Züge, die den Zustand nicht ändern, werden nicht gespeichert. Spieler-IDs sind Konto-IDs; wer nicht im Raum ist, bekommt 403. Der Snapshot enthält `now` (Serverzeit) für Countdowns.
- `lib/uploads.js` + `app/api/image/route.js` + `components/images.js`: Bilder aus Spielen (`game.upload`). Der Browser verkleinert auf höchstens 1600 px und schickt JPEG als Base64 (POST, JSON); gespeichert in der Tabelle `uploads`. `GET /api/image?id=…` liefert fremde Bilder nur, wenn die id in der `view()` des Anfragenden vorkommt. Gelöscht werden die Bilder eines Zimmers bei `choose`, `restart` und `lobby`, spätestens nach drei Tagen.
- Nach einer Änderung per Supabase Realtime Broadcast Bescheid sagen: `room:<CODE>` (Payload `{ version }`, die Browser holen sich dann ihre eigene Ansicht mit `t: 'state'`) und `user:<ID>` (Freundesliste neu laden).
- `lib/store/`: Datenbankzugriff: `supabase.js` (Secret Key, nur Server), `memory.js` (lokaler Testmodus ohne Supabase; die Browser fragen dann regelmäßig nach). Beide müssen dieselben Funktionen haben.
- `components/App.js` (Anmeldestatus, Ansicht aus der Adresse: `?raum=CODE` Spielzimmer, `?seite=freunde` bzw. `?seite=benachrichtigungen`, sonst Startseite; Benachrichtigungen fürs Gerät), `Auth.js` (Anmelden/Registrieren), `Home.js` (Freundesliste, Anfragen, Menü; `useHomeData` liefert die Daten auch der Freunde-Seite), `Friends.js` (Freunde verwalten: Anfragen, hinzufügen, Einladungslink teilen und erneuern, Freundschaft beenden), `NotifySettings.js` (dieses Gerät an/aus mit Testnachricht, worüber, von wem, Geräteliste), `Room.js` (Anzeigetafel, Lobby, Verlauf, Realtime und Presence), `GameView.js` (ruft `render()` des Spiels auf).
- `supabase/migrations/`: das Datenbankschema als Folge von Migrationen, ausgeführt von `scripts/migrate.js` (protokolliert in `supabase_migrations.schema_migrations`, wie die Supabase CLI). Tabellen: `rooms` (ein Raum = eine Zeile, alles in `data` jsonb, `version` für die Konfliktprüfung), `results` (Verlauf), `users` (mit `notify_settings`), `sessions`, `friendships` (ein Eintrag pro Paar, `room_code` nach dem Annehmen), `devices` (Push-Abos mit `label` und `enabled`), `uploads` (Bilder aus Spielen, Base64). RLS an, keine Policies: nur der Server liest und schreibt.

Sicherheit: API-Routen nehmen nur `application/json` an (Schutz vor fremden Formularen), das Sitzungs-Cookie ist `httpOnly`, `SameSite=Lax` und in Produktion `Secure`. Passwort-Hashes und Sitzungs-Tokens dürfen nie in einer Antwort landen (`publicUser()` benutzen).

Benachrichtigungen (Web Push): `lib/push.js` verschickt (nur an bekannte Push-Dienste, `PUSH_ALLOWED_HOSTS` erlaubt zusätzliche Hosts für Tests), `lib/push-client.js` und `usePushDevice` in `components/App.js` für Erlaubnis und Abo, `public/sw.js` zeigt sie an (ohne Caching). Solange die App sichtbar ist, meldet sie alle 30 s mit `t: 'seen'`, welche Ansicht offen ist (`home` oder Raum-Code); für genau diese Ansicht gibt es dann keine Benachrichtigung. Wer benachrichtigt wird: bei Spielstart und Spielende die anderen, nach einem Zug die Spieler aus `waitingFor()` außer dem, der gezogen hat (oder was `notices()` des Spiels sagt), außerdem bei Freundschaftsanfragen. Der Service Worker zeigt pro Raum nur die neueste Nachricht (Raum-Version als `seq`).

Einstellungen dazu: Jede Nachricht hat eine Art (`kind`: `turn`, `start`, `end`, `friends`) und einen Auslöser (`from`). `sendPushes` in `lib/push.js` lässt weg, was der Empfänger in `users.notify_settings` abgeschaltet hat (Art aus oder Freund in `muted`); fehlende Schlüssel gelten als an (`notifySettings()`). Geräte mit `enabled = false` wurden in der Geräteliste entfernt und bekommen nichts. Öffnet man die App auf so einem Gerät, verknüpft sie das vorhandene Abo zwar mit dem Konto, es bleibt aber aus; erst Einschalten auf dem Gerät selbst (`push-subscribe` mit `explicit: true`) macht es wieder an. In der Liste stehen Geräte nur mit Name (`label`, z.B. „iPhone, App“) und einem Kürzel, nie mit dem Endpoint.

iPhone-Web-App: `app/manifest.js`, `appleWebApp` und `apple-mobile-web-app-capable` in `app/layout.js`, Abstände über `env(safe-area-inset-*)` in `app/globals.css`, Installationshinweis `InstallHint` in `components/Home.js` (nur iOS, nicht im Vollbildmodus). Die App vom Home-Bildschirm hat einen eigenen Speicher, man meldet sich dort einmal an.

## Ein neues Spiel bauen

Wenn der Nutzer ein Spiel beschreibt: neue Datei `games/<kurzer-name>.js` anlegen (Kleinbuchstaben, Bindestriche). Sonst nichts ändern, außer das Spiel braucht wirklich eine neue Plattform-Funktion. `games/_vorlage.js` und die Beispielspiele zeigen die Muster:

- `tic-tac-toe.js`: abwechselnd ziehen, **und das Vorbild für Animationen** (Striche einzeichnen, Gewinnlinie, Vergleich mit `game.prev`)
- `schere-stein-papier.js`: gleichzeitige geheime Züge (`view`)
- `kennst-du-mich.js`: Phasen, Texteingaben per Formular, geheime Antwort
- `racker-jagd.js`: Bilder hochladen mit Zuschnitt, Zeitlimit (`tick`, `game.now`), eigene Benachrichtigungen (`notices`), lokaler Zustand, der neues Zeichnen übersteht

Die Datei läuft **sowohl auf dem Server als auch im Browser** und wird von Next.js gebündelt: keine `import`s von Node-Modulen oder npm-Paketen, kein React, keine Browser-Globals außerhalb von `render`.

```js
export const meta = { name, description, players: [min, max] };

// Server: Startzustand. players = [{ id, name }]
export function setup(players) { return state; }

// Server: ein Zug. state direkt verändern (oder neuen Zustand zurückgeben).
// Ungültig → throw new Error('Text für den Spieler')   (wird als Hinweis angezeigt)
// Ende    → state.result = { winners: [playerId, ...], text: 'X gewinnt.' }
//           (winners bekommen je einen Punkt und es gibt einen Eintrag im Verlauf; [] = niemand)
export function action(state, { player, type, data }) {}

// Optional, Server: was `me` sehen darf (versteckte Infos entfernen). Standard: ganzer state.
export function view(state, me) { return state; }

// Optional, Server: auf wen das Spiel gerade wartet (Spieler-IDs). Diese bekommen nach einem Zug
// die Benachrichtigung "Du bist dran", und die Freundesliste zeigt es an. Ohne waitingFor: alle.
export function waitingFor(state) { return [state.turn]; }

// Optional, Server: eigene Benachrichtigungen statt "Du bist dran" nach einem Zug oder tick.
// before = Zustand vorher, player = wer es ausgelöst hat (bekommt selbst nichts). Spielende: macht die Plattform.
export function notices(state, before, player) { return [{ to: playerId, text: '...' }]; }

// Optional, Server: Fristen. Läuft vor jeder Anfrage im Raum, now = Serverzeit in ms.
export function tick(state, now) { if (now >= state.deadline) state.phase = 'weiter'; }

// Browser: zeichnet die Ansicht, wird bei jeder Änderung neu aufgerufen.
// game = { me, players, name(id), color(id), send(type, data), esc(text), result,
//          prev, first, signal, reducedMotion,   (siehe "Motion")
//          upload(datei|canvas) → Promise<{ id, width, height }>, imageUrl(id),
//          now() (Serverzeit in ms), refresh() (Stand neu laden) }
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
- Ein Zug dauert einen Server-Aufruf plus eine Realtime-Nachricht (einige hundert Millisekunden): gut für Runden- und Rate-Spiele, nicht für Reaktions- oder Echtzeit-Action.
- Zeitlimits: Frist in `action` mit `Date.now()` in den `state` schreiben, `tick(state, now)` schaltet weiter, wenn sie abgelaufen ist. Im Browser den Countdown mit `game.now()` rechnen (nicht `Date.now()`, die Handy-Uhr kann falsch gehen) und bei null `game.refresh()` aufrufen. `tick` läuft nur, wenn jemand den Raum lädt: Ist niemand da, schaltet das Spiel beim nächsten Öffnen weiter.
- Bilder: `await game.upload(datei)` (oder ein `<canvas>`, z.B. nach dem Zuschneiden) und nur die `id` mit `send` in den `state`, nie die Bilddaten selbst. Anzeigen mit `<img src="${game.esc(game.imageUrl(id))}">`. Geheime Bilder in `view` weglassen: Der Server liefert fremde Bilder nur aus, wenn ihre id in der `view` des Anfragenden steht. Nach der Partie werden sie gelöscht.

## Spiele: Motion und Optik

**Jedes neue Spiel muss optisch sehr ansprechend sein und hochwertige Motion Graphics haben.** Ein Spiel ist erst fertig, wenn es sich lebendig und hochwertig anfühlt: wie ein gut gemachtes Brettspiel, das sich bewegt. Statisches Umschalten von Zuständen reicht nicht. Die ruhige, zurückhaltende Gestaltung der Plattform (Startseite, Lobby, Anzeigetafel) bleibt davon unberührt; die Bühne für Bewegung ist das Spielfeld.

Was jedes Spiel haben soll:
- **Jede Zustandsänderung wird animiert**, nicht nur umgeschaltet: Züge, aufgedeckte Karten, Punkte, Phasenwechsel, wer dran ist. Gezeichnete Formen (SVG) zeichnen sich ein (`pathLength="1"` + `stroke-dashoffset`), Figuren gleiten an ihren Platz, Karten drehen sich um (3D-`rotateY` mit `backface-visibility`), Zahlen zählen hoch.
- **Ein Höhepunkt beim Spielende**: eine choreografierte Sequenz (z.B. Gewinnlinie ziehen, Siegerzüge hervorheben, der Rest tritt zurück), zeitlich gestaffelt statt alles gleichzeitig.
- **Ein Auftakt**: Beim Start einer Partie (`game.first`) baut sich das Spielfeld sichtbar auf, gestaffelt (`animation-delay` in Schritten von 60–120 ms).
- **Rückmeldung auf Eingaben**: Vorschau beim Darüberfahren (z.B. blasses eigenes Zeichen), spürbarer Druck beim Tippen (`:active` mit `scale(.96)`), klare Zustände für „nicht dran“.
- **Die Spielerfarben als Bühne**: Rot und Schwarz tragen die Bewegung; Flächen und Hervorhebungen über `color-mix(in srgb, <Spielerfarbe> 12%, white)`.
- Eigene Illustration statt Standardformen: SVG mit Charakter (z.B. Spielsteine mit Kante, Papier-Anmutung, Karten mit Rahmen). Keine Emojis, keine Clipart.

Technik:
- **Nur animieren, was sich geändert hat**: `game.prev` ist der Stand vor der Änderung (null beim ersten Zeichnen einer Partie), `game.first` ist `true` beim ersten Zeichnen. Neue Elemente bekommen eine Klasse (z.B. `enter`), deren CSS-Animation beim Einfügen startet. Vorbild: `games/tic-tac-toe.js`.
- Animieren mit **CSS-Keyframes, Transitions oder `element.animate()`** (Web Animations API); für Partikel oder viele Objekte ein `<canvas>` mit `requestAnimationFrame`.
- **Nur `transform`, `opacity` und SVG-Strichlängen animieren** (flüssige 60 fps auch auf dem Handy), nie `width`, `height`, `top`, `left`, `margin`.
- Laufende Animationen, Timer und Listener an `game.signal` hängen (`{ signal: game.signal }` bzw. `game.signal.addEventListener('abort', ...)`): das Signal wird abgebrochen, wenn die Partie endet oder die Ansicht verschwindet.
- Dauer: Rückmeldungen 120–200 ms, Züge 250–450 ms, Höhepunkte bis ca. 1,2 s insgesamt. Kurven: `cubic-bezier(.2,.8,.2,1)` zum Ankommen, `cubic-bezier(.6,0,.2,1)` für Wege; kein Hüpfen/Federn (`bounce`/`elastic`).
- **`prefers-reduced-motion` respektieren**: eigener Block `@media (prefers-reduced-motion: reduce)` im Spiel-CSS, der Animationen abschaltet und den Endzustand zeigt (`game.reducedMotion` gibt es auch in JavaScript). Das Spiel muss ohne Animation genauso verständlich sein.
- `render` wird bei jeder Änderung neu aufgerufen; wer ein Element über mehrere Züge hinweg bewegen will, kann das DOM behalten und gezielt ändern (z.B. `el.querySelector('.brett') ?? aufbauen()`), statt `innerHTML` neu zu setzen.

## Gestaltung der Plattform

Vorbild ist ein gedruckter Spielblock: weißes Papier, schwarze Schrift, Linien statt Kästen, eine einzige Farbe. Die Seite soll nicht nach KI-Standard-Design aussehen. Deshalb gilt überall, auch in Spielen:

- **Farben:** Hintergrund immer Weiß (`--paper`), Schrift `--ink`, Nebentext `--muted`, Linien `--line` (kräftig) und `--hairline` (fein), Hover-Fläche `--wash`. Spielerfarben nur über `game.color(id)` (Rot `--p1` gegen Schwarz `--p2`, in Beitrittsreihenfolge). Keine Verläufe, keine Violett-/Indigo-Töne, kein Leuchten.
- **Schrift:** `--font-display` (Big Shoulders, schmal) für Namen, Überschriften und große Zahlen; `--font-body` (Atkinson Hyperlegible Next) für Text. Die Textschrift hat eine durchgestrichene Null: Zahlen im Fließtext als Wort schreiben („drei zu null“), Zahlenanzeigen mit Klasse `num` oder in `--font-display`. Größen über `--t-sm`, `--t-base`, `--t-md`, `--t-lg`, `--t-xl`, `--t-2xl`, `--t-3xl`, `--t-4xl`.
- **Keine Emojis** als Icons, Spielfiguren, Deko oder in Ergebnistexten. Wörter, Buchstaben (X/O), eigene SVG-Formen oder die Klasse `marker` (Quadrat in Spielerfarbe) verwenden.
- **Formen:** Ecken `--radius` (2px) bzw. `--radius-m` (4px), keine Pillen, keine Schatten auf Kästen, keine farbigen Seitenränder an Kästen. Gruppieren mit Linien und Abstand.
- **Bewegung außerhalb des Spielfelds:** zurückhaltend. Hintergrundwechsel beim Hover, 1px Eindrücken beim Klick; keine Einblend-Animationen für ganze Abschnitte.
- **Texte:** kurz und konkret, ganze Sätze mit Punkt, keine Gedankenstriche als Satzverbindung, keine Ausrufezeichen-Häufung, keine Werbesprache. Jede Information nur einmal pro Ansicht.
- **Eingaben** haben immer ein sichtbares `<label>`, nicht nur einen Platzhalter. Pro Ansicht höchstens ein `btn primary`.
- Vorhandene Klassen: `btn`, `btn primary`, `link` (Textknopf), `panel`, `row`, `stack`, `center`, `muted`, `big`, `status`, `num`, `display`, `marker`, `ok`, `bad`.

## Prüfen

- `npm run check`: lädt alle Spiele, ruft `setup` und `view` auf und prüft, ob der Zustand verschickt werden kann.
- `npm run build`: muss fehlerfrei durchlaufen (Vercel baut genauso).
- `npm run dev` ohne `.env.local` startet den Testmodus ohne Supabase (Konten und Räume nur im Arbeitsspeicher). Zum Spielen zwei Konten in zwei getrennten Browser-Profilen bzw. einem privaten Fenster anlegen und befreunden. Nach dem Anlegen einer neuen Spieldatei `npm run dev` neu starten.
