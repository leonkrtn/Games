// Bilder nebeneinander (Skill „spiel-testen“): denselben Ausschnitt mehrerer Bildschirmfotos in ein Bild,
// z.B. die Einzelbilder einer Animation (60, 300, 1000 ms) oder dieselbe Ansicht zu zweit und zu sechst.
// Spart beim Ansehen Zeit, und Unterschiede fallen sofort auf.
//
//   node .claude/skills/spiel-testen/nebeneinander.cjs <ausgabe.png> <oben:unten> <a.png> <b.png> …
//
// oben:unten in Pixeln der Fotos (bei deviceScaleFactor 2 also doppelte CSS-Pixel). Jedes Foto wird auf
// 360 px Breite verkleinert und mit seinem Dateinamen beschriftet.

const fs = require('node:fs');
const { loadPlaywright } = require('./zwei-spieler.cjs');

(async () => {
  const [out, range, ...files] = process.argv.slice(2);
  if (!out || !range || !files.length) {
    console.error('Aufruf: node nebeneinander.cjs <ausgabe.png> <oben:unten> <a.png> <b.png> …');
    process.exit(1);
  }
  const [top, bottom] = range.split(':').map(Number);
  const h = (bottom - top) / 2;
  const cells = files
    .map(
      (f) => `<div style="position:relative;width:360px;height:${h}px;overflow:hidden;border-right:2px solid #c00">
        <img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="position:absolute;left:0;top:${-top / 2}px;width:360px">
        <b style="position:absolute;left:4px;top:2px;font:12px sans-serif;background:#ff0">${f.split('/').pop()}</b></div>`,
    )
    .join('');
  const browser = await loadPlaywright().chromium.launch();
  const page = await browser.newPage({ viewport: { width: 362 * files.length, height: Math.ceil(h) } });
  await page.setContent(`<body style="margin:0;display:flex">${cells}</body>`);
  await page.screenshot({ path: out });
  await browser.close();
  console.log(`Gespeichert: ${out}`);
})();
