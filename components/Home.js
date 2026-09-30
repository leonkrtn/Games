'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { account } from './api';
import { getSupabase } from '@/lib/supabase-browser';
import { isIos, isStandalone } from '@/lib/push-client';
import { storage } from './api';

const COLORS = ['var(--p1)', 'var(--p2)'];

// Startseite nach dem Anmelden: Freunde (mit Punkten und wer dran ist), Anfragen, Freund hinzufügen.
export default function Home({ user, openRoom, showToast, push, onLogout, onUnauthorized }) {
  const [data, setData] = useState(null);
  const inviteHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await account({ t: 'home' }));
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else if (!err.offline) showToast(err.message);
    }
  }, [onUnauthorized, showToast]);

  // Aktuell halten: beim Öffnen, beim Zurückkommen in die App und bei jeder Änderung (Supabase Realtime).
  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const supabase = getSupabase();
    let cleanup;
    if (supabase) {
      const channel = supabase.channel(`user:${user.id}`).on('broadcast', { event: 'update' }, load).subscribe();
      cleanup = () => supabase.removeChannel(channel);
    } else {
      const timer = setInterval(load, 2000); // lokaler Testmodus
      cleanup = () => clearInterval(timer);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      cleanup();
    };
  }, [load, user.id]);

  // Über einen Einladungslink gekommen: sofort befreundet.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('einladung');
    if (!code || inviteHandled.current) return;
    inviteHandled.current = true;
    history.replaceState(null, '', location.pathname);
    account({ t: 'friend-invite', code })
      .then((r) => {
        if (r.message) showToast(r.message);
        load();
      })
      .catch((err) => showToast(err.message));
  }, [load, showToast]);

  const act = async (msg) => {
    try {
      const r = await account(msg);
      if (r.message) showToast(r.message);
      await load();
      return true;
    } catch (err) {
      showToast(err.message);
      return false;
    }
  };

  const shareInvite = async () => {
    const url = `${location.origin}/?einladung=${data.inviteCode}`;
    try {
      if (navigator.share)
        return await navigator.share({ title: 'Spielzimmer', text: 'Spiel mit mir im Spielzimmer.', url });
      await navigator.clipboard.writeText(url);
      showToast('Einladungslink kopiert.');
    } catch (err) {
      if (err?.name !== 'AbortError') prompt('Diesen Link schicken:', url);
    }
  };

  return (
    <div className="home">
      <header className="home-head">
        <Wordmark />
        <span className="muted home-user">{user.name}</span>
      </header>

      {data?.incoming.length > 0 && (
        <section className="requests" id="requests">
          <h2 className="section-title">Anfragen</h2>
          <ul className="rows">
            {data.incoming.map((r) => (
              <li key={r.id} className="request-row">
                <span>
                  <strong>{r.user.name}</strong> möchte mit dir spielen.
                </span>
                <span className="row">
                  <button className="btn primary small-btn" onClick={() => act({ t: 'friend-accept', id: r.id })}>
                    Annehmen
                  </button>
                  <button className="link" onClick={() => act({ t: 'friend-remove', id: r.id })}>
                    Ablehnen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">Freunde</h2>
        {!data ? (
          <p className="muted">Lädt …</p>
        ) : data.friends.length === 0 ? (
          <p className="empty">
            Noch niemand da. Füge unten jemanden über den Benutzernamen hinzu oder schick deinen Einladungslink.
          </p>
        ) : (
          <ul className="friend-list">
            {data.friends.map((f) => (
              <li key={f.id}>
                <FriendRow friend={f} me={user} onOpen={() => f.room && openRoom(f.room)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddFriend data={data} act={act} shareInvite={shareInvite} />

      <InstallHint />

      <footer className="home-foot">
        <Notifications push={push} />
        <p>
          Angemeldet als <strong>{user.name}</strong>.{' '}
          <button className="link" id="logout" onClick={onLogout}>
            Abmelden
          </button>
        </p>
        {!getSupabase() && (
          <p className="dev-note">Lokaler Testmodus ohne Supabase. Alles verschwindet beim Neustart.</p>
        )}
      </footer>
    </div>
  );
}

export function Wordmark() {
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

function FriendRow({ friend, me, onOpen }) {
  const { user: other, scores, order, game } = friend;
  const color = (id) => COLORS[order?.indexOf(id)] ?? 'var(--ink)';
  let status = 'Kein Spiel offen';
  if (game?.finished) status = `${game.name} ist vorbei`;
  else if (game?.myTurn) status = `Du bist dran bei ${game.name}`;
  else if (game?.theirTurn) status = `${other.name} ist dran bei ${game.name}`;
  else if (game) status = game.name;

  return (
    <button className={`friend-row ${game?.myTurn ? 'my-turn' : ''}`} onClick={onOpen} data-friend={other.username}>
      <span className="friend-name">
        <span className="marker" style={{ color: color(other.id) }} aria-hidden="true" />
        {other.name}
      </span>
      <span className="friend-status">
        {game?.myTurn && <span className="marker" style={{ color: 'var(--p1)' }} aria-hidden="true" />}
        {status}
      </span>
      {scores && (
        <span
          className="friend-score num"
          aria-label={`${other.name} ${scores[other.id] ?? 0}, du ${scores[me.id] ?? 0}`}
        >
          <span style={{ color: color(other.id) }}>{scores[other.id] ?? 0}</span>
          <span className="muted">:</span>
          <span style={{ color: color(me.id) }}>{scores[me.id] ?? 0}</span>
        </span>
      )}
    </button>
  );
}

function AddFriend({ data, act, shareInvite }) {
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await act({ t: 'friend-add', username: name })) setName('');
  };
  return (
    <section className="add-friend">
      <h2 className="section-title">Freund hinzufügen</h2>
      <form onSubmit={submit} className="add-form">
        <label htmlFor="friend-name">Benutzername</label>
        <div className="row nowrap">
          <input
            id="friend-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            required
            enterKeyHint="send"
          />
          <button className="btn" id="friend-add">
            Senden
          </button>
        </div>
      </form>
      <p className="invite">
        Oder schick deinen Einladungslink. Wer ihn öffnet, ist sofort mit dir befreundet.{' '}
        <button className="link" id="invite" onClick={shareInvite} disabled={!data}>
          Einladungslink teilen
        </button>
      </p>
      {data?.outgoing.length > 0 && (
        <ul className="rows outgoing">
          {data.outgoing.map((r) => (
            <li key={r.id}>
              Wartet auf <strong>{r.user.name}</strong>.{' '}
              <button className="link" onClick={() => act({ t: 'friend-remove', id: r.id })}>
                Zurückziehen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Notifications({ push }) {
  const { support, endpoint, busy, turnOn, turnOff } = push;
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

// Auf dem iPhone gibt es keinen Installieren-Knopf, deshalb ein kurzer Hinweis (nur im Browser, nicht in der App).
function InstallHint() {
  const [show, setShow] = useState(
    () => isIos() && !isStandalone() && storage.get('spielzimmer.installHint') !== 'aus',
  );
  if (!show) return null;
  return (
    <div className="install-hint" id="install-hint">
      <p>
        <strong>Als App auf dem Home-Bildschirm:</strong> Tippe im Browser auf Teilen und dann auf „Zum
        Home-Bildschirm“. Das Spielzimmer startet dann ohne Browserleiste und kann dich benachrichtigen, wenn du dran
        bist. In der App meldest du dich einmal an.
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
