// Racker-Jagd: Wer findet auf Instagram den besten Racker?
//
// Ablauf: Zeit wählen (5, 10, 15 Minuten oder unbegrenzt) → jeder schickt bis zu drei Links zu Instagram-Beiträgen
// (geheim, die anderen sehen nur die Anzahl) → gemeinsam Beitrag für Beitrag bewerten, reihum, alle anderen geben
// gleichzeitig eins bis zehn (geheim, bis alle bewertet haben), der Beitrag bekommt den Durchschnitt →
// Auflösung: Es zählt nur der bestbewertete Racker jedes Spielers, bei Gleichstand der zweitbeste, dann
// der drittbeste. Zwei bis sechs Spieler.
//
// Instagram: Im Zustand steht nur die Kennung des Beitrags (code) und ob es ein Reel ist. Angezeigt wird er
// mit Instagrams eigener Einbettung (iframe auf instagram.com/p/<code>/embed/), ohne API-Schlüssel, nur
// öffentliche Beiträge. Ein iframe lädt neu, sobald es aus dem DOM genommen wird: Die Anzeige baut deshalb
// jede Phase einmal auf und ändert danach nur die Teile, die sich wirklich geändert haben.
//
// Plattform-Funktionen: tick() und game.now() für das Zeitlimit, notices() für passende Benachrichtigungen.
//
// Motion: Die Zeitwahl baut sich gestaffelt auf, eingeschickte Beiträge fallen wie Polaroids in
// ihren Platz, die verdeckten Karten des anderen drehen sich herein, beim Bewerten fliegt der
// bewertete Beitrag weg und der nächste kommt herein, am Ende landen die Wertungen wie Stempel
// und der zählende Racker wird eingekreist.

export const meta = {
  name: 'Racker-Jagd',
  description: 'Findet auf Instagram den besten Racker. Die anderen bewerten.',
  players: [2, 6],
};

const MAX = 3; // Einsendungen pro Spieler
const TIMES = [5, 10, 15, 0]; // Minuten; 0 = unbegrenzt: bewertet wird erst, wenn alle fertig sind
const GRACE = 10_000; // ms nach Ablauf: Links, die gerade unterwegs sind, kommen noch an
const CODE = /^[A-Za-z0-9_-]{5,64}$/; // Kennung eines Beitrags
const HOST = /^(?:www\.|m\.)?(?:instagram\.com|instagr\.am)$/i;
const KIND = { p: 'p', tv: 'p', reel: 'reel', reels: 'reel' }; // Pfad im Link → Art des Beitrags
const WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn'];
const word = (n) => WORDS[n] ?? String(n);

const limited = (s) => s.deadline !== null; // false: ohne Zeitlimit

const nameOf = (s, id) => s.players.find((p) => p.id === id).name;
const ratersOf = (s, item) => s.players.map((p) => p.id).filter((id) => id !== item.owner);
const votesOf = (item) => item.votes ?? {}; // fehlt in Partien von vor den Gruppen
// Wertung als Zahl mit Komma (Durchschnitt, eine Nachkommastelle)
const fmtRating = (n) => String(n).replace('.', ',');
const ratingWord = (n) => (Number.isInteger(n) ? word(n) : `${word(Math.floor(n))} Komma ${word(Math.round((n % 1) * 10))}`);

// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
function list(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

// Link zu einem Beitrag oder Reel → { code, kind }. Versteht auch Links ohne https://, mit Benutzername
// (instagram.com/name/p/…) und mit Text drumherum, wie ihn die App beim Teilen mitschickt.
function parseLink(text) {
  const t = String(text ?? '').trim().slice(0, 2000);
  if (!t) throw new Error('Füg zuerst einen Link ein.');
  const m = t.match(/(?:https?:\/\/)?[\w.-]*(?:instagram\.com|instagr\.am)[^\s]*/i);
  const notInstagram = new Error('Das ist kein Link zu Instagram.');
  if (!m) throw notInstagram;
  const raw = m[0].replace(/[.,;:!?)\]}>"'»«“”]+$/, '');
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw notInstagram;
  }
  if (!HOST.test(url.hostname)) throw notInstagram;
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((x, i) => i < 2 && Object.hasOwn(KIND, x.toLowerCase()));
  if (at >= 0 && CODE.test(parts[at + 1] ?? '')) return { code: parts[at + 1], kind: KIND[parts[at].toLowerCase()] };
  if (parts[0]?.toLowerCase() === 'stories') throw new Error('Storys lassen sich nicht zeigen. Nimm einen Beitrag oder ein Reel.');
  throw new Error('Der Link führt zu keinem Beitrag. Tipp in Instagram beim Beitrag auf „Teilen“ und dann auf „Link kopieren“.');
}

export function setup(players) {
  return {
    players,
    phase: 'zeit', // zeit → suchen → bewerten → ende
    minutes: null,
    startedAt: null,
    deadline: null,
    entries: Object.fromEntries(players.map((p) => [p.id, []])), // [{ code, kind }]
    done: Object.fromEntries(players.map((p) => [p.id, false])),
    order: [], // beim Bewerten: [{ owner, code, kind, rating, votes }]
    index: 0,
  };
}

export function action(s, { player, type, data }) {
  const now = Date.now();
  switch (type) {
    case 'zeit': {
      if (s.phase !== 'zeit') return;
      if (!TIMES.includes(data)) throw new Error('Bitte fünf, zehn, fünfzehn Minuten oder unbegrenzt wählen.');
      Object.assign(s, { phase: 'suchen', minutes: data, startedAt: now, deadline: data ? now + data * 60_000 : null });
      return;
    }
    case 'einsenden': {
      if (s.phase !== 'suchen' || (limited(s) && now > s.deadline + GRACE)) throw new Error('Die Zeit ist um.');
      const mine = s.entries[player];
      const post = parseLink(data?.link);
      if (mine.some((e) => e.code === post.code)) return; // doppelt gesendet
      if (s.players.some((p) => s.entries[p.id].some((e) => e.code === post.code))) {
        throw new Error('Diesen Racker hat schon jemand anders gefunden. Such dir einen anderen.');
      }
      if (mine.length >= MAX) throw new Error('Du hast schon drei Racker eingeschickt. Entferne erst einen.');
      mine.push(post);
      if (mine.length === MAX) s.done[player] = true;
      return maybeStartReview(s);
    }
    case 'entfernen': {
      if (s.phase !== 'suchen' || (limited(s) && now > s.deadline)) throw new Error('Die Zeit ist um.');
      const mine = s.entries[player];
      const i = mine.findIndex((e) => e.code === String(data));
      if (i < 0) return;
      mine.splice(i, 1);
      s.done[player] = false;
      return;
    }
    case 'fertig':
      if (s.phase !== 'suchen') return;
      s.done[player] = true;
      return maybeStartReview(s);
    case 'weitersuchen':
      if (s.phase !== 'suchen') return;
      if (limited(s) && now > s.deadline) throw new Error('Die Zeit ist um.');
      s.done[player] = false;
      return;
    case 'bewerten': {
      if (s.phase !== 'bewerten' || data?.i !== s.index) return; // doppelt getippt: zählt nur einmal
      const item = s.order[s.index];
      if (item.owner === player) {
        throw new Error(s.players.length > 2 ? 'Deinen eigenen Racker bewerten die anderen.' : 'Deinen eigenen Racker bewertet der andere.');
      }
      if (votesOf(item)[player]) return;
      const n = Number(data.n);
      if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Bitte eine Zahl von eins bis zehn.');
      item.votes = { ...votesOf(item), [player]: n };
      const raters = ratersOf(s, item);
      if (!raters.every((id) => item.votes[id])) return;
      // Alle haben bewertet: Durchschnitt mit einer Nachkommastelle
      item.rating = Math.round((raters.reduce((sum, id) => sum + item.votes[id], 0) / raters.length) * 10) / 10;
      s.index++;
      if (s.index >= s.order.length) finish(s);
      return;
    }
  }
}

