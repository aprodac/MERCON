import { useEffect, useMemo, useState } from 'react';
import { createAddressSearchSession } from '@/services/addressSearch';
import { lookupCity, parsePlaceQuery, type Place } from '@/lib/placeSearch';

export type PlaceSearch =
  | { kind: 'text' }
  | { kind: 'near'; status: 'loading' | 'ready' | 'not_found'; text: string; place: Place | null }
  | { kind: 'route'; status: 'loading' | 'ready' | 'not_found'; fromText: string; toText: string; from: Place | null; to: Place | null };

/** Geocoded places survive re-renders and repeat searches for the whole visit. */
const geocodeCache = new Map<string, Place | null>();
const GEOCODE_DEBOUNCE_MS = 450;

async function geocode(text: string): Promise<Place | null> {
  const key = text.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const session = createAddressSearchSession();
    const [first] = await session.search(text);
    const hit = first ? await session.resolve(first.id) : null;
    const place: Place | null = hit ? { label: hit.name || text, lat: hit.lat, lng: hit.lng, kind: 'address' } : null;
    geocodeCache.set(key, place);
    return place;
  } catch {
    return null;
  }
}

/**
 * Turns the search box into places. Known Saudi cities resolve instantly;
 * anything else ("Jubail port", a district) is geocoded after a short pause,
 * and only when the query is clearly about places ("near …", "… to …").
 */
export function usePlaceSearch(query: string): PlaceSearch {
  const parsed = useMemo(() => parsePlaceQuery(query), [query]);
  const texts = parsed.kind === 'near' ? [parsed.place] : parsed.kind === 'route' ? [parsed.from, parsed.to] : [];
  const textsKey = texts.join('\u0000');
  // undefined = not known yet (needs geocoding); null = looked up, not found.
  const instant = useMemo(
    () => (textsKey ? textsKey.split('\u0000').map((t) => lookupCity(t) ?? geocodeCache.get(t.trim().toLowerCase())) : []),
    [textsKey],
  );
  const [looked, setLooked] = useState<{ key: string; places: (Place | null)[] } | null>(null);

  const needsGeocode = instant.some((p) => p === undefined);
  useEffect(() => {
    if (!needsGeocode) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const places = await Promise.all(textsKey.split('\u0000').map((x, i) => (instant[i] !== undefined ? instant[i]! : geocode(x))));
      if (!cancelled) setLooked({ key: textsKey, places });
    }, GEOCODE_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [textsKey, needsGeocode, instant]);

  return useMemo<PlaceSearch>(() => {
    if (parsed.kind === 'text') return { kind: 'text' };
    const places = needsGeocode ? (looked?.key === textsKey ? looked.places : null) : (instant as (Place | null)[]);
    const status = !places ? 'loading' : places.every(Boolean) ? 'ready' : 'not_found';
    if (parsed.kind === 'near') return { kind: 'near', status, text: parsed.place, place: places?.[0] ?? null };
    return { kind: 'route', status, fromText: parsed.from, toText: parsed.to, from: places?.[0] ?? null, to: places?.[1] ?? null };
  }, [parsed, needsGeocode, looked, textsKey, instant]);
}
