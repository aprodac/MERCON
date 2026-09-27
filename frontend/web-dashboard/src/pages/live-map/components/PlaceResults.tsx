import { ArrowRight, Loader2, MapPin, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatKm } from '@/lib/fleetLive';
import type { NearbyUnit, Place } from '@/lib/placeSearch';
import type { LiveUnit } from '@/services/fleetLiveService';
import type { Trip } from '@/services/tripService';
import FleetUnitRow from './FleetUnitRow';

const RADIUS_OPTIONS = [10, 25, 50, 100, 200];

export type PlaceResultsData =
  | {
      kind: 'near';
      place: Place;
      radiusKm: number;
      trucks: NearbyUnit[];
      /** When nothing is inside the radius: the closest few anywhere. */
      nearestOutside: NearbyUnit[];
      trips: Trip[];
    }
  | {
      kind: 'route';
      from: Place;
      to: Place;
      radiusKm: number;
      running: Trip[];
      scheduled: Trip[];
      freeNearFrom: NearbyUnit[];
      nearestFreeOutside: NearbyUnit[];
    };

interface Props {
  status: 'loading' | 'ready' | 'not_found';
  /** What couldn't be found, for the not-found message. */
  missing: string[];
  data: PlaceResultsData | null;
  selectedUnitKey: string | null;
  freeOnly: boolean;
  onFreeOnly: (v: boolean) => void;
  onRadius: (km: number) => void;
  onClear: () => void;
  onSelectUnit: (u: LiveUnit) => void;
  renderTrip: (t: Trip) => React.ReactNode;
  setRowRef: (id: string) => (el: HTMLElement | null) => void;
}

/** "Trucks near Dammam" and "Riyadh → Jeddah" — what the search box found once it read places out of the query. */
export default function PlaceResults({
  status, missing, data, selectedUnitKey, freeOnly, onFreeOnly, onRadius, onClear, onSelectUnit, renderTrip, setRowRef,
}: Props) {
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Finding the place…
      </div>
    );
  }
  if (status === 'not_found' || !data) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <SearchX className="mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Couldn't find {missing.map((m) => `"${m}"`).join(' or ')}</p>
        <p className="mt-1 text-xs text-muted-foreground">Try a city (Riyadh, Jeddah, Dammam…) or a fuller address.</p>
      </div>
    );
  }

  const truckRows = (list: NearbyUnit[]) => (
    <div className="space-y-1">
      {list.map(({ unit, km }) => (
        <FleetUnitRow
          key={unit.key}
          ref={setRowRef(unit.key)}
          unit={unit}
          selected={selectedUnitKey === unit.key}
          onSelect={() => onSelectUnit(unit)}
          meta={<span className="font-medium text-foreground">{formatKm(km)}</span>}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* What was understood */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900 dark:bg-sky-950/30">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {data.kind === 'near' ? (
              <>Near {data.place.label}</>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1">{data.from.label} <ArrowRight className="size-3.5" /> {data.to.label}</span>
            )}
          </p>
          <button type="button" onClick={onClear} aria-label="Clear place search" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] text-muted-foreground">Within</span>
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRadius(r)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors',
                data.radiusKm === r ? 'bg-sky-700 text-white' : 'bg-white text-sky-800 hover:bg-sky-100 dark:bg-slate-900 dark:text-sky-300',
              )}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {data.kind === 'near' ? (
        <>
          <Section
            title={`Trucks within ${data.radiusKm} km`}
            count={data.trucks.length}
            right={
              <label className="flex cursor-pointer items-center gap-1 text-[11px] font-normal normal-case text-muted-foreground">
                <input type="checkbox" checked={freeOnly} onChange={(e) => onFreeOnly(e.target.checked)} className="size-3 accent-emerald-600" />
                Free only
              </label>
            }
          >
            {data.trucks.length > 0 ? truckRows(data.trucks) : (
              <>
                <Hint text={`No ${freeOnly ? 'free ' : ''}trucks inside ${data.radiusKm} km.`} />
                {data.nearestOutside.length > 0 && (
                  <>
                    <p className="mt-2 mb-1 text-[11px] font-medium text-muted-foreground">Closest anywhere</p>
                    {truckRows(data.nearestOutside)}
                  </>
                )}
              </>
            )}
          </Section>
          <Section title="Trips stopping here" count={data.trips.length}>
            {data.trips.length > 0 ? <div className="space-y-2">{data.trips.map(renderTrip)}</div> : <Hint text="No open trip stops here." />}
          </Section>
        </>
      ) : (
        <>
          <Section title="On the road now" count={data.running.length}>
            {data.running.length > 0 ? <div className="space-y-2">{data.running.map(renderTrip)}</div> : <Hint text="No truck is running this route right now." />}
          </Section>
          <Section title="Scheduled on this route" count={data.scheduled.length}>
            {data.scheduled.length > 0 ? <div className="space-y-2">{data.scheduled.map(renderTrip)}</div> : <Hint text="Nothing scheduled on this route." />}
          </Section>
          <Section title={`Free trucks near ${data.from.label}`} count={data.freeNearFrom.length}>
            {data.freeNearFrom.length > 0 ? truckRows(data.freeNearFrom) : (
              <>
                <Hint text={`No free truck within ${data.radiusKm} km of ${data.from.label}.`} />
                {data.nearestFreeOutside.length > 0 && (
                  <>
                    <p className="mt-2 mb-1 text-[11px] font-medium text-muted-foreground">Closest free trucks</p>
                    {truckRows(data.nearestFreeOutside)}
                  </>
                )}
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, count, right, children }: { title: string; count: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-foreground uppercase">
        <span>{title}</span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
        {right && <span className="ml-auto">{right}</span>}
      </h3>
      {children}
    </section>
  );
}

function Hint({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-black/10 px-3 py-3 text-center text-[11.5px] text-muted-foreground dark:border-white/15">{text}</p>;
}
