import '@fontsource-variable/big-shoulders/opsz.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './globals.css';

export const metadata = {
  title: 'Spielzimmer',
  description: 'Selbst ausgedachte Spiele mit Freunden live spielen.',
  applicationName: 'Spielzimmer',
  // iPhone: als Web-App vom Home-Bildschirm im Vollbild starten, weiße Statusleiste mit dunkler Schrift
  appleWebApp: {
    capable: true,
    title: 'Spielzimmer',
    statusBarStyle: 'default',
  },
  // Raum-Codes und Punkte nicht als Telefonnummern verlinken
  formatDetection: { telephone: false, email: false, address: false },
  // Next.js setzt nur das neue mobile-web-app-capable; ältere iOS-Versionen brauchen noch dieses Tag
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
