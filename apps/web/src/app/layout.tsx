import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import '@/styles/modernist.css';
import '@/styles/app.css';

export const metadata: Metadata = {
  title: { default: 'Kolektorz', template: '%s · Kolektorz' },
  description: 'Qué tenés. Qué querés. Cuánto vale. Tu colección de vinilos, edición por edición.',
  applicationName: 'Kolektorz',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Kolektorz', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3f2f2',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Same weights the Modernist system loads. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
