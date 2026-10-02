// Web-App-Manifest: Name und Icons, wenn man die Seite am Handy zum Home-Bildschirm hinzufügt.
export default function manifest() {
  return {
    name: 'Spielzimmer',
    short_name: 'Spielzimmer',
    description: 'Selbst ausgedachte Spiele mit Freunden live spielen.',
    id: '/',
    start_url: '/',
    scope: '/',
    lang: 'de',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
