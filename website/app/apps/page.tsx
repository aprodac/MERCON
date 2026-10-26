import type { Metadata } from 'next';
import Link from 'next/link';
import { Cta } from '@/components/Cta';
import { Browser, Phone, PhoneRow } from '@/components/Shots';
import { apps } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Apps',
  description: 'The Linaul web dashboard, operator app, driver app and customer tracking page.',
};

export default function AppsPage() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 96 }}>
        <div className="wrap">
          <div className="grid hero-top">
            <div className="meta">
              <span className="label">Apps</span>
              <span className="index">Web · iOS · Android · Browser</span>
            </div>
            <h1 className="display">
              The right screen for every seat<span className="dot">.</span>
            </h1>
          </div>
        </div>
      </section>

      {apps.map((a, i) => (
        <section key={a.id} id={a.id} className={`app-block${i % 2 ? ' panel' : ''}`} style={{ scrollMarginTop: 60 }}>
          <div className="wrap grid">
            <div className="meta">
              <span className="index">{String(i + 1).padStart(2, '0')}</span>
              <span className="label">{a.label}</span>
              <span className="muted">For {a.audience.toLowerCase()}</span>
            </div>
            <div className="body">
              <h2 className="h2">{a.name}</h2>
              <p className="lead">{a.summary}</p>
              {a.id === 'operator' && (
                <Link className="btn btn-ghost" href="/operator-app/" style={{ alignSelf: 'flex-start' }}>
                  Tour the operator app <span className="arrow">→</span>
                </Link>
              )}
            </div>
            <ul className="ticks list">
              {a.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {a.browsers && (
              <div className="shots browsers">
                {a.browsers.map((sh) => (
                  <Browser key={sh.src} {...sh} url={a.id === 'tracking' ? 'track.linaul.com' : undefined} />
                ))}
              </div>
            )}
            {a.phones && (
              <div className="shots">
                <PhoneRow shots={a.phones} />
              </div>
            )}
          </div>
        </section>
      ))}

      <section className="section panel">
        <div className="wrap grid split">
          <div className="copy">
            <span className="label">Roles</span>
            <h2 className="h2">Three roles. No guesswork.</h2>
            <ul className="ticks">
              <li><span><b>Admin</b>&nbsp;— everything, including users, branding and module settings</span></li>
              <li><span><b>Operator</b>&nbsp;— runs trips, fleet, customers and billing</span></li>
              <li><span><b>Driver</b>&nbsp;— the driver app only, with their own trips</span></li>
            </ul>
            <p className="muted">Permissions are checked on the server for every request, not just hidden in the interface.</p>
          </div>
          <div className="visual">
            <div className="phone-pair">
              <Phone src="/screens/driver-profile.webp" alt="Driver profile" caption="Driver" />
              <Phone src="/screens/op-trips.webp" alt="Operator trips" caption="Operator" />
            </div>
          </div>
        </div>
      </section>

      <Cta />
    </>
  );
}
