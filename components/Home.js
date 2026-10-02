'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { account } from './api';
import { getSupabase } from '@/lib/supabase-browser';
import { isIos, isStandalone } from '@/lib/push-client';
import { storage } from './api';
import { PLAYER_COLORS } from '@/lib/colors';

// Zahlen im Text als Wort (die Textschrift hat eine durchgestrichene Null)
const WORDS = ['keine', 'eine', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
export const countWord = (n) => WORDS[n] ?? String(n);

// "1. Oktober", in einem anderen Jahr mit Jahreszahl
export function formatDay(iso) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Freunde, Anfragen und Einladungscode (für Startseite und Freunde-Seite), live aktuell gehalten.
 * act(msg) schickt eine Konto-Anfrage, zeigt deren Meldung und lädt danach neu.
 */
export function useHomeData(user, showToast, onUnauthorized) {
  const [data, setData] = useState(null);

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

  const act = useCallback(
    async (msg) => {
      try {
        const r = await account(msg);
        if (r.message) showToast(r.message);
        await load();
        return true;
      } catch (err) {
        showToast(err.message);
        return false;
      }
    },
    [load, showToast],
  );

  return { data, load, act };
}

// Einladungslink über das Teilen-Menü schicken (oder kopieren, wo es das nicht gibt)
export async function shareInvite(inviteCode, showToast) {
  const url = `${location.origin}/?einladung=${inviteCode}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Spielzimmer', text: 'Spiel mit mir im Spielzimmer.', url });
    await navigator.clipboard.writeText(url);
    showToast('Einladungslink kopiert.');
  } catch (err) {
    if (err?.name !== 'AbortError') prompt('Diesen Link schicken:', url);
  }
}

// Startseite nach dem Anmelden: Freunde (mit Punkten und wer dran ist), Anfragen, Menü.
export default function Home({ user, openRoom, openPage, showToast, push, onLogout, onUnauthorized }) {
  const { data, load, act } = useHomeData(user, showToast, onUnauthorized);
  const inviteHandled = useRef(false);

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
          <div className="empty">
            <p>Noch niemand da. Füge jemanden über den Benutzernamen hinzu oder schick deinen Einladungslink.</p>
            <button className="btn primary" id="first-friend" onClick={() => openPage('freunde')}>
              Freund hinzufügen
            </button>
          </div>
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

      {data?.groups.length > 0 && (
        <section>
          <h2 className="section-title">Gruppen</h2>
          <ul className="friend-list">
            {data.groups.map((g) => (
              <li key={g.room}>
                <GroupRow group={g} me={user} onOpen={() => openRoom(g.room)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Menu data={data} push={push} openPage={openPage} />

      <InstallHint />

      <footer className="home-foot">
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
  const color = (id) => PLAYER_COLORS[order?.indexOf(id)] ?? 'var(--ink)';
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

// Gruppe: Name, wer dran ist, darunter alle Mitglieder mit ihren gewonnenen Spielen
function GroupRow({ group, me, onOpen }) {
  const { name, members, scores, order, game } = group;
  const color = (id) => PLAYER_COLORS[order?.indexOf(id)] ?? 'var(--ink)';
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '?';
  const waiting = game?.waiting ?? [];
  let status = 'Kein Spiel offen';
  if (game?.finished) status = `${game.name} ist vorbei`;
  else if (game?.myTurn) status = `Du bist dran bei ${game.name}`;
  else if (waiting.length === 1) status = `${nameOf(waiting[0])} ist dran bei ${game.name}`;
  else if (waiting.length > 1) status = `${capitalize(countWord(waiting.length))} sind dran bei ${game.name}`;
  else if (game) status = game.name;

  return (
    <button className={`friend-row group-row ${game?.myTurn ? 'my-turn' : ''}`} onClick={onOpen} data-group={group.room}>
      <span className="friend-name">{name}</span>
      <span className="friend-status">
        {game?.myTurn && <span className="marker" style={{ color: 'var(--p1)' }} aria-hidden="true" />}
        {status}
      </span>
      <span className="group-members">
        {members.map((m) => (
          <span key={m.id} className="group-member">
            <span className="marker" style={{ color: color(m.id) }} aria-hidden="true" />
            {m.id === me.id ? 'Du' : m.name}
            <span className="num" style={{ color: color(m.id) }}>
              {scores?.[m.id] ?? 0}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Wege zu den Einstellungen, mit dem wichtigsten Stand in einer Zeile
function Menu({ data, push, openPage }) {
  // Anfragen an mich stehen schon oben auf der Startseite, hier nur die eigenen offenen
  const waiting = data?.outgoing.length ?? 0;
  const friends = waiting
    ? `${countWord(waiting)} ${waiting === 1 ? 'Anfrage wartet' : 'Anfragen warten'} auf Antwort`
    : 'Hinzufügen, einladen, entfernen';
  const notify = {
    ok: push.endpoint ? 'Auf diesem Gerät an' : 'Auf diesem Gerät aus',
    off: 'Noch nicht eingerichtet',
    'ios-browser': 'Nur in der App vom Home-Bildschirm',
    denied: 'Auf diesem Gerät blockiert',
    unsupported: 'Kann dieser Browser nicht',
  }[push.support];
  return (
    <nav className="menu" aria-label="Einstellungen">
      <button className="menu-row" id="menu-friends" onClick={() => openPage('freunde')}>
        <span className="menu-title">Freunde verwalten</span>
        <span className="menu-status">{friends}</span>
      </button>
      <button className="menu-row" id="menu-group" onClick={() => openPage('gruppe')}>
        <span className="menu-title">Gruppe gründen</span>
        <span className="menu-status">Ein Spielzimmer für bis zu sechs Leute</span>
      </button>
      <button className="menu-row" id="menu-notify" onClick={() => openPage('benachrichtigungen')}>
        <span className="menu-title">Benachrichtigungen</span>
        <span className="menu-status">{notify}</span>
      </button>
    </nav>
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
