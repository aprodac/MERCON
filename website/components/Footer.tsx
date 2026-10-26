import Link from 'next/link';
import { moduleGroups, site } from '@/lib/content';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="grid">
          <div className="brand">
            <span className="label">{site.name}</span>
            <p className="muted" style={{ maxWidth: 360 }}>
              {site.tagline} Trips, fleet, drivers, customers and accounting in one system.
            </p>
          </div>
          <div className="col">
            <span className="label">Product</span>
            <Link href="/">Overview</Link>
            <Link href="/modules/">Modules</Link>
            <Link href="/workflow/">Workflow</Link>
            <Link href="/operator-app/">Operator app</Link>
            <Link href="/apps/">Apps</Link>
          </div>
          <div className="col">
            <span className="label">Modules</span>
            {moduleGroups.map((g) => (
              <Link key={g.id} href={`/modules/#${g.id}`}>
                {g.title}
              </Link>
            ))}
          </div>
        </div>
        <div className="wordmark" aria-hidden>
          {site.name.toLowerCase()}
          <span>.</span>
        </div>
        <div className="base">
          <span>© {new Date().getFullYear()} {site.name}</span>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </div>
      </div>
    </footer>
  );
}
