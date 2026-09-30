import './globals.css';

export const metadata = {
  title: 'Spielzimmer',
  description: 'Eure eigenen Spiele – live zusammen spielen.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e0457b',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
