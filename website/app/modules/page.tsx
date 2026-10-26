import type { Metadata } from 'next';
import { Cta } from '@/components/Cta';
import { Browser } from '@/components/Shots';
import { moduleGroups, moduleShots } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Modules',
  description: 'Every Linaul module: operations, fleet, customers, finance, reports and administration.',
};

export default function ModulesPage() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 72 }}>
        <div className="wrap">
          <div className="grid hero-top">
            <div className="meta">
              <span className="label">Modules</span>
              <span className="index">{moduleGroups.length} groups</span>
            </div>
            <h1 className="display">
              Everything a fleet runs on<span className="dot">.</span>
            </h1>
          </div>
          <nav className="toc" aria-label="Module groups">
            {moduleGroups.map((g) => (
              <a key={g.id} href={`#${g.id}`}>
                {g.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {moduleGroups.map((g, gi) => (
        <section key={g.id} id={g.id} className="group">
          <div className="wrap">
            <div className="grid group-head">
              <span className="index">{String(gi + 1).padStart(2, '0')}</span>
              <h2 className="h2">{g.title}</h2>
              <p className="lead muted">{g.intro}</p>
            </div>
            <div className="mods">
              {g.modules.map((m, mi) => (
                <article key={m.key} className="mod">
                  <span className="index">
                    {gi + 1}.{mi + 1}
                  </span>
                  <div className="name">
                    <h3 className="h3">{m.name}</h3>
                    {m.soon && <span className="tag">In development</span>}
                  </div>
                  <p className="sum">{m.summary}</p>
                  <ul>
                    {m.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  {moduleShots[m.key] && (
                    <div className={`shots${moduleShots[m.key].length === 1 ? ' one' : ''}`}>
                      {moduleShots[m.key].map((sh) => (
                        <Browser key={sh.src} {...sh} />
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <Cta />
    </>
  );
}
