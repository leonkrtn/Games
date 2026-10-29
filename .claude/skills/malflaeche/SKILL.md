---
name: malflaeche
description: Spiele bauen, in denen gemalt wird, ob einer malt und die anderen live zusehen oder alle gleichzeitig geheim malen (Malfläche mit Farben, Dicken, Eimer, Radierer, Zurück/Vor), dazu die erweiterte Malfläche lib/malen.js (Formen, Eimer, der fast geschlossene Flächen füllt, Zoomen mit zwei Fingern, Malen über Stunden auf mehreren Geräten). Wie die Zeichnung gespeichert, live übertragen und in jedem Browser gleich gemalt wird, wie die Malfläche auf dem Handy nicht scrollt und wie man das testet. Laden, bevor eine Malfläche gebaut oder geändert wird. Vorbilder sind games/montagsmaler.js, games/kunstkritik.js und das Tagesbild (lib/malen.js, components/tagesbild-board.js).
---

# Malfläche mit Live-Übertragung

Vorbild: `games/montagsmaler.js`. Die Teile dort lassen sich übernehmen (Raster, Befehle, Eingabe,
Live-Vorschau); hier steht, warum sie so gebaut sind.

## Zeichnung = Liste von Befehlen

- Der Zeichner erzeugt Befehle mit laufender Nummer `s` (= bisherige `seq` + 1): Strich
  `{ t: 's', c, w, p }`, Füllen `{ t: 'f', c, x, y }`, Alles löschen `{ t: 'c' }`, Zurück `{ t: 'u' }`,
  Vor `{ t: 'r' }`.
- Gespeichert wird `drawing = { ops, n, seq }`: `ops.slice(0, n)` ist zu sehen, der Rest ist der
  Vor-Stapel. Ein neuer Strich schneidet den Vor-Stapel ab. `applyCmd(d, cmd)` macht das und läuft
  **gleich auf dem Server und in beiden Browsern**.
- Befehle mit `s <= seq` überspringt der Server (doppelt geschickt), eine Lücke bricht ab. Ungültige oder
  zu große Befehle verwirft er still, aber zählt `seq` weiter, sonst hängt der Zeichner fest.
- Senden: **immer nur eine Anfrage unterwegs** (sonst kommen Befehle in falscher Reihenfolge an),
  alles Neue gebündelt mitschicken. Eigene Befehle bleiben in `pending`, bis der Stand sie enthält;
  kommt keine Antwort, nach knapp einer Sekunde nochmal.
- Was gerade zu sehen ist: gespeicherter Stand + `pending` (Zeichner) bzw. + live angekommene Befehle
  (Rater), in Nummernreihenfolge mit `applyCmd`.

## Live: Striche, während sie entstehen

- `game.live.send({ k: 'pt', r: runde, s, c, w, i, p: [x, y, …] })` alle 50 ms mit den neuen Punkten des
  laufenden Strichs (`i` = Index des ersten Punkts), am Ende `{ k: 'cmd', r: runde, cmd }` mit dem
  fertigen Befehl. Der Rater hängt Punkte nur an, wenn `i` passt (Lücke: auf den fertigen Befehl warten),
  `i === 0` beginnt die Vorschau neu.
- Die Runde (`r`) gehört in jede Nachricht: Nummern fangen jede Runde neu an.
- Alles Live ist nur Vorschau. Die Anzeige muss allein aus dem gespeicherten Stand stimmen (Neuladen,
  verlorene Nachricht). Testen, indem man beim Rater die Live-Anfragen blockiert (siehe unten).

## Alle malen gleichzeitig (ohne Zuschauer)

Vorbild: `games/kunstkritik.js`. Jeder malt geheim, niemand sieht live zu:

- Kein `game.live`. Pro Spieler eine eigene Zeichnung `draw[id] = { at, end, done, d }` im Zustand, in
  `view` für die anderen ohne `d`.
- Eigene Uhr pro Spieler ab seinem Tipp auf „Los“ (`at`, `end = at + Vorlauf + Malzeit`): So geht es auch,
  wenn nicht alle gleichzeitig da sind. Das Wort steht erst nach „Los“ in seiner `view`.
- **Speichern drosseln** (höchstens alle zwei Sekunden, `SAVE_EVERY`): Bis zu sechs Leute schreiben in
  denselben Raum, und jede Speicherung schreibt den ganzen Zustand mit allen Bildern (Versionskonflikte).
  Bei null schickt der Browser den Rest mit `fertig: true`, der Server nimmt Striche bis `end + GRACE`.
- `tick` beendet das Malen, wenn alle fertig sind oder ihre Zeit samt Nachfrist um ist; wer schon fertig
  ist, fragt dann regelmäßig nach (`game.refresh`), damit es ohne den Letzten weitergeht.
- Fertige Bilder klein halten: nur die sichtbaren Schritte ab dem letzten „Alles löschen“, ohne
  Nummern (`finalOps`), und eine niedrigere Obergrenze pro Bild, denn alle Bilder der Partie bleiben
  für die Galerie im Zustand.
