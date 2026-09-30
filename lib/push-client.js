// Benachrichtigungen im Browser: Service Worker, Erlaubnis, Push-Abo.

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * 'off'         – auf dem Server nicht eingerichtet
 * 'ios-browser' – iPhone im Browser: geht nur in der App vom Home-Bildschirm
 * 'unsupported' – Browser kann keine Benachrichtigungen
 * 'denied'      – in den Einstellungen blockiert
 * 'ok'          – kann eingeschaltet werden
 */
export function pushSupport() {
  if (!VAPID_PUBLIC_KEY) return 'off';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return isIos() && !isStandalone() ? 'ios-browser' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export function registerServiceWorker() {
  if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service Worker:', err));
}

export async function currentSubscription() {
  if (Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Muss direkt aus einem Tipp heraus aufgerufen werden (iPhone verlangt das für die Erlaubnis-Abfrage).
export async function subscribe() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  return (
    (await reg.pushManager.getSubscription()) ??
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) })
  );
}

// Beim Öffnen der App: alte Benachrichtigungen und den Punkt am Icon entfernen.
export async function clearNotifications() {
  try {
    navigator.clearAppBadge?.();
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications()) ?? []) n.close();
  } catch {}
}

function base64UrlToBytes(value) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
