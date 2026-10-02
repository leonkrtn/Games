---
name: spiel-testen
description: Spiele im Spielzimmer gründlich testen, bevor sie online gehen. Spiellogik in Node simulieren (tausende Partien, Geheimnisse in view, jede Partie endet), mit zwei Konten im echten Browser spielen (Handy-Breite, Desktop, ohne Bewegung), Bildschirmfotos ansehen und Finger-Gesten wie Ziehen prüfen. Laden, wenn ein neues Spiel fertig ist, ein Spiel geändert wurde oder ein Fehler gemeldet wird.
---

# Spiele testen

`npm run check` prüft nur, ob `setup` und `view` laufen. Ein Spiel ist erst getestet, wenn seine Logik
in vielen simulierten Partien hält und jemand es im Browser wirklich gespielt hat, auf Handy-Breite.

## 1. Logik simulieren (Node)

Die Spieldatei ist ein ES-Modul ohne Abhängigkeiten, sie lässt sich direkt importieren. Ein Skript in
den Scratchpad-Ordner schreiben (nicht ins Projekt):

```js
import * as G from '/home/user/Games/games/mein-spiel.js';
const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }];
// wie der Server: action auf einer Kopie, Rückgabewert oder veränderte Kopie ist der neue Zustand
const act = (s, player, type, data) => { const t = structuredClone(s); return G.action(t, { player, type, data }) ?? t; };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re.test(e.message)) return; throw e; } throw new Error('kein Fehler: ' + re); };
```

Dann einige tausend Partien mit zufälligen, gültigen Zügen spielen und nach jedem Zug prüfen:

- **Geheimnisse:** `G.view(s, id)` enthält nichts, was `id` nicht wissen darf (Handkarten, Stapel,
  Aufstellung des Gegners). Gezielt nach den geheimen Feldern suchen, nicht nach zufälligen
  Teilstrings des JSON (die treffen auch zufällig gleiche Werte).
- **Ende:** jede Partie endet nach einer Höchstzahl Züge, `state.result` ist gesetzt, `waitingFor`
  danach leer.
- **Regeln:** ungültige Züge werfen einen verständlichen Satz (`throws(..., /ist dran/)`), doppelt
  gesendete Züge (gleicher `at`/`seq`) ändern nichts, Erhaltungsgrößen stimmen (z.B. Kartenzahl).
- **Texte:** keine Ziffern in Ergebnistexten (`!/\d/.test(text)`), `notices` gehen an die richtigen
  Spieler.
- `JSON.stringify(state)` geht, und der Zustand bleibt klein.

Läuft eine Simulation länger als zwei Minuten, die Zahl der Partien senken; Tempo misst man mit
zwanzig Partien.

## 2. Im Browser spielen (zwei Konten)

**Nicht mit `npm run dev` testen:** Next.js hängt dabei einen Block an `CLAUDE.md` an (falls doch
passiert: `git checkout CLAUDE.md`). Stattdessen der Production-Server im Testmodus (ohne
`.env.local` speichert er alles im Arbeitsspeicher):

```bash
npm run build && (npx next start -p 3100 > <scratchpad>/server.log 2>&1 &)
# beenden (pkill -f trifft auch die eigene Shell):
ps -eo pid,cmd | grep -E "next start|next-server" | grep -v grep | awk '{print $1}' | xargs -r kill
```

Nach jeder Änderung am Spiel neu bauen und den Server neu starten.

`zwei-spieler.cjs` in diesem Ordner legt zwei Konten an, befreundet sie und startet das Spiel:

```js
const { start, sleep, touchDrag, center } = require('/home/user/Games/.claude/skills/spiel-testen/zwei-spieler.cjs');
const { browser, A, B, errors } = await start({ game: 'qwixx', options: ['Gemixxt'] }); // 360 × 780, Touch
await A.click('[data-action="wuerfeln"]');
await A.screenshot({ path: '<scratchpad>/shots/01.png', fullPage: true });
console.log(errors);                                                     // Konsolenfehler beider Seiten
console.log(await A.evaluate(() => [document.documentElement.scrollWidth, innerWidth])); // gleich = kein seitliches Scrollen
await browser.close();
```

- **Ganze Partien** im Browser durchspielen lassen: Schleife, die auf der Seite, die dran ist, einen
  gültigen Knopf drückt, bis `#result` erscheint. B sieht Änderungen im Testmodus erst nach bis zu
  einer Sekunde.
- **Animationen ansehen:** Bildschirmfotos kurz nach einem Zug (60, 300, 1000 ms) zeigen Zwischenstände;
  jedes Foto mit dem Read-Werkzeug ansehen. Einmal mit `reduced: true` spielen: dann muss sofort der
  Endzustand dastehen.
- **Drei Größen:** 360 px (Handy), `width: 1000` (Desktop), und alles mit `fullPage: true` prüfen.
- Klicks von Playwright verweigern Elemente, die verdeckt sind („intercepts pointer events“). Das ist
  meist richtig: dann das Element anklicken, das ein Mensch trifft (z.B. das Schiff statt der Zelle
  darunter).

## 3. Finger-Gesten

`page.mouse` und `page.click` prüfen nicht, ob die Seite beim Ziehen mit dem Finger scrollt.
`touchDrag(page, von, nach)` schickt echte Touch-Ereignisse über das DevTools-Protokoll:

```js
const y0 = await A.evaluate(() => scrollY);
await touchDrag(A, await center(A, '[data-dock="s"]'), await center(A, '.sv-cell[data-i="11"]'));
console.log(await A.evaluate(() => scrollY) === y0); // true: gezogen, nicht gescrollt
```

Immer beides prüfen: Ziehen auf dem Spielstück scrollt nicht, Wischen daneben scrollt weiterhin.
Tippen: `A.touchscreen.tap(x, y)`.

## Prüfliste

- [ ] Simulation mit vielen Partien: Geheimnisse, Ende, Regeln, Texte.
- [ ] Eine ganze Partie im Browser, ohne Konsolenfehler, auf 360 px ohne seitliches Scrollen.
- [ ] Bildschirmfotos von Auftakt, Zug, Höhepunkt und Ende angesehen.
- [ ] Mit `reduced: true` und mit `width: 1000` angesehen.
- [ ] Gesten (Ziehen, Tippen) mit `touchDrag` bzw. `touchscreen.tap` geprüft, falls das Spiel welche hat.
- [ ] `npm run check` und `npm run build` fehlerfrei.
