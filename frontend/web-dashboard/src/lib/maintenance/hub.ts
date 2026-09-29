/**
 * How the maintenance hub reads an order and a planned service: days in the workshop and their
 * colour, the type chip colour, a one-line summary of the work, and "due in" wording.
 */
import type { ChipTone } from '@/components/ui/chip';
import type { DueService, DueStatus, MaintenanceRecord, MaintenanceType } from '@/services/maintenanceService';

const DAY = 86_400_000;
/** Over this many days in the workshop a truck is flagged red (the API uses the same). */
export const LONG_STAY_DAYS = 5;

export const TYPE_TONE: Record<MaintenanceType, ChipTone> = {
  Routine: 'info',
  Inspection: 'teal',
  Renewal: 'violet',
  Repair: 'orange',
  Emergency: 'negative',
};

export const isOpen = (status: string) => status === 'In_Progress' || status === 'In Progress';

/** Whole days since it went in (min 1), or between in and out. */
export function daysIn(start: string, end: string | null | undefined, now = new Date()): number {
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : now.getTime();
  if (b < a) return 0;
  return Math.max(1, Math.ceil((b - a) / DAY));
}

/** Red past the long-stay limit or the expected return date, amber from day 3, else plain. */
export function stayTone(days: number, expectedEnd?: string | null, now = new Date()): ChipTone {
  if (days > LONG_STAY_DAYS || (expectedEnd && new Date(expectedEnd).getTime() < now.getTime())) return 'negative';
  if (days >= 3) return 'warning';
  return 'neutral';
}

/** "Brake pads, discs +1" from the lines, else the typed work description. */
export function workSummary(r: Pick<MaintenanceRecord, 'items' | 'work_done' | 'system'>): string {
  const names = (r.items ?? []).filter((i) => i.kind !== 'labour').map((i) => i.description.trim()).filter(Boolean);
  if (names.length) return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  return r.work_done?.trim() || (r.system && r.system !== 'others' ? r.system.replace('_', ' ') : '—');
}

export const DUE_TONE: Record<DueStatus, ChipTone> = { overdue: 'negative', due_soon: 'warning', never: 'neutral', booked: 'info', ok: 'positive' };
export const DUE_LABEL: Record<DueStatus, string> = { overdue: 'Overdue', due_soon: 'Due soon', never: 'No record yet', booked: 'Booked', ok: 'OK' };

const km = (n: number) => `${Math.abs(Math.round(n)).toLocaleString('en-US')} km`;

/** "2,400 km over · 12 days left", "in 500 km", "never done". */
export function dueWording(d: Pick<DueService, 'status' | 'remainingKm' | 'remainingDays'>): string {
  if (d.status === 'never') return 'Never done: log the last service to start tracking';
  const parts: string[] = [];
  if (d.remainingKm !== null) parts.push(d.remainingKm <= 0 ? `${km(d.remainingKm)} over` : `${km(d.remainingKm)} left`);
  if (d.remainingDays !== null) parts.push(d.remainingDays <= 0 ? `${Math.abs(d.remainingDays)} days late` : `${d.remainingDays} days left`);
  return parts.join(' · ') || '—';
}

/** "Every 10,000 km or 180 days". */
export function intervalWording(p: { interval_km: number | null; interval_days: number | null }): string {
  const parts = [p.interval_km ? km(p.interval_km) : null, p.interval_days ? `${p.interval_days} days` : null].filter(Boolean);
  return parts.length ? `Every ${parts.join(' or ')}` : '—';
}
