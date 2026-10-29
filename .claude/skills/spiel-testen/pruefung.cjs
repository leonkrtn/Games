// Prüfungen im Browser (Skill „spiel-testen“), für den Prüfstand (pruefstand.mjs) und das echte Spielzimmer
// (groessen.cjs). install() läuft in der Seite und legt an:
//   window.shifts  Elemente, die verschoben wurden (Layout Instability API): was schon da war und rutscht,
//                  weil etwas dazukommt, wegfällt oder seine Größe ändert. Transform-Animationen zählen nicht.
//   window.mark()  merkt sich die Texte aller Elemente; rückt danach ein Element nur seitlich, weil sich sein
//                  eigener Text geändert hat (zentriert, andere Breite), zählt das nicht als Verschieben. Ebenso
//                  nicht, was das Spiel selbst bewegt (Inline-Style geändert, z.B. --x/--y einer Figur) oder per
//                  FLIP gleiten lässt (am Element oder einem Vorfahren läuft eine Animation mit transform).
//   window.audit() Befunde zum jetzigen Bild: seitlich scrollbar, Bildschirm scrollt (am Fernseher), Text ragt
//                  aus seinem Kasten, wird abgeschnitten, ist sehr klein, überdeckt anderen Text oder steht
//                  außerhalb des Fensters. Geprüft wird das Spiel (#game); für andere Seiten der Plattform einen
//                  Selektor mitgeben, z.B. window.audit('#tagesbild-page').

// Gängige Größen (CSS-Pixel). Handy hochkant, PC und Tablet für Spieler; Fernseher, Laptop, Beamer und Tablet quer
// als Bildschirm einer Gruppe.
const SIZES = {
  handy: [
    [320, 640, 'kleines Handy'],
    [360, 780, 'Android'],
    [375, 667, 'iPhone SE'],
    [390, 844, 'iPhone'],
    [430, 932, 'iPhone Max'],
  ],
  pc: [
    [820, 1180, 'iPad hoch'],
    [1280, 800, 'Laptop'],
  ],
  tv: [
    [960, 540, 'TV-Browser klein'],
    [1280, 720, 'HD'],
    [1366, 768, 'Laptop'],
    [1440, 900, 'MacBook'],
    [1920, 1080, 'Full HD'],
    [2560, 1080, 'Breitbild'],
    [1180, 820, 'iPad quer'],
  ],
};

