// Prüfstand (Skill „spiel-testen“): zeichnet ein Spiel mit einem selbst gebauten Zustand im echten Browser,
// ohne Server, Konten oder Glück. Gut für seltene Momente (Sonderrunde, volle Hände, Endwertung zu sechst)
// und für viele Spieler auf Handy-Breite.
//
//   import * as G from '/home/user/Games/games/flip-7.js';
//   import { shot, close } from '/home/user/Games/.claude/skills/spiel-testen/pruefstand.mjs';
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
// Bilder (game.imageUrl) sind graue Platzhalter. Schriften und globals.css sind die echten.

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

const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/fonts/big-shoulders/opsz.css"><link rel="stylesheet" href="/fonts/atkinson-hyperlegible-next/index.css">
<link rel="stylesheet" href="/globals.css"></head><body><main class="shell"><div id="game"></div></main>
<script type="module">
const st = await (await fetch('/state.json')).json();
const mod = await import('/games/' + st.game + '.js');
const tag = document.createElement('style'); tag.textContent = mod.style ?? ''; document.head.append(tag);
const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)'];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ctrl = new AbortController();
window.sent = [];
const api = (prev) => ({
  me: st.me, players: st.players, name: (id) => st.players.find((p) => p.id === id)?.name ?? '?',
  color: (id) => COLORS[st.players.findIndex((p) => p.id === id)] ?? 'var(--muted)',
  send: (type, data) => { window.sent.push([type, data]); return Promise.resolve(); }, esc, result: st.view.result ?? null,
  upload: async () => ({}), imageUrl: () => ${JSON.stringify(PLACEHOLDER)},
  now: () => Date.now(), refresh: () => {}, live: { send() {}, on() { return () => {}; } },
  prev, first: prev === null, signal: ctrl.signal, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
const el = document.getElementById('game');
if (st.prev) mod.render(el, st.prev, api(null));
mod.render(el, st.view, api(st.prev ?? null));
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
    if (url.pathname === '/globals.css') return serve(res, path.join(ROOT, 'app/globals.css'));
    if (url.pathname.startsWith('/fonts/')) return serve(res, path.join(ROOT, 'node_modules/@fontsource-variable', url.pathname.slice(7)));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
}

export async function shot(game, G, state, { me = state.players[0].id, prev = null, file, width = 360, height = 800, wait = 1600, reduced = false, inspect, act, before } = {}) {
  await start();
  const players = state.players.map(({ id, name }) => ({ id, name }));
  const see = (s) => (G.view ? G.view(s, me) : s);
  current = { game, view: see(state), prev: prev ? see(prev) : null, me, players };
  browser ??= await loadPlaywright().chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: true,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (before) await before(page); // vor dem Laden, z.B. fremde Seiten umleiten (instagram-ersatz.cjs)
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.ready, null, { timeout: 5000 }).catch(() => errors.push('render() ist nicht fertig geworden'));
  if (act) await act(page); // z.B. einen Knopf antippen, bevor das Foto entsteht
  await new Promise((r) => setTimeout(r, wait));
  if (file) await page.screenshot({ path: file, fullPage: true });
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  const seen = inspect ? await page.evaluate(inspect) : undefined;
  await ctx.close();
  return { errors, scroll, ...(inspect ? { seen } : {}) };
}

export async function close() {
  await browser?.close();
  browser = null;
  server?.close();
  server = null;
}
