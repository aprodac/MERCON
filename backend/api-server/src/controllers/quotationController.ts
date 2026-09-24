import { Request, Response } from 'express';
import { prisma } from '../db';
import { resolveLocation } from './locationController';
import { findQuotationForLane, quotationInclude } from '../services/rateLookup';
import { getValidUuid } from '../utils/uuid';
import { logger } from '../utils/logger';
import { vehicleTypeField, rateCategoryField, billingTypeField } from '../schemas';

/**
 * Normalises tier fields from request body.
 */
const parseTierFields = (body: any) => {
  const vehicleType = vehicleTypeField.safeParse(body.vehicle_type ?? body.source_vehicle_label);
  const rateCategory = rateCategoryField.safeParse(body.rate_category ?? body.line_type);
  const billingType = billingTypeField.safeParse(body.billing_type);
  return {
    vehicleType: vehicleType.success ? vehicleType.data ?? null : null,
    rateCategory: rateCategory.success ? rateCategory.data ?? null : null,
    billingType: billingType.success ? billingType.data ?? null : null,
    vehicleClass: body.vehicle_class ? String(body.vehicle_class).trim() || null : null,
    pricingBasis: body.pricing_basis ? String(body.pricing_basis).trim() || null : null,
    validFrom: body.valid_from ? new Date(body.valid_from) : null,
    validTo: body.valid_to ? new Date(body.valid_to) : null,
    sourceType: body.source_type ? String(body.source_type).trim() || null : null,
    sourceReference: body.source_reference ? String(body.source_reference).trim() || null : null,
  };
};

const resolveLane = async (tx: any, body: any, userId?: string | null) => {
  const custId = body.customerId ?? body.customer_id ?? null;
  const origin = await resolveLocation(
    tx,
    {
      customerId: custId,
      id: body.origin_location_id ?? null,
      name: body.origin_name ?? body.route_origin ?? null,
      lat: body.origin_lat ?? null,
      lng: body.origin_lng ?? null,
    },
    userId
  );

  const destination = await resolveLocation(
    tx,
    {
      customerId: custId,
      id: body.destination_location_id ?? null,
      name: body.destination_name ?? body.route_destination ?? null,
      lat: body.destination_lat ?? null,
      lng: body.destination_lng ?? null,
    },
    userId
  );

  return { origin, destination };
};

const MAX_SAFE_DECIMAL = 999999999.99;

const parseDecimalSafe = (val: any): number | null => {
  if (val === null || val === undefined || val === '' || val === 'null' || val === 'NULL') return null;
  const n = Number(val);
  if (isNaN(n) || !isFinite(n) || n < 0 || n > MAX_SAFE_DECIMAL) return null;
  return n;
};

