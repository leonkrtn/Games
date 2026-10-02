// Wie gut kennst du mich? Beispiel für ein Spiel mit eigenen Texten und mehreren Phasen.
// Reihum denkt sich einer eine Frage über sich aus (mit geheimer Antwort), alle anderen raten
// gleichzeitig (geheim, bis alle geraten haben), und der Fragende entscheidet bei jeder Vermutung,
// ob sie stimmt. Jede richtige Vermutung ist ein Punkt.

export const meta = {
  name: 'Wie gut kennst du mich?',
  description: 'Reihum schreibt ihr eine Frage über euch selbst, die anderen raten.',
  players: [2, 6],
};

const WORD = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
const word = (n) => WORD[n] ?? String(n);

const IDEAS = [
  'Was ist mein Lieblingsessen?',
  'Wohin würde ich sofort verreisen?',
  'Was war mein erster Eindruck von dir?',
  'Welcher Song läuft bei mir gerade in Dauerschleife?',
  'Wovor habe ich heimlich Angst?',
  'Was würde ich mit einer Million Euro als Erstes machen?',
  'Welches Essen mag ich überhaupt nicht?',
  'Was ist mein Lieblingsfilm?',
  'Welche Superkraft hätte ich gern?',
  'Was bringt mich immer zum Lachen?',
  'Wie sieht mein perfekter Sonntag aus?',
  'Welches Tier wäre ich?',
  'Was ist mein liebster gemeinsamer Moment?',
  'Was nervt mich am meisten?',
  'Was war mein Lieblingsspielzeug als Kind?',
  'Was würde ich nie im Leben essen?',
  'Was wäre mein Traumjob?',
  'Wofür gebe ich zu viel Geld aus?',
  'Was ist mein Lieblingsgetränk?',
  'Welches Land würde ich gern einmal bereisen?',
  'Was ist mein Lieblingstier?',
  'Welche Jahreszeit mag ich am liebsten?',
  'Welche Jahreszeit mag ich überhaupt nicht?',
  'Welches Schulfach habe ich am liebsten gemocht?',
  'Welches Schulfach habe ich gehasst?',
  'Welche Farbe trage ich am liebsten?',
  'Was mache ich als Erstes nach dem Aufstehen?',
  'Was ist meine Lieblingsserie?',
  'Was bestelle ich im Restaurant fast immer?',
  'Welche Eissorte nehme ich immer?',
  'Was ist mein Lieblingsbuch?',
  'Welche Musik höre ich am liebsten?',
  'Was wollte ich als Kind werden?',
  'Wo möchte ich im Alter wohnen?',
  'Welches Hobby würde ich gern lernen?',
  'Was ist mein größter Traum?',
  'Was ist das Schönste, das ich je geschenkt bekommen habe?',
  'Wie belege ich meine Pizza am liebsten?',
  'Wie trinke ich meinen Kaffee oder Tee?',
  'Was war mein schönster Urlaub?',
  'Bin ich eher Frühaufsteher oder Nachteule?',
  'Was mache ich am liebsten, wenn es regnet?',
  'Welches Haustier hätte ich gern?',
  'Was würde ich auf eine einsame Insel mitnehmen?',
  'Wen würde ich gern einmal treffen?',
  'Was ist mein Lieblingswort?',
  'Welcher Geruch gefällt mir am besten?',
  'Wo ist mein Lieblingsplatz zu Hause?',
  'Welches Gericht koche ich am besten?',
  'Welche Sportart schaue ich am liebsten?',
  'Was kann ich überhaupt nicht gut?',
  'Was kann ich besonders gut?',
  'Welchen Film kann ich fast auswendig mitsprechen?',
  'Welche Sprache würde ich gern fließend sprechen?',
  'Was ist mein liebster Feiertag?',
  'Welches Spiel spiele ich am liebsten?',
  'Welches Gemüse esse ich am liebsten?',
  'Welches Gemüse esse ich nur ungern?',
  'Was mache ich am liebsten am Wochenende?',
  'Welche App benutze ich am meisten?',
  'Welches Kuscheltier hatte ich als Kind?',
  'Was war mein Spitzname als Kind?',
  'Wofür würde ich mitten in der Nacht aufstehen?',
  'Was würde ich mit einem freien Tag ganz allein machen?',
  'In welcher Stadt würde ich gern einmal leben?',
  'Berge oder Meer: Was ist mir lieber?',
  'Katzen oder Hunde: Was mag ich lieber?',
  'Süß oder salzig: Was esse ich lieber?',
  'Welches Instrument würde ich gern spielen?',
  'Was ist mein liebstes Kleidungsstück?',
  'Welche Schuhe trage ich am häufigsten?',
  'Wen aus meiner Familie rufe ich am häufigsten an?',
  'Bei welchem Spiel gewinne ich fast immer?',
  'Was würde ich tun, wenn ich einen Tag lang unsichtbar wäre?',
  'Welche drei Dinge würde ich bei einem Brand mitnehmen?',
  'Welches Wort sage ich viel zu oft?',
  'Was ist meine schlimmste Angewohnheit?',
  'Was war mir einmal richtig peinlich?',
  'Wobei schlafe ich am schnellsten ein?',
  'Was würde ich als Erstes tun, wenn ein Zombie vor der Tür stünde?',
  'Welchen Streich habe ich als Kind gespielt?',
  'Was habe ich zuletzt im Internet bestellt?',
  'Welches Lied singe ich unter der Dusche?',
  'Würde ich lieber in die Vergangenheit oder in die Zukunft reisen?',
  'Was esse ich am liebsten beim Bäcker?',
  'Was trinke ich auf einer Party am liebsten?',
  'Was war mein bester Tag im letzten Jahr?',
  'Worauf freue ich mich gerade am meisten?',
  'Was war mein peinlichster Haarschnitt?',
  'Welches Spielzeug hätte ich als Kind gern gehabt?',
  'Mit welcher berühmten Person würde ich gern einen Tag tauschen?',
  'Welchen Beruf könnte ich mir überhaupt nicht vorstellen?',
  'Was ist mein Lieblingsort in meiner Stadt?',
  'Was würde ich tun, wenn ich einen Tag lang das Sagen hätte?',
  'Welche Eigenschaft schätze ich an Freunden am meisten?',
  'Worüber kann ich stundenlang reden?',
  'Wie viele Stunden Schlaf brauche ich mindestens?',
  'Welche Fähigkeit würde ich gern sofort beherrschen?',
  'Welche Süßigkeit könnte ich den ganzen Tag essen?',
  'Welche Sendung habe ich als Kind geliebt?',
  'Was ist mein Lieblingsgeräusch?',
  'Welche Ausrede benutze ich am häufigsten, wenn ich zu spät komme?',
  'Welche Eigenschaft von mir nervt andere am meisten?',
  'Wovor ekele ich mich am meisten?',
  'Was ist mein Lieblingsmärchen?',
  'Was war mein schlimmster Fehlkauf?',
  'Was ist mein liebster Snack am Abend?',
  'Welches Spiel habe ich als Kind am häufigsten gespielt?',
  'Was würde ich nie wieder anziehen?',
  'Welche Pizzasorte würde ich nie bestellen?',
  'Wo habe ich zuletzt etwas Wichtiges verloren?',
  'Welche Unordnung stört mich bei anderen am meisten?',
  'Wann bin ich zuletzt vor Lachen fast vom Stuhl gefallen?',
  'Welches Spiel verliere ich am schlechtesten?',
  'Was ist mein liebstes Schimpfwort?',
];

