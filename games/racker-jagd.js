// Racker-Jagd: Wer findet auf Instagram den besten Racker?
//
// Ablauf: Zeit wählen (5, 10, 15 Minuten oder unbegrenzt) → jeder schickt bis zu drei Screenshots (geheim,
// der andere sieht nur die Anzahl) → gemeinsam Bild für Bild bewerten, abwechselnd, immer bewertet
// der andere von eins bis zehn → Auflösung: Es zählt nur das bestbewertete Bild jedes Spielers,
// bei Gleichstand das zweitbeste, dann das drittbeste.
//
// Plattform-Funktionen: game.upload/game.imageUrl für die Screenshots, tick() und game.now()
// für das Zeitlimit, notices() für passende Benachrichtigungen.
//
// Motion: Die Zeitwahl baut sich gestaffelt auf, eingeschickte Bilder fallen wie Polaroids in
// ihren Platz, die verdeckten Karten des anderen drehen sich herein, beim Bewerten fliegt das
// bewertete Bild weg und das nächste kommt herein, am Ende landen die Wertungen wie Stempel
// und das zählende Bild wird eingekreist.

export const meta = {
  name: 'Racker-Jagd',
  description: 'Findet auf Instagram den besten Racker. Der andere bewertet.',
  players: [2, 2],
};

const MAX = 3; // Einsendungen pro Spieler
const TIMES = [5, 10, 15, 0]; // Minuten; 0 = unbegrenzt: bewertet wird erst, wenn beide fertig sind
const GRACE = 10_000; // ms nach Ablauf: Bilder, die gerade hochgeladen werden, kommen noch an
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn'];
const word = (n) => WORDS[n] ?? String(n);

const limited = (s) => s.deadline !== null; // false: ohne Zeitlimit

const otherOf = (s, id) => s.players.find((p) => p.id !== id).id;
const nameOf = (s, id) => s.players.find((p) => p.id === id).name;

export function setup(players) {
  return {
    players,
    phase: 'zeit', // zeit → suchen → bewerten → ende
    minutes: null,
    startedAt: null,
    deadline: null,
    entries: Object.fromEntries(players.map((p) => [p.id, []])), // [{ id, w, h }]
    done: Object.fromEntries(players.map((p) => [p.id, false])),
    order: [], // beim Bewerten: [{ owner, id, w, h, rating }]
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
      const list = s.entries[player];
      const id = String(data?.id ?? '');
      if (!ID.test(id)) throw new Error('Das Bild ist nicht angekommen. Bitte nochmal senden.');
      if (s.players.some((p) => s.entries[p.id].some((e) => e.id === id))) return;
      if (list.length >= MAX) throw new Error('Du hast schon drei Bilder. Entferne erst eins.');
      const size = (v) => Math.min(10_000, Math.max(1, Math.round(Number(v) || 1)));
      list.push({ id, w: size(data.w), h: size(data.h) });
      if (list.length === MAX) s.done[player] = true;
      return maybeStartReview(s);
    }
    case 'entfernen': {
      if (s.phase !== 'suchen' || (limited(s) && now > s.deadline)) throw new Error('Die Zeit ist um.');
      const list = s.entries[player];
      const i = list.findIndex((e) => e.id === data);
      if (i < 0) return;
      list.splice(i, 1);
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
      if (item.owner === player) throw new Error('Dein eigenes Bild bewertet der andere.');
      const n = Number(data.n);
      if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Bitte eine Zahl von eins bis zehn.');
      item.rating = n;
      s.index++;
      if (s.index >= s.order.length) finish(s);
      return;
    }
  }
}

// Zeit abgelaufen (plus Nachfrist für laufende Uploads)? Dann wird bewertet.
export function tick(s, now) {
  if (s.phase === 'suchen' && limited(s) && now >= s.deadline + GRACE) startReview(s);
}

function maybeStartReview(s) {
  if (s.players.every((p) => s.done[p.id])) startReview(s);
}