export const createQuotation = async (req: Request, res: Response) => {
  try {
    const { name, base_price, rate, driver_payout, driver_charge, default_trip_charge, currency, customerId, is_active, via_location } = req.body;
    const userId = getValidUuid((req as any).user?.id);

    const price = parseDecimalSafe(rate ?? base_price);
    if (price === null || price <= 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid rate between 0 and 999,999,999' } });
    }

    const rawPayout = driver_payout ?? driver_charge ?? default_trip_charge;
    const payoutVal = parseDecimalSafe(rawPayout);

    const normalisedCustomerId = getValidUuid(customerId || req.body.customer_id);
    if (!normalisedCustomerId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose which customer this quotation is for' } });
    }

    const { vehicleType, rateCategory, billingType, vehicleClass, pricingBasis, validFrom, validTo, sourceType, sourceReference } = parseTierFields(req.body);

    const quotation = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: normalisedCustomerId, deletedAt: null } });
      if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

      const { origin, destination } = await resolveLane(tx, req.body, userId);

      let stopData: Array<{ sequence: number; locationId: string | null; stop_type: 'Pickup' | 'Dropoff' | 'Rest' | 'Refuel'; source_label?: string | null }> = [];
      if (Array.isArray(req.body.stops) && req.body.stops.length > 0) {
        stopData = await Promise.all(req.body.stops.map(async (s: any, idx: number) => {
          const rawLocId = getValidUuid(s.locationId || s.location_id || null);
          const rawName = s.source_label || s.location_name || s.name || s.label || null;
          let validLocId: string | null = null;
          let locName: string | null = rawName;

          if (rawLocId || rawName) {
            const loc = await resolveLocation(tx, { id: rawLocId, name: rawName, customerId: normalisedCustomerId }, userId);
            if (loc) {
              validLocId = loc.id;
              locName = loc.name;
            }
          }
          return {
            sequence: s.sequence ?? idx + 1,
            leg_index: s.leg_index !== undefined ? Number(s.leg_index) : 0,
            locationId: validLocId,
            stop_type: (s.stop_type || (idx === 0 ? 'Pickup' : idx === req.body.stops.length - 1 ? 'Dropoff' : 'Rest')) as any,
            source_label: locName || rawName || null,
          };
        }));
      } else if (origin && destination) {
        stopData = [
          { sequence: 1, locationId: origin.id, stop_type: 'Pickup', source_label: origin.name },
          ...(via_location ? [{ sequence: 2, locationId: null, stop_type: 'Rest' as const, source_label: String(via_location).trim() }] : []),
          { sequence: via_location ? 3 : 2, locationId: destination.id, stop_type: 'Dropoff', source_label: destination.name },
        ];
      }

      const pickupStop = stopData.find((s) => s.stop_type === 'Pickup') || stopData[0];
      const dropoffStop = stopData.filter((s) => s.stop_type === 'Dropoff').pop() || stopData[stopData.length - 1];
      const originLabel = pickupStop?.source_label || origin?.name || 'Origin';
      const destLabel = dropoffStop?.source_label || destination?.name || 'Destination';

      const quotationName = String(name || '').trim() || `${originLabel} → ${destLabel}`;

      const newQuotation = await tx.quotation.create({
        data: {
          name: quotationName,
          rate: price,
          driver_payout: payoutVal,
          currency: currency || 'SAR',
          customerId: normalisedCustomerId,
          is_active: is_active ?? true,
          line_type: rateCategory,
          operation_type: billingType || req.body.operation_type || null,
          pricing_basis: pricingBasis,
          vehicle_class: vehicleClass,
          source_vehicle_label: vehicleType,
          valid_from: validFrom,
          valid_to: validTo,
          source_type: sourceType || 'MANUAL',
          source_reference: sourceReference,
          created_by: userId,
          stops: {
            create: stopData,
          },
        },
        include: quotationInclude,
      });

      return newQuotation;
    });

    try {
      const userObj = userId ? await prisma.user.findFirst({ where: { id: userId }, select: { name: true, username: true } }) : null;
      const userName = userObj ? (userObj.name || userObj.username) : ((req as any).user?.name || (req as any).user?.username || null);

      await prisma.quotationHistory.create({
        data: {
          quotationId: quotation.id,
          old_rate: null,
          new_rate: price,
          old_driver_payout: null,
          new_driver_payout: payoutVal,
          changed_by: userName,
          changed_by_user_id: userId || null,
          changed_by_name: userName,
          reason: req.body.reason || req.body.change_reason || 'Initial Quotation creation',
          source: req.body.source || 'QUOTATION_MODULE',
          trip_id: req.body.trip_id || null,
        },
      });
    } catch (historyErr: any) {
      logger.warn({ err: historyErr }, 'Could not record QuotationHistory entry — quotation created successfully');
    }

    res.status(201).json({ success: true, data: quotation });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create quotation');
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
    }
    if (error.message === 'CUSTOMER_NOT_FOUND') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'That customer no longer exists' } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to create quotation' } });
  }
};

export const getQuotations = async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      active_only,
      status,
      vehicle_type,
      rate_category,
      line_type,
      billing_type,
      search,
      page,
      per_page,
    } = req.query;

    const whereClause: any = { deletedAt: null };
    if (active_only === 'true' || status === 'active') {
      whereClause.is_active = true;
    } else if (status === 'inactive') {
      whereClause.is_active = false;
    }

    const targetCustomerId = (customerId || req.query.customer_id) as string;
    if (targetCustomerId) whereClause.customerId = targetCustomerId;

    if (vehicle_type) {
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({
        OR: [{ source_vehicle_label: vehicle_type as string }, { vehicle_class: vehicle_type as string }],
      });
    }

    if (line_type || rate_category) whereClause.line_type = (line_type || rate_category) as string;
    if (billing_type || req.query.operation_type) whereClause.operation_type = (billing_type || req.query.operation_type) as string;

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { line_type: { contains: term, mode: 'insensitive' } },
          { operation_type: { contains: term, mode: 'insensitive' } },
          { source_vehicle_label: { contains: term, mode: 'insensitive' } },
          { vehicle_class: { contains: term, mode: 'insensitive' } },
          { customer: { name: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    const isPaginated = per_page !== 'all' && (page !== undefined || per_page !== undefined);
    const pageNumber = isPaginated ? Math.max(1, parseInt((page as string) || '1', 10)) : 1;
    const limit = isPaginated ? Math.max(1, parseInt((per_page as string) || '10', 10)) : 0;
    const skip = isPaginated ? (pageNumber - 1) * limit : 0;

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where: whereClause,
        include: quotationInclude,
        ...(isPaginated ? { skip, take: limit } : {}),
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.quotation.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: quotations,
      meta: {
        page: isPaginated ? pageNumber : 1,
        per_page: isPaginated ? limit : total,
        total,
        total_pages: isPaginated ? Math.ceil(total / Math.max(1, limit)) : 1,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch quotations');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch quotations' } });
  }
};

