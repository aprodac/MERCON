import type { Metadata } from 'next';
import type React from 'react';
import { Cta } from '@/components/Cta';
import { Browser, Phone } from '@/components/Shots';
import { workflow } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Workflow',
  description: 'One trip in Linaul, from the quotation to the invoice: quote, create, dispatch, drive, track, close and bill.',
};

export default function WorkflowPage() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 96 }}>
        <div className="wrap">
          <div className="grid hero-top">
            <div className="meta">
              <span className="label">Workflow</span>
              <span className="index">{workflow.length} steps · 1 trip record</span>
            </div>
            <h1 className="display">
              One trip, quote to invoice<span className="dot">.</span>
            </h1>
          </div>
          <div className="grid hero-sub">
            <p className="lead">
              Follow a single load through the system: the operator quotes and creates it, the driver runs it, the customer
              watches it, the accountant bills it. Nobody types it twice.
            </p>
          </div>
          <ol className="wf-index">
            {workflow.map((s) => (
              <li key={s.n}>
                <a href={`#step-${s.n}`}>
                  <span className="n">{s.n}</span>
                  <span className="t">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {workflow.map((s, i) => (
        <section key={s.n} id={`step-${s.n}`} className={`tour-block${i % 2 ? ' panel' : ''}`}>
          <div className="wrap grid">
            <div className="meta">
              <span className="wf-n">{s.n}</span>
              <span className="label">{s.who}</span>
            </div>
            <div className="body">
              <h2 className="h2">{s.title}</h2>
              <p className="lead muted">{s.text}</p>
            </div>
            <ul className="ticks list">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div
              className="shots wf-shots"
              // A phone takes one column, a browser frame three; every step fits on one row.
              style={{ '--cols': Math.max(6, s.shots.reduce((n, sh) => n + (sh.kind === 'phone' ? 1 : 3), 0)) } as React.CSSProperties}
            >
              {s.shots.map(({ kind, url, ...sh }) =>
                kind === 'phone' ? <Phone key={sh.src} {...sh} /> : <Browser key={sh.src} {...sh} url={url} className="wf-browser" />,
              )}
            </div>
          </div>
        </section>
      ))}

      <Cta />
    </>
  );
}