// Abwechselnd: Bild 1 von A, Bild 1 von B, Bild 2 von A … Wer anfängt, wird ausgelost.
function startReview(s) {
  const [a, b] = Math.random() < 0.5 ? s.players : [s.players[1], s.players[0]];
  s.order = [];
  for (let i = 0; i < MAX; i++) {
    for (const p of [a, b]) {
      const e = s.entries[p.id][i];
      if (e) s.order.push({ owner: p.id, ...e, rating: null });
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

// Jeder Spieler: Wertungen absteigend. Verglichen wird erst das beste Bild, dann das zweitbeste …
const ratingsOf = (s, id) =>
  s.order
    .filter((o) => o.owner === id)
    .map((o) => o.rating)
    .sort((x, y) => y - x);

function finish(s) {
  s.phase = 'ende';
  const [ra, rb] = s.players.map((p) => ratingsOf(s, p.id));
  const decider = [0, 1, 2].find((i) => (ra[i] ?? 0) !== (rb[i] ?? 0));
  if (decider === undefined) {
    s.result = { winners: [], text: 'Unentschieden. Alle Bilder gleich gut.' };
    return;
  }
  const w = (ra[decider] ?? 0) > (rb[decider] ?? 0) ? 0 : 1;
  const [winner, loser] = w === 0 ? s.players : [s.players[1], s.players[0]];
  const [best, other] = w === 0 ? [ra[0], rb[0]] : [rb[0], ra[0]];
  let text;
  if (other === undefined) text = `${winner.name} gewinnt, ${loser.name} hat kein Bild geschickt.`;
  else if (decider === 0) text = `${winner.name} gewinnt, ${word(best)} zu ${word(other)}.`;
  else text = `${winner.name} gewinnt. Gleiche Bestnote, das ${decider === 1 ? 'zweitbeste' : 'drittbeste'} Bild entscheidet.`;
  s.result = { winners: [winner.id], text };
}

export function waitingFor(s) {
  if (s.phase === 'zeit') return s.players.map((p) => p.id);
  if (s.phase === 'suchen') return s.players.filter((p) => !s.done[p.id]).map((p) => p.id);
  if (s.phase === 'bewerten') return [otherOf(s, s.order[s.index].owner)];
  return [];
}

// Benachrichtigungen: nur, wenn es wirklich etwas zu tun gibt (nicht bei jedem Bild des anderen).
export function notices(s, before, player) {
  if (before.phase === 'zeit' && s.phase === 'suchen') {
    const time = s.minutes ? `Ihr habt ${word(s.minutes)} Minuten.` : 'Ihr habt unbegrenzt Zeit.';
    return [{ to: otherOf(s, player), text: `${nameOf(s, player)} hat die Suche gestartet. ${time}` }];
  }
  if (before.phase === 'suchen' && s.phase === 'bewerten') {
    return s.players.map((p) => ({ to: p.id, text: 'Die Suche ist vorbei. Jetzt wird bewertet.' }));
  }
  if (s.phase === 'suchen' && s.done[player] && !before.done[player] && !(limited(s) && Date.now() >= s.deadline)) {
    return [{ to: otherOf(s, player), text: `${nameOf(s, player)} ist fertig mit Suchen.` }];
  }
  if (s.phase === 'bewerten' && s.index !== before.index) {
    return [{ to: otherOf(s, s.order[s.index].owner), text: 'Du bist dran mit Bewerten.' }];
  }
  return [];
}

// Geheim bis zur Auflösung: die Bilder des anderen (nur die Anzahl), Bilder, die beim Bewerten
// noch nicht dran waren, und die Wertungen der eigenen Bilder.
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
        if (o.owner === me) return { ...o, rating: null, rated: o.rating !== null };
        if (i > s.index) return { owner: o.owner, id: null, w: null, h: null, rating: null };
        return o;
      }),
    };
  }
  return s;
}

// ---------- Anzeige (nur im Browser) ----------

const TILT = [-2.2, 1.6, -0.8];
const ui = new WeakMap(); // pro Spielfeld: Countdown, Upload, Zuschnitt (überlebt neues Zeichnen)

function local(el, game) {
  let u = ui.get(el);
  if (!u || u.signal !== game.signal) {
    u = { signal: game.signal, timer: null, busy: false, editor: null, autoDone: false, lastRefresh: 0 };
    ui.set(el, u);
    game.signal.addEventListener('abort', () => {
      clearInterval(u.timer);
      u.editor?.close();
    });
  }
  return u;
}

