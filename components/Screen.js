'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import GameView from './GameView';
import { playerColor } from '@/lib/colors';

/*
  Der Bildschirm einer Gruppe: ein Mitglied, das nicht mitspielt und alles groß zeigt, z.B. ein Fernseher
  oder Laptop mit eigenem Konto (gewählt in der Lobby, lib/room.js: data.screen).
  Ohne Spiel stehen die gewonnenen Spiele, wer gerade da ist, und der Verlauf da. Beim Spielbeginn kommt
  kurz eine Startkarte (Name, Beschreibung, wer mitspielt), dann zeichnet present() des Spiels; Spiele
  ohne present() (oder wenn in der Lobby „Nur die Punktetafel“ gewählt ist) bekommen eine Tafel: wer dran
  ist, die Punkte der Partie (points() des Spiels) und die gewonnenen Spiele. Am Ende steht das Ergebnis
  groß über dem Spielfeld. Reaktionen der Spieler steigen groß auf.
  Eingaben gibt es keine: Gespielt und gestartet wird auf den Handys.
*/
export default function Screen({ snap, code, now, refresh, live, reactions, send, goHome, online }) {
  useTvMode();
  useWakeLock();
  const awake = useAwake();
  const players = snap.players.map(({ id, name }) => ({ id, name }));
  const game = snap.game;
  const intro = useStartCard(game, snap.now);
  const board = game && !(game.present && !game.error); // die Tafel nennt das Spiel selbst groß
  const title = [snap.group?.name, board || intro ? null : game?.name].filter(Boolean).join(', ');
  const winners = game?.result?.winners ?? [];

  return (
    <div className={`tv ${awake ? 'awake' : ''}`} id="tv">
      <header className="tv-head">
        <p className="tv-where">{title}</p>
        <div className="tv-tools">
          <FullscreenButton />
          <button className="link" id="tv-home" onClick={goHome}>
            Startseite
          </button>
        </div>
      </header>

      {!game ? (
        <TvLobby snap={snap} send={send} online={online} />
      ) : intro ? (
        <StartCard snap={snap} />
      ) : !board ? (
        <div className="tv-stage">
          {game.result && (
            <p className="tv-result" style={{ color: winners.length === 1 ? playerColor(players, winners[0]) : undefined }}>
              {game.result.text ?? 'Spiel vorbei.'}
            </p>
          )}
          <GameView
            game={game}
            players={players}
            me={snap.me}
            room={code}
            now={now}
            onAction={() => Promise.resolve(false)}
            onRefresh={refresh}
            live={live}
            present
          />
        </div>
      ) : (
        <TvBoard snap={snap} />
      )}

      <div className="react-layer tv-react" ref={reactions.layer} aria-hidden="true" />
      <div className="sr-only" role="status" aria-live="polite">
        {reactions.said}
      </div>
    </div>
  );
}

// --- Spielbeginn: Name und kurze Beschreibung, danach baut sich das Spielfeld auf ---

const START_CARD = 3200; // ms

