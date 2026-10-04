// Ausschnitt eines Bildschirmfotos in voller Auflösung (Skill „spiel-testen“), z.B. um eine Tür, ein
// Möbelstück oder eine Kante genau anzusehen. Koordinaten in Pixeln des Fotos (bei deviceScaleFactor 2
// also doppelte CSS-Pixel).
//
//   node .claude/skills/spiel-testen/ausschnitt.cjs <foto.png> <ausgabe.png> <x> <y> <breite> <höhe>

const fs = require('node:fs');
const { loadPlaywright } = require('./zwei-spieler.cjs');

(async () => {
  const [input, out, x, y, w, h] = process.argv.slice(2);
  if (!input || !out || !h) {
    console.error('Aufruf: node ausschnitt.cjs <foto.png> <ausgabe.png> <x> <y> <breite> <höhe>');
    process.exit(1);
  }
  const browser = await loadPlaywright().chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
  const data = fs.readFileSync(input).toString('base64');
  await page.setContent(
    `<body style="margin:0;overflow:hidden"><img src="data:image/png;base64,${data}" style="position:absolute;left:-${x}px;top:-${y}px"></body>`,
  );
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: out });
  await browser.close();
  console.log(`Gespeichert: ${out}`);
})();