export function render(el, s, game) {
  const u = local(el, game);
  clearInterval(u.timer);
  u.timer = null;

  let root = el.querySelector(':scope > .rj');
  if (!root) {
    el.innerHTML = '<div class="rj"><div class="rj-main"></div><div class="rj-editor" hidden></div></div>';
    root = el.firstElementChild;
  }
  const main = root.querySelector('.rj-main');
  if (s.phase !== 'suchen') u.editor?.close();

  if (s.phase === 'zeit') renderTime(main, s, game);
  else if (s.phase === 'suchen') renderSearch(root, main, s, game, u);
  else if (s.phase === 'bewerten') renderReview(main, s, game);
  else renderFinal(main, s, game);
}

const marker = (game, id) => `<span class="marker" style="color:${game.color(id)}"></span>`;

// --- Zeit wählen ---

// Unendlich-Schleife für „unbegrenzt“: einmal die volle Linie, darüber ein Strich, der beim Suchen umläuft
const LOOP = 'M50 25 C 40 10, 14 8, 12 25 C 10 42, 40 40, 50 25 C 60 10, 86 8, 88 25 C 90 42, 60 40, 50 25 Z';
const ENDLESS = `<svg class="rj-inf" viewBox="0 0 100 50" aria-hidden="true"><path class="rj-inf-base" pathLength="1" d="${LOOP}"/><path class="rj-inf-run" pathLength="1" d="${LOOP}"/></svg>`;

