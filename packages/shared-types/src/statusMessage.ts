/**
 * The one WhatsApp status message format — used by the web dashboard (trip
 * list, trip page, kanban, dashboard share) and the operator app (Home, trip
 * page, Fleet map), for one trip or several. It follows the operators' own
 * formats. When a trip is created / a truck is assigned (and while the trip
 * hasn't started), the dispatch format:
 *
 *   @Taha                                 (whoever is tagged, or the customer)
 *   *(MONTHLY VEHICLE)*
 *   1. KHA>>>NAJ 05 TON (ROUND TRIP)
 *   Driver Name # SHAHBAZ
 *   Number # +966 51 078 5259
 *   Truck no # DRA-6487
 *   WITH TAILGATE
 *
 * Once it runs, the status update:
 *
 *   @Mazher (ibaad)
 *   🚛 Vehicle Status Update
 *   Truck: *VTA-3241*
 *   Driver: WISAL ZAR
 *   Route: RUH>>>BAH
 *   Distance left: 96 KM TO BAH
 *   ETA: 1.4HRS
 *   Status: In Transit
 *
 * Each trip's live link follows ("Track live: …"). Several trips of one
 * customer go in one message, numbered; the customer's all-trucks link (when
 * given) goes first so the WhatsApp preview card shows their whole fleet.
 * Pure: callers format times in the deployment time zone and pass ready strings.
 */

