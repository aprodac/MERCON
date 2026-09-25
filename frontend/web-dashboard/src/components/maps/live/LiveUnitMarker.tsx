import { memo } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { Truck, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortAgo, unitTitle } from '@/lib/fleetLive';
import type { LiveUnit } from '@/services/fleetLiveService';
import { TONE, unitTone } from './liveMapStyle';

interface Props {
  unit: LiveUnit;
  selected: boolean;
  dimmed: boolean;
  /** Decided by the parent's collision pass — only labels that fit are shown. */
  showLabel: boolean;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
}

/**
 * A CarPlay-style puck: white disc, coloured glyph.
 *  - arrow, turned to the heading → moving
 *  - rounded square → standing still
 *  - hollow dot, faded, with its age → not live (showing the last known fix)
 * The small badge says which GPS feeds are live: truck, phone, or both.
 *
 * The arrow counter-rotates by `--map-bearing` (set on the map container by
 * the parent) so it keeps pointing the true heading while the map spins,
 * without re-rendering every marker on each rotate frame.
 */
function LiveUnitMarkerImpl({ unit, selected, dimmed, showLabel, onSelect, onHover }: Props) {
  const pos = unit.position!;
  const tone = TONE[unitTone(unit)];
  const offline = unit.motion === 'stale';
  const moving = unit.motion === 'moving' && pos.heading_deg != null;
  const labelled = showLabel || selected;

  return (
    <Marker
      longitude={pos.lng}
      latitude={pos.lat}
      anchor="top"
      offset={[0, -16]}
      style={{ zIndex: selected ? 30 : unit.motion === 'moving' ? 20 : 10 }}
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onSelect(unit.key);
      }}
    >
      <button
        type="button"
        aria-label={`${unitTitle(unit)} — ${tone.label}`}
        onMouseEnter={() => onHover(unit.key)}
        onMouseLeave={() => onHover(null)}
        className={cn(
          'group/marker relative flex flex-col items-center outline-none transition-[opacity,transform] duration-300',
          dimmed && 'opacity-35',
          selected && 'scale-110',
        )}
      >
        {selected && (
          <span className="absolute top-4 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-30" style={{ backgroundColor: tone.fill }} />
        )}
        <span
          className={cn(
            'relative flex size-8 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] ring-1 ring-black/5 transition-transform group-hover/marker:scale-110 dark:bg-slate-50',
            selected && 'ring-[3px]',
            offline && 'bg-white/80 shadow-[0_1px_4px_rgba(0,0,0,0.18)]',
          )}
          style={selected ? ({ '--tw-ring-color': tone.fill } as React.CSSProperties) : undefined}
        >
          {moving ? (
            <svg
              viewBox="0 0 24 24"
              className="size-[18px] transition-transform duration-500"
              style={{ transform: `rotate(calc(${pos.heading_deg}deg - var(--map-bearing, 0deg)))` }}
              aria-hidden
            >
              <path d="M12 2.5 19.5 20 12 16.2 4.5 20Z" fill={tone.fill} strokeLinejoin="round" />
            </svg>
          ) : offline ? (
            <span className="size-3 rounded-full border-[3px] border-slate-400 bg-transparent" />
          ) : (
            <span className="size-3 rounded-[4px]" style={{ backgroundColor: tone.fill }} />
          )}

          <FeedBadge feed={unit.feed} offline={offline} />
        </span>

        {labelled ? (
          <span
            className={cn(
              'mt-1 flex max-w-[140px] items-center gap-1 truncate rounded-md px-1.5 py-px font-mono text-[10px] font-semibold leading-4 shadow-sm ring-1 ring-black/5',
              'bg-white/95 text-slate-800 dark:bg-slate-900/90 dark:text-slate-100 dark:ring-white/10',
            )}
          >
            <span className="truncate">{unitTitle(unit)}</span>
            {offline && <span className="font-sans font-medium text-slate-400">· {shortAgo(pos.recorded_at)}</span>}
          </span>
        ) : offline ? (
          <span className="mt-0.5 rounded px-1 text-[9px] leading-3 font-medium text-slate-500 dark:text-slate-400">
            {shortAgo(pos.recorded_at)}
          </span>
        ) : null}
      </button>
    </Marker>
  );
}

function FeedBadge({ feed, offline }: { feed: LiveUnit['feed']; offline: boolean }) {
  if (offline || feed === 'none') return null;
  const cls = 'size-2.5';
  return (
    <span className="absolute -right-1.5 -bottom-1 flex items-center gap-px rounded-full bg-charcoal px-1 py-0.5 text-white ring-2 ring-white dark:bg-slate-800">
      {(feed === 'vehicle' || feed === 'both') && <Truck className={cls} strokeWidth={2.5} />}
      {(feed === 'driver' || feed === 'both') && <UserRound className={cls} strokeWidth={2.5} />}
    </span>
  );
}

export const LiveUnitMarker = memo(LiveUnitMarkerImpl);
