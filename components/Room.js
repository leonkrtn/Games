'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { account, roomApi } from './api';
import GameView from './GameView';
import { getSupabase } from '@/lib/supabase-browser';
import { playerColor } from '@/lib/colors';

// Das gemeinsame Spielzimmer mit einer befreundeten Person.
export default function Room({ code, user, goHome, showToast, onUnauthorized }) {
  const [snap, setSnap] = useState(null);
  const [online, setOnline] = useState(null); // Set von Konto-IDs, null = unbekannt
  const [connected, setConnected] = useState(true);
  const versionRef = useRef(-1);
  const clockRef = useRef(0); // Serverzeit minus eigene Uhr

  // Nur neuere Stände übernehmen (Antworten können in anderer Reihenfolge ankommen).
  const accept = useCallback((s) => {
    if (typeof s.now === 'number') clockRef.current = s.now - Date.now();
    if (s.version < versionRef.current) return;
    versionRef.current = s.version;
    setSnap(s);
  }, []);
  const now = useCallback(() => Date.now() + clockRef.current, []);

  const fail = useCallback(
    (err) => {
      if (err.status === 401) onUnauthorized();
      else if (err.status === 403 || err.status === 404) {
        showToast(err.message);
        goHome();
      } else if (err.offline) setConnected(false);
      else showToast(err.message);
    },
    [goHome, onUnauthorized, showToast],
  );

  const refresh = useCallback(async () => {
    try {
      accept(await roomApi({ t: 'state', room: code }));
      setConnected(true);
    } catch (err) {
      fail(err);
    }
  }, [accept, code, fail]);

  const send = useCallback(
    async (msg) => {
      try {
        accept(await roomApi({ ...msg, room: code }));
      } catch (err) {
        fail(err);
      }
    },
    [accept, code, fail],
  );

  const onAction = useCallback((type, data) => send({ t: 'action', type, data }), [send]);

  // Live-Updates: Supabase Realtime sagt Bescheid, wenn sich etwas geändert hat.
  // Ohne Supabase (lokaler Testmodus) wird jede Sekunde nachgefragt.
  useEffect(() => {
    versionRef.current = -1;
    refresh();
    const supabase = getSupabase();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);

    if (!supabase) {
      const timer = setInterval(refresh, 1000);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }

    const channel = supabase.channel(`room:${code}`, { config: { presence: { key: user.id } } });
    channel
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (!(payload?.version <= versionRef.current)) refresh();
      })
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          channel.track({ since: Date.now() });
          refresh(); // falls während der Verbindungspause etwas passiert ist
        } else if (status !== 'CLOSED') {
          setConnected(false);
        }
      });

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
      setOnline(null);
    };
  }, [code, refresh, user.id]);

  const unfriend = async () => {
    const other = snap.players.find((p) => p.id !== user.id);
    if (!confirm(`Freundschaft mit ${other?.name} beenden? Euer Spielzimmer mit Punkten und Verlauf wird gelöscht.`))
      return;
    try {
      await account({ t: 'friend-remove', room: code });
      goHome();
    } catch (err) {
      showToast(err.message);
    }
  };

  const back = (
    <button className="link back" id="back" onClick={goHome}>
      Alle Freunde
    </button>
  );

  if (!snap) {
    return (
      <div className="room-loading">
        {back}
        <p className="muted">Lädt …</p>
      </div>
    );
  }

  const players = snap.players.map(({ id, name }) => ({ id, name }));

  return (
    <>
      <div className="room">
        <aside className="side">
          {back}
          <p className="board-caption">Gewonnene Spiele</p>
          <Scoreboard snap={snap} online={online} />
        </aside>

        <div>
          {snap.game ? (
            <div id="game-wrap">
              <div className="game-head">
                <h2 className="section-title">{snap.game.name}</h2>
                <button id="to-lobby" className="link" onClick={() => send({ t: 'lobby' })}>
                  Anderes Spiel
                </button>
              </div>
              {snap.game.result && <Result result={snap.game.result} players={players} send={send} />}
              <GameView
                game={snap.game}
                players={players}
                me={snap.me}
                room={code}
                now={now}
                onAction={onAction}
                onRefresh={refresh}
              />
            </div>
          ) : (
            <Lobby snap={snap} send={send} unfriend={unfriend} />
          )}
        </div>
      </div>
      <ConnectionNote show={!connected} />
    </>
  );
}