function renderTime(main, s, game) {
  const intro = game.first ? 'intro' : '';
  main.innerHTML = `
    <p class="status rj-lead">Wie lange sucht ihr? Wer zuerst wählt, startet die Suche für beide.</p>
    <div class="rj-times">
      ${TIMES.map(
        (m, i) => `
        <button class="rj-time ${intro}" style="--i:${i}" data-action="zeit" data-value="${m}">
          ${m ? `<span class="rj-time-num">${m}</span><span class="rj-time-unit">Minuten</span>` : `${ENDLESS}<span class="rj-time-unit">Unbegrenzt</span>`}
        </button>`,
      ).join('')}
    </div>
    <ol class="rj-rules ${intro}">
      <li>Sucht auf Instagram einen richtig guten Racker und schickt ihn als Screenshot.</li>
      <li>Jeder hat bis zu drei Einsendungen.</li>
      <li>Danach bewertet ihr abwechselnd die Bilder des anderen, von eins bis zehn.</li>
      <li>Es zählt nur euer bestbewertetes Bild.</li>
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

function renderSearch(root, main, s, game, u) {
  const e = game.esc;
  const me = game.me;
  const them = otherOf(s, me);
  const mine = s.entries[me];
  const theirCount = s.counts[them];
  const before = game.prev?.phase === 'suchen' ? game.prev : null;
  const knownIds = new Set((before?.entries[me] ?? []).map((x) => x.id));
  const prevCount = before ? before.counts[them] : game.first ? 0 : theirCount;
  const timeUp = limited(s) && game.now() >= s.deadline;
  const done = s.done[me];
  const theirName = e(game.name(them));

  const slots = Array.from({ length: MAX }, (_, i) => {
    const item = mine[i];
    if (item) {
      const fresh = !knownIds.has(item.id) && (before || game.first);
      return `
        <figure class="rj-card rj-slot ${fresh ? 'enter' : ''}" style="--tilt:${TILT[i]}deg">
          <div class="rj-pic"><img src="${e(game.imageUrl(item.id))}" width="${item.w}" height="${item.h}" alt="Dein Racker Nummer ${i + 1}"></div>
          ${timeUp ? '' : `<button type="button" class="link rj-remove" data-action="entfernen" data-value="${e(item.id)}">Entfernen</button>`}
        </figure>`;
    }
    if (i === mine.length && !timeUp) {
      return `
        <label class="rj-slot rj-add ${u.busy ? 'busy' : ''}" style="--tilt:${TILT[i]}deg">
          <input type="file" accept="image/*" class="rj-file">
          <span class="rj-pic">
            <span class="rj-add-idle">${PLUS}<span>Screenshot wählen</span></span>
            <span class="rj-add-busy"><span>Wird gesendet</span><i class="rj-busy-bar"></i></span>
          </span>
        </label>`;
    }
    return `<div class="rj-slot rj-empty" style="--tilt:${TILT[i]}deg"><span class="rj-pic"><span class="rj-slot-num">${i + 1}</span></span></div>`;
  }).join('');

  const backs = Array.from({ length: MAX }, (_, i) =>
    i < theirCount
      ? `<div class="rj-back ${i >= prevCount ? 'enter' : ''}" style="--c:${game.color(them)};--tilt:${TILT[i]}deg">${BACK}</div>`
      : '<div class="rj-back rj-back-empty"></div>',
  ).join('');

  let note;
  if (timeUp) note = 'Die Zeit ist um. Gleich wird bewertet.';
  else if (done) note = `Du bist fertig. Sobald ${theirName} auch fertig ist, wird bewertet.`;
  else if (!mine.length) note = 'Such auf Instagram einen Racker, mach einen Screenshot und lade ihn hier hoch.';
  else note = `Nur dein bestes Bild zählt. Du kannst noch ${word(MAX - mine.length)} schicken.`;

  const actions = timeUp
    ? ''
    : done
      ? '<button class="link" data-action="weitersuchen">Doch weitersuchen</button>'
      : '<button class="btn primary" data-action="fertig">Fertig</button>';

  const theirNote = s.done[them]
    ? `${theirName} ist fertig.`
    : theirCount
      ? `${theirName} hat ${word(theirCount)} von drei eingeschickt.`
      : `${theirName} sucht noch.`;
  const newDone = s.done[them] && before && !before.done[them];

  const total = s.deadline - s.startedAt;
  const left = Math.max(0, s.deadline - game.now());
  const clockIntro = game.first || game.prev?.phase === 'zeit' ? 'intro' : '';
  main.innerHTML = `
    ${
      limited(s)
        ? `<div class="rj-clock ${clockIntro} ${timeUp ? 'over' : ''}">
            <div class="rj-clock-row">
              <span class="rj-clock-num" aria-hidden="true">${clock(left)}</span>
              <span class="rj-clock-label">${timeUp ? 'Zeit um' : 'übrig'}</span>
            </div>
            <div class="rj-bar"><i style="animation-duration:${total}ms;animation-delay:-${total - left}ms;--left:${left / total}"></i></div>
          </div>`
        : `<div class="rj-clock rj-endless ${clockIntro}">
            <div class="rj-clock-row">${ENDLESS}<span class="rj-clock-label">Ohne Zeitlimit</span></div>
          </div>`
    }
    <div class="rj-body">
      <section class="rj-mine">
        <h3 class="rj-who">${marker(game, me)} Deine Racker</h3>
        <div class="rj-slots">${slots}</div>
        <p class="status rj-note">${note}</p>
        ${actions ? `<div class="row">${actions}</div>` : ''}
      </section>
      <section class="rj-theirs">
        <h3 class="rj-who">${marker(game, them)} ${theirName} ${s.done[them] ? `<span class="rj-done ${newDone ? 'enter' : ''}">fertig</span>` : ''}</h3>
        <div class="rj-backs">${backs}</div>
        <p class="muted rj-note">${theirNote}</p>
      </section>
    </div>`;

  main.querySelector('.rj-file')?.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (file) openEditor(root, file, s, game, u);
  });

  // Countdown: zeigt die Serverzeit, schickt bei null „fertig“ und fragt nach Ablauf der Nachfrist nach.
  if (!limited(s)) return;
  const num = main.querySelector('.rj-clock-num');
  const bar = main.querySelector('.rj-bar i');
  let shown = num.textContent;
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
      // Zeit gerade abgelaufen: Ansicht ohne Upload-Knöpfe, und wer nichts mehr hochlädt, ist fertig.
      if (!done && !u.busy && !u.autoDone) {
        u.autoDone = true;
        game.send('fertig');
      }
      if (!u.busy) {
        u.editor?.close();
        render(root.parentElement, s, { ...game, prev: s, first: false });
      }
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

// --- Zuschneiden und hochladen ---

function setBusy(root, u, busy) {
  u.busy = busy;
  root.querySelector('.rj-add')?.classList.toggle('busy', busy);
}

function openEditor(root, file, s, game, u) {
  u.editor?.close();
  const box = root.querySelector('.rj-editor');
  const url = URL.createObjectURL(file);
  box.hidden = false;
  root.classList.add('editing');
  box.innerHTML = `
    <p class="status">Zieh den Rahmen auf den Racker.</p>
    <div class="rj-crop">
      <img class="rj-crop-img" alt="Dein Screenshot" draggable="false">
      <div class="rj-veil"><i></i></div>
      <div class="rj-crop-box">
        <i class="rj-h" data-h="nw"></i><i class="rj-h" data-h="ne"></i><i class="rj-h" data-h="sw"></i><i class="rj-h" data-h="se"></i>
      </div>
    </div>
    <p class="bad rj-crop-error" role="alert" hidden></p>
    <div class="row">
      <button type="button" class="btn primary rj-send" disabled>Senden</button>
      <button type="button" class="link rj-full">Ganzes Bild</button>
      <button type="button" class="link rj-cancel">Abbrechen</button>
    </div>`;
  const img = box.querySelector('.rj-crop-img');
  const area = box.querySelector('.rj-crop');
  const frame = box.querySelector('.rj-crop-box');
  const hole = box.querySelector('.rj-veil i');
  const sendBtn = box.querySelector('.rj-send');
  const error = box.querySelector('.rj-crop-error');
  const MIN = 0.12;
  let r = { x: 0, y: 0, w: 1, h: 1 }; // Ausschnitt in Anteilen des Bildes
  let drag = null;

  const place = () => {
    const pos = { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` };
    Object.assign(frame.style, pos);
    Object.assign(hole.style, pos);
  };
  const close = () => {
    URL.revokeObjectURL(url);
    box.hidden = true;
    box.replaceChildren();
    root.classList.remove('editing');
    u.editor = null;
  };
  u.editor = { close };

  img.onload = () => {
    // Vorschlag: volle Breite im Hochformat 4:5 (so groß sind Instagram-Fotos), mittig
    const h = Math.min(1, (img.naturalWidth * 1.25) / img.naturalHeight);
    r = { x: 0, y: (1 - h) / 2, w: 1, h };
    place();
    sendBtn.disabled = false;
  };
  img.onerror = () => {
    error.hidden = false;
    error.textContent = 'Das Bild konnte nicht geöffnet werden. Bitte einen Screenshot wählen.';
  };
  img.src = url;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  area.addEventListener('pointerdown', (ev) => {
    if (!img.naturalWidth || u.busy) return;
    const rect = area.getBoundingClientRect();
    const px = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
    const handle = ev.target.closest('.rj-h')?.dataset.h;
    const inside = ev.target.closest('.rj-crop-box');
    drag = { mode: handle ?? (inside ? 'move' : 'new'), px, py, r0: { ...r }, rect };
    area.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  area.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const { rect, r0, mode } = drag;
    const px = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
    const dx = px - drag.px;
    const dy = py - drag.py;
    if (mode === 'move') {
      r = { ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) };
    } else if (mode === 'new') {
      const x = Math.min(px, drag.px);
      const y = Math.min(py, drag.py);
      r = { x, y, w: Math.max(Math.abs(dx), MIN), h: Math.max(Math.abs(dy), MIN) };
      r.x = clamp(r.x, 0, 1 - r.w);
      r.y = clamp(r.y, 0, 1 - r.h);
    } else {
      let { x, y, w, h } = r0;
      if (mode.includes('w')) {
        x = clamp(r0.x + dx, 0, r0.x + r0.w - MIN);
        w = r0.x + r0.w - x;
      } else {
        w = clamp(r0.w + dx, MIN, 1 - r0.x);
      }
      if (mode.includes('n')) {
        y = clamp(r0.y + dy, 0, r0.y + r0.h - MIN);
        h = r0.y + r0.h - y;
      } else {
        h = clamp(r0.h + dy, MIN, 1 - r0.y);
      }
      r = { x, y, w, h };
    }
    place();
  });
  const stop = () => (drag = null);
  area.addEventListener('pointerup', stop);
  area.addEventListener('pointercancel', stop);

  box.querySelector('.rj-cancel').addEventListener('click', close);
  box.querySelector('.rj-full').addEventListener('click', () => {
    r = { x: 0, y: 0, w: 1, h: 1 };
    place();
  });
  sendBtn.addEventListener('click', async () => {
    if (limited(s) && game.now() > s.deadline) {
      close();
      return;
    }
    // Ausschnitt in voller Auflösung auf ein Canvas zeichnen; game.upload verkleinert und verschickt es.
    const canvas = document.createElement('canvas');
    const sx = Math.round(r.x * img.naturalWidth);
    const sy = Math.round(r.y * img.naturalHeight);
    canvas.width = Math.max(1, Math.round(r.w * img.naturalWidth));
    canvas.height = Math.max(1, Math.round(r.h * img.naturalHeight));
    canvas.getContext('2d').drawImage(img, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    sendBtn.disabled = true;
    sendBtn.textContent = 'Wird gesendet …';
    error.hidden = true;
    setBusy(root, u, true);
    let uploaded;
    try {
      uploaded = await game.upload(canvas);
    } catch (err) {
      // Zuschnitt bleibt offen, damit man es gleich nochmal versuchen kann
      setBusy(root, u, false);
      error.hidden = false;
      error.textContent = err.message;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Senden';
      return;
    }
    close();
    await game.send('einsenden', { id: uploaded.id, w: uploaded.width, h: uploaded.height });
    setBusy(root, u, false);
    if (limited(s) && game.now() >= s.deadline) game.send('fertig');
  });
}

