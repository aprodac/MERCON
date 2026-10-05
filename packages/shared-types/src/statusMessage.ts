/**
 * The one WhatsApp status message format — used by the web dashboard (trip
 * list, trip page, kanban, dashboard share) and the operator app (Home, trip
 * page, Fleet map), for one trip or several. It follows the operators' own
 * dispatch format:
 *
 *   @IMILE DELIVERY SAUDI LOGISTICS
 *   1. KHA >>> KHA(LOCAL) 10 TON (ROUND TRIP)
 *   Driver Name # MOHAMMED FAIZAN FAIZ AHMED
 *   Number # +966 550975991
 *   Truck no # VSA-3071
 *   Status # In Transit
 *   ETA # 14:20 (in 1 h 40 min · 85 KM to KHA(LOCAL))
 *
 *   Track live: https://…/t/…
 *
 * Several trips of one customer go in one message, numbered, each with its own
 * live link; the customer's all-trucks link (when given) goes first so the
 * WhatsApp preview card shows their whole fleet. Pure: callers format times in
 * the deployment time zone and pass ready strings.
 */

export interface StatusTrip {
  /** Pickup / first stop — a place code when there is one ("KHA"), else its name. */
  from: string | null;
  /** Drop-off / last stop. */
  to: string | null;
  /** Truck class, e.g. "10 TON". */
  vehicleClass?: string | null;
  /** e.g. "Round trip", "Single trip", "12 hours duty". */
  lineType?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  plate?: string | null;
  /** A 3PL partner runs the trip — named on its own line. */
  carrier?: string | null;
  /** Raw trip status (Draft, Scheduled, Loading, InTransit, Delayed, Completed, Invoiced, Cancelled…). */
  status: string;
  /** When a not-started trip is due to start, already formatted ("Mon 5 Oct 09:00"). */
  startsAt?: string | null;
  /** Live ETA to where the truck is heading, already formatted. */
  eta?: {
    /** Clock time, e.g. "14:20". */
    time: string;
    /** "1 h 40 min". */
    inText?: string | null;
    kmLeft?: number | null;
    /** The place it's heading to. */
    to?: string | null;
    /** "40 min late" — shown when it runs late against the plan. */
    late?: string | null;
  } | null;
  /** The planned arrival, when there is no live ETA ("14:20"). */
  plannedArrival?: string | null;
  /** When it was delivered, for a finished trip ("13:52"). */
  deliveredAt?: string | null;
  trackingUrl?: string | null;
  /** Extra lines the operator adds, e.g. "WITH TAILGATE". */
  notes?: string[] | null;
}

const STATUS_WORD: Record<string, string> = {
  Draft: 'Scheduled',
  Scheduled: 'Scheduled',
  Loading: 'Loading',
  AtPickup: 'Loading',
  InTransit: 'In Transit',
  AtDelivery: 'At Delivery',
  Delayed: 'Delayed',
  Completed: 'Delivered',
  Invoiced: 'Delivered',
  Cancelled: 'Cancelled',
};

const up = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** "0550975991" / "966550975991" / "+966 55 097 5991" → "+966 550975991"; other countries "+<digits>". */
export function formatWhatsAppPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('966')) return `+966 ${d.slice(3)}`;
  if (d.startsWith('05') && d.length === 10) return `+966 ${d.slice(1)}`;
  if (d.startsWith('5') && d.length === 9) return `+966 ${d}`;
  return `+${d}`;
}

/** "KHA >>> KHA(LOCAL) 10 TON (ROUND TRIP)" */
export function statusHeadline(t: Pick<StatusTrip, 'from' | 'to' | 'vehicleClass' | 'lineType'>): string {
  const route = `${up(t.from) || 'ORIGIN'} >>> ${up(t.to) || 'DESTINATION'}`;
  return [route, up(t.vehicleClass) || null, t.lineType ? `(${up(t.lineType)})` : null].filter(Boolean).join(' ');
}

/** The lines for one trip, without its number or link. */
function statusLines(t: StatusTrip): string[] {
  const lines: string[] = [];
  if (t.carrier) lines.push(`Carrier # ${up(t.carrier)}`);
  lines.push(`Driver Name # ${up(t.driverName) || 'NOT ASSIGNED YET'}`);
  const phone = formatWhatsAppPhone(t.driverPhone);
  if (phone) lines.push(`Number # ${phone}`);
  lines.push(`Truck no # ${up(t.plate) || 'NOT ASSIGNED YET'}`);

  const word = STATUS_WORD[t.status] ?? t.status;
  const done = t.status === 'Completed' || t.status === 'Invoiced';
  const notStarted = t.status === 'Draft' || t.status === 'Scheduled';
  if (done) lines.push(`Status # ${word}${t.deliveredAt ? ` · ${t.deliveredAt}` : ''}`);
  else if (notStarted) lines.push(`Status # ${word}${t.startsAt ? ` · starts ${t.startsAt}` : ''}`);
  else lines.push(`Status # ${word}`);

  if (!done && t.status !== 'Cancelled') {
    if (t.eta) {
      const detail = [t.eta.inText ? `in ${t.eta.inText}` : null, t.eta.kmLeft != null ? `${Math.round(t.eta.kmLeft)} KM${t.eta.to ? ` to ${up(t.eta.to)}` : ''}` : null]
        .filter(Boolean)
        .join(' · ');
      lines.push(`ETA # ${t.eta.time}${detail ? ` (${detail})` : ''}${t.eta.late ? ` · ${t.eta.late}` : ''}`);
    } else if (t.plannedArrival && !notStarted) {
      lines.push(`Planned arrival # ${t.plannedArrival}`);
    }
  }
  for (const n of t.notes ?? []) if (n.trim()) lines.push(up(n));
  return lines;
}

export interface StatusMessageOptions {
  customerName?: string | null;
  /** "MONTHLY" or "EXTRA" — adds the "*(MONTHLY VEHICLE)*" line operators use. */
  billing?: 'MONTHLY' | 'EXTRA' | null;
  /** The customer's all-trucks live page; goes first so WhatsApp previews it. */
  fleetUrl?: string | null;
}

function header(o: StatusMessageOptions): string[] {
  const lines: string[] = [];
  if (o.customerName?.trim()) lines.push(`@${up(o.customerName)}`);
  if (o.billing) lines.push(`*(${o.billing} VEHICLE)*`);
  return lines;
}

/** One trip's message. */
export function formatTripStatusMessage(t: StatusTrip, o: StatusMessageOptions = {}): string {
  const lines = [...header(o), `1. ${statusHeadline(t)}`, ...statusLines(t)];
  if (t.trackingUrl) lines.push('', `Track live: ${t.trackingUrl}`);
  return lines.join('\n');
}

/** One numbered trip block of a multi-trip message, its live link on the last line. */
export function formatStatusEntry(t: StatusTrip, index: number): string {
  return [`${index}. ${statusHeadline(t)}`, ...statusLines(t), ...(t.trackingUrl ? [`Track live: ${t.trackingUrl}`] : [])].join('\n');
}

/** Several trips of one customer in one message (one trip → the single format). */
export function formatFleetStatusMessage(trips: StatusTrip[], o: StatusMessageOptions = {}): string {
  if (trips.length === 0) return '';
  if (trips.length === 1 && !o.fleetUrl) return formatTripStatusMessage(trips[0], o);
  const head = header(o);
  if (o.fleetUrl) head.push(`Track all ${trips.length} trucks live: ${o.fleetUrl}`);
  const blocks = trips.map((t, i) => formatStatusEntry(t, i + 1));
  return [head.join('\n'), ...blocks].filter(Boolean).join('\n\n');
}
