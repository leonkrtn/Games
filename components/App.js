'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';
import GameView from './GameView';
import { playerColor } from '@/lib/colors';
import {
  pushSupport,
  registerServiceWorker,
  currentSubscription,
  subscribe,
  clearNotifications,
  isIos,
  isStandalone,
} from '@/lib/push-client';

const storage = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  del: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

const randomString = (length) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => (b % 36).toString(36)).join('');

// Wer bin ich? Die ID sehen alle, der Token bleibt geheim und beweist dem Server, dass ich es bin.
function loadIdentity() {
  let id = storage.get('spielzimmer.id');
  let token = storage.get('spielzimmer.token');
  if (!id) storage.set('spielzimmer.id', (id = randomString(16)));
  if (!token) storage.set('spielzimmer.token', (token = randomString(32)));
  return { id, token };
}

async function callServer(msg) {
  let res;
  try {
    res = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
  } catch {
    throw Object.assign(new Error('Keine Verbindung. Versuch es gleich nochmal.'), { offline: true });
  }
  const data = await res.json().catch(() => ({ error: 'Der Server hat nicht geantwortet.' }));
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status, code: data.code });
  return data;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState(null); // aktueller Stand vom Server
  const [roomCode, setRoomCode] = useState(null);
  const [online, setOnline] = useState(null); // Set von Spieler-IDs, null = unbekannt
  const [connected, setConnected] = useState(true);
  const [toast, setToast] = useState(null);
  const [claim, setClaim] = useState(null); // Name schon im Raum: { room, name, message }

  const me = useRef(null);
  const roomRef = useRef(null);
  const versionRef = useRef(-1);

  const showToast = useCallback((text) => setToast({ text, at: Date.now() }), []);

  // Nur neuere Stände übernehmen (Antworten können in anderer Reihenfolge ankommen).
  const accept = useCallback((s) => {
    if (s.room !== roomRef.current || s.version < versionRef.current) return;
    versionRef.current = s.version;
    setSnap(s);
  }, []);

  const call = useCallback(
    (msg) =>
      callServer({ ...msg, room: msg.room ?? roomRef.current, playerId: me.current.id, token: me.current.token }),
    [],
  );

  // Für Meldungen beim Schließen/Wegwechseln: sendBeacon kommt auch dann noch an.
  const beacon = useCallback((msg) => {
    const body = JSON.stringify({ ...msg, room: roomRef.current, playerId: me.current.id, token: me.current.token });
    navigator.sendBeacon?.('/api/room', new Blob([body], { type: 'application/json' }));
  }, []);

  const resetRoom = useCallback(() => {
    roomRef.current = null;
    versionRef.current = -1;
    setRoomCode(null);
    setSnap(null);
    storage.del('spielzimmer.room');
    history.replaceState(null, '', location.pathname);
  }, []);

  const enter = useCallback(
    async (code, name, takeover = false) => {
      storage.set('spielzimmer.name', name);
      try {
        const s = await call({ t: 'join', room: code, name, takeover });
        // Platz übernommen: ab jetzt ist dieses Gerät dieser Spieler.
        if (s.me !== me.current.id) {
          me.current.id = s.me;
          storage.set('spielzimmer.id', s.me);
        }
        setClaim(null);
        roomRef.current = s.room;
        versionRef.current = -1;
        storage.set('spielzimmer.room', s.room);
        history.replaceState(null, '', `?raum=${s.room}`);
        setRoomCode(s.room);
        accept(s);
      } catch (err) {
        if (err.code === 'name_taken') setClaim({ room: code, name, message: err.message });
        else showToast(err.message);
      } finally {
        setReady(true);
      }
    },
    [accept, call, showToast],
  );

  const refresh = useCallback(async () => {
    if (!roomRef.current) return;
    try {
      accept(await call({ t: 'state' }));
      setConnected(true);
    } catch (err) {
      if (err.offline) return setConnected(false);
      if (err.status === 403 || err.status === 404) {
        resetRoom();
        showToast(err.message);
      }
    }
  }, [accept, call, resetRoom, showToast]);

  const send = useCallback(
    async (msg) => {
      try {
        accept(await call(msg));
      } catch (err) {
        showToast(err.message);
      }
    },
    [accept, call, showToast],
  );

  const onAction = useCallback((type, data) => send({ t: 'action', type, data }), [send]);

  const leave = useCallback(async () => {
    try {
      await call({ t: 'leave' });
    } catch {}
    resetRoom();
  }, [call, resetRoom]);

  // Beim Öffnen: direkt zurück in den letzten Raum (oder den aus dem Link).
  useEffect(() => {
    registerServiceWorker();
    clearNotifications();
    me.current = loadIdentity();
    const urlRoom = new URLSearchParams(location.search).get('raum')?.toUpperCase() ?? null;
    const name = storage.get('spielzimmer.name');
    const room = urlRoom ?? storage.get('spielzimmer.room');
    if (name && room) enter(room, name);
    else setReady(true);
  }, [enter]);

  // Live-Updates: Supabase Realtime sagt Bescheid, wenn sich etwas geändert hat.
  // Ohne Supabase (lokaler Testmodus) wird jede Sekunde nachgefragt.
  useEffect(() => {
    if (!roomCode) return;
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

    const channel = supabase.channel(`room:${roomCode}`, { config: { presence: { key: me.current.id } } });
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
      setConnected(true);
    };
  }, [roomCode, refresh]);

  if (!ready) return null;

  return (
    <>
      <main className="shell">
        {snap ? (
          <Room
            snap={snap}
            online={online}
            send={send}
            onAction={onAction}
            leave={leave}
            showToast={showToast}
            call={call}
            beacon={beacon}
          />
        ) : (
          <Start enter={enter} claim={claim} setClaim={setClaim} showToast={showToast} />
        )}
      </main>
      <ConnectionNote show={!!roomCode && !connected} />
      <Toast toast={toast} />
    </>
  );
}

