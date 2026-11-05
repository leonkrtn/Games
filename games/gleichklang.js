// Gleichklang: Jeder schreibt geheim ein Wort. Aufgedeckt wird, wenn alle fertig sind. Dann sucht jeder
// geheim ein Wort, das die aufgedeckten Wörter verbindet, und so weiter, bis alle dasselbe Wort schreiben.
// Alle spielen zusammen: Gleichklang heißt, alle gewinnen. Ein Wort, das schon einmal aufgedeckt war, gilt
// nicht noch einmal. Verglichen wird ohne Groß- und Kleinschreibung, Umlaute, Bindestriche und Artikel.
//
// Anzeige: Jeder hat einen Stapel. Oben liegt sein zuletzt aufgedecktes Wort; wer geschrieben hat, bekommt
// eine verdeckte Karte dahinter. Beim Aufdecken drehen sich die neuen Karten nacheinander um, gleiche Wörter
// bekommen einen Stempel. Im Gleichklang gleiten alle Karten zu einem Stapel zusammen.
// Die Ansicht wird einmal pro Partie gebaut; danach ändern sich nur Bereiche, deren Inhalt anders ist, damit
// das Eingabefeld beim Tippen bleibt, wenn andere schreiben.
//
// Bildschirm (present): die Stapel groß, wer schon geschrieben hat, rechts die Leiter der bisherigen Runden.

export const meta = {
  name: 'Gleichklang',
  description: 'Jeder schreibt geheim ein Wort. Dann sucht ihr Wörter dazwischen, bis alle dasselbe schreiben.',
  players: [2, 6],
  options: [
    {
      id: 'runden',
      label: 'Runden',
      choices: [
        { value: 0, label: 'Bis es klappt' },
        { value: 10, label: 'Höchstens zehn' },
        { value: 6, label: 'Höchstens sechs' },
      ],
    },
  ],
};

const MAX_LEN = 30;
const WORD = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];
const UNITS = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
const word = (n) => WORD[n] ?? (n < 100 ? `${n % 10 ? `${UNITS[n % 10]}und` : ''}${TENS[Math.floor(n / 10)]}` : String(n));
const rounds = (n) => (n === 1 ? 'einer Runde' : `${word(n)} Runden`);

// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
function list(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

// Text, wie er gezeigt wird: Leerzeichen zusammengefasst, gekürzt
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);

// Zum Vergleichen: „Der Eis-Bär“ = „eisbaer“
export function norm(text) {
  return clean(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/^(der|die|das|den|dem|ein|eine|einen|the|a|an) (?=\S)/, '')
    .replace(/[^a-z0-9]/g, '');
}

const ids = (s) => s.players.map((p) => p.id);

export function setup(players, options = {}) {
  return {
    players,
    limit: [6, 10].includes(options.runden) ? options.runden : 0, // 0 = bis es klappt
    words: {}, // geheim: was jeder in dieser Runde geschrieben hat
    rounds: [], // aufgedeckt: { [id]: Wort }
  };
}

// Alle Wörter, die schon aufgedeckt waren (verglichen)
const usedSet = (s) => new Set(s.rounds.flatMap((r) => Object.values(r).map(norm)));

export function action(state, { player, type, data }) {
  if (!ids(state).includes(player)) throw new Error('Du spielst nicht mit.');
  if (state.result) return;

  if (type === 'wort') {
    const text = clean(data?.wort);
    const key = norm(text);
    if (state.words[player]) {
      if (norm(state.words[player]) === key) return; // doppelt abgeschickt
      throw new Error('Du hast schon ein Wort abgegeben. Zum Ändern erst „Ändern“ tippen.');
    }
    if (!key) throw new Error('Schreib ein Wort.');
    if (usedSet(state).has(key)) throw new Error(`„${text}“ war schon dran. Such ein neues Wort.`);
    state.words[player] = text;
    if (ids(state).every((id) => state.words[id])) reveal(state);
  } else if (type === 'zurueck') {
    delete state.words[player];
  } else if (type === 'aufgeben') {
    const name = state.players.find((p) => p.id === player).name;
    const n = state.rounds.length;
    state.words = {};
    state.result = {
      winners: [],
      gaveUp: player,
      text: n ? `${name} hat aufgegeben, nach ${rounds(n)} ohne Gleichklang.` : `${name} hat aufgegeben.`,
    };
  }
}

