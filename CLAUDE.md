# Spielzimmer

Kleine Web-Plattform, um selbst erfundene Spiele mit Freunden live gegeneinander zu spielen (Handy oder Laptop). Oberfläche und Texte sind **auf Deutsch**. Next.js (App Router, JavaScript) auf Vercel, Supabase als Datenbank und für Live-Updates.

## Arbeitsweise

Änderungen immer direkt auf `master` committen und pushen (Vercel stellt `master` automatisch online). Keine Feature-Branches und keine Pull Requests, außer der Nutzer bittet ausdrücklich darum. Vor dem Push `npm run check` und `npm run build` laufen lassen.

**Wissen festhalten.** Jede neue Methode und jede Erkenntnis (wie man etwas baut oder testet, welche Falle es gab und wie man sie umgeht) gleich mitschreiben, im selben Commit: kurze Regeln hier in `CLAUDE.md`, ausführliche Abläufe als Skill in `.claude/skills/<name>/SKILL.md`. Findet sich eine bessere Methode, den alten Eintrag ersetzen statt einen zweiten danebenzustellen. Vorhandene Skills: `zeichnen` (Zeichnungen und Abbildungen), `spiel-testen` (Logik simulieren, mit zwei bis sechs Konten im Browser spielen, Prüfstand für seltene Zustände, Finger-Gesten prüfen), `malflaeche` (Spiele, in denen gemalt wird: Raster, Eimer, Zurück/Vor, Übertragung mit `game.live`, alle gleichzeitig mit gedrosseltem Speichern).

**Datenbank nur über Migrationen ändern.** Jede Änderung am Schema ist eine neue Datei in `supabase/migrations/` (anlegen mit `npm run migration -- kurze-beschreibung`, Name `JJJJMMTTHHMMSS_beschreibung.sql`). Bereits vorhandene Migrationen nie bearbeiten, auch nicht für Korrekturen: dafür eine weitere Migration schreiben. Neue Tabellen mit `enable row level security` (ohne Policies). Der Production-Build führt fehlende Migrationen automatisch aus (`scripts/migrate.js`, braucht `DATABASE_URL`); es gibt keine `schema.sql` mehr zum Einfügen. Nach einer Schema-Änderung auch `lib/store/memory.js` anpassen, damit der lokale Testmodus gleich funktioniert. Keine Befehle, die nicht in einer Transaktion laufen (z.B. `create index concurrently`).

## Aufbau

Ablauf für Nutzer: Konto erstellen (Benutzername + Passwort, keine E-Mail) → Freunde hinzufügen → jede Freundschaft hat ein eigenes Spielzimmer mit Punktestand und Verlauf → darin Spiele starten. Für mehr Leute gründet man eine **Gruppe** (bis zu sechs, `GROUP_MAX` in `lib/room.js`): ein eigenes Spielzimmer, in dem immer alle Mitglieder mitspielen; Spiele, die nicht so viele Spieler erlauben, sind dort in der Lobby gesperrt.

