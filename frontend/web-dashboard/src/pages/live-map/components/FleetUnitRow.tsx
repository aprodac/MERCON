import { forwardRef } from 'react';
import { Smartphone, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo, unitTitle } from '@/lib/fleetLive';
import type { LiveUnit } from '@/services/fleetLiveService';
import { MotionChip } from '@/components/maps/live/LiveUnitPanel';
import { TONE, unitTone } from '@/components/maps/live/liveMapStyle';

interface Props {
  unit: LiveUnit;
  selected: boolean;
  onSelect: () => void;
}

/** One truck (or on-trip driver phone) in the Fleet tab. */
const FleetUnitRow = forwardRef<HTMLButtonElement, Props>(function FleetUnitRow({ unit, selected, onSelect }, ref) {
  const tone = TONE[unitTone(unit)];
  const canLocate = !!unit.position;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      disabled={!canLocate}
      aria-pressed={selected}
      title={canLocate ? 'Show on map' : unit.vehicle && !unit.vehicle.has_tracker ? 'No tracker fitted' : 'No GPS position yet'}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all',
        selected
          ? 'border-charcoal/30 bg-white shadow-sm ring-1 ring-charcoal/10 dark:border-white/30 dark:bg-slate-900'
          : 'border-transparent hover:border-black/10 hover:bg-white dark:hover:border-white/10 dark:hover:bg-slate-900',
        !canLocate && 'cursor-default opacity-60 hover:border-transparent hover:bg-transparent',
      )}
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone.soft)}>
        {unit.vehicle ? <Truck className={cn('size-4', tone.text)} /> : <Smartphone className={cn('size-4', tone.text)} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-[12.5px] font-semibold text-foreground">{unitTitle(unit)}</span>
          <MotionChip unit={unit} />
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {unit.driver?.name ?? 'No driver'}
          {unit.trip ? <> · <span className={tone.text}>{unit.trip.ref_id ?? 'Trip'}</span></> : ' · Free'}
        </span>
      </span>
      <span className="shrink-0 text-right text-[10.5px] text-muted-foreground tabular-nums">
        {unit.motion === 'moving' && unit.position?.speed_kph != null
          ? `${Math.round(unit.position.speed_kph)} km/h`
          : unit.position ? timeAgo(unit.position.recorded_at) : '—'}
      </span>
    </button>
  );
});

export default FleetUnitRow;