export const lookupQuotation = async (req: Request, res: Response) => {
  try {
    const customer_id = (req.query.customer_id || req.body?.customer_id) as string | undefined;
    const origin_location_id = (req.query.origin_location_id || req.body?.origin_location_id) as string | undefined;
    const destination_location_id = (req.query.destination_location_id || req.body?.destination_location_id) as string | undefined;
    const vehicle_type = (req.query.vehicle_type || req.query.vehicle_class || req.body?.vehicle_type || req.body?.vehicle_class) as string | undefined;
    const line_type = (req.query.line_type || req.query.rate_category || req.body?.line_type || req.body?.rate_category) as string | undefined;
    const billing_type = (req.query.billing_type || req.body?.billing_type) as string | undefined;
    // The web sends stops as a JSON string in the query (GET), so parse it —
    // otherwise the stops were silently ignored and never checked.
    let stops: any = req.body?.stops ?? req.query.stops;
    if (typeof stops === 'string') {
      try { stops = JSON.parse(stops); } catch { stops = undefined; }
    }

    const { quotation, candidateQuotation, matchStatus, source } = await findQuotationForLane(prisma, {
      customerId: customer_id || null,
      originLocationId: origin_location_id || null,
      destinationLocationId: destination_location_id || null,
      ...(vehicle_type !== undefined ? { vehicleType: vehicle_type || null, vehicleClass: vehicle_type || null } : {}),
      ...(line_type !== undefined ? { lineType: line_type || null } : {}),
      ...(billing_type !== undefined ? { billingType: billing_type || null } : {}),
      ...(Array.isArray(stops) ? { stops } : {}),
    });

    res.json({
      success: true,
      data: {
        quotation,
        candidate_quotation: candidateQuotation,
        candidateQuotation,
        match_status: matchStatus,
        matchStatus,
        rate_card: quotation,
        pricing_rule: quotation,
        source,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to look up quotation rate' } });
  }
};

export const getQuotationById = async (req: Request, res: Response) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: quotationInclude,
    });
    if (!quotation) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
    }
    res.json({ success: true, data: quotation });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch quotation' } });
  }
};

