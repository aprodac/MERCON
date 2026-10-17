/**
 * Trip log — customer-app trips (driver_workflow EXTERNAL_APP) where the stops
 * aren't known when the trip is booked. After Start the driver only sends
 * screenshots, as many times as needed; each send is one log entry (time, GPS,
 * place) and nothing more. The office turns entries into stops afterwards.
 *
 * An entry is the set of trip documents uploaded with
 * `ai_extracted_json.operation === 'log'` and the same `log_entry` id. Nothing
 * else is stored: no table, no migration.
 */

export const TRIP_LOG_OPERATION = 'log';
/** Workflow state of a trip running as a trip log. */
export const TRIP_LOG_STATE = 'TRIP_LOG';
/** How long the driver can take back an entry sent by mistake. */
export const TRIP_LOG_UNDO_MINUTES = 15;

export interface TripLogDoc {
  id: string;
  file_url: string;
  mime_type?: string | null;
  createdAt?: string | Date | null;
  ai_extracted_json?: unknown;
}

export interface TripLogEntry<D extends TripLogDoc = TripLogDoc> {
  id: string;
  /** When it was sent: the earliest screenshot's GPS time, else upload time (ISO). */
  at: string;
  /** Place name the phone resolved, if any ("near Taif"). */
  place: string | null;
  gps: { lat: number; lng: number } | null;
  /** Set once the office made it a stop or added it to one. */
  stop_id: string | null;
  docs: D[];
}

interface LogMeta {
  operation?: unknown;
  log_entry?: unknown;
  place?: unknown;
  stop_id?: unknown;
  gps?: { latitude?: unknown; longitude?: unknown; captured_at?: unknown };
}

const metaOf = (d: TripLogDoc): LogMeta => ((d.ai_extracted_json ?? {}) as LogMeta);

/** The entry id of a log screenshot; null for any other document. */
export function tripLogEntryId(d: TripLogDoc): string | null {
  const m = metaOf(d);
  return m.operation === TRIP_LOG_OPERATION && typeof m.log_entry === 'string' && m.log_entry ? m.log_entry : null;
}

const isoOf = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

/** A trip's log entries, oldest first. */
export function tripLogEntries<D extends TripLogDoc>(docs: readonly D[] | null | undefined): TripLogEntry<D>[] {
  const byId = new Map<string, TripLogEntry<D>>();
  for (const d of docs ?? []) {
    const id = tripLogEntryId(d);
    if (!id) continue;
    const m = metaOf(d);
    const at = isoOf(m.gps?.captured_at) ?? isoOf(d.createdAt) ?? new Date(0).toISOString();
    const lat = Number(m.gps?.latitude);
    const lng = Number(m.gps?.longitude);
    const gps = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
    const e = byId.get(id);
    if (!e) {
      byId.set(id, {
        id, at, gps,
        place: typeof m.place === 'string' && m.place.trim() ? m.place.trim() : null,
        stop_id: typeof m.stop_id === 'string' && m.stop_id ? m.stop_id : null,
        docs: [d],
      });
      continue;
    }
    e.docs.push(d);
    if (at < e.at) e.at = at;
    e.gps ??= gps;
    if (!e.place && typeof m.place === 'string' && m.place.trim()) e.place = m.place.trim();
    if (!e.stop_id && typeof m.stop_id === 'string' && m.stop_id) e.stop_id = m.stop_id;
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Whether the driver app runs this trip as a trip log: customer-app trips that
 * haven't started on the step-by-step screens. A trip already started the old
 * way (an older app build) finishes the old way.
 */
export function usesTripLog(trip: { driver_workflow?: string | null; driver_workflow_state?: string | null } | null | undefined): boolean {
  if (trip?.driver_workflow !== 'EXTERNAL_APP') return false;
  const ws = trip.driver_workflow_state;
  return !ws || ws === 'ASSIGNED' || ws === TRIP_LOG_STATE;
}

/** Whether the driver can still take an entry back (sent within TRIP_LOG_UNDO_MINUTES). */
export function canUndoTripLogEntry(entry: Pick<TripLogEntry, 'docs' | 'stop_id'>, now = Date.now()): boolean {
  if (entry.stop_id) return false;
  const sent = Math.max(...entry.docs.map((d) => Date.parse(String(d.createdAt ?? '')) || 0));
  return sent > 0 && now - sent <= TRIP_LOG_UNDO_MINUTES * 60_000;
}
