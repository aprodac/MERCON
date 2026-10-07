import { forwardRef } from 'react';
import { ExternalLink, Handshake, LocateFixed, MapPin, Phone, SignalLow, Truck, UserPlus, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { whatsAppLink } from '@/lib/share';
import { isOffline, timeAgo } from '@/lib/fleetLive';
import type { LiveUnit } from '@/services/fleetLiveService';
import type { Trip } from '@/services/tripService';
import {
  ATTENTION_LABEL, driverName, driverPhone, formatMinutes, isActiveTrip, isThirdParty, minutesPast, nextStopIndex, plateOf,
  stopName, stopProgress, type AttentionReason,
} from '@/lib/liveOps';
import TripStatusMenu from './TripStatusMenu';
import { splitLegs } from '@mercon/shared-types';

interface Props {
  trip: Trip;
  unit: LiveUnit | null;
  reasons: AttentionReason[];
  selected: boolean;
  pendingStatus: boolean;
  formatTime: (iso: string) => string;
  onSelect: () => void;
  onChangeStatus: (status: string) => void;
  onAssign: () => void;
  onOpen: () => void;
}

const STRIPE: Record<string, string> = {
  Delayed: 'bg-rose-500',
  InTransit: 'bg-blue-600',
  Loading: 'bg-sky-500',
  Scheduled: 'bg-violet-500',
  Draft: 'bg-slate-300 dark:bg-slate-600',
  Completed: 'bg-emerald-500',
  Invoiced: 'bg-emerald-500',
  Cancelled: 'bg-stone-400',
};

const REASON_TONE: Record<AttentionReason, string> = {
  delayed: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900',
  late_start: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  overdue_stop: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  unassigned: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900',
  no_gps: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

/** One trip in the Live map sidebar — status, route, who's driving, where it is, and the quick actions. */
const OpsTripCard = forwardRef<HTMLDivElement, Props>(function OpsTripCard(
  { trip, unit, reasons, selected, pendingStatus, formatTime, onSelect, onChangeStatus, onAssign, onOpen },
  ref,
) {
  const stops = trip.stops ?? [];
  // A round trip shows its way out and "↺" — not Riyadh → Riyadh.
  const legs = splitLegs(stops, trip.rate_category);
  const routeStops = legs.round ? legs.outbound : stops;
  const first = routeStops[0];
  const last = routeStops.length > 1 ? routeStops[routeStops.length - 1] : null;
  const progress = stopProgress(trip);
  const active = isActiveTrip(trip);
  const nextIdx = active ? nextStopIndex(stops) : null;
  const next = nextIdx == null ? null : stops[nextIdx];
  const nextLate = next ? minutesPast(next.planned_arrival) : null;
  const startPast = minutesPast(trip.planned_start);
  const name = driverName(trip);
  const phone = driverPhone(trip);
  const plate = plateOf(trip);
  const thirdParty = isThirdParty(trip);
  const needsAssign = !thirdParty && (!trip.driver || !trip.vehicle) && ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Delayed'].includes(trip.status);
  const live = unit?.position && !isOffline(unit);

  const share = () => {
    const lines = [`*${trip.ref_id}*`];
    if (next) lines.push(`Next stop: ${stopName(next)}`);
    window.open(whatsAppLink(phone, lines.join('\n')), '_blank', 'noopener');
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
      className={cn(
        'group/card relative cursor-pointer overflow-hidden rounded-xl border bg-white p-3 pl-3.5 text-left transition-all outline-none dark:bg-slate-900',
        'focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-charcoal/30 shadow-[0_6px_24px_rgba(15,23,42,0.12)] ring-1 ring-charcoal/10 dark:border-white/30'
          : 'border-black/[0.06] hover:border-black/15 hover:shadow-sm dark:border-white/10 dark:hover:border-white/20',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', STRIPE[trip.status] ?? 'bg-slate-300')} />

      {/* Ref, customer, status */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold tracking-tight text-foreground">{trip.ref_id}</span>
            {live && (
              <span className="relative flex size-1.5" title="Live GPS">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{trip.customer?.name ?? 'No customer'}</p>
        </div>
        <TripStatusMenu status={trip.status} pending={pendingStatus} onChange={onChangeStatus} />
      </div>

      {/* Route */}
      {first && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-foreground">
          <MapPin className="size-3 shrink-0 text-emerald-600" />
          <span className="min-w-0 truncate">{stopName(first)}</span>
          {last && (
            <>
              <span className="shrink-0 text-muted-foreground">→</span>
              <span className="min-w-0 truncate">{stopName(last)}</span>
            </>
          )}
          {routeStops.length > 2 && <span className="shrink-0 text-[11px] text-muted-foreground">+{routeStops.length - 2}</span>}
          {legs.round && (
            <span className="shrink-0 rounded bg-violet-50 px-1 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" title="Round trip">
              ↺{active && legs.currentLeg ? ` leg ${legs.currentLeg}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Progress along the stops */}
      {active && progress.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-1 flex-1 gap-0.5">
            {stops.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  'h-full flex-1 rounded-full',
                  s.actual_arrival ? 'bg-emerald-500' : i === nextIdx ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700',
                )}
              />
            ))}
          </div>
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{progress.done}/{progress.total}</span>
        </div>
      )}

      {/* Timing line */}
      <div className="mt-1.5 text-[11.5px] text-muted-foreground">
        {active && next ? (
          <span>
            Next: <span className="text-foreground">{stopName(next)}</span>
            {next.planned_arrival && (
              <>
                {' · '}due {formatTime(next.planned_arrival)}
                {nextLate != null && nextLate > 0 && <span className="font-medium text-rose-600 dark:text-rose-400"> ({formatMinutes(nextLate)} late)</span>}
              </>
            )}
          </span>
        ) : trip.status === 'Completed' || trip.status === 'Invoiced' ? (
          <span>Completed {trip.actual_end ? formatTime(trip.actual_end) : ''}</span>
        ) : trip.planned_start ? (
          <span>
            Starts {formatTime(trip.planned_start)}
            {startPast != null && (trip.status === 'Scheduled' || trip.status === 'Draft') && (
              startPast > 0
                ? <span className="font-medium text-amber-700 dark:text-amber-400"> · {formatMinutes(startPast)} overdue</span>
                : <span> · in {formatMinutes(startPast)}</span>
            )}
          </span>
        ) : (
          <span>No start time</span>
        )}
      </div>

      {/* Driver / truck / GPS */}
      <div className="mt-2 flex items-center gap-2 text-[11.5px]">
        {thirdParty ? <Handshake className="size-3.5 shrink-0 text-muted-foreground" /> : <Truck className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className={cn('min-w-0 truncate', name ? 'text-foreground' : 'text-muted-foreground italic')}>
          {name ?? 'No driver'}
          {plate ? <span className="font-mono text-muted-foreground"> · {plate}</span> : !thirdParty && <span className="text-muted-foreground"> · no truck</span>}
        </span>
        <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">
          {unit?.position ? (
            isOffline(unit) ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><SignalLow className="size-3" />{timeAgo(unit.position.recorded_at)}</span>
            ) : unit.motion === 'moving' && unit.position.speed_kph != null ? (
              <span className="font-medium text-blue-700 tabular-nums dark:text-blue-300">{Math.round(unit.position.speed_kph)} km/h</span>
            ) : (
              <span>Stopped · {timeAgo(unit.position.recorded_at)}</span>
            )
          ) : null}
        </span>
      </div>

      {(reasons.length > 0 || needsAssign) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {reasons.map((r) => (
            <span key={r} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', REASON_TONE[r])}>{ATTENTION_LABEL[r]}</span>
          ))}
          {needsAssign && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAssign(); }}
              className="ml-auto inline-flex h-6 items-center gap-1 rounded-md bg-violet-600 px-2 text-[10.5px] font-semibold text-white hover:bg-violet-700"
            >
              {trip.vehicle ? <><UserPlus className="size-3" /> Assign driver</> : <><Radar className="size-3" /> Find nearest truck</>}
            </button>
          )}
        </div>
      )}

      {/* Quick actions — always on the selected card, on hover for the rest */}
      <div
        className={cn(
          'flex items-center gap-1 overflow-hidden transition-all',
          selected ? 'mt-2.5 max-h-10 opacity-100' : 'max-h-0 opacity-0 group-hover/card:mt-2.5 group-hover/card:max-h-10 group-hover/card:opacity-100 group-focus-within/card:mt-2.5 group-focus-within/card:max-h-10 group-focus-within/card:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ActionButton label="Show on map" onClick={onSelect}><LocateFixed /></ActionButton>
        {phone && (
          <>
            <ActionButton label={`Call ${name ?? 'driver'}`} href={`tel:${phone}`}><Phone /></ActionButton>
            <ActionButton label="WhatsApp the driver" onClick={share}><WhatsAppIcon className="size-3.5" /></ActionButton>
          </>
        )}
        <ActionButton label="Open trip" onClick={onOpen} className="ml-auto"><ExternalLink /> Open</ActionButton>
      </div>
    </div>
  );
});

export default OpsTripCard;

function ActionButton({
  label, onClick, href, accent, className, children,
}: { label: string; onClick?: () => void; href?: string; accent?: boolean; className?: string; children: React.ReactNode }) {
  const cls = cn(
    'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors [&_svg]:size-3.5',
    accent
      ? 'bg-violet-600 text-white hover:bg-violet-700'
      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
    className,
  );
  if (href) {
    return <a href={href} title={label} aria-label={label} className={cls}>{children}</a>;
  }
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={cls}>{children}</button>;
}