// ---------------------------------------------------------------------------

function Wordmark() {
  return (
    <div className="wordmark">
      {/* Gleiches Zeichen wie das Favicon (app/icon.svg): roter und schwarzer Stein über Eck */}
      <svg className="mark" viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges">
        <rect width="16" height="16" fill="var(--p1)" />
        <rect x="16" y="16" width="16" height="16" fill="var(--p2)" />
      </svg>
      Spielzimmer
    </div>
  );
}

function Start({ enter, claim, setClaim, showToast }) {
  const [name, setName] = useState(() => storage.get('spielzimmer.name') ?? '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('raum')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);

  const go = async (room, takeover = false) => {
    if (!name.trim()) return showToast('Wie heißt du?');
    if (room !== null && !/^[A-Za-z]{4}$/.test(room)) return showToast('Der Raum-Code hat 4 Buchstaben.');
    setBusy(true);
    await enter(room?.toUpperCase() ?? null, name.trim(), takeover);
    setBusy(false);
  };

  return (
    <section className="start">
      <div>
        <h1 className="start-title">Spielzimmer</h1>
        <p className="start-intro">
          Hier spielt ihr zu zweit die Spiele, die ihr euch selbst ausdenkt. Erstelle einen Raum und schick der anderen
          Person den Link.
        </p>
      </div>

      {claim ? (
        <div className="start-form claim" role="alertdialog" aria-labelledby="claim-title">
          <p id="claim-title" className="big">
            {claim.message}
          </p>
          <p>
            Bist du das, zum Beispiel auf einem anderen Gerät oder in der App auf dem Home-Bildschirm? Dann spielst du
            auf diesem Platz mit allen Punkten weiter. Das andere Gerät wird dabei abgemeldet.
          </p>
          <div className="row">
            <button className="btn primary" id="claim-yes" disabled={busy} onClick={() => go(claim.room, true)}>
              Ja, das bin ich
            </button>
            <button
              className="btn"
              id="claim-no"
              onClick={() => {
                setClaim(null);
                setName('');
              }}
            >
              Anderen Namen wählen
            </button>
          </div>
        </div>
      ) : (
        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault();
            go(code.trim() || null);
          }}
        >
          <div>
            <label htmlFor="name">Dein Name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              autoFocus={!name}
            />
          </div>
          <button type="button" className="btn primary" id="create" disabled={busy} onClick={() => go(null)}>
            Raum erstellen
          </button>
          <div className="join">
            <label htmlFor="code">Oder mit Raum-Code beitreten</label>
            <div className="join-row">
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              <button type="button" className="btn" id="join" disabled={busy} onClick={() => go(code.trim())}>
                Beitreten
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Room({ snap, online, send, onAction, leave, showToast, call, beacon }) {
  const share = async () => {
    const url = `${location.origin}${location.pathname}?raum=${snap.room}`;
    try {
      if (navigator.share) return await navigator.share({ title: 'Spielzimmer', text: 'Komm spielen!', url });
      await navigator.clipboard.writeText(url);
      showToast('Link kopiert.');
    } catch (err) {
      if (err?.name !== 'AbortError') prompt('Diesen Link schicken:', url);
    }
  };

  const players = snap.players.map(({ id, name }) => ({ id, name }));

  return (
    <>
      <Wordmark />
      <div className="room">
        <aside className="side">
          <p className="board-caption">Gewonnene Spiele</p>
          <Scoreboard snap={snap} online={online} />
          <div className="side-meta">
            <span>
              Raum <span className="room-code">{snap.room}</span>
            </span>
            {snap.players.length > 1 && (
              <button className="link" id="share" onClick={share}>
                Link teilen
              </button>
            )}
          </div>
          <Notifications room={snap.room} call={call} beacon={beacon} showToast={showToast} />
        </aside>

        <div>
          {snap.game ? (
            <div id="game-wrap">
              <div className="game-head">
                <h2 className="section-title">{snap.game.name}</h2>
                <button id="to-lobby" className="link" onClick={() => send({ t: 'lobby' })}>
                  Alle Spiele
                </button>
              </div>
              {snap.game.result && <Result result={snap.game.result} players={players} me={snap.me} send={send} />}
              <GameView game={snap.game} players={players} me={snap.me} onAction={onAction} />
            </div>
          ) : (
            <Lobby snap={snap} send={send} leave={leave} share={share} />
          )}
        </div>
      </div>
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

function Result({ result, players, me, send }) {
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

function Lobby({ snap, send, leave, share }) {
  const n = snap.players.length;
  return (
    <div id="lobby">
      {!getSupabase() && <p className="dev-note">Lokaler Testmodus ohne Supabase. Räume verschwinden beim Neustart.</p>}

      {n < 2 && (
        <div className="alone">
          <p>Du bist noch allein im Raum. Schick der anderen Person den Link, dann geht es los.</p>
          <button className="btn primary" id="share" onClick={share}>
            Link teilen
          </button>
        </div>
      )}

      <InstallHint room={snap.room} />

      <h2 className="section-title">Spiele</h2>
      <ul className="game-list">
        {snap.games.map((g) => {
          const [min, max] = g.players;
          const fits = n >= min && n <= max;
          const count = min === max ? `${min} Spieler` : `${min} bis ${max} Spieler`;
          return (
            <li key={g.id}>
              <button
                className="game-row"
                data-game={g.id}
                disabled={!fits}
                onClick={() => send({ t: 'choose', game: g.id })}
              >
                <span className="game-name">{g.name}</span>
                <span className="game-desc">{g.description}</span>
                <span className="game-meta">
                  {fits ? count : n < min ? `braucht ${min} Spieler` : `höchstens ${max}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {snap.history?.length > 0 && <History items={snap.history} />}

      <div className="room-foot">
        <button className="link" id="leave" onClick={leave}>
          Raum verlassen
        </button>
        <span>
          Neue Spiele kommen als Datei in den Ordner <code>games/</code>.
        </span>
      </div>
    </div>
  );
}

// Benachrichtigungen ein- und ausschalten. Solange die App offen ist, meldet sie sich regelmäßig,
// damit der Server weiß: hier schaut gerade jemand zu, keine Benachrichtigung nötig.
function Notifications({ room, call, beacon, showToast }) {
  const [support, setSupport] = useState(() => pushSupport());
  const [endpoint, setEndpoint] = useState(null); // gesetzt = an
  const [busy, setBusy] = useState(false);

  // Vorhandenes Abo dieses Geräts mit dem aktuellen Raum verknüpfen.
  useEffect(() => {
    if (support !== 'ok') return;
    let cancelled = false;
    currentSubscription()
      .then(async (sub) => {
        if (!sub || cancelled) return;
        await call({ t: 'push-subscribe', subscription: sub.toJSON() });
        if (!cancelled) setEndpoint(sub.endpoint);
      })
      .catch((err) => console.error('Benachrichtigungen:', err));
    return () => {
      cancelled = true;
    };
  }, [support, room, call]);

  // Lebenszeichen, solange die Seite sichtbar ist; beim Wegwechseln sofort abmelden.
  useEffect(() => {
    if (!endpoint) return;
    const seen = () => {
      if (document.visibilityState === 'visible') call({ t: 'seen', endpoint, visible: true }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        seen();
        clearNotifications();
      } else {
        beacon({ t: 'seen', endpoint, visible: false });
      }
    };
    const timer = setInterval(seen, 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    };
  }, [endpoint, call, beacon]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const sub = await subscribe(); // fragt nach der Erlaubnis
      if (!sub) {
        setSupport(pushSupport());
        return;
      }
      await call({ t: 'push-subscribe', subscription: sub.toJSON() });
      setEndpoint(sub.endpoint);
    } catch (err) {
      showToast(`Benachrichtigungen gehen gerade nicht: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      await call({ t: 'push-unsubscribe', endpoint }).catch(() => {});
      await sub?.unsubscribe();
      setEndpoint(null);
    } finally {
      setBusy(false);
    }
  };

  if (support === 'off' || support === 'unsupported') return null;
  return (
    <div className="notify" id="notify">
      {support === 'ios-browser' && (
        <p className="muted">Benachrichtigungen gibt es auf dem iPhone nur in der App vom Home-Bildschirm.</p>
      )}
      {support === 'denied' && (
        <p className="muted">
          Benachrichtigungen sind für das Spielzimmer blockiert. Du kannst sie in den Einstellungen erlauben.
        </p>
      )}
      {support === 'ok' &&
        (endpoint ? (
          <p>
            Benachrichtigungen sind an.{' '}
            <button className="link" id="notify-off" disabled={busy} onClick={turnOff}>
              Ausschalten
            </button>
          </p>
        ) : (
          <button className="link" id="notify-on" disabled={busy} onClick={turnOn}>
            Benachrichtigen, wenn ich dran bin
          </button>
        ))}
    </div>
  );
}

// Auf dem iPhone gibt es keinen Installieren-Knopf, deshalb ein kurzer Hinweis (nur in Safari & Co., nicht in der App selbst).
function InstallHint({ room }) {
  const [show, setShow] = useState(
    () => isIos() && !isStandalone() && storage.get('spielzimmer.installHint') !== 'aus',
  );
  if (!show) return null;
  return (
    <div className="install-hint" id="install-hint">
      <p>
        <strong>Als App auf dem Home-Bildschirm:</strong> Tippe im Browser auf Teilen und dann auf „Zum
        Home-Bildschirm“. Das Spielzimmer startet dann ohne Browserleiste und kann dich benachrichtigen, wenn du dran
        bist. Beim ersten Öffnen gibst du dort deinen Namen und den Raum-Code <span className="room-code">{room}</span>{' '}
        ein, deine Punkte bleiben erhalten.
      </p>
      <button
        className="link"
        onClick={() => {
          storage.set('spielzimmer.installHint', 'aus');
          setShow(false);
        }}
      >
        Ausblenden
      </button>
    </div>
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

// ---------------------------------------------------------------------------

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

function Toast({ toast }) {
  const [visible, setVisible] = useState(null);
  useEffect(() => {
    if (!toast) return;
    setVisible(toast.text);
    const timer = setTimeout(() => setVisible(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  return visible ? (
    <div className="toast" id="toast" role="status">
      {visible}
    </div>
  ) : null;
}