- `games/*.js`: **ein Spiel = eine Datei.** Dateien mit `_` am Anfang erscheinen nicht in der Lobby (`_vorlage.js` ist die kommentierte Vorlage).
- `scripts/generate-games.js`: erzeugt `lib/games.generated.js` (gitignored) mit allen Spielen; läuft automatisch in `npm run dev`/`npm run build`.
- `lib/auth.js`: Passwörter (scrypt), Sitzungen (zufälliger Token im httpOnly-Cookie `sz_session`, in der Datenbank nur als SHA-256-Hash), Sperre nach mehreren Fehlversuchen.
- `lib/account.js` + `app/api/account/route.js`: Konto (`me`, `signup`, `login`, `logout`, `invite-info`), Startseite (`home`: Freunde mit Punkten und wer dran ist, Anfragen), Freunde (`friend-add` per Benutzername → die andere Person muss annehmen; `friend-invite` per Einladungslink → sofort befreundet; `friend-accept`; `friend-remove` löscht auch das Spielzimmer; `invite-reset` macht den alten Einladungslink ungültig), Gruppen (`group-create` mit Name und zwei bis fünf eigenen Freunden; `home` liefert auch `groups`), Benachrichtigungen pro Gerät (`push-subscribe`, `push-unsubscribe`, `seen`, `push-test`, `push-remove`) und pro Konto (`notify-get`, `notify-set`).
- `lib/room.js` + `app/api/room/route.js`: Spielzimmer und Züge (`t: state | choose | restart | lobby | action | live`, in Gruppen dazu `group-add` (eigenen Freund dazuholen, nur ohne laufendes Spiel), `group-rename`, `group-leave` (beendet eine laufende Partie, die letzte Person löscht den Raum)). Ein Gruppenraum hat `data.group = { name }`; Mitglieder sind wie immer `data.players`, die Reihenfolge ergibt die Farben. `choose` nimmt die in der Lobby gewählten Spieloptionen mit (`options`, geprüft mit `resolveOptions` aus `lib/games.js`), `restart` startet mit denselben, und `lastOptions` im Raum merkt sich die letzte Wahl pro Spiel für die Lobby. Lädt den Raum, ruft `tick()` des Spiels auf (abgelaufene Fristen), wendet die Anfrage an und speichert mit Versionsprüfung (optimistisches Sperren, bei Konflikt neu laden und wiederholen). Züge, die den Zustand nicht ändern, werden nicht gespeichert. Spieler-IDs sind Konto-IDs; wer nicht im Raum ist, bekommt 403. Der Snapshot enthält `now` (Serverzeit) für Countdowns. `t: 'live'` ist nur der Ersatzweg für `game.live` im Testmodus (siehe unten).
- `lib/uploads.js` + `app/api/image/route.js` + `components/images.js`: Bilder aus Spielen (`game.upload`). Der Browser verkleinert auf höchstens 1600 px und schickt JPEG als Base64 (POST, JSON); gespeichert in der Tabelle `uploads`. `GET /api/image?id=…` liefert fremde Bilder nur, wenn die id in der `view()` des Anfragenden vorkommt. Gelöscht werden die Bilder eines Zimmers bei `choose`, `restart` und `lobby`, spätestens nach drei Tagen.
- `game.live` (`components/live.js`, angeschlossen in `Room.js`): schnelle Nachrichten zwischen den Browsern eines Raums, ohne Speichern und ohne Garantie (z.B. Striche, während sie entstehen). Mit Supabase als Broadcast `live` im Kanal `room:<CODE>` direkt von Browser zu Browser (nur solange der Kanal verbunden ist, sonst verworfen). Im Testmodus über `t: 'live'` an den Server, der die letzten Sekunden in `memory.js` aufhebt (`pushLive`, `liveSince`); die Browser holen alle 150 ms ab, solange ein Spiel zuhört. Jede Nachricht trägt die Partie (`g`), alte kommen nicht in einer neuen Partie an.
- Reaktionen (`components/Reactions.js`, angeschlossen in `Room.js`): fünf gezeichnete Gesichter (Lachen, Verliebt, Staunen, Traurig, Wütend), die man im ganzen Spielzimmer schicken kann, auch in der Lobby. Knopf unten rechts mit ausklappbarer Leiste; das Gesicht steigt mit dem Namen auf und steht gut zwei Sekunden neben dem Namen in der Anzeigetafel (`recent` in `Room.js`). Geht über den `game.live`-Kanal als `{ react, from }` (ohne `g`, deshalb ignorieren die Spiele es), nur live, nichts gespeichert, keine Benachrichtigung. Höchstens eine pro Sekunde; der Empfänger nimmt nur bekannte Gesichter von Mitspielern an und bremst jeden Absender. Bei fokussiertem Textfeld (Handy-Tastatur) weicht der Knopf aus.
- Nach einer Änderung per Supabase Realtime Broadcast Bescheid sagen: `room:<CODE>` (Payload `{ version }`, die Browser holen sich dann ihre eigene Ansicht mit `t: 'state'`) und `user:<ID>` (Freundesliste neu laden).
- `lib/store/`: Datenbankzugriff: `supabase.js` (Secret Key, nur Server), `memory.js` (lokaler Testmodus ohne Supabase; die Browser fragen dann regelmäßig nach und holen `game.live`-Nachrichten beim Server ab). Beide müssen dieselben Funktionen haben.
- `components/App.js` (Anmeldestatus, Ansicht aus der Adresse: `?raum=CODE` Spielzimmer, `?seite=freunde`, `?seite=gruppe` bzw. `?seite=benachrichtigungen`, sonst Startseite; Benachrichtigungen fürs Gerät), `Auth.js` (Anmelden/Registrieren), `Home.js` (Freundesliste, Gruppen mit allen Punkten, Anfragen, Menü; `useHomeData` liefert die Daten auch der Freunde-Seite), `Friends.js` (Freunde verwalten: Anfragen, hinzufügen, Einladungslink teilen und erneuern, Freundschaft beenden), `NewGroup.js` (Gruppe gründen), `NotifySettings.js` (dieses Gerät an/aus mit Testnachricht, worüber, von wem, Geräteliste), `Room.js` (Anzeigetafel für bis zu sechs, Lobby, Verlauf, Realtime, Presence und `game.live`; in Gruppen der Name und unten Dazuholen, Umbenennen, Verlassen), `GameView.js` (ruft `render()` des Spiels auf).
- `supabase/migrations/`: das Datenbankschema als Folge von Migrationen, ausgeführt von `scripts/migrate.js` (protokolliert in `supabase_migrations.schema_migrations`, wie die Supabase CLI). Tabellen: `rooms` (ein Raum = eine Zeile, alles in `data` jsonb, `version` für die Konfliktprüfung), `results` (Verlauf), `users` (mit `notify_settings`), `sessions`, `friendships` (ein Eintrag pro Paar, `room_code` nach dem Annehmen), `group_members` (nur das Verzeichnis „wer ist in welchem Gruppenraum“ für die Startseite; maßgeblich ist `data.players`, die Startseite zeigt nur Gruppen, in denen man dort steht), `devices` (Push-Abos mit `label` und `enabled`), `uploads` (Bilder aus Spielen, Base64). RLS an, keine Policies: nur der Server liest und schreibt.