export const updateQuotation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, base_price, rate, driver_payout, driver_charge, default_trip_charge, currency, customerId, is_active } = req.body;
    const userId = getValidUuid((req as any).user?.id);

    const priceVal = rate ?? base_price;
    if (priceVal !== undefined) {
      const price = parseDecimalSafe(priceVal);
      if (price === null || price <= 0) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid rate between 0 and 999,999,999' } });
      }
    }

    const rawPayout = driver_payout ?? driver_charge ?? default_trip_charge;
    const payoutVal = rawPayout !== undefined ? parseDecimalSafe(rawPayout) : undefined;

    const { vehicleType: sentVehicleType, rateCategory: sentRateCategory, billingType: sentBillingType, vehicleClass: sentVehicleClass, pricingBasis: sentPricingBasis, validFrom: sentValidFrom, validTo: sentValidTo, sourceType: sentSourceType, sourceReference: sentSourceReference } = parseTierFields(req.body);

    const { updatedQuotation, priceChanged, payoutChanged, oldRate, newRate, oldPayout, newPayout } = await prisma.$transaction(async (tx) => {
      const existing = await tx.quotation.findFirst({ where: { id: id as string, deletedAt: null } });
      if (!existing) throw new Error('NOT_FOUND');

      const normalisedCustomerId = customerId === undefined ? existing.customerId : getValidUuid(customerId);
      if (!normalisedCustomerId) throw new Error('CUSTOMER_REQUIRED');

      const newRate = priceVal !== undefined ? Number(priceVal) : Number(existing.rate);
      const oldRate = Number(existing.rate);
      const priceChanged = priceVal !== undefined && oldRate !== newRate;

      const oldPayout = existing.driver_payout !== null ? Number(existing.driver_payout) : null;
      const newPayout = payoutVal !== undefined ? payoutVal : oldPayout;
      const payoutChanged = payoutVal !== undefined && oldPayout !== newPayout;

      let stopData: Array<{ sequence: number; locationId: string | null; stop_type: 'Pickup' | 'Dropoff' | 'Rest' | 'Refuel'; source_label?: string | null }> | null = null;

      if (Array.isArray(req.body.stops) && req.body.stops.length > 0) {
        stopData = await Promise.all(req.body.stops.map(async (s: any, idx: number) => {
          const rawLocId = getValidUuid(s.locationId || s.location_id || null);
          const rawName = s.source_label || s.location_name || s.name || s.label || null;
          let validLocId: string | null = null;
          let locName: string | null = rawName;

          if (rawLocId || rawName) {
            const loc = await resolveLocation(tx, { id: rawLocId, name: rawName, customerId: normalisedCustomerId }, userId);
            if (loc) {
              validLocId = loc.id;
              locName = loc.name;
            }
          }
          return {
            sequence: s.sequence ?? idx + 1,
            leg_index: s.leg_index !== undefined ? Number(s.leg_index) : 0,
            locationId: validLocId,
            stop_type: (s.stop_type || (idx === 0 ? 'Pickup' : idx === req.body.stops.length - 1 ? 'Dropoff' : 'Rest')) as any,
            source_label: locName || rawName || null,
          };
        }));
      } else if (req.body.origin_location_id || req.body.destination_location_id || req.body.origin_name || req.body.destination_name) {
        const { origin, destination } = await resolveLane(tx, req.body, userId);
        if (origin && destination) {
          stopData = [
            { sequence: 1, locationId: origin.id, stop_type: 'Pickup', source_label: origin.name },
            ...(req.body.via_location ? [{ sequence: 2, locationId: null, stop_type: 'Rest' as const, source_label: String(req.body.via_location).trim() }] : []),
            { sequence: req.body.via_location ? 3 : 2, locationId: destination.id, stop_type: 'Dropoff', source_label: destination.name },
          ];
        }
      }

      if (stopData && stopData.length > 0) {
        await tx.quotationStop.deleteMany({ where: { quotationId: id as string } });
        await tx.quotationStop.createMany({
          data: stopData.map((s) => ({ ...s, quotationId: id as string })),
        });
      }

      const lineTypeToUse = sentRateCategory || req.body.line_type || req.body.rate_category || undefined;
      const billingTypeToUse = sentBillingType || req.body.billing_type || undefined;
      const pricingBasisToUse = sentPricingBasis || req.body.pricing_basis || undefined;
      const vehicleClassToUse = sentVehicleClass || req.body.vehicle_class || undefined;
      const vehicleTypeToUse = sentVehicleType || req.body.source_vehicle_label || req.body.vehicle_type || undefined;

      let nameToUse = name ? String(name).trim() : undefined;
      if (!nameToUse && stopData && stopData.length > 0) {
        const pickupStop = stopData.find((s) => s.stop_type === 'Pickup') || stopData[0];
        const dropoffStop = stopData.filter((s) => s.stop_type === 'Dropoff').pop() || stopData[stopData.length - 1];
        const originLabel = pickupStop?.source_label || 'Origin';
        const destLabel = dropoffStop?.source_label || 'Destination';
        nameToUse = `${originLabel} → ${destLabel}`;
      }

      const updatedQuotation = await tx.quotation.update({
        where: { id: id as string },
        data: {
          ...(nameToUse !== undefined ? { name: nameToUse } : {}),
          ...(priceVal !== undefined ? { rate: newRate } : {}),
          ...(payoutVal !== undefined ? { driver_payout: payoutVal } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(customerId !== undefined ? { customerId: normalisedCustomerId } : {}),
          ...(is_active !== undefined ? { is_active } : {}),
          ...(lineTypeToUse !== undefined ? { line_type: lineTypeToUse } : {}),
          ...(billingTypeToUse !== undefined ? { operation_type: billingTypeToUse } : {}),
          ...(pricingBasisToUse !== undefined ? { pricing_basis: pricingBasisToUse } : {}),
          ...(vehicleClassToUse !== undefined ? { vehicle_class: vehicleClassToUse } : {}),
          ...(vehicleTypeToUse !== undefined ? { source_vehicle_label: vehicleTypeToUse } : {}),
          ...(sentValidFrom !== null ? { valid_from: sentValidFrom } : {}),
          ...(sentValidTo !== null ? { valid_to: sentValidTo } : {}),
          ...(sentSourceType !== null ? { source_type: sentSourceType } : {}),
          ...(sentSourceReference !== null ? { source_reference: sentSourceReference } : {}),
          updated_by: userId,
          version: existing.version + 1,
        },
        include: quotationInclude,
      });

      return {
        updatedQuotation,
        priceChanged,
        payoutChanged,
        oldRate,
        newRate,
        oldPayout,
        newPayout,
      };
    });

    if (priceChanged || payoutChanged) {
      try {
        const userObj = userId ? await prisma.user.findFirst({ where: { id: userId }, select: { name: true, username: true } }) : null;
        const userName = userObj ? (userObj.name || userObj.username) : ((req as any).user?.name || (req as any).user?.username || null);

        await prisma.quotationHistory.create({
          data: {
            quotationId: updatedQuotation.id,
            old_rate: priceChanged ? oldRate : null,
            new_rate: priceChanged ? newRate : null,
            old_driver_payout: payoutChanged ? oldPayout : null,
            new_driver_payout: payoutChanged ? newPayout : null,
            changed_by: userName,
            changed_by_user_id: userId || null,
            changed_by_name: userName,
            reason: req.body.reason || req.body.change_reason || (payoutChanged && !priceChanged ? 'Driver payout updated' : 'Quotation rate updated'),
            source: req.body.source || 'QUOTATION_MODULE',
            trip_id: req.body.trip_id || null,
          },
        });
      } catch (historyErr: any) {
        logger.warn({ err: historyErr }, 'Could not record QuotationHistory entry on quotation update');
      }
    }

    res.json({ success: true, data: updatedQuotation });
  } catch (error: any) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
    }
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
    }
    if (error.message === 'CUSTOMER_REQUIRED') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose which customer this quotation is for' } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update quotation' } });
  }
};

