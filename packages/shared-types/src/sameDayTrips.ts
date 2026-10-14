/**
 * A driver booked twice on one day: Create Trip warns first (POST
 * /trips/same-day-check) and may still book. The trip created first goes
 * first; the later one waits until it is completed.
 */

export interface SameDayTrip {
  id: string;
  ref_id: string | null;
  status: string;
  planned_start: string | null;
  route: string | null;
}

/** One new trip whose driver already has trips that day. `index` = the row sent. */
export interface SameDayConflict {
  index: number;
  driverId: string;
  driverName: string;
  /** YYYY-MM-DD in the deployment time zone. */
  date: string;
  trips: SameDayTrip[];
}

/** The rows to ask about — only those with an own driver and a start. */
export function sameDayCheckRows(rows: Array<{ driver_id?: string; co_driver_id?: string; planned_start?: string; is_third_party?: boolean }>) {
  return rows.map((r) => ({
    driver_id: r.is_third_party ? undefined : r.driver_id || undefined,
    co_driver_id: r.is_third_party ? undefined : r.co_driver_id || undefined,
    planned_start: r.planned_start || '',
  }));
}

const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const timeLabel = (iso: string | null, tz: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  } catch {
    return '';
  }
};

/** The warning: one line per driver and day (at most `max`), plus what happens if booked anyway. */
export function sameDayWarning(conflicts: SameDayConflict[], tz: string, max = 4): { title: string; lines: string[]; more: number; note: string } {
  const seen = new Set<string>();
  const unique = conflicts.filter((c) => {
    const k = `${c.driverId}|${c.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const drivers = new Set(unique.map((c) => c.driverId));
  const lines = unique.slice(0, max).map((c) => {
    const trips = c.trips
      .map((t) => [t.ref_id ?? 'a trip', [t.route, timeLabel(t.planned_start, tz)].filter(Boolean).join(', ')].filter(Boolean).join(' — '))
      .join('; ');
    return `${c.driverName} · ${dayLabel(c.date)}: ${trips}`;
  });
  const title = drivers.size === 1
    ? `${unique[0].driverName} already has a trip ${unique.length === 1 ? 'that day' : `on ${unique.length} of these days`}`
    : 'These drivers already have trips those days';
  return {
    title,
    lines,
    more: Math.max(0, unique.length - max),
    note: 'If you create it anyway, this trip comes after the earlier one — the driver can start it only once that trip is completed.',
  };
}
