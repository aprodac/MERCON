/**
 * One date style for the driver app: "20 Oct 2027", and "04 Oct 2026, 05:43"
 * with a time. Screens used to mix "20 Oct 2027", "Oct 20, 2027" and
 * "04 Oct, 05:43".
 */

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A calendar date the office typed (licence / document expiry and issue
 * dates). Stored as midnight UTC, so read it in UTC: in the phone's own zone
 * it could show the day before.
 */
export function formatCalendarDate(value: DateInput, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The day something happened, in the phone's time zone ("09 Aug 2026"). */
export function formatDay(value: DateInput, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Day and time in the phone's time zone ("04 Oct 2026, 05:43"). */
export function formatDayTime(value: DateInput, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDay(d)}, ${time}`;
}