function reveal(state) {
  const round = Object.fromEntries(ids(state).map((id) => [id, state.words[id]]));
  state.rounds.push(round);
  state.words = {};
  const n = state.rounds.length;
  const keys = new Set(Object.values(round).map(norm));
  if (keys.size === 1) {
    const w = round[ids(state)[0]];
    state.result = {
      winners: ids(state),
      text: n === 1 ? `Gleich beim ersten Wort im Gleichklang: ${w}.` : `Gleichklang nach ${rounds(n)}: ${w}.`,
    };
  } else if (state.limit && n >= state.limit) {
    state.result = { winners: [], text: `Nach ${rounds(n)} noch kein Gleichklang.` };
  }
}

// Wer in dieser Runde noch nicht geschrieben hat
export function waitingFor(state) {
  return ids(state).filter((id) => !state.words[id]);
}

// Nachricht nur, wenn aufgedeckt wurde, und an den Letzten, auf den alle warten
export function notices(state, before) {
  if (state.result) return [];
  const all = ids(state);
  const name = (id) => state.players.find((p) => p.id === id).name;
  if (state.rounds.length > before.rounds.length) {
    const words = all.map((id) => state.rounds.at(-1)[id]);
    const text = all.length === 2
      ? `Aufgedeckt: ${words[0]} und ${words[1]}. Was verbindet beides?`
      : `Aufgedeckt: ${list(words)}. Was verbindet alles?`;
    return all.map((to) => ({ to, text }));
  }
  const open = all.filter((id) => !state.words[id]);
  const openBefore = all.filter((id) => !before.words[id]);
  if (open.length === 1 && openBefore.length > 1) {
    const others = all.filter((id) => id !== open[0]);
    return [{ to: open[0], text: others.length === 1 ? `${name(others[0])} ist fertig. Jetzt du.` : 'Alle anderen sind fertig. Jetzt du.' }];
  }
  return [];
}

// Die Wörter der laufenden Runde sieht nur, wer sie geschrieben hat.
export function view(state, me) {
  return { ...state, words: undefined, mine: state.words[me] ?? null, done: Object.keys(state.words) };
}

export function screen(state) {
  return view(state, null);
}

export function present(el, s, game) {
  render(el, s, { ...game, tv: true });
}

// --- Anzeige ---

// Rückseite: zwei Ringe, die sich überschneiden, die Schnittfläche in der Spielerfarbe
const EMBLEM = `<svg class="gk-emblem" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="18" fill="#fff" stroke="#141414" stroke-width="1.4"/>
  <circle cx="16" cy="20" r="8.6" fill="none" stroke="#141414" stroke-width="1.8"/>
  <circle cx="24" cy="20" r="8.6" fill="none" stroke="#141414" stroke-width="1.8"/>
  <path d="M20 12.6 A8.6 8.6 0 0 1 20 27.4 A8.6 8.6 0 0 1 20 12.6 Z" style="fill:var(--c)" stroke="#141414" stroke-width="1.3"/>
</svg>`;
const TILT = [-6, 5, -2, 7, -4, 3]; // Lage der Karten im gemeinsamen Stapel am Ende
const FLIP_MS = 460;
const STEP_MS = 110;

// HTML nur setzen, wenn es sich geändert hat (Knöpfe und Animationen bleiben sonst stehen)
function put(el, html) {
  if (el.__html === html) return false;
  el.innerHTML = html;
  el.__html = html;
  return true;
}

// Gruppen gleicher Wörter einer Runde (nur wenn nicht alle gleich): Set der ids mit Partner
function sameIds(round) {
  const by = {};
  for (const [id, w] of Object.entries(round)) (by[norm(w)] ??= []).push(id);
  const groups = Object.values(by);
  if (groups.length === 1) return { set: new Set(), groups: [] };
  const multi = groups.filter((g) => g.length > 1);
  return { set: new Set(multi.flat()), groups: multi };
}

