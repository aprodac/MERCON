import { Check, Maximize2, Minimize2, Navigation, Phone, Route, Smartphone, Truck, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { cn } from '@/lib/utils';
import { formatDuration, formatKm, nextStop, punctuality, stopLabel, timeAgo, unitTitle, type EtaInfo } from '@/lib/fleetLive';
import { fleetLiveService, type LiveGpsFix, type LiveMediaItem, type LiveUnit } from '@/services/fleetLiveService';
import { MediaViewer, StopMediaStrip } from './TripMedia';
import { TONE, unitTone } from './liveMapStyle';

export const GLASS =
  'bg-white/85 dark:bg-slate-950/80 backdrop-blur-xl backdrop-saturate-150 border border-black/[0.06] dark:border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.12)]';

interface Props {
  unit: LiveUnit;
  eta: EtaInfo | null;
  formatTime: (d: Date) => string;
  compact: boolean;
  onClose: () => void;
  onShare: () => void;
  onShowRoute: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Driver view: camera behind the arrow, facing its direction. */
  pov: boolean;
  onTogglePov: () => void;
}

const MOTION_LABEL: Record<LiveUnit['motion'], string> = {
  moving: 'Moving',
  idle: 'Stopped',
  stale: 'Offline',
  no_signal: 'No signal',
};

export function LiveUnitPanel({ unit, eta, formatTime, compact, onClose, onShare, onShowRoute, expanded, onToggleExpand, pov, onTogglePov }: Props) {
  const tone = TONE[unitTone(unit)];
  const stop = nextStop(unit);
  const p = punctuality(eta?.lateByMin ?? null);
  const [viewer, setViewer] = useState<{ items: LiveMediaItem[]; index: number; title: string } | null>(null);

  // What the driver sent from each stop — only fetched for the full panel, where it is shown.
  const tripId = unit.trip?.id;
  const { data: media } = useQuery({
    queryKey: ['fleet-live-trip-media', tripId],
    queryFn: () => fleetLiveService.getTripMedia(tripId!),
    enabled: !compact && !!tripId,
    refetchInterval: 60_000,
    retry: false,
  });
  const mediaByStop = new Map((media?.stops ?? []).map((m) => [m.stop_id, m]));
  const openViewer = (items: LiveMediaItem[], index: number, title: string) => setViewer({ items, index, title });

  const header = (
    <div className="flex items-start gap-3">
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tone.soft)}>
        {unit.vehicle ? <Truck className={cn('size-5', tone.text)} /> : <Smartphone className={cn('size-5', tone.text)} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[15px] font-semibold tracking-tight text-foreground">{unitTitle(unit)}</span>
          <MotionChip unit={unit} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {unit.vehicle?.asset_type ?? 'Driver phone'} · {unit.position ? `GPS ${timeAgo(unit.position.recorded_at)}` : 'no GPS yet'}
          {unit.motion === 'moving' && unit.position?.speed_kph != null && ` · ${Math.round(unit.position.speed_kph)} km/h`}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="-mt-1 -mr-1 size-8 rounded-full" onClick={onClose} aria-label="Close details">
        <X className="size-4" />
      </Button>
    </div>
  );

  const actions = (
    <div className="flex gap-2">
      <Button
        onClick={onShare}
        disabled={!unit.trip}
        className="h-9 flex-1 rounded-xl bg-[#25D366] font-semibold text-white hover:bg-[#1ebe5b]"
        title={unit.trip ? 'Share the ETA on WhatsApp' : 'No trip to share an ETA for'}
      >
        <WhatsAppIcon className="size-4" /> Share ETA
      </Button>
      {unit.position && (
        <Button
          variant="outline"
          size="icon"
          className={cn('size-9 rounded-xl', pov && 'border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-300')}
          onClick={onTogglePov}
          title={pov ? 'Leave driver view' : 'Driver view — follow from behind'}
          aria-label={pov ? 'Leave driver view' : 'Driver view'}
          aria-pressed={pov}
        >
          <Navigation className="size-4" />
        </Button>
      )}
      {unit.trip && (
        <Button variant="outline" size="icon" className="size-9 rounded-xl" onClick={onShowRoute} title="Show the whole route" aria-label="Show the whole route">
          <Route className="size-4" />
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-9 rounded-xl"
        title={expanded ? 'Exit full screen' : 'Full screen'}
        aria-label={expanded ? 'Exit full screen' : 'Full screen'}
        onClick={onToggleExpand}
      >
        {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <div className={cn('pointer-events-auto rounded-2xl p-3', GLASS)}>
        {header}
        {stop && (
          <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-charcoal-strong/[0.03] px-2.5 py-2 text-xs dark:bg-white/5">
            <Navigation className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{stopLabel(stop)}</span>
            {eta?.arrival && <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatTime(eta.arrival)}</span>}
            {p && <span className={cn('shrink-0 font-medium', p.tone === 'good' ? 'text-emerald-600' : 'text-rose-600')}>{p.label}</span>}
          </div>
        )}
        <div className="mt-2.5">{actions}</div>
      </div>
    );
  }

  return (
    <div className={cn('pointer-events-auto flex max-h-full w-[300px] flex-col overflow-hidden rounded-2xl', GLASS)}>
      <div className="p-4 pb-3">{header}</div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {/* Driver */}
        {unit.driver && (
          <div className="flex items-center gap-3 rounded-xl bg-charcoal-strong/[0.03] p-2.5 dark:bg-white/5">
            <Initials name={unit.driver.name} src={unit.driver.avatar_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{unit.driver.name}</p>
              <p className="truncate text-xs text-muted-foreground">{unit.driver.phone ?? 'No phone on file'}</p>
            </div>
            {unit.driver.phone && (
              <Button asChild variant="ghost" size="icon" className="size-8 rounded-full text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-700">
                <a href={`tel:${unit.driver.phone}`} aria-label={`Call ${unit.driver.name}`}>
                  <Phone className="size-4" />
                </a>
              </Button>
            )}
          </div>
        )}

        {/* GPS feeds */}
        <div className="grid grid-cols-2 gap-2">
          <FeedTile icon={Truck} label="Truck tracker" fix={unit.vehicle_gps} missing={!unit.vehicle ? 'No truck' : !unit.vehicle.has_tracker ? 'No tracker' : 'No fix yet'} />
          <FeedTile icon={Smartphone} label="Driver app" fix={unit.driver_gps} missing={!unit.driver ? 'No driver' : !unit.trip || unit.trip.phase === 'upcoming' ? 'Off trip' : 'Not sending'} />
        </div>
        {unit.feeds_gap_m != null && unit.feeds_gap_m > 1000 && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="size-3.5 shrink-0" />
            Tracker and phone are {formatKm(unit.feeds_gap_m / 1000)} apart
          </p>
        )}

        {/* Trip */}
        {unit.trip ? (
          <div className="rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-foreground">{unit.trip.ref_id ?? 'Trip'}</span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', tone.soft, tone.text)}>
                <span className={cn('size-1.5 rounded-full', tone.dot)} />
                {tone.label}
              </span>
            </div>
            {unit.trip.customer_name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{unit.trip.customer_name}</p>}
            <ol className="mt-3 space-y-0">
              {unit.trip.stops.map((s, i) => {
                const done = s.actual_arrival != null;
                const isNext = i === unit.trip!.next_stop_index;
                const last = i === unit.trip!.stops.length - 1;
                return (
                  <li key={s.sequence} className="relative flex gap-2.5 pb-2.5 last:pb-0">
                    {!last && <span className={cn('absolute top-5 left-[9px] h-[calc(100%-16px)] w-px', done ? 'bg-slate-300 dark:bg-slate-600' : 'border-l border-dashed border-slate-300 dark:border-slate-600')} />}
                    <span
                      className={cn(
                        'relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                        done && 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
                        isNext && 'bg-blue-600 text-white ring-4 ring-blue-600/15',
                        !done && !isNext && 'border border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900',
                      )}
                    >
                      {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-xs', isNext ? 'font-semibold text-foreground' : done ? 'text-muted-foreground' : 'text-foreground')}>
                        {stopLabel(s)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.type}
                        {done && s.actual_arrival && ` · arrived ${formatTime(new Date(s.actual_arrival))}`}
                        {!done && s.planned_arrival && ` · due ${formatTime(new Date(s.planned_arrival))}`}
                      </p>
                      <StopMediaStrip stop={mediaByStop.get(s.id)} title={stopLabel(s)} onOpen={openViewer} />
                    </div>
                  </li>
                );
              })}
            </ol>
            {media && media.unplaced.length > 0 && (
              <div className="mt-3 border-t border-black/[0.06] pt-2.5 dark:border-white/10">
                <p className="mb-1.5 text-[11px] text-muted-foreground">Other uploads from this trip</p>
                <StopMediaStrip
                  stop={{ stop_id: 'unplaced', sequence: 0, delay: null, media: media.unplaced }}
                  title={unit.trip.ref_id ?? 'Trip'}
                  onOpen={openViewer}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-black/10 p-3 text-center text-xs text-muted-foreground dark:border-white/10">
            Free — no trip assigned right now
          </p>
        )}

        {eta && eta.arrival == null && stop && (
          <p className="text-[11px] text-muted-foreground">Road routing is unavailable, so there's no drive-time ETA. Distance shown is a straight line.</p>
        )}
      </div>

      <div className="border-t border-black/[0.06] p-3 dark:border-white/10">{actions}</div>
      {viewer && (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          title={viewer.title}
          onClose={() => setViewer(null)}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        />
      )}
    </div>
  );
}

function MotionChip({ unit }: { unit: LiveUnit }) {
  const cls =
    unit.motion === 'moving'
      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
      : unit.motion === 'idle'
        ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
        : 'bg-slate-500/12 text-slate-600 dark:text-slate-300';
  const dot = unit.motion === 'moving' ? 'bg-emerald-500' : unit.motion === 'idle' ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold', cls)}>
      <span className={cn('size-1.5 rounded-full', dot, unit.motion === 'moving' && 'animate-pulse')} />
      {MOTION_LABEL[unit.motion]}
    </span>
  );
}

function FeedTile({ icon: Icon, label, fix, missing }: { icon: typeof Truck; label: string; fix: LiveGpsFix | null; missing: string }) {
  const state = !fix ? 'none' : fix.fresh ? 'live' : 'stale';
  return (
    <div className="rounded-xl border border-black/[0.06] px-2.5 py-2 dark:border-white/10">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium">
        <span className={cn('size-1.5 rounded-full', state === 'live' ? 'bg-emerald-500' : state === 'stale' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600')} />
        <span className={state === 'none' ? 'text-muted-foreground' : 'text-foreground'}>
          {state === 'live' ? 'Live' : state === 'stale' ? timeAgo(fix!.recorded_at) : missing}
        </span>
      </div>
    </div>
  );
}

function Initials({ name, src }: { name: string; src: string | null }) {
  if (src) return <img src={src} alt="" className="size-9 shrink-0 rounded-full object-cover" />;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-600/12 text-xs font-semibold text-violet-700 dark:text-violet-300">
      {initials || '?'}
    </span>
  );
}

/** CarPlay's top-left manoeuvre card: distance to the next stop, then the stop after. */
export function NextStopCard({ unit, eta }: { unit: LiveUnit; eta: EtaInfo | null }) {
  const stop = nextStop(unit);
  if (!stop || !unit.trip) return null;
  const after = unit.trip.stops[(unit.trip.next_stop_index ?? 0) + 1];
  return (
    <div className="pointer-events-auto w-[270px] overflow-hidden rounded-2xl bg-charcoal/92 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl dark:bg-[#0f3d34]/92">
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <Navigation className="size-7 shrink-0 fill-white/10 text-sky-300" />
        <div>
          <p className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">
            {eta?.distanceKm != null ? formatKm(eta.distanceKm) : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-white/60">{eta?.distanceIsRoad ? 'by road' : 'straight line'} to next stop</p>
        </div>
      </div>
      <p className="truncate px-4 pt-2 pb-3 text-[15px] font-semibold">{stopLabel(stop)}</p>
      {after && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-charcoal-strong/15 px-4 py-2 text-xs text-white/75">
          <span className="text-white/50">Then</span>
          <span className="truncate">{stopLabel(after)}</span>
        </div>
      )}
    </div>
  );
}

/** CarPlay's bottom-left arrival strip. */
export function EtaStrip({ eta, formatTime }: { eta: EtaInfo; formatTime: (d: Date) => string }) {
  const p = punctuality(eta.lateByMin);
  return (
    <div className={cn('pointer-events-auto flex items-end gap-5 rounded-2xl px-4 py-2.5', GLASS)}>
      <Metric value={eta.arrival ? formatTime(eta.arrival) : '—'} label="arrival" />
      <Metric
        value={eta.durationSeconds != null ? formatDuration(eta.durationSeconds) : '—'}
        label={p?.label ?? 'drive time'}
        tone={p?.tone}
      />
      {eta.distanceKm != null && <Metric value={formatKm(eta.distanceKm)} label={eta.distanceIsRoad ? 'by road' : 'direct'} />}
    </div>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className={cn('text-lg leading-tight font-semibold tabular-nums text-foreground', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'bad' && 'text-rose-600 dark:text-rose-400')}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
