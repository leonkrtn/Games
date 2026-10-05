---
name: spiel-testen
description: Spiele im Spielzimmer gründlich testen, bevor sie online gehen. Spiellogik in Node simulieren (tausende Partien mit jeder Spielerzahl, Geheimnisse in view, jede Partie endet), mit zwei bis sechs Konten im echten Browser spielen (Handy-Breite, Desktop, ohne Bewegung), seltene Zustände im Prüfstand zeichnen, Bildschirmfotos ansehen und Finger-Gesten wie Ziehen prüfen. Laden, wenn ein neues Spiel fertig ist, ein Spiel geändert wurde oder ein Fehler gemeldet wird.
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

Dann einige tausend Partien mit zufälligen, gültigen Zügen spielen, **mit jeder erlaubten Spielerzahl**
(`for (let n = min; n <= max; n++)`, Namen z.B. Ana, Ben, Cem, Dora, Emil, Fia), und nach jedem Zug prüfen:

- **Geheimnisse:** `G.view(s, id)` enthält nichts, was `id` nicht wissen darf (Handkarten, Stapel,
  Aufstellung des Gegners). Gezielt nach den geheimen Feldern suchen, nicht nach zufälligen
  Teilstrings des JSON (die treffen auch zufällig gleiche Werte).
- **Ende:** jede Partie endet nach einer Höchstzahl Züge, `state.result` ist gesetzt. (`waitingFor` des
  Spiels muss nach dem Ende nichts Besonderes liefern: Die Plattform fragt dann nicht mehr.)
- **Reihum:** jeder kommt dran (z.B. jeder zeichnet gleich oft), niemand, der schon raus ist.
- **Regeln:** ungültige Züge werfen einen verständlichen Satz (`throws(..., /ist dran/)`), doppelt
  gesendete Züge (gleicher `at`/`seq`) ändern nichts, Erhaltungsgrößen stimmen (z.B. Kartenzahl).
- **Texte:** keine Ziffern in Ergebnistexten (`!/\d/.test(text)`), `notices` gehen an die richtigen
  Spieler. Die Ergebnistexte aller Spielerzahlen einmal ausgeben und lesen (Gleichstand zu dritt, alle gleich).
- `JSON.stringify(state)` geht, und der Zustand bleibt klein.

Läuft eine Simulation länger als zwei Minuten, die Zahl der Partien senken; Tempo misst man mit
zwanzig Partien.

## 2. Im Browser spielen (zwei bis sechs Konten)

**Nicht mit `npm run dev` testen:** Next.js hängt dabei einen Block an `CLAUDE.md` an (falls doch
passiert: `git checkout CLAUDE.md`). Stattdessen der Production-Server im Testmodus (ohne
`.env.local` speichert er alles im Arbeitsspeicher):

```bash
npm run build && (npx next start -p 3100 > <scratchpad>/server.log 2>&1 &)
# beenden (pkill -f trifft auch die eigene Shell):
ps -eo pid,cmd | grep -E "next start|next-server" | grep -v grep | awk '{print $1}' | xargs -r kill
```

Nach jeder Änderung am Spiel neu bauen und den Server neu starten. Im frischen Container fehlt
`node_modules` (Build bricht mit „Cannot find package 'pg'“ ab): zuerst `npm ci`.

**Supabase-Variablen in der Umgebung:** Steht `NEXT_PUBLIC_SUPABASE_URL` oder `SUPABASE_SERVICE_ROLE_KEY`
(bzw. `SUPABASE_SECRET_KEY`) in `env`, nimmt der Server die echte Datenbank statt des Testmodus (Fehler wie
„Could not find the table 'public.users'“, oder schlimmer: Testkonten landen in Produktion). Dann Bauen und
Starten ohne sie, auch das Bauen, denn `NEXT_PUBLIC_…` wird in den Browser-Code eingebaut:
`env -u NEXT_PUBLIC_SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_SECRET_KEY npm run build` und
genauso `env -u … npx next start -p 3100`.

`zwei-spieler.cjs` in diesem Ordner legt Konten an, befreundet sie und startet das Spiel. Mit
`players: 3` bis `6` gründet Anna eine Gruppe mit allen; `pages` enthält dann alle Seiten (Anna zuerst):

```js
const { start, sleep, touchDrag, center } = require('/home/user/Games/.claude/skills/spiel-testen/zwei-spieler.cjs');
const { browser, A, B, errors } = await start({ game: 'qwixx', options: ['Gemixxt'] }); // 360 × 780, Touch
await A.click('[data-action="wuerfeln"]');
await A.screenshot({ path: '<scratchpad>/shots/01.png', fullPage: true });
console.log(errors);                                                     // Konsolenfehler beider Seiten
console.log(await A.evaluate(() => [document.documentElement.scrollWidth, innerWidth])); // gleich = kein seitliches Scrollen
await browser.close();

const { pages } = await start({ game: 'flip-7', players: 5 });           // Gruppe aus fünf Konten
for (const p of pages) { const b = await p.$('[data-action="ziehen"]'); if (b) await b.click(); }
```

