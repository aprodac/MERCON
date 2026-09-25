import { Marker } from 'react-map-gl/maplibre';
import { Check, Info, Smartphone, Truck, UserRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { nextStop, stopLabel, timeAgo, unitTitle, type StopGroup } from '@/lib/fleetLive';
import type { LiveGpsFix, LiveUnit } from '@/services/fleetLiveService';
import { TONE, unitTone, type UnitTone } from './liveMapStyle';

/** A group of nearby units. Ringed in the colour of the most urgent unit inside. */
export function ClusterMarker({
  lng, lat, count, tone, onClick,
}: { lng: number; lat: number; count: number; tone: UnitTone; onClick: () => void }) {
  const size = count < 10 ? 34 : count < 50 ? 40 : 46;
  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="center"
      style={{ zIndex: 25 }}
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onClick();
      }}
    >
      <button
        type="button"
        aria-label={`${count} units here — zoom in`}
        title={`${count} units — click to zoom in`}
        className="flex items-center justify-center rounded-full bg-white text-[13px] font-semibold text-slate-800 shadow-[0_2px_10px_rgba(0,0,0,0.25)] transition-transform hover:scale-110 dark:bg-slate-50"
        style={{ width: size, height: size, boxShadow: `0 0 0 3px ${TONE[tone].fill}, 0 0 0 7px ${TONE[tone].fill}22, 0 2px 10px rgba(0,0,0,0.25)` }}
      >
        {count}
      </button>
    </Marker>
  );
}

/** The quick look on hover — enough to decide whether to click. */
export function HoverPeek({ unit }: { unit: LiveUnit }) {
  const pos = unit.position!;
  const tone = TONE[unitTone(unit)];
  const stop = nextStop(unit);
  const speed = unit.motion === 'moving' && pos.speed_kph != null ? `${Math.round(pos.speed_kph)} km/h` : null;
  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom" offset={[0, -22]} style={{ zIndex: 40, pointerEvents: 'none' }}>
      <div className="w-[220px] rounded-xl border border-black/[0.06] bg-white/95 p-3 text-left shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-md dark:border-white/10 dark:bg-slate-950/90">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[13px] font-semibold text-foreground">{unitTitle(unit)}</span>
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold', tone.soft, tone.text)}>
            <span className={cn('size-1.5 rounded-full', tone.dot)} />
            {tone.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {unit.driver?.name ?? 'No driver assigned'}
          {speed && ` · ${speed}`}
          {unit.motion === 'idle' && ' · stopped'}
          {unit.motion === 'stale' && ` · last seen ${timeAgo(pos.recorded_at)}`}
        </p>
        {stop && (
          <p className="mt-1.5 truncate text-xs text-foreground">
            <span className="text-muted-foreground">Next: </span>
            {stopLabel(stop)}
          </p>
        )}
        <div className="mt-2 flex gap-3 border-t border-black/[0.06] pt-2 text-[11px] dark:border-white/10">
          <FeedDot icon={Truck} label="Tracker" fix={unit.vehicle_gps} />
          <FeedDot icon={Smartphone} label="Phone" fix={unit.driver_gps} />
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">Click for details</p>
      </div>
    </Marker>
  );
}