function install() {
  const describe = (n) => {
    if (!n || n.nodeType !== 1) return n?.nodeType === 3 ? 'Text „' + n.textContent.trim().slice(0, 24) + '“' : '?';
    const cls = typeof n.className === 'string' ? n.className : (n.className?.baseVal ?? '');
    const own = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
    return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (cls.trim() ? '.' + cls.trim().split(/\s+/).join('.') : '') + (own ? ' „' + own.slice(0, 24) + '“' : '');
  };
  window.describeNode = describe;
  const ownText = (n) => [...(n?.childNodes ?? [])].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('');
  window.shifts = [];
  window.mark = () => {
    window.textBefore = new WeakMap([...document.querySelectorAll('body *')].map((n) => [n, [ownText(n), n.textContent]]));
    window.textChanged = new WeakSet();
    window.styled = new WeakSet();
  };
  // Elemente, deren Text sich seit mark() geändert hat (auch zwischendurch, z.B. eine laufende Uhr)
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') window.styled?.add(m.target);
      else for (let n = m.target.nodeType === 3 ? m.target.parentElement : m.target; n; n = n.parentElement) window.textChanged?.add(n);
    }
  }).observe(document, { subtree: true, characterData: true, childList: true, attributes: true, attributeFilter: ['style'] }); // document statt documentElement: läuft auch vor dem Laden
  // Läuft am Element oder einem Vorfahren gerade eine Animation mit transform, ist der Platzwechsel gewollt animiert
  const animatedMove = (n) => {
    for (let a = n.nodeType === 1 ? n : n.parentElement; a && a !== document.body; a = a.parentElement) {
      for (const an of a.getAnimations?.({ subtree: false }) ?? []) {
        if (an.playState !== 'running' || an instanceof CSSTransition) continue;
        if (an.effect?.getKeyframes?.().some((k) => k.transform || k.translate)) return true;
      }
    }
    return false;
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      for (const s of e.sources ?? []) {
        // Die Rechtecke sind auf das Fenster beschnitten: Lag das Element vorher oder nachher außerhalb (leeres
        // Rechteck), ist das kein Rutschen, sondern Scrollen oder ein Foto der ganzen Seite
        if (!s.previousRect.width || !s.previousRect.height || !s.currentRect.width || !s.currentRect.height) continue;
        const dx = Math.round(s.currentRect.x - s.previousRect.x);
        const dy = Math.round(s.currentRect.y - s.previousRect.y);
        if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) continue;
        const was = s.node && window.textBefore?.get(s.node);
        const changed = (was && (was[0] !== ownText(s.node) || was[1] !== s.node.textContent)) || window.textChanged?.has(s.node);
        if (changed && Math.abs(dy) <= 2) continue; // nur seitlich, weil der eigene Text anders ist
        if (s.node && window.styled?.has(s.node)) continue; // vom Spiel selbst bewegt (eigener Inline-Style)
        if (s.node && animatedMove(s.node)) continue; // gleitet per FLIP an den neuen Platz (Spielfelder tauschen)
        window.shifts.push({ node: describe(s.node), dx, dy });
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });

  window.audit = (rootSelector = '#game') => {
    const out = [];
    const tv = document.documentElement.classList.contains('tv-mode');
    const de = document.documentElement;
    if (de.scrollWidth > innerWidth + 1) out.push('seitlich scrollbar: ' + de.scrollWidth + ' > ' + innerWidth);
    if (tv && de.scrollHeight > innerHeight + 1) {
      // Was ragt unten heraus? Die tiefsten Elemente ohne Kinder, die ebenfalls herausragen
      const below = [...document.body.querySelectorAll('*')].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.bottom > innerHeight + 1 && r.height > 0 && ![...n.children].some((c) => c.getBoundingClientRect().bottom > innerHeight + 1);
      });
      below.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      out.push('Bildschirm scrollt: ' + de.scrollHeight + ' > ' + innerHeight + ', unten: ' + below.slice(0, 2).map((n) => describe(n) + ' bis ' + Math.round(n.getBoundingClientRect().bottom)).join(', '));
    }
    const root = document.querySelector(rootSelector);
    if (!root) return out;
    // Rückseite einer gedrehten Karte (backface-visibility: hidden und von hinten zu sehen): unsichtbar
    const facingAway = (face) => {
      let m = new DOMMatrix();
      for (let a = face; a && a !== document.body; a = a.parentElement) {
        const t = getComputedStyle(a).transform;
        if (t && t !== 'none') m = new DOMMatrix(t).multiply(m);
      }
      return m.m33 < 0;
    };
    const shown = (n) => {
      for (let a = n; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
        if (cs.backfaceVisibility === 'hidden' && facingAway(a)) return false;
        // nur für Vorleser (sr-only): weggeschnitten oder ein Pixel groß
        if ((cs.clipPath && cs.clipPath !== 'none') || (cs.clip && cs.clip !== 'auto')) return false;
        if (cs.position === 'absolute' && a.offsetWidth <= 2 && a.offsetHeight <= 2) return false;
      }
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const rem = parseFloat(getComputedStyle(de).fontSize);
    // Fläche des Textes; bei enger Zeilenhöhe (line-height unter 1,2) ist der Schriftkasten höher als die
    // sichtbaren Zeichen, dann zählt nur der Kasten des Elements (sonst meldet es Überdeckungen, die man nicht sieht)
    const textRects = (n) => {
      const box = getComputedStyle(n).display !== 'inline' && !(n instanceof SVGElement) ? n.getBoundingClientRect() : null;
      return [...n.childNodes]
        .filter((c) => c.nodeType === 3 && c.textContent.trim())
        .flatMap((c) => {
          const range = document.createRange();
          range.selectNodeContents(c);
          return [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
        })
        .map((r) => (box ? DOMRect.fromRect({ x: r.x, width: r.width, y: Math.max(r.top, box.top), height: Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) }) : r))
        .filter((r) => r.height > 1);
    };
    const texts = [...root.querySelectorAll('*')].filter((n) => textRects(n).length && shown(n));
    for (const n of texts) {
      const cs = getComputedStyle(n);
      const name = describe(n);
      const svg = n instanceof SVGElement;
      const size = parseFloat(cs.fontSize);
      if (!svg && size < (tv ? 0.8 * rem : 10.5)) out.push('Schrift sehr klein (' + Math.round(size) + ' px): ' + name);
      if (!svg && cs.display !== 'inline') {
        if (cs.textOverflow === 'ellipsis') {
          if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth < size * 3) out.push('Text auf wenige Zeichen gekürzt: ' + name);
        } else {
          // eigene Textzeilen gegen den Kasten (scrollWidth zählt auch Kinder mit, die gewollt herausragen)
          const b = n.getBoundingClientRect();
          const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
          const pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
          if (textRects(n).some((r) => r.left < b.left + pl - 2 || r.right > b.right - pr + 2)) out.push('Text ragt seitlich aus seinem Kasten: ' + name);
        }
        const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none'; // gewollt gekürzt auf wenige Zeilen
        if (!clamped && n.scrollHeight > n.clientHeight + 2 && (cs.overflowY === 'hidden' || cs.overflowY === 'clip')) {
          out.push('Text unten abgeschnitten (Zeilenhöhe?): ' + name);
        }
      }
      // Bei Auslassungspunkten zählt der Kasten, nicht der ganze (gekürzte) Text
      for (const r of cs.textOverflow === 'ellipsis' ? [n.getBoundingClientRect()] : textRects(n)) {
        if (r.right > innerWidth + 1 || r.left < -1) out.push('Text außerhalb des Fensters: ' + name);
        for (let a = n.parentElement; a && a !== document.body; a = a.parentElement) {
          const ac = getComputedStyle(a);
          if (ac.overflowX === 'visible' && ac.overflowY === 'visible') continue;
          if (ac.display === 'inline') continue; // overflow wirkt an Inline-Elementen nicht
          const b = a.getBoundingClientRect();
          // gewollt mit Auslassungspunkten gekürzt (am Vorfahren): seitlich abgeschnitten ist in Ordnung
          if (ac.textOverflow === 'ellipsis' && r.top >= b.top - 1 && r.bottom <= b.bottom + 1) continue;
          if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) {
            out.push('Text abgeschnitten von ' + describe(a) + ': ' + name);
            break;
          }
        }
      }
    }
    // Texte, die sich überdecken (ohne Eltern und Kinder). Liegt einer in einer Fläche mit eigenem Hintergrund,
    // die über dem anderen schwebt (Countdown über dem Spielfeld), ist das gewollt.
    const cover = (n) => {
      for (let a = n; a && a !== root; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (ac.position !== 'absolute' && ac.position !== 'fixed') continue;
        const bg = ac.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
        if (bg.length && (bg.length < 4 || bg[3] >= 0.5)) return a;
      }
      return null;
    };
    // liegt die Fläche an der Stelle oben? (pointer-events: none kurz aufheben, sonst sieht elementFromPoint durch)
    const covers = (c, other, x, y) => {
      if (!c || c.contains(other)) return false;
      // außerhalb des Fensters findet elementFromPoint nichts: dann gilt, was im DOM später kommt, liegt oben
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return Boolean(other.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      const pe = c.style.getPropertyValue('pointer-events');
      const prio = c.style.getPropertyPriority('pointer-events');
      const had = window.styled?.has(c);
      c.style.setProperty('pointer-events', 'auto', 'important');
      const top = document.elementFromPoint(x, y);
      if (pe) c.style.setProperty('pointer-events', pe, prio);
      else c.style.removeProperty('pointer-events');
      if (!had) queueMicrotask(() => window.styled?.delete(c)); // die Prüfung selbst bewegt nichts
      return Boolean(top && c.contains(top));
    };
    const boxes = texts.map((n) => [n, getComputedStyle(n).textOverflow === 'ellipsis' ? [n.getBoundingClientRect()] : textRects(n)]);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, ra] = boxes[i];
        const [b, rb] = boxes[j];
        if (a.contains(b) || b.contains(a)) continue;
        if (a instanceof SVGElement && b instanceof SVGElement) continue; // Zeichnungen (Kartenrücken im Stapel) liegen gewollt übereinander
        let hit = null;
        for (const p of ra) {
          for (const q of rb) {
            const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
            const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
            if (w > 2 && h > 2 && w * h > 0.15 * Math.min(p.width * p.height, q.width * q.height)) {
              hit = [Math.max(p.left, q.left) + w / 2, Math.max(p.top, q.top) + h / 2];
            }
          }
        }
        if (!hit) continue;
        if (covers(cover(a), b, ...hit) || covers(cover(b), a, ...hit)) continue; // gewollt darübergelegt
        if (animatedMove(a) || animatedMove(b)) continue; // fliegt gerade (Karte vom Stapel zum Platz)
        out.push('Texte überdecken sich: ' + describe(a) + ' / ' + describe(b));
      }
    }
    // Spielinhalt unter festen Leisten der Plattform (Ergebnis unten, Reaktionsknopf): darf nicht darüber liegen
    for (const bar of document.querySelectorAll('.result, .react')) {
      const r = bar.getBoundingClientRect();
      if (!r.width || !shown(bar)) continue;
      const x = r.left + Math.min(40, r.width / 2);
      const y = r.top + Math.min(20, r.height / 2);
      const top = document.elementFromPoint(x, y);
      if (top && !bar.contains(top) && root.contains(top)) out.push('Spiel liegt über ' + describe(bar) + ': ' + describe(top));
    }
    return [...new Set(out)];
  };
}

// Befunde lesbar ausgeben: gleiche Meldungen über mehrere Größen zusammengefasst
function report(findings) {
  const by = new Map();
  for (const f of findings) {
    const key = `${f.step}: ${f.msg}`;
    if (!by.has(key)) by.set(key, []);
    const size = f.size.split(' ')[0];
    if (!by.get(key).includes(size)) by.get(key).push(size);
  }
  return [...by].map(([k, s]) => `${k}  [${s.join(', ')}]`).join('\n');
}

module.exports = { SIZES, install, INSTALL: `(${install.toString()})();`, report };