// --- Gemeinsam bewerten ---

const SCRIBBLE = '<svg class="rj-wait" viewBox="0 0 120 16" aria-hidden="true"><path pathLength="1" d="M2 10 C 12 2, 20 2, 26 9 S 40 15, 48 8 S 62 2, 70 9 S 84 15, 92 8 S 108 3, 118 8"/></svg>';

function bigCard(s, game, item, cls, stamp = '') {
  const e = game.esc;
  const mineCard = item.owner === game.me;
  return `
    <figure class="rj-card rj-big ${cls}" style="--c:${game.color(item.owner)}">
      <img src="${e(game.imageUrl(item.id))}" width="${item.w}" height="${item.h}" alt="${mineCard ? 'Dein Racker' : `Racker von ${e(game.name(item.owner))}`}">
      <figcaption>${marker(game, item.owner)} ${mineCard ? 'Dein Racker' : `Von ${e(game.name(item.owner))}`}</figcaption>
      ${stamp}
    </figure>`;
}

function renderReview(main, s, game) {
  const e = game.esc;
  const item = s.order[s.index];
  const rater = otherOf(s, item.owner);
  const iRate = rater === game.me;
  const prev = game.prev;
  const moved = prev?.phase === 'bewerten' && prev.index < s.index;
  const intro = !moved && prev?.phase !== 'bewerten';

  let leaving = '';
  if (moved) {
    const old = s.order[prev.index];
    const stamp = old.rating
      ? `<span class="rj-stamp" style="--c:${game.color(old.owner)}"><b>${old.rating}</b></span>`
      : '<span class="rj-stamp rj-stamp-word">bewertet</span>';
    leaving = bigCard(s, game, old, 'leave', stamp);
  }

  const dots = s.order
    .map((o, i) => `<li class="${i < s.index ? 'done' : i === s.index ? 'now' : ''}" style="--c:${game.color(o.owner)};--i:${i}"></li>`)
    .join('');

  const scale = Array.from({ length: 10 }, (_, k) => {
    const n = k + 1;
    return `<button class="rj-score" style="--i:${k}" data-action="bewerten" data-value='{"i":${s.index},"n":${n}}'>${n}</button>`;
  }).join('');

  main.innerHTML = `
    <div class="rj-progress ${intro ? 'intro' : ''}">
      <span class="muted">Bild ${word(s.index + 1)} von ${word(s.order.length)}</span>
      <ol class="rj-dots" aria-hidden="true">${dots}</ol>
    </div>
    <div class="rj-stage">
      ${leaving}
      ${bigCard(s, game, item, intro ? 'intro' : moved ? 'next' : '')}
    </div>
    ${
      iRate
        ? `<p class="status rj-ask" data-new>Wie gut ist der Racker von ${e(game.name(item.owner))}?</p>
           <div class="rj-scale ${intro || moved ? 'intro' : ''}" style="--c:${game.color(game.me)}">${scale}</div>`
        : `<p class="status rj-ask" data-new>${e(game.name(rater))} bewertet deinen Racker.</p>${SCRIBBLE}`
    }`;

  // Sofortige Rückmeldung beim Tippen, bis die Antwort vom Server da ist
  main.querySelectorAll('.rj-score').forEach((b) =>
    b.addEventListener('click', () => {
      b.classList.add('picked');
      main.querySelector('.rj-scale').classList.add('locked');
    }),
  );
  main.querySelector('.rj-stage .leave')?.addEventListener('animationend', (ev) => ev.currentTarget.remove(), {
    signal: game.signal,
  });
}

