/** Month helpers for the driver payouts by month view. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** "2026-09" moved by n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-09" → "Sep 2026", or "Sep" when short. */
export function monthName(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  return short ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

/** Share paid, 0–100. */
export const paidPct = (paid: number, earned: number) => (earned > 0.005 ? Math.min(100, (paid / earned) * 100) : 0);
