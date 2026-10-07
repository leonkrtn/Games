'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { account, beacon } from './api';
import Auth from './Auth';
import Home from './Home';
import Room from './Room';
import Friends from './Friends';
import NotifySettings from './NotifySettings';
import NewGroup from './NewGroup';
import Hai from './Hai';
import {
  pushSupport,
  registerServiceWorker,
  currentSubscription,
  subscribe,
  clearNotifications,
  deviceLabel,
} from '@/lib/push-client';

// Ansicht aus der Adresse: ?raum=CODE (Spielzimmer) oder ?seite=freunde|gruppe|benachrichtigungen|hai
const roomFromUrl = () => new URLSearchParams(location.search).get('raum');
const pageFromUrl = () => new URLSearchParams(location.search).get('seite');

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = wird geprüft, null = nicht angemeldet
  const [room, setRoom] = useState(null);
  const [page, setPage] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((text) => setToast({ text, at: Date.now() }), []);

  // Beim Öffnen: angemeldet? Und direkt ins Spielzimmer, wenn der Link (z.B. aus einer Benachrichtigung) eins nennt.
  useEffect(() => {
    registerServiceWorker();
    clearNotifications();
    setRoom(roomFromUrl());
    setPage(pageFromUrl());
    account({ t: 'me' })
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    const onPop = () => {
      setRoom(roomFromUrl());
      setPage(pageFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openRoom = useCallback((code) => {
    history.pushState(null, '', `?raum=${code}`);
    setRoom(code);
    setPage(null);
  }, []);

  const openPage = useCallback((name) => {
    history.pushState(null, '', `?seite=${name}`);
    setPage(name);
    setRoom(null);
    window.scrollTo(0, 0);
  }, []);

  const goHome = useCallback(() => {
    history.pushState(null, '', location.pathname);
    setRoom(null);
    setPage(null);
  }, []);

  const onUnauthorized = useCallback(() => {
    setUser(null);
    showToast('Bitte melde dich an.');
  }, [showToast]);

  const endpointRef = useRef(null);
  const logout = useCallback(async () => {
    await account({ t: 'logout', endpoint: endpointRef.current }).catch(() => {});
    setUser(null);
    setRoom(null);
    setPage(null);
    history.replaceState(null, '', location.pathname);
  }, []);

  const push = usePushDevice(room ?? (page === 'hai' ? 'hai' : 'home'), Boolean(user), showToast);
  endpointRef.current = push.endpoint;

  if (user === undefined) return null;

  return (
    <>
      <main className="shell">
        {!user ? (
          <Auth onLogin={setUser} showToast={showToast} />
        ) : room ? (
          <Room code={room} user={user} goHome={goHome} showToast={showToast} onUnauthorized={onUnauthorized} />
        ) : page === 'freunde' ? (
          <Friends
            user={user}
            goHome={goHome}
            openRoom={openRoom}
            showToast={showToast}
            onUnauthorized={onUnauthorized}
          />
        ) : page === 'gruppe' ? (
          <NewGroup
            user={user}
            goHome={goHome}
            openRoom={openRoom}
            showToast={showToast}
            onUnauthorized={onUnauthorized}
          />
        ) : page === 'hai' ? (
          <Hai user={user} goHome={goHome} showToast={showToast} onUnauthorized={onUnauthorized} />
        ) : page === 'benachrichtigungen' ? (
          <NotifySettings goHome={goHome} showToast={showToast} push={push} onUnauthorized={onUnauthorized} />
        ) : (
          <Home
            user={user}
            openRoom={openRoom}
            openPage={openPage}
            showToast={showToast}
            push={push}
            onLogout={logout}
            onUnauthorized={onUnauthorized}
          />
        )}
      </main>
      <Toast toast={toast} />
    </>
  );
}

/**
 * Benachrichtigungen für dieses Gerät. Solange die App sichtbar ist, meldet sie alle 30 Sekunden,
 * welche Ansicht offen ist (Freundesliste, ein Spielzimmer oder der Hai). Dafür schickt der Server dann nichts.
 */
function usePushDevice(view, loggedIn, showToast) {
  const [support, setSupport] = useState(() => pushSupport());
  const [endpoint, setEndpoint] = useState(null);
  const [busy, setBusy] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Vorhandenes Abo dieses Geräts mit dem angemeldeten Konto verknüpfen.
  useEffect(() => {
    if (!loggedIn || support !== 'ok') return setEndpoint(null);
    let cancelled = false;
    currentSubscription()
      .then(async (sub) => {
        if (!sub || cancelled) return;
        const r = await account({
          t: 'push-subscribe',
          subscription: sub.toJSON(),
          view: viewRef.current,
          label: deviceLabel(),
        });
        // enabled false: in der Geräteliste entfernt, bleibt aus, bis man hier wieder einschaltet
        if (!cancelled && r.enabled !== false) setEndpoint(sub.endpoint);
      })
      .catch((err) => console.error('Benachrichtigungen:', err));
    return () => {
      cancelled = true;
    };
  }, [loggedIn, support]);

  useEffect(() => {
    if (!endpoint) return;
    const seen = () => {
      if (document.visibilityState === 'visible') account({ t: 'seen', endpoint, view, visible: true }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        seen();
        clearNotifications();
      } else {
        beacon({ t: 'seen', endpoint, visible: false });
      }
    };
    seen(); // sofort, auch beim Wechsel zwischen Freundesliste und Spielzimmer
    const timer = setInterval(seen, 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    };
  }, [endpoint, view]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const sub = await subscribe(); // fragt nach der Erlaubnis
      if (!sub) return setSupport(pushSupport());
      await account({
        t: 'push-subscribe',
        subscription: sub.toJSON(),
        view: viewRef.current,
        label: deviceLabel(),
        explicit: true,
      });
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
      await account({ t: 'push-unsubscribe', endpoint }).catch(() => {});
      await sub?.unsubscribe();
      setEndpoint(null);
    } finally {
      setBusy(false);
    }
  };

  return { support, endpoint, busy, turnOn, turnOff };
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
