import { BulkImportTripRow, TripStatus } from '@/services/tripService';
import { fromZonedTime } from 'date-fns-tz';
import { addDaysToDateStr, dateInZone } from '@mercon/shared-types';

// Every helper below takes an optional `tz` (the deployment timezone, e.g.
// Asia/Riyadh). With it, "past" and "today" are judged in that zone — trips are
// stored in it; without it, the browser's own zone is used (old behaviour),
// which flagged Saudi times as past for anyone browsing from India.

export interface PastDateAnalysis {
  hasPastTrips: boolean;
  totalTripsCount: number;
  pastTripsCount: number;
  hasOnlyYesterday: boolean;
  hasOlderThanYesterday: boolean;
  oldestPastDate: string | null;
  samplePastDate: string | null;
}

/**
 * Returns today's date at 00:00:00 in local timezone.
 */
export function getTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Parses a date string (YYYY-MM-DD or ISO string) into a Date object at 00:00:00 local time.
 */
export function parseDateStart(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const rawDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.slice(0, 10);
  const parts = rawDateStr.split('-');
  if (parts.length !== 3) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

/**
 * Parses date + time string into a Date object in local time.
 */
export function parseDateTime(dateVal?: string | null, timeVal?: string | null, tz?: string): Date | null {
  if (!dateVal) return null;

  // If dateVal is a full ISO timestamp (e.g. "2026-09-07T20:00:00.000Z"), parse directly
  if (dateVal.includes('T')) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d;
  }

  const rawDateStr = dateVal.slice(0, 10);
  const parts = rawDateStr.split('-');
  if (parts.length !== 3) {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  let hours = 0;
  let minutes = 0;

  if (timeVal) {
    const cleanTime = timeVal.trim().split(' ')[0];
    const tParts = cleanTime.split(':');
    if (tParts.length >= 2) {
      hours = parseInt(tParts[0], 10);
      minutes = parseInt(tParts[1], 10);
    }
  }

  if (tz && !isNaN(year) && !isNaN(month) && !isNaN(day)) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const zoned = fromZonedTime(`${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`, tz);
    return isNaN(zoned.getTime()) ? null : zoned;
  }
  const dt = new Date(year, month, day, hours, minutes, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Checks if a date/time is strictly before the current real time.
 */
export function isDateTimeInPast(dateVal?: string | null, timeVal?: string | null, tz?: string): boolean {
  if (!dateVal) return false;
  // If dateVal is only a YYYY-MM-DD date (no ISO 'T') and timeVal is empty/missing,
  // evaluate whether the date itself is strictly in the past (prior calendar day).
  // An empty time field on today's date should NOT be treated as a past time.
  if (!dateVal.includes('T') && (!timeVal || !timeVal.trim())) {
    return isDateInPast(dateVal, tz);
  }
  const dt = parseDateTime(dateVal, timeVal, tz);
  if (!dt) return false;
  return dt.getTime() < Date.now();
}

/**
 * Checks if a date string is strictly before today (local timezone).
 */
export function isDateInPast(dateStr?: string | null, tz?: string): boolean {
  if (tz && dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr) && !dateStr.includes('T')) {
    return dateStr.slice(0, 10) < dateInZone(Date.now(), tz);
  }
  const d = parseDateStart(dateStr);
  if (!d) return false;
  const today = getTodayStart();
  return d.getTime() < today.getTime();
}

/**
 * Analyzes a set of trip rows to detect past dates/times and determine allowable status choices.
 */
/** The calendar date (YYYY-MM-DD) of a row's date value, in `tz`. */
function rowDateKey(dateVal: string, tz: string): string {
  return dateVal.includes('T') ? dateInZone(new Date(dateVal).getTime(), tz) : dateVal.slice(0, 10);
}

export function analyzePastDateRows(rows: BulkImportTripRow[], tz?: string): PastDateAnalysis {
  const today = getTodayStart();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const yesterday = new Date(today.getTime() - oneDayMs);

  let pastTripsCount = 0;
  let hasOnlyYesterday = true;
  let hasOlderThanYesterday = false;
  let oldestTime: number | null = null;
  let oldestDateStr: string | null = null;
  let samplePastDateStr: string | null = null;

  rows.forEach((row) => {
    const dateVal = row.planned_start || row.date;
    const timeVal = row.pickup_time || row.pickupTime || row.time;
    if (!dateVal) return;

    if (isDateTimeInPast(dateVal, timeVal, tz)) {
      pastTripsCount++;
      const dt = parseDateTime(dateVal, timeVal, tz);
      const d = dt || parseDateStart(dateVal)!;
      const formatted = tz
        ? rowDateKey(dateVal, tz)
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!samplePastDateStr) samplePastDateStr = formatted;

      if (oldestTime === null || d.getTime() < oldestTime) {
        oldestTime = d.getTime();
        oldestDateStr = formatted;
      }

      // Check if older than yesterday start
      const dayOnly = parseDateStart(dateVal);
      const olderThanYesterday = tz
        ? rowDateKey(dateVal, tz) < addDaysToDateStr(dateInZone(Date.now(), tz), -1)
        : Boolean(dayOnly && dayOnly.getTime() < yesterday.getTime());
      if (olderThanYesterday) {
        hasOlderThanYesterday = true;
        hasOnlyYesterday = false;
      }
    }
  });

  return {
    hasPastTrips: pastTripsCount > 0,
    totalTripsCount: rows.length,
    pastTripsCount,
    hasOnlyYesterday: pastTripsCount > 0 && hasOnlyYesterday,
    hasOlderThanYesterday,
    oldestPastDate: oldestDateStr,
    samplePastDate: samplePastDateStr,
  };
}