// --- Auflösung ---

const RING = '<svg class="rj-ring" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M58 9 C 30 6, 8 24, 9 50 C 10 76, 32 93, 55 91 C 80 89, 94 70, 92 46 C 90 24, 72 9, 44 12"/></svg>';

function renderFinal(main, s, game) {
  const e = game.esc;
  const play = !game.prev?.result;
  let n = 0; // fortlaufend über beide Spalten, für die Staffelung
  const cols = s.players
    .map((p) => {
      // Absteigend nach Wertung; bei gleicher Wertung zählt das zuerst gezeigte Bild
      const items = s.order.filter((o) => o.owner === p.id).sort((a, b) => b.rating - a.rating);
      const won = s.result.winners.includes(p.id);
      const cards = items
        .map((o, k) => {
          const j = n++;
          return `
            <figure class="rj-card rj-res ${k === 0 ? 'best' : ''}" style="--j:${j}">
              <img src="${e(game.imageUrl(o.id))}" width="${o.w}" height="${o.h}" alt="Racker von ${e(game.name(p.id))}, ${o.rating} von zehn">
              ${k === 0 && won ? '<span class="rj-frame" aria-hidden="true"></span>' : ''}
              <span class="rj-stamp"><b>${o.rating}</b>${k === 0 ? RING : ''}</span>
            </figure>`;
        })
        .join('');
      return `
        <section class="rj-col ${won ? 'won' : ''}" style="--c:${game.color(p.id)}">
          <h3 class="rj-who">${marker(game, p.id)} ${e(game.name(p.id))}${p.id === game.me ? ' <small class="muted">du</small>' : ''}</h3>
          ${items.length ? `<div class="rj-gallery">${cards}</div>` : '<p class="muted">Kein Bild eingeschickt.</p>'}
        </section>`;
    })
    .join('');
  main.innerHTML = `<div class="rj-final ${play ? 'play' : ''}">${cols}</div>`;
}