- Mit mehreren Konten in einer Schleife auf jeder Seite einen passenden Knopf drücken; zufällig
  wählen (`$$` und ein zufälliges Element), sonst endet z.B. Schere, Stein, Papier nie.

- **Ganze Partien** im Browser durchspielen lassen: Schleife, die auf der Seite, die dran ist, einen
  gültigen Knopf drückt, bis `#result` erscheint. B sieht Änderungen im Testmodus erst nach bis zu
  einer Sekunde.
- **Animationen ansehen:** Bildschirmfotos kurz nach einem Zug (60, 300, 1000 ms) zeigen Zwischenstände;
  jedes Foto mit dem Read-Werkzeug ansehen. Einmal mit `reduced: true` spielen: dann muss sofort der
  Endzustand dastehen. Mehrere Fotos auf einmal vergleichen: `nebeneinander.cjs` in diesem Ordner legt
  denselben Ausschnitt nebeneinander (`node nebeneinander.cjs aus.png 150:1050 a.png b.png c.png`).
  Eine kleine Stelle genau ansehen (Tür, Kante, Möbel): `node ausschnitt.cjs foto.png aus.png x y breite höhe`.
- **Rätsel durchspielen:** Die Ansicht enthält die Lösung nicht. Das Skript rechnet sie mit dem Löser des
  Spiels aus `snapshot.game.view` aus (Skill `raetsel`) und setzt dann auf jeder Seite die Figuren.
- **Fristen und mehrere Spieler:** Läuft eine Phase gegen die Uhr (Kunstkritik: dreißig Sekunden ab „Los“), die Gesten
  aller Seiten gleichzeitig ausführen (`Promise.all(pages.map(…))`), sonst ist die Zeit um, bevor die
  letzte Seite dran war. Vor jeder Runde auf die neue Phase warten (z.B. `.kk[data-phase="bewerten"]`),
  nicht nur auf ein Element, das es auch in der vorigen Phase schon gab.
- **Element-Handles werden ungültig,** wenn das Spiel neu zeichnet („not attached to the DOM“): lieber
  mit Selektoren klicken (`page.click('.chip >> nth=0')`). Kommt das bei Knöpfen vor, die ein Mensch drückt,
  ist es ein Fehler im Spiel (siehe CLAUDE.md, Knöpfe nicht bei jeder Änderung ersetzen).
- **Finger auf das Feld setzen:** Punkte für `touchPath` innerhalb der Fläche berechnen; ein Start daneben
  scrollt die Seite (richtig so) und sieht aus wie ein Fehler im Spiel.
- **Drei Größen:** 360 px (Handy), `width: 1000` (Desktop), und alles mit `fullPage: true` prüfen.
  Ein `fullPage`-Foto kann breiter sein als die Seite, wenn etwas gerade über den Rand ragt (z.B. am
  Anfang einer Animation), obwohl `overflow-x: clip` das Scrollen verhindert. Maßgeblich ist
  `scrollWidth === innerWidth`; trotzdem nachsehen, was da übersteht.
- Klicks von Playwright verweigern Elemente, die verdeckt sind („intercepts pointer events“). Das ist
  meist richtig: dann das Element anklicken, das ein Mensch trifft (z.B. das Schiff statt der Zelle
  darunter).

## 3. Prüfstand: seltene Zustände gezielt zeichnen

Manches kommt im echten Spiel selten oder erst spät (Sonderrunde, volle Hände, Endwertung zu sechst,
Gleichstand). `pruefstand.mjs` zeichnet ein Spiel mit einem selbst gebauten Zustand im Browser, ohne
Server und Konten, mit den echten Schriften und `globals.css`:

```js
import * as G from '/home/user/Games/games/flip-7.js';
import { shot, close } from '/home/user/Games/.claude/skills/spiel-testen/pruefstand.mjs';
const players = ['Anna', 'Ben', 'Cem', 'Dora', 'Emil', 'Fiona'].map((name, i) => ({ id: 'p' + i, name }));
const s = G.setup(players, {});
s.hands.p1.cards = [1, 2, 4, 5, 7, 11, '+4', 'second', 'x2'];   // Zustand direkt setzen
console.log(await shot('flip-7', G, s, { me: 'p0', file: '<scratchpad>/shots/f7.png' }));
await close();
```