/**
 * Applies selected status (Completed or Incompleted) to trip rows.
 * If Completed: sets status to 'Completed'.
 * If Incompleted: logically determines status based on date/time:
 *   - Future / Today upcoming -> 'Scheduled'
 *   - Yesterday / Past time -> 'InTransit'
 *   - Older than 1 day ago -> 'Draft'
 */
export function applyPastStatusToRows(
  rows: BulkImportTripRow[],
  targetStatus: TripStatus | 'Incompleted' = 'Completed',
  tz?: string
): BulkImportTripRow[] {
  return rows.map((row) => {
    const dateVal = row.planned_start || row.date;
    const timeVal = row.pickup_time || row.pickupTime || row.time;

    if (targetStatus === 'Completed') {
      // Only rows that already started are finished — future rows stay Scheduled.
      return {
        ...row,
        status: dateVal && isDateTimeInPast(dateVal, timeVal, tz) ? 'Completed' : 'Scheduled',
      };
    }

    if (targetStatus === 'Incompleted' || targetStatus === 'Scheduled') {
      if (dateVal && isDateTimeInPast(dateVal, timeVal, tz)) {
        const dayOnly = parseDateStart(dateVal);
        const today = getTodayStart();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const yesterday = new Date(today.getTime() - oneDayMs);
        const olderThanYesterday = tz
          ? rowDateKey(dateVal, tz) < addDaysToDateStr(dateInZone(Date.now(), tz), -1)
          : Boolean(dayOnly && dayOnly.getTime() < yesterday.getTime());

        if (olderThanYesterday) {
          return {
            ...row,
            status: 'Draft',
          };
        } else {
          return {
            ...row,
            status: 'InTransit',
          };
        }
      } else {
        return {
          ...row,
          status: 'Scheduled',
        };
      }
    }

    // Direct status fallback if explicit status like 'InTransit' or 'Draft' passed
    if (dateVal && isDateTimeInPast(dateVal, timeVal, tz)) {
      return {
        ...row,
        status: targetStatus as TripStatus,
      };
    }

    return row;
  });
}
