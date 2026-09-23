import { Prisma } from '@prisma/client';
import { getLegEndpoints } from '@mercon/shared-types';

/**
 * The one rule for "what does this lane cost for this customer".
 *
 * Every quotation belongs to exactly one customer — there is no all-customers
 * "standard" rate to fall back to, so a lane with no quotation for this customer
 * simply has no price yet.
 */

export const quotationInclude = {
  customer: { select: { id: true, name: true } },
  stops: {
    include: {
      location: { select: { id: true, name: true, lat: true, lng: true } },
    },
    orderBy: { sequence: 'asc' as const },
  },
};

/**
 * @deprecated Legacy compatibility alias. Use `quotationInclude` instead.
 * TODO: Remove when legacy rate-cards references are fully deprecated.
 */
export const pricingRuleInclude = quotationInclude;

/**
 * @deprecated Legacy compatibility alias. Use `quotationInclude` instead.
 * TODO: Remove when legacy rate-cards references are fully deprecated.
 */
export const rateCardInclude = quotationInclude;

/** Accepts the PrismaClient or a transaction client — both expose `quotation`. */
type QuotationClient = Pick<Prisma.TransactionClient, 'quotation'>;

export type RateSource = 'customer' | null;
export type MatchStatus = 'EXACT_MATCH' | 'MULTISTOP_MISMATCH' | 'NO_QUOTATION';

