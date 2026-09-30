// Wie gut kennst du mich? – Beispiel für ein Spiel mit eigenen Texten und mehreren Phasen.
// Abwechselnd denkt sich einer eine Frage über sich aus (mit geheimer Antwort),
// der andere rät, und der Fragende entscheidet, ob es stimmt.

export const meta = {
  name: 'Wie gut kennst du mich?',
  emoji: '💞',
  description: 'Stellt euch Fragen über euch selbst – wer rät öfter richtig?',
  players: [2, 2],
};

const ROUNDS = 6;

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
    state.result = { winners: [a.id, b.id], text: `Gleichstand ${sa}:${sb} – ihr kennt euch gleich gut! 💞` };
  } else {
    const winner = sa > sb ? a : b;
    state.result = { winners: [winner.id], text: `${winner.name} hat öfter richtig geraten! (${Math.max(sa, sb)}:${Math.min(sa, sb)})` };
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
  const subjectName = e(game.name(s.subject));
  const guesserName = e(other(s, s.subject).name);
  const header = `
    <div class="row kdm-head">
      <span class="muted">Runde ${Math.min(s.round, ROUNDS)} von ${ROUNDS}</span>
      <span>${s.players.map((p) => `${p.id === game.me ? 'Du' : e(p.name)} <b>${s.score[p.id]}</b>`).join(' · ')}</span>
    </div>`;
  const questionCard = s.question ? `<div class="card kdm-question">„${e(s.question)}“</div>` : '';

  let body = '';
  switch (s.phase) {
    case 'fragen':
      body = isSubject
        ? `<form class="card stack" data-action="fragen">
             <p class="big">Du bist dran! Stell eine Frage über dich.</p>
             <div class="row nowrap">
               <input name="question" id="kdm-q" placeholder="z.B. Was ist mein Lieblingsessen?" maxlength="200" required>
               <button type="button" class="btn" id="kdm-idea" title="Zufällige Idee">🎲</button>
             </div>
             <input name="answer" placeholder="Deine Antwort (bleibt geheim)" maxlength="200" required>
             <button class="btn primary">Frage stellen</button>
           </form>`
        : `<p class="status">${subjectName} denkt sich eine Frage aus …</p>`;
      break;
    case 'raten':
      body = isSubject
        ? `${questionCard}<p class="status">${guesserName} rät gerade …</p>`
        : `${questionCard}
           <form class="card stack" data-action="raten">
             <input name="guess" placeholder="Deine Vermutung" maxlength="200" required autofocus>
             <button class="btn primary">Raten</button>
           </form>`;
      break;
    case 'pruefen':
      body = `${questionCard}
        <div class="card stack">
          <p>${isSubject ? `${guesserName} sagt` : 'Du hast gesagt'}: <b>${e(s.guess)}</b></p>
          <p>${isSubject ? 'Deine Antwort' : `Antwort von ${subjectName}`}: <b>${e(s.answer)}</b></p>
        </div>
        ${isSubject
          ? `<p class="status">Hat ${guesserName} recht?</p>
             <div class="row center">
               <button class="btn primary" data-action="pruefen" data-value="true">Richtig ✓</button>
               <button class="btn" data-action="pruefen" data-value="false">Daneben ✗</button>
             </div>`
          : `<p class="status">${subjectName} entscheidet, ob das zählt …</p>`}`;
      break;
    case 'aufgedeckt':
      body = `${questionCard}
        <div class="card stack">
          <p>Antwort: <b>${e(s.answer)}</b></p>
          <p>Geraten: <b>${e(s.guess)}</b></p>
          <p class="big ${s.correct ? 'ok' : 'bad'}">${s.correct ? 'Richtig! +1 für ' + guesserName : 'Leider daneben'}</p>
        </div>
        ${game.result ? '' : '<div class="row center"><button class="btn primary" data-action="weiter">Nächste Runde</button></div>'}`;
      break;
  }

  el.innerHTML = header + body;

  // Kleiner Helfer, der nur im eigenen Browser passiert (kein Spielzug).
  el.querySelector('#kdm-idea')?.addEventListener('click', () => {
    el.querySelector('#kdm-q').value = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  });
}

export const style = `
  .kdm-head { justify-content: space-between; }
  .kdm-question { font-size: 1.3rem; font-weight: 650; text-align: center; }
`;
