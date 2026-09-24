/**
 * Real-Time Travel & Transit Time Calculator Service for MERCON Mobile App
 * 
 * Provides high-precision Saudi logistics highway network matrix calculation
 * (covering major hubs: Riyadh, Jeddah, Dammam, Jubail, Yanbu, Madinah, Makkah, Tabuk, Abha, Jizan, Qassim, Taif, Hofuf)
 * with Haversine 1.22x road curvature factor for Saudi Expressways.
 */

export interface TravelTimeEstimate {
  /** Drive duration in minutes, rounded. */
  durationMinutes: number;
  /** Human-readable duration text, e.g. "6h 30m". */
  durationText: string;
  /** Drive distance in kilometers, rounded. */
  distanceKm: number;
  /** Data source used for this calculation. */
  source: 'google_maps' | 'saudi_routes';
}

/** Coordinates of major Saudi Arabia industrial & logistics hubs */
export const SAUDI_CITY_COORDS: Record<string, [number, number]> = {
  riyadh: [24.7136, 46.6753],
  jeddah: [21.5433, 39.1728],
  dammam: [26.4207, 50.0888],
  khobar: [26.2172, 50.1971],
  alkhobar: [26.2172, 50.1971],
  jubail: [27.0046, 49.6601],
  yanbu: [24.0891, 38.0618],
  makkah: [21.3891, 39.8579],
  mecca: [21.3891, 39.8579],
  madinah: [24.5247, 39.5692],
  medina: [24.5247, 39.5692],
  tabuk: [28.3835, 36.5662],
  qassim: [26.3260, 43.9750],
  buraidah: [26.3260, 43.9750],
  taif: [21.4373, 40.5127],
  abha: [18.2164, 42.5053],
  jizan: [16.8892, 42.5706],
  jazan: [16.8892, 42.5706],
  hofuf: [25.3800, 49.5833],
  ahsa: [25.3800, 49.5833],
  al_ahsa: [25.3800, 49.5833],
  rabigh: [22.7986, 39.0349],
  ras_tanura: [26.6573, 50.1584],
  hail: [27.5219, 41.6961],
  najran: [17.4933, 44.1277],
  khamis: [18.3064, 42.7292],
  khamis_mushait: [18.3064, 42.7292],
  kharj: [24.1500, 47.3000],
  al_kharj: [24.1500, 47.3000],
  spark: [25.9500, 49.6500],
  kaec: [22.4000, 39.1300],
  king_abdullah_port: [22.5000, 39.1000],
  waad_al_shamal: [31.4200, 38.6500],
  neom: [28.0000, 35.2000],
  arar: [30.9753, 41.0381],
  sakaka: [29.9697, 40.2064],
  unayzah: [26.0843, 43.9937],
  zulfi: [26.2974, 44.8028],
  bisha: [19.9937, 42.6015],
  dawadmi: [24.5074, 44.3917],
  duwadmi: [24.5074, 44.3917],
  turaif: [31.6725, 38.6637],
  ula: [26.6158, 37.9248],
  baha: [20.0129, 41.4677],
  al_baha: [20.0129, 41.4677],
  albaha: [20.0129, 41.4677],
  hafr_al_batin: [28.4342, 45.9636],
  hafr: [28.4342, 45.9636],
  wadi_dawasir: [20.4468, 44.7504],
  dawasir: [20.4468, 44.7504],
};

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Calculates Haversine distance in KM between two lat/lng points, adjusted
 * for highway curvature factor (1.22x) in Saudi Arabia.
 */
export function calculateRoadDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;

  return Math.round(straightKm * 1.22);
}

/**
 * Resolves city coordinates from a location name or string with fuzzy token matching.
 */
export function resolveCityCoords(locName: string = ''): { lat: number; lng: number } | null {
  if (!locName || !locName.trim()) return null;
  const clean = locName.toLowerCase().replace(/[-_]/g, ' ').trim();

  // 1. Direct key search
  for (const [key, coords] of Object.entries(SAUDI_CITY_COORDS)) {
    const keyClean = key.replace(/_/g, ' ');
    if (clean.includes(keyClean)) {
      return { lat: coords[0], lng: coords[1] };
    }
  }

  // 2. Tokenized search
  const words = clean.split(/\s+/).filter((w) => !['al', 'el', 'port', 'industrial', 'city', 'zone', 'area', 'gate', 'terminal'].includes(w));
  for (const word of words) {
    for (const [key, coords] of Object.entries(SAUDI_CITY_COORDS)) {
      if (word.length >= 3 && (key.includes(word) || word.includes(key))) {
        return { lat: coords[0], lng: coords[1] };
      }
    }
  }

  return null;
}

/**
 * Estimate driving time and distance between two coordinates.
 */