export const deleteQuotation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const targetId = id as string;
    const force = req.query.force === 'true' || req.body?.force === true;

    const quotation = await prisma.quotation.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, name: true }
    });

    if (!quotation) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
    }

    const linkedTripsCount = await prisma.trip.count({
      where: { quotationId: targetId, deletedAt: null }
    });

    if (linkedTripsCount > 0 && !force) {
      const label = quotation.name || targetId;
      return res.status(409).json({
        success: false,
        error: {
          code: 'REFERENTIAL_INTEGRITY_VIOLATION',
          message: `Cannot delete quotation "${label}" because it is linked to ${linkedTripsCount} active trip(s). You can archive it, or confirm force delete to detach it.`,
          details: {
            linkedTripsCount,
            canForce: true,
          },
        }
      });
    }

    await prisma.$transaction([
      prisma.trip.updateMany({ where: { quotationId: targetId }, data: { quotationId: null } }),
      prisma.surchargeRule.deleteMany({ where: { quotationId: targetId } }),
      prisma.quotationStop.deleteMany({ where: { quotationId: targetId } }),
      prisma.quotationHistory.deleteMany({ where: { quotationId: targetId } }),
      prisma.quotation.delete({ where: { id: targetId } })
    ]);
    res.json({ success: true, message: 'Quotation deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to delete quotation' } });
  }
};

export const bulkDeleteQuotations = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    const force = req.query.force === 'true' || req.body.force === true;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No IDs provided' } });
    }

    if (!force) {
      const linkedTrips = await prisma.trip.findMany({
        where: { quotationId: { in: ids }, deletedAt: null },
        select: { quotationId: true }
      });

      if (linkedTrips.length > 0) {
        const blockedQuotationIds = new Set(linkedTrips.map(t => t.quotationId).filter(Boolean));
        return res.status(409).json({
          success: false,
          error: {
            code: 'REFERENTIAL_INTEGRITY_VIOLATION',
            message: `Cannot delete selected quotation(s) because ${blockedQuotationIds.size} of them are linked to active operational trips.`,
            details: {
              linkedTripsCount: linkedTrips.length,
              canForce: true
            }
          }
        });
      }
    }

    await prisma.$transaction([
      prisma.trip.updateMany({ where: { quotationId: { in: ids } }, data: { quotationId: null } }),
      prisma.surchargeRule.deleteMany({ where: { quotationId: { in: ids } } }),
      prisma.quotationStop.deleteMany({ where: { quotationId: { in: ids } } }),
      prisma.quotationHistory.deleteMany({ where: { quotationId: { in: ids } } }),
      prisma.quotation.deleteMany({ where: { id: { in: ids } } })
    ]);
    res.json({ success: true, data: { message: `Successfully deleted ${ids.length} quotation(s)` } });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to bulk delete quotations');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to bulk delete quotations' } });
  }
};

