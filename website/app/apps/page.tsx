import type { Metadata } from 'next';
import { Cta } from '@/components/Cta';
import { PhonesMock } from '@/components/Mocks';
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
            </div>
            <ul className="ticks list">
              {a.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="section panel">
        <div className="wrap grid split">
          <div className="copy">
            <span className="label">Roles</span>
            <h2 className="h2">Three roles. No guesswork.</h2>
            <ul className="ticks">
              <li><b>Admin</b>&nbsp;— everything, including users, branding and module settings</li>
              <li><b>Operator</b>&nbsp;— runs trips, fleet, customers and billing</li>
              <li><b>Driver</b>&nbsp;— the driver app only, with their own trips</li>
            </ul>
            <p className="muted">Permissions are checked on the server for every request, not just hidden in the interface.</p>
          </div>
          <div className="visual">
            <PhonesMock />
          </div>
        </div>
      </section>

      <Cta />
    </>
  );
}
