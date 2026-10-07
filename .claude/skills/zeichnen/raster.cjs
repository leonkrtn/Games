// Rasterblatt (Skill „zeichnen“): alle <svg> einer Datei nebeneinander, groß, klein und in Graustufen, mit
// Namen aus data-name. Schneller zu überblicken als vorschau.mjs, wenn es viele Zeichnungen sind
// (Essen, Bühnenbilder, Karten eines Spiels).
//
//   node .claude/skills/zeichnen/raster.cjs <datei.html> <ausgabe.png> [groß=80] [klein=28] [spalten=7]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const [input, output, big = '80', small = '28', cols = '7'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Aufruf: node .claude/skills/zeichnen/raster.cjs <datei.html> <ausgabe.png> [groß] [klein] [spalten]');
  process.exit(1);
}
const src = fs.readFileSync(input, 'utf8');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 400 }, deviceScaleFactor: 1.5 });
  await page.setContent(`<style>body{margin:12px;font:11px Arial;background:#fff} #g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px}
  .c{display:grid;justify-items:center;gap:4px;border:1px solid #eee;padding:6px} .c svg{overflow:visible}</style>
  <div id="q" hidden>${src}</div><div id="g"></div>
  <script>
    for (const s of document.querySelectorAll('#q > svg')) {
      const ratio = s.viewBox.baseVal.height / s.viewBox.baseVal.width;
      const sized = (w, gray) => { const x = s.cloneNode(true); x.setAttribute('width', w); x.setAttribute('height', w * ratio); if (gray) x.style.filter = 'grayscale(1)'; return x; };
      const cell = document.createElement('div'); cell.className = 'c';
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:end';
      row.append(sized(${small}), sized(${big} * 0.6, true));
      const label = document.createElement('div'); label.textContent = s.dataset.name || '';
      cell.append(sized(${big}), row, label);
      document.getElementById('g').append(cell);
    }
  </script>`);
  await page.screenshot({ path: output, fullPage: true });
  await browser.close();
  console.log(`Rasterblatt gespeichert: ${output}`);
})();
