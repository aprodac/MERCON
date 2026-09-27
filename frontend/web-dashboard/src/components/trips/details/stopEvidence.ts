import { resolveFileUrl } from '@/lib/documents';
import type { LiveMediaItem, LiveMediaStage } from '@/services/fleetLiveService';
import type { LightboxPhotoItem } from '@/components/trips/EvidenceLightboxModal';

export const STAGE_LABEL: Record<LiveMediaStage, string> = {
  loaded: 'Loaded',
  arrived: 'Arrived',
  stop: 'Stop',
  delivered: 'Delivered',
  delay: 'Delay',
  other: 'Photos',
};

interface StopLike {
  id: string;
  actual_arrival: string | null;
  actual_departure: string | null;
}

/** Only a real position from the driver's phone — never a guess. */
export function realGeotag(doc: any): LightboxPhotoItem['geotag'] | undefined {
  const gps = doc?.ai_extracted_json?.gps;
  let lat = Number(gps?.latitude);
  let lng = Number(gps?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const m = typeof doc?.ocr_raw_text === 'string' ? doc.ocr_raw_text.match(/GPS:\s*([0-9.-]+),\s*([0-9.-]+)/i) : null;
    lat = m ? parseFloat(m[1]) : NaN;
    lng = m ? parseFloat(m[2]) : NaN;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;
  return { latitude: lat, longitude: lng, timestamp: gps?.captured_at ?? doc?.createdAt ?? null };
}

/** What the AI read from an external-app screenshot, so the operator sees why it was accepted or not. */
export function aiVerificationOf(doc: any): LightboxPhotoItem['aiVerification'] | undefined {
  const x = doc?.ai_extracted_json;
  if (!x?.detected_event_type) return undefined;
  return {
    eventType: x.detected_event_type,
    confidence: typeof x.confidence === 'number' ? x.confidence : null,
    isWrongTrip: Boolean(x.is_wrong_trip),
    validationReason: x.validation_reason || null,
    docStatus: doc?.status || null,
  };
}

/**
 * A pending external-app screenshot: the driver's tap advanced the trip with
 * "now" as a provisional time, and the operator confirms or corrects it.
 */
export function timeReviewOf(doc: any, stop: StopLike | undefined): LightboxPhotoItem['timeReview'] | undefined {
  if (doc?.ai_extracted_json?.source !== 'external_app_screenshot' || doc?.status !== 'PendingReview') return undefined;
  return {
    documentId: doc.id,
    stopId: stop?.id || doc?.ai_extracted_json?.stop_id || null,
    recordedArrival: stop?.actual_arrival || null,
    recordedDeparture: stop?.actual_departure || null,
  };
}

/** Turns a stop's media into the evidence viewer's items, enriched from the trip's documents. */
export function toLightboxItems(
  items: LiveMediaItem[],
  docsById: Map<string, any>,
  stop: StopLike | undefined,
  stopName: string,
  formatTime: (iso: string) => string,
): LightboxPhotoItem[] {
  return items.map((m) => {
    const doc = docsById.get(m.id);
    return {
      id: m.id,
      url: resolveFileUrl(m.url),
      title: m.kind === 'video' ? (m.stage === 'delay' ? 'Delay video' : `${STAGE_LABEL[m.stage]} video`) : `${STAGE_LABEL[m.stage]} photo`,
      time: formatTime(m.captured_at),
      location: stopName,
      status: 'Received',
      isVideo: m.kind === 'video',
      isDelayEvidence: m.stage === 'delay',
      aiVerification: aiVerificationOf(doc),
      timeReview: timeReviewOf(doc, stop),
      geotag: realGeotag(doc),
    };
  });
}

/** Minutes late against the plan (negative = early); null when either time is missing. */
export function minutesLate(planned: string | null, actual: string | null): number | null {
  if (!planned || !actual) return null;
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000);
}