Mit `prev` (Zustand davor) wird erst dieser gezeichnet und dann der Wechsel animiert wie im Spiel;
`wait` bestimmt, wann das Foto entsteht. **Einzelbilder einer Animation** (Auftakt) aus einem einzigen
Aufruf nehmen, mit `wait: 0` und mehreren `page.screenshot` in `act`: Fotos aus getrennten `shot`-Aufrufen
sind zeitlich nicht vergleichbar, jede Seite braucht verschieden lange bis zum ersten Bild. `inspect` (eine Funktion) läuft danach in der Seite, ihr Ergebnis
steht in `seen`, z.B. Maße und Stile von Elementen, wenn auf dem Foto etwas fehlt:
`inspect: () => [...document.querySelectorAll('.zeile > *')].map((e) => [e.className, JSON.stringify(e.getBoundingClientRect())])`.
`act` (async, bekommt die Playwright-Seite) läuft vor dem Foto, z.B. `act: (page) => page.click('.fertig')`
für Zustände nach einem Tipp (Bestätigen-Texte, aufgeklappte Leisten, Großansichten); `width`/`height`
setzen die Fenstergröße.

**Schmale Textspalten automatisch finden** (Text neben einer Abbildung oder einem Knopf, der zu einer
schmalen Spalte zusammengedrückt wird): jede Ansicht in den iPhone-Breiten 320, 375, 390 und 430 zeichnen,
mit sechs langen Namen (z.B. „Maximilian Alexander“), und als `inspect` melden, was drei oder mehr Zeilen
hat und schmaler als 220 px ist, sowie alles, was über den rechten Rand ragt:

```js
inspect: () => [...document.querySelectorAll('#game *')].flatMap((el) => {
  const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const lines = Math.round(r.height / (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3));
  return [...(r.right > innerWidth + 1 ? [`Rand: ${el.className}`] : []),
          ...(text.length >= 8 && lines >= 3 && r.width < 220 ? [`schmal: ${el.className} ${Math.round(r.width)}px`] : [])];
}),
```

Es gibt nur Chromium, kein WebKit: Für das iPhone mit `width: 390, height: 844, scale: 3` (bei `start`)
testen, Safari-Eigenheiten lassen sich so nicht prüfen.

Die Bilder sind Platzhalter, also Bilder-Layouts zusätzlich
im echten Spiel ansehen. Den ersten Wurf zeigt `game.first`: Ein Auftakt mit vielen Karten kann beim Foto
noch laufen (dann `wait` erhöhen, oder es ist ein Hinweis, dass der Auftakt zu lang ist).

## 4. Finger-Gesten

`page.mouse` und `page.click` prüfen nicht, ob die Seite beim Ziehen mit dem Finger scrollt.
`touchDrag(page, von, nach)` schickt echte Touch-Ereignisse über das DevTools-Protokoll:

```js
const y0 = await A.evaluate(() => scrollY);
await touchDrag(A, await center(A, '[data-dock="s"]'), await center(A, '.sv-cell[data-i="11"]'));
console.log(await A.evaluate(() => scrollY) === y0); // true: gezogen, nicht gescrollt
```

Immer beides prüfen: Ziehen auf dem Spielstück scrollt nicht, Wischen daneben scrollt weiterhin.
Tippen: `A.touchscreen.tap(x, y)`. Über mehrere Punkte (Malen, Wischgesten): `touchPath(A, [{ x, y }, …])`.

## 5. Live-Nachrichten (`game.live`)

Im Testmodus laufen sie über den Server (`t: 'live'`), sie lassen sich also wie alles andere testen.
Weil sie verloren gehen dürfen, einmal ohne sie spielen: beim Empfänger
`page.route('**/api/room', (r) => (r.request().postData() ?? '').includes('"t":"live"') ? r.abort() : r.continue())`
und neu laden. Die Ansicht muss dann allein aus dem gespeicherten Stand stimmen. Die abgebrochenen
Anfragen erscheinen als `ERR_FAILED` unter den Konsolenfehlern (erwartet). Malflächen: Skill `malflaeche`.

## Prüfliste

- [ ] Simulation mit vielen Partien und jeder Spielerzahl: Geheimnisse, Ende, Regeln, Texte.
- [ ] Eine ganze Partie im Browser, ohne Konsolenfehler, auf 360 px ohne seitliches Scrollen, zu zweit und
      mit der größten Spielerzahl (Gruppe).
- [ ] Dichte Zustände mit sechs Spielern im Prüfstand angesehen (volle Hände, lange Namen, Endwertung).
- [ ] Bildschirmfotos von Auftakt, Zug, Höhepunkt und Ende angesehen.
- [ ] Mit `reduced: true` und mit `width: 1000` angesehen.
- [ ] Gesten (Ziehen, Tippen) mit `touchDrag` bzw. `touchscreen.tap` geprüft, falls das Spiel welche hat.
- [ ] Bei `game.live`: einmal ohne Live-Nachrichten gespielt, Ansicht stimmt trotzdem.
- [ ] `npm run check` und `npm run build` fehlerfrei.