Sicherheit: API-Routen nehmen nur `application/json` an (Schutz vor fremden Formularen), das Sitzungs-Cookie ist `httpOnly`, `SameSite=Lax` und in Produktion `Secure`. Passwort-Hashes und Sitzungs-Tokens dürfen nie in einer Antwort landen (`publicUser()` benutzen).

Benachrichtigungen (Web Push): `lib/push.js` verschickt (nur an bekannte Push-Dienste, `PUSH_ALLOWED_HOSTS` erlaubt zusätzliche Hosts für Tests), `lib/push-client.js` und `usePushDevice` in `components/App.js` für Erlaubnis und Abo, `public/sw.js` zeigt sie an (ohne Caching). Solange die App sichtbar ist, meldet sie alle 30 s mit `t: 'seen'`, welche Ansicht offen ist (`home` oder Raum-Code); für genau diese Ansicht gibt es dann keine Benachrichtigung. Wer benachrichtigt wird: bei Spielstart und Spielende die anderen, nach einem Zug die Spieler aus `waitingFor()` außer dem, der gezogen hat (oder was `notices()` des Spiels sagt), außerdem bei Freundschaftsanfragen und wenn jemand dich in eine Gruppe holt (Art `friends`). Der Service Worker zeigt pro Raum nur die neueste Nachricht (Raum-Version als `seq`).

Einstellungen dazu: Jede Nachricht hat eine Art (`kind`: `turn`, `start`, `end`, `friends`) und einen Auslöser (`from`). `sendPushes` in `lib/push.js` lässt weg, was der Empfänger in `users.notify_settings` abgeschaltet hat (Art aus oder Freund in `muted`); fehlende Schlüssel gelten als an (`notifySettings()`). Geräte mit `enabled = false` wurden in der Geräteliste entfernt und bekommen nichts. Öffnet man die App auf so einem Gerät, verknüpft sie das vorhandene Abo zwar mit dem Konto, es bleibt aber aus; erst Einschalten auf dem Gerät selbst (`push-subscribe` mit `explicit: true`) macht es wieder an. In der Liste stehen Geräte nur mit Name (`label`, z.B. „iPhone, App“) und einem Kürzel, nie mit dem Endpoint.

iPhone-Web-App: `app/manifest.js`, `appleWebApp` und `apple-mobile-web-app-capable` in `app/layout.js`, Abstände über `env(safe-area-inset-*)` in `app/globals.css`, Installationshinweis `InstallHint` in `components/Home.js` (nur iOS, nicht im Vollbildmodus). Die App vom Home-Bildschirm hat einen eigenen Speicher, man meldet sich dort einmal an.

## Ein neues Spiel bauen

