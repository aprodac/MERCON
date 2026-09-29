import { lineTypeLabel, normalizeLineTypeToken, type TripReportFieldKey } from '@mercon/shared-types';
import { prisma } from '../../../db';
import { computeTripChargesTotal } from '../../../utils/tripFinancials';

export interface TripReportFilters {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  status?: string;
  /**
   * Only trips of this line type (SINGLE_TRIP, ROUND_TRIP, 10_HRS, 12_HRS —
   * LINE_TYPES in @mercon/shared-types), for a customer who wants e.g. a
   * separate sheet for round trips. A trip keeps its line type in the legacy
   * `rate_category` column, spelled either way ("ROUND_TRIP" / "Round Trip"),
   * and older trips only have it on their quotation — so it's compared
   * normalised, in memory, not with an exact-match where clause.
   */
  lineType?: string;
  /**
   * Exactly these trips (e.g. the ones billed on an invoice) instead of a
   * date range. Soft-deleted trips are kept here: they were billed, so the
   * sheet must still match the invoice.
   */
  tripIds?: string[];
}

const PAGE_SIZE = 1000;

/**
 * Fetches trips for a company report, fixing three problems in the original
 * `getCustomReport`:
 *  - filters on the trip's own date (actual_start, falling back to
 *    planned_start for trips that haven't started) instead of `createdAt`,
 *    so "this month's trips" actually means trips that happened this month;
 *  - has no row cap — pages internally in chunks of 1000 so a full month's
 *    ledger exports completely instead of silently truncating at 500;
 *  - resolves `receiver` from the dropoff stop's real location_name /
 *    location_address instead of the placeholder "Dropoff Stop N".
 */
export async function fetchTripRows(
  filters: TripReportFilters
): Promise<Record<TripReportFieldKey, unknown>[]> {
  const { startDate, endDate, customerId, status, lineType, tripIds } = filters;
  const wantedLineType = lineType ? normalizeLineTypeToken(lineType) : '';

  const dateRange: { gte?: Date; lte?: Date } = {};
  if (startDate) dateRange.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateRange.lte = end;
  }

  const whereClause: any = tripIds ? { id: { in: tripIds } } : { deletedAt: null };
  if (Object.keys(dateRange).length > 0) {
    whereClause.OR = [
      { actual_start: dateRange },
      { AND: [{ actual_start: null }, { planned_start: dateRange }] },
    ];
  }
  if (customerId && customerId !== 'all') whereClause.customerId = customerId;
  if (status && status !== 'all') whereClause.status = status;

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { companyLegalName: true } });
  const defaultCarrierName = settings?.companyLegalName || 'MERCON Logistics';

  const rows: Record<TripReportFieldKey, unknown>[] = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await prisma.trip.findMany({
      where: whereClause,
      orderBy: [{ actual_start: 'asc' }, { planned_start: 'asc' }],
      skip,
      take: PAGE_SIZE,
      include: {
        customer: { select: { name: true } },
        driver: { select: { first_name: true, last_name: true, phone_primary: true } },
        vehicle: { select: { plate_number: true, capacity_kg: true, asset_type: true } },
        stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' } },
        charges: true,
        subcontract: { include: { provider: { select: { name: true } } } },
        quotation: { select: { line_type: true } },
      },
    });
    if (page.length === 0) break;

    for (const t of page) {
      const tripLineType = t.rate_category || t.quotation?.line_type || null;
      if (wantedLineType && normalizeLineTypeToken(tripLineType) !== wantedLineType) continue;

      const pickup = t.stops.find((s) => s.stop_type === 'Pickup');
      const dropoff = t.stops.find((s) => s.stop_type === 'Dropoff');
      const billing = Number(t.billing_amount ?? 0);
      const chargesTotal = computeTripChargesTotal(t.charges);
      const totalAmt = billing + chargesTotal;
      const driverCharge = Number(t.driver_payout ?? 0);
      const balance = totalAmt - (chargesTotal + driverCharge);
      // A third-party trip is driven by the subcontractor's driver and truck,
      // which live on the subcontract, not on driver/vehicle.
      const sub = t.is_third_party ? t.subcontract : null;
      const vehicleTypeLabel = sub
        ? sub.vehicleType || t.vehicle_type || 'N/A'
        : t.vehicle
          ? `${(t.vehicle.capacity_kg / 1000).toFixed(0)} TON (${t.vehicle.asset_type})`
          : 'N/A';

      rows.push({
        serial: rows.length + 1,
        ref_id: t.ref_id || t.id,
        date: t.actual_start || t.planned_start || t.createdAt,
        driver_name: sub ? sub.driverName || 'N/A' : t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'N/A',
        driver_phone: (sub ? sub.driverPhone : t.driver?.phone_primary) || 'N/A',
        vehicle_plate: (sub ? sub.vehiclePlate : t.vehicle?.plate_number) || 'N/A',
        vehicle_type: vehicleTypeLabel,
        carrier_name: t.carrier_name || sub?.provider?.name || defaultCarrierName,
        customer_name: t.customer?.name || 'N/A',
        receiver: dropoff?.location_name || dropoff?.location_address || 'N/A',
        origin: pickup?.location_name || pickup?.location_address || 'N/A',
        destination: dropoff?.location_name || dropoff?.location_address || 'N/A',
        total_charges: chargesTotal,
        billing_amount: billing,
        total_amount: totalAmt,
        driver_payout: driverCharge,
        balance_amount: balance,
        status: t.status,
        // Always the display name ("Round trip"), however the trip spelled it.
        rate_category: tripLineType ? lineTypeLabel(normalizeLineTypeToken(tripLineType)) : 'N/A',
      });
    }

    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return rows;
}
