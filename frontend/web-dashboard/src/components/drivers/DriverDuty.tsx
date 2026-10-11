/**
 * A driver's duty, worked out from their trips (`driver.duty`, sent by the
 * Drivers list API) rather than the stored `status` flag, which drifts — a
 * driver out on a round trip used to read "Available".
 *
 *   DutyStatusCell — On trip (with trip no. and leg) / Available / Off duty / Inactive,
 *                    plus "Trip today 20:00" when they're booked later today
 *   BookedDays     — the days they're taken: the trip they're on (until when) and
 *                    the trips booked for the next two weeks, one chip per trip
 */
import { CalendarClock, Truck } from 'lucide-react';
import { legLabel } from '@mercon/shared-types';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz } from '@/lib/datetime';
import type { Driver, DriverDutyTrip, DriverStatus } from '@/services/driverService';
import { dutyStatusOf } from './driverDutyStatus';

const PILL: Record<DriverStatus, { label: string; cls: string; dot: string }> = {
  Available: { label: 'Available', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-500' },
  OnTrip: { label: 'On trip', cls: 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800', dot: 'bg-blue-500' },
  OffDuty: { label: 'Off duty', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', dot: 'bg-slate-400' },
  Inactive: { label: 'Inactive', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-300' },
};

const dayKey = (iso: string, tz: string) => formatInDeploymentTz(iso, tz, 'yyyy-MM-dd');

/** "Today", "Tomorrow" or "Mon 13". */
function dayName(iso: string, tz: string, now = new Date()): string {
  const k = dayKey(iso, tz);
  const today = dayKey(now.toISOString(), tz);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000).toISOString(), tz);
  if (k === today) return 'Today';
  if (k === tomorrow) return 'Tomorrow';
  return formatInDeploymentTz(iso, tz, 'EEE d');
}

const routeText = (t: DriverDutyTrip) =>
  t.from || t.to ? `${t.from ?? '—'} → ${t.to ?? '—'}${t.round ? ` → ${t.from ?? 'back'}` : ''}` : '';

function spanTitle(t: DriverDutyTrip, tz: string): string {
  const fmt = (iso: string) => formatInDeploymentTz(iso, tz, 'EEE d MMM, HH:mm');
  const when = t.start && t.end ? `${fmt(t.start)} – ${fmt(t.end)}` : t.start ? fmt(t.start) : '';
  return [t.ref_id, routeText(t), t.round ? 'Round trip' : null, when, t.co_driver ? 'As co-driver' : null].filter(Boolean).join(' · ');
}

export function DutyStatusCell({ driver, tz }: { driver: Driver; tz: string }) {
  const status = dutyStatusOf(driver);
  const pill = PILL[status] ?? PILL.Available;
  const on = driver.duty?.on_trip;
  const label = on?.status === 'Delayed' ? 'On trip · Delayed' : on?.status === 'Loading' ? 'On trip · Loading' : pill.label;
  // Booked later today (not out yet): worth knowing before handing them another job.
  const today = !on && status === 'Available'
    ? driver.duty?.upcoming.find((t) => t.start && dayKey(t.start, tz) === dayKey(new Date().toISOString(), tz))
    : undefined;

  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0" title={on ? spanTitle(on, tz) : today ? spanTitle(today, tz) : undefined}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
          on?.status === 'Delayed' ? 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' : pill.cls,
        )}
      >
        <span className={cn('size-1.5 rounded-full', on?.status === 'Delayed' ? 'bg-rose-500' : pill.dot)} />
        {label}
      </span>
      {on ? (
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {on.ref_id}
          {on.leg ? <span className="font-semibold text-blue-700 dark:text-blue-300"> · {legLabel(on.leg)}</span> : null}
          {on.end ? <> · free {dayName(on.end, tz)} {formatInDeploymentTz(on.end, tz, 'HH:mm')}</> : null}
        </span>
      ) : today?.start ? (
        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
          Trip today {formatInDeploymentTz(today.start, tz, 'HH:mm')}
        </span>
      ) : null}
    </div>
  );
}

/** One chip per trip: "Today 20:00 → Mon 13", "Wed 15", or "Now → Mon 13" for the trip they're on. */
export function BookedDays({ driver, tz, max = 3 }: { driver: Driver; tz: string; max?: number }) {
  const duty = driver.duty;
  const trips = duty ? [...(duty.on_trip ? [duty.on_trip] : []), ...duty.upcoming] : [];
  if (trips.length === 0) {
    return <span className="text-xs text-slate-400 font-medium italic">{duty ? 'Free' : 'None'}</span>;
  }
  const chips = trips.slice(0, max);
  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      {chips.map((t) => {
        const running = t.id === duty?.on_trip?.id;
        const startDay = t.start ? dayName(t.start, tz) : null;
        const endDay = t.end ? dayName(t.end, tz) : null;
        const sameDay = t.start && t.end && dayKey(t.start, tz) === dayKey(t.end, tz);
        const from = running ? 'Now' : startDay ? `${startDay} ${formatInDeploymentTz(t.start!, tz, 'HH:mm')}` : 'No date';
        const text = running
          ? endDay ? `Now → ${endDay}` : 'Now'
          : sameDay || !endDay ? from : `${from} → ${endDay}`;
        return (
          <span
            key={t.id}
            title={spanTitle(t, tz)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap',
              running
                ? 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                : 'bg-indigo-50/80 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
            )}
          >
            {running ? <Truck className="size-2.5" /> : <CalendarClock className="size-2.5" />}
            {text}
            {t.round && <span className="opacity-70">↺</span>}
          </span>
        );
      })}
      {trips.length > max && <span className="text-[10px] font-semibold text-slate-400">+{trips.length - max} more</span>}
    </div>
  );
}
