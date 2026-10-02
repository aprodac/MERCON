import { forwardRef, useCallback, useEffect, useState, type ReactNode } from 'react';
import MapGL, { type MapProps, type MapRef } from 'react-map-gl/maplibre';
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Info } from 'lucide-react';
import { LIVE_MAP_STYLES, applyMapPalette, loadLiveMapStyle } from '@/components/maps/live/liveMapStyle';

/**
 * The map under the customer tracking pages, built to load smoothly on a phone:
 * - the basemap style is fetched as soon as this file loads, alongside the
 *   tracking data, with our colours already baked in (no stock-colour flash);
 * - the map fades in once its first tiles are drawn, over a plain background
 *   in the map's own paper colour, so the customer never sees half-drawn tiles;
 * - drawn at most 2× pixel density — sharp on a phone, half the work of 3×;
 * - the map credit is a small ⓘ that opens on tap instead of a line of text.
 */
const PAPER = '#f6f4ef';
// The longest the map stays hidden waiting for tiles; after that it shows with what it has.
const REVEAL_FALLBACK_MS = 2500;

const stylePromise = loadLiveMapStyle('light');

function useBasemapStyle(): StyleSpecification | string | null {
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  useEffect(() => {
    let live = true;
    // On a failed fetch, hand MapLibre the URL and recolour after load instead.
    stylePromise.then(
      (s) => { if (live) setStyle(s); },
      () => { if (live) setStyle(LIVE_MAP_STYLES.light); },
    );
    return () => { live = false; };
  }, []);
  return style;
}

type PublicMapProps = Omit<MapProps, 'mapStyle'> & {
  children?: ReactNode;
  /** Buttons stacked above the map credit in the bottom corner. */
  controls?: ReactNode;
};

export const PublicMap = forwardRef<MapRef, PublicMapProps>(function PublicMap({ children, controls, onLoad, ...props }, ref) {
  const style = useBasemapStyle();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), REVEAL_FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);

  const handleLoad = useCallback((e: { target: MapLibreMap }) => {
    if (typeof style === 'string') applyMapPalette(e.target, 'light');
    setShown(true);
    onLoad?.(e as Parameters<NonNullable<MapProps['onLoad']>>[0]);
  }, [style, onLoad]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: PAPER }}>
      {!shown && <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent via-white/40 to-transparent" />}
      {style && (
        <MapGL
          ref={ref}
          mapStyle={style}
          minZoom={3.5}
          maxZoom={18}
          dragRotate={false}
          pitchWithRotate={false}
          attributionControl={false}
          pixelRatio={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)}
          {...props}
          onLoad={handleLoad}
          style={{ width: '100%', height: '100%', opacity: shown ? 1 : 0, transition: 'opacity 350ms ease-out' }}
        >
          {children}
        </MapGL>
      )}
      <div className="pointer-events-none absolute end-3 bottom-8 flex flex-col items-end gap-2 md:bottom-4">
        {controls}
        <MapCredit />
      </div>
    </div>
  );
});

/** The map data credit, folded into an ⓘ — open on tap. */
function MapCredit() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto flex items-center gap-1" dir="ltr">
      {open && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm"
        >
          © OpenStreetMap
        </a>
      )}
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-label="Map credits"
        aria-expanded={open}
        className="flex size-6 items-center justify-center rounded-full bg-white/70 text-slate-400"
      >
        <Info className="size-3.5" />
      </button>
    </div>
  );
}
