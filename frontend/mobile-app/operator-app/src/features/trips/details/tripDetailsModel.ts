/**
 * Pure helpers for the trip details screen: status → phase / chip / next
 * action, stop names and lateness, money, and the WhatsApp message texts.
 * Mirrors the web's TripDetailsPage (tripStatus.ts, stopEvidence.ts,
 * utils/financialCalculations.ts) so both show the same thing.
 */
import type { TripStatus } from '@mercon/mobile-shared/lib/trips';
import { operatorService, type DriverUpdate, type LiveMediaStage, type OperatorTripDetail, type OperatorTripStop, type TripPhase } from '../../../lib/operator';

export type Stop = OperatorTripStop;

/** Arrival within this many minutes of the plan counts as on time (same as the web). */
export const ON_TIME_GRACE_MIN = 5;

/** Same mapping as the backend's tripPhase (services/tripOverview.ts). */
export function phaseOf(status: string): TripPhase {
  if (status === 'Draft' || status === 'Scheduled') return 'planned';
  if (status === 'Completed' || status === 'Invoiced') return 'done';
  if (status === 'Cancelled') return 'cancelled';
  return 'active';
}

export type Tone = 'violet' | 'sky' | 'blue' | 'red' | 'green' | 'gray';

export const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  violet: { bg: '#F0EBFC', fg: '#5B34B0', dot: '#7651D6' },
  sky: { bg: '#E6F4FB', fg: '#0B5F86', dot: '#0E87C0' },
  blue: { bg: '#E7EEFC', fg: '#2449A8', dot: '#2F5FD0' },
  red: { bg: '#FDEDEB', fg: '#912018', dot: '#D92D20' },
  green: { bg: '#E8F5EE', fg: '#146C3C', dot: '#1F9D55' },
  gray: { bg: '#F1F1F3', fg: '#52525B', dot: '#9898A4' },
};

/** Status chip colours — the same meaning as the web's statusChip. */
export function statusChip(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'Draft': return { label: 'Draft', tone: 'violet' };
    case 'Scheduled': return { label: 'Scheduled', tone: 'violet' };
    case 'Loading': return { label: 'Loading', tone: 'sky' };
    case 'InTransit': return { label: 'In transit', tone: 'blue' };
    case 'Delayed': return { label: 'Delayed', tone: 'red' };
    case 'Emergency': return { label: 'Emergency', tone: 'red' };
    case 'Completed': return { label: 'Completed', tone: 'green' };
    case 'Invoiced': return { label: 'Invoiced', tone: 'green' };
    case 'Cancelled': return { label: 'Cancelled', tone: 'gray' };
    default: return { label: status, tone: 'gray' };
  }
}

export interface NextAction {
  label: string;
  run: (id: string) => Promise<unknown>;
  confirm?: { title: string; message: string };
}

/**
 * The one button in the bottom bar. Only moves the backend allows
 * (ALLOWED_TRANSITIONS in services/tripLifecycle.ts).
 */
export function nextActionFor(status: TripStatus | string): NextAction | null {
  switch (status) {
    case 'Draft':
      return { label: 'Schedule trip', run: (id) => operatorService.updateTripStatus(id, 'Scheduled') };
    case 'Scheduled':
      // Stamps the pickup stop's arrival and moves the trip to Loading.
      return { label: 'Arrived at pickup', run: (id) => operatorService.pickupArrive(id) };
    case 'Loading':
      return { label: 'Loaded · depart', run: (id) => operatorService.updateTripStatus(id, 'InTransit') };
    case 'InTransit':
    case 'Delayed':
      return {
        label: 'Confirm delivery',
        run: (id) => operatorService.updateTripStatus(id, 'Completed'),
        confirm: { title: 'Confirm delivery?', message: 'This completes the trip and generates the invoice.' },
      };
    default:
      return null;
  }
}

/** Driver and truck can still be changed (the server refuses it on a finished trip). */
export const canChangeAssignment = (t: OperatorTripDetail) =>
  !t.is_third_party && !['Completed', 'Invoiced', 'Cancelled'].includes(t.status);

export const canCancel = (t: OperatorTripDetail) => !['Completed', 'Invoiced', 'Cancelled'].includes(t.status);

const isUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

