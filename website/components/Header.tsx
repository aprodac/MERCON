'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { nav, site } from '@/lib/content';

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={`${site.name} home`}>
      <span className="logo-mark" aria-hidden />
      {site.name}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  return (
    <header className="header">
      <div className="wrap bar">
        <Logo />
        <nav className="nav" aria-label="Main">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <a className="btn btn-primary btn-sm cta-sm" href={`mailto:${site.contactEmail}?subject=Linaul%20demo`}>
          Book a demo
        </a>
      </div>
    </header>
  );
}