Wenn der Nutzer ein Spiel beschreibt: neue Datei `games/<kurzer-name>.js` anlegen (Kleinbuchstaben, Bindestriche). Sonst nichts ändern, außer das Spiel braucht wirklich eine neue Plattform-Funktion.

**Spielerzahl: wenn möglich bis zu sechs, aber nur wenn sinnvoll.** Gruppen haben bis zu sechs Mitglieder, und dort spielen immer alle mit. Deshalb jedes Spiel für `players: [2, 6]` bauen (oder bis zur sinnvollen Grenze), außer es lebt vom Duell (Tic-Tac-Toe, Schiffe versenken bleiben `[2, 2]`). So geht es:
- Reihum statt „der andere“: `nextAfter(s, id)` (nächster in `s.players`, nach dem Letzten der Erste), wer ausgeschieden ist, wird übersprungen. Wo zu zweit „der andere“ reagiert, reagieren zu mehreren alle anderen (gleichzeitig, geheim bis alle fertig sind, wie die Bewertungen in `racker-jagd.js`), oder der Erste zählt (Montagsmaler: wer zuerst richtig rät).
- Texte für beide Fälle: zu zweit bleibt „Ben ist dran“, „Warte auf Ben“, zu mehreren „Die anderen …“ bzw. Namenslisten („Ben, Cem und Dora“, Hilfsfunktion `list`). Ergebnistexte zu zweit unverändert lassen („Anna gewinnt drei zu eins.“), zu mehreren eigene Sätze („Anna gewinnt mit vierzig Nüssen.“, Gleichstand mehrerer: alle bekommen den Punkt).
- `waitingFor`/`notices` liefern Listen: Wer neu gefragt ist, bekommt eine Nachricht, nicht bei jedem Einzelzug der anderen.
- Anzeige für sechs auf 360 px: Ab drei Spielern kompakte Darstellung über eine Klasse (z.B. `many`): kleinere Plätze zu zweit nebeneinander (`flip-7.js`), Reiter pro Spieler (`qwixx.js`), Tabellen mit einer Zeile pro Spieler statt einer Spalte (sechs Spalten passen nicht). Lange Namen mit `text-overflow: ellipsis`. Gestaffelte Auftakte begrenzen (Gesamtdauer wie zu zweit, nicht pro Karte 110 ms bei dreißig Karten).
- Optionen, die von der Spielerzahl abhängen, relativ formulieren („Jeder zeichnet zweimal“ statt „Vier Runden“).
- Testen mit jeder Spielerzahl: `npm run check` prüft zwei bis sechs, Simulation für jede Zahl, im Browser `start({ players: 6 })`, dichte Zustände im Prüfstand (Skill `spiel-testen`).

`games/_vorlage.js` und die Beispielspiele zeigen die Muster:

- `tic-tac-toe.js`: abwechselnd ziehen, **und das Vorbild für Animationen** (Striche einzeichnen, Gewinnlinie, Vergleich mit `game.prev`)
- `schere-stein-papier.js`: gleichzeitige geheime Züge (`view`), auch zu sechst
- `kennst-du-mich.js`: Phasen, Texteingaben per Formular, geheime Antwort, zu mehreren raten alle anderen gleichzeitig und der Fragende urteilt einzeln
- `racker-jagd.js`: Bilder hochladen mit Zuschnitt, Zeitlimit (`tick`, `game.now`), eigene Benachrichtigungen (`notices`), lokaler Zustand, der neues Zeichnen übersteht, geheime Noten aller anderen mit Durchschnitt
- `qwixx.js`: Einstellungen in der Lobby (`meta.options`), 3D-Würfel, vorläufige Eingaben mit Bestätigen, Bereiche, die nur bei Änderung neu gezeichnet werden, Reiter pro Spieler und Endwertung als Zeile pro Spieler
- `auf-die-nuesse.js`: Live-Wettlauf trotz Netz-Verzögerung (Tempo-Grenze auf dem Server, mehrere Tipper pro Anfrage, `tick` springt für Abwesende ein, zu mehreren einer gegen alle), Dinge, die zwischen Bereichen fliegen
- `flip-7.js`: Kartenstapel, der in `view` geheim bleibt, Ereignisliste im `state`, damit mehrere Schritte eines Zuges nacheinander animiert werden, Karten, die vom Stapel kommen und sich umdrehen, reihum austeilen und ziehen, kompakte Plätze für bis zu fünf Gegner
- `schiffe-versenken.js`: geheime Aufstellung als lokaler Entwurf (Schiffe setzen, drehen, Vorschau), den erst „Bereit“ abschickt, **Ziehen mit dem Finger** (`startDrag`), Figuren auf einem Raster über `--x`/`--y` und `transform`, zwei Spielfelder, die per FLIP den Platz tauschen, Treffer erst nach dem Einschlag zeigen
- `lasso.js`: **gleichzeitige Runden mit festen Fristen** (Countdown vor jeder Runde, `deadline` für die Uhr und `end` mit Nachfrist für `tick`, ein Schritt pro `tick`, sofort weiter, wenn alle fertig sind, Pause, wenn niemand mitgemacht hat, kurz vor Schluss automatisch abgeben), ein Seil mit begrenzter Länge mit dem Finger ziehen (Punkt-in-Schlinge nur mit ganzen Zahlen, gleich auf Server und Browser), Steine vom Feld in die eigene Ablage und ins Wort legen (FLIP, Tastatur als zweiter Weg), Einspruch der anderen statt Wörterbuch, Teams als Option
- `montagsmaler.js`: **live malen** mit `game.live` (Striche schon unterwegs an den anderen, gespeichert als nummerierte Befehle), eigenes Raster statt Canvas-Linien, damit der Eimer überall dieselbe Fläche füllt, Zurück/Vor mit Zwischenständen, Malfläche, auf der die Seite nicht scrollt, geheimes Wort als Galgenmännchen-Striche, Zeit ab dem ersten Strich, Galerie am Ende (Skill `malflaeche`), zu mehreren raten alle mit
- `kunstkritik.js`: **alle malen gleichzeitig** dasselbe Wort, jeder mit eigener Uhr ab dem eigenen „Los“ (geht auch, wenn nicht alle gleichzeitig da sind), gedrosseltes Speichern statt `game.live`, geheime Vorschläge aller und das Los entscheidet, **anonyme Bewertung Bild für Bild** (von wem es ist und wer welche Note gab, erst bei der Auflösung), Wertungstafeln, die sich nacheinander umdrehen, Bilder im Goldrahmen als Galerie zwischen den Runden und am Ende, **Großansicht** eines Bildes am Ende (wächst per FLIP aus dem Rahmen, Fokus auf „Schließen“, Escape, Scrollsperre)

Die Datei läuft **sowohl auf dem Server als auch im Browser** und wird von Next.js gebündelt: keine `import`s von Node-Modulen oder npm-Paketen, kein React, keine Browser-Globals außerhalb von `render`.

```js
export const meta = { name, description, players: [min, max] };   // wenn sinnvoll [2, 6], siehe oben
// Optional in meta: options = Einstellungen, die man in der Lobby vor dem Start wählt (erste Wahl = Vorgabe),
// z.B. options: [{ id: 'zeit', label: 'Zeit', choices: [{ value: 0, label: 'Ohne Limit' }, { value: 60, label: 'Eine Minute' }] }]
// „Nochmal“ startet mit denselben Einstellungen.

// Server: Startzustand. players = [{ id, name }], options = gewählte Einstellungen, z.B. { zeit: 60 } ({} ohne meta.options)
export function setup(players, options) { return state; }

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
//          now() (Serverzeit in ms), refresh() (Stand neu laden),
//          live.send(data), live.on((data, vonId) => …) }   (schnelle Nachrichten an die anderen, siehe unten)
export function render(el, view, game) {}

// Optional: CSS nur für dieses Spiel (Klassen mit Spielnamen präfixen).
export const style = `...`;
```

