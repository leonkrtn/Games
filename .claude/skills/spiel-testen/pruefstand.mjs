// Prüfstand (Skill „spiel-testen“): zeichnet ein Spiel mit einem selbst gebauten Zustand im echten Browser,
// ohne Server, Konten oder Glück. Gut für seltene Momente (Sonderrunde, volle Hände, Endwertung zu sechst)
// und für viele Spieler auf Handy-Breite.
//
//   import * as G from '/home/user/Games/games/flip-7.js';
//   import { shot, series, close } from '/home/user/Games/.claude/skills/spiel-testen/pruefstand.mjs';
//   const s = G.setup(players, {});            // dann Züge mit G.action oder Felder direkt setzen
//   console.log(await shot('flip-7', G, s, { me: 'p0', file: '<scratchpad>/shots/f7.png' }));
//   // → { errors: [...], scroll: [scrollWidth, innerWidth] }  (gleich = kein seitliches Scrollen)
//   await close();
//
// Optionen: me (Sicht dieses Spielers, über view()), prev (Zustand davor: wird zuerst gezeichnet, dann
// animiert der Wechsel wie im Spiel), width (Standard 360), height (Standard 800), wait (ms bis zum Foto), reduced (ohne Bewegung),
// act (async (page) => …, läuft vor dem Warten: Knöpfe antippen, z.B. page.click('.fertig')),
// inspect (Funktion, läuft nach dem Foto in der Seite, ihr Ergebnis steht in `seen`: z.B. Maße von Elementen).
// before (async (page) => …, läuft vor dem Laden: z.B. eingebettete fremde Seiten umleiten, siehe instagram-ersatz.cjs).
// present: zeichnet den Bildschirm einer Gruppe (screen() und present() des Spiels, große Schrift wie am
// Fernseher, mit Kopfzeile und Ergebnis darüber wie in components/Screen.js), dazu am besten width: 1280, height: 720.
// screen: { id, name } gibt render() einen Bildschirm im Raum (game.screen), z.B. für die Fernbedienung am Ende
// von Kunstkritik. Bilder (game.imageUrl) sind graue Platzhalter. Schriften und globals.css sind die echten.
// Die Spieleransicht steht wie im Spielzimmer neben bzw. unter der Anzeigetafel (Breite am PC wie echt).
//
// series(): eine Abfolge von Zuständen in allen gängigen Größen, mit Fotos, Übersichtsblatt pro Schritt und
// automatischen Befunden (Überlauf, Text ragt heraus oder wird abgeschnitten, Texte überdecken sich, Bildschirm
// scrollt, Elemente rutschen, weil etwas dazukommt). Siehe SKILL.md, Abschnitt „Alle Größen“.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadPlaywright } = require('./zwei-spieler.cjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#d6cbb8"/><circle cx="200" cy="210" r="90" fill="#8a6a4a"/></svg>');

const { SIZES, INSTALL, report } = require('./pruefung.cjs');
export { SIZES, report };

