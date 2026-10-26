import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { site } from '@/lib/content';
import { asset } from '@/lib/asset';

export const metadata: Metadata = {
  title: { default: `${site.name} — ${site.tagline}`, template: `%s — ${site.name}` },
  description:
    'Linaul runs trucking and logistics companies end to end: trips, live GPS, drivers, fleet, customer tracking, invoicing and full accounting — on web, iOS and Android.',
  icons: { icon: asset('/favicon.svg') },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