Regeln und Tipps:
- `state` muss reines JSON sein (keine Funktionen, `Map`, `Set`, `Date`-Objekte) und klein bleiben, denn er wird bei jedem Zug komplett in Postgres gespeichert.
- `action` kann bei gleichzeitigen Zügen mehrmals auf einer frischen Kopie laufen: keine Nebenwirkungen außerhalb von `state`.
- Zufall (`Math.random`) nur in `setup`/`action`, **nie in `render`**.
- Verweist der `state` mit Indizes auf eine Liste im Code (z.B. `deck` auf `SUGGESTIONS` in `montagsmaler.js`), neue Einträge nur hinten anhängen und nichts umsortieren oder löschen: Laufende Partien zeigen sonst auf andere Einträge. Muss eine Liste doch ersetzt werden (Kunstkritik hat jetzt eigene Vorschläge statt der von Montagsmaler), mit `% LISTE.length` lesen, damit alte Indizes keine Lücken ergeben. Vorschlagslisten (`IDEAS` in `kennst-du-mich.js`, `SUGGESTIONS`) auf doppelte Einträge prüfen.
- Jede Aktion prüfen: ist der Spieler dran, ist er Teil des Spiels, ist die Phase richtig, sind die Daten gültig.
- Geheimes (Handkarten, Antworten, Wahl des Gegners) immer in `view` für die anderen entfernen. Der Browser bekommt nur, was `view` liefert. Auch `waitingFor` ist öffentlich (die Startseite zeigt, wer dran ist): Darf niemand wissen, wer etwas gemacht hat (anonyme Bewertung), dort keine Liste liefern, aus der es folgt, sondern bis zur Auflösung alle (`kunstkritik.js`).
- Texte von Spielern und Spielernamen in `render` immer mit `game.esc()` einsetzen.
- Klicks: `<button data-action="typ" data-value="3">` sendet automatisch `send('typ', 3)` (`data-value` wird als JSON gelesen, sonst als Text). Formulare: `<form data-action="typ">` mit `<input name="x">` sendet `{ x: '...' }`.
- Rein lokale Interaktion (z.B. Vorschlag in ein Feld schreiben) per `el.querySelector(...).addEventListener` nach dem Setzen von `innerHTML`.
- **Knöpfe nicht bei jeder Änderung ersetzen:** `render` läuft auch, wenn andere ziehen (jemand ist fertig, tippt auf Weiter). Setzt es dann `innerHTML` neu, verschwindet der Knopf unter dem Finger und der Tipp geht verloren. HTML nur setzen, wenn es sich geändert hat (`put(el, html)` in `lasso.js`), Bereiche mit Knöpfen von Anzeigen trennen, die sich oft ändern (Namen, Haken).
- **Ziehen mit dem Finger** (Spielsteine, Schiffe, Karten verschieben): Auf dem Handy scrollt sonst die Seite, statt dass sich das Stück bewegt. Deshalb nur die ziehbaren Stücke selbst mit `touch-action: none` (dazu `user-select: none`, `-webkit-touch-callout: none`, bei Ebenen mit `pointer-events: none` das Stück wieder auf `auto`), nie das ganze Spielfeld: Wischen daneben muss die Seite weiter scrollen. Mit Pointer Events arbeiten: `pointerdown` auf dem Stück, `pointermove`/`pointerup`/`pointercancel` am `window` (übersteht, dass `render` neu zeichnet; an `game.signal` hängen). Erst ab etwa sechs Pixeln Weg ist es Ziehen, sonst ein Tippen; den `click` direkt nach einem Ziehen ignorieren. Das Stück folgt dem Finger über eine Verschiebung in `transform` (CSS-Variablen `--dx`/`--dy`, `transition: none` während des Ziehens), eine Markierung zeigt, wo es einrasten würde, beim Loslassen gleitet es auf das Feld oder zurück. Tippen als zweiter Weg bleibt (Tastatur, Barrierefreiheit). Vorbild: `startDrag` in `games/schiffe-versenken.js`; testen mit `touchDrag` aus dem Skill `spiel-testen`.
- Auf Handy-Breite (360px, fürs iPhone auch 320 bis 430) muss alles passen, ohne seitliches Scrollen. Text neben einer Abbildung oder einem Knopf in einer Flex-Reihe darf nicht zur schmalen Spalte werden: Reihe mit `flex-wrap: wrap`, Text mit `flex: 1 1 13em` (rutscht sonst darunter), lange Knopftexte kurz halten. Grids im Spiel mit `grid-template-columns: minmax(0, 1fr)`, sonst drücken Namen mit `white-space: nowrap` ihre volle Breite durch.
- Unten rechts schwebt der Reaktionsknopf der Plattform (48 px, 12 px vom Rand). Wichtige Knöpfe eines Spiels nicht unten rechts an den Bildschirmrand setzen, und wer automatisch scrollt, lässt unten Platz (`const free = innerHeight - 64`, siehe `kunstkritik.js`). `.room` hat unten Abstand, damit sich alles über den Knopf schieben lässt.
- Das Ergebnis-Banner mit „Nochmal“/„Anderes Spiel“ zeigt die Plattform selbst an.
- Ein Zug dauert einen Server-Aufruf plus eine Realtime-Nachricht (einige hundert Millisekunden): gut für Runden- und Rate-Spiele, nicht für Reaktions- oder Echtzeit-Action.
- Zeitlimits: Frist in `action` mit `Date.now()` in den `state` schreiben, `tick(state, now)` schaltet weiter, wenn sie abgelaufen ist. Im Browser den Countdown mit `game.now()` rechnen (nicht `Date.now()`, die Handy-Uhr kann falsch gehen) und bei null `game.refresh()` aufrufen. `game.now()` springt mit jeder Antwort um die Laufzeit: Ein großes „drei, zwei, eins“ nur abwärts zählen lassen, sonst erscheint eine Zahl doppelt. `tick` läuft nur, wenn jemand den Raum lädt: Ist niemand da, schaltet das Spiel beim nächsten Öffnen weiter.
- Live: `game.live.send(data)` schickt kleine JSON-Nachrichten sofort an die anderen Browser im Raum, `game.live.on(fn)` empfängt sie (einmal pro Partie anmelden, z.B. im lokalen Zustand wie bei `racker-jagd.js`; endet die Partie, wird abgemeldet). Nicht gespeichert, kann verloren gehen oder doppelt kommen: nur für Vorschauen. Was zählt, geht trotzdem mit `send` in den `state`, und die Anzeige muss allein aus dem `state` stimmen (Neuladen, Nachricht verloren). Höchstens etwa 20 Nachrichten pro Sekunde (sammeln, z.B. alle 50 ms).
- Bilder: `await game.upload(datei)` (oder ein `<canvas>`, z.B. nach dem Zuschneiden) und nur die `id` mit `send` in den `state`, nie die Bilddaten selbst. Anzeigen mit `<img src="${game.esc(game.imageUrl(id))}">`. Geheime Bilder in `view` weglassen: Der Server liefert fremde Bilder nur aus, wenn ihre id in der `view` des Anfragenden steht. Nach der Partie werden sie gelöscht.

