/**
 * Reading a pasted Google Maps link or a bare "lat, lng" pair — pure string
 * work shared by the web dashboard and the API (which resolves pastes for the
 * mobile apps, whose URL support is too thin to do it on the phone).
 *
 * Short links (maps.app.goo.gl/...) carry no coordinates until Google's
 * redirect is followed, which only the server can do; callers expand those
 * first and then read the expanded URL with `extractCoordsFromExpandedUrl`.
 */

export interface ParsedMapsLink {
  lat: number;
  lng: number;
}

const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

/**
 * Any Google country domain, not just google.com — a phone set to Saudi
 * Arabia shares `google.com.sa` / `maps.google.com.sa` links, which is the
 * form most customer-sent pins actually arrive in here. Anchored at both ends
 * and capped at two suffix parts so `google.com.evil.com` cannot match.
 */
const GOOGLE_HOST_RE = /^(maps\.)?google(\.[a-z]{2,3}){1,2}$/;

function isValidCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isMapsHost(host: string): boolean {
  return SHORT_LINK_HOSTS.has(host) || GOOGLE_HOST_RE.test(host);
}

/**
 * A bare `lat, lng` pair pasted with no link around it — the other common way
 * a customer sends a pin, especially forwarded out of a chat app.
 *
 * Both numbers must carry a decimal point. Real shared coordinates always do,
 * and requiring it keeps ordinary address text ("Gate 5, 12") from being read
 * as a location.
 */
export function parseRawCoordinates(text: string): ParsedMapsLink | null {
  const m = text.trim().match(/^\(?\s*(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)\s*\)?$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return isValidCoords(lat, lng) ? { lat, lng } : null;
}

/**
 * Pull the first Google Maps link out of arbitrary pasted text, normalized
 * to include a scheme. Handles a bare `https://...` URL, a URL buried inside
 * a longer sentence, and a protocol-less link (some paste sources drop it).
 */
export function findGoogleMapsUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Scheme-prefixed URL anywhere in the text.
  const withScheme = trimmed.match(/https?:\/\/[^\s]+/gi);
  if (withScheme) {
    for (const raw of withScheme) {
      const cleaned = raw.replace(/[),.;]+$/, '');
      const host = hostOf(cleaned);
      if (host && isMapsHost(host)) return cleaned;
    }
  }

  // Bare short link with no scheme, e.g. "maps.app.goo.gl/PxkXa9omWQyTzz7R6".
  const bare = trimmed.match(/\b(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co)\/\S+/gi);
  if (bare) {
    const cleaned = bare[0].replace(/[),.;]+$/, '');
    return `https://${cleaned}`;
  }

  return null;
}

/**
 * True if the pasted text holds a location we can resolve — a Google Maps
 * link (short or full) or a bare `lat, lng` pair.
 */
export function isGoogleMapsUrl(text: string): boolean {
  return findGoogleMapsUrl(text) !== null || parseRawCoordinates(text) !== null;
}

/**
 * Whether resolving this paste needs the backend round trip. Callers use it to
 * decide if the wait is worth announcing — a full link or a raw coordinate
 * pair resolves synchronously and needs no "expanding…" state at all.
 */
export function needsRemoteResolution(text: string): boolean {
  if (parseRawCoordinates(text)) return false;
  const url = findGoogleMapsUrl(text);
  if (!url) return false;
  const host = hostOf(url);
  return !!host && SHORT_LINK_HOSTS.has(host);
}

export function isShortMapsLink(url: string): boolean {
  const host = hostOf(url);
  return !!host && SHORT_LINK_HOSTS.has(host);
}

/** Pull `lat,lng` out of a full (already-expanded) Google Maps URL, or null. */
export function extractCoordsFromExpandedUrl(rawUrl: string): ParsedMapsLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // https://maps.google.com/maps?q=26.39,50.15&z=17  (and the plain q=lat,lng form)
  const q = url.searchParams.get('q');
  if (q) {
    const m = q.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoords(lat, lng)) return { lat, lng };
    }
  }

  // https://www.google.com/maps/ll=26.39,50.15
  const ll = url.searchParams.get('ll');
  if (ll) {
    const m = ll.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoords(lat, lng)) return { lat, lng };
    }
  }

  // !3d<lat>!4d<lng> on /maps/place/ links — checked before `@` because these
  // are the *pin's* coordinates while `@` is only the map viewport centre.
  // On an expanded short link the two differ by a few hundred metres, which on
  // a delivery stop is the difference between the gate and the road outside.
  const dataMatch = rawUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lng = parseFloat(dataMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng };
  }

  // https://www.google.com/maps/@26.39,50.15,17z or /place/Name/@26.39,50.15,17z
  const atMatch = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng };
  }

  return null;
}

/**
 * What a paste pointed at. Links shared from the Google Maps *app* (the
 * `g_st=ipc` form) expand to a URL carrying only the place's name and a
 * feature id — no coordinates in any of the shapes above — so a pasted
 * location cannot always be reduced to a lat/lng on its own. Those come back
 * as a `place` for the caller to look up by name.
 */
export type PastedLocationTarget =
  | { kind: 'coords'; lat: number; lng: number }
  | { kind: 'place'; query: string };

/**
 * The human-readable place a coordinate-less Maps URL points at, taken from
 * `?q=` or from the `/maps/place/<Name>/` path segment.
 */
export function extractPlaceQueryFromExpandedUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const q = url.searchParams.get('q');
  // A `q` holding coordinates is handled as coordinates, not as a name.
  if (q && !/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(q.trim())) {
    return q.trim();
  }

  const placeSegment = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (placeSegment) {
    const name = decodeURIComponent(placeSegment[1].replace(/\+/g, ' ')).trim();
    // `/place/26°59'47.6"N+49°37'27.4"E` is a coordinate readout, not a name.
    if (name && !/^\d+°/.test(name)) return name;
  }

  return null;
}