export function render(el, s, game) {
  const e = game.esc;
  const tv = Boolean(game.tv);
  const all = ids(s);
  const me = game.me;
  const playing = !tv && all.includes(me);
  const n = all.length;
  const last = s.rounds.at(-1) ?? null;
  const prevRounds = game.prev?.rounds?.length ?? s.rounds.length;
  const fresh = Boolean(game.prev) && prevRounds < s.rounds.length; // gerade aufgedeckt
  const won = Boolean(s.result?.winners?.length);
  const order = all; // feste Plätze in Beitrittsreihenfolge, auch für einen selbst
  const nm = (id) => (id === me ? 'Du' : e(game.name(id)));

  // Gerüst einmal pro Partie
  let root = el.querySelector(':scope > .gk');
  if (!root) {
    el.innerHTML = `<div class="gk ${tv ? 'gk-tv' : ''} ${n > 2 ? 'many' : ''} ${n === 4 ? 'n4' : ''}" style="--n:${n}">
      <div class="gk-head">
        <p class="gk-round"></p>
        ${playing ? '<button type="button" class="link gk-giveup">Aufgeben</button>' : ''}
      </div>
      <div class="gk-table">
        <ul class="gk-slots" aria-label="Wörter"></ul>
        <p class="gk-stamp" aria-hidden="true">Gleichklang</p>
      </div>
      <p class="gk-prompt" aria-live="polite"></p>
      ${playing ? `<div class="gk-play">
        <form class="gk-form" data-action="wort" autocomplete="off">
          <label for="gk-input">Dein Wort</label>
          <div class="gk-field">
            <input id="gk-input" name="wort" maxlength="${MAX_LEN}" required autocapitalize="sentences" spellcheck="false" enterkeyhint="send" aria-describedby="gk-hint">
            <button class="btn primary gk-send">Abgeben</button>
          </div>
          <p class="gk-hint muted" id="gk-hint"></p>
        </form>
        <div class="gk-sent">
          <p class="gk-sent-label muted">Abgegeben</p>
          <p class="gk-sent-word"></p>
          <button type="button" class="link gk-undo" data-action="zurueck">Ändern</button>
        </div>
      </div>` : ''}
      <p class="gk-status status" aria-live="polite"></p>
      <section class="gk-ladder" aria-label="Bisher">
        <h3 class="gk-ladder-title muted">Bisher</h3>
        <ol class="gk-rungs"></ol>
      </section>
    </div>`;
    root = el.firstElementChild;
    wireLocal(root, game);
  }
  root.__state = s;

  // Kopf: Runde
  const roundNo = Math.max(1, s.result ? s.rounds.length : s.rounds.length + 1);
  put(root.querySelector('.gk-round'),
    `Runde <span class="num">${roundNo}</span>${s.limit ? ` von <span class="num">${s.limit}</span>` : ''}`);
  const giveup = root.querySelector('.gk-giveup');
  if (giveup) giveup.style.visibility = s.result ? 'hidden' : '';

  // Tisch: ein Stapel pro Spieler, neu gebaut nur bei einer neuen Runde
  const table = root.querySelector('.gk-table');
  const slots = root.querySelector('.gk-slots');
  const key = `${s.rounds.length}|${all.join(',')}`;
  const same = last ? sameIds(last) : { set: new Set(), groups: [] };
  if (slots.dataset.key !== key) {
    slots.dataset.key = key;
    const deal = game.first && !s.rounds.length && !s.result;
    slots.innerHTML = order
      .map((id, k) => {
        const w = last?.[id] ?? '';
        const len = Math.max(5, [...w].length);
        return `<li class="gk-slot ${deal ? 'deal' : ''} ${same.set.has(id) ? 'same' : ''}" data-id="${e(id)}" style="--c:${game.color(id)};--k:${k};--r:${TILT[k % TILT.length]}deg">
          <div class="gk-pile">
            <div class="gk-next" aria-hidden="true"><span class="gk-back">${EMBLEM}</span></div>
            <div class="gk-card ${last ? '' : 'down'} ${fresh ? 'flip' : ''}">
              <span class="gk-front"><span class="gk-rule"></span><span class="gk-word" lang="de" style="--len:${len}">${e(w)}</span></span>
              <span class="gk-back">${EMBLEM}</span>
            </div>
            <span class="gk-same-stamp" aria-hidden="true">gleich</span>
          </div>
          <span class="gk-name"><span class="marker" style="color:var(--c)"></span><span class="gk-name-text">${nm(id)}</span></span>
          <span class="gk-state"></span>
        </li>`;
      })
      .join('');
    table.classList.toggle('fresh', fresh);
  }
  for (const li of slots.children) {
    const id = li.dataset.id;
    const done = !s.result && s.done.includes(id);
    li.classList.toggle('done', done);
    const text = s.result ? '' : done ? 'fertig' : id === me ? 'schreibst' : 'schreibt';
    const st = li.querySelector('.gk-state');
    if (st.textContent !== text) st.textContent = text;
  }

  // Höhepunkt: alle Karten gleiten zu einem Stapel zusammen
  if (won && !table.classList.contains('met')) {
    const animate = game.prev && !game.prev.result && !game.reducedMotion;
    if (!animate) {
      hold(table);
      table.classList.add('met');
    } else {
      const wait = (n - 1) * STEP_MS + FLIP_MS + 160;
      const timer = setTimeout(() => meet(table, game), wait);
      game.signal.addEventListener('abort', () => clearTimeout(timer));
    }
  }

  // Frage
  const prompt = root.querySelector('.gk-prompt');
  let ask = '';
  if (s.result) ask = '';
  else if (!last) ask = tv ? 'Alle schreiben geheim irgendein Wort.' : 'Schreib geheim irgendein Wort.';
  else if (n === 2) ask = `Was verbindet <b>${e(last[all[0]])}</b> und <b>${e(last[all[1]])}</b>?`;
  else if (same.groups.length === 1) {
    const g = same.groups[0];
    const names = g.filter((id) => id !== me).map((id) => e(game.name(id)));
    ask = tv ? 'Was verbindet alle Wörter?' : g.includes(me)
      ? `${list([...names, 'du'])} seid euch schon einig. Was verbindet alle Wörter?`
      : `${list(names)} sind sich schon einig. Was verbindet alle Wörter?`;
  } else if (same.groups.length) ask = tv ? 'Was verbindet alle Wörter?' : 'Manche sind sich schon einig. Was verbindet alle Wörter?';
  else ask = 'Was verbindet diese Wörter?';
  if (put(prompt, ask)) {
    prompt.classList.remove('enter');
    if (fresh) {
      void prompt.offsetWidth;
      prompt.classList.add('enter');
    }
  }

  // Eingabe
  if (playing) {
    const play = root.querySelector('.gk-play');
    const input = root.querySelector('#gk-input');
    play.classList.toggle('sent', Boolean(s.mine));
    play.classList.toggle('over', Boolean(s.result));
    const sentWord = root.querySelector('.gk-sent-word');
    if (s.mine && sentWord.textContent !== s.mine) sentWord.textContent = s.mine;
    root.querySelector('.gk-send').disabled = Boolean(s.mine || s.result);
    input.disabled = Boolean(s.mine || s.result);
    if (fresh) input.value = '';
    // „Ändern“: das alte Wort zum Bearbeiten wieder ins Feld
    if (!s.mine && game.prev?.mine && !fresh && !s.result) {
      input.value = game.prev.mine;
      input.focus();
    }
    hint(root);
  }

  // Wer schon geschrieben hat
  const open = all.filter((id) => !s.done.includes(id));
  let status = '';
  if (!s.result) {
    if (tv) {
      if (!s.done.length) status = last ? 'Alle schreiben auf ihren Handys.' : 'Aufgedeckt wird, wenn alle fertig sind.';
      else if (open.length <= 2) status = `Warte auf ${list(open.map((id) => e(game.name(id))))}.`;
      else status = `Noch ${word(open.length)} schreiben.`;
    } else if (s.mine) {
      const rest = open.filter((id) => id !== me);
      status = rest.length <= 3 ? `Warte auf ${list(rest.map((id) => e(game.name(id))))}.` : `Warte auf ${word(rest.length)} andere.`;
    } else {
      const ready = s.done.filter((id) => id !== me);
      if (ready.length && ready.length === n - 1) status = n === 2 ? `${e(game.name(ready[0]))} ist fertig. Jetzt du.` : 'Alle anderen sind fertig. Jetzt du.';
      else if (ready.length === 1) status = `${e(game.name(ready[0]))} ist schon fertig.`;
      else if (ready.length > 1 && ready.length <= 3) status = `${list(ready.map((id) => e(game.name(id))))} sind schon fertig.`;
      else if (ready.length > 3) status = `${word(ready.length).replace(/^./, (c) => c.toUpperCase())} sind schon fertig.`;
      else if (!last) status = 'Aufgedeckt wird, wenn alle fertig sind.';
    }
  }
  put(root.querySelector('.gk-status'), status);

  // Leiter: alle Runden vor der auf dem Tisch, die neueste kommt unten dazu
  const earlier = s.rounds.slice(0, -1);
  const shown = tv ? earlier.slice(-6) : earlier;
  const skipped = earlier.length - shown.length;
  root.querySelector('.gk-ladder').classList.toggle('empty', !earlier.length);
  put(
    root.querySelector('.gk-rungs'),
    (skipped ? `<li class="gk-skipped muted">Davor ${skipped === 1 ? 'noch eine Runde' : `noch ${word(skipped)} Runden`}.</li>` : '') +
      shown
        .map((r, i) => {
          const no = skipped + i + 1;
          const twins = sameIds(r).set;
          return `<li class="gk-rung ${fresh && no === earlier.length ? 'enter' : ''}">
            <span class="gk-rung-no num">${no}</span>
            <span class="gk-rung-words">${order
              .map((id) => `<span class="gk-rung-word ${twins.has(id) ? 'twin' : ''}" style="--c:${game.color(id)}"><span class="gk-sr">${e(game.name(id))}: </span>${e(r[id])}</span>`)
              .join('')}</span>
          </li>`;
        })
        .join(''),
  );
}

