/**
 * Home's "things need you" tiles: one per kind of action item, most important
 * first, so the first three always show what matters right now. Pure.
 * Photos to send and overdue invoices stay on Notifications → To do only.
 */
import { KIND_RANK, URGENCY_RANK, type ActionItem, type ActionKind, type Urgency } from '../actions/actionModel';

const HIDDEN: ActionKind[] = ['photos', 'overdue-invoice'];

export const TILE_LABEL: Record<ActionKind, string> = {
  emergency: 'Emergency',
  delayed: 'Delayed',
  'late-start': 'Not started',
  unassigned: 'No driver or truck',
  'gps-quiet': 'No GPS',
  'gps-mismatch': 'Tracker mismatch',
  photos: 'Photos to send',
  'time-check': 'Check stop times',
  expiry: 'Expiring documents',
  'overdue-invoice': 'Overdue invoices',
};

export interface NeedTile {
  kind: ActionKind;
  count: number;
  /** The most urgent item of this kind sets the tile's colour. */
  urgency: Urgency;
  /** How many of them are urgent ("now"). */
  urgent: number;
  /** Items of this kind at each urgency, for the card's split bar. */
  byUrgency: Record<Urgency, number>;
}

/** Home's items: everything on To do except the kinds Home leaves out. */
export const homeItems = (items: ActionItem[]) => items.filter((i) => !HIDDEN.includes(i.kind));

/** Worst urgency first, then more urgent items, then the more serious kind, then the bigger pile. */
export function needTiles(items: ActionItem[]): NeedTile[] {
  const byKind = new Map<ActionKind, NeedTile>();
  for (const i of homeItems(items)) {
    const t = byKind.get(i.kind) ?? { kind: i.kind, count: 0, urgency: i.urgency, urgent: 0, byUrgency: { now: 0, today: 0, watch: 0 } };
    t.count += 1;
    t.byUrgency[i.urgency] += 1;
    if (i.urgency === 'now') t.urgent += 1;
    if (URGENCY_RANK[i.urgency] < URGENCY_RANK[t.urgency]) t.urgency = i.urgency;
    byKind.set(i.kind, t);
  }
  return [...byKind.values()].sort((a, b) =>
    URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
    || b.urgent - a.urgent
    || KIND_RANK[a.kind] - KIND_RANK[b.kind]
    || b.count - a.count);
}