// Einsendung aus der Zeit vor den Links (Screenshot mit id statt code)
const screenshot = (x) => x?.id !== undefined && x.code === undefined;

export function tick(s, now) {
  // Laufende Partien mit Screenshots fangen neu an; fertige zeigt render() noch mit ihren Bildern.
  if (Object.values(s.entries ?? {}).flat().some(screenshot) || s.order.some(screenshot)) return setup(s.players);
  // Zeit abgelaufen (plus Nachfrist für Links, die unterwegs sind)? Dann wird bewertet.
  if (s.phase === 'suchen' && limited(s) && now >= s.deadline + GRACE) startReview(s);
}

function maybeStartReview(s) {
  if (s.players.every((p) => s.done[p.id])) startReview(s);
}

// Reihum: Racker 1 von A, Racker 1 von B, …, Racker 2 von A … Die Reihenfolge der Spieler wird ausgelost.
function startReview(s) {
  const players = [...s.players];
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  s.order = [];
  for (let i = 0; i < MAX; i++) {
    for (const p of players) {
      const e = s.entries[p.id][i];
      if (e) s.order.push({ owner: p.id, ...e, rating: null, votes: {} });
    }
  }
  s.entries = null; // ab jetzt steht alles in order (und view() verrät nur, was dran war)
  s.phase = 'bewerten';
  s.index = 0;
  if (!s.order.length) {
    s.phase = 'ende';
    s.result = { winners: [], text: 'Niemand hat einen Racker gefunden.' };
  }
}

// Jeder Spieler: Wertungen absteigend. Verglichen wird erst der beste Racker, dann der zweitbeste …
const ratingsOf = (s, id) =>
  s.order
    .filter((o) => o.owner === id)
    .map((o) => o.rating)
    .sort((x, y) => y - x);

function finish(s) {
  s.phase = 'ende';
  if (s.players.length > 2) return finishMany(s);
  const [ra, rb] = s.players.map((p) => ratingsOf(s, p.id));
  const decider = [0, 1, 2].find((i) => (ra[i] ?? 0) !== (rb[i] ?? 0));
  if (decider === undefined) {
    s.result = { winners: [], text: 'Unentschieden. Alle Racker gleich gut.' };
    return;
  }
  const w = (ra[decider] ?? 0) > (rb[decider] ?? 0) ? 0 : 1;
  const [winner, loser] = w === 0 ? s.players : [s.players[1], s.players[0]];
  const [best, other] = w === 0 ? [ra[0], rb[0]] : [rb[0], ra[0]];
  let text;
  if (other === undefined) text = `${winner.name} gewinnt, ${loser.name} hat keinen Racker geschickt.`;
  else if (decider === 0) text = `${winner.name} gewinnt, ${word(best)} zu ${word(other)}.`;
  else text = `${winner.name} gewinnt. Gleiche Bestnote, der ${decider === 1 ? 'zweitbeste' : 'drittbeste'} Racker entscheidet.`;
  s.result = { winners: [winner.id], text };
}

// Zu mehreren: wie zu zweit, nur über alle verglichen. Teilen sich mehrere den ersten Platz, gewinnen sie zusammen.
function finishMany(s) {
  const all = s.players.map((p) => ({ p, r: ratingsOf(s, p.id) }));
  const diff = (a, b) => [0, 1, 2].find((i) => (a.r[i] ?? 0) !== (b.r[i] ?? 0));
  const cmp = (a, b) => {
    const i = diff(a, b);
    return i === undefined ? 0 : (b.r[i] ?? 0) - (a.r[i] ?? 0);
  };
  const sorted = [...all].sort(cmp);
  const best = sorted.filter((x) => cmp(x, sorted[0]) === 0);
  if (best.length === all.length) {
    s.result = { winners: [], text: 'Unentschieden. Alle Racker gleich gut.' };
    return;
  }
  if (best.length > 1) {
    s.result = { winners: best.map((x) => x.p.id), text: `${list(best.map((x) => x.p.name))} teilen sich den Sieg.` };
    return;
  }
  const [w, second] = sorted;
  const decider = diff(w, second);
  const text =
    decider === 0
      ? `${w.p.name} gewinnt mit der besten Wertung, ${ratingWord(w.r[0])}.`
      : `${w.p.name} gewinnt. Gleiche Bestnote, der ${decider === 1 ? 'zweitbeste' : 'drittbeste'} Racker entscheidet.`;
  s.result = { winners: [w.p.id], text };
}

export function waitingFor(s) {
  if (s.phase === 'zeit') return s.players.map((p) => p.id);
  if (s.phase === 'suchen') return s.players.filter((p) => !s.done[p.id]).map((p) => p.id);
  if (s.phase === 'bewerten') {
    const item = s.order[s.index];
    return ratersOf(s, item).filter((id) => !votesOf(item)[id]);
  }
  return [];
}

// Benachrichtigungen: nur, wenn es wirklich etwas zu tun gibt (nicht bei jedem Link der anderen).
export function notices(s, before, player) {
  const others = s.players.map((p) => p.id).filter((id) => id !== player);
  if (before.phase === 'zeit' && s.phase === 'suchen') {
    const time = s.minutes ? `Ihr habt ${word(s.minutes)} Minuten.` : 'Ihr habt unbegrenzt Zeit.';
    return others.map((id) => ({ to: id, text: `${nameOf(s, player)} hat die Suche gestartet. ${time}` }));
  }
  if (before.phase === 'suchen' && s.phase === 'bewerten') {
    return s.players.map((p) => ({ to: p.id, text: 'Die Suche ist vorbei. Jetzt wird bewertet.' }));
  }
  if (s.phase === 'suchen' && s.done[player] && !before.done[player] && !(limited(s) && Date.now() >= s.deadline)) {
    return others.filter((id) => !s.done[id]).map((id) => ({ to: id, text: `${nameOf(s, player)} ist fertig mit Suchen.` }));
  }
  if (s.phase === 'bewerten' && s.index !== before.index) {
    return ratersOf(s, s.order[s.index]).map((id) => ({ to: id, text: 'Du bist dran mit Bewerten.' }));
  }
  return [];
}

// Geheim bis zur Auflösung: die Links der anderen (nur die Anzahl), Beiträge, die beim Bewerten
// noch nicht dran waren, die Wertungen der eigenen Racker und beim aktuellen Beitrag die Noten der anderen,
// bis alle bewertet haben (nur wer schon bewertet hat, steht in voted).
export function view(s, me) {
  if (s.result) return s;
  if (s.phase === 'suchen') {
    const counts = Object.fromEntries(s.players.map((p) => [p.id, s.entries[p.id].length]));
    return { ...s, entries: { [me]: s.entries[me] }, counts };
  }
  if (s.phase === 'bewerten') {
    return {
      ...s,
      order: s.order.map((o, i) => {
        const votes = votesOf(o);
        const voted = Object.keys(votes);
        if (o.owner === me) return { ...o, rating: null, votes: {}, voted, rated: o.rating !== null };
        if (i > s.index) return { owner: o.owner, code: null, kind: null, rating: null, votes: {}, voted: [] };
        if (i === s.index) return { ...o, votes: votes[me] ? { [me]: votes[me] } : {}, voted };
        return { ...o, voted };
      }),
    };
  }
  return s;
}

