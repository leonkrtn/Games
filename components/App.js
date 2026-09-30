'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';
import GameView from './GameView';

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
    throw Object.assign(new Error('Keine Verbindung – versuche es gleich nochmal.'), { offline: true });
  }
  const data = await res.json().catch(() => ({ error: 'Der Server hat nicht geantwortet.' }));
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  return data;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState(null); // aktueller Stand vom Server
  const [roomCode, setRoomCode] = useState(null);
  const [online, setOnline] = useState(null); // Set von Spieler-IDs, null = unbekannt
  const [connected, setConnected] = useState(true);
  const [toast, setToast] = useState(null);

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
    (msg) => callServer({ ...msg, room: msg.room ?? roomRef.current, playerId: me.current.id, token: me.current.token }),
    [],
  );

  const resetRoom = useCallback(() => {
    roomRef.current = null;
    versionRef.current = -1;
    setRoomCode(null);
    setSnap(null);
    storage.del('spielzimmer.room');
    history.replaceState(null, '', location.pathname);
  }, []);

  const enter = useCallback(
    async (code, name) => {
      storage.set('spielzimmer.name', name);
      try {
        const s = await call({ t: 'join', room: code, name });
        roomRef.current = s.room;
        versionRef.current = -1;
        storage.set('spielzimmer.room', s.room);
        history.replaceState(null, '', `?raum=${s.room}`);
        setRoomCode(s.room);
        accept(s);
      } catch (err) {
        showToast(err.message);
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
      <main className="app">
        {snap ? (
          <Room snap={snap} online={online} send={send} onAction={onAction} leave={leave} showToast={showToast} />
        ) : (
          <Start enter={enter} showToast={showToast} />
        )}
      </main>
      <ConnectionNote show={!!roomCode && !connected} />
      <Toast toast={toast} />
    </>
  );
}

// ---------------------------------------------------------------------------

function Start({ enter, showToast }) {
  const [name, setName] = useState(() => storage.get('spielzimmer.name') ?? '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('raum')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);

  const go = async (room) => {
    if (!name.trim()) return showToast('Wie heißt du?');
    if (room !== null && !/^[A-Za-z]{4}$/.test(room)) return showToast('Der Raum-Code hat 4 Buchstaben.');
    setBusy(true);
    await enter(room?.toUpperCase() ?? null, name.trim());
    setBusy(false);
  };

  return (
    <section>
      <h1 className="logo">🎲 Spielzimmer</h1>
      <p className="muted">Eure eigenen Spiele – live zusammen spielen.</p>
      <form
        className="card stack"
        style={{ marginTop: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          go(code.trim() || null);
        }}
      >
        <label className="stack small-gap">
          <span>Dein Name</span>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            autoFocus={!name}
          />
        </label>
        <button type="button" className="btn primary" id="create" disabled={busy} onClick={() => go(null)}>
          Neuen Raum erstellen
        </button>
        <div className="divider">
          <span>oder</span>
        </div>
        <div className="row nowrap">
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Raum-Code"
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="button" className="btn" id="join" disabled={busy} onClick={() => go(code.trim())}>
            Beitreten
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Room({ snap, online, send, onAction, leave, showToast }) {
  const share = async () => {
    const url = `${location.origin}${location.pathname}?raum=${snap.room}`;
    try {
      if (navigator.share) return await navigator.share({ title: 'Spielzimmer', text: 'Komm spielen!', url });
      await navigator.clipboard.writeText(url);
      showToast('Link kopiert!');
    } catch (err) {
      if (err?.name !== 'AbortError') prompt('Diesen Link schicken:', url);
    }
  };

  const players = snap.players.map(({ id, name }) => ({ id, name }));

  return (
    <section>
      <header className="top">
        {snap.game && (
          <button id="to-lobby" className="btn ghost small" onClick={() => send({ t: 'lobby' })}>
            ← Spiele
          </button>
        )}
        <div className="players">
          {snap.players.map((p) => (
            <span
              key={p.id}
              className={`player ${online?.has(p.id) ?? true ? 'online' : ''} ${p.id === snap.me ? 'me' : ''}`}
            >
              <span className="dot" />
              {p.name}
              {p.id === snap.me && <span className="muted"> (du)</span>}
              <span className="score" title="Gewonnene Spiele">
                {p.score}
              </span>
            </span>
          ))}
        </div>
        <button id="share" className="code-chip" title="Link zum Raum teilen" onClick={share}>
          Raum <b id="room-code">{snap.room}</b> · Einladen
        </button>
      </header>

      {snap.game ? (
        <div id="game-wrap">
          {snap.game.result && <Result result={snap.game.result} me={snap.me} send={send} />}
          <GameView game={snap.game} players={players} me={snap.me} onAction={onAction} />
        </div>
      ) : (
        <Lobby snap={snap} send={send} leave={leave} />
      )}
    </section>
  );
}

function Result({ result, me, send }) {
  const won = result.winners?.includes(me);
  return (
    <div id="result">
      <div className={`card result ${won ? 'won' : ''}`}>
        <div className="result-text">
          {won ? '🎉 ' : ''}
          {result.text ?? 'Spiel vorbei'}
        </div>
        <div className="row center">
          <button className="btn primary" data-cmd="restart" onClick={() => send({ t: 'restart' })}>
            Nochmal
          </button>
          <button className="btn" data-cmd="lobby" onClick={() => send({ t: 'lobby' })}>
            Anderes Spiel
          </button>
        </div>
      </div>
    </div>
  );
}

function Lobby({ snap, send, leave }) {
  const n = snap.players.length;
  return (
    <div id="lobby">
      {!getSupabase() && (
        <p className="dev-note">Lokaler Testmodus ohne Supabase – Räume verschwinden beim Neustart.</p>
      )}
      {n < 2 && (
        <div className="card lobby-hint">
          👋 Du bist noch allein hier. Tippe oben auf <b>Einladen</b> und schick den Link – dann könnt ihr loslegen.
        </div>
      )}
      <div className="game-grid">
        {snap.games.map((g) => {
          const [min, max] = g.players;
          return (
            <button
              key={g.id}
              className="card game-card"
              data-game={g.id}
              disabled={n < min || n > max}
              onClick={() => send({ t: 'choose', game: g.id })}
            >
              <span className="emoji">{g.emoji}</span>
              <span className="title">{g.name}</span>
              <span className="desc">{g.description}</span>
              <span className="tag">{min === max ? `${min} Spieler` : `${min}–${max} Spieler`}</span>
            </button>
          );
        })}
      </div>

      {snap.history?.length > 0 && <History items={snap.history} />}

      <div className="lobby-foot muted">
        <span>
          Neues Spiel erfinden? Einfach eine Datei in <code>games/</code> anlegen.
        </span>
        <button className="btn ghost small" id="leave" onClick={leave}>
          Raum verlassen
        </button>
      </div>
    </div>
  );
}

function History({ items }) {
  const format = (iso) => {
    const d = new Date(iso);
    const today = d.toDateString() === new Date().toDateString();
    return today
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };
  return (
    <div className="history card">
      <h2>Zuletzt gespielt</h2>
      <ul>
        {items.map((r, i) => (
          <li key={i}>
            <span>{r.winners.length === 1 ? '🏆' : '🤝'}</span>
            <span>
              <b>{r.game_name}</b> – {r.text}
            </span>
            <time dateTime={r.finished_at}>{format(r.finished_at)}</time>
          </li>
        ))}
      </ul>
    </div>
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
  return visible ? <div id="conn">Verbindung wird hergestellt…</div> : null;
}

function Toast({ toast }) {
  const [visible, setVisible] = useState(null);
  useEffect(() => {
    if (!toast) return;
    setVisible(toast.text);
    const timer = setTimeout(() => setVisible(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  return visible ? <div id="toast">{visible}</div> : null;
}
