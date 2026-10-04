---
name: raetsel
description: Logikrätsel für Spiele im Spielzimmer erzeugen (Krimidoku, Sudoku-artige Raster, Logikgitter) mit eindeutiger Lösung, die ohne Raten lösbar ist. Dazu Schwierigkeit über die erlaubten Schlüsse, mehrere Rätsel, die ineinandergreifen, und das Testen. Laden, bevor ein Spiel Rätsel erzeugt oder ein Rätselgenerator geändert wird. Vorbild ist games/krimidoku.js (generate, propagate, candidates).
---

# Rätsel erzeugen

Erst die Lösung, dann die Hinweise. Ob die Hinweise reichen, entscheidet ein Löser, der so schließt wie ein
Mensch mit Bleistift. Was er nicht schafft, ist für Menschen zu schwer oder nur mit Raten lösbar.

## Ablauf (`generate` in `games/krimidoku.js`)

1. **Lösung bauen**, zufällig und mit allen festen Regeln (eine Person pro Zeile und Spalte, niemand auf
   einem Tisch, im Raum des Opfers genau eine weitere Person). Was die Regeln verletzt: neu würfeln.
2. **Alle wahren Hinweise** über diese Lösung sammeln (`candidates`), jeder mit einem Gewicht, wie gern er
   genommen wird. Interessante hoch („saß auf einem Stuhl“, „genau über Berta“), langweilige niedrig
   („war nicht im Bad“).
3. **Anfangsauswahl:** pro Person ein, zwei Hinweise nach Gewicht, dann zufällig weitere dazu, bis der
   Löser alles eindeutig findet. Klappt das mit allen Hinweisen nicht: neue Lösung.
4. **Weglassen:** jeden Hinweis einmal probeweise entfernen (zufällige Reihenfolge). Bleibt alles lösbar,
   fliegt er raus. Danach wird jeder übrige Hinweis gebraucht.
5. **Güte prüfen** (siehe unten) und sonst neu würfeln. Die Schleife hat eine Höchstzahl, die beste
   Notlösung wird gemerkt. `setup` darf nie hängen oder ohne Rätsel enden.

## Der Löser (`propagate`)

- Pro Unbekannter eine Kandidatenliste (z.B. die möglichen Felder einer Person). Der Löser streicht, bis
  sich nichts mehr ändert, und streicht nur, was sicher nicht geht. Bleibt für jede Person genau ein Feld,
  ist die Lösung eindeutig: Die echte Lösung erfüllt alle Hinweise, also ist sie es.
- **Schlüsse wie ein Mensch:** Ein Hinweis über eine Person schränkt ihre Felder ein. Steht jemand fest,
  sind seine Zeile und Spalte für die anderen weg. Hat eine Zeile nur noch einen Kandidaten, steht er
  dort. Hinweise über zwei Personen („mit Paul im selben Raum“) helfen erst, wenn man von einer weiß, wo
  bzw. in welchem Raum sie war.
- **Schwierigkeit = welche Schlüsse erlaubt sind.** Ein schwächerer Löser braucht mehr Hinweise, das Rätsel
  wird leichter. Krimidoku: leicht und mittel wie oben, schwer zusätzlich alle Folgerungen aus beiden
  Kandidatenlisten und Gruppen (passen k Personen nur in k Zeilen, sind diese Zeilen für alle anderen weg).
  Die Rastergröße ist der zweite Regler.
- Kein Ausprobieren (Backtracking): Rätsel, die nur mit Raten gehen, machen keinen Spaß.

## Mehrere Rätsel, die ineinandergreifen

Jeder Spieler hat sein eigenes Rätsel, aber manche Hinweise verbinden zwei („Anton war genau über Berta“).

- Verbindende Hinweise beim Weglassen zuletzt probieren, damit sie bleiben.
- **Kein Rätsel allein lösbar:** Löser nur mit den eigenen Hinweisen laufen lassen. Löst er es, neu würfeln.
- **Jeder kann allein anfangen:** Allein müssen schon einige Personen feststehen (Krimidoku: mindestens
  ein Drittel). Beim Weglassen keinen Hinweis entfernen, der das unterschreitet.
- Hinweise anderer Rätsel, die die eigenen Personen betreffen, auch beim eigenen Rätsel zeigen („Aus den
  anderen Stockwerken“). Sonst sucht man sie nicht.

## Zustand, Geheimnis, Anzeige

- Im `state` nur Daten: Raster, Hinweise als kleine Objekte (`{ p, t: 'auf', k: 'stuhl' }`), Lösung. Sätze
  entstehen erst beim Zeichnen (`clueParts`), so bleibt der Zustand klein (Krimidoku höchstens etwa 5 KB).
- Die Lösung offener Rätsel in `view` weglassen. Ob ein Hinweis erfüllt oder verletzt ist, rechnet der
  Browser aus den gesetzten Figuren selbst: Das verrät nichts, was der Spieler nicht auch sieht.
- `setup` läuft auf dem Server bei jedem Start: Zeit messen (zwanzig Rätsel pro Größe), Ziel unter einer
  halben Sekunde. Krimidoku: sechs mal sechs mit vier Stockwerken etwa 150 ms.

## Testen

Hilfsfunktionen aus einer Kopie der Spieldatei exportieren (nicht im Projekt):

```bash
cp games/krimidoku.js <scratchpad>/k.mjs && echo "export { generate, propagate, candidates };" >> <scratchpad>/k.mjs
```

- **Kennzahlen** für jede Größe und Spielerzahl: Hinweise pro Rätsel, wie viele Personen allein feststehen,
  Personen ohne Hinweis, wie oft die Notlösung kam, Zeit pro `setup`.
- **Ein Rätsel als Text ausgeben** (Raster mit Raumnummern, Möbeln, Lösung, Hinweise als Sätze) und selbst
  lösen. Erst dabei merkt man, ob es Spaß macht oder ein Hinweistyp zu stark ist.
- **Simulation:** Für viele Rätsel den Löser auf der Ansicht (`view`) laufen lassen und mit der gespeicherten
  Lösung vergleichen. Dazu Regeln, Geheimnisse und Ende wie im Skill `spiel-testen`.
- **Browser:** Die Lösung aus `snapshot.game.view` mit dem Löser berechnen und die Figuren per Klick setzen.
  So spielt ein Skript ganze Partien mit allen Konten durch.
