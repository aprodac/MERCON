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

/** A time saved for every truck size of a route (owner: "every vehicle type has the same TT"). */
export const ANY_SIZE = 'ANY';
/** The same route and leg as a key, for every truck size. */
export const anySizeKey = (key: string) => key.split('|').slice(0, 3).concat(ANY_SIZE).join('|');
/** "All sizes" for an all-sizes row, else the truck size. */
export const sizeLabel = (size: string) => (size === ANY_SIZE ? 'All sizes' : size);

/** The saved planned time for a leg and truck size (its own, else the all-sizes one), or null — what Create trip plans with. */
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
  const on = saved.filter((r) => r.leg === leg && r.origin_key === a && r.destination_key === b);
  return (on.find((r) => r.truck_class === size) ?? on.find((r) => r.truck_class === ANY_SIZE))?.planned_minutes ?? null;
}

/** The tone of an on-time share: green from 80 %, amber from 60 %, red below. */
export function onTimeTone(pct: number | null): { fg: string; bg: string } | null {
  if (pct == null) return null;
  return TONE[pct >= 80 ? 'green' : pct >= 60 ? 'amber' : 'red'];
}

/** A route row matches a search when its pickup or drop-off contains every typed word. */
export function routeMatches(r: { from: string; to: string }, search: string): boolean {
  const words = placeKey(search).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = `${placeKey(r.from)} ${placeKey(r.to)}`;
  return words.every((w) => hay.includes(w));
}

/** The colours for one actual time against its plan — same bands as the API (15 min grace, 1 h amber). */
export function toneFor(actual: number | null, planned: number | null): { fg: string; bg: string } | null {
  if (actual == null || planned == null) return null;
  const over = actual - planned;
  return TONE[over <= 15 ? 'green' : over <= 60 ? 'amber' : 'red'];
}

/** One route of the Quotations tab: every quotation leg with the same places (any truck size) shown once. */
export interface QuotationRoute {
  id: string;
  /** All-sizes key — what Set time / Use actual / Reset save against. */
  key: string;
  leg: 'out' | 'return';
  from: string;
  to: string;
  via: number;
  /** Given TT: the saved time, else what Create trip works out. */
  givenMin: number | null;
  saved: boolean;
  source: 'road' | 'approx' | 'duty' | null;
  actualAvgMin: number | null;
  trips: number;
  /** "#2", "#5 Khamis daily" — the quotations it comes from. */
  quotes: string[];
  /** The located stops of the route, [lng, lat] — the map preview; empty when not located. */
  points: [number, number][];
}

type QLeg = { key: string; leg: 'out' | 'return'; from: string; to: string; via: number; estimatedMin: number | null; estimateSource: 'road' | 'approx' | 'duty' | null; savedMin: number | null; actualAvgMin: number | null; trips: number; points?: [number, number][] };

/** Groups the quotations' legs by route (places + leg; a duty line apart), across truck sizes. */
export function quotationRoutes(quotes: { number: number | null; name: string; legs: QLeg[] }[]): QuotationRoute[] {
  const by = new Map<string, QuotationRoute & { sum: number }>();
  // The same leg key in two quotations is the same finished trips — counted once.
  const counted = new Set<string>();
  for (const q of quotes) {
    const label = q.number != null ? `#${q.number}` : q.name;
    for (const l of q.legs) {
      const duty = l.estimateSource === 'duty';
      const id = `${l.leg}|${placeKey(l.from)}|${placeKey(l.to)}${duty ? '|duty' : ''}`;
      const g = by.get(id) ?? { id, key: anySizeKey(l.key), leg: l.leg, from: l.from, to: l.to, via: l.via, givenMin: null, saved: false, source: l.estimateSource, actualAvgMin: null, trips: 0, quotes: [], points: [], sum: 0 };
      if (l.savedMin != null && !g.saved) { g.givenMin = l.savedMin; g.saved = true; }
      if (!g.saved && g.givenMin == null && l.estimatedMin != null) { g.givenMin = l.estimatedMin; g.source = l.estimateSource; }
      if (l.actualAvgMin != null && l.trips && !counted.has(l.key)) {
        counted.add(l.key);
        g.sum += l.actualAvgMin * l.trips;
        g.trips += l.trips;
      }
      if (g.points.length < 2 && (l.points?.length ?? 0) >= 2) g.points = l.points!;
      if (!g.quotes.includes(label)) g.quotes.push(label);
      by.set(id, g);
    }
  }
  return [...by.values()].map(({ sum, ...g }) => ({ ...g, actualAvgMin: g.trips ? Math.round(sum / g.trips) : null }));
}

/** A route matches a search on its places or a quotation it comes from. */
export const quotationRouteMatches = (r: QuotationRoute, search: string) =>
  routeMatches({ from: r.from, to: `${r.to} ${r.quotes.join(' ')}` }, search);

/** A route of the Transit times page: a quotation route with its customer. */
export interface OverviewRoute extends QuotationRoute { customerId: string; customerName: string; uid: string }

/** Every customer's routes, each once, for the Transit times page. */
export function overviewRoutes(customers: { customerId: string; name: string; quotations: { number: number | null; name: string; legs: QLeg[] }[] }[]): OverviewRoute[] {
  return customers.flatMap((c) => quotationRoutes(c.quotations).map((r) => ({ ...r, customerId: c.customerId, customerName: c.name, uid: `${c.customerId}~${r.id}` })));
}

/** How the actual average compares with the Given TT: null with no trips or no Given TT. */
export const routeTone = (r: { actualAvgMin: number | null; givenMin: number | null; trips: number }) =>
  r.trips ? toneFor(r.actualAvgMin, r.givenMin) : null;

/** Road-ish km between the stops (straight line × 1.22, as the API's fallback estimate). */
export function routeKm(points: [number, number][]): number | null {
  if (points.length < 2) return null;
  let km = 0;
  const r = Math.PI / 180;
  for (let i = 1; i < points.length; i++) {
    const [lng1, lat1] = points[i - 1];
    const [lng2, lat2] = points[i];
    const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.22;
  }
  return Math.round(km);
}
