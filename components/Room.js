'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { account, roomApi } from './api';
import GameView from './GameView';
import { createLive, relay } from './live';
import { countWord } from './Home';
import { getSupabase } from '@/lib/supabase-browser';
import { playerColor } from '@/lib/colors';

const GROUP_MAX = 6;

// Das gemeinsame Spielzimmer mit einer befreundeten Person oder einer Gruppe.
export default function Room({ code, user, goHome, showToast, onUnauthorized }) {
  const [snap, setSnap] = useState(null);
  const [online, setOnline] = useState(null); // Set von Konto-IDs, null = unbekannt
  const [connected, setConnected] = useState(true);
  const versionRef = useRef(-1);
  const clockRef = useRef(0); // Serverzeit minus eigene Uhr
  const live = useMemo(() => createLive(), [code]); // game.live: schnelle Nachrichten zwischen den Browsern

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
        const s = await roomApi({ ...msg, room: code });
        if (s.left) return goHome(); // Gruppe verlassen
        accept(s);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [accept, code, fail, goHome],
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
      const stopLive = relay(live, code);
      return () => {
        clearInterval(timer);
        stopLive();
        document.removeEventListener('visibilitychange', onVisible);
      };
    }

    let joined = false;
    const channel = supabase.channel(`room:${code}`, { config: { presence: { key: user.id } } });
    channel
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (!(payload?.version <= versionRef.current)) refresh();
      })
      .on('broadcast', { event: 'live' }, ({ payload }) => live.receive(payload))
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        joined = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          channel.track({ since: Date.now() });
          refresh(); // falls während der Verbindungspause etwas passiert ist
        } else if (status !== 'CLOSED') {
          setConnected(false);
        }
      });
    // Live-Nachrichten der Spiele direkt an die anderen Browser (ohne Verbindung: verwerfen, nicht nachschicken)
    const stopLive = live.use((payload) => {
      if (joined) channel.send({ type: 'broadcast', event: 'live', payload });
    });

    return () => {
      stopLive();
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
      setOnline(null);
    };
  }, [code, refresh, user.id, live]);

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

  const leave = () => {
    if (confirm(`Gruppe „${snap.group.name}“ verlassen? Deine Punkte in der Gruppe sind dann weg.`)) send({ t: 'group-leave' });
  };

  const back = (
    <button className="link back" id="back" onClick={goHome}>
      Startseite
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
          {snap.group && <h1 className="room-name">{snap.group.name}</h1>}
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
                live={live}
              />
            </div>
          ) : (
            <Lobby snap={snap} send={send} unfriend={unfriend} leave={leave} showToast={showToast} />
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
    <div className={`scoreboard ${snap.players.length > 2 ? 'many' : ''}`} aria-label="Punktestand">
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

function Lobby({ snap, send, unfriend, leave, showToast }) {
  const n = snap.players.length;
  const [open, setOpen] = useState(null); // Spiel mit Optionen, das gerade eingestellt wird
  const [edit, setEdit] = useState(null); // Gruppe: 'add' | 'rename' | null
  return (
    <div id="lobby">
      <h2 className="section-title">Spiele</h2>
      <ul className="game-list">
        {snap.games.map((g) => {
          const [min, max] = g.players;
          const fits = n >= min && n <= max;
          const count = min === max ? `${countWord(min)} Spieler` : `${countWord(min)} bis ${countWord(max)} Spieler`;
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
                  {fits ? count : n < min ? `braucht ${countWord(min)} Spieler` : `höchstens ${countWord(max)}`}
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

      {edit === 'add' && <AddMember snap={snap} send={send} close={() => setEdit(null)} showToast={showToast} />}
      {edit === 'rename' && <RenameGroup snap={snap} send={send} close={() => setEdit(null)} />}

      <div className="room-foot">
        {snap.group ? (
          <>
            {n < GROUP_MAX && (
              <button className="link" id="group-add" aria-expanded={edit === 'add'} onClick={() => setEdit(edit === 'add' ? null : 'add')}>
                Freund dazuholen
              </button>
            )}
            <button className="link" id="group-rename" aria-expanded={edit === 'rename'} onClick={() => setEdit(edit === 'rename' ? null : 'rename')}>
              Umbenennen
            </button>
            <button className="link" id="group-leave" onClick={leave}>
              Gruppe verlassen
            </button>
          </>
        ) : (
          <button className="link" id="unfriend" onClick={unfriend}>
            Freundschaft beenden
          </button>
        )}
        <span>
          Neue Spiele kommen als Datei in den Ordner <code>games/</code>.
        </span>
      </div>
    </div>
  );
}

// Gruppe: eigene Freunde dazuholen (nur in der Lobby, die Liste kommt von der Startseite).
function AddMember({ snap, send, close, showToast }) {
  const [friends, setFriends] = useState(null);
  const [chosen, setChosen] = useState('');
  const members = snap.players.map((p) => p.id).join(' '); // nur neu laden, wenn sich die Mitglieder ändern
  useEffect(() => {
    let live = true;
    account({ t: 'home' })
      .then((r) => {
        if (!live) return;
        const list = r.friends.map((f) => f.user).filter((u) => !members.split(' ').includes(u.id));
        setFriends(list);
        setChosen(list[0]?.id ?? '');
      })
      .catch((err) => showToast(err.message));
    return () => {
      live = false;
    };
  }, [members, showToast]);

  const submit = async (e) => {
    e.preventDefault();
    if (chosen && (await send({ t: 'group-add', user: chosen }))) close();
  };
  return (
    <form className="group-edit" onSubmit={submit}>
      <h2 className="section-title">Freund dazuholen</h2>
      {!friends ? (
        <p className="muted">Lädt …</p>
      ) : friends.length === 0 ? (
        <p className="empty">Alle deine Freunde sind schon in der Gruppe.</p>
      ) : (
        <>
          <label htmlFor="group-friend">Freund</label>
          <div className="row nowrap">
            <select id="group-friend" value={chosen} onChange={(e) => setChosen(e.target.value)}>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button className="btn">Dazuholen</button>
          </div>
        </>
      )}
    </form>
  );
}

function RenameGroup({ snap, send, close }) {
  const [name, setName] = useState(snap.group.name);
  const submit = async (e) => {
    e.preventDefault();
    if (await send({ t: 'group-rename', name })) close();
  };
  return (
    <form className="group-edit" onSubmit={submit}>
      <h2 className="section-title">Umbenennen</h2>
      <label htmlFor="group-new-name">Name der Gruppe</label>
      <div className="row nowrap">
        <input id="group-new-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />
        <button className="btn">Speichern</button>
      </div>
    </form>
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