// Karten zusammenschieben (FLIP: vorher messen, Endlage setzen, von der alten Lage aus hingleiten;
// die Karte selbst dreht sich dabei per Transition in ihre Lage im Stapel)
function meet(table, game) {
  const slots = [...table.querySelectorAll('.gk-slot')];
  const before = slots.map((p) => p.getBoundingClientRect());
  hold(table);
  table.classList.add('met', 'meld');
  slots.forEach((p, k) => {
    const a = p.getBoundingClientRect();
    const b = before[k];
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    p.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
      { duration: 620, delay: k * 40, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'backwards' },
    );
  });
  game.signal.addEventListener('abort', () => slots.forEach((p) => p.getAnimations().forEach((x) => x.cancel())));
}

// Der Stapel am Ende: Karten so groß wie vorher, der Tisch so hoch wie vorher (nichts darunter rückt)
function hold(table) {
  const slots = table.querySelector('.gk-slots');
  const slot = slots.querySelector('.gk-slot');
  if (slot) table.style.setProperty('--cw', `${slot.getBoundingClientRect().width}px`);
  slots.style.minHeight = `${slots.getBoundingClientRect().height}px`;
}

// Rein lokal: Hinweis, wenn ein Wort schon dran war, und Aufgeben mit Nachfrage
function wireLocal(root, game) {
  const input = root.querySelector('#gk-input');
  input?.addEventListener('input', () => hint(root), { signal: game.signal });
  const giveup = root.querySelector('.gk-giveup');
  if (!giveup) return;
  let armed = null;
  giveup.addEventListener(
    'click',
    () => {
      if (armed) {
        clearTimeout(armed);
        armed = null;
        giveup.textContent = 'Aufgeben';
        game.send('aufgeben');
        return;
      }
      giveup.textContent = 'Wirklich aufgeben?';
      armed = setTimeout(() => {
        armed = null;
        giveup.textContent = 'Aufgeben';
      }, 3500);
    },
    { signal: game.signal },
  );
  game.signal.addEventListener('abort', () => clearTimeout(armed));
}

