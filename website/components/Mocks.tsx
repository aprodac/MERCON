// Illustrative product UI built in HTML/CSS (no screenshots), so it stays
// crisp at any size and matches the site's type. Sample rows only.

const rows = [
  { id: 'TR-1042', from: 'Riyadh', to: 'Dammam', who: 'A. Khan · 4521 RSA', status: 'live', label: 'In transit' },
  { id: 'TR-1041', from: 'Jeddah Port', to: 'Riyadh DC', who: 'M. Iqbal · 7730 KSA', status: 'live', label: 'At stop 2' },
  { id: 'TR-1040', from: 'Dammam', to: 'Jubail', who: 'S. Ali · 1189 DMM', status: 'done', label: 'Delivered' },
  { id: 'TR-1039', from: 'Riyadh', to: 'Qassim', who: 'Assign later', status: 'plan', label: 'Draft' },
  { id: 'TR-1038', from: 'Khobar', to: 'Riyadh', who: 'R. Shah · 3304 RYD', status: 'done', label: 'Delivered' },
];

export function DashboardMock() {
  return (
    <div className="mock" aria-label="Illustration of the Linaul trip board and live map">
      <div className="mock-bar">
        <div className="tabs">
          <span>Trips</span>
          <span className="muted">Live map</span>
          <span className="muted">Fleet</span>
        </div>
        <span className="index">Today · 5 trips</span>
      </div>
      <div className="mock-body">
        <div className="mock-list">
          {rows.map((r) => (
            <div className="mock-row" key={r.id}>
              <span className="index">{r.id}</span>
              <span className="route">
                <b>
                  {r.from} → {r.to}
                </b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {r.who}
                </span>
              </span>
              <span className={`status ${r.status}`}>{r.label}</span>
            </div>
          ))}
        </div>
        <div className="mock-map">
          <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="#dcdcd8" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="400" height="380" fill="url(#g)" />
            <path d="M40 300 L120 220 L200 230 L280 120 L360 70" fill="none" stroke="#0a0a0a" strokeWidth="2" />
            <path d="M280 120 L360 70" fill="none" stroke="#0a0a0a" strokeWidth="2" strokeDasharray="4 5" />
            <rect x="34" y="294" width="12" height="12" fill="#0a0a0a" />
            <rect x="194" y="224" width="12" height="12" fill="#fff" stroke="#0a0a0a" strokeWidth="2" />
            <rect x="354" y="64" width="12" height="12" fill="#fff" stroke="#0a0a0a" strokeWidth="2" />
            <circle cx="280" cy="120" r="18" fill="#ff4f00" opacity="0.18" />
            <circle cx="280" cy="120" r="7" fill="#ff4f00" />
          </svg>
          <div className="mock-card">
            <div>
              <div className="k">Trip</div>
              <div className="v">TR-1042</div>
            </div>
            <div>
              <div className="k">Speed</div>
              <div className="v">84 km/h</div>
            </div>
            <div>
              <div className="k">ETA</div>
              <div className="v">14:20</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhonesMock() {
  return (
    <div className="phones" aria-label="Illustration of the driver and operator apps">
      <div className="phone">
        <span className="notch" />
        <span className="label muted">Driver · Trip TR-1042</span>
        <span className="ph-title">Riyadh → Dammam</span>
        <div className="ph-step on"><i />Pickup photo</div>
        <div className="ph-step on"><i />Departed</div>
        <div className="ph-step cur"><i />Arrive at offload</div>
        <div className="ph-step"><i />Proof of delivery</div>
        <div className="ph-row"><span className="muted">Cargo</span><span>12 pallets</span></div>
        <div className="ph-row"><span className="muted">Next stop</span><span>Dammam DC</span></div>
        <div className="ph-btn">Arrived</div>
      </div>
      <div className="phone secondary">
        <span className="notch" />
        <span className="label muted">Operator · Live</span>
        <span className="ph-title">3 trips running</span>
        <div className="ph-row"><span>TR-1042</span><span style={{ color: 'var(--accent)' }}>In transit</span></div>
        <div className="ph-row"><span>TR-1041</span><span style={{ color: 'var(--accent)' }}>At stop 2</span></div>
        <div className="ph-row"><span>TR-1037</span><span className="muted">Delayed 25m</span></div>
        <div className="ph-row"><span className="muted">Docs expiring</span><span>2</span></div>
        <div className="ph-row"><span className="muted">Fleet use · week</span><span>78%</span></div>
        <div className="ph-btn" style={{ background: 'var(--fg)' }}>+ New trip</div>
      </div>
    </div>
  );
}

export function LedgerMock() {
  return (
    <div className="ledger" aria-label="Illustration of trip profitability">
      <div className="lr"><span>TR-1042 · Freight</span><span>SAR 4,800.00</span></div>
      <div className="lr"><span>Extra charge · waiting time</span><span>SAR 350.00</span></div>
      <div className="lr"><span>Fuel</span><span className="neg">− SAR 1,120.00</span></div>
      <div className="lr"><span>Tolls</span><span className="neg">− SAR 90.00</span></div>
      <div className="lr"><span>Driver trip pay</span><span className="neg">− SAR 600.00</span></div>
      <div className="lr total"><span>Trip margin</span><span>SAR 3,340.00</span></div>
    </div>
  );
}
