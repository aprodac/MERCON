/**
 * The assignment message for several trips made by one Create Trip (a monthly
 * roster, rotating drivers): one numbered message for all of them, or one
 * message per trip. Each block is the single-trip message, renumbered, with
 * the trip's date when the trips fall on different days.
 */
import { operatorService, type OperatorTripDetail } from '../../../lib/operator';
import { quickMessage, withTag, type Formatters, type TagPerson } from './tripDetailsModel';

export interface BatchItem {
  trip: OperatorTripDetail;
  trackingUrl: string | null;
}

/** The trips and their tracking links (only for customers who want the link in messages). */
export async function loadBatch(ids: string[]): Promise<BatchItem[]> {
  const [trips, links] = await Promise.all([
    Promise.all(ids.map((id) => operatorService.tripById(id))),
    operatorService.trackingLinks(ids).catch(() => ({}) as Awaited<ReturnType<typeof operatorService.trackingLinks>>),
  ]);
  const order = (t: OperatorTripDetail) => (t.planned_start ? new Date(t.planned_start).getTime() : 0);
  return trips
    .map((trip) => {
      const l = links[trip.id];
      return { trip, trackingUrl: l?.enabled && l.auto_link ? l.url : null };
    })
    .sort((a, b) => order(a.trip) - order(b.trip));
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

/** Every trip in one message, numbered 1, 2, 3 … under the @tag. */
export function batchMessage(items: BatchItem[], f: Formatters, tag: TagPerson | null): string {
  const withDate = spansDays(items, f);
  return withTag(items.map((it, i) => batchBlock(it, i + 1, f, withDate)).join('\n\n'), tag);
}

/** One trip of the batch as its own message (sent one by one). */
export function batchSingle(items: BatchItem[], index: number, f: Formatters, tag: TagPerson | null): string {
  return withTag(batchBlock(items[index], 1, f, spansDays(items, f)), tag);
}