// ---------- Anzeige (nur im Browser) ----------

const TILT = [-2.2, 1.6, -0.8];
const ui = new WeakMap(); // pro Spielfeld: Countdown, Senden, eingebettete Beiträge (überlebt neues Zeichnen)

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, s: null, timer: null, sending: false, autoDone: false, lastRefresh: 0, frames: watchFrames(game) };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => clearInterval(u.timer));
  }
  return u;
}

// HTML nur setzen, wenn es sich geändert hat (Knöpfe, Eingaben und iframes bleiben sonst stehen). true = neu gesetzt.
const shownHtml = new WeakMap();
function put(el, html) {
  if (!el || shownHtml.get(el) === html) return false;
  shownHtml.set(el, html);
  el.innerHTML = html;
  return true;
}

export function render(el, s, game) {
  const u = local(el, game);
  u.s = s;
  clearInterval(u.timer);
  u.timer = null;

  let root = el.querySelector(':scope > .rj');
  if (!root) {
    el.innerHTML = '<div class="rj"><div class="rj-main"></div></div>';
    root = el.firstElementChild;
  }
  const main = root.querySelector('.rj-main');
  // Jede Phase wird einmal aufgebaut, danach nur noch geändert (sonst laden die Beiträge neu).
  const fresh = main.dataset.phase !== s.phase;
  if (fresh) {
    main.dataset.phase = s.phase;
    main.replaceChildren();
  }

  if (s.phase === 'zeit') renderTime(main, s, game, fresh);
  else if (s.phase === 'suchen') renderSearch(root, main, s, game, u, fresh);
  else if (s.phase === 'bewerten') renderReview(main, s, game, u, fresh);
  else renderFinal(main, s, game, u, fresh);
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;

// --- Eingebettete Instagram-Beiträge ---

// Gezeigt wird nur das Video bzw. Bild, ohne Profil, Likes und Kommentare. Instagram kann diese Teile nicht
// abschalten, also wird das iframe größer gezeichnet und so verschoben, dass nur das Medienfeld im Rahmen
// liegt (overflow: clip). Aufbau der Einbettung (Messungen anderer an echten Reels, von hier aus nicht
// prüfbar): oben eine Kopfzeile von 54 px, darunter ein Medienfeld Breite × 1,25 (4:5), in dem ein Reel
// im Format 9:16 eingepasst liegt. Sitzt der Ausschnitt daneben, nur diese Werte anpassen.
const IG_HEAD = 54;
const IG_MEDIA = 1.25;
const IG_TRIM = 2; // ringsum etwas mehr wegschneiden, damit keine Kante stehen bleibt
const IG_MIN = 326; // schmaler zeichnet Instagram die Einbettung nicht ordentlich
const IG_MAX = 540;
const igLink = (item) => `https://www.instagram.com/${item.kind === 'reel' ? 'reel' : 'p'}/${item.code}/`;
const igRatio = (item) => (item.kind === 'reel' ? '9 / 16' : '4 / 5');

// Lage des Videos (Reel) bzw. Bildes in einer Einbettung der Breite w
function igArea(kind, w) {
  const h = w * IG_MEDIA;
  const vw = kind === 'reel' ? (h * 9) / 16 : w;
  return { x: (w - vw) / 2 + IG_TRIM, y: IG_HEAD + IG_TRIM, w: vw - 2 * IG_TRIM, h: h - 2 * IG_TRIM };
}

// thumb: kleine Vorschau (nicht antippbar), sonst das Video zum Antippen und Abspielen.
function post(game, item, { thumb = false, label }) {
  const e = game.esc;
  if (screenshot(item)) {
    // Fertige Partie von vor den Links: Screenshot
    return `<div class="rj-ig rj-shot ${thumb ? 'thumb' : ''}"><img src="${e(game.imageUrl(item.id))}" alt="${e(label)}"></div>`;
  }
  return `
    <div class="rj-ig ${thumb ? 'thumb' : 'full'}" data-kind="${item.kind === 'reel' ? 'reel' : 'p'}" style="--ar:${igRatio(item)}">
      <iframe src="${e(igLink(item))}embed/" title="${e(label)}" scrolling="no" loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
        ${thumb ? 'tabindex="-1" aria-hidden="true"' : ''}></iframe>
    </div>`;
}

// Legt jedes iframe so in seinen Rahmen (ResizeObserver), dass das Medienfeld ihn ganz füllt.
function watchFrames(game) {
  const fit = (box) => {
    const frame = box.querySelector('iframe');
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    if (!frame || !bw || !bh) return;
    const kind = box.dataset.kind;
    // So breit zeichnen, dass das Video etwa in voller Größe ankommt (scharf), in Instagrams Grenzen
    const unit = igArea(kind, 1000);
    const w = Math.round(Math.min(IG_MAX, Math.max(IG_MIN, (bw * 1000) / unit.w, (bh * 1000) / unit.h)));
    const a = igArea(kind, w);
    const s = Math.max(bw / a.w, bh / a.h);
    const tx = bw / 2 - s * (a.x + a.w / 2);
    const ty = bh / 2 - s * (a.y + a.h / 2);
    frame.style.width = `${w}px`;
    frame.style.height = `${Math.ceil(IG_HEAD + w * IG_MEDIA + 260)}px`;
    frame.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
  };
  const ro = new ResizeObserver((entries) => entries.forEach((x) => fit(x.target)));
  game.signal.addEventListener('abort', () => ro.disconnect());
  return {
    // Neue Beiträge in area einmal einrichten
    mount(area) {
      area.querySelectorAll('.rj-ig:not([data-on])').forEach((box) => {
        box.dataset.on = '';
        fit(box);
        ro.observe(box);
      });
    },
  };
}

// --- Zeit wählen ---

// Unendlich-Schleife für „unbegrenzt“: einmal die volle Linie, darüber ein Strich, der beim Suchen umläuft
const LOOP = 'M50 25 C 40 10, 14 8, 12 25 C 10 42, 40 40, 50 25 C 60 10, 86 8, 88 25 C 90 42, 60 40, 50 25 Z';
const ENDLESS = `<svg class="rj-inf" viewBox="0 0 100 50" aria-hidden="true"><path class="rj-inf-base" pathLength="1" d="${LOOP}"/><path class="rj-inf-run" pathLength="1" d="${LOOP}"/></svg>`;

function renderTime(main, s, game, fresh) {
  if (!fresh) return;
  const intro = game.first ? 'intro' : '';
  main.innerHTML = `
    <p class="status rj-lead">Wie lange sucht ihr? Wer zuerst wählt, startet die Suche für ${s.players.length > 2 ? 'alle' : 'beide'}.</p>
    <div class="rj-times">
      ${TIMES.map(
        (m, i) => `
        <button class="rj-time ${intro}" style="--i:${i}" data-action="zeit" data-value="${m}">
          ${m ? `<span class="rj-time-num">${m}</span><span class="rj-time-unit">Minuten</span>` : `${ENDLESS}<span class="rj-time-unit">Unbegrenzt</span>`}
        </button>`,
      ).join('')}
    </div>
    <ol class="rj-rules ${intro}">
      <li>Sucht auf Instagram einen richtig guten Racker und schickt den Link zum Beitrag.</li>
      <li>Jeder hat bis zu drei Einsendungen.</li>
      <li>${s.players.length > 2 ? 'Danach bewertet ihr Beitrag für Beitrag die Racker der anderen, von eins bis zehn. Jeder Racker bekommt den Durchschnitt.' : 'Danach bewertet ihr abwechselnd die Racker des anderen, von eins bis zehn.'}</li>
      <li>Es zählt nur euer bestbewerteter Racker.</li>
    </ol>`;
}

// --- Suchen und einschicken ---

const PLUS = '<svg viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M20 8 V32"/><path pathLength="1" d="M8 20 H32"/></svg>';

// Rückseite einer verdeckten Einsendung: Rahmen und Schraffur in der Spielerfarbe
const BACK = `<svg viewBox="0 0 40 50" aria-hidden="true">
  <rect x="4" y="4" width="32" height="42" rx="1"/>
  <svg x="4" y="4" width="32" height="42" viewBox="0 0 32 42">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 6 - 30}" y1="44" x2="${i * 6 + 14}" y2="-2"/>`).join('')}
  </svg>
  <path class="rj-back-mark" d="M20 17 L27 25 L20 33 L13 25 Z"/>
