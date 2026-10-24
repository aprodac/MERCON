/**
 * Reading a trip-log screenshot (customer-app trips, see tripLog): the model
 * returns the stop name and arrive / depart clock times the customer's app
 * shows; this turns that into real instants and a suggestion the operator
 * confirms with one tap. Nothing here saves anything.
 *
 * The stored shape is `ai_extracted_json.read` on each log document.
 */
import { tzOffsetMs, zonedWallTimeToUtcIso } from './tripCreation';
import type { TripLogDoc, TripLogEntry } from './tripLog';

/** A clock read off the screenshot reaching past the send time by more than this belongs to the day before. */
const SEND_SKEW_MS = 10 * 60_000;
/** Confirm needs the operator's check when the read is less sure than this. */
export const TRIP_LOG_READ_SURE = 0.8;

export interface TripLogReadStop {
  name: string;
  /** "HH:MM:SS" as read. */
  arrive: string | null;
  depart: string | null;
  /** YYYY-MM-DD, only when the screenshot shows one. */
  date?: string | null;
  /** Resolved instants (ISO), filled in by resolveReadTimes. */
  arrive_at?: string | null;
  depart_at?: string | null;
}

export interface TripLogRead {
  stops: TripLogReadStop[];
  app: string;
  confidence: number;
}

const clockOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(mi)}:${p(s)}`;
};

const dateOf = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !Number.isNaN(Date.parse(v.trim())) ? v.trim() : null;

/** The model's reply (maybe fenced, maybe with chatter around it) → a clean read, or null when unusable. */
export function parseTripLogRead(text: string | null | undefined): TripLogRead | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let body = fenced?.[1] ?? text;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  body = body.slice(a, b + 1);
  let raw: any;
  try { raw = JSON.parse(body); } catch { return null; }
  if (!raw || !Array.isArray(raw.stops)) return null;
  const stops: TripLogReadStop[] = [];
  for (const s of raw.stops) {
    const name = typeof s?.name === 'string' ? s.name.trim().slice(0, 120) : '';
    const arrive = clockOf(s?.arrive);
    const depart = clockOf(s?.depart);
    if (!name && !arrive && !depart) continue;
    stops.push({ name, arrive, depart, date: dateOf(s?.date) });
  }
  const c = Number(raw.confidence);
  return {
    stops,
    app: typeof raw.app === 'string' && raw.app.trim() ? raw.app.trim().slice(0, 20) : 'other',
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5,
  };
}

/**
 * Clock times → instants in the company zone. The date is the send date; a
 * clock later than the send time can't have happened yet, so it was the day
 * before. A departure earlier than its arrival is the next day. A date shown on
 * the screenshot wins over all of that.
 */
export function resolveReadTimes(read: TripLogRead, sentIso: string, tz: string): TripLogRead {
  const sent = Date.parse(sentIso);
  const sentDate = new Date(sent + tzOffsetMs(sent, tz)).toISOString().slice(0, 10);
  const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return {
    ...read,
    stops: read.stops.map((s) => {
      let arriveAt: string | null = null;
      let departAt: string | null = null;
      if (s.arrive) {
        arriveAt = zonedWallTimeToUtcIso(s.date ?? sentDate, s.arrive, tz);
        if (!s.date && Date.parse(arriveAt) > sent + SEND_SKEW_MS) arriveAt = zonedWallTimeToUtcIso(shift(sentDate, -1), s.arrive, tz);
      }
      if (s.depart) {
        departAt = zonedWallTimeToUtcIso(s.date ?? sentDate, s.depart, tz);
        if (!s.date && Date.parse(departAt) > sent + SEND_SKEW_MS) departAt = zonedWallTimeToUtcIso(shift(sentDate, -1), s.depart, tz);
        if (!s.date && arriveAt && Date.parse(departAt) < Date.parse(arriveAt)) departAt = new Date(Date.parse(departAt) + 86_400_000).toISOString();
      }
      return { ...s, arrive_at: arriveAt, depart_at: departAt };
    }),
  };
}

/** "Riyadh DC" / "RIYADH-dc " / "Al Riyadh Distribution Center" → comparable words. */
const STOP_WORDS = new Set(['dc', 'hub', 'warehouse', 'wh', 'center', 'centre', 'depot', 'station', 'branch', 'the', 'al', 'city', 'distribution', 'sorting', 'sort', 'site', 'ksa', 'saudi', 'arabia']);
export function placeWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\[return:.*?\]/g, ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w));
}

/** Two spellings of a word: equal, one inside the other, or one typo apart (jeddah / jedda / jidda). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0, j = 0, miss = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++miss > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return miss + (a.length - i) + (b.length - j) <= 1;
}

/** 0..1 — how much of the shorter name's words show up in the other. */
export function placeSimilarity(a: string, b: string): number {
  const wa = placeWords(a), wb = placeWords(b);
  if (!wa.length || !wb.length) return 0;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.filter((w) => long.some((x) => sameWord(w, x))).length / short.length;
}

export interface SuggestStop {
  id: string;
  stop_type: string | null;
  location_name: string | null;
  actual_arrival?: string | null;
}

export interface TripLogSuggestion {
  action: 'attach' | 'new';
  /** The matched stop (attach). */
  stop_id: string | null;
  /** 0-based position among the trip's stops, when matched. */
  stop_index: number | null;
  name: string;
  stop_type: 'Pickup' | 'Dropoff';
  arrive_at: string | null;
  depart_at: string | null;
  confidence: number;
  /** Below TRIP_LOG_READ_SURE: Confirm still saves, but the time stays "to confirm". */
  needs_check: boolean;
}

const isPickup = (t: string | null | undefined) => /pick|load/i.test(t ?? '');

/** The screenshots' reads of one entry, joined: the most informative stop line of the surest read. */
export function entryRead(docs: readonly TripLogDoc[]): TripLogRead | null {
  const reads = docs
    .map((d) => ((d.ai_extracted_json ?? {}) as { read?: TripLogRead }).read)
    .filter((r): r is TripLogRead => !!r && Array.isArray(r.stops) && r.stops.length > 0);
  if (!reads.length) return null;
  const score = (r: TripLogRead) => r.stops.filter((s) => s.arrive_at || s.depart_at).length * 10 + r.confidence;
  return reads.reduce((best, r) => (score(r) > score(best) ? r : best));
}

/**
 * What to do with one log entry. `taken` holds the stops other entries already
 * claim, so two sends never suggest the same stop. `entryIndex` is this entry's
 * place among the entries still open (the first one is the load at the origin).
 */
export function suggestForEntry(
  entry: Pick<TripLogEntry, 'docs' | 'place' | 'stop_id'>,
  stops: readonly SuggestStop[],
  opts: { taken?: ReadonlySet<string>; openIndex?: number } = {},
): TripLogSuggestion | null {
  if (entry.stop_id) return null;
  const read = entryRead(entry.docs);
  if (!read) return null;
  // The line with times (the screenshot's current stop), else the first.
  const line = read.stops.find((s) => s.arrive_at || s.depart_at) ?? read.stops[0];
  if (!line) return null;
  if (!line.arrive_at && !line.depart_at) return null;

  const taken = opts.taken ?? new Set<string>();
  let best: { i: number; score: number } | null = null;
  if (line.name) {
    stops.forEach((st, i) => {
      if (taken.has(st.id)) return;
      const score = placeSimilarity(line.name, st.location_name ?? '');
      if (score >= 0.5 && (!best || score > best.score)) best = { i, score };
    });
  }
  const matched = best as { i: number; score: number } | null;
  const nameOk = !!line.name;
  const stop = matched ? stops[matched.i] : null;
  // Position fallback: the first open entry loads at the origin; later ones unload.
  const stopType: 'Pickup' | 'Dropoff' = stop ? (isPickup(stop.stop_type) ? 'Pickup' : 'Dropoff') : (opts.openIndex ?? 0) === 0 && !stops.some((s) => isPickup(s.stop_type) && s.actual_arrival) ? 'Pickup' : 'Dropoff';
  const confidence = Math.min(read.confidence, matched ? 0.5 + matched.score / 2 : 1) * (nameOk ? 1 : 0.7);
  return {
    action: stop ? 'attach' : 'new',
    stop_id: stop?.id ?? null,
    stop_index: matched ? matched.i : null,
    name: stop?.location_name?.trim() || line.name || entry.place || 'Stop',
    stop_type: stopType,
    arrive_at: line.arrive_at ?? null,
    depart_at: line.depart_at ?? null,
    confidence,
    needs_check: confidence < TRIP_LOG_READ_SURE,
  };
}
