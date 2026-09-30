# 🎲 Spielzimmer

Eure eigenen Spiele – live zusammen spielen, am Handy oder Laptop.

Einer erstellt einen Raum, schickt den Link, und schon seid ihr beide drin. Züge erscheinen sofort beim anderen, der Punktestand wird über alle Spiele mitgezählt. Wer die Seite neu lädt oder kurz offline ist, landet automatisch wieder im Raum.

Dabei sind drei Beispielspiele:

| Spiel | Zeigt, wie man … |
| --- | --- |
| ⭕ Tic-Tac-Toe | abwechselnd zieht |
| ✂️ Schere, Stein, Papier | gleichzeitig und geheim wählt |
| 💞 Wie gut kennst du mich? | eigene Fragen stellt, rät und bewertet |

## Starten

Du brauchst [Node.js](https://nodejs.org) (Version 20 oder neuer).

```bash
npm install
npm start
```

Dann <http://localhost:3000> öffnen.

**Im selben WLAN** (z.B. zu Hause): Auf dem Handy `http://<IP-deines-Rechners>:3000` öffnen. Die IP findest du unter macOS mit `ipconfig getifaddr en0`, unter Windows mit `ipconfig`.

## Online stellen (damit ihr von überall spielen könnt)

Am einfachsten mit [Render](https://render.com) (kostenlos):

1. Bei Render mit GitHub anmelden.
2. **New → Blueprint** und dieses Repository auswählen – die Einstellungen stehen schon in `render.yaml`.
3. Nach ein paar Minuten bekommst du eine Adresse wie `https://spielzimmer-xyz.onrender.com`.

Hinweis zum Gratis-Tarif: Nach ca. 15 Minuten ohne Besucher schläft der Server ein, der erste Aufruf dauert dann etwa eine Minute. Beim Aufwachen gehen laufende Spiele und der Punktestand verloren (der Raum-Link funktioniert weiter).

Jede Änderung, die du ins Repository pushst, wird automatisch online gestellt.

## Ein neues Spiel erfinden

Jedes Spiel ist **eine einzige Datei** im Ordner `games/`. Sobald die Datei da ist, erscheint das Spiel in der Lobby – auch während der Server läuft.

**Weg 1 – beschreiben lassen:** Erzähl Claude einfach deine Idee, z.B.:

> Bau ein neues Spiel: Jeder schreibt heimlich 3 Wörter auf, dann werden sie gemischt und der andere muss raten, welche von mir sind.

Die Datei `CLAUDE.md` erklärt Claude, wie Spiele hier aufgebaut sind.

**Weg 2 – selbst schreiben:** Kopiere `games/_vorlage.js` nach z.B. `games/mein-spiel.js` und passe sie an. Die Vorlage ist ein kleines, fertiges Spiel mit Erklärungen zu jedem Teil. Mit `npm run check` prüfst du, ob alles passt.

Im Raum auf **Nochmal** tippen startet immer die neueste Version der Datei – so kannst du Regeln ändern und sofort ausprobieren.
