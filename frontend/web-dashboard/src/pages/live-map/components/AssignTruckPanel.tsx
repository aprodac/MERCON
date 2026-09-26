import { useMutation, useQueries } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MapPin, SlidersHorizontal, Star, Truck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDuration, formatKm } from '@/lib/fleetLive';
import type { TruckCandidate } from '@/lib/placeSearch';
import { formatMinutes, stopName } from '@/lib/liveOps';
import { MotionChip } from '@/components/maps/live/LiveUnitPanel';
import { fleetLiveService, type LiveUnit } from '@/services/fleetLiveService';
import { pickupOf } from '../useTruckCandidates';
import { tripService, type Trip } from '@/services/tripService';

/** Only the closest few get a road-route lookup — each is a routing call. */
const ROUTED = 4;

interface Props {
  trip: Trip;
  candidates: TruckCandidate[];
  selectedKey: string | null;
  formatTime: (iso: string) => string;
  onBack: () => void;
  onLocate: (u: LiveUnit) => void;
  onManual: () => void;
  onAssigned: () => void;
}

/**
 * "Who can take this?" — free trucks ranked by distance to the pickup, with
 * the road drive time for the closest, and a one-click assign that sends the
 * truck with the trip's own driver or the truck's standing driver.
 */
export default function AssignTruckPanel({ trip, candidates, selectedKey, formatTime, onBack, onLocate, onManual, onAssigned }: Props) {
  const pickupStop = (trip.stops ?? []).find((s) => s.location_lat != null && s.location_lng != null) ?? null;
  const pickup = pickupOf(trip);

  const routes = useQueries({
    queries: candidates.slice(0, ROUTED).map((c) => {
      const from = { lat: +c.unit.position!.lat.toFixed(3), lng: +c.unit.position!.lng.toFixed(3) };
      return {
        queryKey: ['fleet-live-route', from, pickup],
        queryFn: () => fleetLiveService.getRoute(from, pickup!),
        staleTime: 60_000,
        enabled: !!pickup,
      };
    }),
  });

  const assign = useMutation({
    mutationFn: (c: TruckCandidate) =>
      tripService.dispatch(trip.id, {
        vehicle_id: c.unit.vehicle!.id,
        // The trip's own driver stays; otherwise the truck's driver goes with it.
        ...(trip.driver ? {} : c.driver ? { driver_id: c.driver.id } : {}),
      }),
    onSuccess: (_d, c) => {
      toast.success(`${c.unit.vehicle!.plate_number}${c.driver && !trip.driver ? ` + ${c.driver.name}` : ''} assigned to ${trip.ref_id}`);
      onAssigned();
    },
    onError: (err: unknown, c) => {
      const code = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      const msg =
        code === 'VEHICLE_UNAVAILABLE' ? `${c.unit.vehicle!.plate_number} was just taken — pick another` :
        code === 'DRIVER_UNAVAILABLE' ? `${c.driver?.name ?? 'The driver'} is no longer available` :
        code ?? `Couldn't assign ${c.unit.vehicle!.plate_number}`;
      toast.error(msg);
    },
  });

  const startMs = trip.planned_start ? new Date(trip.planned_start).getTime() : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-black/[0.06] px-3 py-3 dark:border-white/10">
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to list
        </button>
        <p className="text-[15px] font-semibold tracking-tight text-foreground">
          Nearest trucks for <span className="font-mono">{trip.ref_id}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 text-emerald-600" />
          {pickupStop ? stopName(pickupStop) : 'No pickup pin'}
          {trip.planned_start && <> · starts {formatTime(trip.planned_start)}</>}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {trip.driver
            ? <>Goes with the trip's driver, <span className="text-foreground">{trip.driver.first_name} {trip.driver.last_name}</span>.</>
            : "Each truck goes with its own standing driver."}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!pickup ? (
          <Note text="This trip's pickup has no map pin, so trucks can't be ranked by distance." />
        ) : candidates.length === 0 ? (
          <Note text="No free truck with a GPS position right now." />
        ) : (
          <div className="space-y-2">
            {candidates.map((c, i) => {
              const route = i < ROUTED ? routes[i]?.data ?? null : null;
              const routing = i < ROUTED && routes[i]?.isLoading;
              const arrive = route ? Date.now() + route.durationSeconds * 1000 : null;
              const slackMin = arrive && startMs ? Math.round((startMs - arrive) / 60000) : null;
              return (
                <Candidate
                  key={c.unit.key}
                  c={c}
                  rank={i + 1}
                  selected={selectedKey === c.unit.key}
                  distance={route ? `${formatKm(route.distanceMeters / 1000)} · ${formatDuration(route.durationSeconds)} drive` : `${formatKm(c.km)} away`}
                  routing={!!routing}
                  slackMin={slackMin}
                  pending={assign.isPending && assign.variables?.unit.key === c.unit.key}
                  disabled={assign.isPending}
                  onLocate={() => onLocate(c.unit)}
                  onAssign={() => assign.mutate(c)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-black/[0.06] px-3 py-2.5 dark:border-white/10">
        <button type="button" onClick={onManual} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 py-2 text-xs font-medium text-foreground hover:bg-white dark:border-white/15 dark:hover:bg-slate-900">
          <SlidersHorizontal className="size-3.5" /> Pick driver and truck manually
        </button>
      </div>
    </div>
  );
}

function Candidate({
  c, rank, selected, distance, routing, slackMin, pending, disabled, onLocate, onAssign,
}: {
  c: TruckCandidate; rank: number; selected: boolean; distance: string; routing: boolean; slackMin: number | null;
  pending: boolean; disabled: boolean; onLocate: () => void; onAssign: () => void;
}) {
  const best = rank === 1 && !c.blocker;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onLocate}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onLocate(); } }}
      className={cn(
        'cursor-pointer rounded-xl border bg-white p-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-900',
        selected ? 'border-charcoal/30 shadow-sm ring-1 ring-charcoal/10 dark:border-white/30' : 'border-black/[0.06] hover:border-black/15 dark:border-white/10',
        best && !selected && 'border-emerald-300 dark:border-emerald-800',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
          best ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        )}>
          {best ? <Truck className="size-4" /> : rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold text-foreground">{c.unit.vehicle!.plate_number}</span>
            <MotionChip unit={c.unit} />
            {best && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Best match</span>}
            {c.preferred && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <Star className="size-2.5" /> {c.preferred === 'PRIMARY' ? "Driver's truck" : 'Driver backup'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.unit.vehicle!.asset_type}
            {c.driver ? <> · <span className="text-foreground">{c.driver.name}</span></> : null}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11.5px] text-foreground">
            {routing && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            {distance}
            {slackMin != null && (
              slackMin >= 0
                ? <span className="text-emerald-700 dark:text-emerald-400"> · {formatMinutes(slackMin)} before start</span>
                : <span className="text-rose-600 dark:text-rose-400"> · {formatMinutes(slackMin)} late</span>
            )}
          </p>
          {(c.blocker || c.notes.length > 0) && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-800 dark:text-amber-400">
              <TriangleAlert className="mt-px size-3 shrink-0" />
              {[c.blocker, ...c.notes].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAssign(); }}
          disabled={disabled || !!c.blocker}
          title={c.blocker ?? 'Assign in one click'}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            best ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-charcoal text-white hover:bg-charcoal/90 dark:bg-white dark:text-slate-900',
          )}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Assign'}
        </button>
      </div>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-xs text-muted-foreground dark:border-white/15">{text}</p>;
}
