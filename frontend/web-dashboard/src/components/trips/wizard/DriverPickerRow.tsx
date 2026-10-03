import React from 'react';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { cn } from '@/lib/utils';

export type FactTone = 'neutral' | 'good' | 'warn';

export interface DriverFacts {
  /** Small chips under the name: truck, lane history, idle time, warnings. */
  chips: Array<{ text: string; tone: FactTone }>;
  /** Right-hand tag: "Free", "On trip", "Off duty"… */
  statusLabel: string;
  isFree: boolean;
}

const TONE: Record<FactTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
};

const stripEmoji = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

/** Hours since the driver's last trip ended, as people say it. */
function idleText(hours: number): string {
  if (hours < 1) return 'Just back';
  if (hours < 48) return `Last trip ${Math.round(hours)}h ago`;
  return `Idle ${Math.round(hours / 24)} days`;
}

const STATUS_LABEL: Record<string, string> = {
  Available: 'Free',
  OnTrip: 'On trip',
  'On Trip': 'On trip',
  OffDuty: 'Off duty',
  'Off Duty': 'Off duty',
  Inactive: 'Inactive',
};

/** Everything the picker shows about one driver, from the driver record + the route recommendation. */
export function buildDriverFacts(
  driver: { status?: string | null; rest_hours?: number | null },
  rec: { isAvailable?: boolean; unavailabilityReason?: string; badges?: string[]; rest_hours?: number | null; routeTripCount?: number; openTrips?: Array<{ ref: string | null; status: string }> } | undefined,
  truck: { plate?: string | null; capacityLabel?: string | null }
): DriverFacts {
  const chips: DriverFacts['chips'] = [];
  if (truck.plate) chips.push({ text: [truck.plate, truck.capacityLabel].filter(Boolean).join(' · '), tone: 'neutral' });
  else chips.push({ text: 'No truck', tone: 'neutral' });

  const laneTrips = rec?.routeTripCount ?? 0;
  if (laneTrips > 0) chips.push({ text: `${laneTrips}× this lane`, tone: 'good' });

  // The recommendation flags a truck that doesn't fit the trip ("⚠️ …").
  const warning = rec?.badges?.find((b) => b.startsWith('⚠'));
  if (warning && truck.plate) {
    const text = stripEmoji(warning);
    const size = text.match(/\(([^)]+?)(?:\s*Truck)?\)/)?.[1];
    chips.push({ text: /under-capacity/i.test(text) ? `Truck too small${size ? ` (${size})` : ''}` : text, tone: 'warn' });
  }

  // Still running another trip (any date): warn, but the operator may book anyway.
  const open = rec?.openTrips ?? [];
  if (open.length > 0) {
    const first = open[0];
    const label = first.status === 'InTransit' ? 'In transit' : first.status;
    chips.push({ text: `Still on ${first.ref ?? 'a trip'} (${label})${open.length > 1 ? ` +${open.length - 1}` : ''}`, tone: 'warn' });
  }

  const rest = rec?.rest_hours ?? driver.rest_hours ?? null;
  if (rest != null) chips.push({ text: idleText(rest), tone: 'neutral' });

  const status = (driver.status || 'Available').trim();
  const isFree = rec ? rec.isAvailable !== false && open.length === 0 && status.toLowerCase() === 'available' : status.toLowerCase() === 'available';
  const statusLabel = isFree ? 'Free' : open.length > 0 ? 'On a trip' : STATUS_LABEL[status] || (rec?.unavailabilityReason ? 'Busy' : status);

  return { chips, statusLabel, isFree };
}

export function FactChip({ text, tone = 'neutral' }: { text: string; tone?: FactTone }) {
  return (
    <span className={cn('inline-flex max-w-full items-center truncate rounded-full px-1.5 py-px text-[11px] font-medium', TONE[tone])}>
      {text}
    </span>
  );
}

export function StatusTag({ label, isFree }: { label: string; isFree: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        isFree ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      )}
    >
      {label}
    </span>
  );
}

/** One driver in the dropdown: photo, one-line name, fact chips, status on the right. */
export function DriverPickerRow({
  firstName,
  lastName,
  avatarUrl,
  facts,
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  facts: DriverFacts;
}) {
  const fullName = `${firstName} ${lastName}`.trim();
  return (
    <div className="flex w-full min-w-0 items-center gap-2.5 py-0.5 font-normal">
      <DriverAvatar src={avatarUrl} firstName={firstName} lastName={lastName} size="sm" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100" title={fullName}>
          {fullName}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {facts.chips.map((c) => (
            <FactChip key={c.text} text={c.text} tone={c.tone} />
          ))}
        </div>
      </div>
      <StatusTag label={facts.statusLabel} isFree={facts.isFree} />
    </div>
  );
}

/** What the closed dropdown shows once a driver is picked. */
export function DriverSelectedLabel({ firstName, lastName, avatarUrl }: { firstName: string; lastName: string; avatarUrl?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <DriverAvatar src={avatarUrl} firstName={firstName} lastName={lastName} size="xs" className="shrink-0" />
      <span className="truncate">{`${firstName} ${lastName}`.trim()}</span>
    </span>
  );
}