export interface StatusTrip {
  /** Pickup / first stop — a place code when there is one ("KHA"), else its name. */
  from: string | null;
  /** Drop-off / last stop. */
  to: string | null;
  /** Both ends in the same city — the route reads "RUH>>>RUH(LOCAL)". */
  local?: boolean;
  /** The trip's day, for a message whose trips fall on different days ("Mon 5 Oct 09:00"). */
  date?: string | null;
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
    /** Drive time left in minutes, written as hours ("1.4HRS"). */
    minutes?: number | null;
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

/** "510785259" → "51 078 5259"; any other length stays as it is. */
const saudiGroups = (n: string) => (n.length === 9 ? `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : n);

/** "0510785259" / "966510785259" / "+966 51 078 5259" → "+966 51 078 5259"; other countries "+<digits>". */
export function formatWhatsAppPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('966')) return `+966 ${saudiGroups(d.slice(3))}`;
  if (d.startsWith('05') && d.length === 10) return `+966 ${saudiGroups(d.slice(1))}`;
  if (d.startsWith('5') && d.length === 9) return `+966 ${saudiGroups(d)}`;
  return `+${d}`;
}

/** "5 TON" → "05 TON", the way the customer groups write truck classes. */
const truckClass = (v: string | null | undefined) => up(v).replace(/^(\d)(\s*TON)$/, '0$1$2');

/** "SINGLE_TRIP" / "Round trip" → "SINGLE TRIP" / "ROUND TRIP". */
const lineTypeText = (v: string | null | undefined) => up((v ?? '').replace(/_/g, ' '));

/** "KHA>>>NAJ" / "RUH>>>RUH(LOCAL)" */
const routeText = (t: Pick<StatusTrip, 'from' | 'to' | 'local'>) =>
  `${up(t.from) || 'ORIGIN'}>>>${up(t.to) || 'DESTINATION'}${t.local ? '(LOCAL)' : ''}`;

/** "KHA>>>NAJ 05 TON (ROUND TRIP)" */
export function statusHeadline(t: Pick<StatusTrip, 'from' | 'to' | 'local' | 'vehicleClass' | 'lineType'>): string {
  const type = lineTypeText(t.lineType);
  return [routeText(t), truckClass(t.vehicleClass) || null, type ? `(${type})` : null].filter(Boolean).join(' ');
}

/** The dispatch format (trip created / truck assigned, or not started yet); otherwise the status update. */
const isDispatch = (t: StatusTrip, brief?: boolean) => !!brief || t.status === 'Draft' || t.status === 'Scheduled';

const noteLines = (t: StatusTrip) => (t.notes ?? []).filter((n) => n.trim()).map(up);

/** Dispatch lines for one trip, without its numbered headline or link. */
function dispatchLines(t: StatusTrip): string[] {
  const lines: string[] = [];
  if (t.date) lines.push(`Date # ${t.date}`);
  if (t.carrier) lines.push(`Carrier # ${up(t.carrier)}`);
  lines.push(`Driver Name # ${up(t.driverName) || 'NOT ASSIGNED YET'}`);
  const phone = formatWhatsAppPhone(t.driverPhone);
  if (phone) lines.push(`Number # ${phone}`);
  lines.push(`Truck no # ${up(t.plate) || 'NOT ASSIGNED YET'}`);
  return [...lines, ...noteLines(t)];
}

/** 84 → "1.4HRS" */
const hoursText = (minutes: number) => `${(Math.max(0, minutes) / 60).toFixed(1)}HRS`;

/** Status-update lines for one trip, without the title or link. */
function updateLines(t: StatusTrip): string[] {
  const lines: string[] = [];
  if (t.date) lines.push(`Date: ${t.date}`);
  const plate = up(t.plate);
  lines.push(`Truck: ${plate ? `*${plate}*` : 'NOT ASSIGNED YET'}`);
  lines.push(`Driver: ${up(t.driverName) || 'NOT ASSIGNED YET'}`);
  if (t.carrier) lines.push(`Carrier: ${up(t.carrier)}`);
  lines.push(`Route: ${routeText(t)}`);

  const done = t.status === 'Completed' || t.status === 'Invoiced';
  if (!done && t.status !== 'Cancelled') {
    if (t.eta) {
      if (t.eta.kmLeft != null) lines.push(`Distance left: ${Math.round(t.eta.kmLeft)} KM${t.eta.to ? ` TO ${up(t.eta.to)}` : ''}`);
      const eta = t.eta.minutes != null ? hoursText(t.eta.minutes) : t.eta.time;
      lines.push(`ETA: ${eta}${t.eta.late ? ` (${t.eta.late})` : ''}`);
    } else if (t.plannedArrival) {
      lines.push(`ETA: ${t.plannedArrival} (planned)`);
    }
  }
  const word = STATUS_WORD[t.status] ?? t.status;
  lines.push(`Status: ${word}${done && t.deliveredAt ? ` · ${t.deliveredAt}` : ''}`);
  return [...lines, ...noteLines(t)];
}

export const STATUS_UPDATE_TITLE = '🚛 Vehicle Status Update';

export interface StatusMessageOptions {
  /** The @ line: the person the message is for, or the customer — written as given. */
  tag?: string | null;
  /** "MONTHLY" or "EXTRA" — adds the "*(MONTHLY VEHICLE)*" line operators use. */
  billing?: 'MONTHLY' | 'EXTRA' | null;
  /** The customer's all-trucks live page; goes first so WhatsApp previews it. */
  fleetUrl?: string | null;
  /** The assignment message: the dispatch format whatever the trip's status. */
  brief?: boolean;
}

function header(o: StatusMessageOptions): string[] {
  const lines: string[] = [];
  if (o.tag?.trim()) lines.push(`@${o.tag.trim()}`);
  if (o.billing) lines.push(`*(${o.billing} VEHICLE)*`);
  return lines;
}

/** One trip's message. */
export function formatTripStatusMessage(t: StatusTrip, o: StatusMessageOptions = {}): string {
  const lines = isDispatch(t, o.brief)
    ? [...header(o), `1. ${statusHeadline(t)}`, ...dispatchLines(t)]
    : [...header({ tag: o.tag }), STATUS_UPDATE_TITLE, ...updateLines(t)];
  if (t.trackingUrl) lines.push('', `Track live: ${t.trackingUrl}`);
  return lines.join('\n');
}

/** One numbered trip block of a multi-trip message, its live link on the last line. */
export function formatStatusEntry(t: StatusTrip, index: number, brief = false): string {
  const body = isDispatch(t, brief) ? [statusHeadline(t), ...dispatchLines(t)] : updateLines(t);
  body[0] = `${index}. ${body[0]}`;
  return [...body, ...(t.trackingUrl ? [`Track live: ${t.trackingUrl}`] : [])].join('\n');
}

/** The customer's all-trucks page line — same words wherever it goes. */
export const allTrucksLine = (url: string) => `All your trucks: ${url}`;

/** Several trips of one customer in one message (one trip → the single format). */
export function formatFleetStatusMessage(trips: StatusTrip[], o: StatusMessageOptions = {}): string {
  if (trips.length === 0) return '';
  if (trips.length === 1 && !o.fleetUrl) return formatTripStatusMessage(trips[0], o);
  const anyUpdate = trips.some((t) => !isDispatch(t, o.brief));
  const head = header(anyUpdate ? { tag: o.tag } : o);
  if (anyUpdate) head.push(STATUS_UPDATE_TITLE);
  if (o.fleetUrl) head.push(allTrucksLine(o.fleetUrl));
  const blocks = trips.map((t, i) => formatStatusEntry(t, i + 1, o.brief));
  return [head.join('\n'), ...blocks].filter(Boolean).join('\n\n');
}
