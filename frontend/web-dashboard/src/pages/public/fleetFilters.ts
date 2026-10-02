import type { DeliveredTrip, FleetTruck } from '@/services/trackingService';

/**
 * Search and route filter for the customer-wide tracking page. Pure, so the
 * page stays simple and the rules are tested on their own.
 */

/** Routes on the page, most trucks first — the filter chips. */
export function routesOf(trucks: Array<Pick<FleetTruck, 'route_label'>>): string[] {
  const counts = new Map<string, number>();
  for (const t of trucks) if (t.route_label) counts.set(t.route_label, (counts.get(t.route_label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([r]) => r);
}

/** Lower-case and drop spaces and dashes, so "vra3358", "VRA-3358" and "vra 3358" all match. */
const fold = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '');

/** Whether a truck or delivered trip matches what the customer typed: plate, trip number or a place on its route. */
export function matchesSearch(item: Pick<FleetTruck, 'plate' | 'ref' | 'route_label'>, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  return [item.plate, item.ref, item.route_label].some((v) => v != null && fold(v).includes(q));
}

export function filterFleet<T extends FleetTruck | DeliveredTrip>(items: T[], query: string, route: string | null): T[] {
  return items.filter((x) => (!route || x.route_label === route) && matchesSearch(x, query));
}