const KNOWN_CITY_CODES = new Set([
  'RUH', 'JED', 'DMM', 'BUR', 'UNZ', 'HAI', 'HAIL', 'TAIF', 'MAK', 'TIF',
  'MED', 'YNB', 'BSH', 'EDB', 'MHY', 'MUH', 'QUN', 'AHS', 'HOF', 'JUB',
  'TUU', 'KHA', 'ABH', 'ABHA', 'NAJ', 'QUR', 'BAH', 'ELQ', 'AIRPORT', 'YNB', 'JIZ'
]);

function parseImportStops(originText: string, destinationText: string, viaText?: string): string[] {
  const clean = (s: string) => (s || '')
    .replace(/^(SHIPA|JDL|iMile|AKS|GFS|Arkan Barwan|Horizon)\s+/i, '')
    .replace(/\(.*\)/g, '')
    .replace(/\b(STATION|HUB|DEPOT|SORTING CENTER|SORTING CENTRE|DISPATCH|TRANSIT|CORRIDOR|DISTRIBUTION|LINE|ROUTE|10H|12H|MAXIMUM|DUTY)\b/gi, '')
    .trim();

  const origClean = clean(originText);
  const destClean = clean(destinationText);
  const viaClean = clean(viaText || '');

  const stops: string[] = [];

  const addStop = (raw: string) => {
    if (!raw) return;
    const str = raw.trim().replace(/^[\-\+\/→,]+|[\-\+\/→,]+$/g, '').trim();
    if (!str || str === '-' || str === '+' || str === '/') return;
    if (stops.length === 0 || stops[stops.length - 1].toUpperCase() !== str.toUpperCase()) {
      stops.push(str);
    }
  };

  addStop(origClean);
  addStop(viaClean);

  if (destClean) {
    const parts = destClean
      .split(/[\-\+\/→,]+|\s+to\s+|\s+via\s+/i)
      .map(p => p.trim())
      .filter(Boolean);

    const subParts: string[] = [];
    parts.forEach(part => {
      const words = part.split(/\s+/).filter(Boolean);
      const allAreCodes = words.length > 1 && words.every(w => KNOWN_CITY_CODES.has(w.toUpperCase()));
      if (allAreCodes) {
        words.forEach(w => subParts.push(w));
      } else {
        subParts.push(part);
      }
    });

    subParts.forEach(addStop);
  }

  return stops.length > 0 ? stops : [originText, destinationText].filter(Boolean);
}

