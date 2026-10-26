import Link from 'next/link';
import { site } from '@/lib/content';

export function Cta() {
  return (
    <section className="section dark cta">
      <div className="wrap grid">
        <h2 className="h2">
          Run the whole operation from one place<span className="dot">.</span>
        </h2>
        <div className="actions">
          <a className="btn btn-primary" href={`mailto:${site.contactEmail}?subject=Linaul%20demo`}>
            Book a demo <span className="arrow">→</span>
          </a>
          <Link className="btn btn-ghost" href="/modules/">
            See all modules
          </Link>
        </div>
      </div>
    </section>
  );
}
