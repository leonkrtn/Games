// Alle Größen im echten Spielzimmer (Skill „spiel-testen“): spielt ein Spiel mit Zufallszügen und schaut dabei
// mit denselben Konten in allen gängigen Größen zu, die Spieler auf Handys und am PC, der Bildschirm der Gruppe
// auf Fernsehern, Laptops und Tablets. Nach jeder Runde: automatische Befunde (pruefung.cjs: Überlauf, Text ragt
// heraus oder wird abgeschnitten, Texte überdecken sich, Bildschirm scrollt, Spiel liegt über Ergebnis oder
// Reaktionsknopf) und alles, was dabei verschoben wurde. Alle paar Runden Fotos und ein Übersichtsblatt.
// Braucht einen laufenden Server (Port 3100, siehe SKILL.md).
//
//   const { run } = require('/home/user/Games/.claude/skills/spiel-testen/groessen.cjs');
//   const r = await run({ game: 'flip-7', players: 6, out: '<scratchpad>/shots/flip7', rounds: 30 });
//   console.log(r.text);       // Befunde, gleiche über mehrere Größen zusammengefasst
//   // r.sheets: Übersichtsblätter (alle Größen nebeneinander) zum Ansehen mit dem Read-Werkzeug
//
// Optionen: players (2 bis 6, dazu ein Bildschirm, außer screen: false), options (Lobby-Einstellungen per
// Text wie bei start()), rounds (Runden mit je einem Zufallszug pro Spieler), every (alle wie viele Runden Fotos),
// sizes ({ handy, tv } mit Listen [breite, höhe, name], Standard SIZES aus pruefung.cjs), words (Texte für Formulare),
// links (Instagram-Links für Formulare mit Link-Feld; die Einbettung wird umgeleitet, instagram-ersatz.cjs).
// Zufallszüge: ein sichtbarer, nicht gesperrter Knopf mit data-action im Spiel, ein Formular mit Text, oder ein
// Strich auf einer Malfläche. Bleibt ein Spiel hängen (eigene Eingaben nötig), mehr Runden oder eigene Züge.

const fs = require('node:fs');
const path = require('node:path');
const { start, sleep } = require('./zwei-spieler.cjs');
const { SIZES, INSTALL, report } = require('./pruefung.cjs');
const { routeInstagram } = require('./instagram-ersatz.cjs');

const WORDS = ['Katze im Weltall', 'Pinguin', 'Sonnenbrille', 'Pizza mit Ananas', 'Maximilian Alexander', 'Ja', 'Fünf'];

// Ein Zufallszug auf dieser Seite. Gibt zurück, was getan wurde (oder null).
async function move(page, { words, links }) {
  const did = await page.evaluate(
    ({ words, links }) => {
      const root = document.getElementById('game');
      if (!root) return null;
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
      };
      const forms = [...root.querySelectorAll('form[data-action]')].filter(vis);
      const buttons = [...root.querySelectorAll('[data-action]')].filter((b) => b.tagName !== 'FORM' && !b.disabled && !b.closest('form') && vis(b));
      const canvas = [...root.querySelectorAll('canvas')].filter(vis).find((c) => c.getBoundingClientRect().width > 120);
      if (canvas && Math.random() < 0.3) return { draw: JSON.parse(JSON.stringify(canvas.getBoundingClientRect())) };
      if (forms.length && (Math.random() < 0.5 || !buttons.length)) {
        const f = pick(forms);
        for (const input of f.querySelectorAll('input, textarea')) {
          if (input.type === 'hidden' || input.type === 'checkbox' || input.type === 'radio') continue;
          const hint = `${input.name} ${input.type} ${input.placeholder} ${input.id}`.toLowerCase();
          input.value = /link|url|insta/.test(hint) ? pick(links) : input.type === 'number' ? String(1 + Math.floor(Math.random() * 9)) : pick(words);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        f.requestSubmit();
        return { did: `form ${f.dataset.action}` };
      }
      if (!buttons.length) return null;
      const b = pick(buttons);
      b.click();
      return { did: `klick ${b.dataset.action}` };
    },
    { words, links },
  );
  if (did?.draw) {
    const r = did.draw;
    const at = (fx, fy) => [r.x + r.width * fx, r.y + r.height * fy];
    await page.mouse.move(...at(0.3, 0.3));
    await page.mouse.down();
    for (const [fx, fy] of [[0.5, 0.35], [0.7, 0.5], [0.55, 0.7], [0.35, 0.6]]) await page.mouse.move(...at(fx, fy), { steps: 4 });
    await page.mouse.up();
    return 'malen';
  }
  return did?.did ?? null;
}

