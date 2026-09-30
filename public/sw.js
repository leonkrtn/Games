// Service Worker des Spielzimmers: nur für Benachrichtigungen.
// Er speichert absichtlich nichts zwischen, damit nach einem Update nie eine alte Version hängen bleibt.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    (async () => {
      // Pro Raum steht nur eine Nachricht da (tag). Kommen Nachrichten vertauscht an,
      // bleibt die neuere (höhere Raum-Version) stehen statt einer veralteten.
      const existing = data.tag ? await self.registration.getNotifications({ tag: data.tag }) : [];
      const newer = existing.find((n) => (n.data?.seq ?? -1) > (data.seq ?? -1));
      const shown = newer ? newer.data : data;
      await Promise.all([
        self.registration.showNotification(shown.title || 'Spielzimmer', {
          body: shown.body || '',
          tag: data.tag,
          renotify: Boolean(data.tag) && !newer,
          icon: '/icon-192.png',
          data: { title: shown.title, body: shown.body, url: shown.url || '/', seq: shown.seq },
        }),
        // Roter Punkt am App-Icon (iPhone ab iOS 16.4, Android, Desktop)
        self.navigator.setAppBadge?.(1).catch(() => {}),
      ]);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (open.url !== url && 'navigate' in open) await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
