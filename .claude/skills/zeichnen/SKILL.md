---
name: zeichnen
description: Zeichnungen und Abbildungen für Spiele im Spielzimmer mit viel Aufwand erstellen (SVG-Figuren, Tiere, Karten und Kartenrückseiten, Spielsteine, Würfelseiten, Symbole, Spielbretter). Immer laden, bevor in einem Spiel etwas gezeichnet oder eine bestehende Zeichnung verbessert wird.
---

# Zeichnungen für Spiele

Zeichnungen sind das Gesicht eines Spiels. Sie bekommen dieselbe Sorgfalt wie die Spielregeln: erst
verstehen, dann skizzieren, dann in mehreren Runden verfeinern und jede Runde als Bild ansehen. Eine
Zeichnung, die beim ersten Versuch eingebaut wird, ist nicht fertig.

## Stil

Passend zur Plattform (siehe `CLAUDE.md`, „Gestaltung der Plattform“ und „Motion und Optik“):

- **Gedrucktes Brettspiel:** Tuschekontur `#141414`, flache Druckfarben, Papierweiß. Keine Verläufe,
  kein Leuchten, keine Schlagschatten, keine Violett- oder Indigotöne, keine Emojis, keine Clipart.
- **Farben gedämpft**, wie auf Karton gedruckt (z.B. Rost `#c0622b`, Haselnuss `#b07436`,
  Waldgrün `#2e7d4f`, Stahlblau `#3a6b98`, Ocker `#9a7b3c`). Pro Spiel eine kleine Palette als
  Konstanten oben im Anzeige-Teil, nicht verstreute Hex-Werte.
- **Charakter statt Symbol:** eine erkennbare Haltung (sitzend, geduckt, schräg), ein Blick (Augenlicht),
  eine Eigenheit (Fleck über einem Auge, gesträubte Schwanzspitze, abgeschabte Kartenecke). Lieber eine
  Figur mit Persönlichkeit als drei generische.
- **Strich einheitlich:** Hauptkontur 1,6 bis 1,8 in einer 40er-viewBox (entsprechend skalieren),
  Innenlinien dünner (0,8 bis 1,3), `stroke-linejoin="round"`, Enden `round` oder bewusst `square`.
- **Spielerfarben** (`game.color(id)`) nur für das, was einem Spieler gehört. Die Zeichnung selbst
  bleibt in der Spielpalette.

## Ablauf

1. **Verstehen.** Wie sieht das Ding wirklich aus? Bei Tieren: Körperbau, typische Merkmale (der
   Tannenhäher ist braun mit weißen Tupfen und hat einen langen Schnabel). Bei Spielmaterial: wie das
   Original aufgebaut ist (Ecken, Rahmen, Rückseite). Drei bis fünf Merkmale aufschreiben, an denen man
   es erkennt, auch wenn es nur 24 px groß ist.
2. **Silhouette.** Erst nur die Umrissform in Ink als eine Fläche. Sie muss allein erkennbar sein.
   Wenn nicht: Haltung ändern, Merkmale übertreiben (größerer Schwanz, längerer Schnabel).
3. **Aufbau in Ebenen**, von hinten nach vorn, jede Ebene ein eigener `<g>` mit Klasse:
   Hintergrundteile (Schwanz, hinteres Bein), Körper, Vorderteile (Kopf, vorderes Bein), Gesicht und
   Details, Lichter. So lässt sich später jedes Teil einzeln animieren.
4. **Details in drei Stufen:** große Flächen (Körper, Bauch), mittlere Formen (Ohren, Pfoten, Flügel),
   kleine Details (Augenlicht, Nasenspitze, Fell- oder Holzstriche, Tupfen). Jede Stufe muss in der
   Vorschau sichtbar etwas beitragen, sonst weglassen.
5. **Vorschau ansehen** (siehe unten), in allen Größen und in Graustufen. Fragen: Erkennt man es mit
   24 px? Trägt die Kontur auch ohne Farbe (Graustufen)? Stimmen die Proportionen? Wirkt es lebendig?
6. **Mindestens zwei Überarbeitungsrunden** mit Vorschau. Typische Verbesserungen: Kontur schließen,
   Überlappungen sauber ordnen, Augen setzen (Blickrichtung), Größenverhältnisse, ein Detail weg,
   ein besseres dazu.
7. **Bei mehreren Figuren eines Spiels:** alle zusammen in einer Vorschau ansehen. Gleiche
   Strichstärke, gleiche Lichtrichtung (Lichter oben links), gleiche Größe auf der Fläche.
8. **Im Spiel prüfen:** mit dem Browser-Test im echten Spiel ansehen (Handy-Breite 360 px), auch
   klein auf Karten, Würfeln oder in Listen.

## Technik

- Inline-SVG als Zeichenkette in der Spieldatei (keine Dateien, keine Imports), z.B. in einem
  Objekt `ICON = { nuss: \`<svg viewBox="0 0 40 40">…</svg>\` }`. Immer `aria-hidden="true"`, die
  Bedeutung steht im umgebenden Element (`aria-label`).
- **viewBox fest wählen** (40 × 40 für Symbole und Würfelseiten, 100 × 100 für große Figuren,
  Karten im Seitenverhältnis 2 : 3) und auf ganze oder halbe Einheiten zeichnen.
- Farben als Attribute (`fill="#c0622b"`). CSS-Variablen gehen nur im `style`-Attribut
  (`style="fill:var(--pc)"`), nicht in `fill="var(--x)"`.
- Pfade sauber: `M … C … Z`, keine Riesenpfade aus Zeichenprogrammen. Lieber mehrere einfache Formen
  (Kreis, Ellipse, kurzer Pfad) als eine unlesbare.
