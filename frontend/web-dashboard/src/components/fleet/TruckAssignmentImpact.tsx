/**
 * "What will change" under a truck ↔ driver picker, before saving:
 *
 *   ● Abdullah will drive USA-6010.
 *   ● KSA-6102 will have no driver — Abdullah moves off it.
 *   ● Imtiaz Ahmed will have no truck — taken off USA-6010.
 *   ⓘ Imtiaz Ahmed is on TRP-0005 right now — that trip keeps USA-6010.
 *
 * Asks the server (POST /drivers/truck-assignment/preview), so it's the same
 * rule the save applies. Renders nothing when nothing changes.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, Info, Loader2 } from 'lucide-react';
import { describeAssignment } from '@mercon/shared-types';
import { cn } from '@/lib/utils';
import { driverService } from '@/services/driverService';

interface Props {
  driverId: string | null;
  vehicleId: string | null;
  /** Only ask when the picker actually differs from what's saved. */
  changed: boolean;
  className?: string;
}

export function TruckAssignmentImpact({ driverId, vehicleId, changed, className }: Props) {
  const enabled = changed && Boolean(driverId || vehicleId);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['truck-assignment-preview', driverId, vehicleId],
    queryFn: () => driverService.previewTruckAssignment({ driver_id: driverId, vehicle_id: vehicleId }),
    enabled,
    staleTime: 10_000,
  });

  if (!enabled) return null;
  if (isFetching && !data) {
    return (
      <div className={cn('flex items-center gap-2 text-[11px] text-slate-500', className)}>
        <Loader2 className="size-3.5 animate-spin" /> Checking what this changes…
      </div>
    );
  }
  if (isError || !data || data.no_change) return null;

  const lines = describeAssignment(data);
  const knockOn = lines.some((l) => l.tone === 'knock-on');

  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border px-3 py-2.5 space-y-1.5',
        knockOn
          ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30'
          : 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/30',
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
        <ArrowRightLeft className="size-3.5" /> When you save
      </p>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-snug">
            {l.tone === 'warning' ? (
              <Info className="size-3.5 mt-px shrink-0 text-slate-500" />
            ) : l.tone === 'knock-on' ? (
              <AlertTriangle className="size-3.5 mt-px shrink-0 text-amber-600" />
            ) : (
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" />
            )}
            <span
              className={cn(
                l.tone === 'main' && 'font-semibold text-slate-900 dark:text-slate-100',
                l.tone === 'knock-on' && 'font-medium text-amber-900 dark:text-amber-200',
                l.tone === 'warning' && 'text-slate-600 dark:text-slate-400',
              )}
            >
              {l.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TruckAssignmentImpact;
