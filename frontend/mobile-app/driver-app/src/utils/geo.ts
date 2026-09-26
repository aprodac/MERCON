/**
 * Geographic and coordinate utilities for MERCON Mobile.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Validates whether a pair of coordinates represents a real, usable geographic point.
 * Explicitly rejects:
 * - non-numbers, NaN, Infinity
 * - (0, 0) "Null Island"
 * - Out-of-bounds latitude (< -90 or > 90)
 * - Out-of-bounds longitude (< -180 or > 180)
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Great-circle distance between two lat/lng points, in meters using Haversine formula.
 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) return 0;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