export const style = `
  .rj { display: grid; gap: 20px; }
  .rj-main { display: grid; gap: 24px; min-width: 0; }
  .rj-editor { display: grid; gap: 14px; }
  .rj.editing .rj-body { display: none; }
  .rj-who { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 800; font-size: var(--t-lg); line-height: 1.1; margin-bottom: 12px; }
  .rj-who small { font-family: var(--font-body); font-weight: 400; font-size: var(--t-sm); }
  .rj-note { margin-top: 12px; max-width: 46ch; }
  .rj-mine .row { margin-top: 14px; }

  /* Polaroid: Papier mit breitem unterem Rand, leicht schräg */
  .rj-card, .rj-slot {
    position: relative; margin: 0;
    background: var(--paper); border: 1px solid var(--hairline); border-radius: var(--radius);
    padding: 6px 6px 28px;
    transform: rotate(var(--tilt, 0deg));
  }
  .rj-pic { display: block; position: relative; aspect-ratio: 4 / 5; overflow: hidden; background: var(--wash); }
  .rj-pic img { display: block; width: 100%; height: 100%; object-fit: cover; }

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
  .rj-empty { border-style: dashed; border-color: var(--hairline); }
  .rj-empty .rj-pic { background: none; display: grid; place-items: center; }
  .rj-slot-num { font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); color: var(--hairline); }
  .rj-add { cursor: pointer; border: 2px dashed var(--ink); transition: background-color 140ms ease-out, transform 140ms cubic-bezier(.2,.8,.2,1); }
  .rj-add:hover { background: var(--wash); }
  .rj-add:active { transform: rotate(var(--tilt)) scale(.96); }
  .rj-add:focus-within { outline: 2px solid var(--ink); outline-offset: 3px; }
  .rj-add .rj-pic { background: none; display: grid; place-items: center; text-align: center; font-size: var(--t-sm); font-weight: 700; line-height: 1.2; padding: 6px; }
  .rj-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
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

  /* ---- Verdeckte Karten des anderen ---- */
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

  /* ---- Zuschneiden ---- */
  .rj-crop { position: relative; width: fit-content; max-width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; cursor: crosshair; }
  .rj-crop-img { display: block; max-width: 100%; max-height: 62vh; width: auto; height: auto; pointer-events: none; }
  /* Weißer Schleier außerhalb des Rahmens, auf das Bild begrenzt (die Griffe dürfen überstehen) */
  .rj-veil { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .rj-veil i { position: absolute; box-shadow: 0 0 0 100vmax rgba(255, 255, 255, .74); }
  .rj-crop-box { position: absolute; outline: 2px solid var(--ink); cursor: move; }
  .rj-h { position: absolute; width: 16px; height: 16px; background: var(--ink); }
  .rj-h::before { content: ''; position: absolute; inset: -14px; }
  .rj-h[data-h="nw"] { left: -8px; top: -8px; cursor: nwse-resize; }
  .rj-h[data-h="ne"] { right: -8px; top: -8px; cursor: nesw-resize; }
  .rj-h[data-h="sw"] { left: -8px; bottom: -8px; cursor: nesw-resize; }
  .rj-h[data-h="se"] { right: -8px; bottom: -8px; cursor: nwse-resize; }

  /* ---- Bewerten ---- */
  .rj-progress { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .rj-dots { display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .rj-dots li { width: 10px; height: 10px; border: 1.5px solid var(--hairline); border-radius: 1px; }
  .rj-dots li.done { background: var(--c); border-color: var(--c); }
  .rj-dots li.now { border-color: var(--c); border-width: 2.5px; }
  .rj-progress.intro li { animation: rj-rise 260ms cubic-bezier(.2,.8,.2,1) calc(var(--i) * 60ms) both; }
  .rj-stage { position: relative; }
  .rj-big { width: fit-content; max-width: min(100%, 380px); --tilt: -1deg; }
  .rj-big img { display: block; max-width: 100%; max-height: min(46vh, 460px); width: auto; height: auto; background: var(--wash); }
  .rj-big figcaption { position: absolute; left: 8px; bottom: 5px; font-size: var(--t-sm); font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .rj-big.intro { animation: rj-deal 520ms cubic-bezier(.2,.8,.2,1) both; }
  .rj-big.next { animation: rj-next 440ms cubic-bezier(.2,.8,.2,1) 120ms both; }
  .rj-big.leave { position: absolute; left: 0; top: 0; z-index: 1; pointer-events: none; animation: rj-leave 460ms cubic-bezier(.6,0,.2,1) both; }
  .rj-ask { font-weight: 700; }
  .rj-ask[data-new] { animation: rj-rise 260ms cubic-bezier(.2,.8,.2,1) both; }
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
  .rj-col { min-width: 0; }
  .rj-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 16px; max-width: 360px; }
  .rj-res img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; background: var(--wash); }
  .rj-res.best { grid-column: 1 / -1; --tilt: -1.2deg; }
  .rj-res.best img { aspect-ratio: auto; max-height: 52vh; object-fit: contain; }
  .rj-res:not(.best) { --tilt: 1.4deg; }
  .rj-res:not(.best) img { opacity: .4; }
  .rj-res:not(.best) .rj-stamp { min-width: 40px; height: 40px; font-size: var(--t-xl); }
  .rj-ring { position: absolute; inset: -14px; width: calc(100% + 28px); height: calc(100% + 28px); overflow: visible; }
  .rj-ring path { fill: none; stroke: var(--c); stroke-width: 4; stroke-linecap: round; }
  .rj-frame { position: absolute; inset: -5px; border: 3px solid var(--c); border-radius: var(--radius-m); pointer-events: none; }

  .rj-final.play .rj-res { animation: rj-deal 420ms cubic-bezier(.2,.8,.2,1) calc(var(--j) * 70ms) both; }
  .rj-final.play .rj-res:not(.best) img { animation: rj-dim 400ms ease-out 1000ms both; }
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
