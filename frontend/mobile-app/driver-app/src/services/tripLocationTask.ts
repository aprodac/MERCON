/**
 * Trip GPS that keeps going when the driver leaves the app.
 *
 * While a trip is under way the phone shares its position every ~15 s — also
 * when the driver switches to Google Maps (the app's own "Open navigation app"
 * button sends them there) or locks the screen. Before this, GPS came from a
 * foreground-only watch and stopped the moment the app left the screen.
 *
 * How: expo-location's location task, run as an Android *foreground service*
 * (a permanent "MERCON is sharing your trip location" notification). Started
 * while the app is on screen, that counts as "while in use" — it needs only the
 * normal location permission, not "Allow all the time", so no background-
 * location declaration in Play Console. iOS: same permission plus the
 * `location` background mode (blue location pill while away from the app).
 *
 * No signal: points are kept in a small file queue and sent oldest-first the
 * next time a send succeeds, so a highway dead zone becomes a gap in time,
 * not a hole in the trip's path.
 *
 * `defineTask` must run at app start (also when the OS wakes the app only for
 * this task), so this module is imported from `index.js` before the router.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { tripService } from '@mercon/mobile-shared/lib/trips';

export const TRIP_LOCATION_TASK = 'mercon-trip-location';
const ACTIVE_TRIP_KEY = 'tracking_trip_id';
const QUEUE_FILE = 'trip-location-queue.json';
/** Oldest points are dropped beyond this (~4 h of driving at one point per 15 s). */
const MAX_QUEUED = 1000;
const UPDATE_INTERVAL_MS = 15_000;
const MIN_DISTANCE_M = 10;

type TaskManagerModule = typeof import('expo-task-manager');
type FileSystemModule = typeof import('expo-file-system/legacy');

// Native modules are absent on web (and in an old dev client); everything
// below degrades to "not available" instead of crashing the app.
let TaskManager: TaskManagerModule | null = null;
let FileSystem: FileSystemModule | null = null;
if (Platform.OS !== 'web') {
  try { TaskManager = require('expo-task-manager'); } catch { TaskManager = null; }
  try { FileSystem = require('expo-file-system/legacy'); } catch { FileSystem = null; }
}

export function isBackgroundTrackingAvailable(): boolean {
  return !!TaskManager && typeof TaskManager.defineTask === 'function';
}

interface QueuedPoint {
  tripId: string;
  latitude: number;
  longitude: number;
  speed_kph: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  recorded_at: string;
}

const queuePath = () => (FileSystem?.documentDirectory ? `${FileSystem.documentDirectory}${QUEUE_FILE}` : null);

async function readQueue(): Promise<QueuedPoint[]> {
  const path = queuePath();
  if (!path || !FileSystem) return [];
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(points: QueuedPoint[]): Promise<void> {
  const path = queuePath();
  if (!path || !FileSystem) return;
  try {
    if (points.length === 0) await FileSystem.deleteAsync(path, { idempotent: true });
    else await FileSystem.writeAsStringAsync(path, JSON.stringify(points.slice(-MAX_QUEUED)));
  } catch {
    // Storage full or unavailable: live points still go out, only the backlog is lost.
  }
}

function toPoint(tripId: string, loc: Location.LocationObject): QueuedPoint {
  const { latitude, longitude, speed, heading, accuracy } = loc.coords;
  return {
    tripId,
    latitude,
    longitude,
    speed_kph: speed != null && speed >= 0 ? Math.round(speed * 3.6) : null,
    heading_deg: heading != null && heading >= 0 ? Math.round(heading) : null,
    accuracy_m: accuracy != null && accuracy >= 0 ? Math.round(accuracy) : null,
    recorded_at: new Date(loc.timestamp).toISOString(),
  };
}

/**
 * Whether this app run started the service itself. A task registered in an
 * earlier run is restored by the OS when the app starts — before the app is on
 * screen, so Android brings it back WITHOUT its foreground service (no
 * notification, location throttled to a few fixes an hour). "Already running"
 * from a previous run is therefore not trusted: the first start of each run
 * restarts it properly. Seen on Android after the app was closed mid-trip.
 */
let startedThisRun = false;

/** One task run at a time: a second batch waits instead of sending the queue twice. */
let sending: Promise<void> = Promise.resolve();

/**
 * Sends queued points (oldest first) followed by the new ones; whatever does
 * not go out stays queued. Stops at the first failure — no point hammering a
 * dead connection — and leaves the rest for the next run.
 */
function sendPoints(fresh: QueuedPoint[]): Promise<void> {
  sending = sending.then(async () => {
    const pending = [...(await readQueue()), ...fresh];
    let sent = 0;
    for (const p of pending) {
      const { tripId, ...body } = p;
      try {
        await tripService.postLocation(tripId, body);
        sent++;
      } catch (err: any) {
        const status = err?.response?.status;
        // 4xx: the server will never take this point (trip finished, not this
        // driver's, bad fix) — drop it rather than retry it forever.
        if (status >= 400 && status < 500) { sent++; continue; }
        break;
      }
    }
    await writeQueue(pending.slice(sent));
  }).catch(() => {});
  return sending;
}

if (isBackgroundTrackingAvailable()) {
  TaskManager!.defineTask(TRIP_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;
    const tripId = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
    if (!tripId) return;
    await sendPoints(locations.map((l) => toPoint(tripId, l)));
  });
}

/**
 * Starts (or keeps) sharing location for `tripId`. Must be called while the
 * app is on screen — Android refuses to start the service from the
 * background. Returns false when it could not start (no permission, app in
 * background, web); the caller simply tries again next time the app opens.
 */
export async function startTripTracking(tripId: string): Promise<boolean> {
  if (!isBackgroundTrackingAvailable()) return false;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return false;

    const current = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
    const running = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => false);
    if (running && startedThisRun) {
      // Same service; a new trip only changes which trip it reports for.
      if (current !== tripId) await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, tripId);
      return true;
    }

    await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, tripId);
    // Restored from an earlier run (see startedThisRun): restart it while on screen.
    if (running) await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => {});

    await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: UPDATE_INTERVAL_MS,
      distanceInterval: MIN_DISTANCE_M,
      deferredUpdatesInterval: UPDATE_INTERVAL_MS,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'MERCON is sharing your trip location',
        notificationBody: 'Your operator can see where you are until you finish the trip.',
        notificationColor: '#FA634E',
        killServiceOnDestroy: false,
      },
    });
    startedThisRun = true;
    return true;
  } catch (err) {
    console.warn('[TripLocation] Could not start trip tracking:', err);
    return false;
  }
}

/** Stops sharing location (trip finished, cancelled, reassigned, or logout). */
export async function stopTripTracking(): Promise<void> {
  if (!isBackgroundTrackingAvailable()) return;
  startedThisRun = false;
  try {
    await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => false)) {
      await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
    }
  } catch (err) {
    console.warn('[TripLocation] Could not stop trip tracking:', err);
  }
  // Last chance for points collected in a dead zone just before the trip ended.
  await sendPoints([]);
}