export const findQuotationForLane = async (
  tx: QuotationClient,
  params: {
    customerId?: string | null;
    originLocationId?: string | null;
    destinationLocationId?: string | null;
    vehicleType?: string | null;
    vehicleClass?: string | null;
    sourceVehicleLabel?: string | null;
    rateCategory?: string | null;
    lineType?: string | null;
    billingType?: string | null;
    stops?: Array<{ location_id?: string | null; locationId?: string | null; sequence?: number; stop_type?: string }>;
  }
): Promise<{
  quotation: any | null;
  pricingRule: any | null;
  rateCard: any | null;
  candidateQuotation: any | null;
  matchStatus: MatchStatus;
  source: RateSource;
}> => {
  const { customerId, originLocationId, destinationLocationId, stops } = params;
  const lineType = params.lineType || params.rateCategory;
  const vehicleClass = params.vehicleClass;
  const sourceVehicleLabel = params.sourceVehicleLabel || params.vehicleType;
  const billingType = params.billingType;

  if (!customerId) {
    return { quotation: null, pricingRule: null, rateCard: null, candidateQuotation: null, matchStatus: 'NO_QUOTATION', source: null };
  }

  const whereClause: Prisma.QuotationWhereInput = {
    customerId,
    is_active: true,
    deletedAt: null,
  };

  const getLineTypeVariants = (rawLineType?: string | null): string[] => {
    if (!rawLineType || !rawLineType.trim()) return [];
    const s = rawLineType.trim().toUpperCase().replace(/_/g, ' ');
    if (s.includes('10')) return ['10_HRS', '10 Hours Duty', '10 Hrs Duty', '10 Hours Shift', '10_HOURS', '10 HOURS'];
    if (s.includes('12')) return ['12_HRS', '12 Hours Duty', '12 Hrs Duty', '12 Hours Shift', '12_HOURS', '12 HOURS'];
    if (s.includes('ROUND')) return ['ROUND_TRIP', 'Round Trip', 'Trip/Round Trip'];
    if (s.includes('SINGLE')) return ['SINGLE_TRIP', 'Single Trip'];
    return [rawLineType.trim()];
  };

  const ltVariants = getLineTypeVariants(lineType);

  if (ltVariants.length > 0) {
    whereClause.line_type = { in: ltVariants };
  }
  if (billingType && billingType.trim()) {
    whereClause.operation_type = billingType.trim();
  }
  if (vehicleClass !== undefined && vehicleClass !== null) {
    whereClause.vehicle_class = vehicleClass;
  } else if (sourceVehicleLabel !== undefined && sourceVehicleLabel !== null) {
    whereClause.source_vehicle_label = sourceVehicleLabel;
  }

  if (originLocationId) {
    whereClause.AND = [
      { stops: { some: { locationId: originLocationId, sequence: 1 } } },
    ];
  }

  const candidates = await tx.quotation.findMany({
    where: whereClause,
    include: quotationInclude,
    orderBy: { updatedAt: 'desc' },
  });

  let q: any | null = candidates.find((cand: any) => {
    const leg0 = getLegEndpoints(cand, 0);
    const candOriginId = leg0.loading?.locationId || leg0.loading?.location_id;
    const candDestId = leg0.delivery?.locationId || leg0.delivery?.location_id;
    if (originLocationId && candOriginId !== originLocationId) return false;
    if (destinationLocationId && candDestId !== destinationLocationId) return false;
    return true;
  }) || null;

  // Fallback: If exact locationId match returned null, try name token matching across active customer quotations
  if (!q && originLocationId && destinationLocationId && (tx as any).location) {
    try {
      const [origLoc, destLoc] = await Promise.all([
        (tx as any).location.findUnique({ where: { id: originLocationId } }),
        (tx as any).location.findUnique({ where: { id: destinationLocationId } }),
      ]);

      const targetOriginStr = origLoc ? `${origLoc.name || ''} ${origLoc.address || ''} ${origLoc.city || ''}` : '';
      const targetDestStr = destLoc ? `${destLoc.name || ''} ${destLoc.address || ''} ${destLoc.city || ''}` : '';

      if (targetOriginStr.trim() && targetDestStr.trim()) {
        const fallbackWhere: Prisma.QuotationWhereInput = {
          customerId,
          is_active: true,
          deletedAt: null,
        };
        if (ltVariants.length > 0) fallbackWhere.line_type = { in: ltVariants };
        if (billingType && billingType.trim()) fallbackWhere.operation_type = billingType.trim();
        if (vehicleClass !== undefined && vehicleClass !== null) {
          fallbackWhere.vehicle_class = vehicleClass;
        } else if (sourceVehicleLabel !== undefined && sourceVehicleLabel !== null) {
          fallbackWhere.source_vehicle_label = sourceVehicleLabel;
        }

        const tokenCandidates = await tx.quotation.findMany({
          where: fallbackWhere,
          include: quotationInclude,
          orderBy: { updatedAt: 'desc' },
        });

        const norm = (s?: string | null) => String(s || '').toLowerCase().replace(/[\s,_()[\]\/{}\-.]/g, '');
        const matchLocationStr = (cardLocRaw: string, targetLocRaw: string) => {
          if (!cardLocRaw || !targetLocRaw) return false;
          const cleanCard = norm(cardLocRaw);
          const cleanTarget = norm(targetLocRaw);
          if (cleanCard === cleanTarget || cleanCard.includes(cleanTarget) || cleanTarget.includes(cleanCard)) return true;

          const getTokens = (s: string) =>
            s
              .toLowerCase()
              .split(/[\s,_()[\]\/{}\-.]+/)
              .filter((t) => t.length > 2 && t !== 'al' && t !== 'el' && t !== 'the' && t !== 'station' && t !== 'centre' && t !== 'center' && t !== 'hub');

          const cardTokens = getTokens(cardLocRaw);
          const targetTokens = getTokens(targetLocRaw);
          if (cardTokens.length === 0 || targetTokens.length === 0) return false;
          return cardTokens.some((ct) => targetTokens.some((tt) => ct === tt || ct.includes(tt) || tt.includes(ct)));
        };

        const match = tokenCandidates.find((cand: any) => {
          const leg0 = getLegEndpoints(cand, 0);
          const firstStop = leg0.loading;
          const lastStop = leg0.delivery || firstStop;

          const candO = String(
            firstStop?.source_label ||
            firstStop?.location?.name ||
            firstStop?.location?.address ||
            cand.route_origin ||
            cand.origin_name ||
            cand.name ||
            ''
          );

          const candD = String(
            lastStop?.source_label ||
            lastStop?.location?.name ||
            lastStop?.location?.address ||
            cand.route_destination ||
            cand.destination_name ||
            cand.name ||
            ''
          );

          return matchLocationStr(candO, targetOriginStr) && matchLocationStr(candD, targetDestStr);
        });

        if (match) {
          q = match;
        }
      }
    } catch (err) {
      // Ignore fallback errors
    }
  }

  // Multi-stop route structure validation
  let matchStatus: MatchStatus = 'NO_QUOTATION';
  let candidateQuotation: any | null = null;

  if (q) {
    const qIntermediates = [...getLegEndpoints(q, 0).intermediates, ...getLegEndpoints(q, 1).intermediates];
    const tripIntermediates = stops ? [...getLegEndpoints({ stops } as any, 0).intermediates, ...getLegEndpoints({ stops } as any, 1).intermediates] : [];

    if (qIntermediates.length > 0) {
      if (tripIntermediates.length === qIntermediates.length) {
        matchStatus = 'EXACT_MATCH';
      } else {
        matchStatus = 'MULTISTOP_MISMATCH';
        candidateQuotation = q;
        q = null;
      }
    } else {
      matchStatus = 'EXACT_MATCH';
    }
  }

  return {
    quotation: q,
    pricingRule: q,
    rateCard: q,
    candidateQuotation,
    matchStatus,
    source: q ? 'customer' : null,
  };
};

/**
 * @deprecated Legacy compatibility alias. Use `findQuotationForLane` instead.
 * TODO: Remove when legacy rate-cards references are fully deprecated.
 */
export const findPricingRuleForLane = findQuotationForLane;

/**
 * @deprecated Legacy compatibility alias. Use `findQuotationForLane` instead.
 * TODO: Remove when legacy rate-cards references are fully deprecated.
 */
export const findRateForLane = findQuotationForLane;