export function setup(players) {
  const first = players[Math.floor(Math.random() * players.length)];
  return {
    players,
    rounds: players.length === 2 ? 6 : players.length * 2, // zu zweit dreimal, sonst zweimal Fragen für jeden
    score: Object.fromEntries(players.map((p) => [p.id, 0])),
    round: 1,
    subject: first.id, // um wen es in dieser Runde geht
    phase: 'fragen', // fragen → raten → pruefen → aufgedeckt
    question: null,
    answer: null,
    guesses: {}, // { [Rater]: Vermutung }
    checks: {}, // { [Rater]: true | false }, entscheidet der Fragende
  };
}

// Partien von vor dem Umbau auf mehrere Spieler (zu zweit, eine Vermutung) weiterspielen können
function upgrade(s) {
  if (s.guesses) return s;
  const g = s.players.find((p) => p.id !== s.subject).id;
  const checks = typeof s.correct === 'boolean' ? { [g]: s.correct } : {};
  return { ...s, rounds: 6, guesses: s.guess ? { [g]: s.guess } : {}, checks };
}

const ids = (s) => s.players.map((p) => p.id);
const guessersOf = (s) => ids(s).filter((id) => id !== s.subject);
const nextAfter = (s, id) => ids(s)[(ids(s).indexOf(id) + 1) % s.players.length];
const clean = (text) => String(text ?? '').trim().slice(0, 200);