- Schattierung (dunklere Sichel unten rechts) innerhalb der Kontur halten: als Fläche zwischen dem Umriss und
  einem leicht nach oben links versetzten Kreis (zwei Bögen durch deren Schnittpunkte, siehe die Gesichter in
  `components/Reactions.js`). Ragt sie über die Kontur, wirkt sie wie ein Schlagschatten.
- Konturen, die sich einzeichnen sollen, mit `pathLength="1"` (siehe `games/tic-tac-toe.js`). Nicht mit
  `vector-effect="non-scaling-stroke"` mischen: Dann stimmen die Strichlängen nicht und die Linie
  zeichnet sich stückweise an falschen Stellen ein. `non-scaling-stroke` ist gut für Rahmen, die in
  vielen Größen gleich dicke Konturen haben sollen (Goldrahmen in `games/kunstkritik.js`).
- **Kein `clipPath`, `mask` oder `pattern` mit `id`**, wenn dieselbe Zeichnung mehrfach auf der Seite steht:
  Alle verweisen auf die erste Definition, und ist die versteckt (`display: none`, z.B. eine verdeckte
  Ansicht oder die Vorschau), greift sie nirgends. Schraffuren selbst auf das Rechteck zuschneiden
  (`hatch` in `games/kunstkritik.js`).
- Teile, die sich bewegen sollen (Schwanz wedelt, Ohr zuckt, Deckel klappt), als eigene Gruppe mit
  `transform-box: fill-box; transform-origin: …` im Spiel-CSS. Nur `transform` und `opacity`
  animieren.
- Wiederholungen (Schraffur, Tupfen, Speichen) mit `Array.from` erzeugen, nicht abtippen.
- Eine Figur mit mehreren Gesichtern (froh, traurig, schläft, Maul offen): alle Augen und Münder als Gruppen mit
  `data-…` zeichnen und per CSS am äußeren `svg` nur die passende zeigen (`data-auge`, `data-mund` in
  `components/hai-art.js` und `hai.css`). So wechselt das Gesicht mitten in einer Animation, ohne neu zu zeichnen.
  Für Bilder, die sich nicht ändern, nur die eine Variante ausgeben (`shark({ eye, mouth })`).
- Traurig liest sich im Profil nicht über Augenbrauen (wirkt schnell wütend): besser ein halb geschlossenes Lid und
  eine Träne.
- Text in SVG nur für Zahlen und Buchstaben auf Spielmaterial, mit `style="font:800 12px var(--font-display)"`.
- Beschriftung auf gemustertem Grund (Raumnamen auf Dielen und Fliesen): SVG-Text mit `paint-order: stroke`
  und einer Kontur in Papierfarbe stellt ihn frei, ohne Kasten dahinter (`.kd-label` in `games/krimidoku.js`).
- Grundrisse wie in `games/krimidoku.js`: Möbel von oben gezeichnet (Draufsicht, im Feld 0 bis 100, Lehne
  bzw. Kopfende oben), beim Einsetzen zur nächsten Wand gedreht; Spielfiguren dagegen seitlich, wie
  Figuren, die auf einem Brett stehen. Fußböden als feine Fugen pro Feld, Wände als dicke Linien
  zwischen Räumen, Türen als Lücke mit Türblatt und Bogen, Fenster als Lücke mit Glaslinie.

## Vorschau

Das Skript rendert eine SVG-Datei oder eine HTML-Datei mit mehreren SVGs nebeneinander in 24, 48, 96
und 192 px, auf Weiß, auf einer Spielkarte und in Graustufen, und speichert ein PNG:

```bash
node .claude/skills/zeichnen/vorschau.mjs <datei.svg|datei.html> <ausgabe.png>
```

Die SVG-Entwürfe dafür in den Scratchpad-Ordner schreiben (nicht ins Projekt), das PNG mit dem
Read-Werkzeug ansehen. Für eine HTML-Datei: jedes `<svg>` darin wird einzeln gezeigt, so lassen sich
Varianten oder alle Figuren eines Spiels vergleichen.

**Viele Zeichnungen auf einmal** (zwanzig Speisen, vierzehn Bühnenbilder): `raster.cjs` legt alle `<svg>` einer
HTML-Datei als Raster auf ein Blatt, jedes groß, klein und in Graustufen, beschriftet mit `data-name`:

```bash
node .claude/skills/zeichnen/raster.cjs <datei.html> <ausgabe.png> 80 28 7     # groß, klein, Spalten
```

Liegen die Zeichnungen als Zeichenketten in einem Modul ohne React (wie `components/hai-art.js`), schreibt ein
kleines Skript im Scratchpad die HTML-Datei direkt daraus (`import { FOOD_ART } from '…/hai-art.js'`), so sieht
man nach jeder Änderung den echten Stand. Bühnenbilder (360 × 260) mit `raster.cjs … 300 90 3` ansehen, die Figur
gleich hineinsetzen: Erst dann sieht man, ob sie das Wahrzeichen verdeckt.

## Prüfliste vor dem Einbauen

- [ ] Mit 24 px erkennbar, Silhouette eindeutig.
- [ ] In Graustufen lesbar (Kontur und Helligkeitsunterschiede tragen).
- [ ] Stil wie oben: Tusche, flache Druckfarben, keine Verläufe, Schatten oder Emojis.
- [ ] Strichstärken einheitlich, alle Formen geschlossen, nichts ragt ungewollt aus der viewBox.
- [ ] Mindestens zwei Überarbeitungsrunden mit Vorschau gemacht.
- [ ] Bewegliche Teile als eigene Gruppen, wenn das Spiel sie animiert.
- [ ] Im echten Spiel auf 360 px Breite angesehen.