const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/fonts/big-shoulders/opsz.css"><link rel="stylesheet" href="/fonts/atkinson-hyperlegible-next/index.css">
<link rel="stylesheet" href="/globals.css"></head><body><main class="shell" id="shell"></main>
<script type="module">
const st = await (await fetch('/state.json')).json();
const mod = await import('/games/' + st.game + '.js');
const tag = document.createElement('style'); tag.textContent = mod.style ?? ''; document.head.append(tag);
const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)'];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const color = (id) => COLORS[st.players.findIndex((p) => p.id === id)] ?? 'var(--muted)';
const shell = document.getElementById('shell');
// Rahmen wie im echten Spielzimmer (components/Room.js) bzw. am Bildschirm (components/Screen.js)
if (st.present) {
  document.documentElement.classList.add('tv-mode');
  shell.innerHTML = '<div class="tv" id="tv"><header class="tv-head"><p class="tv-where">Testgruppe</p><p class="tv-result" hidden></p>'
    + '<div class="tv-tools"><button class="link">Vollbild</button><button class="link">Startseite</button></div></header>'
    + '<div class="tv-stage"><div id="game"></div></div></div>'; // Knöpfe wie echt: Sie bestimmen die Höhe der Kopfzeile mit
} else {
  const teams = st.players.map((p) => '<div class="team"><div><div class="team-name"><span class="marker" style="color:' + color(p.id) + '"></span>'
    + '<span class="team-label">' + esc(p.name) + '</span>' + (p.id === st.me ? '<small>du</small>' : '') + '</div></div>'
    + '<div class="team-score" style="color:' + color(p.id) + '">0</div></div>').join('');
  shell.innerHTML = '<div class="room"><aside class="side"><p class="board-caption">Gewonnene Spiele</p><div class="scoreboard '
    + (st.players.length > 2 ? 'many' : '') + '">' + teams + '</div></aside><div><div id="game-wrap"><div class="game-head">'
    + '<h2 class="section-title">' + esc(st.title) + '</h2><button class="link">Anderes Spiel</button></div>'
    + '<div id="result" class="result" hidden><p class="result-text"></p><div class="row"><button class="btn primary">Nochmal</button>'
    + '<button class="btn">Anderes Spiel</button></div></div><div id="game"></div></div></div></div>';
}
const ctrl = new AbortController();
window.sent = [];
const api = (prev, result) => ({
  me: st.me, players: st.players, screen: st.screen ?? null, name: (id) => st.players.find((p) => p.id === id)?.name ?? '?',
  color, send: (type, data) => { window.sent.push([type, data]); return Promise.resolve(); }, esc, result,
  upload: async () => ({}), imageUrl: () => ${JSON.stringify(PLACEHOLDER)},
  now: () => Date.now(), refresh: () => {}, live: { send() {}, on() { return () => {}; } },
  prev, first: prev === null, signal: ctrl.signal, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
const el = document.getElementById('game');
const draw = st.present ? mod.present : mod.render;
let last = null;
// Zeichnet einen Stand wie GameView: mit dem vorigen als prev, das Ergebnis darüber wie in Room.js/Screen.js
window.show = (view) => {
  const result = view?.result ?? null;
  const banner = document.querySelector(st.present ? '.tv-result' : '#result');
  banner.hidden = !result;
  (st.present ? banner : banner.querySelector('.result-text')).textContent = result?.text ?? '';
  banner.style.setProperty('--len', (result?.text ?? '').length);
  const single = result?.winners?.length === 1 ? color(result.winners[0]) : 'var(--ink)';
  (st.present ? banner : banner.querySelector('.result-text')).style.color = single;
  if (result && last && !last.result) banner.classList.add('late'); // wie im Spielzimmer: erst nach dem Höhepunkt
  draw(el, view, api(last, result));
  last = view;
};
if (st.prev) window.show(st.prev);
window.show(st.view);

${INSTALL}
window.ready = true;
</script></body></html>`;

let server;
let port;
let current = null;
let browser;

function serve(res, file) {
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function start() {
  if (server) return;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/state.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(current));
    }
    if (url.pathname.startsWith('/games/')) return serve(res, path.join(ROOT, url.pathname));
    // Spiele dürfen reine Module aus lib/ importieren (Malspiele: lib/malen.js, lib/malbrett.js)
    if (url.pathname.startsWith('/lib/') && url.pathname.endsWith('.js')) return serve(res, path.join(ROOT, path.normalize(url.pathname)));
    if (url.pathname === '/globals.css') return serve(res, path.join(ROOT, 'app/globals.css'));
    if (url.pathname.startsWith('/fonts/')) return serve(res, path.join(ROOT, 'node_modules/@fontsource-variable', url.pathname.slice(7)));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
}

async function open(G, game, { state, prev, me, present, screen, width, height, reduced, before }) {
  await start();
  const players = state.players.map(({ id, name }) => ({ id, name }));
  const see = (s) => (present ? G.screen(s) : G.view ? G.view(s, me) : s);
  current = { game, title: G.meta?.name ?? game, view: see(state), prev: prev ? see(prev) : null, me, players, present, screen };
  browser ??= await loadPlaywright().chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: present ? 1 : 2,
    hasTouch: !present,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (before) await before(page); // vor dem Laden, z.B. fremde Seiten umleiten (instagram-ersatz.cjs)
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.ready, null, { timeout: 5000 }).catch(() => errors.push('render() ist nicht fertig geworden'));
  return { ctx, page, errors, see };
}

export async function shot(game, G, state, { me = state.players[0].id, prev = null, file, width = 360, height = 800, wait = 1600, reduced = false, inspect, act, before, present = false, screen = null } = {}) {
  if (present) me = 'bildschirm';
  const { ctx, page, errors } = await open(G, game, { state, prev, me, present, screen, width, height, reduced, before });
  if (act) await act(page); // z.B. einen Knopf antippen, bevor das Foto entsteht
  await new Promise((r) => setTimeout(r, wait));
  if (file) await page.screenshot({ path: file, fullPage: true });
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  const seen = inspect ? await page.evaluate(inspect) : undefined;
  await ctx.close();
  return { errors, scroll, ...(inspect ? { seen } : {}) };
}

// Eine Abfolge von Zuständen (wie sie im Spiel nacheinander kommen) in vielen Größen.
//   steps: [zustand, …] oder [{ state, label }, …]; der erste wird ohne prev gezeichnet (Auftakt), jeder weitere
//          mit dem vorigen als prev, wie im Spiel.
//   sizes: 'handy' | 'pc' | 'tv' | [[breite, höhe, name], …]; present: true zeichnet den Bildschirm.
//   out: Ordner für Fotos und Übersichtsblätter (eins pro Schritt, alle Größen nebeneinander).
// Ergebnis: { findings: [{ size, step, msg }], sheets: [datei, …], errors } — findings enthalten die automatischen
// Befunde (window.audit) nach jedem Schritt und die Verschiebungen (layout-shift) beim Wechsel zu diesem Schritt.
export async function series(game, G, steps, { me, present = false, sizes = present ? 'tv' : 'handy', out, wait = 1800, reduced = false, screen = null, before, act } = {}) {
  const list = steps.map((x, i) => (x && x.state ? x : { state: x, label: `schritt${i + 1}` }));
  const dims = typeof sizes === 'string' ? SIZES[sizes] : sizes;
  if (present) me = 'bildschirm';
  me ??= list[0].state.players[0].id;
  fs.mkdirSync(out, { recursive: true });
  const findings = [];
  const errors = [];
  const files = list.map(() => []);
  for (const [w, h, name] of dims) {
    const size = `${w}×${h}${name ? ` ${name}` : ''}`;
    const { ctx, page, errors: errs, see } = await open(G, game, { state: list[0].state, me, present, screen, width: w, height: h, reduced, before });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(wait);
    for (let i = 0; i < list.length; i++) {
      // Erst alles Bisherige verwerfen (Laden, Schriften, das ganzseitige Foto ändert kurz die Fenstergröße)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))));
      await page.evaluate(() => { window.shifts = []; window.mark(); });
      if (i > 0) await page.evaluate((v) => window.show(v), see(list[i].state));
      if (act) await act(page, i);
      await page.waitForTimeout(wait);
      if (i > 0) {
        for (const s of await page.evaluate(() => window.shifts)) {
          findings.push({ size, step: list[i].label, msg: `verschoben (${s.dx}, ${s.dy}): ${s.node}` });
        }
      }
      for (const msg of await page.evaluate(() => window.audit())) findings.push({ size, step: list[i].label, msg });
      const file = path.join(out, `${list[i].label}-${w}x${h}.png`);
      await page.screenshot({ path: file, fullPage: !present });
      files[i].push([file, size]);
      await page.waitForTimeout(150);
    }
    errors.push(...errs.map((e) => `${size}: ${e}`));
    await ctx.close();
  }
  // Übersicht pro Schritt: alle Größen nebeneinander, gleich hoch beschriftet
  const sheets = [];
  for (let i = 0; i < list.length; i++) {
    const cells = files[i]
      .map(([f, size]) => `<figure style="margin:0;display:grid;gap:4px;align-content:start"><figcaption style="font:600 13px sans-serif">${size}</figcaption>
        <img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="display:block;${present ? 'height:340px' : 'width:260px'};border:1px solid #999"></figure>`)
      .join('');
    const page = await browser.newPage({ viewport: { width: 1800, height: 400 } });
    await page.setContent(`<body style="margin:12px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;background:#eee">${cells}</body>`);
    await page.waitForTimeout(100);
    const sheet = path.join(out, `uebersicht-${list[i].label}.png`);
    await page.screenshot({ path: sheet, fullPage: true });
    await page.close();
    sheets.push(sheet);
  }
  return { findings, sheets, errors };
}

export async function close() {
  await browser?.close();
  browser = null;
  server?.close();
  server = null;
}
