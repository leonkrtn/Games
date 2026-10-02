// Zwei Spieler im Browser (Skill „spiel-testen“): legt zwei Konten an, befreundet sie, öffnet das
// gemeinsame Spielzimmer und startet ein Spiel. Braucht einen laufenden Server (Standard: Port 3100).
//
//   const { start, sleep, touchDrag } = require('/home/user/Games/.claude/skills/spiel-testen/zwei-spieler.cjs');
//   const { browser, A, B, errors } = await start({ game: 'schiffe-versenken' });
//   const { A } = await start({ game: 'qwixx', options: ['Gemixxt', 'Eine Minute'] });   // Lobby-Einstellungen per Text
//   const { A } = await start({ game: 'flip-7', width: 1000, reduced: true });           // Desktop, ohne Bewegung

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

async function start({ game, options = [], base = 'http://localhost:3100', width = 360, height = 780, scale = 2, reduced = false } = {}) {
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
  const A = await player('Anna');
  const B = await player('Ben');
  const { inviteCode } = await api(A, '/api/account', { t: 'home' });
  await api(B, '/api/account', { t: 'friend-invite', code: inviteCode });
  const room = (await api(A, '/api/account', { t: 'home' })).friends[0].room;
  await A.goto(`${base}/?raum=${room}`);
  await B.goto(`${base}/?raum=${room}`);
  if (game) {
    await A.click(`[data-game="${game}"]`);
    // Spiele mit meta.options öffnen erst die Einstellungen, ohne starten sie sofort.
    if (await A.waitForSelector(`[data-start="${game}"]`, { timeout: 1500 }).catch(() => null)) {
      for (const label of options) await A.click(`.game-options label:has-text("${label}")`);
      await A.click(`[data-start="${game}"]`);
    }
    await A.waitForSelector('#game > *');
    await B.waitForSelector('#game > *', { timeout: 10000 }); // Testmodus: B fragt jede Sekunde nach
  }
  return { browser, A, B, room, errors, api: (page, body) => api(page, '/api/room', { room, ...body }) };
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

// Mitte eines Elements in Fensterkoordinaten, z.B. für touchDrag oder page.mouse
const center = (page, selector) =>
  page.$eval(selector, (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

module.exports = { start, sleep, touchDrag, center, loadPlaywright };
