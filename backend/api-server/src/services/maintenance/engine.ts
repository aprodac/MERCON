/**
 * Maintenance — the arithmetic: a service order's totals from its lines, how long a truck was off
 * the road, and when a planned service is due (by km or by days, whichever comes first).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

export type ItemKind = 'part' | 'labour' | 'other';
export const ITEM_KINDS: ItemKind[] = ['part', 'labour', 'other'];

export interface ItemInput {
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  servicePlanId?: string | null;
}

/** Line amounts and the order's totals: net (before VAT), VAT, total paid. */
export function orderTotals(items: ItemInput[], vat: number) {
  const lines = items.map((it, i) => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), sort_order: i }));
  const net = r2(lines.reduce((t, l) => t + l.amount, 0));
  const byKind = Object.fromEntries(ITEM_KINDS.map((k) => [k, r2(lines.filter((l) => l.kind === k).reduce((t, l) => t + l.amount, 0))])) as Record<ItemKind, number>;
  const v = r2(Number(vat) || 0);
  return { lines, net, vat: v, total: r2(net + v), byKind };
}

/** What's wrong with an order's lines and VAT, or null. */
export function itemsProblem(items: ItemInput[], vat: number): string | null {
  for (const it of items) {
    if (!it.description?.trim()) return 'Every cost line needs a description.';
    if (!ITEM_KINDS.includes(it.kind)) return 'A cost line must be a part, labour or other.';
    if (!(Number(it.quantity) > 0)) return 'Quantities must be above zero.';
    if (!(Number(it.unit_price) >= 0)) return 'Prices can’t be negative.';
  }
  const { net } = orderTotals(items, 0);
  if (!(Number(vat) >= 0)) return 'VAT can’t be negative.';
  if (Number(vat) > 0 && net <= 0) return 'Add the cost lines before the VAT.';
  return null;
}

/** Whole days a truck was (or has been) out: from start to end, or to now while open. Min 1 once started. */
export function daysOut(start: Date, end: Date | null, now: Date): number {
  const until = end ?? now;
  if (until < start) return 0;
  return Math.max(1, Math.ceil((until.getTime() - start.getTime()) / DAY));
}

/** Days of [start, end or now] that fall inside [from, to]: downtime inside a month. */
export function overlapDays(start: Date, end: Date | null, from: Date, to: Date, now: Date): number {
  const a = Math.max(start.getTime(), from.getTime());
  const b = Math.min((end ?? now).getTime(), to.getTime());
  return b <= a ? 0 : Math.ceil((b - a) / DAY);
}

export interface PlanLike {
  id: string;
  task: string;
  asset_type: string | null;
  vehicleId: string | null;
  interval_km: number | null;
  interval_days: number | null;
  warn_km: number;
  warn_days: number;
}

const taskKey = (t: string) => t.trim().toLowerCase();

/**
 * The plans that apply to a truck: its own, plus its type's (or all-trucks) plans for tasks it
 * has no plan of its own for.
 */
export function plansFor<P extends PlanLike>(plans: P[], vehicle: { id: string; asset_type: string }): P[] {
  const own = plans.filter((p) => p.vehicleId === vehicle.id);
  const ownTasks = new Set(own.map((p) => taskKey(p.task)));
  const shared = plans.filter((p) => !p.vehicleId && (!p.asset_type || p.asset_type === vehicle.asset_type) && !ownTasks.has(taskKey(p.task)));
  // A type plan beats an all-trucks plan for the same task
  const byTask = new Map<string, P>();
  for (const p of shared) {
    const cur = byTask.get(taskKey(p.task));
    if (!cur || (!cur.asset_type && p.asset_type)) byTask.set(taskKey(p.task), p);
  }
  return [...own, ...byTask.values()];
}

export type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'never' | 'booked';

export interface DueResult {
  status: DueStatus;
  dueKm: number | null;
  dueDate: Date | null;
  remainingKm: number | null;
  remainingDays: number | null;
}

/**
 * When a planned service is next due for a truck, from the last completed order with that task.
 * `booked` when an open or scheduled order already includes it.
 */
export function dueFor(
  plan: PlanLike,
  last: { date: Date; km: number } | null,
  odometer: number,
  today: Date,
  booked: boolean,
): DueResult {
  if (!last) return { status: booked ? 'booked' : 'never', dueKm: null, dueDate: null, remainingKm: null, remainingDays: null };
  const dueKm = plan.interval_km ? last.km + plan.interval_km : null;
  const dueDate = plan.interval_days ? new Date(last.date.getTime() + plan.interval_days * DAY) : null;
  const remainingKm = dueKm !== null ? Math.round(dueKm - odometer) : null;
  const remainingDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / DAY) : null;
  let status: DueStatus = 'ok';
  if ((remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0)) status = 'overdue';
  else if ((remainingKm !== null && remainingKm <= plan.warn_km) || (remainingDays !== null && remainingDays <= plan.warn_days)) status = 'due_soon';
  if (booked && status !== 'ok') status = 'booked';
  return { status, dueKm, dueDate, remainingKm, remainingDays };
}
