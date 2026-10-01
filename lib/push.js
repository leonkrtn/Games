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

// Arten von Benachrichtigungen, einzeln abschaltbar (Einstellungen pro Konto, gelten für alle Geräte):
// turn = du bist dran, start = Spiel gestartet, end = Spiel vorbei, friends = Freundschaftsanfragen
export const NOTIFY_KINDS = ['turn', 'start', 'end', 'friends'];

/** Einstellungen eines Kontos mit Standardwerten: alles an, niemand stumm. */
export function notifySettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    ...Object.fromEntries(NOTIFY_KINDS.map((k) => [k, s[k] !== false])),
    muted: Array.isArray(s.muted) ? s.muted.filter((id) => typeof id === 'string').slice(0, 200) : [],
  };
}

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
 * Schickt Benachrichtigungen an alle Geräte der Empfänger.
 * notes = [{ to: userId, title, body, view, seq?, kind?, from?, device?, tag? }]
 *   view: Raum-Code oder 'home'. Wer genau diese Ansicht gerade offen hat, bekommt nichts.
 *   seq: Raum-Version, damit das Handy bei vertauschter Ankunft die neueste Nachricht zeigt.
 *   kind: Art (NOTIFY_KINDS), from: Konto, das sie ausgelöst hat. Beides prüft die Einstellungen
 *     des Empfängers (Art abgeschaltet, Freund stumm). kind 'test' geht immer durch.
 *   device: nur an dieses eine Gerät (Endpoint), tag: eigene Gruppe statt Raum bzw. 'freunde'.
 */
export async function sendPushes(store, notes, origin) {
  if (!notes?.length || !pushConfigured()) return;
  // Absender-Angabe für die Push-Dienste: muss https:// oder mailto: sein (lokal läuft es unter http://).
  const subject = process.env.VAPID_SUBJECT || (origin.startsWith('https://') ? origin : 'https://localhost');
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const ids = [...new Set(notes.map((n) => n.to))];
  const [devices, settings] = await Promise.all([store.listDevices(ids), store.getNotifySettings(ids)]);
  const prefs = new Map(settings.map((u) => [u.id, notifySettings(u.notify_settings)]));
  const wanted = (note) => {
    if (note.kind === 'test') return true;
    const p = prefs.get(note.to) ?? notifySettings();
    return !(note.kind && p[note.kind] === false) && !(note.from && p.muted.includes(note.from));
  };
  const now = Date.now();
  const watching = (d, view) => d.active_view === view && d.active_until && new Date(d.active_until).getTime() > now;

  const jobs = notes.filter(wanted).flatMap((note) =>
    devices
      .filter(
        (d) =>
          d.user_id === note.to &&
          d.enabled !== false &&
          (!note.device || d.endpoint === note.device) &&
          (note.kind === 'test' || !watching(d, note.view)),
      )
      .map(async (d) => {
        const inRoom = note.view && note.view !== 'home';
        const payload = JSON.stringify({
          title: note.title,
          body: note.body,
          url: inRoom ? `/?raum=${note.view}` : '/',
          tag: note.tag ?? (inRoom ? `raum-${note.view}` : 'freunde'),
          seq: note.seq,
        });
        try {
          await webpush.sendNotification(d.subscription, payload, { TTL: 3600, urgency: 'high' });
        } catch (err) {
          // 404/410: Abo gibt es nicht mehr (z.B. App gelöscht) – aufräumen
          if (err.statusCode === 404 || err.statusCode === 410) await store.removeDevice(d.endpoint);
          else console.error('Benachrichtigung fehlgeschlagen:', err.statusCode ?? '', err.body ?? err.message);
        }
      }),
  );
  await Promise.all(jobs);
}
