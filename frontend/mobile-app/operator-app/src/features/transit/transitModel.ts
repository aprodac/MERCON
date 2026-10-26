import type { TransitTone } from '../../lib/operator';

/** 225 → "3h 45"; 180 → "3h 00"; 40 → "40 min". */
export const hm = (min: number | null | undefined) => {
  if (min == null) return '—';
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;
};

/** "+30 min" / "−1h 05" / "on plan" against the planned time. */
export const overText = (actual: number | null, planned: number | null) => {
  if (actual == null || planned == null) return '';
  const d = Math.round(actual - planned);
  return d === 0 ? 'on plan' : `${d > 0 ? '+' : '−'}${hm(Math.abs(d))}`;
};

export const TONE: Record<TransitTone, { fg: string; bg: string }> = {
  green: { fg: '#146C3C', bg: '#E3F4EA' },
  amber: { fg: '#9A5B05', bg: '#FDF0D5' },
  red: { fg: '#B42318', bg: '#FDE8E6' },
};

export const PERIOD_OPTIONS = [7, 30, 90] as const;

/** The skipped-trips line under the list, or null when nothing was left out. */
export function skippedText(s: { missing: number; out_of_order: number; stamped: number; total: number }): string | null {
  if (!s.total) return null;
  const why = [
    s.missing ? `${s.missing} missing times` : '',
    s.out_of_order ? `${s.out_of_order} times out of order` : '',
    s.stamped ? `${s.stamped} created as completed with planned times` : '',
  ].filter(Boolean).join(', ');
  return `${s.total} finished ${s.total === 1 ? 'trip was' : 'trips were'} left out: ${why}.`;
}

/** Same grouping key as the API: lower-cased, single-spaced place name. */
export const placeKey = (name: string | null | undefined) => (name ?? '').trim().toLowerCase().replace(/[\s|]+/g, ' ');

/** The saved planned time for a leg and truck size, or null — what Create trip plans with. */
export function savedTransitMinutes(
  saved: { origin_key: string; destination_key: string; leg: string; truck_class: string; planned_minutes: number }[],
  leg: 'out' | 'return',
  from: string | null | undefined,
  to: string | null | undefined,
  size: string | null | undefined,
): number | null {
  const a = placeKey(from);
  const b = placeKey(to);
  if (!a || !b || !size) return null;
  return saved.find((r) => r.leg === leg && r.origin_key === a && r.destination_key === b && r.truck_class === size)?.planned_minutes ?? null;
}