/** A stop's display name, never a raw id or the round-trip marker. */
export function stopName(s: Stop | undefined, i: number): string {
  const raw = s?.location_name && !isUuid(s.location_name) ? s.location_name : '';
  const clean = raw.replace(/\[RETURN:.*?\]/gi, '').replace(/🔁\s*/g, '').trim();
  if (clean) return clean;
  if (s && Number.isFinite(s.location_lat) && Number.isFinite(s.location_lng) && (s.location_lat || s.location_lng)) {
    return `${s.location_lat.toFixed(3)}, ${s.location_lng.toFixed(3)}`;
  }
  return `Stop ${i + 1}`;
}

export const sortedStops = (t: OperatorTripDetail): Stop[] =>
  [...(t.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);

/** Minutes late against the plan (negative = early); null when either time is missing. */
export function minutesLate(planned: string | null | undefined, actual: string | null | undefined): number | null {
  if (!planned || !actual) return null;
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000);
}

export const delayText = (s: Stop) =>
  s.delay_note || (s.delay_reason ? String(s.delay_reason).replace(/([a-z])([A-Z])/g, '$1 $2') : null);

// ── Time ────────────────────────────────────────────────────────────────────

/** Formats in the deployment's timezone (not the phone's), like the web. */
export function makeFormatters(tz: string) {
  const fmt = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(d);
    } catch {
      return new Intl.DateTimeFormat('en-GB', opts).format(d);
    }
  };
  return {
    time: (iso?: string | null) => fmt(iso, { hour: '2-digit', minute: '2-digit', hour12: false }),
    dateTime: (iso?: string | null) => fmt(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    dayTime: (iso?: string | null) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    date: (iso?: string | null) => fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' }),
    /** A stop time: just the time when it's today, else day + time. */
    smart: (iso?: string | null) => {
      if (!iso) return '';
      const sameDay = fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) === fmt(new Date().toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' });
      return sameDay
        ? fmt(iso, { hour: '2-digit', minute: '2-digit', hour12: false })
        : fmt(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    },
  };
}
export type Formatters = ReturnType<typeof makeFormatters>;

/** "2 h 15 min", "40 min". */
export function formatDuration(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} d ${h % 24} h`;
  if (h > 0) return `${h} h ${m % 60} min`;
  return `${m} min`;
}

export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// ── Header facts ──────────────────────────────────────────────────────────────

export function lineType(t: OperatorTripDetail): string {
  const raw = t.quotation_line_type || t.rateCard?.rate_category;
  if (raw) {
    const s = String(raw).trim();
    if (/round/i.test(s)) return 'Round trip';
    if (/single/i.test(s) || /one.?way/i.test(s)) return 'Single trip';
    if (/10.?hour/i.test(s)) return '10 hours duty';
    if (/12.?hour/i.test(s)) return '12 hours duty';
    return s;
  }
  const stops = t.stops ?? [];
  if (stops.some((s) => (s.leg_index ?? 0) === 1)) return 'Round trip';
  return 'Single trip';
}

export function isMonthly(t: OperatorTripDetail): boolean {
  const pb = String(t.quotation?.pricing_basis || t.pricing_basis || '').trim().toUpperCase();
  return pb === 'PER_MONTH' || pb === 'PER MONTH';
}

export function billingLabel(t: OperatorTripDetail): string {
  if (isMonthly(t)) return 'Monthly contract';
  if ((t.quotation?.pricing_basis || t.pricing_basis) === 'Extra') return 'Extra trip';
  if (t.quotationId) return 'Quotation rate';
  return 'Single trip rate';
}

/** One short phrase beside the status: what matters about the trip right now. */
export function statePhrase(t: OperatorTripDetail, phase: TripPhase, f: Formatters): string | null {
  const stops = sortedStops(t);
  if (phase === 'planned') {
    if (!t.planned_start) return null;
    const ms = new Date(t.planned_start).getTime() - Date.now();
    return ms > 0 ? `Starts in ${formatDuration(ms / 1000)}` : 'Start time has passed';
  }
  if (phase === 'active') {
    const i = stops.findIndex((s) => !s.actual_arrival);
    if (i < 0) return 'At the last stop';
    const due = stops[i].planned_arrival ? ` · due ${f.smart(stops[i].planned_arrival)}` : '';
    return `Heading to ${stopName(stops[i], i)}${due}`;
  }
  if (phase === 'done') return t.actual_end ? `Finished ${f.dateTime(t.actual_end)}` : 'Finished';
  if (phase === 'cancelled') return t.updatedAt ? `Cancelled ${f.dateTime(t.updatedAt)}` : 'Cancelled';
  return null;
}

// ── Money ─────────────────────────────────────────────────────────────────────

export interface Money {
  billing: number;
  driverPayout: number;
  coDriverPayout: number;
  charges: number;
  chargesCount: number;
  margin: number;
  marginPercent: number;
  paid: number;
  balanceDue: number;
  is3PL: boolean;
  isMonthly: boolean;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The web's computeTripFinancials for one trip: billing (monthly rate ÷ 30),
 * payout (co-driver split, 3PL cost), charges, margin, amount due.
 */
export function moneyOf(t: OperatorTripDetail): Money {
  const monthly = isMonthly(t);
  const is3PL = !!t.is_third_party;
  const rawBilling = num(t.billing_amount || t.applied_rate || t.quotation?.rate);
  let billing = rawBilling;
  if (monthly) {
    const rate = num(t.quotation?.rate);
    billing = rate > 0 ? Math.round((rate / 30) * 100) / 100 : rawBilling > 3000 ? Math.round((rawBilling / 30) * 100) / 100 : rawBilling;
  }

  const co = num(t.co_driver_payout);
  const rawPrimary = num(t.driver_payout ?? t.driver_charge ?? t.trip_charges);
  const quotePayout = num(t.quotation?.driver_payout);
  let primary = 0;
  let coPayout = co;
  if (is3PL) {
    primary = num(t.third_party_cost);
    coPayout = 0;
  } else if (co > 0) {
    if (rawPrimary > 0) primary = rawPrimary >= co * 2 && rawPrimary !== co ? rawPrimary - co : rawPrimary;
    else if (quotePayout > 0) primary = quotePayout > co ? quotePayout - co : quotePayout;
    else primary = co;
  } else {
    primary = rawPrimary > 0 ? rawPrimary : quotePayout;
    coPayout = 0;
  }
  const payout = Math.max(0, primary) + Math.max(0, coPayout) + num(t.extra_driver_payment);

  const chargesList = t.charges ?? [];
  const charges = chargesList.reduce((s, c) => s + num(c.amount), 0);
  const total = billing + charges;
  const margin = total - payout;
  const paid = num(t.paid_amount);
  const balanceDue = t.balance_due != null ? num(t.balance_due) : total - paid;
  return {
    billing: total,
    driverPayout: Math.max(0, primary),
    coDriverPayout: Math.max(0, coPayout),
    charges,
    chargesCount: chargesList.length,
    margin,
    marginPercent: total > 0 ? Math.round((margin / total) * 1000) / 10 : 0,
    paid,
    balanceDue,
    is3PL,
    isMonthly: monthly,
  };
}

export const sar = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`;

// ── Driver updates (photos) ───────────────────────────────────────────────────

export const STAGE_LABEL: Record<LiveMediaStage, string> = {
  loaded: 'Loaded',
  arrived: 'Arrived',
  stop: 'At stop',
  delivered: 'Delivered · POD',
  delay: 'Delay reported',
  other: 'Photos',
};

export function updateTitle(u: DriverUpdate): string {
  return STAGE_LABEL[u.stage] ?? 'Photos';
}

const RECIPIENT_LABEL: Record<string, string> = {
  customer_contact: 'customer',
  customer_group: 'customer group',
  internal: 'our team',
  other: 'another number',
};
export const recipientLabel = (r: string) => RECIPIENT_LABEL[r] ?? r;

// ── WhatsApp texts ────────────────────────────────────────────────────────────

export const digits = (p?: string | null) => (p ?? '').replace(/[^0-9]/g, '');

export function waLink(phone: string | null | undefined, text: string): string {
  const d = digits(phone);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function mapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export type QuickKind = 'status' | 'eta' | 'location' | 'delay';

/** Road distance / drive time from the truck to the trip's destination. */
export interface Remaining {
  km: number;
  sec: number;
  /** Destination as the customer writes it ("AL BAHA"). */
  to: string;
  /** Straight-line guess because routing was unavailable. */
  approx: boolean;
}

export interface QuickContext {
  trip: OperatorTripDetail;
  phase: TripPhase;
  f: Formatters;
  position: { lat: number; lng: number } | null;
  remaining: Remaining | null;
}

/** A stop as a short place code for the route line ("RUH"), else its name. */
export function placeCode(s: Stop | undefined, i: number): string {
  const code = s?.location?.code?.trim();
  return (code || s?.location?.city?.trim() || stopName(s, i)).toUpperCase();
}

/** "5 HRS 45 MIN", "40 MIN". */
export function hoursText(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm} MIN`;
  return mm ? `${h} HRS ${mm} MIN` : `${h} HRS`;
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** The message for a quick send — every line the operator can still edit before sending. */
export function quickMessage(kind: QuickKind, { trip, phase, f, position, remaining }: QuickContext): string {
  const stops = sortedStops(trip);
  const nextIdx = stops.findIndex((s) => !s.actual_arrival);
  const next = nextIdx >= 0 ? stops[nextIdx] : null;
  const ref = trip.ref_id || trip.id.slice(0, 8);
  const truck = trip.is_third_party ? trip.third_party_vehicle_plate : trip.vehicle?.plate_number;
  const driver = trip.is_third_party
    ? trip.third_party_driver_name
    : trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}`.trim() : null;
  const who = [truck ? `Truck ${truck}` : '', driver ? `Driver ${driver}` : ''].filter(Boolean).join(' · ');
  const lines: string[] = [];

  if (kind === 'status' || kind === 'eta') {
    // The operators' own WhatsApp format:
    //   🚛 Vehicle Status Update / Truck / Driver / Route / Distance left / ETA / Status
    const last = stops.length - 1;
    const codeRoute = stops.length >= 2 ? `${placeCode(stops[0], 0)} → ${placeCode(stops[last], last)}` : '';
    const dest = remaining?.to ?? (last >= 0 ? placeCode(stops[last], last) : '');
    lines.push('🚛 Vehicle Status Update', '');
    lines.push(`Truck: ${(truck || '—').toUpperCase()}`);
    lines.push(`Driver: ${(driver || '—').toUpperCase()}`);
    if (codeRoute) lines.push(`Route: ${codeRoute}`);
    if (phase === 'active') {
      lines.push(remaining ? `Distance left: ${remaining.approx ? '~' : ''}${Math.round(remaining.km)} KM TO ${dest}` : `Distance left: [KM] TO ${dest}`);
      lines.push(`ETA: ${remaining ? hoursText(remaining.sec) : '[HRS]'}`);
    } else if (phase === 'planned' && trip.planned_start) {
      lines.push(`Starts: ${f.dayTime(trip.planned_start)}`);
    } else if (phase === 'done' && trip.actual_end) {
      lines.push(`Delivered: ${f.dayTime(trip.actual_end)}`);
    }
    lines.push(`Status: ${statusChip(trip.status).label.replace(/\b\w/g, (c) => c.toUpperCase())}`);
  } else if (kind === 'location') {
    lines.push(`*${ref} · Truck location*`);
    if (position) lines.push(mapsLink(position.lat, position.lng));
    else lines.push('Live location not available right now');
    if (next) lines.push(`On the way to ${stopName(next, nextIdx)}`);
    if (who) lines.push(who);
  } else {
    lines.push(`*${ref} · Delay notice*`);
    const reported = stops.find((s) => s.delay_reason || s.delay_note);
    lines.push(reported ? `Reason: ${delayText(reported)}` : 'Reason: [reason]');
    if (next) lines.push(`Next stop: ${stopName(next, nextIdx)} · new ETA [time]`);
    if (who) lines.push(who);
  }
  return lines.join('\n');
}

// ── Activity log ──────────────────────────────────────────────────────────────

export function activitySteps(t: OperatorTripDetail, f: Formatters): { label: string; time: string | null; done: boolean; tone?: Tone }[] {
  const steps: { label: string; time: string | null; done: boolean; tone?: Tone }[] = [
    { label: 'Trip created', time: f.dateTime(t.createdAt) || null, done: true },
  ];
  if (t.actual_start) steps.push({ label: 'Trip started', time: f.dateTime(t.actual_start), done: true });
  sortedStops(t).forEach((s, i) => {
    const name = stopName(s, i);
    steps.push({
      label: s.actual_arrival ? `Arrived at ${name}` : `Planned arrival at ${name}`,
      time: f.dateTime(s.actual_arrival || s.planned_arrival) || null,
      done: !!s.actual_arrival,
    });
    if (s.delay_reason || s.delay_note) {
      steps.push({ label: `Delay at ${name}: ${delayText(s)}`, time: f.dateTime(s.delay_logged_at) || null, done: true, tone: 'red' });
    }
    if (s.actual_departure) steps.push({ label: `Left ${name}`, time: f.dateTime(s.actual_departure), done: true });
  });
  if (t.status === 'Cancelled') steps.push({ label: 'Trip cancelled', time: f.dateTime(t.updatedAt) || null, done: true, tone: 'gray' });
  else steps.push({
    label: t.status === 'Completed' || t.status === 'Invoiced' ? 'Trip completed' : 'Expected finish',
    time: f.dateTime(t.actual_end || t.planned_end) || null,
    done: t.status === 'Completed' || t.status === 'Invoiced',
  });
  return steps;
}