// Anzeigetafel: Namen und Punkte in den Spielerfarben.
function Scoreboard({ snap, online }) {
  return (
    <div className="scoreboard" aria-label="Punktestand">
      {snap.players.map((p) => {
        const away = online && !online.has(p.id);
        return (
          <div className="team" key={p.id}>
            <div>
              <div className="team-name">
                <span className="marker" style={{ color: playerColor(snap.players, p.id) }} aria-hidden="true" />
                {p.name}
                {p.id === snap.me && <small>du</small>}
              </div>
              {away && <span className="team-away">gerade nicht da</span>}
            </div>
            <div className="team-score" style={{ color: playerColor(snap.players, p.id) }}>
              {p.score}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Result({ result, players, send }) {
  const single = result.winners?.length === 1 ? result.winners[0] : null;
  return (
    <div id="result" className="result">
      <p className="result-text" style={{ color: single ? playerColor(players, single) : 'var(--ink)' }}>
        {result.text ?? 'Spiel vorbei.'}
      </p>
      <div className="row">
        <button className="btn primary" data-cmd="restart" onClick={() => send({ t: 'restart' })}>
          Nochmal
        </button>
        <button className="btn" data-cmd="lobby" onClick={() => send({ t: 'lobby' })}>
          Anderes Spiel
        </button>
      </div>
    </div>
  );
}

function Lobby({ snap, send, unfriend }) {
  const n = snap.players.length;
  const [open, setOpen] = useState(null); // Spiel mit Optionen, das gerade eingestellt wird
  return (
    <div id="lobby">
      <h2 className="section-title">Spiele</h2>
      <ul className="game-list">
        {snap.games.map((g) => {
          const [min, max] = g.players;
          const fits = n >= min && n <= max;
          const count = min === max ? `${min} Spieler` : `${min} bis ${max} Spieler`;
          const options = g.options?.length > 0;
          return (
            <li key={g.id}>
              <button
                className="game-row"
                data-game={g.id}
                disabled={!fits}
                aria-expanded={options ? open === g.id : undefined}
                onClick={() =>
                  options ? setOpen(open === g.id ? null : g.id) : send({ t: 'choose', game: g.id })
                }
              >
                <span className="game-name">{g.name}</span>
                <span className="game-desc">{g.description}</span>
                <span className="game-meta">
                  {fits ? count : n < min ? `braucht ${min} Spieler` : `höchstens ${max}`}
                </span>
              </button>
              {options && open === g.id && fits && (
                <GameOptions
                  game={g}
                  initial={snap.lastOptions?.[g.id]}
                  onStart={(chosen) => send({ t: 'choose', game: g.id, options: chosen })}
                />
              )}
            </li>
          );
        })}
      </ul>

      {snap.history?.length > 0 && <History items={snap.history} />}

      <div className="room-foot">
        <button className="link" id="unfriend" onClick={unfriend}>
          Freundschaft beenden
        </button>
        <span>
          Neue Spiele kommen als Datei in den Ordner <code>games/</code>.
        </span>
      </div>
    </div>
  );
}

// Einstellungen vor dem Start (meta.options des Spiels), vorbelegt mit der letzten Wahl in diesem Zimmer.
function GameOptions({ game, initial, onStart }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      game.options.map((o) => [
        o.id,
        o.choices.some((c) => c.value === initial?.[o.id]) ? initial[o.id] : o.choices[0].value,
      ]),
    ),
  );
  return (
    <form
      className="game-options"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(values);
      }}
    >
      {game.options.map((o) => (
        <fieldset key={o.id}>
          <legend className="label">{o.label}</legend>
          <div className="choices">
            {o.choices.map((c) => (
              <label key={String(c.value)} className="choice">
                <input
                  type="radio"
                  name={`${game.id}-${o.id}`}
                  checked={values[o.id] === c.value}
                  onChange={() => setValues((v) => ({ ...v, [o.id]: c.value }))}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button className="btn primary" type="submit" data-start={game.id}>
        Starten
      </button>
    </form>
  );
}

function History({ items }) {
  const format = (iso) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };
  return (
    <section className="history">
      <h2 className="section-title">Zuletzt gespielt</h2>
      <table>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              <td>
                <time dateTime={r.finished_at}>{format(r.finished_at)}</time>
              </td>
              <td>{r.game_name}</td>
              <td>{r.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ConnectionNote({ show }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return setVisible(false);
    const timer = setTimeout(() => setVisible(true), 1500); // kurze Aussetzer nicht anzeigen
    return () => clearTimeout(timer);
  }, [show]);
  return visible ? (
    <div className="conn" id="conn" role="status">
      Verbindung wird hergestellt
    </div>
  ) : null;
}
