// Vorschau für Zeichnungen (Skill „zeichnen“): rendert jedes <svg> einer SVG- oder HTML-Datei in 24, 48,
// 96 und 192 px, auf einer Spielkarte und in Graustufen, und speichert alles als ein PNG.
//
//   node .claude/skills/zeichnen/vorschau.mjs <datei.svg|datei.html> <ausgabe.png>

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [input, output = 'vorschau.png'] = process.argv.slice(2);
if (!input) {
  console.error('Aufruf: node .claude/skills/zeichnen/vorschau.mjs <datei.svg|datei.html> <ausgabe.png>');
  process.exit(1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {}
  try {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  } catch {}
  console.error('Playwright fehlt. Installieren mit: npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

// Schrift der Plattform einbetten, damit Zahlen auf Karten aussehen wie im Spiel
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fontFile = path.join(root, 'node_modules/@fontsource-variable/big-shoulders/files/big-shoulders-latin-wght-normal.woff2');
const fontFace = fs.existsSync(fontFile)
  ? `@font-face { font-family: 'Big Shoulders Variable'; font-weight: 100 900; src: url(data:font/woff2;base64,${fs.readFileSync(fontFile).toString('base64')}) format('woff2'); }`
  : '';

const source = fs.readFileSync(input, 'utf8');
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFace}
  :root { --ink: #141414; --paper: #fff; --hairline: #d6d6d6; --pc: #d7301f;
    --font-display: 'Big Shoulders Variable', 'Arial Narrow', Arial, sans-serif; --font-body: Arial, sans-serif; }
  body { margin: 0; padding: 24px; background: #fff; color: var(--ink); font: 13px/1.3 var(--font-body); }
  #quelle { display: none; }
  .zeile { display: flex; align-items: end; gap: 28px; padding: 18px 0; border-bottom: 1px solid var(--hairline); }
  .feld { display: grid; justify-items: center; gap: 6px; }
  .feld small { color: #5c5c5c; }
  .feld svg { display: block; overflow: visible; }
  .karte { width: 96px; height: 144px; display: grid; place-items: center; border: 1.6px solid var(--ink); border-radius: 4px; }
  .grau { filter: grayscale(1); }
</style></head><body><div id="quelle">${source}</div><div id="vorschau"></div><script>
  const quelle = document.getElementById('quelle');
  const svgs = [...quelle.querySelectorAll('svg')].filter((s) => !s.parentElement.closest('svg'));
  const ziel = document.getElementById('vorschau');
  svgs.forEach((svg, i) => {
    const zeile = document.createElement('div');
    zeile.className = 'zeile';
    const feld = (px, extra = '', label = px + ' px') => {
      const f = document.createElement('div');
      f.className = 'feld';
      const kopie = svg.cloneNode(true);
      kopie.setAttribute('width', px);
      kopie.setAttribute('height', px);
      const halter = document.createElement('div');
      if (extra) halter.className = extra;
      halter.append(kopie);
      f.append(halter);
      f.insertAdjacentHTML('beforeend', '<small>' + label + '</small>');
      return f;
    };
    zeile.append(feld(24), feld(48), feld(96), feld(192), feld(68, 'karte', 'auf Karte'), feld(96, 'grau', 'Graustufen'));
    zeile.insertAdjacentHTML('afterbegin', '<b>' + (svg.id || svg.dataset.name || 'Nr. ' + (i + 1)) + '</b>');
    ziel.append(zeile);
  });
  if (!svgs.length) ziel.textContent = 'Kein <svg> gefunden.';
</script></body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 860, height: 400 }, deviceScaleFactor: 2 });
await tab.setContent(page);
await tab.evaluate(() => document.fonts.ready);
await tab.screenshot({ path: output, fullPage: true });
await browser.close();
console.log(`Vorschau gespeichert: ${output}`);