function hint(root) {
  const input = root.querySelector('#gk-input');
  const out = root.querySelector('.gk-hint');
  if (!input || !out) return;
  const s = root.__state;
  const key = norm(input.value);
  const text = key && !s.mine && usedSet(s).has(key) ? `„${clean(input.value)}“ war schon dran.` : '';
  if (out.textContent !== text) out.textContent = text;
  input.setAttribute('aria-invalid', text ? 'true' : 'false');
  root.querySelector('.gk-send').disabled = Boolean(text || s.mine || s.result);
}

export const style = `
  .gk { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; min-width: 0; align-content: start; }
  .gk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .gk-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--hairline); padding-bottom: 8px; }
  .gk-round { margin: 0; color: var(--muted); }
  .gk-giveup { font-size: var(--t-sm); }

  /* Tisch: Stapel nebeneinander, zu mehreren in drei Spalten (vier: zwei mal zwei) */
  .gk-table { position: relative; }
  .gk-slots {
    display: grid; grid-template-columns: repeat(2, minmax(0, 13rem)); justify-content: center;
    gap: 14px 12px; margin: 0; padding: 0; list-style: none;
  }
  .gk.many .gk-slots { grid-template-columns: repeat(3, minmax(0, 11rem)); gap: 12px 10px; }
  .gk.n4 .gk-slots { grid-template-columns: repeat(2, minmax(0, 12rem)); }
  @media (min-width: 640px) { .gk.n4:not(.gk-tv) .gk-slots { grid-template-columns: repeat(4, minmax(0, 11rem)); } }
  .gk-slot { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; min-width: 0; padding-top: 8px; }
  .gk-pile { position: relative; perspective: 700px; }
  .gk-card { position: relative; display: block; aspect-ratio: 3 / 2; transform-style: preserve-3d; }
  .gk-card.down { transform: rotateY(180deg); }
  .gk-front, .gk-back {
    position: absolute; inset: 0; display: grid; place-items: center;
    border: 2px solid var(--ink); border-radius: var(--radius-m); background: var(--paper);
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .gk-front { container-type: inline-size; padding: 14% 6% 6%; }
  .gk-rule { position: absolute; left: 7%; right: 7%; top: 17%; height: 2px; background: var(--c); }
  .gk-word {
    max-width: 100%; text-align: center; line-height: 1.02;
    font: 800 min(2.2rem, max(.8rem, calc(150cqw / var(--len)))) / 1.02 var(--font-display);
    overflow-wrap: anywhere; hyphens: auto;
  }
  .gk-back {
    transform: rotateY(180deg);
    background: color-mix(in srgb, var(--c) 10%, white);
    background-image: repeating-linear-gradient(-45deg, transparent 0 6px, color-mix(in srgb, var(--c) 32%, white) 6px 8px);
  }
  .gk-back::before { content: ""; position: absolute; inset: 5px; border: 1px solid var(--ink); border-radius: var(--radius); }
  .gk-emblem { position: relative; width: 40%; max-width: 3.4rem; height: auto; }

  /* Verdeckte Karte hinter dem Stapel: wer geschrieben hat */
  .gk-next { position: absolute; inset: 0; opacity: 0; transform: translate(4px, -16px) rotate(9deg); transition: opacity 180ms ease-out, transform 320ms cubic-bezier(.2,.8,.2,1); }
  .gk-next .gk-back { transform: none; }
  .gk-slot.done .gk-next { opacity: 1; transform: translate(5px, -6px) rotate(3deg); }

  .gk-name { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 700; }
  .gk-name .marker { flex: none; }
  .gk-name-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gk-state { min-height: 1.3em; font-size: var(--t-sm); color: var(--muted); line-height: 1.3; }
  .gk-slot.done .gk-state { color: var(--ink); }

  /* gleiche Wörter: Stempel in der Ecke */
  .gk-same-stamp {
    position: absolute; right: -4px; bottom: -8px; padding: 0 5px; visibility: hidden;
    border: 2px solid var(--ink); border-radius: var(--radius); background: var(--paper);
    font: 800 var(--t-sm) / 1.25 var(--font-display); text-transform: uppercase; letter-spacing: .04em; transform: rotate(-6deg);
  }
  .gk-slot.same .gk-same-stamp { visibility: visible; }
  .gk-slot.same .gk-front { box-shadow: inset 0 0 0 2px var(--ink); }

  /* Frage, Eingabe, Status */
  .gk-prompt { margin: 0; min-height: 2.6em; line-height: 1.3; font-size: var(--t-md); }
  .gk-prompt b { font-family: var(--font-display); font-weight: 800; font-size: 1.15em; line-height: 1.1; vertical-align: -.08em; overflow-wrap: anywhere; }
  .gk-prompt.enter { animation: gk-rise 320ms cubic-bezier(.2,.8,.2,1) calc(var(--n) * ${STEP_MS}ms + 200ms) both; }
  .gk-play { display: grid; grid-template-columns: minmax(0, 1fr); max-width: 30rem; }
  .gk-form, .gk-sent { grid-area: 1 / 1; min-width: 0; }
  .gk-form { display: grid; gap: 6px; align-content: start; }
  .gk-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .gk-field input { min-width: 0; font-size: max(16px, var(--t-base)); }
  .gk-field input[aria-invalid="true"] { border-color: var(--bad); }
  .gk-send:active:not(:disabled) { transform: scale(.96); }
  .gk-hint { margin: 0; min-height: 1.3em; line-height: 1.3; font-size: var(--t-sm); color: var(--bad); }
  .gk-sent { visibility: hidden; display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: start; align-items: baseline; gap: 2px 12px; }
  .gk-sent-label { grid-column: 1 / -1; margin: 0; font-size: var(--t-sm); }
  .gk-sent-word { margin: 0; font: 800 var(--t-xl) / 1.1 var(--font-display); overflow-wrap: anywhere; }
  .gk-undo { justify-self: start; }
  .gk-play.sent .gk-form { visibility: hidden; }
  .gk-play.sent .gk-sent { visibility: visible; animation: gk-rise 260ms cubic-bezier(.2,.8,.2,1) both; }
  .gk-play.over .gk-form, .gk-play.over .gk-sent { visibility: hidden; }
  .gk-status { margin: 0; min-height: 2.6em; line-height: 1.3; }

  /* Leiter der bisherigen Runden */
  .gk-ladder { border-top: 1px solid var(--hairline); padding-top: 10px; }
  .gk-ladder.empty { visibility: hidden; }
  .gk-ladder-title { margin: 0 0 6px; font-size: var(--t-sm); font-weight: 400; }
  .gk-rungs { margin: 0; padding: 0; list-style: none; }
  .gk-rung { display: grid; grid-template-columns: 2em minmax(0, 1fr); align-items: baseline; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--hairline); }
  .gk-rung-no { color: var(--muted); text-align: right; }
  .gk-rung-words { display: flex; flex-wrap: wrap; gap: 2px 14px; min-width: 0; }
  .gk-rung-word { font: 800 var(--t-md) / 1.2 var(--font-display); color: var(--c); overflow-wrap: anywhere; min-width: 0; }
  .gk-rung-word.twin { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
  .gk-skipped { padding: 4px 0; font-size: var(--t-sm); }
  .gk-rung.enter { animation: gk-drop 380ms cubic-bezier(.2,.8,.2,1) both; }

  /* Auftakt: die verdeckten Karten werden ausgeteilt */
  .gk-slot.deal .gk-pile { animation: gk-deal 420ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 90ms); }
  .gk-slot.deal .gk-name, .gk-slot.deal .gk-state { animation: gk-rise 300ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 90ms + 200ms); }
  @keyframes gk-deal { from { opacity: 0; transform: translateY(-28px) rotate(-10deg); } }
  @keyframes gk-rise { from { opacity: 0; transform: translateY(6px); } }
  @keyframes gk-drop { from { opacity: 0; transform: translateY(-10px); } }

  /* Aufdecken: die neue Karte kommt von hinten und dreht sich um, nacheinander */
  .gk-card.flip { animation: gk-flip ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * ${STEP_MS}ms); }
  @keyframes gk-flip {
    from { transform: translate(5px, -6px) rotate(3deg) rotateY(180deg); }
    to { transform: translate(0, 0) rotate(0deg) rotateY(0deg); }
  }
  .gk-table.fresh .gk-slot.same .gk-same-stamp { animation: gk-stamp 300ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--n) * ${STEP_MS}ms + ${FLIP_MS}ms); }
  @keyframes gk-stamp { from { opacity: 0; transform: rotate(-6deg) scale(1.7); } }

  /* Gleichklang: alle Karten auf einem Stapel, darüber der Stempel */
  .gk-stamp {
    position: absolute; left: 50%; top: 50%; margin: 0; padding: .1em .45em; visibility: hidden; pointer-events: none;
    border: 3px solid var(--ink); border-radius: var(--radius-m); background: var(--paper);
    font: 800 var(--t-2xl) / 1.05 var(--font-display); text-transform: uppercase; letter-spacing: .03em;
    transform: translate(-50%, 40%) rotate(-7deg); white-space: nowrap;
  }
  .gk .gk-table.met .gk-slots { grid-template-columns: var(--cw, 12rem); align-content: center; }
  .gk-table.met .gk-slot { grid-area: 1 / 1; }
  .gk-table.met .gk-pile { transform: rotate(var(--r)) scale(var(--grow, 1)); }
  .gk.many .gk-table.met { --grow: 1.6; }
  .gk.n4 .gk-table.met { --grow: 1.25; }
  .gk-table.meld .gk-pile { transition: transform 620ms cubic-bezier(.6,0,.2,1) calc(var(--k) * 40ms); }
  .gk-table.met .gk-name, .gk-table.met .gk-state, .gk-table.met .gk-same-stamp { visibility: hidden; }
  .gk-table.met .gk-slot:not(:last-child) .gk-word { visibility: hidden; } /* nur die oberste Karte zeigt das Wort */
  .gk-table.met .gk-stamp { visibility: visible; }
  .gk-table.meld .gk-stamp { animation: gk-bang 360ms cubic-bezier(.2,.8,.2,1) calc(var(--n) * 40ms + 560ms) both; }
  @keyframes gk-bang { from { opacity: 0; transform: translate(-50%, 40%) rotate(-7deg) scale(1.8); } }

  /* Bildschirm: Stapel groß, rechts die Leiter */
  .gk-tv { gap: 2.4vh; }
  .gk-tv .gk-head { font-size: var(--t-md); }
  .gk-tv .gk-slots { grid-template-columns: repeat(2, minmax(0, 20rem)); gap: 3vh 2rem; }
  .gk-tv.many .gk-slots { grid-template-columns: repeat(3, minmax(0, 10rem)); gap: 1.6vh 1.6rem; }
  .gk-tv.many .gk-prompt { min-height: 1.3em; }
  .gk-tv.many .gk-state { font-size: var(--t-sm); }
  .gk-tv.n4 .gk-slots { grid-template-columns: repeat(2, minmax(0, 13rem)); }
  .gk-tv .gk-name { font-size: var(--t-md); }
  .gk-tv .gk-state { font-size: var(--t-base); }
  .gk-tv .gk-word { font-size: min(3.4rem, max(1rem, calc(150cqw / var(--len)))); }
  .gk-tv .gk-prompt { font-size: var(--t-xl); }
  .gk-tv .gk-status { font-size: var(--t-lg); }
  .gk-tv .gk-ladder-title { font-size: var(--t-base); }
  .gk-tv .gk-rung-word { font-size: var(--t-lg); }
  .gk-tv .gk-stamp { font-size: var(--t-3xl); }
  @media (min-width: 880px) and (orientation: landscape) {
    .gk-tv {
      grid-template-columns: minmax(0, 1.7fr) minmax(14rem, 1fr); column-gap: 4vw;
      grid-template-areas: "head ladder" "table ladder" "prompt ladder" "status ladder" ". ladder";
      grid-template-rows: auto auto auto auto 1fr; align-items: start;
    }
    .gk-tv > .gk-head { grid-area: head; }
    .gk-tv > .gk-table { grid-area: table; }
    .gk-tv > .gk-prompt { grid-area: prompt; }
    .gk-tv > .gk-status { grid-area: status; }
    .gk-tv > .gk-ladder { grid-area: ladder; border-top: 0; border-left: 1px solid var(--hairline); padding: 0 0 0 2vw; }
  }

  @media (prefers-reduced-motion: reduce) {
    .gk *, .gk-prompt { animation: none !important; transition: none !important; }
  }
`;
