import { api } from '@/lib/api';
import {
  parseRawCoordinates,
  findGoogleMapsUrl,
  isGoogleMapsUrl,
  needsRemoteResolution,
  isShortMapsLink,
  extractCoordsFromExpandedUrl,
  extractPlaceQueryFromExpandedUrl,
  type ParsedMapsLink,
  type PastedLocationTarget,
} from '@mercon/shared-types';


/**
 * Recognize and decode a pasted Google Maps link so an operator can paste a
 * link straight into an address search box instead of re-typing the address.
 *
 * Two shapes exist:
 *  - Full links (maps.google.com/maps?q=..., google.com/maps/@lat,lng,...,
 *    google.com/maps/place/Name/@lat,lng,...) already carry the coordinates
 *    in the URL — parsed entirely client-side.
 *  - Short links (maps.app.goo.gl/..., goo.gl/maps/..., g.co/...) carry no
 *    coordinates at all; they only resolve after Google's redirect. A browser
 *    can't read a cross-origin redirect's target, so those go through the
 *    backend's `/geocoding/resolve-maps-link` endpoint, which follows the
 *    redirect server-side and hands back the expanded URL.
 *
 * Links are found as a *substring* of whatever was pasted, not by requiring
 * the whole field to be one clean URL — "Jubail HUB location
 * https://maps.app.goo.gl/xyz" (link copied alongside a label, a very common
 * way these get shared over WhatsApp/email) must still resolve.
 */


// The pure link reading lives in shared-types so the API can resolve pastes for
// the mobile apps with the exact same rules; re-exported for existing imports.
export {
  parseRawCoordinates,
  findGoogleMapsUrl,
  isGoogleMapsUrl,
  needsRemoteResolution,
  extractCoordsFromExpandedUrl,
  extractPlaceQueryFromExpandedUrl,
};
export type { ParsedMapsLink, PastedLocationTarget };

/**
 * Resolve anything a customer might have sent as a location — a Google Maps
 * link (full or short, anywhere in the pasted text) or a bare `lat, lng`
 * pair. Returns coordinates when the link carries them, a place name when it
 * only names somewhere, or null when the text holds no location at all.
 */
export async function resolvePastedLocation(
  text: string
): Promise<PastedLocationTarget | null> {
  const raw = parseRawCoordinates(text);
  if (raw) return { kind: 'coords', ...raw };

  const url = findGoogleMapsUrl(text);
  if (!url) return null;

  let expanded = url;
  if (isShortMapsLink(url)) {
    try {
      const { data } = await api.get<{ url: string }>('/geocoding/resolve-maps-link', {
        params: { url },
      });
      expanded = data.url;
    } catch (err) {
      console.warn('[googleMapsLink] failed to resolve short link', err);
      return null;
    }
  }

  const coords = extractCoordsFromExpandedUrl(expanded);
  if (coords) return { kind: 'coords', ...coords };

  const query = extractPlaceQueryFromExpandedUrl(expanded);
  return query ? { kind: 'place', query } : null;
}

/**
 * Resolve any pasted Google Maps link (full or short, anywhere in the pasted
 * text) to coordinates. Returns null if no Google Maps link is present, or
 * the link doesn't carry a resolvable pin — callers should tell the user
 * when a link they detected still comes back null, rather than fail silently.
 */
export async function resolveGoogleMapsLink(text: string): Promise<ParsedMapsLink | null> {
  const raw = parseRawCoordinates(text);
  if (raw) return raw;

  const url = findGoogleMapsUrl(text);
  if (!url) return null;

  if (!isShortMapsLink(url)) {
    return extractCoordsFromExpandedUrl(url);
  }

  try {
    const { data } = await api.get<{ url: string }>('/geocoding/resolve-maps-link', {
      params: { url },
    });
    return extractCoordsFromExpandedUrl(data.url);
  } catch (err) {
    console.warn('[googleMapsLink] failed to resolve short link', err);
    return null;
  }
}

/**
 * Extract city name from full address string or place name.
 */
export function extractCityFromAddress(address: string, name?: string): string {
  if (!address && !name) return '';
  const text = `${name || ''} ${address || ''}`;

  const saudiCities = [
    'Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Al Khobar', 'Dhahran',
    'Jubail', 'Al Jubail', 'Mecca', 'Makkah', 'Medina', 'Madinah',
    'Tabuk', 'Abha', 'Khamis Mushait', 'Buraidah', 'Unaizah', 'Hail',
    'Najran', 'Jizan', 'Gizan', 'Yanbu', 'Taif', 'Al Ahsa', 'Hofuf',
    'Rabigh', 'Neom', 'Ras Tanura', 'Al Kharj', 'Kharj'
  ];

  for (const city of saudiCities) {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(text)) {
      return city;
    }
  }

  // Fallback heuristic: split address by comma and inspect parts
  if (address) {
    const parts = address.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
    const filtered = parts.filter(
      (p) => !/Saudi Arabia|KSA|Province|Region|\d{5}/i.test(p)
    );
    if (filtered.length > 0) {
      return filtered[filtered.length - 1];
    }
  }

  return '';
}

export interface ParsedAddressFields {
  name: string;
  address: string;
  city: string;
  postalCode?: string;
  country?: string;
}

/**
 * Auto-allocate text address string (e.g. "الصناعية الثانية، Hail 55411, Saudi Arabia")
 * into structured location form fields: name, address, city, postalCode, country.
 */
export function parsePastedAddressText(text: string): ParsedAddressFields {
  const trimmed = text.trim();
  if (!trimmed) {
    return { name: '', address: '', city: '' };
  }

  // If text is a Google Maps link or raw URL, never treat URL string as location name, address, or city
  if (isGoogleMapsUrl(trimmed) || /^https?:\/\//i.test(trimmed) || findGoogleMapsUrl(trimmed)) {
    return { name: '', address: '', city: '' };
  }

  // Extract 5-digit postal code if present (e.g., 55411)
  const postalCodeMatch = trimmed.match(/\b\d{5}\b/);
  const postalCode = postalCodeMatch ? postalCodeMatch[0] : '';

  // Extract city using existing extractCityFromAddress
  const city = extractCityFromAddress(trimmed);

  // Extract country if present
  let country = '';
  if (/Saudi Arabia|KSA|المملكة العربية السعودية/i.test(trimmed)) {
    country = 'Saudi Arabia';
  }

  // Extract location name from first comma-separated segment (English ',' or Arabic '،')
  const commaParts = trimmed.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
  let name = trimmed;
  if (commaParts.length > 1) {
    name = commaParts[0];
  } else if (trimmed.length > 40) {
    name = trimmed.substring(0, 40) + '...';
  }

  return {
    name,
    address: trimmed,
    city,
    postalCode,
    country,
  };
}
