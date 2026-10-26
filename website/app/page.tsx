import Link from 'next/link';
import { Cta } from '@/components/Cta';
import { DashboardMock, LedgerMock, PhonesMock } from '@/components/Mocks';
import { apps, flow, moduleGroups, principles, site } from '@/lib/content';

export default function HomePage() {
  const moduleCount = moduleGroups.reduce((n, g) => n + g.modules.length, 0);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="grid hero-top">
            <div className="meta">
              <span className="label">Logistics software</span>
              <span className="index">Web · iOS · Android</span>
            </div>
            <h1 className="display">
              Every trip.
              <br />
              Every truck.
              <br />
              One system<span className="dot">.</span>
            </h1>
          </div>
          <div className="grid hero-sub">
            <p className="lead">
              {site.name} runs trucking companies end to end — quotes, dispatch, live GPS, proof of delivery,
              invoicing and the books. Built inside a working fleet, now ready for yours.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href={`mailto:${site.contactEmail}?subject=Linaul%20demo`}>
                Book a demo <span className="arrow">→</span>
              </a>
              <Link className="btn btn-ghost" href="/modules/">
                Modules
              </Link>
            </div>
          </div>
          <DashboardMock />
        </div>
      </section>

      <section className="section dark tight">
        <div className="wrap">
          <div className="cells">
            <div className="cell">
              <span className="index">A</span>
              <span className="h3">{moduleCount} modules</span>
              <p>Operations, fleet, customers, finance, reports and admin.</p>
            </div>
            <div className="cell">
              <span className="index">B</span>
              <span className="h3">4 surfaces</span>
              <p>Web dashboard, operator app, driver app and a customer tracking page.</p>
            </div>
            <div className="cell">
              <span className="index">C</span>
              <span className="h3">3 roles</span>
              <p>Admin, Operator, Driver — nothing to configure, nothing to guess.</p>
            </div>
            <div className="cell">
              <span className="index">D</span>
              <span className="h3">1 trip record</span>
              <p>Shared by ops, drivers, customers and accounting.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="grid sh">
            <span className="label">01 — Workflow</span>
            <h2 className="h2">From the first quote to the final invoice, without re-typing anything.</h2>
          </div>
          <ol className="flow">
            {flow.map((s) => (
              <li key={s.n}>
                <span className="n">{s.n}</span>
                <div>
                  <div className="t">{s.title}</div>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section panel">
        <div className="wrap grid split">
          <div className="copy">
            <span className="label">02 — In the cab</span>
            <h2 className="h2">Drivers tap. Everyone else knows.</h2>
            <p className="lead muted">
              The driver app walks each stop in order — arrive, photo, depart. GPS confirms arrival automatically,
              so the ops desk, the customer and the invoice all see the same times.
            </p>
            <ul className="ticks">
              <li>Phone number and licence login — no passwords to forget</li>
              <li>English and Urdu, right-to-left ready</li>
              <li>Photos at pickup, every stop and delivery</li>
              <li>Emergency button and in-app notifications</li>
            </ul>
            <Link className="btn btn-ghost" href="/apps/" style={{ alignSelf: 'flex-start' }}>
              Explore the apps <span className="arrow">→</span>
            </Link>
          </div>
          <div className="visual">
            <PhonesMock />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="grid sh">
            <span className="label">03 — Modules</span>
            <h2 className="h2">Switch on what you need. Add the rest when you grow.</h2>
          </div>
          <div className="cells c3">
            {moduleGroups.map((g, i) => (
              <Link key={g.id} href={`/modules/#${g.id}`} className="cell">
                <span className="index">{String(i + 1).padStart(2, '0')}</span>
                <span className="h3">{g.title}</span>
                <p>{g.intro}</p>
                <span className="index">{g.modules.map((m) => m.name).join(' · ')}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark">
        <div className="wrap grid split">
          <div className="copy">
            <span className="label">04 — Finance</span>
            <h2 className="h2">Know what every trip earned.</h2>
            <p className="lead muted">
              Double-entry accounting is built around the trip. Freight, extra charges, fuel, tolls and driver pay
              land in the ledger as the work happens — profit per trip and per truck, ready when you are.
            </p>
            <ul className="ticks">
              <li>Invoices, bills, AR and AP ageing</li>
              <li>Profit &amp; loss, balance sheet, cash flow, VAT return</li>
              <li>Bank reconciliation and period locking</li>
              <li>Vehicle P&amp;L for every truck in the fleet</li>
            </ul>
          </div>
          <div className="visual">
            <LedgerMock />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="grid sh">
            <span className="label">05 — Surfaces</span>
            <h2 className="h2">One platform, four ways in.</h2>
          </div>
          <div className="cells">
            {apps.map((a) => (
              <Link key={a.id} href={`/apps/#${a.id}`} className="cell">
                <span className="index">{a.label}</span>
                <span className="h3">{a.name}</span>
                <p>{a.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section panel">
        <div className="wrap">
          <div className="grid sh">
            <span className="label">06 — Principles</span>
            <h2 className="h2">Made by people who run trucks.</h2>
            <p className="lead muted">
              {site.name} started as the in-house system of a working logistics company. Every screen was shaped by
              dispatchers, drivers and accountants using it every day.
            </p>
          </div>
          <div className="cells">
            {principles.map((p, i) => (
              <div key={p.title} className="cell" style={{ background: 'var(--bg)' }}>
                <span className="index">{String(i + 1).padStart(2, '0')}</span>
                <span className="h3">{p.title}</span>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Cta />
    </>
  );
}
