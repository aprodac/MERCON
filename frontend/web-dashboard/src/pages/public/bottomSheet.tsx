import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * The phone layout of the tracking pages: the map on top, the white card below.
 * Dragging the card's handle up opens the card full screen (the map shrinks
 * away); dragging down — or tapping the handle — brings the map back.
 * On a wide screen the card floats beside the map and none of this applies
 * (the `md:` classes on the map box override the height).
 */
const DRAG_THRESHOLD_PX = 6;

export function useBottomSheet(mapFraction: number) {
  const [expanded, setExpanded] = useState(false);
  const [dragMapPx, setDragMapPx] = useState<number | null>(null);
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  // The live drag, in a ref: pointer events can arrive faster than React re-renders,
  // so the release must not read the position from an older render.
  const drag = useRef<{ y: number; mapPx: number; nowPx: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const collapsedPx = Math.round(viewportH * mapFraction);
  const restingPx = expanded ? 0 : collapsedPx;
  const mapPx = dragMapPx ?? restingPx;

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    drag.current = { y: e.clientY, mapPx: restingPx, nowPx: restingPx, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not a real pointer */ }
  }, [restingPx]);

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > DRAG_THRESHOLD_PX) d.moved = true;
    if (!d.moved) return;
    d.nowPx = Math.min(collapsedPx, Math.max(0, d.mapPx + dy));
    setDragMapPx(d.nowPx);
  }, [collapsedPx]);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // A tap toggles; a drag settles on whichever side it ended nearer.
    if (!d.moved) setExpanded((x) => !x);
    else setExpanded(d.nowPx < collapsedPx / 2);
    setDragMapPx(null);
  }, [collapsedPx]);

  return {
    expanded,
    /** For the map box: its phone height (overridden by `md:` classes on a wide screen). */
    mapBox: {
      className: cn('h-[var(--sheet-map-h)] md:h-auto', dragMapPx == null && 'transition-[height] duration-300 ease-out'),
      style: { '--sheet-map-h': `${mapPx}px` } as CSSProperties,
    },
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

/** The grab bar at the top of the card — a big enough target to drag or tap on a phone. */
export function SheetHandle({ handle, expanded, label }: {
  handle: ReturnType<typeof useBottomSheet>['handle'];
  expanded: boolean;
  label: string;
}) {
  return (
    <div
      {...handle}
      role="button"
      aria-label={label}
      aria-expanded={expanded}
      className="-mx-4 -mt-3 mb-1 flex h-7 cursor-grab touch-none items-center justify-center md:hidden"
    >
      <span className="h-1.5 w-11 rounded-full bg-slate-300" />
    </div>
  );
}