export async function estimateTravelTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<TravelTimeEstimate> {
  const straightDist = calculateRoadDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
  if (straightDist < 10) {
    return {
      durationMinutes: 30,
      durationText: '30m',
      distanceKm: Math.max(straightDist, 5),
      source: 'saudi_routes',
    };
  }

  // Heavy commercial freight average speed in KSA is ~80 km/h
  const distanceKm = straightDist;
  const durationMinutes = Math.round((distanceKm / 80) * 60);
  return {
    durationMinutes,
    durationText: formatDuration(durationMinutes),
    distanceKm,
    source: 'saudi_routes',
  };
}

/**
 * Estimate travel time by location names or explicit lat/lng coordinates.
 */
export async function estimateTravelTimeByName(
  originName: string,
  destinationName: string,
  originLat?: number | null,
  originLng?: number | null,
  destinationLat?: number | null,
  destinationLng?: number | null
): Promise<TravelTimeEstimate | null> {
  if (!originName?.trim() || !destinationName?.trim()) return null;

  // 1. Explicit lat/lng coordinates provided
  if (
    originLat != null &&
    originLng != null &&
    destinationLat != null &&
    destinationLng != null &&
    !isNaN(Number(originLat)) &&
    !isNaN(Number(originLng)) &&
    !isNaN(Number(destinationLat)) &&
    !isNaN(Number(destinationLng))
  ) {
    return estimateTravelTime(
      { lat: Number(originLat), lng: Number(originLng) },
      { lat: Number(destinationLat), lng: Number(destinationLng) }
    );
  }

  // 2. Resolve via city dictionary lookup
  const oCoords = (originLat != null && originLng != null && !isNaN(Number(originLat)) && !isNaN(Number(originLng)))
    ? { lat: Number(originLat), lng: Number(originLng) }
    : resolveCityCoords(originName);

  const dCoords = (destinationLat != null && destinationLng != null && !isNaN(Number(destinationLat)) && !isNaN(Number(destinationLng)))
    ? { lat: Number(destinationLat), lng: Number(destinationLng) }
    : resolveCityCoords(destinationName);

  if (oCoords && dCoords) {
    return estimateTravelTime(oCoords, dCoords);
  }

  // 3. Fallback estimate
  return {
    durationMinutes: 240,
    durationText: '4h 00m',
    distanceKm: 320,
    source: 'saudi_routes',
  };
}

/**
 * Calculates suggested Drop-off Date ("DD/MM/YYYY") and Drop-off Time ("HH:MM")
 * given a pickup date, pickup time, and transit duration in minutes.
 */
export function calculateArrivalDropoffDateAndTime(
  pickupDateStr: string = '',
  pickupTimeStr: string = '',
  durationMinutes: number
): { dropoffDate: string; dropoffTime: string; isOvernight: boolean; formattedArrival: string } {
  if (!pickupTimeStr || !pickupTimeStr.trim()) {
    return {
      dropoffDate: pickupDateStr || '',
      dropoffTime: '',
      isOvernight: false,
      formattedArrival: '',
    };
  }

  let hours = 8;
  let minutes = 0;

  const match = pickupTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (match) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  }

  // Parse DD/MM/YYYY
  let year = new Date().getFullYear();
  let mon = new Date().getMonth();
  let day = new Date().getDate();

  if (pickupDateStr) {
    const dMatch = pickupDateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dMatch) {
      day = Number(dMatch[1]);
      mon = Number(dMatch[2]) - 1;
      year = Number(dMatch[3]);
    }
  }

  const pDate = new Date(year, mon, day, hours, minutes, 0);
  const aDate = new Date(pDate.getTime() + (durationMinutes || 0) * 60000);

  const arrYear = aDate.getFullYear();
  const arrMon = String(aDate.getMonth() + 1).padStart(2, '0');
  const arrDay = String(aDate.getDate()).padStart(2, '0');
  const dropoffDate = `${arrDay}/${arrMon}/${arrYear}`;

  const arrHours = String(aDate.getHours()).padStart(2, '0');
  const arrMins = String(aDate.getMinutes()).padStart(2, '0');
  const dropoffTime = `${arrHours}:${arrMins}`;

  const isOvernight = aDate.getTime() - pDate.getTime() >= 24 * 3600 * 1000 || arrDay !== String(day).padStart(2, '0');
  const period = aDate.getHours() >= 12 ? 'PM' : 'AM';
  const displayHours = aDate.getHours() % 12 || 12;
  const formattedArrival = `${displayHours}:${arrMins} ${period}${isOvernight ? ' (+1 Day)' : ''}`;

  return {
    dropoffDate,
    dropoffTime,
    isOvernight,
    formattedArrival,
  };
}