export function action(state, { player, type, data }) {
  if (!(player in state.score)) throw new Error('Du spielst nicht mit.');
  Object.assign(state, upgrade(state));
  const guessers = guessersOf(state);

  if (type === 'fragen') {
    if (state.phase !== 'fragen' || player !== state.subject) throw new Error('Gerade nicht möglich.');
    const question = clean(data?.question);
    const answer = clean(data?.answer);
    if (!question || !answer) throw new Error('Bitte Frage und Antwort ausfüllen.');
    Object.assign(state, { question, answer, phase: 'raten' });
  } else if (type === 'raten') {
    if (state.phase !== 'raten' || !guessers.includes(player)) throw new Error('Gerade nicht möglich.');
    if (state.guesses[player]) throw new Error('Du hast schon geraten.');
    const guess = clean(data?.guess);
    if (!guess) throw new Error('Rate etwas.');
    state.guesses[player] = guess;
    if (guessers.every((id) => state.guesses[id])) state.phase = 'pruefen';
  } else if (type === 'pruefen') {
    if (state.phase !== 'pruefen') return; // doppelt getippt, schon aufgedeckt
    if (player !== state.subject) throw new Error('Gerade nicht möglich.');
    const who = String(data?.id ?? '');
    if (!guessers.includes(who)) throw new Error('Diese Vermutung gibt es nicht.');
    if (who in state.checks) return; // doppelt getippt
    state.checks[who] = data.ok === true;
    if (!guessers.every((id) => id in state.checks)) return;
    for (const id of guessers) if (state.checks[id]) state.score[id]++;
    state.phase = 'aufgedeckt';
    if (state.round >= state.rounds) finish(state);
  } else if (type === 'weiter') {
    if (state.phase !== 'aufgedeckt' || state.result) return;
    Object.assign(state, {
      round: state.round + 1,
      subject: nextAfter(state, state.subject),
      phase: 'fragen',
      question: null,
      answer: null,
      guesses: {},
      checks: {},
    });
  }
}

function finish(state) {
  const top = Math.max(...Object.values(state.score));
  const best = state.players.filter((p) => state.score[p.id] === top);
  if (state.players.length === 2) {
    const [a, b] = state.players;
    const [sa, sb] = [state.score[a.id], state.score[b.id]];
    state.result =
      sa === sb
        ? { winners: [a.id, b.id], text: `Gleichstand, ${word(sa)} zu ${word(sb)}. Ihr kennt euch gleich gut.` }
        : { winners: [best[0].id], text: `${best[0].name} hat öfter richtig geraten, ${word(Math.max(sa, sb))} zu ${word(Math.min(sa, sb))}.` };
    return;
  }
  const hits = top === 1 ? 'einem Treffer' : `${word(top)} Treffern`;
  state.result =
    best.length === 1
      ? { winners: [best[0].id], text: `${best[0].name} kennt euch am besten, mit ${hits}.` }
      : best.length === state.players.length
        ? { winners: best.map((p) => p.id), text: `Gleichstand, alle mit ${hits}. Ihr kennt euch gleich gut.` }
        : { winners: best.map((p) => p.id), text: `${list(best.map((p) => p.name))} kennen euch am besten, mit je ${hits}.` };
}

// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
function list(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

// Für Benachrichtigungen: auf wen wartet das Spiel gerade?
export function waitingFor(state) {
  state = upgrade(state);
  if (state.phase === 'fragen' || state.phase === 'pruefen') return [state.subject];
  if (state.phase === 'raten') return guessersOf(state).filter((id) => !state.guesses[id]);
  return ids(state); // aufgedeckt: jeder darf weiter
}

// Benachrichtigt nur, wer neu gefragt ist (nicht bei jeder einzelnen Vermutung die übrigen Rater).
export function notices(state, before) {
  const name = (id) => state.players.find((p) => p.id === id).name;
  if (state.phase === 'fragen' && before.phase !== 'fragen') {
    return [{ to: state.subject, text: 'Du bist dran mit einer Frage über dich.' }];
  }
  if (state.phase === 'raten' && before.phase !== 'raten') {
    return guessersOf(state).map((id) => ({ to: id, text: `${name(state.subject)} hat eine Frage gestellt. Rate mit.` }));
  }
  if (state.phase === 'pruefen' && before.phase !== 'pruefen') {
    return [{ to: state.subject, text: 'Alle haben geraten. Entscheide, was zählt.' }];
  }
  return [];
}

// Die geheime Antwort sehen die Rater erst, wenn alle geraten haben; ebenso die Vermutungen der anderen.
export function view(state, me) {
  state = upgrade(state);
  if (state.phase !== 'raten') return state;
  const hidden = me !== state.subject;
  return {
    ...state,
    answer: hidden ? null : state.answer,
    guesses: state.guesses[me] ? { [me]: state.guesses[me] } : {},
    guessed: Object.keys(state.guesses),
  };
}

export function render(el, s, game) {
  const e = game.esc;
  const me = game.me;
  const isSubject = s.subject === me;
  const guessers = guessersOf(s);
  const subjectName = e(game.name(s.subject));
  const nm = (id) => (id === me ? 'Du' : e(game.name(id)));
  const who = (id) => `<span class="marker" style="color:${game.color(id)}"></span> ${nm(id)}`;
  const names = (list_) => list(list_.map((id) => e(game.name(id))));
  const fresh = (phase) => game.prev && game.prev.phase !== phase && s.phase === phase; // gerade umgeschaltet

  const header = `
    <div class="kdm-head ${game.first ? 'intro' : ''}">
      <span class="muted">Runde <span class="num">${Math.min(s.round, s.rounds)}</span> von <span class="num">${s.rounds}</span></span>
      <span class="kdm-points">${[me, ...ids(s).filter((id) => id !== me)]
        .map((id, k) => `<span class="kdm-team" style="--k:${k}">${who(id)} <b class="num kdm-num" style="color:${game.color(id)}">${s.score[id]}</b></span>`)
        .join('')}</span>
    </div>`;
  const question = s.question
    ? `<div class="kdm-q ${fresh('raten') ? 'enter' : ''}"><p class="muted kdm-asker">${isSubject ? 'Deine Frage' : `Frage von ${subjectName}`}</p><p class="kdm-question">${e(s.question)}</p></div>`
    : '';
  const others = guessers.length === 1 ? e(game.name(guessers[0])) : 'Die anderen';

  let body = '';
  switch (s.phase) {
    case 'fragen':
      body = isSubject
        ? `<form class="kdm-form" data-action="fragen">
             <p class="status">Du bist dran. Schreib eine Frage über dich und deine Antwort.</p>
             <div>
               <div class="kdm-label-row">
                 <label for="kdm-q">Frage</label>
                 <button type="button" class="link kdm-idea" id="kdm-idea">Vorschlag nehmen</button>
               </div>
               <input name="question" id="kdm-q" maxlength="200" required>
             </div>
             <div>
               <label for="kdm-a">Deine Antwort</label>
               <input name="answer" id="kdm-a" maxlength="200" required aria-describedby="kdm-a-hint">
               <p class="muted kdm-hint" id="kdm-a-hint">${others} ${guessers.length === 1 ? 'sieht' : 'sehen'} sie erst nach dem Raten.</p>
             </div>
             <div><button class="btn primary">Frage stellen</button></div>
           </form>`
        : `<p class="status">${subjectName} schreibt gerade eine Frage.</p>`;
      break;
    case 'raten': {
      const open = guessers.filter((id) => !s.guessed.includes(id));
      const mine = s.guesses[me];
      if (isSubject) body = `${question}<p class="status">${names(open)} ${open.length === 1 ? 'rät' : 'raten'} gerade.</p>`;
      else if (mine) {
        const rest = open.filter((id) => id !== me);
        body = `${question}
          <dl class="kdm-compare"><dt>Deine Vermutung</dt><dd>${e(mine)}</dd></dl>
          <p class="status">Warte auf ${names(rest)}.</p>`;
      } else {
        body = `${question}
           <form class="kdm-form" data-action="raten">
             <div>
               <label for="kdm-g">Deine Vermutung</label>
               <input name="guess" id="kdm-g" maxlength="200" required autofocus>
             </div>
             <div><button class="btn primary">Raten</button></div>
           </form>`;
      }
      break;
    }
    case 'pruefen':
    case 'aufgedeckt': {
      const done = s.phase === 'aufgedeckt';
      const rows = guessers
        .map((id, k) => {
          const checked = id in s.checks;
          const ok = s.checks[id];
          const just = game.prev?.phase === 'pruefen' && !(id in (game.prev.checks ?? {})) && checked;
          let tail = '';
          if (checked) tail = `<span class="kdm-verdict ${ok ? 'ok' : 'miss'} ${just ? 'enter' : ''}">${ok ? 'Richtig' : 'Daneben'}</span>`;
          else if (isSubject) {
            tail = `<span class="row kdm-judge">
              <button class="btn primary" data-action="pruefen" data-value='${e(JSON.stringify({ id, ok: true }))}'>Richtig</button>
              <button class="btn" data-action="pruefen" data-value='${e(JSON.stringify({ id, ok: false }))}'>Daneben</button>
            </span>`;
          }
          return `<li class="kdm-guess ${fresh('pruefen') ? 'enter' : ''}" style="--k:${k}">
            <span class="kdm-guess-who">${who(id)}</span>
            <span class="kdm-guess-text">${e(s.guesses[id])}</span>
            ${tail}
          </li>`;
        })
        .join('');
      const right = guessers.filter((id) => s.checks[id]);
      let status;
      if (!done) status = isSubject ? 'Zählt das als richtig?' : `${subjectName} entscheidet, was zählt.`;
      else if (!right.length) status = 'Alle daneben. Kein Punkt.';
      else if (right.length === 1) status = `Ein Punkt für ${right[0] === me ? 'dich' : e(game.name(right[0]))}.`;
      else status = `Je ein Punkt für ${list(right.map((id) => (id === me ? 'dich' : e(game.name(id)))))}.`;
      body = `${question}
        <div class="kdm-answer ${fresh('pruefen') ? 'enter' : ''}"><p class="muted kdm-asker">${isSubject ? 'Deine Antwort' : `Antwort von ${subjectName}`}</p><p class="kdm-answer-text">${e(s.answer)}</p></div>
        <ul class="kdm-guesses">${rows}</ul>
        <p class="${done ? 'big' : 'status'} ${done && right.length ? 'ok' : ''}">${status}</p>
        ${done && !game.result ? '<div><button class="btn primary" data-action="weiter">Nächste Runde</button></div>' : ''}`;
      break;
    }
  }

  el.innerHTML = header + body;

  // Kleiner Helfer, der nur im eigenen Browser passiert (kein Spielzug).
  el.querySelector('#kdm-idea')?.addEventListener('click', () => {
    const input = el.querySelector('#kdm-q');
    input.value = IDEAS[Math.floor(Math.random() * IDEAS.length)];
    input.focus();
  });
}

export const style = `
  .kdm-head {
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px;
    border-bottom: 1px solid var(--hairline); padding-bottom: 10px;
  }
  .kdm-points { display: inline-flex; flex-wrap: wrap; gap: 2px 14px; align-items: baseline; }
  .kdm-team { white-space: nowrap; }
  .kdm-num { font-size: var(--t-md); }
  .kdm-asker { font-size: var(--t-sm); }
  .kdm-question { font-size: var(--t-lg); font-weight: 700; line-height: 1.25; max-width: 30ch; }
  .kdm-form { display: grid; gap: 18px; max-width: 480px; }
  .kdm-label-row { display: flex; justify-content: space-between; align-items: baseline; }
  .kdm-idea { font-size: var(--t-sm); }
  .kdm-hint { font-size: var(--t-sm); margin-top: 6px; }
  .kdm-compare { display: grid; grid-template-columns: auto 1fr; gap: 8px 20px; border-top: 2px solid var(--ink); padding-top: 12px; }
  .kdm-compare dt { color: var(--muted); }
  .kdm-compare dd { font-weight: 700; }
  .kdm-answer { border-top: 2px solid var(--ink); padding-top: 12px; }
  .kdm-answer-text { font: 800 var(--t-xl) / 1.1 var(--font-display); }
  .kdm-guesses { border-top: 1px solid var(--hairline); }
  .kdm-guess {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 16px;
    padding: 10px 0; border-bottom: 1px solid var(--hairline);
  }
  .kdm-guess-who { grid-column: 1 / -1; font-size: var(--t-sm); color: var(--muted); }
  .kdm-guess-text { font-weight: 700; overflow-wrap: anywhere; }
  .kdm-judge { flex-wrap: nowrap; gap: 8px; justify-self: start; }
  .kdm-judge .btn { min-height: 40px; padding: 6px 12px; }
  .kdm-judge .btn:active { transform: scale(.96); }
  .kdm-verdict {
    padding: 2px 8px; border: 2px solid currentColor; border-radius: var(--radius);
    font: 800 var(--t-md) / 1.1 var(--font-display); transform: rotate(-4deg); justify-self: start;
  }
  .kdm-verdict.ok { color: var(--ok); }
  .kdm-verdict.miss { color: var(--muted); }
  @media (max-width: 420px) {
    .kdm-compare { grid-template-columns: 1fr; gap: 2px; } .kdm-compare dd { margin-bottom: 8px; }
    .kdm-guess { grid-template-columns: 1fr; }
  }

  /* Auftakt, neue Frage, aufgedeckte Vermutungen nacheinander, Urteil als Stempel */
  .kdm-head.intro .kdm-team { animation: kdm-rise 360ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--k) * 80ms); }
  .kdm-q.enter, .kdm-answer.enter { animation: kdm-rise 320ms cubic-bezier(.2,.8,.2,1) both; }
  .kdm-guess.enter { animation: kdm-rise 320ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(200ms + var(--k) * 100ms); }
  .kdm-verdict.enter { animation: kdm-stamp 300ms cubic-bezier(.2,.8,.2,1) both; }
  @keyframes kdm-rise { from { opacity: 0; transform: translateY(6px); } }
  @keyframes kdm-stamp { from { opacity: 0; transform: rotate(-4deg) scale(1.6); } }
  @media (prefers-reduced-motion: reduce) {
    .kdm-head *, .kdm-q, .kdm-answer, .kdm-guess, .kdm-verdict { animation: none !important; }
  }
`;