// Weitere Fenster für dasselbe Konto in anderen Größen (gleiche Sitzung), mit den Prüfungen aus pruefung.cjs
async function watch(browser, page, sizes, { tv, instagram, errors }) {
  const cookies = await page.context().cookies();
  const list = [];
  for (const [w, h, name] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: !tv });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(INSTALL);
    const p = await ctx.newPage();
    const size = `${w}×${h} ${name}`;
    p.on('pageerror', (e) => errors.push(`${size}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${size}: ${m.text()}`));
    if (instagram) await routeInstagram(p, 'W');
    await p.goto(page.url());
    list.push({ page: p, size, w, h, tv });
  }
  return list;
}

async function sheet(browser, files, file, tv) {
  const cells = files
    .map(([f, size]) => `<figure style="margin:0;display:grid;gap:4px;align-content:start"><figcaption style="font:600 13px sans-serif">${size}</figcaption>
      <img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="display:block;${tv ? 'height:300px' : 'width:220px'};border:1px solid #999"></figure>`)
    .join('');
  const page = await browser.newPage({ viewport: { width: 1800, height: 400 } });
  await page.setContent(`<body style="margin:12px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;background:#eee">${cells}</body>`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

async function run({ game, players = 2, options = [], screen = true, rounds = 30, every = 6, out, sizes = SIZES, words = WORDS, links } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const instagram = game === 'racker-jagd';
  links ??= ['https://www.instagram.com/reel/DAbCdEfGhIj/', 'https://www.instagram.com/p/C1x2y3z4w5v/'];
  const { browser, pages, tv, errors } = await start({ game, players, screen, options });
  if (instagram) for (const [i, p] of [...pages, ...(tv ? [tv] : [])].entries()) await routeInstagram(p, 'ABCDEFG'[i]);
  const watchers = [
    ...(await watch(browser, pages[0], sizes.handy, { tv: false, instagram, errors })),
    ...(tv ? await watch(browser, tv, sizes.tv, { tv: true, instagram, errors }) : []),
  ];
  const findings = [];
  const sheets = [];
  const log = [];
  await sleep(2500);
  // Was beim Laden rutscht (Schriften, Anmeldung, Startkarte am Fernseher), zählt nicht
  for (const w of watchers) await w.page.evaluate(() => { window.shifts.splice(0); window.mark(); });
  const check = async (label, photo) => {
    const handy = [];
    const big = [];
    for (const w of watchers) {
      const shifts = await w.page.evaluate(() => window.shifts.splice(0));
      for (const s of shifts) findings.push({ size: w.size, step: label, msg: `verschoben (${s.dx}, ${s.dy}): ${s.node}` });
      for (const msg of await w.page.evaluate(() => window.audit())) findings.push({ size: w.size, step: label, msg });
      if (photo) {
        const file = path.join(out, `${label}-${w.w}x${w.h}.png`);
        await w.page.screenshot({ path: file, fullPage: !w.tv });
        (w.tv ? big : handy).push([file, w.size]);
        await w.page.evaluate(() => new Promise((r) => setTimeout(r, 120))).then(() => w.page.evaluate(() => window.shifts.splice(0)));
      }
      await w.page.evaluate(() => window.mark());
    }
    for (const [files, kind] of [[handy, 'handy'], [big, 'tv']]) {
      if (!files.length) continue;
      const file = path.join(out, `uebersicht-${label}-${kind}.png`);
      await sheet(browser, files, file, kind === 'tv');
      sheets.push(file);
    }
  };
  await check('start', true);
  for (let r = 1; r <= rounds; r++) {
    for (const [i, p] of pages.entries()) {
      if (await p.$('#result')) break;
      const did = await move(p, { words, links }).catch((e) => `Fehler: ${e.message.slice(0, 80)}`);
      if (did) log.push(`${r}/${i}: ${did}`);
      await sleep(150);
    }
    await sleep(1600); // Testmodus: die anderen Fenster fragen jede Sekunde nach, dazu Animationen
    const over = Boolean(await pages[0].$('#result'));
    await check(`runde${String(r).padStart(2, '0')}`, over || r % every === 0);
    if (over) break;
  }
  await browser.close();
  return { findings, sheets, errors, log, text: report(findings) || 'keine Befunde' };
}

module.exports = { run, move };
