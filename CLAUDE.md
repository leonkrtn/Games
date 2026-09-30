# Spielzimmer

Kleine Web-Plattform, um selbst erfundene Spiele zu zweit live gegeneinander zu spielen (Handy oder Laptop). Oberfläche und Texte sind **auf Deutsch**.

- `server.js` – Node-Server: liefert Dateien aus, verwaltet Räume (4-Buchstaben-Code) und Spielstände per WebSocket (`ws`). Lädt alle Dateien aus `games/` und lädt sie bei Änderungen automatisch neu.
- `public/` – Browser-Seite (Startseite, Lobby, Punktestand, Rahmen um das Spiel). Kein Build-Schritt.
- `games/*.js` – **ein Spiel = eine Datei.** Dateien mit `_` am Anfang erscheinen nicht in der Lobby (`_vorlage.js` ist die kommentierte Vorlage).

## Ein neues Spiel bauen

Wenn der Nutzer ein Spiel beschreibt: neue Datei `games/<kurzer-name>.js` anlegen (Kleinbuchstaben, Bindestriche). Nichts an `server.js` oder `public/` ändern, außer das Spiel braucht wirklich eine neue Plattform-Funktion. `games/_vorlage.js` und die drei Beispielspiele zeigen die Muster:

- `tic-tac-toe.js` – abwechselnd ziehen
- `schere-stein-papier.js` – gleichzeitige geheime Züge (`view`)
- `kennst-du-mich.js` – Phasen, Texteingaben per Formular, geheime Antwort

Die Datei läuft **sowohl im Server (Node) als auch im Browser**: keine `import`s von Node-Modulen oder npm-Paketen, keine Browser-Globals außerhalb von `render`.

```js
export const meta = { name, emoji, description, players: [min, max] };

// Server: Startzustand. players = [{ id, name }]
export function setup(players) { return state; }

// Server: ein Zug. state direkt verändern (oder neuen Zustand zurückgeben).
// Ungültig → throw new Error('Text für den Spieler')   (wird als Hinweis angezeigt)
// Ende    → state.result = { winners: [playerId, ...], text: 'X gewinnt!' }
//           (winners bekommen je einen Punkt; [] = niemand; alle = Unentschieden mit Punkt für alle)
export function action(state, { player, type, data }) {}

// Optional, Server: was `me` sehen darf (versteckte Infos entfernen). Standard: ganzer state.
export function view(state, me) { return state; }

// Browser: zeichnet die Ansicht, wird bei jeder Änderung neu aufgerufen (innerHTML neu setzen ist ok).
// game = { me, players, name(id), send(type, data), esc(text), result }
export function render(el, view, game) {}

// Optional: CSS nur für dieses Spiel (Klassen mit Spielnamen präfixen).
export const style = `...`;
```

Regeln und Tipps:
- `state` muss reines JSON sein (keine Funktionen, `Map`, `Set`, `Date`-Objekte).
- Zufall (`Math.random`) nur in `setup`/`action`, **nie in `render`** (sonst sieht jeder etwas anderes / es ändert sich bei jedem Update).
- Jede Aktion prüfen: ist der Spieler dran, ist er Teil des Spiels, ist die Phase richtig, sind die Daten gültig.
- Geheimes (Handkarten, Antworten, Wahl des Gegners) immer in `view` für die anderen entfernen – der Browser bekommt nur, was `view` liefert.
- Texte von Spielern und Spielernamen in `render` immer mit `game.esc()` einsetzen.
- Klicks: `<button data-action="typ" data-value="3">` sendet automatisch `send('typ', 3)` (`data-value` wird als JSON gelesen, sonst als Text). Formulare: `<form data-action="typ">` mit `<input name="x">` sendet `{ x: '...' }`.
- Rein lokale Interaktion (z.B. Vorschlag in ein Feld schreiben) per `el.querySelector(...).addEventListener` nach dem Setzen von `innerHTML`.
- Vorhandene CSS-Klassen: `card`, `btn`, `btn primary`, `btn ghost`, `btn small`, `row`, `stack`, `center`, `muted`, `big`, `status`, `ok`, `bad`. CSS-Variablen: `--accent`, `--accent-soft`, `--second`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`, `--ok`, `--bad`, `--radius` (hell/dunkel automatisch).
- Auf Handy-Breite (~360px) muss alles passen.
- Das Ergebnis-Banner mit „Nochmal“/„Anderes Spiel“ zeigt die Plattform selbst an, das Spiel muss es nicht zeichnen.
- Timer/Countdowns gibt es noch nicht als Plattform-Funktion.

## Prüfen

- `npm run check` – lädt alle Spiele, ruft `setup` und `view` auf und prüft, ob der Zustand verschickt werden kann.
- `npm start` (Port 3000, oder `PORT=...`) und mit zwei Browser-Fenstern bzw. getrennten Profilen spielen (die Spieler-ID liegt im `localStorage`, zwei Tabs im selben Profil sind also derselbe Spieler).
