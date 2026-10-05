/**
 * WhatsApp status messages for one trip or many, in the one shared format
 * (@mercon/shared-types statusMessage) — used by Home, the trip page and the
 * Fleet map so a customer always gets the same layout.
 *
 * Loads what the lists don't carry (driver phone, truck class, line type,
 * stops, the customer's WhatsApp number / group) from the trip itself, adds
 * each trip's live link when the customer wants links in messages, and splits
 * the trips by customer: each customer gets their own message, headed by their
 * all-trucks link when there are several trucks (WhatsApp previews that one).
 */
import { formatFleetStatusMessage } from '@mercon/shared-types';
import { autoTrackingUrl, operatorService, type OperatorTripDetail } from '../../lib/operator';
import { customerDetailApi } from '../customers/details/customerDetailApi';
import { isMonthly, makeFormatters, phaseOf, statusTripOf, type Remaining } from '../trips/details/tripDetailsModel';

/** Each trip is a request; this many is plenty for one WhatsApp message. */
export const MAX_STATUS_TRIPS = 30;

export interface CustomerStatusMessage {
  customerId: string | null;
  customerName: string;
  /** Where to send it: the customer's WhatsApp number (or contact phone)… */
  phone: string | null;
  /** …or their WhatsApp group, which has to be picked inside WhatsApp. */
  group: string | null;
  tripIds: string[];
  text: string;
}

const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

/**
 * One message per customer for these trips. `remaining` adds a live ETA for the
 * trips the caller has a road route for (the Fleet map does).
 */
export async function buildStatusMessages(
  tripIds: string[],
  opts: { remaining?: Record<string, Remaining | null> } = {},
): Promise<CustomerStatusMessage[]> {
  const ids = [...new Set(tripIds)].slice(0, MAX_STATUS_TRIPS);
  if (ids.length === 0) return [];
  const [tz, trips, links] = await Promise.all([
    safe(operatorService.deploymentTimezone(), 'Asia/Riyadh'),
    Promise.all(ids.map((id) => safe<OperatorTripDetail | null>(operatorService.tripById(id), null))),
    safe(operatorService.trackingLinks(ids), {} as Awaited<ReturnType<typeof operatorService.trackingLinks>>),
  ]);
  const f = makeFormatters(tz);

  // Keep the order the trips were picked in, grouped by customer.
  const groups = new Map<string, OperatorTripDetail[]>();
  for (const t of trips) {
    if (!t) continue;
    const key = t.customer?.id ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: CustomerStatusMessage[] = [];
  for (const [key, list] of groups) {
    const customer = list[0].customer;
    // The all-trucks page goes on top when a customer gets several trucks at once.
    const fleet = list.length > 1 && customer?.id ? await safe(customerDetailApi.trackingLink(customer.id), null) : null;
    const notStarted = list.every((t) => phaseOf(t.status) === 'planned');
    const text = formatFleetStatusMessage(
      list.map((t) => statusTripOf(t, {
        phase: phaseOf(t.status),
        f,
        remaining: opts.remaining?.[t.id] ?? null,
        trackingUrl: links[t.id] ? autoTrackingUrl(links[t.id]) : null,
      })),
      {
        customerName: customer?.name ?? null,
        billing: notStarted ? (list.every(isMonthly) ? 'MONTHLY' : 'EXTRA') : null,
        fleetUrl: fleet?.enabled ? fleet.url : null,
      },
    );
    out.push({
      customerId: key === 'none' ? null : key,
      customerName: customer?.name ?? 'No customer',
      phone: customer?.whatsapp_number || customer?.contact_phone || null,
      group: customer?.whatsapp_group_name || null,
      tripIds: list.map((t) => t.id),
      text,
    });
  }
  return out;
}
