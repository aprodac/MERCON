import type { LiveMediaStage } from '@/services/fleetLiveService';
import type { DriverUpdate, ExpiryItem } from '@/services/operatorInboxService';

const STAGE_PHRASE: Record<LiveMediaStage, string> = {
  loaded: 'Loaded at',
  arrived: 'Arrived at',
  stop: 'Stop at',
  delivered: 'Delivered at',
  delay: 'Delay on the way to',
  other: 'Photos from',
};

/** "TRP-0259 · Delivered at Medina" — the same wording the WhatsApp message uses. */
export function updateTitle(u: Pick<DriverUpdate, 'trip' | 'stop' | 'stage'>): string {
  const what = u.stop ? `${STAGE_PHRASE[u.stage]} ${u.stop.name}` : u.stage === 'delay' ? 'Delay reported' : 'Trip photos';
  return [u.trip.ref_id, what].filter(Boolean).join(' · ');
}

export function mediaCount(u: Pick<DriverUpdate, 'items'>): string {
  const videos = u.items.filter((i) => i.kind === 'video').length;
  const photos = u.items.length - videos;
  return [photos ? `${photos} photo${photos > 1 ? 's' : ''}` : '', videos ? `${videos} video${videos > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' + ');
}

export function shortAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** "Expired 3 days ago" / "Expires today" / "in 5 days". */
export function expiryPhrase(days: number): string {
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return 'Expired yesterday';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export type ExpiryBucket = 'expired' | 'week' | 'month';

export function expiryBucket(e: Pick<ExpiryItem, 'days'>): ExpiryBucket {
  return e.days < 0 ? 'expired' : e.days <= 7 ? 'week' : 'month';
}

export function reminderText(e: ExpiryItem): string {
  const when = e.days < 0 ? `expired on ${new Date(e.expiry_date).toLocaleDateString()}` : `expires on ${new Date(e.expiry_date).toLocaleDateString()}`;
  const whose = e.entity_type === 'Vehicle' ? `for truck ${e.entity_name}` : '';
  return `Hello ${e.contact?.name ?? ''}, your ${e.label} ${whose} ${when}. Please send the renewed document as soon as possible.`.replace(/\s+/g, ' ').trim();
}
