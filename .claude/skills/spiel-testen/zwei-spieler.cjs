// Spieler im Browser (Skill „spiel-testen“): legt Konten an, befreundet sie, öffnet das gemeinsame
// Spielzimmer und startet ein Spiel. Ab drei Spielern gründet Anna eine Gruppe mit allen.
// Braucht einen laufenden Server (Standard: Port 3100).
//
//   const { start, sleep, touchDrag } = require('/home/user/Games/.claude/skills/spiel-testen/zwei-spieler.cjs');
//   const { browser, A, B, errors } = await start({ game: 'schiffe-versenken' });
//   const { A } = await start({ game: 'qwixx', options: ['Gemixxt', 'Eine Minute'] });   // Lobby-Einstellungen per Text
//   const { A } = await start({ game: 'flip-7', width: 1000, reduced: true });           // Desktop, ohne Bewegung
//   const { pages } = await start({ game: 'flip-7', players: 5 });                      // Gruppe: pages[0] = Anna …

const path = require('node:path');
const { execSync } = require('node:child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {}
  try {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  } catch {}
  throw new Error('Playwright fehlt. Installieren mit: npm i -g playwright && npx playwright install chromium');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(page, url, body) {
  return page.evaluate(
    async ([url, body]) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.json();
    },
    [url, body],
  );
}

const NAMES = ['Anna', 'Ben', 'Cem', 'Dora', 'Emil', 'Fiona'];

async function start({ game, options = [], players = 2, base = 'http://localhost:3100', width = 360, height = 780, scale = 2, reduced = false } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];
  const suffix = Date.now() % 100000;
  const player = async (name) => {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      hasTouch: true,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(base);
    const r = await api(page, '/api/account', { t: 'signup', username: name + suffix, password: 'geheim12345' });
    if (r.error) throw new Error(r.error);
    return page;
  };
  const pages = [];
  for (const name of NAMES.slice(0, players)) pages.push(await player(name));
  const [A, B] = pages;
  const { inviteCode } = await api(A, '/api/account', { t: 'home' });
  for (const p of pages.slice(1)) await api(p, '/api/account', { t: 'friend-invite', code: inviteCode });
  let room;
  if (players > 2) {
    const { friends } = await api(A, '/api/account', { t: 'home' });
    const r = await api(A, '/api/account', { t: 'group-create', name: 'Testgruppe', members: friends.map((f) => f.user.id) });
    if (r.error) throw new Error(r.error);
    room = r.room;
  } else {
    room = (await api(A, '/api/account', { t: 'home' })).friends[0].room;
  }
  for (const p of pages) await p.goto(`${base}/?raum=${room}`);
  if (game) {
    await A.click(`[data-game="${game}"]`);
    // Spiele mit meta.options öffnen erst die Einstellungen, ohne starten sie sofort.
    if (await A.waitForSelector(`[data-start="${game}"]`, { timeout: 1500 }).catch(() => null)) {
      for (const label of options) await A.click(`.game-options label:has-text("${label}")`);
      await A.click(`[data-start="${game}"]`);
    }
    await A.waitForSelector('#game > *');
    for (const p of pages.slice(1)) await p.waitForSelector('#game > *', { timeout: 10000 }); // Testmodus: fragt jede Sekunde nach
  }
  return { browser, A, B, pages, room, errors, api: (page, body) => api(page, '/api/room', { room, ...body }) };
}

// Echtes Ziehen mit dem Finger (Touch-Ereignisse über das DevTools-Protokoll). Anders als page.mouse
// prüft das auch touch-action: Scrollt die Seite statt zu ziehen, sieht man es an scrollY.
async function touchDrag(page, from, to, { steps = 12, hold = 0 } = {}) {
  const cdp = page._svCdp ?? (page._svCdp = await page.context().newCDPSession(page));
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await touch('touchStart', from);
  if (hold) await sleep(hold);
  for (let k = 1; k <= steps; k++) {
    await touch('touchMove', { x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps });
    await sleep(16);
  }
  await touch('touchEnd');
}

// Finger über mehrere Punkte ziehen (z.B. auf einer Malfläche): [{ x, y }, …], dazwischen `steps` Zwischenschritte
async function touchPath(page, points, { steps = 4 } = {}) {
  const cdp = page._svCdp ?? (page._svCdp = await page.context().newCDPSession(page));
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await touch('touchStart', points[0]);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    for (let k = 1; k <= steps; k++) {
      await touch('touchMove', { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
      await sleep(12);
    }
  }
  await touch('touchEnd');
}

// Mitte eines Elements in Fensterkoordinaten, z.B. für touchDrag oder page.mouse
const center = (page, selector) =>
  page.$eval(selector, (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

module.exports = { start, sleep, touchDrag, touchPath, center, loadPlaywright };