- Neu laden mitten im Malen: Der gespeicherte Stand kommt wieder, höchstens die letzten zwei Sekunden fehlen.

## Raster statt Canvas-Linien

Mit `ctx.stroke()` glättet jeder Browser Kanten anders. Der Eimer füllt dann bei einer winzigen Lücke
hier die ganze Fläche und dort nicht: Die Bilder laufen auseinander. Deshalb ein eigenes Raster:

- `Uint8Array(S * S)` mit einer Farbnummer pro Punkt (0 = Papier/Radierer), `S = 1000` (passt auf
  Handy und Laptop ungefähr eins zu eins zu den Bildschirmpunkten, Kanten fallen kaum auf).
- Strichstück = Kapsel (Strecke mit runden Enden), **zeilenweise als Spanne** gefüllt (Kreis um a,
  Kreis um b, Band dazwischen). Punkt für Punkt prüfen ist zweieinhalbmal langsamer.
- Glatte Striche: Kurven durch die Mitten zwischen den Punkten (Stück 0 bis zur ersten Mitte, Stück k
  um Punkt k, Endstück zum letzten Punkt). Ein wachsender Strich malt nur die neuen Stücke; der fertige
  Strich ergibt genau dieselben Punkte.
- Nur `+ − × ÷` und `Math.sqrt` (in jedem Browser exakt gleich), kein `Math.hypot`, keine Winkelfunktionen.
- Eimer: Scanline-Füllung, Nachbarn oben/unten/links/rechts.
- Anzeigen: Farbnummern über eine Tabelle in ein `ImageData` (Uint32) und nur das geänderte Rechteck mit
  `putImageData` zeichnen, einmal pro Frame. Kleine Bilder (Galerie): 2 × 2 Punkte mitteln, das glättet.
- `syncRaster(raster, sichtbareSchritte, vorschau)`: vergleicht Schlüssel der schon gemalten Schritte,
  malt nur Neues. Bei Zurück oder Abweichung ab dem letzten Zwischenstand (alle 12 Schritte eine Kopie)
  neu. Eine Vorschau, die zum fertigen Strich wird, einfach fertig malen; sonst wegwerfen und neu malen.
- Größe klein halten: Punkte als Text, zwei Zeichen pro Punkt (Abstand zum vorigen), neue Punkte erst
  ab einigen Rasterpunkten Abstand, Obergrenze pro Zeichnung („Das Bild ist voll“). In `view` nur die
  aktuelle Zeichnung, alte erst am Ende.

## Eingabe: Finger, Stift, Maus

- Pointer Events auf dem `<canvas>`, `setPointerCapture`, `getCoalescedEvents()` für glatte Linien,
  nur der erste Finger zählt.
- **Nicht scrollen:** `touch-action: none` nur auf der Malfläche des Zeichners (nicht beim Rater, nicht
  auf dem Rest der Seite), dazu für iOS `touchstart`/`touchmove` mit `{ passive: false }` und
  `preventDefault()`, solange gemalt werden darf. `user-select: none`, `-webkit-touch-callout: none`.
- Maus: Ring in Stiftgröße folgt dem Zeiger (`cursor: none`), beim Eimer Fadenkreuz.
- Während eines Strichs keine anderen Befehle: Werkzeugknöpfe schließen erst den Strich ab.
- Beim Wechsel ins Malen Malfläche und Werkzeuge ganz ins Bild scrollen.

## Erweiterte Malfläche: `lib/malen.js` (Tagesbild)

Dieselben Befehle und dasselbe Raster wie oben, als eigenes Modul (Server und Browser, keine Imports), dazu:

- **Vierundzwanzig Farben** (`PALETTE`, Index 0 = Papier, nur hinten ergänzen), drei Reihen hell, mittel, dunkel wie
  Näpfchen in einem Malkasten; **fünf Dicken** (`PEN`, `RUBBER`).
- **Formen** als Befehl `{ t: 'l', c, w, p }`: gerade Stücke von Punkt zu Punkt, ohne Glätten (Ecken bleiben Ecken).
  Die Punkte rechnet der Browser (`shapePoints`: Linie, Rechteck, Ellipse im aufgezogenen Rechteck, für die Ellipse
  mit Winkelfunktionen) und speichert sie gerundet: Gemalt wird aus den gespeicherten Punkten, also überall gleich.
  Vorschau beim Aufziehen auf einer zweiten Leinwand mit `ctx.stroke()` (nur Vorschau, darf leicht abweichen).
