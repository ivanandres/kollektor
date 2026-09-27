import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
// Archivo, self-hosted with the same weights the Modernist system loads (works offline).
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/archivo/latin-800.css';
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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
