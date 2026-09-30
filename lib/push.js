// Benachrichtigungen verschicken (Web Push). Läuft nur auf dem Server.
import webpush from 'web-push';

// Nur an echte Push-Dienste schicken, nie an beliebige Adressen.
const PUSH_HOSTS = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
];

export const ACTIVE_FOR_MS = 70_000; // so lange gilt ein Gerät nach dem letzten Lebenszeichen als "schaut gerade zu"

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function validSubscription(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return false;
  if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return false;
  let url;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return false;
  }
  // PUSH_ALLOWED_HOSTS: zusätzliche Hosts, nur für Tests (z.B. "localhost")
  const extra = (process.env.PUSH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return (
    url.protocol === 'https:' &&
    [...PUSH_HOSTS, ...extra].some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  );
}

/**
 * Schickt die Nachrichten an alle Geräte der Empfänger, die die Seite gerade nicht offen haben.
 * notes = [{ to: playerId, title, body }], seq = Raum-Version (damit das Handy immer die neueste Nachricht zeigt)
 */
export async function sendPushes(store, room, notes, origin, seq) {
  if (!notes?.length || !pushConfigured()) return;
  // Absender-Angabe für die Push-Dienste: muss https:// oder mailto: sein (lokal läuft es unter http://).
  const subject = process.env.VAPID_SUBJECT || (origin.startsWith('https://') ? origin : 'https://localhost');
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const subs = await store.listPush(room);
  const now = Date.now();
  const jobs = notes.flatMap((note) =>
    subs
      .filter((s) => s.player_id === note.to && !(s.active_until && new Date(s.active_until).getTime() > now))
      .map(async (s) => {
        const payload = JSON.stringify({
          title: note.title,
          body: note.body,
          url: `/?raum=${room}`,
          tag: `raum-${room}`,
          seq,
        });
        try {
          await webpush.sendNotification(s.subscription, payload, { TTL: 3600, urgency: 'high' });
        } catch (err) {
          // 404/410: Abo gibt es nicht mehr (z.B. App gelöscht) – aufräumen
          if (err.statusCode === 404 || err.statusCode === 410) await store.removePush(s.endpoint);
          else console.error('Benachrichtigung fehlgeschlagen:', err.statusCode ?? '', err.body ?? err.message);
        }
      }),
  );
  await Promise.all(jobs);
}
