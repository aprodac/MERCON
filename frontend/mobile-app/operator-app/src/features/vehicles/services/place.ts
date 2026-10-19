/** Where a truck is, in words: the nearest known city. Never invents a street address. */
import { SAUDI_CITY_COORDS } from '../../trips/services/travelTimeService';
import { haversineKm } from '../../trips/details/tripDetailsModel';
import { niceName } from '../../trips/create/components/ui';

/** The nearest known city and how far it is. */
export function nearestCityWithin(lat: number, lng: number): { name: string; km: number } | null {
  let best: { name: string; km: number } | null = null;
  const seen = new Set<string>();
  for (const [key, [clat, clng]] of Object.entries(SAUDI_CITY_COORDS)) {
    const id = `${clat},${clng}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const km = haversineKm({ lat, lng }, { lat: clat, lng: clng });
    if (!best || km < best.km) best = { name: niceName(key.replace(/_/g, ' ')), km };
  }
  return best;
}

/** "Near Riyadh" within 80 km — used for the short map pill. */
export function nearestCity(lat: number, lng: number): string | null {
  const c = nearestCityWithin(lat, lng);
  return c && c.km <= 80 ? c.name : null;
}

/** "Near Riyadh", "120 km from Taif", or the coordinates when no city is known. */
export function placeText(lat: number, lng: number): string {
  const city = nearestCityWithin(lat, lng);
  if (!city) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return city.km <= 80 ? `Near ${city.name}` : `${Math.round(city.km / 10) * 10} km from ${city.name}`;
}
