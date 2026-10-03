import { SignalLow, X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOffline, nextStop, stopLabel, timeAgo, unitTitle } from '@/lib/fleetLive';
import type { LiveUnit } from '@/services/fleetLiveService';
import { GLASS } from './LiveUnitPanel';
import { mixLabel, type ToneMix } from './LiveMapBits';
import { TONE, unitTone } from './liveMapStyle';

/** What the operator needs to pick a row: where it is going, or how long it has been idle. */
function rowDetail(u: LiveUnit): string {
  const stop = nextStop(u);
  const parts: string[] = [];
  const tone = unitTone(u);
  if (tone === 'delayed') parts.push(stop ? `Delayed · next ${stopLabel(stop)}` : 'Delayed');
  else if (tone === 'active') parts.push(stop ? `Next ${stopLabel(stop)}` : (u.trip?.customer_name ?? 'On trip'));
  else if (tone === 'upcoming') parts.push(`Scheduled${u.trip?.customer_name ? ` · ${u.trip.customer_name}` : ''}`);
  else parts.push(u.motion === 'moving' ? 'Free · moving' : 'Free · parked');
  if (u.motion === 'moving' && u.position?.speed_kph != null && tone !== 'free') parts.push(`${Math.round(u.position.speed_kph)} km/h`);
  if (isOffline(u)) parts.push(`last seen ${timeAgo(u.position?.recorded_at)}`);
  return parts.join(' · ');
}

/**
 * The trucks inside a map bubble, as a list — most urgent first. Hovering a row
 * lights up where it is on the map; clicking opens that truck's own panel.
 */
export function ClusterListPanel({
  units, compact, hoverKey, onHover, onSelect, onZoom, onClose,
}: {
  units: LiveUnit[];
  compact: boolean;
  hoverKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
  onZoom: () => void;
  onClose: () => void;
}) {
  const mix: ToneMix = { delayed: 0, active: 0, upcoming: 0, free: 0 };
  for (const u of units) mix[unitTone(u)]++;
  const offline = units.filter(isOffline).length;

  return (
    <div
      className={cn('pointer-events-auto flex flex-col overflow-hidden rounded-2xl', GLASS, compact ? 'max-h-[55%] w-full' : 'max-h-full w-[300px]')}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{units.length} trucks here</p>
          <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {(['delayed', 'active', 'upcoming', 'free'] as const).filter((t) => mix[t] > 0).map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className={cn('size-1.5 rounded-full', TONE[t].dot)} />
                {mix[t]} {TONE[t].label.toLowerCase()}
              </span>
            ))}
            {offline > 0 && (
              <span className="flex items-center gap-1">
                <SignalLow className="size-3 text-amber-600" />
                {offline} not live
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close list" className="rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10">
          <X className="size-4" />
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto border-t border-black/[0.06] dark:border-white/10" aria-label={mixLabel(mix)}>
        {units.map((u) => {
          const tone = TONE[unitTone(u)];
          return (
            <li key={u.key}>
              <button
                type="button"
                onClick={() => onSelect(u.key)}
                onMouseEnter={() => onHover(u.key)}
                onFocus={() => onHover(u.key)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors',
                  hoverKey === u.key ? 'bg-black/[0.04] dark:bg-white/[0.06]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
                )}
              >
                <span className={cn('size-2 shrink-0 rounded-full', tone.dot, isOffline(u) && 'opacity-50')} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[12.5px] font-semibold text-foreground">{unitTitle(u)}</span>
                    <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                      {u.vehicle ? (u.driver?.name ?? 'No driver') : ''}
                    </span>
                  </span>
                  <span className={cn('block truncate text-[11px]', unitTone(u) === 'delayed' ? tone.text : 'text-muted-foreground')}>
                    {rowDetail(u)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-black/[0.06] p-2 dark:border-white/10">
        <button
          type="button"
          onClick={onZoom}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ZoomIn className="size-3.5" /> Zoom to these {units.length}
        </button>
      </div>
    </div>
  );
}
