import { lineTypeLabel, normalizeLineTypeToken, type RateReportFieldKey } from '@mercon/shared-types';
import { prisma } from '../../../db';

const BASIS_LABEL: Record<string, string> = { PER_TRIP: 'Per trip', PER_MONTH: 'Per month' };

/**
 * A customer's rate card: one row per active quotation, ordered by route.
 * Origin/destination are the first pickup and last dropoff; `route` lists
 * every stop for multi-stop and round-trip quotations.
 */
export async function fetchRateRows(customerId: string, lineType?: string): Promise<Record<RateReportFieldKey, unknown>[]> {
  const quotations = await prisma.quotation.findMany({
    where: { customerId, is_active: true, deletedAt: null },
    select: {
      quotation_number: true, name: true, line_type: true, pricing_basis: true, rate: true, currency: true,
      vehicle_class: true, source_vehicle_label: true, valid_from: true, valid_to: true,
      stops: {
        orderBy: [{ leg_index: 'asc' }, { sequence: 'asc' }],
        select: { stop_type: true, source_label: true, location: { select: { name: true } } },
      },
    },
  });

  const wanted = lineType ? normalizeLineTypeToken(lineType) : '';
  const rows = quotations
    .filter((q) => !wanted || normalizeLineTypeToken(q.line_type) === wanted)
    .map((q) => {
      const names = q.stops.map((s) => s.location?.name || s.source_label || '').filter(Boolean);
      const pickup = q.stops.find((s) => s.stop_type === 'Pickup');
      const dropoff = [...q.stops].reverse().find((s) => s.stop_type === 'Dropoff');
      const nameOf = (s?: (typeof q.stops)[number]) => s?.location?.name || s?.source_label || '';
      return {
        quotation_no: q.quotation_number != null ? `QT-${q.quotation_number}` /* as on the Quotations list */ : '',
        quotation_name: q.name,
        origin: nameOf(pickup) || names[0] || '',
        destination: nameOf(dropoff) || names[names.length - 1] || '',
        route: names.join(' → '),
        vehicle_type: q.source_vehicle_label || q.vehicle_class || '',
        line_type: q.line_type ? lineTypeLabel(normalizeLineTypeToken(q.line_type)) : '',
        pricing_basis: q.pricing_basis ? BASIS_LABEL[q.pricing_basis] ?? q.pricing_basis : '',
        rate: Number(q.rate),
        currency: q.currency,
        valid_from: q.valid_from,
        valid_to: q.valid_to,
      };
    })
    .sort((a, b) => a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination) || a.vehicle_type.localeCompare(b.vehicle_type));

  return rows.map((r, i) => ({ serial: i + 1, ...r }));
}