export const bulkImportQuotations = async (req: Request, res: Response) => {
  try {
    const rows: Record<string, any>[] = req.body.rows || [];
    const userId = getValidUuid((req as any).user?.id);
    const results: any[] = [];

    const customerCache = new Map<string, any>();
    const findCustomer = async (name: string) => {
      const key = name.toLowerCase().trim();
      if (customerCache.has(key)) return customerCache.get(key);

      let customer = await prisma.customer.findFirst({
        where: { deletedAt: null, name: { equals: name.trim(), mode: 'insensitive' } },
      });
      if (!customer) {
        customer = await prisma.customer.findFirst({
          where: { deletedAt: null, name: { startsWith: name.trim(), mode: 'insensitive' } },
        });
      }
      if (!customer) {
        customer = await prisma.customer.findFirst({
          where: { deletedAt: null, name: { contains: name.trim(), mode: 'insensitive' } },
        });
      }
      if (!customer) {
        const allCustomers = await prisma.customer.findMany({ where: { deletedAt: null } });
        const cleanInput = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        customer = allCustomers.find(c => {
          const cleanName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanName.includes(cleanInput) || cleanInput.includes(cleanName);
        }) || null;
      }
      if (!customer) {
        // Auto-create missing customer on the fly
        customer = await prisma.customer.create({
          data: {
            name: name.trim(),
            contact_phone: '+966000000000',
            isActive: true,
            created_by: userId,
          },
        });
      }

      customerCache.set(key, customer);
      return customer;
    };

    const locationCache = new Map<string, any>();
    const findOrCreateLocation = async (tx: any, name: string, customerId?: string) => {
      const key = `${(customerId || 'global').toLowerCase()}:${name.trim().toLowerCase()}`;
      if (locationCache.has(key)) return locationCache.get(key);
      const location = await resolveLocation(tx, { name, customerId }, userId);
      locationCache.set(key, location);
      return location;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      const customerName = String(row.customer_name || '').trim();
      const originText = String(row.origin || '').trim();
      const destinationText = String(row.destination || row.parsed_stop_sequence || '').trim();
      const viaText = String(row.via || '').trim();
      const vehicleType = String(row.vehicle_type || '').trim();
      const operationType = String(row.operation_type || row.rate_category || row.line_type || '').trim();
      const billingType = String(row.billing_type || '').trim();
      const pricingBasisRaw = String(row.pricing_basis || '').trim();
      const currency = String(row.currency || '').trim() || 'SAR';
      const label = [customerName, operationType || null, originText, destinationText].filter(Boolean).join(' — ') || `Row ${rowNumber}`;

      try {
        if (!customerName) {
          results.push({ row: rowNumber, success: false, label, error: 'Customer is missing' });
          continue;
        }

        const rawPrice = row.rate ?? row.price ?? row.base_price ?? row.billing_rate;
        const price = Number(rawPrice);
        if (isNaN(price) || price <= 0) {
          results.push({ row: rowNumber, success: false, label, error: 'Rate is missing or not a number greater than 0' });
          continue;
        }

        const rawPayout = row.driver_payout ?? row.driver_charge ?? row.payout_rate;
        const driverPayout = rawPayout != null && rawPayout !== '' && !isNaN(Number(rawPayout)) ? Number(rawPayout) : null;

        const customer = await findCustomer(customerName);
        if (!customer) {
          results.push({
            row: rowNumber,
            success: false,
            label,
            error: `Customer "${customerName}" doesn't exist yet — import it on the Customers page first.`,
          });
          continue;
        }

        const action = await prisma.$transaction(async (tx) => {
          const stopTokens = parseImportStops(originText, destinationText, viaText);
          const resolvedStops: Array<{ locationId: string | null; label: string; sequence: number; stop_type: 'Pickup' | 'Dropoff' }> = [];

          for (let sIdx = 0; sIdx < stopTokens.length; sIdx++) {
            const tokenLabel = stopTokens[sIdx];
            const loc = await findOrCreateLocation(tx, tokenLabel, customer.id);
            resolvedStops.push({
              locationId: loc?.id || null,
              label: tokenLabel,
              sequence: sIdx + 1,
              stop_type: sIdx === 0 ? 'Pickup' : 'Dropoff',
            });
          }

          const originId = resolvedStops[0]?.locationId || null;
          const destinationId = resolvedStops[resolvedStops.length - 1]?.locationId || null;

          const lineTypeMapped =
            operationType.toLowerCase().includes('single') ? 'SINGLE_TRIP' :
            operationType.toLowerCase().includes('round') ? 'ROUND_TRIP' :
            operationType.toLowerCase().includes('10') ? '10_HRS' :
            operationType.toLowerCase().includes('12') ? '12_HRS' : operationType || 'SINGLE_TRIP';

          const pricingBasisMapped = pricingBasisRaw || (lineTypeMapped === '10_HRS' || lineTypeMapped === '12_HRS' ? 'Per Duty' : 'Per Trip');

          const name = String(row.quotation_name || row.name || '').trim() || `${customer.name} — ${originText || 'General'} → ${destinationText || 'General'}${vehicleType ? ` (${vehicleType})` : ''}`;

          const data = {
            name,
            rate: price,
            driver_payout: driverPayout,
            currency,
            customerId: customer.id,
            is_active: true,
            line_type: lineTypeMapped,
            operation_type: operationType || lineTypeMapped,
            pricing_basis: pricingBasisMapped,
            vehicle_class: vehicleType || null,
            source_vehicle_label: vehicleType || null,
            source_type: 'IMPORT',
          };

          const existing = await tx.quotation.findFirst({
            where: {
              deletedAt: null,
              customerId: customer.id,
              name,
            },
          });

          let targetId = existing?.id;

          if (existing) {
            await tx.quotation.update({
              where: { id: existing.id },
              data: { ...data, updated_by: userId, version: existing.version + 1 },
            });
          } else {
            const createdQuotation = await tx.quotation.create({ data: { ...data, created_by: userId } });
            targetId = createdQuotation.id;
          }

          if (targetId && resolvedStops.length > 0) {
            await tx.quotationStop.deleteMany({ where: { quotationId: targetId } });
            await tx.quotationStop.createMany({
              data: resolvedStops.map((s) => ({
                quotationId: targetId!,
                sequence: s.sequence,
                locationId: s.locationId,
                stop_type: s.stop_type,
                source_label: s.label,
              })),
            });
          }

          return existing ? 'updated' : 'created';
        });

        results.push({ row: rowNumber, success: true, label, action });
      } catch (err: any) {
        results.push({ row: rowNumber, success: false, label, error: err.message || 'Could not import this quotation' });
      }
    }

    const created = results.filter((r) => r.success && r.action === 'created').length;
    const updated = results.filter((r) => r.success && r.action === 'updated').length;
    const failed = results.filter((r) => !r.success).length;

    res.json({ success: true, data: { total: rows.length, created, updated, failed, results } });
  } catch (error: any) {
    logger.error({ err: error }, 'Bulk import failed');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Bulk import failed' } });
  }
};