// Läuft eine Partie erst seit wenigen Sekunden, steht zuerst die Startkarte da (einmal pro Partie).
function useStartCard(game, serverNow) {
  const [showing, setShowing] = useState(null); // started der Partie, deren Karte gerade steht
  const seen = useRef(new Set());
  const started = game?.started ?? 0;
  useEffect(() => {
    if (!started || seen.current.has(started)) return;
    seen.current.add(started);
    if (game.result || serverNow - started > 8000) return; // schon länger im Gange: gleich das Spielfeld
    setShowing(started);
    const timer = setTimeout(() => setShowing((s) => (s === started ? null : s)), START_CARD);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);
  return showing !== null && showing === started;
}

function StartCard({ snap }) {
  const info = snap.games.find((g) => g.id === snap.game.id);
  const { players } = snap;
  return (
    <section className="tv-start" aria-live="polite">
      <p className="tv-start-kicker">Neues Spiel</p>
      <h1 className="tv-start-name">{snap.game.name}</h1>
      {info?.description && <p className="tv-start-desc">{info.description}</p>}
      <ul className="tv-start-players" aria-label="Es spielen">
        {players.map((p, i) => (
          <li key={p.id} style={{ '--c': playerColor(players, p.id), '--i': i }}>
            <span className="marker" aria-hidden="true" />
            {p.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Ohne Spiel: gewonnene Spiele und Verlauf ---

function TvLobby({ snap, send, online }) {
  const { players } = snap;
  return (
    <div className="tv-lobby">
      <section className="tv-wins" aria-label="Gewonnene Spiele">
        <h1 className="tv-title">Gewonnene Spiele</h1>
        <ol className={`tv-wins-list ${players.length > 3 ? 'many' : ''}`}>
          {players.map((p, i) => (
            <li key={p.id} style={{ '--c': playerColor(players, p.id), '--i': i }}>
              <span className="tv-who">
                <span className="marker" aria-hidden="true" />
                <span className="tv-name">{p.name}</span>
                {online && !online.has(p.id) && <small className="tv-away">gerade nicht da</small>}
              </span>
              <CountUp className="tv-wins-num" value={p.score} />
            </li>
          ))}
        </ol>
      </section>

      {snap.history?.length > 0 && (
        <section className="tv-history" aria-label="Zuletzt gespielt">
          <h2 className="tv-sub">Zuletzt gespielt</h2>
          <ol>
            {snap.history.slice(0, 6).map((r, i) => (
              <li key={i}>
                <time dateTime={r.finished_at}>{when(r.finished_at)}</time>
                <span className="tv-history-game">{r.game_name}</span>
                <span className="tv-history-text">{r.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="tv-foot">
        <p className="muted">Dieses Gerät spielt nicht mit. Spiele startet ihr auf euren Handys.</p>
        <button className="link" id="tv-release" onClick={() => send({ t: 'screen', user: null })}>
          Nicht mehr Bildschirm sein
        </button>
      </div>
    </div>
  );
}

const when = (iso) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};

// --- Im Spiel ohne present(): Tafel mit Punkten der Partie, wer dran ist und gewonnenen Spielen ---

const names = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} und ${list.at(-1)}`);

function turnText(players, waiting) {
  const ids = players.filter((p) => waiting.includes(p.id));
  if (!ids.length) return '';
  if (ids.length === players.length && players.length > 2) return 'Alle sind dran.';
  return `${names(ids.map((p) => p.name))} ${ids.length === 1 ? 'ist' : 'sind'} dran.`;
}

function TvBoard({ snap }) {
  const { game, players } = snap;
  const done = Boolean(game.result);
  const waiting = done ? [] : (game.waiting ?? []);
  // Sind alle gleichzeitig dran, sagt das die Zeile darüber; hervorgehoben wird nur, wer allein dran ist.
  const everyone = players.length > 2 && players.every((p) => waiting.includes(p.id));
  const pts = game.points && typeof game.points === 'object' ? game.points : null;
  const hasPts = Boolean(pts) && players.some((p) => Number.isFinite(pts[p.id]));
  const winners = game.result?.winners ?? [];
  const single = winners.length === 1 ? winners[0] : null;
  const status = done ? (game.result.text ?? 'Spiel vorbei.') : turnText(players, waiting);

  return (
    <section className={`tv-board ${hasPts ? 'has-pts' : ''} ${done ? 'is-done' : ''} ${players.length > 4 ? 'many' : ''}`} aria-label={game.name}>
      <h1 className="tv-title">{game.name}</h1>
      <p className="tv-status" style={{ color: single ? playerColor(players, single) : undefined }} aria-live="polite">
        {status}
      </p>
      {game.error && <p className="muted">{game.error}</p>}
      <div className="tv-table" role="table" aria-label="Punktestand">
        <div className="tv-row tv-row-head" role="row">
          <span role="columnheader">Spieler</span>
          {hasPts && <span role="columnheader">Diese Partie</span>}
          <span role="columnheader">Gewonnen</span>
        </div>
        {players.map((p, i) => {
          const turn = !everyone && waiting.includes(p.id);
          return (
            <div
              key={p.id}
              role="row"
              className={`tv-row ${turn ? 'is-turn' : ''} ${winners.includes(p.id) ? 'won' : ''}`}
              style={{ '--c': playerColor(players, p.id), '--i': i }}
            >
              <span className="tv-who" role="cell">
                <span className="marker" aria-hidden="true" />
                <span className="tv-name">{p.name}</span>
                <span className="tv-turn" aria-hidden={!turn}>
                  dran
                </span>
              </span>
              {hasPts && <CountUp className="tv-pts" value={Number.isFinite(pts[p.id]) ? pts[p.id] : 0} role="cell" />}
              <CountUp className="tv-wins-num" value={p.score} role="cell" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Zahl, die bei einer Änderung hochzählt (ohne Bewegung: springt sofort). Den Text setzt nur der Effekt,
// nicht React, damit das Hochzählen und React sich nicht in die Quere kommen.
function CountUp({ value, className, role }) {
  const ref = useRef(null);
  const shown = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const from = shown.current;
    shown.current = value;
    if (from === null || from === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = String(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 650);
      el.textContent = String(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    el.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = String(value);
    };
  }, [value]);
  return <b className={`num ${className}`} ref={ref} role={role} />;
}

// --- Gerät ---

// Große Schrift und volle Breite für die ganze Seite, solange der Bildschirm zu sehen ist
function useTvMode() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('tv-mode');
    return () => html.classList.remove('tv-mode');
  }, []);
}

// Der Bildschirm soll nicht ausgehen, während alle zuschauen (wo der Browser das kann).
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let gone = false;
    const get = async () => {
      if (gone || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (gone) l.release().catch(() => {});
        else lock = l;
      } catch {}
    };
    get();
    const onVisible = () => get();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

// Bedienelemente (Vollbild, Startseite) nur kurz nach einer Bewegung der Maus oder einer Taste zeigen
function useAwake() {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setAwake(false), 4000);
    const wake = () => {
      setAwake(true);
      clearTimeout(timer);
      timer = setTimeout(() => setAwake(false), 4000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'focusin'];
    for (const e of events) window.addEventListener(e, wake);
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, []);
  return awake;
}

function FullscreenButton() {
  const [can, setCan] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    setCan(Boolean(document.fullscreenEnabled));
    const sync = () => setFull(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!can) return null;
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <button className="link" id="tv-full" onClick={toggle}>
      {full ? 'Vollbild beenden' : 'Vollbild'}
    </button>
  );
}
