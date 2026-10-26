import type { Metadata } from 'next';
import { Cta } from '@/components/Cta';
import { Phone } from '@/components/Shots';
import { operatorTour, site } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Operator app',
  description: 'The Linaul operator app: create trips in three steps, follow them live, price lanes and check drivers from your phone.',
};

export default function OperatorAppPage() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 96 }}>
        <div className="wrap">
          <div className="grid hero-top">
            <div className="meta">
              <span className="label">Operator app</span>
              <span className="index">iOS · Android</span>
            </div>
            <h1 className="display">
              The ops desk, in your pocket<span className="dot">.</span>
            </h1>
          </div>
          <div className="grid hero-sub">
            <p className="lead">
              Everything a dispatcher does at the desk, on the phone: create and assign trips, follow every truck live,
              price a lane, share an ETA. Same data as the {site.name} dashboard, the moment it changes.
            </p>
          </div>
          <nav className="toc" aria-label="Operator app sections">
            {operatorTour.map((t) => (
              <a key={t.id} href={`#${t.id}`}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {operatorTour.map((t, i) => (
        <section key={t.id} id={t.id} className={`tour-block${i % 2 ? ' panel' : ''}`}>
          <div className="wrap grid">
            <div className="meta">
              <span className="index">{String(i + 1).padStart(2, '0')}</span>
              <span className="label">{t.label}</span>
            </div>
            <div className="body">
              <h2 className="h2">{t.title}</h2>
              <p className="lead muted">{t.text}</p>
            </div>
            <ul className="ticks list">
              {t.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className={`shots phone-row${t.steps ? ' steps' : ''}`}>
              {t.phones.map((sh, k) => (
                <Phone key={sh.src} {...sh} caption={t.steps ? `${String(k + 1).padStart(2, '0')}  ${sh.caption}` : sh.caption} />
              ))}
            </div>
            {t.more && (
              <>
                <h3 className="h3 more-title">{t.more.title}</h3>
                <div className="shots phone-row">
                  {t.more.phones.map((sh) => (
                    <Phone key={sh.src} {...sh} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      ))}

      <Cta />
    </>
  );
}