## Spiele: Motion und Optik

**Jedes neue Spiel muss optisch sehr ansprechend sein und hochwertige Motion Graphics haben.** Ein Spiel ist erst fertig, wenn es sich lebendig und hochwertig anfühlt: wie ein gut gemachtes Brettspiel, das sich bewegt. Statisches Umschalten von Zuständen reicht nicht. Die ruhige, zurückhaltende Gestaltung der Plattform (Startseite, Lobby, Anzeigetafel) bleibt davon unberührt; die Bühne für Bewegung ist das Spielfeld.

Was jedes Spiel haben soll:
- **Jede Zustandsänderung wird animiert**, nicht nur umgeschaltet: Züge, aufgedeckte Karten, Punkte, Phasenwechsel, wer dran ist. Gezeichnete Formen (SVG) zeichnen sich ein (`pathLength="1"` + `stroke-dashoffset`), Figuren gleiten an ihren Platz, Karten drehen sich um (3D-`rotateY` mit `backface-visibility`), Zahlen zählen hoch.
- **Ein Höhepunkt beim Spielende**: eine choreografierte Sequenz (z.B. Gewinnlinie ziehen, Siegerzüge hervorheben, der Rest tritt zurück), zeitlich gestaffelt statt alles gleichzeitig.
- **Ein Auftakt**: Beim Start einer Partie (`game.first`) baut sich das Spielfeld sichtbar auf, gestaffelt (`animation-delay` in Schritten von 60–120 ms).
- **Rückmeldung auf Eingaben**: Vorschau beim Darüberfahren (z.B. blasses eigenes Zeichen), spürbarer Druck beim Tippen (`:active` mit `scale(.96)`), klare Zustände für „nicht dran“.
- **Die Spielerfarben als Bühne**: Rot und Schwarz tragen die Bewegung (in Gruppen dazu Blau, Ocker, Grün, Rostbraun); Flächen und Hervorhebungen über `color-mix(in srgb, <Spielerfarbe> 12%, white)`. Nie eine Farbe fest einbauen, immer `game.color(id)`.
- Eigene Illustration statt Standardformen: SVG mit Charakter (z.B. Spielsteine mit Kante, Papier-Anmutung, Karten mit Rahmen). Keine Emojis, keine Clipart.
- **Zeichnungen und Abbildungen mit viel Aufwand erstellen und dafür den Skill `zeichnen` nutzen** (`.claude/skills/zeichnen/SKILL.md`): vor jeder Zeichnung laden, Silhouette, Ebenen und Details nach seinem Ablauf, mindestens zwei Überarbeitungsrunden mit der Vorschau (`node .claude/skills/zeichnen/vorschau.mjs`, zeigt jede Zeichnung in mehreren Größen und in Graustufen). Das gilt auch, wenn eine bestehende Zeichnung verbessert wird.

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