- **Eimer, der Lücken schließt** (`flood`): Erst die ganze gleichfarbige Fläche wie bisher. Kerne sind die Punkte,
  die weiter als `GAP` (zwölf Rasterpunkte) vom Rand entfernt sind (Abstand mit der Schachbrett-Näherung 3-4, nur
  ganze Zahlen). Zerfällt der Kern in mehrere große Teile (kleiner als `CORE_MIN` zählt nicht), trennt sie eine
  Engstelle: Jeder Punkt gehört zum nächsten Kern (Breitensuche von allen Kernrändern gleichzeitig, in Zeilenfolge
  begonnen), gefüllt wird, was zum Kern des Klickpunkts gehört. So endet die Füllung in der Mitte einer Lücke bis
  etwa 2 × `GAP`, Spitzen und schmale Zipfel werden trotzdem gefüllt (sie hängen nur an einem Kern). Kleine Flächen
  und Flächen mit nur einem Kern füllt er wie bisher. **`GAP` und `CORE_MIN` nie ändern:** alte Zeichnungen würden
  anders gemalt. Tempo: ein leeres Blatt etwa 40 ms in Node; Rechnungen nur in Zeilen-Füllung bzw. mit
  vorab belegten Typed Arrays, keine Arrays pro Punkt (`[j - 1, j + 1, …]` in der Schleife kostet das Doppelte).
- **Zoomen** (bis sechsfach): die Leinwand liegt in einer Ebene mit `transform: translate(…) scale(…)`
  (`transform-origin: 0 0`, Verschiebung in Bruchteilen der Blattbreite, begrenzt auf das Blatt). Punkte weiter über
  `getBoundingClientRect` der Leinwand umrechnen, das stimmt auch vergrößert. Zwei Finger: zoomen und verschieben um
  die Mitte zwischen ihnen; ein Strich, der gerade erst begonnen hat (unter 350 ms oder wenige Punkte), wird
  verworfen, danach malt nichts, bis alle Finger weg sind. Maus: Strg + Mausrad (auch Zwei-Finger-Zoom am Touchpad)
  zoomt am Zeiger, Mausrad verschiebt im vergrößerten Bild, mittlere Taste zieht. Knöpfe Vergrößern, Verkleinern,
  Ganzes Bild für alle anderen.
- **Malen über Stunden, auf mehreren Geräten:** Jede Anfrage trägt `base` (bestätigter Stand, auf dem der Browser
  aufbaut) und `dev` (Kennung der geöffneten Seite). Gleiches Gerät: doppelte Befehle überspringen wie oben. Anderes
  Gerät und anderer Stand: der Server mischt nicht, sondern schickt den gespeicherten Stand (`conflict`), der
  Browser übernimmt ihn. Den bestätigten Stand rechnet der Browser mit `applyCmd` selbst nach (wie der Server).
  Offene Befehle liegen im Gerätespeicher (`tagesbild.entwurf.<Raum>.<Tag>`) und gehen beim Schließen mit
  `navigator.sendBeacon` raus; beim nächsten Öffnen werden sie nachgeschickt, wenn sie an den Stand anschließen.
- **Vorschaubilder** für die Galerie: 160 px als JPEG-Daten-URL (`thumbnail`), höchstens alle zwanzig Sekunden mit
  einer Speicherung und nach einer Pause; fehlt eins oder ist es älter als das Bild, reicht es der Browser nach, der
  das Bild ganz zeigt.

## Fallen

- Animationen mit `animation-fill-mode: both` oder `forwards` halten `transform` fest: Danach wirken
  `:hover`/`:active`-Übergänge nicht mehr. Für Einblendungen `backwards` nehmen.
- Wörter, die nicht umbrechen dürfen (Galgenmännchen-Striche): `container-type: inline-size` auf dem
  Behälter und Schriftgröße mit `cqw` nach Buchstabenzahl begrenzen. Der Behälter braucht dann eine
  feste Breite (Flex-Element mit `flex: 1`, Grid-Spalte oder `justify-self: stretch`), sonst ist er null breit.
- Im geheimen Muster (`maskWord`) sind keine Buchstaben mehr: Striche zählen, nicht Buchstaben.

## Testen

Zusätzlich zum Skill `spiel-testen`:

- Malen mit dem Finger: `touchPath(page, [punkt, …])` aus `zwei-spieler.cjs`; danach muss `scrollY`
  gleich sein. Punkte relativ zur Malfläche ausrechnen (`getBoundingClientRect` des Canvas).
- **Beide Bilder gleich:** Pixel beider Canvas hashen (`getImageData`) und vergleichen, nach Strichen,
  Eimer, Zurück und Vor.
- **Ohne Live:** beim Rater `page.route('**/api/room', …)` Anfragen mit `"t":"live"` abbrechen und neu
  laden; das Bild muss trotzdem gleich ankommen. Die abgebrochenen Anfragen stehen dann als
  `ERR_FAILED` in den Konsolenfehlern, das ist erwartet.
- Live-Vorschau: den Rater mitten in einem langsamen Strich fotografieren.
- Geschwindigkeit: Spieldatei in den Scratchpad kopieren, `export { createRaster, syncRaster, … }`
  anhängen und in Node eine große Zeichnung (300 Striche) malen, einmal zurück, viele zurück, wieder vor.
  Einmal zurück muss deutlich unter 20 ms bleiben.
