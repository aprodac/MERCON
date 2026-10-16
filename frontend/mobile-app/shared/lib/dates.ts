/**
 * One date style for the driver app: "20 Oct 2027", and "04 Oct 2026, 05:43"
 * with a time. Screens used to mix "20 Oct 2027", "Oct 20, 2027" and
 * "04 Oct, 05:43". In Urdu the month name is Urdu ("20 اکتوبر 2027"); digits
 * stay as they are everywhere else in the app (Latin), so numbers never change.
 *
 * Times are shown in the company's time zone (Settings → timezone, Riyadh by
 * default), not the phone's: a phone left on India time showed a 20:00 trip
 * at 22:30, while the office and the operator app said 20:00.
 */
import { api } from './api';
import { getCurrentLanguage } from './language-context';

const DEFAULT_TIME_ZONE = 'Asia/Riyadh';
let companyZone = DEFAULT_TIME_ZONE;
let zoneRequest: Promise<string> | null = null;

/** The company's time zone (Riyadh until the server says otherwise). */
export function companyTimeZone(): string {
  return companyZone;
}

/** Reads the company time zone from the server once; call at app start. */
export function loadCompanyTimeZone(): Promise<string> {
  if (!zoneRequest) {
    zoneRequest = api.get('/settings/public')
      .then(({ data }) => {
        const tz = data?.data?.timezone as string | undefined;
        if (tz && isValidZone(tz)) companyZone = tz;
        return companyZone;
      })
      .catch(() => {
        zoneRequest = null; // try again next time
        return companyZone;
      });
  }
  return zoneRequest;
}

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `options` with the company time zone, for toLocale*String calls. */
export function inCompanyZone<T extends Intl.DateTimeFormatOptions>(options: T): T & { timeZone: string } {
  return { ...options, timeZone: companyZone };
}

/** "YYYY-MM-DD" of `value` in the company time zone — to compare days. */
export function companyDayKey(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', inCompanyZone({ year: 'numeric', month: '2-digit', day: '2-digit' })).formatToParts(new Date(value));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function locale(): string {
  return getCurrentLanguage() === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';
}

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
  return d.toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The day something happened, in the company's time zone ("09 Aug 2026"). */
export function formatDay(value: DateInput, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  return d.toLocaleDateString(locale(), inCompanyZone({ day: '2-digit', month: 'short', year: 'numeric' }));
}

/** "14:05" in the company's time zone. */
export function formatTime(value: DateInput, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  return d.toLocaleTimeString('en-GB', inCompanyZone({ hour: '2-digit', minute: '2-digit', hour12: false }));
}

/** Day and time in the company's time zone ("04 Oct 2026, 05:43"). */
export function formatDayTime(value: DateInput, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  return `${formatDay(d)}, ${formatTime(d)}`;
}