</svg>`;

const LINK_FORM = `
  <form class="rj-link" novalidate>
    <label for="rj-link-input">Link zum Beitrag oder Reel</label>
    <div class="rj-link-row">
      <input id="rj-link-input" name="link" type="url" inputmode="url" autocomplete="off" autocapitalize="off"
        spellcheck="false" enterkeyhint="send" placeholder="instagram.com/p/…">
      <button class="btn" type="submit">Einschicken</button>
    </div>
    <p class="bad rj-link-error" role="alert" hidden></p>
  </form>`;

function clockHtml(s, game, intro) {
  if (!limited(s)) {
    return `<div class="rj-clock rj-endless ${intro}"><div class="rj-clock-row">${ENDLESS}<span class="rj-clock-label">Ohne Zeitlimit</span></div></div>`;
  }
  const total = s.deadline - s.startedAt;
  const left = Math.max(0, s.deadline - game.now());
  return `
    <div class="rj-clock ${intro}">
      <div class="rj-clock-row">
        <span class="rj-clock-num" aria-hidden="true">${clock(left)}</span>
        <span class="rj-clock-label">übrig</span>
      </div>
      <div class="rj-bar"><i style="animation-duration:${total}ms;animation-delay:-${total - left}ms;--left:${left / total}"></i></div>
    </div>`;
}

function slotHtml(game, item, i, kind, fresh) {
  const tilt = `--tilt:${TILT[i]}deg`;
  if (kind === 'item') {
    return `
      <figure class="rj-card rj-slot ${fresh ? 'enter' : ''}" style="${tilt}">
        <div class="rj-pic">${post(game, item, { thumb: true, label: `Dein Racker Nummer ${i + 1}` })}</div>
        <button type="button" class="link rj-remove" data-action="entfernen" data-value="${game.esc(JSON.stringify(item.code))}">Entfernen</button>
      </figure>`;
  }
  if (kind === 'add') {
    return `
      <button type="button" class="rj-slot rj-add" style="${tilt}">
        <span class="rj-pic">
          <span class="rj-add-idle">${PLUS}<span>Link einfügen</span></span>
          <span class="rj-add-busy"><span>Wird gesendet</span><i class="rj-busy-bar"></i></span>
        </span>
      </button>`;
  }
  return `<div class="rj-slot rj-empty" style="${tilt}"><span class="rj-pic"><span class="rj-slot-num">${i + 1}</span></span></div>`;
}

function renderSearch(root, main, s, game, u, fresh) {
  const e = game.esc;
  const me = game.me;
  const others = s.players.map((p) => p.id).filter((id) => id !== me);
  const mine = s.entries[me];
  const before = game.prev?.phase === 'suchen' ? game.prev : null;
  const timeUp = limited(s) && game.now() >= s.deadline;
  const done = s.done[me];

  if (fresh) {
    const intro = game.first || game.prev?.phase === 'zeit' ? 'intro' : '';
    main.innerHTML = `
      ${clockHtml(s, game, intro)}
      <div class="rj-body">
        <section class="rj-mine">
          <h3 class="rj-who">${marker(game, me)} Deine Racker</h3>
          <div class="rj-slots">${'<div></div>'.repeat(MAX)}</div>
          <div class="rj-adder"></div>
          <p class="status rj-note"></p>
          <div class="rj-actions"></div>
        </section>
        <div class="rj-others ${others.length > 1 ? 'many' : ''}"></div>
      </div>`;
  }

  const clk = main.querySelector('.rj-clock');
  if (limited(s)) {
    clk.classList.toggle('over', timeUp);
    clk.querySelector('.rj-clock-label').textContent = timeUp ? 'Zeit um' : 'übrig';
  }

  // Eigene Plätze: nur ersetzen, was sich geändert hat (die Vorschau ist ein iframe)
  const slots = main.querySelector('.rj-slots');
  const known = new Set((before?.entries[me] ?? []).map((x) => x.code));
  for (let i = 0; i < MAX; i++) {
    const item = mine[i];
    const kind = item ? 'item' : i === mine.length && !timeUp ? 'add' : 'empty';
    const key = item ? `item:${item.code}` : kind;
    let slot = slots.children[i];
    if (slot.dataset.key !== key) {
      const t = document.createElement('template');
      t.innerHTML = slotHtml(game, item, i, kind, item && !known.has(item.code) && (before || game.first)).trim();
      const next = t.content.firstElementChild;
      next.dataset.key = key;
      slot.replaceWith(next);
      slot = next;
      if (kind === 'add') slot.addEventListener('click', () => quickPaste(root, game, u));
    }
    slot.classList.toggle('locked', timeUp);
  }
  u.frames.mount(slots);

  // Eingabefeld für den Link: bleibt stehen, solange es gebraucht wird (getippter Text geht nicht verloren)
  const adder = main.querySelector('.rj-adder');
  if (put(adder, !timeUp && mine.length < MAX ? LINK_FORM : '')) {
    adder.querySelector('form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      submitLink(root, game, u);
    });
  }
  setBusy(root, u, u.sending);

  let note;
  if (timeUp) note = 'Die Zeit ist um. Gleich wird bewertet.';
  else if (done) {
    note = `Du bist fertig. Sobald ${others.length === 1 ? `${e(game.name(others[0]))} auch fertig ist` : 'alle fertig sind'}, wird bewertet.`;
  } else if (!mine.length) note = 'Such auf Instagram einen Racker, tipp beim Beitrag auf „Teilen“ und „Link kopieren“ und füg den Link hier ein.';
  else note = `Nur dein bester Racker zählt. Du kannst noch ${MAX - mine.length === 1 ? 'einen' : word(MAX - mine.length)} schicken.`;
  put(main.querySelector('.rj-note'), note);

  const actions = timeUp
    ? ''
    : done
      ? '<div class="row"><button class="link" data-action="weitersuchen">Doch weitersuchen</button></div>'
      : '<div class="row"><button class="btn primary" data-action="fertig">Fertig</button></div>';
  put(main.querySelector('.rj-actions'), actions);

  // Die anderen: verdeckte Karten, so viele wie eingeschickt
  const theirs = others
    .map((them) => {
      const count = s.counts[them];
      const prevCount = before ? before.counts[them] : game.first ? 0 : count;
      const name = e(game.name(them));
      const backs = Array.from({ length: MAX }, (_, i) =>
        i < count
          ? `<div class="rj-back ${i >= prevCount ? 'enter' : ''}" style="--c:${game.color(them)};--tilt:${TILT[i]}deg">${BACK}</div>`
          : '<div class="rj-back rj-back-empty"></div>',
      ).join('');
      const note_ = s.done[them] ? `${name} ist fertig.` : count ? `${name} hat ${word(count)} von drei eingeschickt.` : `${name} sucht noch.`;
      const newDone = s.done[them] && before && !before.done[them];
      return `
      <section class="rj-theirs">
        <h3 class="rj-who">${marker(game, them)} ${name} ${s.done[them] ? `<span class="rj-done ${newDone ? 'enter' : ''}">fertig</span>` : ''}</h3>
        <div class="rj-backs">${backs}</div>
        <p class="muted rj-note">${note_}</p>
      </section>`;
    })
    .join('');
  put(main.querySelector('.rj-others'), theirs);

  // Countdown: zeigt die Serverzeit, schickt bei null „fertig“ und fragt nach Ablauf der Nachfrist nach.
  if (!limited(s)) return;
  const total = s.deadline - s.startedAt;
  const num = main.querySelector('.rj-clock-num');
  const bar = main.querySelector('.rj-bar i');
  let shown = clock(Math.max(0, s.deadline - game.now()));
  num.textContent = shown;
  const update = () => {
    const now = game.now();
    const text = clock(Math.max(0, s.deadline - now));
    bar.style.setProperty('--left', Math.max(0, s.deadline - now) / total);
    if (text !== shown) {
      shown = text;
      num.textContent = text;
      if (s.deadline - now < 10_500 && !game.reducedMotion) {
        num.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    if (now >= s.deadline && !timeUp) {
      // Zeit gerade abgelaufen: Ansicht ohne Eingabe, und wer nichts mehr schickt, ist fertig.
      if (!done && !u.sending && !u.autoDone) {
        u.autoDone = true;
        // Ein getippter Link geht noch mit (Nachfrist), dann ist man fertig
        if (root.querySelector('.rj-link input')?.value.trim()) submitLink(root, game, u, true).finally(() => game.send('fertig'));
        else game.send('fertig');
      }
      if (!u.sending) render(root.parentElement, s, { ...game, prev: s, first: false });
    }
    if (now >= s.deadline + GRACE + 300 && now - u.lastRefresh > 2000) {
      u.lastRefresh = now;
      game.refresh();
    }
  };
  u.timer = setInterval(update, 250);
}

const clock = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

function setBusy(root, u, busy) {
  u.sending = busy;
  root.querySelector('.rj-add')?.classList.toggle('busy', busy);
  const form = root.querySelector('.rj-link');
  if (!form) return;
  form.classList.toggle('busy', busy);
  form.querySelector('.btn').disabled = busy;
  form.querySelector('input').readOnly = busy;
}

function showError(root, text) {
  const p = root.querySelector('.rj-link-error');
  if (!p) return;
  p.hidden = !text;
  p.textContent = text;
}

// Link aus dem Feld prüfen und einschicken. Fehler im Link zeigt das Spiel sofort, alles andere der Server.
// late: bei Ablauf der Zeit vom Countdown abgeschickt (der schickt danach selbst „fertig“).
async function submitLink(root, game, u, late = false) {
  const input = root.querySelector('.rj-link input');
  if (!input || u.sending) return;
  const s = u.s;
  if (!late && limited(s) && game.now() > s.deadline) return;
  let found;
  try {
    found = parseLink(input.value);
  } catch (err) {
    showError(root, err.message);
    return;
  }
  if (s.entries[game.me].some((x) => x.code === found.code)) {
    showError(root, 'Den hast du schon eingeschickt.');
    return;
  }
  showError(root, '');
  setBusy(root, u, true);
  const ok = await game.send('einsenden', { link: igLink(found) });
  if (game.signal.aborted) return;
  setBusy(root, u, false);
  const field = root.querySelector('.rj-link input');
  if (ok && field) field.value = '';
  if (!late && limited(u.s) && game.now() >= u.s.deadline) game.send('fertig');
}

// Plus-Feld: Link direkt aus der Zwischenablage nehmen; geht das nicht, ins Eingabefeld springen.
async function quickPaste(root, game, u) {
  const input = root.querySelector('.rj-link input');
  if (!input || u.sending) return;
  if (!navigator.clipboard?.readText) {
    input.focus();
    return;
  }
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    input.focus(); // nicht erlaubt: dann von Hand einfügen
    return;
  }
  if (game.signal.aborted) return;
  if (!/instagram\.com|instagr\.am/i.test(text)) {
    showError(root, 'In der Zwischenablage ist kein Link zu Instagram.');
    input.focus();
    return;
  }
  input.value = text.trim();
  submitLink(root, game, u);
}

// --- Gemeinsam bewerten ---

const NOUN = ['', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn'];
const SCRIBBLE = '<svg class="rj-wait" viewBox="0 0 120 16" aria-hidden="true"><path pathLength="1" d="M2 10 C 12 2, 20 2, 26 9 S 40 15, 48 8 S 62 2, 70 9 S 84 15, 92 8 S 108 3, 118 8"/></svg>';

function bigCard(s, game, i, cls) {
  const e = game.esc;
  const item = s.order[i];
  const mineCard = item.owner === game.me;
  return `
    <figure class="rj-card rj-big ${cls}" data-i="${i}" style="--c:${game.color(item.owner)};--ar:${igRatio(item)}">
      ${post(game, item, { label: mineCard ? 'Dein Racker' : `Racker von ${game.name(item.owner)}` })}
      <figcaption>${marker(game, item.owner)} ${mineCard ? 'Dein Racker' : `Von ${e(game.name(item.owner))}`}</figcaption>
    </figure>`;
}

function renderReview(main, s, game, u, fresh) {
  const e = game.esc;
  const item = s.order[s.index];
  const raters = ratersOf(s, item);
  const myVote = item.votes?.[game.me] ?? null;
  const iRate = raters.includes(game.me) && !myVote;
  const open = raters.filter((id) => !(item.voted ?? []).includes(id));
  const names = (ids) => list(ids.map((id) => e(game.name(id))));
  const prev = game.prev;
  const moved = prev?.phase === 'bewerten' && prev.index < s.index;
  const intro = !moved && prev?.phase !== 'bewerten';

  if (fresh) main.innerHTML = '<div class="rj-progress"></div><div class="rj-stage"></div><div class="rj-askbox"></div>';

  const progress = main.querySelector('.rj-progress');
  progress.classList.toggle('intro', intro);
  const dots = s.order
    .map((o, i) => `<li class="${i < s.index ? 'done' : i === s.index ? 'now' : ''}" style="--c:${game.color(o.owner)};--i:${i}"></li>`)
    .join('');
  put(progress, `<span class="muted">Racker ${word(s.index + 1)} von ${word(s.order.length)}</span><ol class="rj-dots" aria-hidden="true">${dots}</ol>`);

  // Bühne: Der bewertete Beitrag fliegt mit seinem Stempel weg (dasselbe Element, damit er nicht neu lädt),
  // der nächste kommt herein.
  const stage = main.querySelector('.rj-stage');
  const card = stage.querySelector('.rj-big:not(.leave)');
  if (card?.dataset.i !== String(s.index)) {
    if (card) {
      const old = s.order[Number(card.dataset.i)];
      if (moved && old && !game.reducedMotion) {
        const stamp = old.rating
          ? `<span class="rj-stamp" style="--c:${game.color(old.owner)}"><b>${fmtRating(old.rating)}</b></span>`
          : '<span class="rj-stamp rj-stamp-word">bewertet</span>';
        card.classList.remove('intro', 'next');
        card.classList.add('leave');
        card.insertAdjacentHTML('beforeend', stamp);
        const gone = () => card.remove();
        card.addEventListener('animationend', (ev) => ev.target === card && gone(), { signal: game.signal });
        setTimeout(gone, 900);
      } else card.remove();
    }
    stage.insertAdjacentHTML('beforeend', bigCard(s, game, s.index, intro ? 'intro' : moved ? 'next' : ''));
    u.frames.mount(stage);
    // Wer zum Bewerten nach unten gescrollt hat, sieht den neuen Beitrag
    const top = stage.getBoundingClientRect().top;
    if (moved && top < 0) window.scrollBy({ top: top - 16, behavior: game.reducedMotion ? 'auto' : 'smooth' });
  }

  const scale = Array.from({ length: 10 }, (_, k) => {
    const n = k + 1;
    return `<button class="rj-score ${myVote === n ? 'picked' : ''}" style="--i:${k}" data-action="bewerten" data-value='{"i":${s.index},"n":${n}}'>${n}</button>`;
  }).join('');
  const justVoted = myVote && prev?.phase === 'bewerten' && prev.index === s.index && !prev.order[s.index]?.votes?.[game.me];

  let ask;
  if (iRate) {
    ask = `<p class="status rj-ask">Wie gut ist der Racker von ${e(game.name(item.owner))}?</p>
           <div class="rj-scale" style="--c:${game.color(game.me)}">${scale}</div>`;
  } else if (myVote) {
    // Schon bewertet, die anderen noch nicht: eigene Note bleibt sichtbar
    ask = `<p class="status rj-ask">Du hast eine ${NOUN[myVote]} gegeben. Warte auf ${names(open)}.</p>
           <div class="rj-scale locked" style="--c:${game.color(game.me)}">${scale}</div>`;
  } else {
    const who = open.length === raters.length && raters.length > 1 ? 'Die anderen bewerten' : `${names(open)} ${open.length === 1 ? 'bewertet' : 'bewerten'}`;
    ask = `<p class="status rj-ask">${who} deinen Racker.</p>${SCRIBBLE}`;
  }
  // Knöpfe nur ersetzen, wenn sich die Frage ändert (nicht, wenn ein anderer bewertet)
  const askbox = main.querySelector('.rj-askbox');
  if (put(askbox, `<div data-i="${s.index}">${ask}</div>`)) {
    if (!justVoted) askbox.querySelector('.rj-ask').classList.add('new');
    if (iRate && (intro || moved)) askbox.querySelector('.rj-scale').classList.add('intro');
    // Sofortige Rückmeldung beim Tippen, bis die Antwort vom Server da ist
    askbox.querySelectorAll('.rj-score').forEach((b) =>
      b.addEventListener('click', () => {
        b.classList.add('picked');
        askbox.querySelector('.rj-scale').classList.add('locked');
      }),
    );
  }
}

// --- Auflösung ---

const RING = '<svg class="rj-ring" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M58 9 C 30 6, 8 24, 9 50 C 10 76, 32 93, 55 91 C 80 89, 94 70, 92 46 C 90 24, 72 9, 44 12"/></svg>';

function renderFinal(main, s, game, u, fresh) {
  if (!fresh) return; // ändert sich nicht mehr; neu bauen hieße alle Beiträge neu laden
  const e = game.esc;
  const play = !game.prev?.result;
  let n = 0; // fortlaufend über alle Spalten, für die Staffelung
  const cols = s.players
    .map((p) => {
      // Absteigend nach Wertung; bei gleicher Wertung zählt der zuerst gezeigte Beitrag
      const items = s.order.filter((o) => o.owner === p.id).sort((a, b) => b.rating - a.rating);
      const won = s.result.winners.includes(p.id);
      const cards = items
        .map((o, k) => {
          const j = n++;
          const label = `Racker von ${game.name(p.id)}, ${ratingWord(o.rating)} von zehn`;
          // Der beste ganz, die anderen als kleine Vorschau, die den Beitrag auf Instagram öffnet
          let body = post(game, o, { thumb: k > 0, label });
          if (k > 0 && !screenshot(o)) {
            body = `<a class="rj-open" href="${e(igLink(o))}" target="_blank" rel="noopener noreferrer" aria-label="${e(label)}, auf Instagram öffnen">${body}</a>`;
          }
          return `
            <figure class="rj-card rj-res ${k === 0 ? 'best' : ''}" style="--j:${j}">
              ${body}
              ${k === 0 && won ? '<span class="rj-frame" aria-hidden="true"></span>' : ''}
              <span class="rj-stamp"><b>${fmtRating(o.rating)}</b>${k === 0 ? RING : ''}</span>
            </figure>`;
        })
        .join('');
      return `
        <section class="rj-col ${won ? 'won' : ''}" style="--c:${game.color(p.id)}">
          <h3 class="rj-who">${marker(game, p.id)} ${e(game.name(p.id))}${p.id === game.me ? ' <small class="muted">du</small>' : ''}</h3>
          ${items.length ? `<div class="rj-gallery">${cards}</div>` : '<p class="muted">Keinen Racker eingeschickt.</p>'}
        </section>`;
    })
    .join('');
  main.innerHTML = `<div class="rj-final ${s.players.length > 2 ? 'many' : ''} ${play ? 'play' : ''}">${cols}</div>`;
  u.frames.mount(main);
}

export const style = `
  .rj { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
  /* minmax: Die iframes sind mindestens 326 px breit (verkleinert), das darf die Spalte nicht verbreitern */
  .rj-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; min-width: 0; }
  .rj-who { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1.1; margin-bottom: 12px; }
  .rj-who small { font-family: var(--font-body); font-weight: 400; font-size: var(--t-sm); }
  .rj-note { margin-top: 12px; max-width: 46ch; }
  .rj-actions .row { margin-top: 14px; }

  /* Polaroid: Papier mit breitem unterem Rand, leicht schräg */
  .rj-card, .rj-slot {
    position: relative; margin: 0;
    background: var(--paper); border: 1px solid var(--hairline); border-radius: var(--radius);
    padding: 6px 6px 28px;
    transform: rotate(var(--tilt, 0deg));
  }
  .rj-pic { display: block; position: relative; aspect-ratio: 9 / 16; overflow: hidden; background: var(--wash); }

  /* Eingebetteter Beitrag: Rahmen im Format des Videos, darin das verschobene iframe (siehe watchFrames).
     clip statt hidden: Fokus im iframe kann den Rahmen nicht scrollen und Profil oder Likes zeigen. */
  .rj-ig { position: relative; aspect-ratio: var(--ar, 4 / 5); overflow: hidden; overflow: clip; background: var(--wash); }
  .rj-ig iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; }
  .rj-pic > .rj-ig { width: 100%; height: 100%; aspect-ratio: auto; }
  .rj-ig.thumb iframe { pointer-events: none; }
  .rj-shot img { display: block; width: 100%; height: 100%; object-fit: cover; }

  /* ---- Zeit wählen ---- */
  .rj-lead { max-width: 40ch; }
  /* Feine Linien zwischen den Kacheln: Lücke von 1px auf Haarlinien-Grund */
  .rj-times {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: var(--hairline);
    border-top: 3px solid var(--line); border-bottom: 1px solid var(--line); max-width: 600px;
  }
  @media (max-width: 440px) { .rj-times { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .rj-time {
    display: grid; justify-items: center; align-content: end; gap: 2px; padding: 18px 4px 14px;
    border: 0; border-radius: 0; background: var(--paper); color: var(--ink); cursor: pointer;
    transition: background-color 140ms ease-out, transform 140ms cubic-bezier(.2,.8,.2,1);
  }
  .rj-time:hover { background: var(--wash); }
  .rj-time:active { transform: scale(.96); }
  .rj-time-num { font-family: var(--font-display); font-weight: 800; font-size: var(--t-4xl); line-height: .9; }
  .rj-time-unit { font-size: var(--t-sm); color: var(--muted); }
  .rj-inf { display: block; overflow: visible; }
  .rj-inf path { fill: none; stroke: var(--ink); stroke-width: 7; }
  .rj-time .rj-inf { width: 62px; height: calc(var(--t-4xl) * .9); }
  .rj-time .rj-inf-run { display: none; }
  .rj-time.intro .rj-inf-base { stroke-dasharray: 1; stroke-dashoffset: 1; animation: rj-draw 600ms cubic-bezier(.3,.7,.2,1) calc(200ms + var(--i) * 90ms) forwards; }
  .rj-time.intro { animation: rj-rise 380ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms) both; }
  .rj-rules { margin: 0; padding: 0; list-style: none; counter-reset: rj; display: grid; gap: 8px; max-width: 52ch; }
  .rj-rules li { counter-increment: rj; display: grid; grid-template-columns: 22px 1fr; gap: 8px; }
  .rj-rules li::before { content: counter(rj); font-family: var(--font-display); font-weight: 800; font-size: var(--t-md); line-height: 1.2; }
  .rj-rules.intro li { animation: rj-rise 320ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-rules.intro li:nth-child(1) { animation-delay: 300ms; }
  .rj-rules.intro li:nth-child(2) { animation-delay: 360ms; }
  .rj-rules.intro li:nth-child(3) { animation-delay: 420ms; }
  .rj-rules.intro li:nth-child(4) { animation-delay: 480ms; }

  /* ---- Uhr ---- */
  .rj-clock { border-top: 3px solid var(--line); padding-top: 8px; max-width: 520px; }
  .rj-clock-row { display: flex; align-items: baseline; gap: 10px; }
  .rj-clock-num { display: inline-block; font-family: var(--font-display); font-weight: 800; font-size: var(--t-3xl); line-height: 1; font-variant-numeric: tabular-nums; transform-origin: left 70%; }
  .rj-clock-label { color: var(--muted); }
  .rj-bar { height: 4px; margin-top: 10px; background: var(--hairline); overflow: hidden; }
  .rj-bar i { display: block; height: 100%; background: var(--ink); transform-origin: left; animation: rj-bar linear both; }
  .rj-clock.over .rj-bar i { animation: none; transform: scaleX(0); }
  .rj-clock.intro { animation: rj-rise 360ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-endless .rj-clock-row { align-items: center; gap: 14px; }
  .rj-endless .rj-inf { width: 84px; height: 42px; }
  .rj-endless .rj-inf-base { stroke: var(--hairline); stroke-width: 5; }
  .rj-endless .rj-inf-run { stroke-width: 7; stroke-dasharray: .2 .8; animation: rj-loop 2.8s linear infinite; }
  .rj-endless .rj-clock-label { font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); color: var(--ink); }
  @keyframes rj-loop { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes rj-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }

  /* ---- Eigene Einsendungen ---- */
  .rj-body { display: grid; gap: 28px; }
  .rj-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; max-width: 420px; }
  .rj-slot.enter { animation: rj-drop 420ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-remove { position: absolute; left: 0; right: 0; bottom: 4px; font-size: var(--t-sm); text-align: center; }
  .rj-slot.locked .rj-remove { display: none; }
  .rj-empty { border-style: dashed; border-color: var(--hairline); }
  .rj-empty .rj-pic { background: none; display: grid; place-items: center; }
  .rj-slot-num { font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); color: var(--hairline); }
  .rj-add {
    display: block; width: 100%; appearance: none; font: inherit; color: var(--ink); text-align: center;
    cursor: pointer; border: 2px dashed var(--ink);
    transition: background-color 140ms ease-out, transform 140ms cubic-bezier(.2,.8,.2,1);
  }
  .rj-add:hover { background: var(--wash); }
  .rj-add:active { transform: rotate(var(--tilt)) scale(.96); }
  .rj-add .rj-pic { background: none; display: grid; place-items: center; text-align: center; font-size: var(--t-sm); font-weight: 700; line-height: 1.2; padding: 6px; }
  .rj-add-idle { display: grid; justify-items: center; gap: 6px; }
  .rj-add svg { width: 34px; height: 34px; }
  .rj-add svg path { stroke: var(--ink); stroke-width: 3; fill: none; }
  .rj-add-busy { display: none; gap: 10px; justify-items: center; width: 100%; }
  .rj-add.busy { pointer-events: none; }
  .rj-add.busy .rj-add-idle { display: none; }
  .rj-add.busy .rj-add-busy { display: grid; }
  .rj-busy-bar { display: block; width: 70%; height: 3px; background: var(--hairline); overflow: hidden; position: relative; }
  .rj-busy-bar::after { content: ''; position: absolute; inset: 0; width: 40%; background: var(--ink); animation: rj-busy 900ms cubic-bezier(.6,0,.2,1) infinite; }
  @keyframes rj-busy { from { transform: translateX(-100%); } to { transform: translateX(260%); } }

  /* Link eingeben */
  .rj-link { display: grid; margin-top: 18px; max-width: 420px; }
  .rj-link-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .rj-link-row input { flex: 1 1 12em; }
  .rj-link-row .btn { flex: 0 0 auto; }
  .rj-link.busy input, .rj-link.busy .btn { opacity: .55; }
  .rj-link-error { margin-top: 8px; }
  .rj-link-error:not([hidden]) { animation: rj-rise 200ms cubic-bezier(.2,.8,.2,1) both; }

  /* ---- Verdeckte Karten des anderen ---- */
  .rj-others { display: grid; gap: 22px; }
  .rj-others.many { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px 20px; }
  .rj-others.many .rj-who { font-size: var(--t-md); margin-bottom: 8px; }
  .rj-others.many .rj-back { width: 40px; }
  .rj-others.many .rj-backs { gap: 8px; }
  .rj-others.many .rj-note { margin-top: 8px; font-size: var(--t-sm); }
  .rj-backs { display: flex; gap: 10px; perspective: 600px; }
  .rj-back { width: 56px; aspect-ratio: 4 / 5; transform: rotate(var(--tilt)); }
  .rj-back > svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .rj-back rect { fill: var(--paper); stroke: var(--c); stroke-width: 1.5; }
  .rj-back line { stroke: var(--c); stroke-width: 1.2; opacity: .35; }
  .rj-back .rj-back-mark { fill: var(--c); }
  .rj-back-empty { border: 1px dashed var(--hairline); border-radius: var(--radius); }
  .rj-back.enter { animation: rj-flip 460ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-done { font-family: var(--font-body); font-weight: 700; font-size: var(--t-sm); color: var(--paper); background: var(--ink); padding: 1px 6px; border-radius: var(--radius); display: inline-block; transform: rotate(-3deg); }
  .rj-done.enter { animation: rj-stamp-in 320ms cubic-bezier(.2,.8,.2,1) both; }

  /* ---- Bewerten ---- */
  .rj-progress { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .rj-dots { display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .rj-dots li { width: 10px; height: 10px; border: 1.5px solid var(--hairline); border-radius: 1px; }
  .rj-dots li.done { background: var(--c); border-color: var(--c); }
  .rj-dots li.now { border-color: var(--c); border-width: 2.5px; }
  .rj-progress.intro li { animation: rj-rise 260ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 60ms) both; }
  .rj-stage { position: relative; }
  /* Am PC so groß, dass das Video noch ganz ins Fenster passt */
  .rj-big { width: min(100%, 420px, calc((100svh - 170px) * var(--ar, 4 / 5) + 12px)); --tilt: -.6deg; }
  .rj-big figcaption { position: absolute; left: 8px; bottom: 5px; font-size: var(--t-sm); font-weight: 700; display: flex; align-items: center; gap: 6px; }
  /* Auf dem Handy über die ganze Breite, bis an den Rand */
  @media (max-width: 559px) {
    .rj-big {
      width: auto; padding: 0 0 34px; border: 0; border-radius: 0; --tilt: 0deg;
      margin-left: calc(-1 * max(16px, env(safe-area-inset-left)));
      margin-right: calc(-1 * max(16px, env(safe-area-inset-right)));
    }
    .rj-big figcaption { left: max(16px, env(safe-area-inset-left)); bottom: 6px; }
    .rj-big .rj-stamp { right: max(16px, env(safe-area-inset-right)); bottom: 48px; }
    .rj-big.leave { right: 0; } /* ohne feste Breite schrumpft die wegfliegende Karte sonst */
  }
  .rj-big.intro { animation: rj-deal 520ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-big.next { animation: rj-next 440ms cubic-bezier(.2,.8,.2,1) 120ms both; }
  .rj-big.leave { position: absolute; left: 0; top: 0; z-index: 1; pointer-events: none; animation: rj-leave 460ms cubic-bezier(.6,0,.2,1) both; }
  .rj-ask { font-weight: 700; }
  .rj-ask.new { animation: rj-rise 260ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-askbox > div { display: grid; gap: 14px; }
  .rj-scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); max-width: 560px; border-top: 3px solid var(--line); }
  @media (min-width: 560px) { .rj-scale { grid-template-columns: repeat(10, minmax(0, 1fr)); } }
  .rj-score {
    height: 60px; border: 0; border-bottom: 1px solid var(--hairline); border-radius: 0; background: none; color: var(--ink);
    font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); cursor: pointer;
    transition: background-color 140ms ease-out, color 140ms ease-out, transform 140ms cubic-bezier(.2,.8,.2,1);
  }
  .rj-score:hover { background: var(--wash); }
  .rj-score:active { transform: scale(.96); }
  .rj-score.picked { background: color-mix(in srgb, var(--c) 12%, white); color: var(--c); }
  .rj-scale.locked { pointer-events: none; }
  .rj-scale.locked .rj-score:not(.picked) { opacity: .35; }
  .rj-scale.intro .rj-score { animation: rj-rise 260ms cubic-bezier(.2,.8,.2,1) calc(240ms + var(--i) * 30ms) both; }
  .rj-wait { width: 120px; height: 16px; overflow: visible; }
  .rj-wait path { fill: none; stroke: var(--ink); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 1; animation: rj-scribble 1.8s cubic-bezier(.6,0,.2,1) infinite; }
  @keyframes rj-scribble { 0% { stroke-dashoffset: 1; } 55% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -1; } }

  /* Stempel mit der Wertung */
  .rj-stamp {
    position: absolute; right: -10px; bottom: -14px; z-index: 2;
    display: grid; place-items: center; min-width: 54px; height: 54px; padding: 0 6px;
    background: var(--paper); border: 2.5px solid var(--c, var(--ink)); border-radius: var(--radius-m);
    color: var(--c, var(--ink)); font-family: var(--font-display); font-weight: 800; font-size: var(--t-2xl); line-height: 1;
    transform: rotate(-6deg);
  }
  .rj-stamp-word { font-family: var(--font-body); font-size: var(--t-sm); height: auto; padding: 4px 8px; }

  /* ---- Auflösung ---- */
  .rj-final { display: grid; gap: 32px; }
  @media (min-width: 640px) { .rj-final { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .rj-who { min-width: 0; overflow-wrap: anywhere; }
  /* Zu mehreren: kleinere Galerien nebeneinander */
  .rj-final.many { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 30px 18px; }
  @media (min-width: 640px) { .rj-final.many { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .rj-final.many .rj-who { font-size: var(--t-md); margin-bottom: 8px; }
  .rj-final.many .rj-gallery { gap: 16px 10px; }
  .rj-final.many .rj-card { padding: 4px 4px 18px; }
  .rj-final.many .rj-stamp { right: -6px; bottom: -10px; min-width: 42px; height: 42px; font-size: var(--t-xl); }
  .rj-final.many .rj-res:not(.best) .rj-stamp { min-width: 30px; height: 30px; padding: 0 3px; font-size: var(--t-md); }
  .rj-col { min-width: 0; }
  .rj-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 16px; max-width: 360px; }
  .rj-res.best { grid-column: 1 / -1; --tilt: -1.2deg; }
  .rj-res:not(.best) { --tilt: 1.4deg; }
  .rj-res:not(.best) .rj-ig { opacity: .4; }
  .rj-res:not(.best) .rj-stamp { min-width: 40px; height: 40px; font-size: var(--t-xl); }
  .rj-open { display: block; transition: transform 140ms cubic-bezier(.2,.8,.2,1); }
  .rj-open:active { transform: scale(.96); }
  .rj-ring { position: absolute; inset: -14px; width: calc(100% + 28px); height: calc(100% + 28px); overflow: visible; }
  .rj-ring path { fill: none; stroke: var(--c); stroke-width: 4; stroke-linecap: round; }
  .rj-frame { position: absolute; inset: -5px; border: 3px solid var(--c); border-radius: var(--radius-m); pointer-events: none; }

  .rj-final.play .rj-res { animation: rj-deal 420ms cubic-bezier(.2,.8,.2,1) calc(var(--j) * 70ms) both; }
  .rj-final.play .rj-res:not(.best) .rj-ig { animation: rj-dim 400ms ease-out 1000ms both; }
  .rj-final.play .rj-stamp { animation: rj-stamp-in 300ms cubic-bezier(.2,.8,.2,1) calc(380ms + var(--j) * 90ms) both; }
  .rj-final.play .rj-ring path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: rj-draw 460ms cubic-bezier(.3,.7,.2,1) 900ms forwards; }
  .rj-final.play .rj-frame { animation: rj-frame 380ms cubic-bezier(.2,.8,.2,1) 1150ms both; }

  @keyframes rj-rise { from { opacity: 0; transform: translateY(8px); } }
  @keyframes rj-drop { from { opacity: 0; transform: translateY(-18px) rotate(calc(var(--tilt) - 7deg)) scale(1.06); } }
  @keyframes rj-flip { from { opacity: 0; transform: rotate(var(--tilt)) rotateY(90deg) translateY(-6px); } }
  @keyframes rj-deal { from { opacity: 0; transform: translateY(18px) rotate(calc(var(--tilt) + 4deg)) scale(.96); } }
  @keyframes rj-next { from { opacity: 0; transform: translateX(48px) rotate(4deg); } }
  @keyframes rj-leave { to { opacity: 0; transform: translateX(-70%) translateY(10px) rotate(-12deg); } }
  @keyframes rj-stamp-in { from { opacity: 0; transform: rotate(-18deg) scale(1.7); } }
  @keyframes rj-dim { from { opacity: 1; } to { opacity: .4; } }
  @keyframes rj-draw { to { stroke-dashoffset: 0; } }
  @keyframes rj-frame { from { opacity: 0; transform: scale(1.06); } }

  @media (prefers-reduced-motion: reduce) {
    .rj *, .rj *::after { animation: none !important; transition: none !important; }
    .rj-ring path, .rj-inf-base { stroke-dashoffset: 0 !important; }
    .rj-endless .rj-inf-run { display: none; }
    .rj-endless .rj-inf-base { stroke: var(--ink); }
    .rj-big.leave { display: none; }
    .rj-bar i { transform: scaleX(var(--left, 1)); }
  }
`;
