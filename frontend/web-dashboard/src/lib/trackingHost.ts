/**
 * The customer-links address (track.mercon.tech, track-dev.mercon.tech): the
 * same app, but it serves only the pages handed to customers — /t/, /c/ and
 * /s/. No sign-in page and no dashboard behind them, so trimming a link never
 * lands a customer on the company's login. Its nginx only lets the public API
 * through as well (nginx/*track*.conf).
 */
export const isTrackingHost = (): boolean =>
  typeof window !== 'undefined' && /^track(-dev)?\./i.test(window.location.hostname);
