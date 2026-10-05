/**
 * The assignment message for several trips made by one Create Trip (a monthly
 * roster, rotating drivers): one numbered message for all of them, or one
 * message per trip. Each block is the single-trip message, renumbered, with
 * the trip's date when the trips fall on different days. The customer's
 * all-trucks page (every day of the roster — live, due, delivered — on one
 * bookmarkable link) goes on top, as in every multi-trip message of the shared
 * format (@mercon/shared-types statusMessage), so WhatsApp previews it.
 */
import { operatorService, type OperatorTripDetail } from '../../../lib/operator';
import { customerDetailApi } from '../../customers/details/customerDetailApi';
import { allTrucksLine } from '@mercon/shared-types';
import { quickMessage, withTag, type Formatters, type TagPerson } from './tripDetailsModel';

export interface BatchItem {
  trip: OperatorTripDetail;
  trackingUrl: string | null;
}

export interface Batch {
  items: BatchItem[];
  /** The customer's all-trucks page — only when the trips' links go in messages. */
  customerUrl: string | null;
}

/** The trips, their tracking links and the customer's all-trucks page (only for customers who want links in messages). */
export async function loadBatch(ids: string[]): Promise<Batch> {
  const [trips, links] = await Promise.all([
    Promise.all(ids.map((id) => operatorService.tripById(id))),
    operatorService.trackingLinks(ids).catch(() => ({}) as Awaited<ReturnType<typeof operatorService.trackingLinks>>),
  ]);
  const order = (t: OperatorTripDetail) => (t.planned_start ? new Date(t.planned_start).getTime() : 0);
  const items = trips
    .map((trip) => {
      const l = links[trip.id];
      return { trip, trackingUrl: l?.enabled && l.auto_link ? l.url : null };
    })
    .sort((a, b) => order(a.trip) - order(b.trip));
  const customerId = items[0]?.trip.customer?.id;
  const customerUrl = customerId && items.some((i) => i.trackingUrl)
    ? await customerDetailApi.trackingLink(customerId).then((l) => (l.enabled ? l.url : null)).catch(() => null)
    : null;
  return { items, customerUrl };
}

/** True when the trips are on more than one day — each block then says its date. */
export function spansDays(items: BatchItem[], f: Formatters): boolean {
  return new Set(items.map((i) => f.date(i.trip.planned_start))).size > 1;
}

/** One trip's block: "{n}. route class (type)", its date when asked, driver, number, truck, link. */
export function batchBlock(item: BatchItem, n: number, f: Formatters, withDate: boolean): string {
  const lines = quickMessage('assignment', {
    trip: item.trip,
    trackingUrl: item.trackingUrl,
    tag: null,
    phase: 'planned',
    f,
    position: null,
    remaining: null,
  }).split('\n');
  lines[0] = lines[0].replace(/^1\./, `${n}.`);
  if (withDate && item.trip.planned_start) lines.splice(1, 0, `Date # ${f.dayTime(item.trip.planned_start)}`);
  return lines.join('\n');
}

const allTrucks = (url: string | null) => (url ? `${allTrucksLine(url)}\n\n` : '');

/** Every trip in one message, numbered 1, 2, 3 under the @tag, the all-trucks page on top. */
export function batchMessage({ items, customerUrl }: Batch, f: Formatters, tag: TagPerson | null): string {
  const withDate = spansDays(items, f);
  return withTag(allTrucks(customerUrl) + items.map((it, i) => batchBlock(it, i + 1, f, withDate)).join('\n\n'), tag);
}

/** One trip of the batch as its own message (sent one by one); the first one carries the all-trucks page. */
export function batchSingle({ items, customerUrl }: Batch, index: number, f: Formatters, tag: TagPerson | null): string {
  return withTag(allTrucks(index === 0 ? customerUrl : null) + batchBlock(items[index], 1, f, spansDays(items, f)), tag);
}
