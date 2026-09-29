/**
 * How the expenses pages talk about an expense: category colours (token-based chip tones),
 * links to a truck or driver, and the figures the summary strip shows.
 */
import type { ChipTone } from '@/components/ui/chip';
import type { Expense } from '@/services/expenseService';

/** One tone per known category; anything else (custom categories) is neutral. */
export const CATEGORY_TONE: Record<string, ChipTone> = {
  Salary: 'violet',
  'Salary Advance': 'violet',
  Fuel: 'warning',
  'Toll & Parking': 'orange',
  Rent: 'info',
  Utilities: 'teal',
  'Office Supplies': 'neutral',
  Insurance: 'info',
  'Vehicle Maintenance': 'orange',
  Tyres: 'brand',
  'Government Fees': 'negative',
  Other: 'neutral',
};
export const categoryTone = (category: string | null | undefined): ChipTone => CATEGORY_TONE[category ?? ''] ?? 'neutral';

/** Categories that are pay for people: offer the driver link first. */
export const DRIVER_CATEGORIES = ['Salary', 'Salary Advance'];

export type LinkKind = 'vehicle' | 'driver' | 'overhead';
export const LINK_LABEL: Record<LinkKind, string> = { vehicle: 'Trucks', driver: 'Drivers', overhead: 'Overhead' };
export const LINK_TONE: Record<LinkKind, ChipTone> = { vehicle: 'info', driver: 'violet', overhead: 'neutral' };

export const linkKind = (e: Pick<Expense, 'vehicleId' | 'driverId'>): LinkKind => (e.vehicleId ? 'vehicle' : e.driverId ? 'driver' : 'overhead');

export const driverName = (e: Pick<Expense, 'driver'>) => (e.driver ? `${e.driver.first_name} ${e.driver.last_name}`.trim() : null);

export const expenseRef = (e: Pick<Expense, 'ref_id' | 'id'>) => e.ref_id || `EXP-${e.id.slice(0, 5).toUpperCase()}`;

/** Change from the previous period, in percent; null when there's nothing to compare with. */
export function changePercent(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || Math.abs(previous) < 0.005) return null;
  return ((current - previous) / previous) * 100;
}

/** Share of a total, 0–100. */
export const share = (part: number, total: number) => (total > 0.005 ? (part / total) * 100 : 0);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09" → "Sep 2026" (or "Sep" when `short`). */
export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[(m || 1) - 1] ?? month;
  return short ? name : `${name} ${y}`;
}

/** The calendar month ("YYYY-MM") of an expense date, as stored (UTC date). */
export const monthKey = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : '');

/** Today as YYYY-MM-DD in local time. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