function FeedDot({ icon: Icon, label, fix }: { icon: typeof Truck; label: string; fix: LiveGpsFix | null }) {
  const state = !fix ? 'off' : fix.fresh ? 'live' : 'stale';
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Icon className="size-3" />
      {label}
      <span className={cn('size-1.5 rounded-full', state === 'live' ? 'bg-emerald-500' : state === 'stale' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600')} />
    </span>
  );
}

/** Numbered stop pin with its name; the next stop also carries the ETA. */
export function StopPin({ group, eta }: { group: StopGroup; eta: string | null }) {
  const bg = group.done ? 'bg-slate-400' : group.isNext ? 'bg-blue-600' : 'bg-slate-800 dark:bg-slate-700';
  return (
    <Marker longitude={group.lng} latitude={group.lat} anchor="bottom" style={{ zIndex: group.isNext ? 15 : 5 }}>
      <div className="flex flex-col items-center">
        <div className="mb-1 flex max-w-[170px] items-center gap-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] leading-4 shadow-sm ring-1 ring-black/5 dark:bg-slate-900/90 dark:ring-white/10">
          <span className={cn('truncate font-medium', group.done ? 'text-muted-foreground' : 'text-foreground')}>{group.name}</span>
          {group.isNext && eta && <span className="shrink-0 font-semibold text-blue-600 dark:text-blue-400">· {eta}</span>}
        </div>
        <div className={cn('flex h-7 min-w-7 items-center justify-center rounded-full border-[2.5px] border-white px-1.5 text-[11px] font-bold text-white shadow-md', bg)}>
          {group.done ? <Check className="size-3.5" strokeWidth={3} /> : group.numbers.join('·')}
        </div>
        <div className={cn('-mt-0.5 h-2 w-0.5 rounded-full', bg)} />
      </div>
    </Marker>
  );
}

/**
 * "How to read the map" plus the OpenStreetMap / OpenFreeMap credit, which
 * their licences require to stay reachable — so it lives here, not removed.
 */
export function MapLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="How to read the map"
          aria-label="How to read the map"
          className="flex size-9 items-center justify-center text-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 [&_svg]:size-4"
        >
          <Info />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="end" className="w-72 p-0">
        <div className="space-y-3 p-3.5 text-xs">
          <p className="text-sm font-semibold text-foreground">How to read the map</p>
          <LegendSection title="Colour — trip">
            {(['active', 'delayed', 'upcoming', 'free'] as UnitTone[]).map((t) => (
              <LegendRow key={t} icon={<span className={cn('size-2.5 rounded-full', TONE[t].dot)} />}>
                {TONE[t].label}
                {t === 'free' && <span className="text-muted-foreground"> — no trip right now</span>}
              </LegendRow>
            ))}
          </LegendSection>
          <LegendSection title="Shape — movement">
            <LegendRow icon={<Puck><svg viewBox="0 0 24 24" className="size-3"><path d="M12 2.5 19.5 20 12 16.2 4.5 20Z" fill="#2563eb" /></svg></Puck>}>Moving, pointing its heading</LegendRow>
            <LegendRow icon={<Puck><span className="size-2 rounded-[3px] bg-blue-600" /></Puck>}>Stopped</LegendRow>
            <LegendRow icon={<Puck><span className="size-2 rounded-full border-2 border-slate-400" /></Puck>}>Not live — last known spot and its age</LegendRow>
          </LegendSection>
          <LegendSection title="Badge — live GPS feeds">
            <LegendRow icon={<Badge><Truck className="size-2.5" /></Badge>}>Truck tracker</LegendRow>
            <LegendRow icon={<Badge><UserRound className="size-2.5" /></Badge>}>Driver's phone (on trips only)</LegendRow>
            <LegendRow icon={<Badge><Truck className="size-2.5" /><UserRound className="size-2.5" /></Badge>}>Both — truck and driver together</LegendRow>
          </LegendSection>
          <LegendSection title="Other">
            <LegendRow icon={<span className="flex size-5 items-center justify-center rounded-full bg-white text-[9px] font-bold text-slate-800 ring-2 ring-blue-600">9</span>}>Group of units — click to zoom in</LegendRow>
            <LegendRow icon={<span className="h-1 w-5 rounded-full bg-blue-600" />}>Road route to the next stop</LegendRow>
            <LegendRow icon={<span className="h-1 w-5 rounded-full bg-blue-600/35" />}>Rest of the trip</LegendRow>
          </LegendSection>
        </div>
        <p className="border-t px-3.5 py-2 text-[11px] text-muted-foreground">
          Map ©{' '}
          <a className="underline hover:text-foreground" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>{' '}·{' '}
          <a className="underline hover:text-foreground" href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>{' '}· Data ©{' '}
          <a className="underline hover:text-foreground" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
        </p>
      </PopoverContent>
    </Popover>
  );
}

function LegendSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function LegendRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-foreground">
      <span className="flex w-6 shrink-0 justify-center">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Puck({ children }: { children: React.ReactNode }) {
  return <span className="flex size-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/10">{children}</span>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-px rounded-full bg-slate-900 px-1 py-0.5 text-white">{children}</span>;
}
