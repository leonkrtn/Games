import '@fontsource-variable/big-shoulders/opsz.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './globals.css';

export const metadata = {
  title: 'Spielzimmer',
  description: 'Selbst ausgedachte Spiele zu zweit live spielen.',
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
