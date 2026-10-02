---
name: malflaeche
description: Spiele bauen, in denen jemand malt und der andere live zusieht (Malfläche mit Farben, Dicken, Eimer, Radierer, Zurück/Vor). Wie die Zeichnung gespeichert, live übertragen und in jedem Browser gleich gemalt wird, wie die Malfläche auf dem Handy nicht scrollt und wie man das testet. Laden, bevor eine Malfläche gebaut oder geändert wird. Vorbild ist games/montagsmaler.js.
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