- **Farben:** Hintergrund immer Weiß (`--paper`), Schrift `--ink`, Nebentext `--muted`, Linien `--line` (kräftig) und `--hairline` (fein), Hover-Fläche `--wash`. Spielerfarben nur über `game.color(id)` (Rot `--p1` gegen Schwarz `--p2`, in Gruppen weiter Blau `--p3`, Ocker `--p4`, Grün `--p5`, Rostbraun `--p6`, in Beitrittsreihenfolge; `PLAYER_COLORS` in `lib/colors.js`). Keine Verläufe, keine Violett-/Indigo-Töne, kein Leuchten.
- **Schrift:** `--font-display` (Big Shoulders, schmal) für Namen, Überschriften und große Zahlen; `--font-body` (Atkinson Hyperlegible Next) für Text. Die Textschrift hat eine durchgestrichene Null: Zahlen im Fließtext als Wort schreiben („drei zu null“), Zahlenanzeigen mit Klasse `num` oder in `--font-display`. Größen über `--t-sm`, `--t-base`, `--t-md`, `--t-lg`, `--t-xl`, `--t-2xl`, `--t-3xl`, `--t-4xl`.
- **Keine Emojis** als Icons, Spielfiguren, Deko oder in Ergebnistexten (auch die Reaktionen sind eigene Zeichnungen in `components/Reactions.js`). Wörter, Buchstaben (X/O), eigene SVG-Formen oder die Klasse `marker` (Quadrat in Spielerfarbe) verwenden.
- **Formen:** Ecken `--radius` (2px) bzw. `--radius-m` (4px), keine Pillen, keine Schatten auf Kästen, keine farbigen Seitenränder an Kästen. Gruppieren mit Linien und Abstand.
- **Bewegung außerhalb des Spielfelds:** zurückhaltend. Hintergrundwechsel beim Hover, 1px Eindrücken beim Klick; keine Einblend-Animationen für ganze Abschnitte.
- **Texte:** kurz und konkret, ganze Sätze mit Punkt, keine Gedankenstriche als Satzverbindung, keine Ausrufezeichen-Häufung, keine Werbesprache. Jede Information nur einmal pro Ansicht.
- **Eingaben** haben immer ein sichtbares `<label>`, nicht nur einen Platzhalter. Pro Ansicht höchstens ein `btn primary`.
- Vorhandene Klassen: `btn`, `btn primary`, `link` (Textknopf), `panel`, `row`, `stack`, `center`, `muted`, `big`, `status`, `num`, `display`, `marker`, `ok`, `bad`.

## Prüfen

- `npm run check`: lädt alle Spiele, ruft `setup` und `view` mit jeder erlaubten Spielerzahl bis sechs auf und prüft, ob der Zustand verschickt werden kann.
- `npm run build`: muss fehlerfrei durchlaufen (Vercel baut genauso).
- `npm run dev` ohne `.env.local` startet den Testmodus ohne Supabase (Konten und Räume nur im Arbeitsspeicher). Zum Spielen zwei Konten in zwei getrennten Browser-Profilen bzw. einem privaten Fenster anlegen und befreunden. Nach dem Anlegen einer neuen Spieldatei `npm run dev` neu starten.
- Gründlich testen (Simulation vieler Partien mit jeder Spielerzahl, zwei bis sechs Konten im Browser per Playwright, Prüfstand für seltene Zustände, Finger-Gesten): Skill `spiel-testen`. Für automatische Tests `npm run build` und `npx next start` statt `npm run dev`, denn `next dev` hängt einen Block an diese Datei an.
