// Ganze Partie Cabo im echten Spielzimmer mit Karten-Tippen (groessen.cjs drückt nur Knöpfe mit data-action).
//   node .claude/skills/spiel-testen/cabo-spielen.cjs <spieler> [ordner]   (Server auf Port 3100, siehe SKILL.md)
// Muster für andere Spiele mit antippbaren Karten oder Feldern: Phase lesen, antippbare Elemente und freie Knöpfe sammeln, passend wählen.
const { start, sleep } = require('/home/user/Games/.claude/skills/spiel-testen/zwei-spieler.cjs');
const D = process.argv[3] || require('os').tmpdir() + '/cabo-spielen';
require('fs').mkdirSync(D, { recursive: true });
const pick = (a) => a[Math.floor(Math.random() * a.length)];
(async () => {
  const n = Number(process.argv[2] || 3);
  const { browser, pages, tv, errors } = await start({ game: 'cabo', players: n, screen: n > 2, options: ['Bis fünfzig Punkte'] });
  let shots = 0, moves = 0;
  const kinds = {};
  for (let step = 0; step < 900; step++) {
    if (await pages[0].$('#result')) break;
    let did = false;
    for (const [k, P] of pages.entries()) {
      const phase = await P.$eval('.cb', (e) => e.dataset.phase).catch(() => null);
      if (!phase) continue;
      const btns = await P.$$eval('.cb-bar button:not(:disabled)', (bs) => bs.map((b) => b.dataset.action));
      const cards = await P.$$eval('.cb-card.can:not(.wait)', (cs) => cs.map((c) => `.cb-seat[data-who="${c.dataset.who}"] .cb-card[data-slot="${c.dataset.slot}"]`));
      const mineCards = await P.$$eval('.cb-me .cb-card.can', (cs) => cs.length);
      let action = null;
      if (phase === 'merken') { if (cards.length) action = ['card', cards[0]]; else if (btns.includes('bereit')) action = ['btn', 'bereit']; }
      else if (phase === 'pause') { if (k === 0 && btns.includes('weiter')) action = ['btn', 'weiter']; }
      else if (phase === 'zug' && btns.length) action = ['btn', Math.random() < 0.08 && btns.includes('cabo') ? 'cabo' : Math.random() < 0.3 && btns.includes('nehmen') ? 'nehmen' : 'ziehen'];
      else if (phase === 'entscheiden' && (btns.length || cards.length)) {
        if (btns.includes('tauschen')) action = ['btn', 'tauschen'];
        else if (btns.includes('ablegen') && Math.random() < 0.5) action = ['btn', 'ablegen'];
        else if (cards.length) action = ['card', pick(cards)];
      } else if (phase === 'aktion' && btns.includes('auslassen')) {
        action = Math.random() < 0.15 || !cards.length ? ['btn', 'auslassen'] : ['card', pick(cards)];
      } else if (phase === 'schauen' && btns.includes('fertig')) action = ['btn', 'fertig'];
      if (!action) continue;
      kinds[phase] = (kinds[phase] || 0) + 1;
      if (action[0] === 'btn') await P.click(`.cb-bar [data-action="${action[1]}"]`).catch((e) => console.log('klick', e.message.slice(0, 80)));
      else await P.click(action[1], { timeout: 2000 }).catch((e) => console.log('karte', e.message.slice(0, 80)));
      moves++; did = true;
      if (moves % 25 === 0 && shots < 8) {
        await sleep(300);
        await P.screenshot({ path: `${D}/${n}-p${k}-${moves}.png`, fullPage: true });
        if (tv) await tv.screenshot({ path: `${D}/${n}-tv-${moves}.png` });
        shots++;
      }
      await sleep(250);
    }
    if (!did) await sleep(700);
  }
  await sleep(2500);
  await pages[0].screenshot({ path: `${D}/${n}-ende.png`, fullPage: true });
  if (tv) await tv.screenshot({ path: `${D}/${n}-tv-ende.png` });
  console.log(n, 'Züge', moves, kinds, 'Ergebnis', await pages[0].$eval('#result', (e) => e.textContent).catch(() => 'keins'));
  console.log('Fehler', errors);
  if (tv) console.log('tv scroll', await tv.evaluate(() => [document.documentElement.scrollHeight, innerHeight]));
  console.log('seitlich', await pages[0].evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
  await browser.close();
})();