export const getQuotationHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const history = await prisma.quotationHistory.findMany({
      where: { quotationId: id as string },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: history });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch quotation history');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch quotation history' } });
  }
};

export const getLanePriceHistory = async (req: Request, res: Response) => {
  try {
    const { origin, destination, vehicleClass, customerId } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Origin and destination are required' },
      });
    }

    const origStr = String(origin).trim().toLowerCase();
    const destStr = String(destination).trim().toLowerCase();
    const vClassStr = vehicleClass ? String(vehicleClass).trim().toLowerCase() : '';
    const custIdStr = customerId ? String(customerId).trim() : '';

    const quotations = await prisma.quotation.findMany({
      where: {
        deletedAt: null,
        ...(custIdStr ? { customerId: custIdStr } : {}),
      },
      include: {
        customer: true,
        stops: {
          include: { location: true },
          orderBy: { sequence: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const matchedQuotations = quotations.filter((q) => {
      const stops = q.stops || [];
      const firstStop = stops[0];
      const lastStop = stops.length > 1 ? stops[stops.length - 1] : firstStop;

      const qOrig = (firstStop?.source_label || firstStop?.location?.name || q.name || '').toLowerCase();
      const qDest = (lastStop?.source_label || lastStop?.location?.name || q.name || '').toLowerCase();
      const qVClass = (q.source_vehicle_label || '').toLowerCase();

      const origMatches = qOrig.includes(origStr) || origStr.includes(qOrig);
      const destMatches = qDest.includes(destStr) || destStr.includes(qDest);
      const vClassMatches = !vClassStr || qVClass.includes(vClassStr) || vClassStr.includes(qVClass);

      return origMatches && destMatches && vClassMatches;
    });

    const historyList = matchedQuotations.map((q) => {
      const firstStop = q.stops?.[0];
      const lastStop = q.stops?.[q.stops.length - 1];
      const originName = firstStop?.source_label || firstStop?.location?.name || 'Origin';
      const destName = lastStop?.source_label || lastStop?.location?.name || 'Destination';

      return {
        id: q.id,
        quotation_number: (q as any).quotation_number || q.name || `QT-${q.id.substring(0, 6)}`,
        customer_name: q.customer?.name || 'Customer',
        origin: originName,
        destination: destName,
        vehicle_class: q.source_vehicle_label || q.vehicle_class || 'Default',
        line_type: q.line_type,
        operation_type: q.operation_type,
        billing_type: q.operation_type,
        rate: Number(q.rate || 0),
        driver_payout: q.driver_payout != null ? Number(q.driver_payout) : null,
        updatedAt: q.updatedAt,
      };
    });

    res.json({
      success: true,
      data: historyList,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch lane price history');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch lane price history' },
    });
  }
};

/** Backward compatibility exported aliases for legacy callers */
export const createRateCard = createQuotation;
export const getRateCards = getQuotations;
export const lookupRateCard = lookupQuotation;
export const getRateCardById = getQuotationById;
export const updateRateCard = updateQuotation;
export const deleteRateCard = deleteQuotation;
export const bulkDeleteRateCards = bulkDeleteQuotations;
export const bulkImportRateCards = bulkImportQuotations;
export const getRateCardHistory = getQuotationHistory;
