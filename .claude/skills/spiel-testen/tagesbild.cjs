// Tagesbild in allen Größen (Skill „spiel-testen“): vier Konten mit langen Namen, Phasen von „malen“ bis
// „wartet-auf-morgen“, Uhr über die Testuhr (Server mit SPIELZIMMER_TESTUHR=1), Befunde aus pruefung.cjs und ein
// Übersichtsblatt pro Phase.
//
//   node .claude/skills/spiel-testen/tagesbild.cjs <ausgabe-ordner> [phase,phase]
const fs = require('fs');
const { SIZES, INSTALL, report } = require('/home/user/Games/.claude/skills/spiel-testen/pruefung.cjs');
const { loadPlaywright, sleep } = require('/home/user/Games/.claude/skills/spiel-testen/zwei-spieler.cjs');
const base = 'http://localhost:3100';
const OUT = process.argv[2] ?? '/tmp/tagesbild-groessen';
fs.mkdirSync(OUT, { recursive: true });
const sizes = [...SIZES.handy, ...SIZES.pc, [1920, 1080, 'Full HD']];
const only = process.argv[3]; // nur diese Phasen (Komma getrennt), sonst alle
async function api(page, url, body) {
  return page.evaluate(async ([url, body]) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); }, [url, body]);
}
(async () => {
  const M = await import('/home/user/Games/lib/malen.js');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];
  const findings = [];
  const suffix = String(Date.now() % 1000).padStart(3, '0');
  const acc = {};
  for (const [k, name] of [['A', 'Maximilian_Alexa' + suffix + '1'], ['B', 'Konstantin_Fried' + suffix + '2'], ['C', 'Charlotte_Elisab' + suffix + '3'], ['D', 'Dorothea_Wilhel' + suffix + '4']]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
    const page = await ctx.newPage();
    await page.goto(base);
    const r = await api(page, '/api/account', { t: 'signup', username: name, password: 'geheim12345' });
    if (r.error) throw new Error(r.error);
    acc[k] = { page, ctx, name, id: r.user.id };
  }
  const tb = (k, body) => api(acc[k].page, '/api/tagesbild', body);
  const { inviteCode } = await api(acc.A.page, '/api/account', { t: 'home' });
  for (const k of ['B', 'C']) await api(acc[k].page, '/api/account', { t: 'friend-invite', code: inviteCode });
  const c = await api(acc.C.page, '/api/account', { t: 'home' });
  await api(acc.D.page, '/api/account', { t: 'friend-invite', code: c.inviteCode });
  const clock = (iso) => tb('A', { t: 'uhr', at: Date.parse(iso) });

  let watchers = [];
  async function watch(k, path = '/?seite=tagesbild', list = sizes) {
    for (const w of watchers) await w.ctx.close();
    watchers = [];
    const cookies = await acc[k].ctx.cookies();
    for (const [w, h, label] of list) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900 });
      await ctx.addCookies(cookies);
      await ctx.addInitScript(INSTALL);
      const page = await ctx.newPage();
      const size = `${w}×${h} ${label}`;
      page.on('pageerror', (e) => errors.push(`${size}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${size}: ${m.text()}`));
      await page.goto(base + path);
      watchers.push({ ctx, page, size, w });
    }
    await sleep(2500);
    for (const w of watchers) await w.page.evaluate(() => { window.shifts.splice(0); window.mark(); });
  }
  async function shoot(step, root = '#tagesbild-page', { wait = 3200, shifts = true } = {}) {
    if (only && !only.split(',').includes(step)) { await sleep(wait); for (const w of watchers) await w.page.evaluate(() => { window.shifts.splice(0); window.mark(); }); return; }
    await sleep(wait);
    const files = [];
    for (const w of watchers) {
      const sh = await w.page.evaluate(() => window.shifts.splice(0));
      if (shifts) for (const s of sh) findings.push({ size: w.size, step, msg: `verschoben (${s.dx}, ${s.dy}): ${s.node}` });
      for (const msg of await w.page.evaluate((r) => window.audit(r), root)) findings.push({ size: w.size, step, msg });
      const f = `${OUT}/${step}-${w.size.split(' ')[0]}.png`;
      await w.page.screenshot({ path: f, fullPage: true });
      files.push([f, w.size]);
      // Das ganzseitige Foto ändert kurz die Fenstergröße: was dabei rutscht, zählt nicht
      await w.page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
      await w.page.evaluate(() => { window.shifts.splice(0); window.mark(); });
    }
    const cells = files.map(([f, size]) => `<figure style="margin:0;display:grid;gap:4px;align-content:start"><figcaption style="font:600 13px sans-serif">${size}</figcaption><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="display:block;width:${size.startsWith('1920') || size.startsWith('1280') || size.startsWith('820') ? 330 : 200}px;border:1px solid #999"></figure>`).join('');
    const p = await browser.newPage({ viewport: { width: 2000, height: 400 } });
    await p.setContent(`<body style="margin:12px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;background:#eee">${cells}</body>`);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${OUT}/blatt-${step}.png`, fullPage: true });
    await p.close();
    console.log('Blatt', step);
  }
  const strokes = (seed, color, n = 6) => Array.from({ length: n }, (_, k) => ({ s: k + 1, t: 's', c: color, w: 2 + (k % 3), p: M.encodePoints(Array.from({ length: 16 }, (_, i) => [80 + i * 52, 120 + k * 140 + Math.round(Math.sin(i / 2 + seed + k) * 50)])) }));

  await clock('2026-10-29T13:00:00Z');
  const st = await tb('A', { t: 'start', friend: acc.B.id, task: 'Ein Leuchtturm im Sturm, der die Schiffe heimführt' });
  const room = st.room;
  await tb('A', { t: 'malen', room, day: '2026-10-29', base: 0, dev: 'a', cmds: strokes(0, 15) });
  // Phase: Anna malt, Ben hat noch nicht angefangen, dann fängt Ben an (nichts darf rutschen)
  await watch('A');
  await shoot('malen');
  await tb('B', { t: 'malen', room, day: '2026-10-29', base: 0, dev: 'b', cmds: strokes(2, 11, 5) });
  await shoot('malen-ben-faengt-an');
  // Anna schickt ab
  await tb('A', { t: 'malen', room, day: '2026-10-29', base: 6, dev: 'a', cmds: [], fertig: true });
  await shoot('abgeschickt', '#tagesbild-page', { shifts: false });
  // Ben: malt noch, Anna hat abgeschickt; Ben denkt sich morgen aus
  await watch('B');
  await shoot('ben-malt');
  await tb('B', { t: 'malen', room, day: '2026-10-29', base: 5, dev: 'b', cmds: [], fertig: true });
  await shoot('aufgedeckt', '#tagesbild-page', { shifts: false, wait: 3800 });
  await tb('A', { t: 'herz', room, day: '2026-10-29', on: true });
  await tb('A', { t: 'kommentar', room, day: '2026-10-29', text: 'Die Wellen sehen aus, als würden sie gleich über den Rand schwappen. Ich mag die Farben so sehr!!' });
  await tb('B', { t: 'kommentar', room, day: '2026-10-29', text: 'Wunderschön, der Leuchtturm steht wie ein Fels in der Brandung, und das Licht ist richtig toll!!' });
  await shoot('herz-kommentar');
  await tb('B', { t: 'aufgabe', room, day: '2026-10-30', text: 'Dein Frühstück, so wie es heute Morgen aussah' });
  await shoot('aufgabe-gespeichert', '#tagesbild-page', { shifts: false });
  for (const w of watchers) { await w.page.click('.tb-cal-cell.has-day'); }
  await shoot('tagansicht', '#tagesbild-page', { shifts: false, wait: 2000 });
  // nächster Morgen, 9 Uhr: Aufgabe für heute steht schon
  await clock('2026-10-30T08:00:00Z');
  await watch('B');
  await shoot('morgens');
  // Startseite mit Karte
  await watch('A', '/');
  await shoot('startseite', '.home', { shifts: false });
  // C: Anna ist vergeben, Dorothea frei; startet um 21:30 → morgen
  await clock('2026-10-30T20:30:00Z');
  await watch('C');
  await shoot('start');
  await tb('C', { t: 'start', friend: acc.D.id, task: '' });
  await shoot('wartet-auf-morgen', '#tagesbild-page', { shifts: false });
  console.log(report(findings) || 'keine Befunde');
  console.log('Fehler', [...new Set(errors)].slice(0, 20));
  await browser.close();
})();
