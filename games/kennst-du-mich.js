// Wie gut kennst du mich? Beispiel für ein Spiel mit eigenen Texten und mehreren Phasen.
// Abwechselnd denkt sich einer eine Frage über sich aus (mit geheimer Antwort),
// der andere rät, und der Fragende entscheidet, ob es stimmt.

export const meta = {
  name: 'Wie gut kennst du mich?',
  description: 'Abwechselnd schreibt ihr eine Frage über euch selbst, die andere Person rät.',
  players: [2, 2],
};

const ROUNDS = 6;
const WORD = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];

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
];

export function setup(players) {
  const first = players[Math.floor(Math.random() * players.length)];
  return {
    players,
    score: Object.fromEntries(players.map((p) => [p.id, 0])),
    round: 1,
    subject: first.id, // um wen es in dieser Runde geht
    phase: 'fragen', // fragen → raten → pruefen → aufgedeckt
    question: null,
    answer: null,
    guess: null,
    correct: null,
  };
}

const other = (state, id) => state.players.find((p) => p.id !== id);
const clean = (text) => String(text ?? '').trim().slice(0, 200);

export function action(state, { player, type, data }) {
  const guesser = other(state, state.subject).id;

  if (type === 'fragen') {
    if (state.phase !== 'fragen' || player !== state.subject) throw new Error('Gerade nicht möglich.');
    const question = clean(data?.question);
    const answer = clean(data?.answer);
    if (!question || !answer) throw new Error('Bitte Frage und Antwort ausfüllen.');
    Object.assign(state, { question, answer, phase: 'raten' });
  } else if (type === 'raten') {
    if (state.phase !== 'raten' || player !== guesser) throw new Error('Gerade nicht möglich.');
    const guess = clean(data?.guess);
    if (!guess) throw new Error('Rate etwas!');
    Object.assign(state, { guess, phase: 'pruefen' });
  } else if (type === 'pruefen') {
    if (state.phase !== 'pruefen' || player !== state.subject) throw new Error('Gerade nicht möglich.');
    state.correct = data === true;
    if (state.correct) state.score[guesser]++;
    state.phase = 'aufgedeckt';
    if (state.round >= ROUNDS) finish(state);
  } else if (type === 'weiter') {
    if (state.phase !== 'aufgedeckt') return;
    Object.assign(state, {
      round: state.round + 1,
      subject: guesser,
      phase: 'fragen',
      question: null,
      answer: null,
      guess: null,
      correct: null,
    });
  }
}

function finish(state) {
  const [a, b] = state.players;
  const sa = state.score[a.id];
  const sb = state.score[b.id];
  if (sa === sb) {
    state.result = { winners: [a.id, b.id], text: `Gleichstand, ${WORD[sa]} zu ${WORD[sb]}. Ihr kennt euch gleich gut.` };
  } else {
    const winner = sa > sb ? a : b;
    state.result = { winners: [winner.id], text: `${winner.name} hat öfter richtig geraten, ${WORD[Math.max(sa, sb)]} zu ${WORD[Math.min(sa, sb)]}.` };
  }
}

// Die geheime Antwort sieht der Ratende erst, nachdem er geraten hat.
export function view(state, me) {
  if (state.phase === 'raten' && me !== state.subject) return { ...state, answer: null };
  return state;
}

export function render(el, s, game) {
  const e = game.esc;
  const isSubject = s.subject === game.me;
  const guesserId = other(s, s.subject).id;
  const subjectName = e(game.name(s.subject));
  const guesserName = e(game.name(guesserId));
  const who = (id) => `<span class="marker" style="color:${game.color(id)}"></span> ${id === game.me ? 'Du' : e(game.name(id))}`;

  const header = `
    <div class="kdm-head">
      <span class="muted">Runde ${Math.min(s.round, ROUNDS)} von ${ROUNDS}</span>
      <span class="kdm-points">${s.players.map((p) => `${who(p.id)} <b class="num kdm-num">${s.score[p.id]}</b>`).join('<span class="muted">·</span>')}</span>
    </div>`;
  const question = s.question
    ? `<div><p class="muted kdm-asker">${isSubject ? 'Deine Frage' : `Frage von ${subjectName}`}</p><p class="kdm-question">${e(s.question)}</p></div>`
    : '';

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
               <p class="muted kdm-hint" id="kdm-a-hint">${guesserName} sieht sie erst nach dem Raten.</p>
             </div>
             <div><button class="btn primary">Frage stellen</button></div>
           </form>`
        : `<p class="status">${subjectName} schreibt gerade eine Frage.</p>`;
      break;
    case 'raten':
      body = isSubject
        ? `${question}<p class="status">${guesserName} rät gerade.</p>`
        : `${question}
           <form class="kdm-form" data-action="raten">
             <div>
               <label for="kdm-g">Deine Vermutung</label>
               <input name="guess" id="kdm-g" maxlength="200" required autofocus>
             </div>
             <div><button class="btn primary">Raten</button></div>
           </form>`;
      break;
    case 'pruefen':
      body = `${question}
        <dl class="kdm-compare">
          <dt>${isSubject ? `${guesserName} hat geraten` : 'Du hast geraten'}</dt><dd>${e(s.guess)}</dd>
          <dt>${isSubject ? 'Deine Antwort' : `Antwort von ${subjectName}`}</dt><dd>${e(s.answer)}</dd>
        </dl>
        ${isSubject
          ? `<p class="status">Zählt das als richtig?</p>
             <div class="row">
               <button class="btn primary" data-action="pruefen" data-value="true">Richtig</button>
               <button class="btn" data-action="pruefen" data-value="false">Daneben</button>
             </div>`
          : `<p class="status">${subjectName} entscheidet, ob das zählt.</p>`}`;
      break;
    case 'aufgedeckt':
      body = `${question}
        <dl class="kdm-compare">
          <dt>Antwort</dt><dd>${e(s.answer)}</dd>
          <dt>Geraten</dt><dd>${e(s.guess)}</dd>
        </dl>
        <p class="big ${s.correct ? 'ok' : ''}">${s.correct ? `Richtig. Ein Punkt für ${guesserId === game.me ? 'dich' : guesserName}.` : 'Daneben. Kein Punkt.'}</p>
        ${game.result ? '' : '<div><button class="btn primary" data-action="weiter">Nächste Runde</button></div>'}`;
      break;
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
  .kdm-points { display: inline-flex; gap: 10px; align-items: baseline; }
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
  @media (max-width: 420px) { .kdm-compare { grid-template-columns: 1fr; gap: 2px; } .kdm-compare dd { margin-bottom: 8px; } }
`;
