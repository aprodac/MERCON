import { Request, Response } from 'express';
import { prisma } from '../db';
import { generateRefId } from '../utils/refId';
import { createDriverNotification, notifyOperatorsOfDelay } from './notificationController';
import { Prisma, TripStatus, StopType, DriverStatus, AssetStatus, AssignmentEntityType, DocStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { isValidTransition, completeTripAndInvoice, stampStopTransition, type DelayDetection } from '../services/tripLifecycle';
import { findRateForLane, findPricingRuleForLane, findQuotationForLane } from '../services/rateLookup';
import { resolveLocation } from './locationController';
import { resolveVehicleLocation, resolveVehicleLocationsForTrips } from '../services/locationResolver';
import { parseOptionalFloat, getValidUuid } from '../utils/uuid';
import { buildSearchAnd } from '../utils/search';
import { getCompanyLegalName } from './settingsController';
import { computeTripChargesTotal, calculateBackendTripFinancials, resolveDriverPayout, resolveInitialTripStatus, splitCoDriverPayout } from '../utils/tripFinancials';
import { resolveMonth, toDayKey } from '../utils/tripBoard';
import { validateTripDrivers, TripDriverInput, validateTripSchedule, validateTripStops } from '../services/tripValidationService';
import { recordAssignmentEvent } from '../services/fleetDispatchService';
import { buildTripRouteTimeline } from '../services/tripRouteTimeline';
import { parseFullTripStops } from '../services/legacyStopStringParser';
import { whatsappService } from '../services/whatsappService';

/** Fields the trip ledger search bar looks at. */
const TRIP_SEARCH_FIELDS = [
  'ref_id',
  'customer.name',
  'driver.first_name',
  'driver.last_name',
  'driver.ref_id',
  'vehicle.plate_number',
  'vehicle.ref_id',
  'subcontract.provider.name',
  'subcontract.driverName',
  'subcontract.vehiclePlate',
  'quotation.name',
  'stops[].location_name',
  'stops[].location_address',
  'stops[].location.code',
  'stops[].location.name',
  'stops[].location.city',
  'stops[].location.address',
];

const isUuid = (val: any): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

const normaliseName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Resolves what coordinates a bulk-imported trip's origin/destination TEXT
 * ("Riyadh") should actually get, using the customer-scoped Location records.
 */
const resolveStopCoords = async (
  placeText: string,
  customerId: string
): Promise<{ lat: number | null; lng: number | null; address: string | null; name: string; locationId: string | null } | null> => {
  const rawText = placeText.trim();
  if (!rawText) return null;

  const strippedText = rawText.replace(/^(SHIPA|IMILE|JDL|AKS|GFS|RTL|HORIZON|ARKAN)\s+/i, '').trim();

  const locationMatch = await prisma.location.findFirst({
    where: {
      deletedAt: null,
      ...(customerId ? { customerId } : {}),
      OR: [
        { code: { equals: rawText, mode: 'insensitive' } },
        { name: { equals: rawText, mode: 'insensitive' } },
        { slug: { equals: rawText.toLowerCase(), mode: 'insensitive' } },
        { code: { equals: strippedText, mode: 'insensitive' } },
        { name: { equals: strippedText, mode: 'insensitive' } },
        { slug: { equals: strippedText.toLowerCase(), mode: 'insensitive' } },
        { name: { contains: strippedText, mode: 'insensitive' } },
      ],
    },
    orderBy: customerId ? [
      { customerId: customerId ? 'asc' : 'desc' },
      { createdAt: 'asc' }
    ] : undefined
  });

  if (locationMatch) {
    return {
      lat: locationMatch.lat,
      lng: locationMatch.lng,
      address: locationMatch.address || `${locationMatch.name}, ${locationMatch.city || 'Saudi Arabia'}`,
      name: locationMatch.name || rawText,
      locationId: locationMatch.id,
    };
  }

  return {
    lat: null,
    lng: null,
    address: `${rawText}, Saudi Arabia`,
    name: rawText,
    locationId: null,
  };
};

/**
 * Matches a bulk-imported "driver_name" cell against Driver.first_name/
 * last_name, without assuming how the sheet's name maps onto those two
 * columns. A strict "first word = first_name, rest = last_name" split
 * breaks the moment a driver record was itself entered with the whole name
 * in first_name (common for single-word names, or when Drivers were
 * onboarded from a sheet that never split them) -- exactly the case that
 * made every row of a real import fail even though the driver existed.
 * Tries, in order: the literal split, the full name against first_name
 * alone, and the full name against first_name+last_name concatenated.
 */
export function normalizeDriverName(rawName: string): string {
  if (!rawName) return '';
  let s = rawName
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');

  const tokens = s.split(' ').map((t) => {
    if (['mohd', 'mhd', 'md', 'mohammed', 'mohammad', 'muhammed', 'muhammad'].includes(t)) {
      return 'muhammad';
    }
    return t;
  });

  return tokens.join(' ').trim();
}

const findDriverByFullName = async (rawName: string) => {
  if (!rawName || !rawName.trim()) return null;

  const rawClean = rawName.trim();
  const normalizedInput = normalizeDriverName(rawClean);
  const inputTokens = normalizedInput.split(' ').filter(Boolean);

  const activeDrivers = await prisma.driver.findMany({
    where: { deletedAt: null },
    select: { id: true, first_name: true, last_name: true, phone_primary: true },
  });

  if (activeDrivers.length === 0) return null;

  // Tier 1: Exact case-insensitive match on full concatenated name or first_name
  for (const d of activeDrivers) {
    const fn = (d.first_name || '').trim();
    const ln = (d.last_name || '').trim();
    const full = `${fn} ${ln}`.trim();

    if (full.toLowerCase() === rawClean.toLowerCase()) return d;
    if (fn.toLowerCase() === rawClean.toLowerCase() && !ln) return d;
  }

  // Tier 2: Normalized prefix match (e.g. MOHD IQBAL <-> MUHAMMAD IQBAL)
  for (const d of activeDrivers) {
    const fn = (d.first_name || '').trim();
    const ln = (d.last_name || '').trim();
    const normalizedDriverFull = normalizeDriverName(`${fn} ${ln}`);
    const normalizedDriverFirst = normalizeDriverName(fn);

    if (normalizedDriverFull === normalizedInput) return d;
    if (normalizedDriverFirst === normalizedInput) return d;
  }

  // Tier 3: Token set & substring matching for single or multi-word names
  const candidates: Array<{ driver: typeof activeDrivers[0]; score: number }> = [];

  for (const d of activeDrivers) {
    const fn = (d.first_name || '').trim();
    const ln = (d.last_name || '').trim();
    const driverFullNorm = normalizeDriverName(`${fn} ${ln}`);
    const driverTokens = driverFullNorm.split(' ').filter(Boolean);

    const matchedTokensCount = inputTokens.filter((it) =>
      driverTokens.some((dt) => dt === it || dt.includes(it) || it.includes(dt))
    ).length;

    if (matchedTokensCount > 0 && matchedTokensCount === inputTokens.length) {
      let score = matchedTokensCount * 10;
      if (normalizeDriverName(fn) === normalizedInput) score += 20;
      if (driverTokens.includes(inputTokens[0])) score += 5;
      candidates.push({ driver: d, score });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].driver;
  }

  // Tier 4: Loose Substring match on any driver token
  for (const d of activeDrivers) {
    const fn = (d.first_name || '').trim();
    const ln = (d.last_name || '').trim();
    const normFull = normalizeDriverName(`${fn} ${ln}`);
    if (normFull.includes(normalizedInput) || normalizedInput.includes(normFull)) {
      return d;
    }
  }

  return null;
};

export async function resolveTripId(idOrRef: string, tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<string | null> {
  if (!idOrRef || typeof idOrRef !== 'string') return null;
  const trip = await tx.trip.findFirst({
    where: {
      OR: [
        ...(isUuid(idOrRef) ? [{ id: idOrRef }] : []),
        { ref_id: idOrRef },
        { ref_id: { equals: idOrRef, mode: 'insensitive' } },
      ],
      deletedAt: null,
    },
    select: { id: true },
  });
  return trip?.id || null;
}

/**
 * Notify a driver they've been assigned a trip. Notifications target the driver
 * directly (Notification.driverId). Call after the assignment transaction commits.
 */
async function notifyDriverAssigned(
  driverId: string,
  trip: { id: string; ref_id: string | null },
) {
  try {
    await createDriverNotification(
      driverId,
      'Trip Assigned',
      `You've been assigned trip ${trip.ref_id ?? ''}. Open the app to start.`.replace('  ', ' '),
      'TripAssigned',
      'Trip',
      trip.id,
      { tripId: trip.id, ref_id: trip.ref_id, event: 'TripAssigned' }
    );
  } catch (err) {
    logger.error({ err }, 'Failed to send driver assignment notification');
  }
}

export const getTrips = async (req: Request, res: Response) => {
  try {
    const { status, driver_id, vehicle_id, customer_id, rate_card_id, search, date_filter, start_date, end_date, page = '1', per_page = '20' } = req.query;

    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause: Prisma.TripWhereInput = { deletedAt: null };
    if (status) {
      if (typeof status === 'string' && status.includes(',')) {
        whereClause.status = { in: status.split(',') as TripStatus[] };
      } else if (Array.isArray(status)) {
        whereClause.status = { in: status as TripStatus[] };
      } else {
        whereClause.status = status as TripStatus;
      }
    }
    if (driver_id) whereClause.driverId = driver_id as string;
    if (vehicle_id) whereClause.vehicleId = vehicle_id as string;
    if (customer_id) whereClause.customerId = customer_id as string;
    if (rate_card_id || req.query.pricing_rule_id || req.query.quotation_id) whereClause.quotationId = ((req.query.quotation_id || req.query.pricing_rule_id || rate_card_id) as string);
    const searchAnd = buildSearchAnd(search, TRIP_SEARCH_FIELDS) as Prisma.TripWhereInput[];

    let startDateObj: Date | undefined;
    let endDateObj: Date | undefined;
    const now = new Date();

    if (date_filter === 'Today') {
      startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (date_filter === '3Days' || date_filter === 'ThreeDays') {
      startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      endDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
    } else if (date_filter === 'Yesterday') {
      startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      endDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (date_filter === 'ThisWeek') {
      const day = now.getDay();
      const diffToSun = now.getDate() - day;
      startDateObj = new Date(now.getFullYear(), now.getMonth(), diffToSun, 0, 0, 0, 0);
      endDateObj = new Date(now.getFullYear(), now.getMonth(), diffToSun + 6, 23, 59, 59, 999);
    } else if (date_filter === 'ThisMonth') {
      startDateObj = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDateObj = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      if (start_date) {
        startDateObj = new Date(start_date as string);
        if (typeof start_date === 'string' && start_date.length <= 10) {
          startDateObj.setHours(0, 0, 0, 0);
        }
      }
      if (end_date) {
        endDateObj = new Date(end_date as string);
        if (typeof end_date === 'string' && end_date.length <= 10) {
          endDateObj.setHours(23, 59, 59, 999);
        }
      }
    }

    if (startDateObj || endDateObj) {
      const dateConditions: Prisma.TripWhereInput[] = [];
      if (startDateObj) {
        dateConditions.push({
          OR: [
            { planned_start: { gte: startDateObj } },
            { AND: [{ planned_start: null }, { createdAt: { gte: startDateObj } }] }
          ]
        });
      }
      if (endDateObj) {
        dateConditions.push({
          OR: [
            { planned_start: { lte: endDateObj } },
            { AND: [{ planned_start: null }, { createdAt: { lte: endDateObj } }] }
          ]
        });
      }
      if (dateConditions.length > 0) {
        whereClause.AND = dateConditions;
      }
    }

    // Search conditions live in AND alongside the date window — one entry per
    // typed word, so every word has to match something on the trip.
    if (searchAnd.length > 0) {
      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
        ...searchAnd,
      ];
    }

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          driver: {
            select: {
              id: true,
              ref_id: true,
              first_name: true,
              last_name: true,
              deletedAt: true,
            }
          },
          coDriver: {
            select: {
              id: true,
              ref_id: true,
              first_name: true,
              last_name: true,
              deletedAt: true,
            }
          },
          vehicle: {
            select: {
              id: true,
              ref_id: true,
              plate_number: true,
              last_lat: true,
              last_lng: true,
              last_speed_kph: true,
              last_heading: true,
              last_status: true,
              last_seen_at: true,
              icces_device_id: true,
              deletedAt: true,
            }
          },
          customer: {
            select: {
              id: true,
              name: true,
            }
          },
          quotation: {
            select: {
              id: true,
              name: true,
              rate: true,
            }
          },
          subcontract: {
            select: {
              id: true,
              driverName: true,
              driverPhone: true,
              vehiclePlate: true,
              vehicleType: true,
              cost: true,
              provider: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          },
          stops: {
            orderBy: { stop_sequence: 'asc' },
            select: {
              id: true,
              tripId: true,
              stop_sequence: true,
              stop_type: true,
              location_lat: true,
              location_lng: true,
              location_name: true,
              location_address: true,
              locationId: true,
              planned_arrival: true,
              actual_arrival: true,
              actual_departure: true,
              delay_reason: true,
              location: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  lat: true,
                  lng: true,
                  code: true,
                }
              }
            }
          },
          charges: true,
        }
      }),
      prisma.trip.count({ where: whereClause })
    ]);

    // Map quotation to rateCard for backward compatibility with frontend, and attach resolved_location for vehicle
    let vehicleLocationsMap = new Map();
    try {
      vehicleLocationsMap = await resolveVehicleLocationsForTrips(trips, prisma);
    } catch (e) {
      logger.warn({ err: e }, 'Failed to batch resolve vehicle locations for trips');
    }

    const mappedTrips = trips.map((t) => {
      const resolvedLocation = t.vehicle ? (vehicleLocationsMap.get(t.id) || null) : null;
      return {
        ...t,
        vehicle: t.vehicle
          ? {
              ...t.vehicle,
              resolved_location: resolvedLocation,
            }
          : null,
        rateCard: (t as any).quotation
          ? {
              id: (t as any).quotation.id,
              name: (t as any).quotation.name,
              base_price: Number((t as any).quotation.rate),
            }
          : null,
      };
    });

    res.json({
      success: true,
      data: mappedTrips,
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch trips');
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch trips',
        requestId: (req as any).id,
      }
    });
  }
};

export const getTripById = async (req: Request, res: Response) => {
  try {
    const idOrRef = (req.params.id as string || '').trim();
    if (!idOrRef || idOrRef === 'undefined' || idOrRef === 'null') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    const whereClause: Prisma.TripWhereInput = {
      OR: [
        ...(isUuid(idOrRef) ? [{ id: idOrRef }] : []),
        { ref_id: idOrRef },
        { ref_id: { equals: idOrRef, mode: 'insensitive' } },
      ],
      deletedAt: null,
    };

    let trip: any = null;
    try {
      trip = await prisma.trip.findFirst({
        where: whereClause,
        include: {
          financials: true,
          driver: true,
          coDriver: true,
          vehicle: true,
          customer: true,
          quotation: { include: { customer: true, stops: { include: { location: true } } } },
          subcontract: { include: { provider: true } },
          assignmentEvents: {
            orderBy: { changedAt: 'desc' },
          },
          charges: true,
          stops: { orderBy: { stop_sequence: 'asc' }, include: { location: true } }
        }
      });
    } catch (err: any) {
      logger.warn({ err }, 'Failed to fetch trip with assignmentEvents in getTripById, falling back without assignmentEvents');
      trip = await prisma.trip.findFirst({
        where: whereClause,
        include: {
          financials: true,
          driver: true,
          coDriver: true,
          vehicle: true,
          customer: true,
          quotation: { include: { customer: true, stops: { include: { location: true } } } },
          subcontract: { include: { provider: true } },
          charges: true,
          stops: { orderBy: { stop_sequence: 'asc' }, include: { location: true } }
        }
      });
      if (trip) {
        trip.assignmentEvents = [];
      }
    }

    if (!trip) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    // Map quotation to rateCard for backward compatibility with frontend
    const mappedRateCard = (trip as any).quotation ? {
      id: (trip as any).quotation.id,
      name: (trip as any).quotation.name,
      route_origin: (trip as any).quotation.stops?.[0]?.location_name || (trip as any).quotation.stops?.[0]?.location?.name || '',
      route_destination: (trip as any).quotation.stops?.[(trip as any).quotation.stops.length - 1]?.location_name || (trip as any).quotation.stops?.[(trip as any).quotation.stops.length - 1]?.location?.name || '',
      base_price: Number((trip as any).quotation.rate),
      currency: (trip as any).quotation.currency,
      vehicle_type: (trip as any).quotation.vehicle_class,
      rate_category: (trip as any).quotation.line_type,
      operation_type: (trip as any).quotation.operation_type || (trip as any).quotation.billing_type,
      billing_type: (trip as any).quotation.operation_type || (trip as any).quotation.billing_type,
      driver_payout: (trip as any).quotation.driver_payout ? Number((trip as any).quotation.driver_payout) : null
    } : null;

    let resolvedLocation = null;
    if (trip.vehicle) {
      try {
        resolvedLocation = await resolveVehicleLocation(trip.vehicle, prisma);
      } catch (e) {
        logger.warn({ err: e }, 'Failed to resolve vehicle location in getTripById');
      }
    }

    const fin = calculateBackendTripFinancials(trip as any);

    const stopIds = (trip.stops || []).map((s: any) => s.id);
    const targetEntityIds = Array.from(new Set([trip.id, trip.ref_id, ...stopIds].filter(Boolean)));

    const tripDocuments = await prisma.document.findMany({
      where: {
        OR: [
          { entity_id: { in: targetEntityIds as string[] } },
          { entity_type: 'Trip', entity_id: { in: targetEntityIds as string[] } },
          { entity_type: 'TripStop', entity_id: { in: stopIds } },
        ],
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    const tripData = {
      ...trip,
      documents: tripDocuments,
      paid_amount: fin.paidAmount,
      balance_due: fin.balanceDue,
      total_amount: fin.totalCustomerBilling,
      charges_total: fin.chargesTotal,
      primary_driver_payout: fin.primaryDriverPayout,
      co_driver_payout: fin.coDriverPayout,
      total_driver_payout: fin.totalDriverPayout,
      driver_payout: fin.primaryDriverPayout,
      driver_charge: fin.primaryDriverPayout,
      balance_margin: fin.balanceMargin,
      margin_percent: fin.marginPercent,
      vehicle: trip.vehicle
        ? {
            ...trip.vehicle,
            resolved_location: resolvedLocation,
          }
        : null,
      rateCard: mappedRateCard,
      route_timeline: buildTripRouteTimeline(trip as any),
    };

    res.json({ success: true, data: tripData });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch trip by id');
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch trip',
        requestId: (req as any).id,
      }
    });
  }
};

export const createTrip = async (req: Request, res: Response) => {
  try {
    const {
      customer_id,
      driver_id,
      co_driver_id,
      vehicle_id,
      planned_start,
      planned_end,
      billing_amount,
      trip_charges,
      co_driver_payout,
      stops,
      rate_card_id,
      vehicle_type,
      rate_category,
      billing_type,
      status: requestedStatus,
      dispatch_now,
      is_third_party,
      third_party_provider_id,
      third_party_driver_name,
      third_party_driver_phone,
      third_party_vehicle_plate,
      third_party_vehicle_type,
      third_party_cost,
    } = req.body;

    const createdBy = isUuid((req as any).user?.id) ? (req as any).user.id : null;
    const parsedPlannedStart = (planned_start && !isNaN(Date.parse(planned_start)))
      ? new Date(planned_start)
      : null;
    const parsedPlannedEnd = (planned_end && !isNaN(Date.parse(planned_end)))
      ? new Date(planned_end)
      : null;

    // Validate schedule invariant: planned_start < planned_end and stop chronology
    const scheduleValidation = validateTripSchedule(parsedPlannedStart, parsedPlannedEnd, stops);
    if (!scheduleValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: scheduleValidation.error || 'Drop-off date and time must be strictly later than start date and time',
        },
      });
    }

    if (stops && Array.isArray(stops) && stops.length > 0) {
      const stopValidation = validateTripStops(stops);
      if (!stopValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: stopValidation.error || 'Invalid trip stops configuration.',
          },
        });
      }
    }

    // Determine target status:
    // If explicitly requested as 'Dispatched' or dispatch_now is true (and both driver+vehicle present):
    //   Sets status = TripStatus.Dispatched, claims driver & vehicle to OnTrip.
    // Otherwise:
    //   Creates in TripStatus.Draft (Scheduled). Driver/vehicle assignments are recorded on the trip manifest
    //   without locking driver/vehicle to OnTrip until actively dispatched.
    const isDispatchingNow = false;
    let targetStatus = requestedStatus || TripStatus.Scheduled;
    targetStatus = resolveInitialTripStatus(targetStatus, requestedStatus, parsedPlannedStart);

    const carrierName = await getCompanyLegalName();


    let trip;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const ref_id = await generateRefId('TRP', () =>
          prisma.trip.findMany({ where: { deletedAt: null }, select: { ref_id: true } }));

        trip = await prisma.$transaction(async (tx) => {
          const customer = await tx.customer.findFirst({ where: { id: customer_id, deletedAt: null } });
          if (!customer) {
            throw new Error('CUSTOMER_NOT_FOUND');
          }

          // Driver and vehicle are optional — dispatchers can create the trip
          // now and assign either later via dispatchTrip.
          if (driver_id) {
            const driver = await tx.driver.findFirst({ where: { id: driver_id, deletedAt: null } });
            if (!driver) {
              throw new Error('DRIVER_NOT_FOUND');
            }

            // Only claim the driver to OnTrip if we are actively dispatching right now
            if (isDispatchingNow) {
              const driverClaim = await tx.driver.updateMany({
                where: { id: driver_id, status: 'Available' },
                data: { status: 'OnTrip' },
              });
              if (driverClaim.count === 0) {
                throw new Error('DRIVER_UNAVAILABLE');
              }
            }
          }

          if (vehicle_id) {
            const vehicle = await tx.vehicle.findFirst({ where: { id: vehicle_id, deletedAt: null } });
            if (!vehicle) {
              throw new Error('VEHICLE_NOT_FOUND');
            }

            // Block the trip if the vehicle has maintenance scheduled on the planned trip date
            if (parsedPlannedStart) {
              const maintenanceConflict = await tx.maintenanceRecord.findFirst({
                where: {
                  vehicleId: vehicle_id,
                  deletedAt: null,
                  status: { in: ['Scheduled', 'In_Progress', 'In Progress'] },
                  start_date: { lte: parsedPlannedStart },
                  OR: [
                    { end_date: null },
                    { end_date: { gte: parsedPlannedStart } },
                  ],
                },
                select: { start_date: true, end_date: true, workshop_name: true },
              });
              if (maintenanceConflict) {
                throw new Error('VEHICLE_ON_MAINTENANCE');
              }
            }

            // Only claim the vehicle to OnTrip if we are actively dispatching right now
            if (isDispatchingNow) {
              const vehicleClaim = await tx.vehicle.updateMany({
                where: { id: vehicle_id, status: 'Available' },
                data: { status: 'OnTrip' },
              });
              if (vehicleClaim.count === 0) {
                throw new Error('VEHICLE_UNAVAILABLE');
              }
            }
          }

          // The lane this trip runs, taken from the stops.
          const rawStops: any[] = Array.isArray(stops) ? stops : [];
          const resolvedStops = await Promise.all(
            rawStops.map(async (stop: any) => {
              const stopName = String(stop.location_name ?? '').trim();
              let locId = stop.location_id || null;
              if (locId) {
                const loc = await resolveLocation(tx, { id: locId, customerId: customer_id, skipCanonicalUpdate: true }, createdBy);
                if (loc) locId = loc.id;
              } else if (stopName) {
                try {
                  const loc = await resolveLocation(
                    tx,
                    {
                      customerId: customer_id,
                      name: stopName,
                      address: String(stop.location_address ?? '').trim() || null,
                      lat: parseOptionalFloat(stop.lat),
                      lng: parseOptionalFloat(stop.lng),
                      skipCanonicalUpdate: !stop.update_canonical_location,
                    },
                    createdBy
                  );
                  if (loc) locId = loc.id;
                } catch (e) {
                  logger.warn({ err: e }, 'Failed to resolve location for trip stop');
                }
              }

              if (stop.update_canonical_location === true && locId) {
                const parsedLat = parseOptionalFloat(stop.lat);
                const parsedLng = parseOptionalFloat(stop.lng);
                try {
                  await tx.location.update({
                    where: { id: locId },
                    data: {
                      ...(parsedLat != null ? { lat: parsedLat } : {}),
                      ...(parsedLng != null ? { lng: parsedLng } : {}),
                      ...(stop.location_address ? { address: String(stop.location_address).trim() } : {}),
                      coordinate_precision: 'EXACT',
                      updated_by: createdBy,
                    },
                  });
                } catch (uErr) {
                  logger.warn({ err: uErr }, 'Failed to update canonical location master data during trip creation');
                }
              }

              return { ...stop, location_id: locId };
            })
          );

          const originLocationId =
            resolvedStops.find((s) => s.stop_type === 'Pickup')?.location_id ?? resolvedStops[0]?.location_id ?? null;
          const destinationLocationId =
            [...resolvedStops].reverse().find((s) => s.stop_type === 'Dropoff')?.location_id ??
            resolvedStops[resolvedStops.length - 1]?.location_id ??
            null;

          const targetQuotationId = req.body.quotation_id || req.body.pricing_rule_id || rate_card_id;
          let appliedQuotation = null;
          if (targetQuotationId) {
            appliedQuotation = await tx.quotation.findFirst({
              where: { id: targetQuotationId, customerId: customer_id, deletedAt: null },
            });
            if (!appliedQuotation) {
              throw new Error('CROSS_CUSTOMER_QUOTATION_MISMATCH: Quotation belongs to a different customer.');
            }
          }

          if (!appliedQuotation) {
            const { quotation } = await findQuotationForLane(tx, {
              customerId: customer_id,
              originLocationId,
              destinationLocationId,
              ...(vehicle_type !== undefined ? { vehicleType: vehicle_type } : {}),
              ...(rate_category !== undefined ? { lineType: rate_category } : {}),
              ...(billing_type !== undefined ? { billingType: billing_type } : {}),
            });
            appliedQuotation = quotation;
          }

          const finalVehicleType = vehicle_type !== undefined ? vehicle_type : (appliedQuotation?.source_vehicle_label ?? appliedQuotation?.vehicle_class ?? null);
          const finalRateCategory = rate_category !== undefined ? rate_category : (appliedQuotation?.line_type ?? null);
          const finalBillingType = billing_type !== undefined ? billing_type : (appliedQuotation?.billing_type ?? null);

          let defaultBilling: number | null = null;
          if (billing_amount !== undefined && billing_amount !== null && !isNaN(Number(billing_amount))) {
            defaultBilling = Number(billing_amount);
          } else if (appliedQuotation) {
            const isMonthlyCard = (appliedQuotation.billing_type || '').toLowerCase().includes('monthly') || (appliedQuotation.line_type || '').toLowerCase().includes('monthly');
            defaultBilling = isMonthlyCard ? Math.round((Number(appliedQuotation.rate) / 30) * 100) / 100 : Number(appliedQuotation.rate);
          }

          const rawTripCharges = trip_charges ?? req.body.driver_payout ?? req.body.driver_charge;
          const totalPayout = (rawTripCharges !== undefined && rawTripCharges !== null && !isNaN(Number(rawTripCharges)))
            ? Number(rawTripCharges)
            : (appliedQuotation?.driver_payout ? Number(appliedQuotation.driver_payout) : 0);

          const { driverPayout: finalDriverPayout, coDriverPayout: finalCoDriverPayout } = splitCoDriverPayout({
            totalPayout,
            hasCoDriver: Boolean(co_driver_id),
            explicitCoDriverPayout: co_driver_payout,
          });

          const updateQuotationPayout = req.body.update_quotation_driver_payout === true || req.body.update_quotation_payout === true;
          if (updateQuotationPayout && appliedQuotation) {
            const oldPayout = appliedQuotation.driver_payout != null ? Number(appliedQuotation.driver_payout) : null;
            if (oldPayout !== totalPayout) {
              await tx.quotation.update({
                where: { id: appliedQuotation.id },
                data: { driver_payout: totalPayout, updated_by: createdBy },
              });

              try {
                const userObj = createdBy ? await tx.user.findFirst({ where: { id: createdBy }, select: { name: true, username: true } }) : null;
                const userName = userObj ? (userObj.name || userObj.username) : ((req as any).user?.name || (req as any).user?.username || null);

                await tx.quotationHistory.create({
                  data: {
                    quotationId: appliedQuotation.id,
                    old_driver_payout: oldPayout,
                    new_driver_payout: totalPayout,
                    changed_by: userName,
                    changed_by_user_id: createdBy,
                    changed_by_name: userName,
                    reason: req.body.change_reason || 'Updated driver payout during trip creation',
                    source: 'TRIP_CREATION',
                  },
                });
              } catch (hErr) {
                logger.warn({ err: hErr }, 'Failed to record quotation history for driver payout update during trip creation');
              }
            }
          }

          return tx.trip.create({
            data: {
              ref_id,
              customerId: customer_id,
              driver_workflow: customer.driver_workflow || 'NATIVE',
              ...(driver_id ? { driverId: driver_id } : {}),
              ...(co_driver_id ? { co_driver_id: co_driver_id } : {}),
              ...(vehicle_id ? { vehicleId: vehicle_id } : {}),
              co_driver_payout: finalCoDriverPayout,
              planned_start: parsedPlannedStart,
              planned_end: parsedPlannedEnd,
              status: targetStatus,
              carrier_name: carrierName,
              ...(createdBy ? { created_by: createdBy } : {}),
              financials: {
                create: {
                  quotationId: appliedQuotation ? appliedQuotation.id : null,
                  quotation_line_type: appliedQuotation ? (appliedQuotation.line_type || null) : (finalRateCategory || null),
                  quotation_operation_type: appliedQuotation ? (appliedQuotation.operation_type || appliedQuotation.billing_type || null) : (finalBillingType || null),
                  quotation_pricing_basis: appliedQuotation ? (appliedQuotation.pricing_basis || null) : null,
                  applied_rate: appliedQuotation ? (appliedQuotation.rate != null ? Number(appliedQuotation.rate) : null) : (defaultBilling != null ? defaultBilling : null),
                  quotation_vehicle_class: appliedQuotation ? (appliedQuotation.vehicle_class || null) : null,
                  quotation_source_vehicle_label: appliedQuotation ? (appliedQuotation.source_vehicle_label || null) : (finalVehicleType || null),
                },
              },
              ...(appliedQuotation ? {
                quotationId: appliedQuotation.id,
              } : {}),
              ...(finalVehicleType !== null ? { vehicle_type: finalVehicleType } : {}),
              ...(finalRateCategory !== null ? { rate_category: finalRateCategory } : {}),
              ...(finalBillingType !== null ? { operation_type: finalBillingType } : {}),
              ...(defaultBilling !== null ? { billing_amount: defaultBilling } : {}),
              driver_payout: finalDriverPayout,
              is_third_party: is_third_party === true,
              ...(is_third_party ? {
                subcontract: {
                  create: {
                    providerId: third_party_provider_id || null,
                    driverName: third_party_driver_name || null,
                    driverPhone: third_party_driver_phone || null,
                    vehiclePlate: third_party_vehicle_plate || null,
                    vehicleType: third_party_vehicle_type || null,
                    cost: third_party_cost ? Number(third_party_cost) : 0,
                  }
                }
              } : {}),
              stops: {
                create: resolvedStops.map((stop: any, index: number) => {
                  const rawLat = parseOptionalFloat(stop.lat);
                  const rawLng = parseOptionalFloat(stop.lng);
                  const isValidCoord = rawLat != null && rawLng != null && (rawLat !== 0 || rawLng !== 0) && rawLat >= -90 && rawLat <= 90 && rawLng >= -180 && rawLng <= 180;
                  const latVal = isValidCoord ? rawLat : null;
                  const lngVal = isValidCoord ? rawLng : null;
                  const precisionVal = stop.coordinate_precision || stop.location_coordinate_precision || (latVal == null || lngVal == null ? 'UNKNOWN' : 'APPROXIMATE');
                  let stopPlannedArrival: Date | null = null;
                  if (stop.planned_arrival && !isNaN(Date.parse(stop.planned_arrival))) {
                    stopPlannedArrival = new Date(stop.planned_arrival);
                  } else if (index === 0 && parsedPlannedStart) {
                    stopPlannedArrival = parsedPlannedStart;
                  } else if (index === resolvedStops.length - 1 && parsedPlannedEnd) {
                    stopPlannedArrival = parsedPlannedEnd;
                  }
                  return {
                    stop_sequence: index + 1,
                    leg_index: stop.leg_index !== undefined ? Number(stop.leg_index) : 0,
                    stop_type: stop.stop_type as StopType,
                    location_lat: latVal,
                    location_lng: lngVal,
                    location_coordinate_precision: precisionVal,
                    location_name: String(stop.location_name ?? '').trim() || null,
                    location_address: String(stop.location_address ?? '').trim() || null,
                    locationId: stop.location_id || null,
                    planned_arrival: stopPlannedArrival,
                  };
                }),
              }
            },
            include: {
              stops: { orderBy: { stop_sequence: 'asc' }, include: { location: true } },
              subcontract: { include: { provider: true } },
              customer: true,
              driver: true,
              vehicle: true,
              quotation: true,
            }
          });
        });

        break;
      } catch (err: any) {
        if (err.code === 'P2002' && attempts < maxAttempts) {
          logger.warn({ err }, `Unique constraint collision on ref_id. Retrying attempt ${attempts + 1}...`);
          continue;
        }
        throw err;
      }
    }

    if (!trip) {
      throw new Error('FAILED_TO_CREATE_TRIP');
    }

    // Notify driver asynchronously only if actively dispatched now
    if (driver_id && isDispatchingNow) {
      await notifyDriverAssigned(driver_id, trip);
    }

    res.status(201).json({ success: true, data: trip });
  } catch (error: any) {
    logger.error(
      {
        err: error,
        customer_id: req.body?.customer_id,
        driver_id: req.body?.driver_id,
        co_driver_id: req.body?.co_driver_id,
        vehicle_id: req.body?.vehicle_id,
      },
      'Failed to create trip'
    );
    if (
      error.message === 'CUSTOMER_NOT_FOUND' ||
      error.message === 'DRIVER_NOT_FOUND' ||
      error.message === 'VEHICLE_NOT_FOUND' ||
      error.message === 'DRIVER_UNAVAILABLE' ||
      error.message === 'VEHICLE_UNAVAILABLE' ||
      error.message === 'VEHICLE_ON_MAINTENANCE'
    ) {
      return res.status(400).json({ success: false, error: { code: 'CONFLICT', message: error.message } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to create trip' } });
  }
};

function parseDestinationAndStops(destinationStr: string): { destinationName: string; returnDestinationName: string | null } {
  if (destinationStr.includes('[RETURN:')) {
    const parts = destinationStr.split('[RETURN:');
    const destinationName = parts[0].trim();
    const returnContent = parts[1].replace(']', '').trim();
    return { destinationName, returnDestinationName: returnContent };
  }
  return { destinationName: destinationStr, returnDestinationName: null };
}

export const bulkImportTrips = async (req: Request, res: Response) => {
  try {
    const { rows } = req.body as {
      rows: Array<{
        customer_id?: string;
        customer_name?: string;
        driver_id?: string;
        driver_name?: string;
        co_driver_id?: string;
        co_driver_payout?: number;
        vehicle_id?: string;
        vehicle_plate?: string;
        planned_start?: string;
        planned_end?: string;
        rate_category?: string;
        vehicle_type?: string;
        billing_type?: string;
        billing_amount?: number;
        trip_charges?: number;
        origin?: string;
        destination?: string;
        stops?: Array<{
          stop_sequence?: number;
          leg_index?: number;
          stop_type?: string;
          location_name?: string;
          location_address?: string;
          location_id?: string;
          lat?: number | null;
          lng?: number | null;
        }>;
        status?: TripStatus;
        is_third_party?: boolean;
        third_party_provider_id?: string;
        third_party_provider_name?: string;
        third_party_driver_name?: string;
        third_party_driver_phone?: string;
        third_party_vehicle_plate?: string;
        third_party_vehicle_type?: string;
        third_party_cost?: number;
        additional_charge?: number;
      }>;
    };
    const createdBy = isUuid((req as any).user?.id) ? (req as any).user.id : null;

    const results: Array<{ row: number; success: boolean; ref_id?: string; created_id?: string; error?: string }> = [];
    let carrierName = 'MERCON Operations Ltd.';
    try {
      carrierName = await getCompanyLegalName();
    } catch (err) {
      carrierName = 'MERCON Operations Ltd.';
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let customer: any = null;
        if (row.customer_id) {
          customer = await prisma.customer.findFirst({ where: { id: row.customer_id, deletedAt: null } });
        } else if (row.customer_name) {
          const cName = String(row.customer_name).trim();
          customer = await prisma.customer.findFirst({
            where: {
              OR: [
                { name: { equals: cName, mode: 'insensitive' } },
                { name: { contains: cName, mode: 'insensitive' } },
              ],
              deletedAt: null,
            },
          });
        }
        if (!customer) throw new Error('Customer not found');

        let driverId: string | null = null;
        if (row.driver_id) {
          const driver = await prisma.driver.findFirst({ where: { id: row.driver_id, deletedAt: null } });
          if (driver) driverId = driver.id;
        } else if (row.driver_name) {
          const matched = await findDriverByFullName(row.driver_name);
          if (matched) driverId = matched.id;
        }

        let vehicleId: string | null = null;
        if (row.vehicle_id) {
          const vehicle = await prisma.vehicle.findFirst({ where: { id: row.vehicle_id, deletedAt: null } });
          if (vehicle) vehicleId = vehicle.id;
        } else if (row.vehicle_plate) {
          const vehicle = await prisma.vehicle.findFirst({
            where: { plate_number: { equals: row.vehicle_plate, mode: 'insensitive' }, deletedAt: null },
          });
          if (vehicle) vehicleId = vehicle.id;
        }

        let thirdPartyProviderId: string | null = null;
        if (row.is_third_party) {
          if (row.third_party_provider_id) {
            const provider = await prisma.thirdPartyProvider.findFirst({
              where: { id: row.third_party_provider_id, deletedAt: null }
            });
            if (provider) thirdPartyProviderId = provider.id;
          } else if (row.third_party_provider_name) {
            const provider = await prisma.thirdPartyProvider.findFirst({
              where: { name: { equals: row.third_party_provider_name.trim(), mode: 'insensitive' }, deletedAt: null }
            });
            if (provider) thirdPartyProviderId = provider.id;
          }
        }

        const parsedPlannedStart = (row.planned_start && !isNaN(Date.parse(row.planned_start)))
          ? new Date(row.planned_start)
          : null;

        const parsedPlannedEnd = (row.planned_end && !isNaN(Date.parse(row.planned_end)))
          ? new Date(row.planned_end)
          : null;

        let targetStatus: TripStatus = row.status && Object.values(TripStatus).includes(row.status)
          ? row.status
          : TripStatus.Scheduled;
        targetStatus = resolveInitialTripStatus(targetStatus, row.status, parsedPlannedStart);


        const ref_id = await generateRefId('TRP', () =>
          prisma.trip.findMany({ where: { deletedAt: null }, select: { ref_id: true } }));

        const parsedDest = parseDestinationAndStops(row.destination || '');
        const originCoords = row.origin ? await resolveStopCoords(row.origin, customer.id) : null;
        const destinationCoords = parsedDest.destinationName ? await resolveStopCoords(parsedDest.destinationName, customer.id) : null;
        const returnDestinationCoords = parsedDest.returnDestinationName ? await resolveStopCoords(parsedDest.returnDestinationName, customer.id) : null;
        
        const thirdPartyCostVal = row.third_party_cost !== undefined && row.third_party_cost !== null && !isNaN(Number(row.third_party_cost))
          ? Number(row.third_party_cost)
          : undefined;

        const targetQuotationId = (row as any).quotation_id || (row as any).rate_card_id || null;
        let appliedQuotation: any = null;
        if (targetQuotationId) {
          appliedQuotation = await prisma.quotation.findFirst({
            where: { id: targetQuotationId, customerId: customer.id, deletedAt: null },
            include: { stops: { orderBy: { sequence: 'asc' }, include: { location: true } } },
          });
        }

        // Structured `row.stops` (leg_index-aware, built by the trip wizard) is the
        // authoritative source whenever it's present. `parseFullTripStops` only
        // exists to derive stops from the legacy origin/destination strings for
        // rows that don't carry structured stops (true CSV imports). It used to
        // run unconditionally and splice its own first/last stop onto the front
        // and back of `row.stops` even when structured stops were already
        // correct — silently duplicating the origin and destination on every
        // trip created through the wizard (see TRP-0252 investigation).
        let parsedStops = Array.isArray(row.stops) && row.stops.length > 0
          ? row.stops.map((st, idx) => ({
              stop_sequence: st.stop_sequence ?? (idx + 1),
              leg_index: st.leg_index !== undefined ? Number(st.leg_index) : 0,
              stop_type: (st.stop_type || 'Rest') as 'Pickup' | 'Dropoff' | 'Rest',
              location_name: String(st.location_name ?? '').trim(),
              location_id: st.location_id || null,
              lat: st.lat ?? null,
              lng: st.lng ?? null,
            }))
          : ((row.origin || row.destination) ? parseFullTripStops(row.origin || '', row.destination || '') : []);

        if (parsedStops.length === 0 && appliedQuotation?.stops && appliedQuotation.stops.length > 0) {
          const isQuoRound = (appliedQuotation.line_type || row.rate_category || '').toLowerCase().includes('round');
          parsedStops = appliedQuotation.stops.map((qs: any, idx: number) => ({
            stop_sequence: idx + 1,
            leg_index: (qs.leg_index !== undefined && qs.leg_index !== null) ? Number(qs.leg_index) : 0,
            stop_type: (qs.stop_type || (idx === 0 ? 'Pickup' : 'Dropoff')) as 'Pickup' | 'Dropoff',
            location_name: qs.location_name || qs.source_label || qs.location?.name || '',
            location_id: qs.location_id || qs.locationId || null,
            lat: qs.lat ?? qs.location?.lat ?? null,
            lng: qs.lng ?? qs.location?.lng ?? null,
          }));
        }

        if (parsedStops.length > 0) {
          const stopValidation = validateTripStops(parsedStops);
          if (!stopValidation.isValid) {
            throw new Error(stopValidation.error || 'Invalid trip stops configuration.');
          }
        }

        const resolvedImportStops = await Promise.all(
          parsedStops.map(async (st, idx, arr) => {
            let latVal = st.lat ?? null;
            let lngVal = st.lng ?? null;
            let addressVal: string | null = null;
            let locIdVal: string | null = st.location_id ?? null;

            if (locIdVal) {
              const loc = await prisma.location.findFirst({ where: { id: locIdVal, deletedAt: null } });
              if (loc) {
                if (latVal == null) latVal = loc.lat;
                if (lngVal == null) lngVal = loc.lng;
                addressVal = loc.address;
              }
            } else if (st.location_name) {
              const coords = await resolveStopCoords(st.location_name, customer.id);
              if (coords) {
                if (latVal == null) latVal = coords.lat;
                if (lngVal == null) lngVal = coords.lng;
                addressVal = coords.address;
                locIdVal = coords.locationId;
              }
            }

            // Enforce invariant: (0, 0) is never legitimate; unknown coordinates are strictly NULL
            if (latVal === 0 && lngVal === 0) {
              latVal = null;
              lngVal = null;
            }
            return {
              stop_sequence: st.stop_sequence,
              leg_index: st.leg_index ?? 0,
              stop_type: st.stop_type as any,
              location_name: st.location_name || null,
              location_address: addressVal,
              locationId: locIdVal,
              location_lat: latVal,
              location_lng: lngVal,
              planned_arrival: idx === 0 ? parsedPlannedStart : (idx === arr.length - 1 ? parsedPlannedEnd : null),
            };
          })
        );

        const rawRowPayout = (row as any).driver_payout ?? (row as any).driver_charge ?? (row as any).trip_charges;
        const totalRowPayout = (rawRowPayout !== undefined && rawRowPayout !== null && !isNaN(Number(rawRowPayout)))
          ? Number(rawRowPayout)
          : (thirdPartyCostVal !== undefined ? thirdPartyCostVal : (appliedQuotation?.driver_payout != null ? Number(appliedQuotation.driver_payout) : 0));

        const { driverPayout: finalRowDriverPayout, coDriverPayout: finalRowCoDriverPayout } = splitCoDriverPayout({
          totalPayout: totalRowPayout,
          hasCoDriver: Boolean(row.co_driver_id),
          explicitCoDriverPayout: row.co_driver_payout,
        });

        const trip = await prisma.$transaction(async (tx) => {
          return tx.trip.create({
            data: {
              ref_id,
              customerId: customer.id,
              driver_workflow: customer.driver_workflow || 'NATIVE',
              ...(driverId ? { driverId } : {}),
              ...(row.co_driver_id ? { co_driver_id: row.co_driver_id } : {}),
              co_driver_payout: finalRowCoDriverPayout,
              ...(vehicleId ? { vehicleId } : {}),
              ...(appliedQuotation ? { quotationId: appliedQuotation.id } : {}),
              is_third_party: Boolean(row.is_third_party),
              ...(row.is_third_party ? {
                subcontract: {
                  create: {
                    providerId: thirdPartyProviderId || null,
                    driverName: row.third_party_driver_name?.trim() || null,
                    driverPhone: row.third_party_driver_phone?.trim() || null,
                    vehiclePlate: row.third_party_vehicle_plate?.trim() || null,
                    vehicleType: row.third_party_vehicle_type || row.vehicle_type || null,
                    cost: thirdPartyCostVal || 0,
                  }
                }
              } : {}),
              planned_start: parsedPlannedStart,
              planned_end: parsedPlannedEnd,
              status: targetStatus,
              financials: {
                create: {
                  quotationId: appliedQuotation ? appliedQuotation.id : null,
                  quotation_line_type: appliedQuotation?.line_type || row.rate_category || null,
                  quotation_source_vehicle_label: appliedQuotation?.source_vehicle_label || row.vehicle_type || null,
                  quotation_operation_type: (appliedQuotation as any)?.operation_type || row.billing_type || (row as any).operation_type || null,
                  applied_rate: row.billing_amount !== undefined && row.billing_amount !== null && !isNaN(Number(row.billing_amount))
                    ? Number(row.billing_amount)
                    : (appliedQuotation?.rate != null ? Number(appliedQuotation.rate) : null),
                }
              },
              ...(row.rate_category ? { rate_category: row.rate_category } : (appliedQuotation?.line_type ? { rate_category: appliedQuotation.line_type } : {})),
              ...(row.vehicle_type ? { vehicle_type: row.vehicle_type } : (appliedQuotation?.source_vehicle_label ? { vehicle_type: appliedQuotation.source_vehicle_label } : {})),
              ...((row.billing_type || (row as any).operation_type)
                ? { operation_type: row.billing_type || (row as any).operation_type }
                : ((appliedQuotation as any)?.operation_type ? { operation_type: (appliedQuotation as any).operation_type } : {})),
              ...(row.billing_amount !== undefined && row.billing_amount !== null && !isNaN(Number(row.billing_amount))
                ? { billing_amount: Number(row.billing_amount) }
                : (appliedQuotation?.rate != null ? { billing_amount: Number(appliedQuotation.rate) } : {})),
              driver_payout: finalRowDriverPayout,
              ...(createdBy ? { created_by: createdBy } : {}),
              ...(row.additional_charge !== undefined && row.additional_charge !== null && !isNaN(Number(row.additional_charge)) && Number(row.additional_charge) > 0 ? {
                charges: {
                  create: [{
                    amount: Number(row.additional_charge),
                    description: 'Additional Charge',
                    ...(createdBy ? { created_by: createdBy } : {})
                  }]
                }
              } : {}),
              ...(resolvedImportStops.length > 0 ? {
                stops: {
                  create: resolvedImportStops,
                }
              } : {})
            } as any,
          });
        });

        if (driverId && targetStatus === TripStatus.Scheduled) {
          try {
            await notifyDriverAssigned(driverId, trip);
          } catch (e) {
            // Notification failure shouldn't abort trip creation
          }
        }

        results.push({ row: i + 1, success: true, ref_id: trip.ref_id ?? undefined, created_id: trip.id });
      } catch (err: any) {
        results.push({ row: i + 1, success: false, error: err.message || 'Failed to import row' });
      }
    }

    const imported = results.filter(r => r.success).length;
    res.status(200).json({
      success: true,
      data: { results, imported, failed: results.length - imported },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to bulk import trips');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to import trips' } });
  }
};

export const updateTripStatus = async (req: Request, res: Response) => {
  try {
    let status = req.body.status;
    if (status === 'AtPickup') status = TripStatus.Loading;
    if (status === 'Dispatched') status = TripStatus.Scheduled;
    if (status === 'AtDelivery') status = TripStatus.InTransit;

    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    if (!Object.values(TripStatus).includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } });
    }

    let delay: DelayDetection | null = null;
    let shouldNotifyDriver = false;
    let driverToNotify: string | null = null;

    const trip = await prisma.$transaction(async (tx) => {
      const current = await tx.trip.findUnique({ where: { id: tripId } });
      if (!current) throw new Error('NOT_FOUND');
      if (!isValidTransition(current.status, status)) throw new Error('INVALID_TRANSITION');

      // Moving to active operational status (Scheduled, Loading, InTransit, Delayed):
      // Update driver & vehicle status to OnTrip without failing if already assigned
      if (status === TripStatus.Scheduled || status === TripStatus.Loading || status === TripStatus.InTransit || status === TripStatus.Delayed) {
        if (current.driverId) {
          await tx.driver.update({
            where: { id: current.driverId },
            data: { status: DriverStatus.OnTrip },
          });
          shouldNotifyDriver = true;
          driverToNotify = current.driverId;
        }
        if (current.vehicleId) {
          await tx.vehicle.update({
            where: { id: current.vehicleId },
            data: { status: AssetStatus.OnTrip },
          });
        }
      }

      // Reverting back to Draft: release driver and vehicle back to Available
      if (status === TripStatus.Draft && current.status !== TripStatus.Draft) {
        if (current.driverId) {
          await tx.driver.update({ where: { id: current.driverId }, data: { status: DriverStatus.Available } });
        }
        if (current.vehicleId) {
          await tx.vehicle.update({ where: { id: current.vehicleId }, data: { status: AssetStatus.Available } });
        }
      }

      // Completing a trip always goes through the shared helper so every
      // path that can complete a trip also generates its invoice.
      if (status === TripStatus.Completed) {
        return completeTripAndInvoice(tx, tripId, (req as any).user?.id);
      }

      const updateData: any = { status: status as TripStatus, updated_by: (req as any).user?.id };
      if (status === 'InTransit') updateData.actual_start = new Date();

      const updated = await tx.trip.update({ where: { id: tripId }, data: updateData });

      delay = await stampStopTransition(tx, tripId, status as TripStatus);

      // Leaving the trip permanently via Cancelled must release the
      // driver/vehicle back to Available — otherwise they stay stuck on
      // "OnTrip" with no trip left to free them.
      if (status === TripStatus.Cancelled) {
        if (updated.driverId) {
          await tx.driver.update({ where: { id: updated.driverId }, data: { status: DriverStatus.Available } });
        }
        if (updated.vehicleId) {
          await tx.vehicle.update({ where: { id: updated.vehicleId }, data: { status: AssetStatus.Available } });
        }
      }

      return updated;
    });

    // Notify driver if trip was dispatched
    if (shouldNotifyDriver && driverToNotify) {
      await notifyDriverAssigned(driverToNotify, trip);
    }

    // Notify driver if trip was cancelled
    if (status === TripStatus.Cancelled && trip.driverId) {
      try {
        await createDriverNotification(
          trip.driverId,
          'Trip Cancelled',
          `Trip ${trip.ref_id ?? ''} has been cancelled.`.replace('  ', ' '),
          'TripCancelled',
          'Trip',
          trip.id,
          { tripId: trip.id, ref_id: trip.ref_id, event: 'TripCancelled' }
        );
      } catch (err) {
        logger.error({ err }, 'Failed to send driver cancellation notification');
      }
    }

    // Alerted only once the transaction has committed, so operators are never
    // told about a delay on a trip update that then rolled back.
    if (delay) await notifyOperatorsOfDelay(delay);

    res.json({ success: true, data: trip });
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    if (error.message === 'INVALID_TRANSITION') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSITION', message: 'That status change is not allowed from the trip\'s current state' } });
    }
    if (error.message === 'MISSING_ASSIGNMENT') {
      return res.status(400).json({ success: false, error: { code: 'MISSING_ASSIGNMENT', message: 'Assign a driver and vehicle before dispatching this trip' } });
    }
    if (error.message === 'DRIVER_UNAVAILABLE' || error.message === 'VEHICLE_UNAVAILABLE') {
      return res.status(400).json({ success: false, error: { code: 'CONFLICT', message: error.message } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update trip status' } });
  }
};


// ==========================================
// PHASE 1: DISPATCH & ASSIGNMENT
// ==========================================

export const dispatchTrip = async (req: Request, res: Response) => {
  try {
    const { driver_id, vehicle_id } = req.body;
    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    if (!driver_id && !vehicle_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'driver_id or vehicle_id required' } });
    }

    let oldDriverIdToNotify: string | null = null;

    // Run in a transaction to ensure atomic state updates. driver_id/vehicle_id
    // are independently optional — a trip created with "assign later" can have
    // just one filled in here, and the other assigned in a later call.
    const result = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({ where: { id: tripId, deletedAt: null } });
      if (!trip) {
        throw new Error('NOT_FOUND');
      }

      // Atomically claim the driver/vehicle — see createTrip for why this
      // must be a conditional UPDATE rather than SELECT-then-UPDATE.
      if (driver_id && driver_id !== trip.driverId) {
        const driverClaim = await tx.driver.updateMany({
          where: { id: driver_id, status: 'Available' },
          data: { status: 'OnTrip' },
        });
        if (driverClaim.count === 0) {
          throw new Error('DRIVER_UNAVAILABLE');
        }
        if (trip.driverId) {
          oldDriverIdToNotify = trip.driverId;
          await tx.driver.update({
            where: { id: trip.driverId },
            data: { status: 'Available' },
          });
        }
      }

      if (vehicle_id && vehicle_id !== trip.vehicleId) {
        const vehicleClaim = await tx.vehicle.updateMany({
          where: { id: vehicle_id, status: 'Available' },
          data: { status: 'OnTrip' },
        });
        if (vehicleClaim.count === 0) {
          throw new Error('VEHICLE_UNAVAILABLE');
        }
        if (trip.vehicleId) {
          await tx.vehicle.update({
            where: { id: trip.vehicleId },
            data: { status: 'Available' },
          });
        }
      }

      const finalDriverId = driver_id || trip.driverId;
      const finalVehicleId = vehicle_id || trip.vehicleId;

      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: {
          ...(driver_id ? { driverId: driver_id } : {}),
          ...(vehicle_id ? { vehicleId: vehicle_id } : {}),
          // Only moves out of Draft once both a driver and a vehicle are on
          // the trip — a single-sided assignment leaves it in Draft.
          ...(finalDriverId && finalVehicleId ? { status: 'Scheduled' as const } : {}),
          updated_by: (req as any).user?.id
        }
      });

      return updatedTrip;
    });

    // Notify the driver after the dispatch commits.
    if (driver_id) await notifyDriverAssigned(driver_id, result);

    // Notify the unassigned/replaced driver
    if (oldDriverIdToNotify && oldDriverIdToNotify !== driver_id) {
      try {
        await createDriverNotification(
          oldDriverIdToNotify,
          'Trip Reassigned',
          `Trip ${result.ref_id ?? ''} is no longer assigned to you.`.replace('  ', ' '),
          'TripReassigned',
          'Trip',
          result.id,
          { tripId: result.id, ref_id: result.ref_id, event: 'TripReassigned' }
        );
      } catch (err) {
        logger.error({ err }, 'Failed to send driver reassignment notification');
      }
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    if (error.message === 'DRIVER_UNAVAILABLE' || error.message === 'VEHICLE_UNAVAILABLE') {
      return res.status(400).json({ success: false, error: { code: 'CONFLICT', message: error.message } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to dispatch trip' } });
  }
};

export const replaceDriver = async (req: Request, res: Response) => {
  try {
    const { new_driver_id, reason } = req.body;
    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    if (!new_driver_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'new_driver_id required' } });
    }

    let oldDriverIdToNotify: string | null = null;

    const result = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip || !trip.driverId) throw new Error('TRIP_OR_DRIVER_NOT_FOUND');

      const oldDriverId = trip.driverId;
      oldDriverIdToNotify = oldDriverId;

      // Atomically claim the new driver if trip status is active
      if (trip.status === 'InTransit' || trip.status === 'Loading' || trip.status === 'Delayed') {
        const claim = await tx.driver.updateMany({
          where: { id: new_driver_id, status: 'Available' },
          data: { status: 'OnTrip' },
        });
        if (claim.count === 0) throw new Error('NEW_DRIVER_UNAVAILABLE');

        // Free old driver
        await tx.driver.update({ where: { id: oldDriverId }, data: { status: 'Available' } });
      }

      const now = new Date();

      // 3. Log TripAssignmentEvent audit record
      const changeReason = reason || 'Driver replaced by dispatcher';
      await tx.tripAssignmentEvent.create({
        data: {
          tripId,
          entityType: AssignmentEntityType.DRIVER,
          fromId: oldDriverId,
          toId: new_driver_id,
          reason: changeReason,
          changedBy: (req as any).user?.id || null,
          changedAt: now,
        },
      });

      // 4. Update Trip summary fields & legacy driverId pointer
      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: {
          driverId: new_driver_id,
          is_contingency_dispatch: true,
          original_driver_id: trip.original_driver_id || oldDriverId,
          contingency_reason: changeReason,
          updated_by: (req as any).user?.id,
        },
        include: {
          tripDrivers: { include: { driver: true } },
          assignmentEvents: true,
        },
      });

      return updatedTrip;
    });

    // Notify the newly-assigned driver after the swap commits.
    await notifyDriverAssigned(new_driver_id, result);

    // Notify the unassigned/replaced driver
    if (oldDriverIdToNotify && oldDriverIdToNotify !== new_driver_id) {
      try {
        await createDriverNotification(
          oldDriverIdToNotify,
          'Trip Reassigned',
          `Trip ${result.ref_id ?? ''} is no longer assigned to you.`.replace('  ', ' '),
          'TripReassigned',
          'Trip',
          result.id,
          { tripId: result.id, ref_id: result.ref_id, event: 'TripReassigned' }
        );
      } catch (err) {
        logger.error({ err }, 'Failed to send driver reassignment notification');
      }
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (['TRIP_OR_DRIVER_NOT_FOUND', 'NEW_DRIVER_UNAVAILABLE'].includes(error.message)) {
      return res.status(400).json({ success: false, error: { code: 'CONFLICT', message: error.message } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to replace driver' } });
  }
};

// ==========================================
// PHASE 2: DRIVER WORKFLOW
// ==========================================

export const pickupArrive = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    if (!isValidTransition(trip.status, TripStatus.Loading)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSITION', message: 'That status change is not allowed from the trip\'s current state' } });
    }

    // Stop clock and trip status move together: a committed arrival time on a
    // trip that never reached Loading (or the reverse) is exactly the kind of
    // split the delay report cannot interpret afterwards.
    let delay: DelayDetection | null = null;
    const updatedTrip = await prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: { status: 'Loading', updated_by: (req as any).user?.id }
      });
      delay = await stampStopTransition(tx, tripId, TripStatus.Loading);
      return updated;
    });

    if (delay) await notifyOperatorsOfDelay(delay);

    res.json({ success: true, data: updatedTrip });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to record pickup arrival' } });
  }
};

export const pickupVerify = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    if (!isValidTransition(trip.status, TripStatus.InTransit)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSITION', message: 'That status change is not allowed from the trip\'s current state' } });
    }

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: 'InTransit',
          actual_start: new Date(),
          updated_by: (req as any).user?.id
        }
      });
      // Leaving pickup closes the loading window that started at AtPickup.
      await stampStopTransition(tx, tripId, TripStatus.InTransit);
      return updated;
    });

    res.json({ success: true, data: updatedTrip });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to verify pickup' } });
  }
};

export const deliveryVerify = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.trip.findUnique({ where: { id: tripId } });
      if (!current) throw new Error('NOT_FOUND');
      if (!isValidTransition(current.status, TripStatus.Completed)) throw new Error('INVALID_TRANSITION');

      return completeTripAndInvoice(tx, tripId, (req as any).user?.id);
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    if (error.message === 'INVALID_TRANSITION') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSITION', message: 'That status change is not allowed from the trip\'s current state' } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to verify delivery' } });
  }
};

/**
 * Record why a stop was reached late. Operator-only by design: drivers already
 * report the cause in the WhatsApp group, and the office is better placed to
 * classify it than a driver working a phone in a cab.
 *
 * Re-logging is allowed — a first guess ("Traffic") often turns out to be
 * something else once the driver is actually reached, and a wrong reason left
 * frozen in place would quietly skew the report it feeds.
 */
export const logStopDelay = async (req: Request, res: Response) => {
  try {
    const { id: rawTripId, stopId } = req.params as { id: string; stopId: string };
    const tripId = isUuid(rawTripId) ? rawTripId : (await resolveTripId(rawTripId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    const { delay_reason, delay_note } = req.body;

    const stop = await prisma.tripStop.findFirst({
      where: { id: stopId, tripId, deletedAt: null },
    });
    if (!stop) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stop not found on this trip' } });
    }
    // Nothing to explain about a stop the driver has not reached yet, and
    // allowing it would put reasons on trips that are still running fine.
    if (!stop.actual_arrival) {
      return res.status(400).json({ success: false, error: { code: 'NOT_ARRIVED', message: 'This stop has no recorded arrival yet' } });
    }

    const updated = await prisma.tripStop.update({
      where: { id: stopId },
      data: {
        delay_reason,
        delay_note: String(delay_note ?? '').trim() || null,
        delay_logged_by: (req as any).user?.id ?? null,
        delay_logged_at: new Date(),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to log stop delay reason');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to log delay reason' } });
  }
};

/**
 * Confirm or correct the real-world time an EXTERNAL_APP evidence screenshot
 * actually happened at. The driver's tap already advanced the trip using
 * "now" as a provisional timestamp so status visibility stays live; an
 * operator later reads the true time off the screenshot itself (customer
 * apps show their own arrive/departure times) and corrects the stop record
 * here if it drifted.
 *
 * Deliberately has no frozen-trip guard, unlike updateTripStop — a timestamp
 * correction doesn't relitigate pricing/lane the way a location edit would,
 * and the final delivery milestone completes the trip immediately, so its
 * evidence is exactly the case that needs review *after* completion. Mirrors
 * logStopDelay, which edits TripStop post-completion for the same reason.
 */
export const confirmEvidenceTime = async (req: Request, res: Response) => {
  try {
    const { id: rawTripId, stopId } = req.params as { id: string; stopId: string };
    const tripId = isUuid(rawTripId) ? rawTripId : (await resolveTripId(rawTripId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    const { document_id, actual_arrival, actual_departure } = req.body;

    const stop = await prisma.tripStop.findFirst({
      where: { id: stopId, tripId, deletedAt: null },
    });
    if (!stop) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stop not found on this trip' } });
    }

    const document = await prisma.document.findFirst({
      where: { id: document_id, entity_type: 'Trip', entity_id: tripId, deletedAt: null },
    });
    if (!document) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidence document not found on this trip' } });
    }
    if ((document.ai_extracted_json as any)?.source !== 'external_app_screenshot') {
      return res.status(400).json({ success: false, error: { code: 'NOT_EXTERNAL_APP_EVIDENCE', message: 'This document is not an external-app evidence screenshot' } });
    }
    if (document.status !== DocStatus.PendingReview) {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_REVIEWED', message: `This evidence is already ${document.status}` } });
    }

    const [updatedStop] = await prisma.$transaction([
      prisma.tripStop.update({
        where: { id: stopId },
        data: {
          ...(actual_arrival ? { actual_arrival: new Date(actual_arrival) } : {}),
          ...(actual_departure ? { actual_departure: new Date(actual_departure) } : {}),
        },
      }),
      prisma.document.update({
        where: { id: document.id },
        data: { status: DocStatus.Verified, verified_by: (req as any).user?.id ?? null },
      }),
    ]);

    res.json({ success: true, data: updatedStop });
  } catch (error) {
    logger.error({ err: error }, 'Failed to confirm evidence time');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to confirm evidence time' } });
  }
};

/**
 * Correct where a stop actually is — its label, its full address, the lane
 * endpoint it belongs to, and its coordinates.
 *
 * This did not exist: once a trip was created, a wrong address was wrong
 * forever, and the driver kept being sent to it. Correcting it mid-trip is the
 * whole point, so in-flight trips are editable.
 *
 * Timestamps are never touched. Moving a pin does not un-arrive a driver, and
 * the delay report reads arrival/departure, which stay exactly as recorded.
 */
export const updateTripStop = async (req: Request, res: Response) => {
  try {
    const { id: rawTripId, stopId } = req.params as { id: string; stopId: string };
    const tripId = isUuid(rawTripId) ? rawTripId : (await resolveTripId(rawTripId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    const { location_name, location_address, location_id, lat, lng } = req.body;

    const trip = await prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!trip) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }

    // A finished trip is a record of what happened. Rewriting the address after
    // the fact would change where the delivery is reported to have gone, and
    // its invoice is already priced off that lane.
    const FROZEN: TripStatus[] = [TripStatus.Completed, TripStatus.Invoiced, TripStatus.Cancelled];
    if (FROZEN.includes(trip.status)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'TRIP_CLOSED',
          message: `This trip is ${trip.status.toLowerCase()} — its stops can no longer be changed.`,
        },
      });
    }

    const stop = await prisma.tripStop.findFirst({
      where: { id: stopId, tripId, deletedAt: null },
    });
    if (!stop) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stop not found on this trip' } });
    }

    if (location_id) {
      const location = await prisma.location.findFirst({ where: { id: location_id, deletedAt: null } });
      if (!location) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'That location no longer exists' } });
      }
    }

    let latVal: number | null | undefined = undefined;
    let lngVal: number | null | undefined = undefined;
    if (lat !== undefined) {
      latVal = lat != null && !isNaN(Number(lat)) ? Number(lat) : null;
    }
    if (lng !== undefined) {
      lngVal = lng != null && !isNaN(Number(lng)) ? Number(lng) : null;
    }
    if (latVal === 0 && lngVal === 0) {
      latVal = null;
      lngVal = null;
    }

    const updated = await prisma.tripStop.update({
      where: { id: stopId },
      data: {
        ...(location_name !== undefined ? { location_name: String(location_name).trim() || null } : {}),
        ...(location_address !== undefined ? { location_address: String(location_address).trim() || null } : {}),
        ...(location_id !== undefined ? { locationId: location_id || null } : {}),
        ...(req.body.leg_index !== undefined ? { leg_index: Number(req.body.leg_index) } : {}),
        ...(latVal !== undefined ? { location_lat: latVal } : {}),
        ...(lngVal !== undefined ? { location_lng: lngVal } : {}),
        updated_by: (req as any).user?.id ?? null,
      },
      include: { location: { select: { id: true, name: true, address: true, code: true } } },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update trip stop');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update this stop' } });
  }
};


/** Trip statuses where the assigned driver/vehicle are actively held as `OnTrip`. */
const IN_FLIGHT_STATUSES: TripStatus[] = [
  TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed,
];

export function isFinanciallyProtectedTrip(trip: {
  status: string;
  is_post_trip_settled?: boolean | null;
  paid_amount?: any;
}): boolean {
  const statusUpper = (trip.status || '').trim().toUpperCase();
  if (statusUpper === 'INVOICED' || statusUpper === 'PAID') {
    return true;
  }
  if (trip.is_post_trip_settled === true) {
    return true;
  }
  if (trip.paid_amount !== null && trip.paid_amount !== undefined && Number(trip.paid_amount) > 0) {
    return true;
  }
  return false;
}

export const bulkDeleteTrips = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    const userId = (req as any).user?.id;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No IDs provided' } });
    }

    const allTrips = await prisma.trip.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        ref_id: true,
        status: true,
        is_post_trip_settled: true,
        paid_amount: true,
        driverId: true,
        vehicleId: true,
      },
    });

    const eligibleTrips = allTrips.filter((t) => !isFinanciallyProtectedTrip(t));
    const blockedTrips = allTrips.filter((t) => isFinanciallyProtectedTrip(t));

    if (eligibleTrips.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROTECTED_TRIP',
          message: 'Selected trip(s) cannot be deleted because they are invoiced or financially settled.',
        },
        data: {
          deletedCount: 0,
          skippedCount: blockedTrips.length,
          skippedTrips: blockedTrips.map((t) => ({
            id: t.id,
            ref_id: t.ref_id,
            reason: 'Trip is invoiced or financially settled',
          })),
        },
      });
    }

    const eligibleIds = eligibleTrips.map((t) => t.id);

    // Soft-delete renames ref_id TRP-XXXX -> TRP-DEL-XXXX to free the number for reuse. A
    // trip number can be reused after its original holder is deleted, so a later trip that
    // reused the same number can collide with an already-deleted TRP-DEL-XXXX row on this
    // rename. Postgres poisons the whole transaction on the first failed query inside it
    // (25P02 "current transaction is aborted"), so a collision can't be retried mid-
    // transaction — resolve every ref_id up front, before the transaction opens, so the
    // transaction itself never has anything to fail on.
    const intendedRefIds = eligibleTrips.map((t) =>
      t.ref_id && t.ref_id.startsWith('TRP-') && !t.ref_id.startsWith('TRP-DEL-')
        ? t.ref_id.replace('TRP-', 'TRP-DEL-')
        : t.ref_id
    );
    const conflicting = await prisma.trip.findMany({
      where: { ref_id: { in: intendedRefIds.filter((r): r is string => !!r) } },
      select: { ref_id: true },
    });
    const takenRefIds = new Set(conflicting.map((t) => t.ref_id));
    const finalRefIds = new Map<string, string | null>(); // tripId -> new ref_id
    eligibleTrips.forEach((trip, i) => {
      const intended = intendedRefIds[i];
      finalRefIds.set(trip.id, intended && takenRefIds.has(intended) ? `${intended}-${trip.id.slice(0, 8)}` : intended);
    });

    await prisma.$transaction(async (tx) => {
      for (const trip of eligibleTrips) {
        await tx.trip.update({
          where: { id: trip.id },
          data: {
            ref_id: finalRefIds.get(trip.id) ?? trip.ref_id,
            isActive: false,
            deletedAt: new Date(),
            deleted_by: getValidUuid(userId),
          },
        });
      }

      // Release driver / vehicle if soft-deleting in-flight trips
      const inFlightTrips = eligibleTrips.filter((t) => IN_FLIGHT_STATUSES.includes(t.status as TripStatus));
      const driverIds = [...new Set(inFlightTrips.map((t) => t.driverId).filter((id): id is string => !!id))];
      const vehicleIds = [...new Set(inFlightTrips.map((t) => t.vehicleId).filter((id): id is string => !!id))];

      if (driverIds.length) {
        await tx.driver.updateMany({ where: { id: { in: driverIds } }, data: { status: DriverStatus.Available } });
      }
      if (vehicleIds.length) {
        await tx.vehicle.updateMany({ where: { id: { in: vehicleIds } }, data: { status: AssetStatus.Available } });
      }
    });

    const skippedReasons = blockedTrips.map((t) => ({
      id: t.id,
      ref_id: t.ref_id,
      reason: 'Trip is invoiced or financially settled',
    }));

    res.json({
      success: true,
      data: {
        deletedCount: eligibleTrips.length,
        skippedCount: blockedTrips.length,
        skippedTrips: skippedReasons,
        message:
          blockedTrips.length > 0
            ? `Soft-deleted ${eligibleTrips.length} trip(s). ${blockedTrips.length} trip(s) were protected from deletion (invoiced/settled).`
            : `Successfully soft-deleted ${eligibleTrips.length} trip(s)`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to soft delete trips');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to bulk delete trips' } });
  }
};

export const bulkUpdateTripStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'IDs and status are required' } });
    }
    if (!Object.values(TripStatus).includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } });
    }

    const { updated, skipped, affectedTrips } = await prisma.$transaction(async (tx) => {
      const trips = await tx.trip.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, ref_id: true, status: true, driverId: true, vehicleId: true },
      });

      const validIds = trips.filter((t) => isValidTransition(t.status, status)).map((t) => t.id);
      const skippedCount = trips.length - validIds.length;

      if (validIds.length === 0) return { updated: 0, skipped: skippedCount, affectedTrips: [] };

      // Completing a trip always goes through the shared helper so bulk
      // completion also generates invoices, same as the single-trip path.
      if (status === TripStatus.Completed) {
        for (const id of validIds) {
          await completeTripAndInvoice(tx, id, userId);
        }
        return { updated: validIds.length, skipped: skippedCount, affectedTrips: [] };
      }

      await tx.trip.updateMany({
        where: { id: { in: validIds } },
        data: { status: status as TripStatus, updated_by: userId },
      });

      const affected = trips.filter((t) => validIds.includes(t.id));

      // Same release rule as the single-trip update: Cancelled frees the
      // driver/vehicle back to Available.
      if (status === TripStatus.Cancelled) {
        const driverIds = [...new Set(affected.map((t) => t.driverId).filter((id): id is string => !!id))];
        const vehicleIds = [...new Set(affected.map((t) => t.vehicleId).filter((id): id is string => !!id))];
        if (driverIds.length) {
          await tx.driver.updateMany({ where: { id: { in: driverIds } }, data: { status: DriverStatus.Available } });
        }
        if (vehicleIds.length) {
          await tx.vehicle.updateMany({ where: { id: { in: vehicleIds } }, data: { status: AssetStatus.Available } });
        }
      }

      return { updated: validIds.length, skipped: skippedCount, affectedTrips: affected };
    });

    if (status === TripStatus.Cancelled && affectedTrips?.length) {
      for (const t of affectedTrips) {
        if (t.driverId) {
          try {
            await createDriverNotification(
              t.driverId,
              'Trip Cancelled',
              `Trip ${t.ref_id ?? ''} has been cancelled.`.replace('  ', ' '),
              'TripCancelled',
              'Trip',
              t.id,
              { tripId: t.id, ref_id: t.ref_id, event: 'TripCancelled' }
            );
          } catch (err) {
            logger.error({ err }, 'Failed to send driver cancellation notification on bulk update');
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        message: skipped > 0
          ? `Updated ${updated} trip(s); skipped ${skipped} with an invalid status transition`
          : `Successfully updated ${updated} trips`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to bulk update trips` } });
  }
};

export const bulkAssignTrips = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { trip_ids, driver_id, vehicle_id, status, rate_category } = req.body;

    if (!Array.isArray(trip_ids) || trip_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'trip_ids array is required and must not be empty' },
      });
    }

    const updateData: any = {
      ...(userId ? { updated_by: userId } : {}),
    };

    if (driver_id !== undefined) {
      if (driver_id && driver_id !== 'unassigned') {
        updateData.driverId = driver_id;
      } else {
        updateData.driverId = null;
      }
    }

    if (vehicle_id !== undefined) {
      if (vehicle_id && vehicle_id !== 'unassigned') {
        updateData.vehicleId = vehicle_id;
      } else {
        updateData.vehicleId = null;
      }
    }

    if (status && Object.values(TripStatus).includes(status)) {
      updateData.status = status;
    }

    if (rate_category !== undefined && typeof rate_category === 'string') {
      updateData.rate_category = rate_category;
    }

    await prisma.trip.updateMany({
      where: { id: { in: trip_ids }, deletedAt: null },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        message: `Successfully updated ${trip_ids.length} trip(s)`,
        count: trip_ids.length,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to bulk assign trips');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message || 'Failed to bulk assign trips' },
    });
  }
};

/**
 * Get all completed trips pending post-trip financial settlement / waiting-labor check
 */
export const getUnsettledCompletedTrips = async (req: Request, res: Response) => {
  try {
    const trips = await prisma.trip.findMany({
      where: {
        deletedAt: null,
        status: { in: [TripStatus.Completed, TripStatus.Invoiced] },
        is_post_trip_settled: false,
      },
      include: {
        customer: true,
        driver: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: trips,
      count: trips.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch unsettled completed trips');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch unsettled trips' } });
  }
};

/**
 * Update post-trip financial fields (itemised charges, Trip Charges, Carrier)
 * and automatically update linked Invoice total.
 *
 * `charges`, when sent, REPLACES the trip's entire itemised charge list —
 * the settlement UI always submits the full set it's showing, not a diff, so
 * delete-then-recreate is simpler and safer than trying to reconcile which
 * lines changed. Omitting `charges` entirely leaves the existing lines alone
 * (e.g. a request that only updates carrier_name).
 */
export const updateTripFinancials = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const tripId = isUuid(rawId) ? rawId : (await resolveTripId(rawId));
    if (!tripId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    const {
      charges,
      trip_charges,
      billing_amount,
      carrier_name,
      is_post_trip_settled = true,
    } = req.body;

    if (charges !== undefined && !Array.isArray(charges)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '"charges" must be an array' } });
    }

    const result = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId, deletedAt: null },
      });

      if (!trip) throw new Error('NOT_FOUND');

      // Auto-fill the driver payout only when the caller didn't send one —
      // see resolveDriverPayout() for the actual rule. Prisma accepts a
      // number for a Decimal field write, so nextTripCharges stays a plain
      // number through storage below.
      const nextTripCharges = resolveDriverPayout({
        currentDriverPayout: trip.driver_payout ?? (trip as any).driver_charge,
        isThirdParty: trip.is_third_party,
        subcontractCost: (trip as any).subcontract?.cost ?? (trip as any).third_party_cost,
        requestedPayoutRaw: req.body.driver_payout !== undefined ? req.body.driver_payout : (req.body.driver_charge !== undefined ? req.body.driver_charge : trip_charges),
      });

      if (charges !== undefined) {
        await tx.tripCharge.deleteMany({ where: { tripId: trip.id } });
        if (charges.length > 0) {
          for (const c of charges) {
            const quantity = parseOptionalFloat(c.quantity) ?? 1;
            const rate = parseOptionalFloat(c.rate) ?? 0;
            const chargeType = String(c.charge_type || '').trim() || 'Charge';
            const unitVal = c.unit ? String(c.unit).trim() || null : null;
            let ruleId = getValidUuid(c.surchargeRuleId) || null;

            if (!ruleId && c.save_as_rule && trip.customerId) {
              const existingRule = await tx.surchargeRule.findFirst({
                where: {
                  customerId: trip.customerId,
                  charge_type: chargeType,
                  rate,
                  unit: unitVal,
                  deletedAt: null,
                },
              });
              if (existingRule) {
                ruleId = existingRule.id;
              } else {
                const createdRule = await tx.surchargeRule.create({
                  data: {
                    customerId: trip.customerId,
                    quotationId: trip.quotationId || null,
                    charge_type: chargeType,
                    unit: unitVal,
                    rate,
                    currency: 'SAR',
                    is_active: true,
                    created_by: (req as any).user?.id,
                  },
                });
                ruleId = createdRule.id;
              }
            }

            await tx.tripCharge.create({
              data: {
                tripId: trip.id,
                surchargeRuleId: ruleId,
                charge_type: chargeType,
                unit: unitVal,
                rate,
                quantity,
                amount: parseOptionalFloat(c.amount) ?? quantity * rate,
                created_by: (req as any).user?.id,
              },
            });
          }
        }
      }

      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: {
          driver_payout: nextTripCharges,
          billing_amount: billing_amount !== undefined ? (parseOptionalFloat(billing_amount) ?? 0) : trip.billing_amount,
          carrier_name: carrier_name !== undefined ? carrier_name : trip.carrier_name,
          is_post_trip_settled: Boolean(is_post_trip_settled),
          updated_by: (req as any).user?.id,
        },
        include: { customer: true, driver: true, vehicle: true, charges: true },
      });

      return updatedTrip;
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    logger.error({ err: error }, 'Failed to update trip financials');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update trip financials' } });
  }
};


/* ─── Monthly board ───────────────────────────────────────────────────────
 *
 * A month of work seen the way it is actually sold: "this company gets N trips
 * this month", with a driver and a truck assigned per day. The trip ledger
 * answers "what is running right now" — it is paginated, sorted by status and
 * flat, so it cannot answer "who is covering ARKAN on the 14th" without the
 * operator scrolling and mentally regrouping. This returns the whole month in
 * one response, already grouped customer → day, so the page never pages.
 *
 * A trip's day is its planned_start, falling back to createdAt when the trip
 * was created without one — the same rule getTrips' date filter uses, so the
 * ledger and this board can never disagree about which month a trip is in.
 */

/** A month of trips is bounded work; this only guards against a runaway query. */
const MONTHLY_BOARD_TRIP_CAP = 5000;

export const getMonthlyTripBoard = async (req: Request, res: Response) => {
  try {
    const {
      month: monthParam,
      customer_id,
      driver_id,
      vehicle_id,
      status,
      rate_category,
      vehicle_type,
      billing_type,
      search,
    } = req.query;

    const { month, start, end } = resolveMonth(monthParam);

    const whereClause: Prisma.TripWhereInput = {
      deletedAt: null,
      AND: [
        {
          OR: [
            { planned_start: { gte: start, lte: end } },
            { AND: [{ planned_start: null }, { createdAt: { gte: start, lte: end } }] },
          ],
        },
        ...(buildSearchAnd(search, TRIP_SEARCH_FIELDS) as Prisma.TripWhereInput[]),
      ],
    };

    if (customer_id && isUuid(customer_id)) whereClause.customerId = customer_id as string;
    if (driver_id && isUuid(driver_id)) whereClause.driverId = driver_id as string;
    if (vehicle_id && isUuid(vehicle_id)) whereClause.vehicleId = vehicle_id as string;
    if (typeof status === 'string' && status.trim()) {
      const values = status.split(',').map((s) => s.trim()).filter(Boolean) as TripStatus[];
      whereClause.status = values.length > 1 ? { in: values } : values[0];
    }
    // The tier/category a trip was booked under is copied onto the trip at
    // creation, but older trips predate those columns and only carry it on
    // their rate card — so match either place, otherwise filtering by
    if (typeof rate_category === 'string' && rate_category.trim()) {
      const value = rate_category.trim();
      (whereClause.AND as Prisma.TripWhereInput[]).push({
        OR: [{ rate_category: value }, { AND: [{ rate_category: null }, { quotation: { line_type: value } }] }],
      });
    }
    if (typeof vehicle_type === 'string' && vehicle_type.trim()) {
      const value = vehicle_type.trim();
      (whereClause.AND as Prisma.TripWhereInput[]).push({
        OR: [{ vehicle_type: value }, { AND: [{ vehicle_type: null }, { quotation: { OR: [{ source_vehicle_label: value }, { vehicle_class: value }] } }] }],
      });
    }
    if (typeof billing_type === 'string' && billing_type.trim()) {
      const value = billing_type.trim();
      (whereClause.AND as Prisma.TripWhereInput[]).push({
        OR: [{ operation_type: value }, { AND: [{ operation_type: null }, { quotation: { operation_type: value } }] }],
      });
    }

    const trips = await prisma.trip.findMany({
      where: whereClause,
      take: MONTHLY_BOARD_TRIP_CAP,
      orderBy: [{ planned_start: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        ref_id: true,
        status: true,
        planned_start: true,
        planned_end: true,
        actual_start: true,
        actual_end: true,
        createdAt: true,
        customerId: true,
        vehicle_type: true,
        rate_category: true,
        operation_type: true,
        billing_amount: true,
        driver_payout: true,
        quotationId: true,
        customer: { select: { id: true, name: true, contact_phone: true, logo_url: true } },
        driver: { select: { id: true, ref_id: true, first_name: true, last_name: true, phone_primary: true } },
        vehicle: { select: { id: true, ref_id: true, plate_number: true, asset_type: true } },
        quotation: {
          select: {
            id: true, name: true, rate: true, currency: true,
            source_vehicle_label: true, vehicle_class: true, line_type: true, operation_type: true, pricing_basis: true,
          },
        },
        stops: {
          where: { deletedAt: null },
          orderBy: { stop_sequence: 'asc' },
          select: {
            stop_sequence: true, stop_type: true, location_name: true,
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    type BoardTrip = ReturnType<typeof toBoardTrip>;

    function toBoardTrip(trip: (typeof trips)[number]) {
      const pickup = trip.stops.find((s) => s.stop_type === StopType.Pickup) ?? trip.stops[0] ?? null;
      const dropoff = [...trip.stops].reverse().find((s) => s.stop_type === StopType.Dropoff) ?? null;
      const day = trip.planned_start ?? trip.createdAt;

      return {
        id: trip.id,
        ref_id: trip.ref_id,
        status: trip.status,
        date: toDayKey(day),
        planned_start: trip.planned_start,
        planned_end: trip.planned_end,
        actual_start: trip.actual_start,
        actual_end: trip.actual_end,
        date_is_inferred: trip.planned_start === null,
        driver: trip.driver
          ? {
              id: trip.driver.id,
              ref_id: trip.driver.ref_id,
              name: `${trip.driver.first_name} ${trip.driver.last_name}`.trim(),
              phone_primary: trip.driver.phone_primary,
            }
          : null,
        vehicle: trip.vehicle,
        vehicle_type: trip.vehicle_type ?? trip.quotation?.source_vehicle_label ?? trip.quotation?.vehicle_class ?? null,
        rate_category: trip.rate_category ?? trip.quotation?.line_type ?? null,
        operation_type: trip.operation_type ?? trip.quotation?.operation_type ?? null,
        billing_type: trip.operation_type ?? trip.quotation?.operation_type ?? null,
        billing_amount: trip.billing_amount != null ? Number(trip.billing_amount) : (trip.quotation?.rate != null ? Number(trip.quotation.rate) : null),
        currency: trip.quotation?.currency ?? 'SAR',
        rate_card: trip.quotation
          ? { id: trip.quotation.id, name: trip.quotation.name, base_price: Number(trip.quotation.rate), rate: Number(trip.quotation.rate) }
          : null,
        origin: pickup?.location?.code ? `${pickup.location.code} — ${pickup.location.name}` : (pickup?.location?.name ?? pickup?.location_name ?? null),
        destination: dropoff?.location?.code ? `${dropoff.location.code} — ${dropoff.location.name}` : (dropoff?.location?.name ?? dropoff?.location_name ?? null),
      };
    }

    interface CompanyGroup {
      customer: { id: string; name: string; contact_phone: string; logo_url?: string | null };
      trips: BoardTrip[];
      drivers: Map<string, { id: string; name: string; ref_id: string | null; trips: number }>;
      vehicles: Map<string, { id: string; plate_number: string; trips: number }>;
      categories: Map<string, number>;
    }

    const companies = new Map<string, CompanyGroup>();
    const allDrivers = new Set<string>();
    const allVehicles = new Set<string>();
    const byStatus: Record<string, number> = {};
    let totalBilled = 0;
    let unassigned = 0;

    for (const trip of trips) {
      const boardTrip = toBoardTrip(trip);
      const custId = trip.customerId || 'unassigned';
      const custObj = trip.customer || {
        id: custId,
        name: 'Unassigned Customer',
        contact_phone: '',
        avatar_url: null,
        logo_url: null,
      };

      let group = companies.get(custId);
      if (!group) {
        group = {
          customer: custObj,
          trips: [],
          drivers: new Map(),
          vehicles: new Map(),
          categories: new Map(),
        };
        companies.set(custId, group);
      }

      group.trips.push(boardTrip);

      if (boardTrip.driver) {
        const existing = group.drivers.get(boardTrip.driver.id);
        if (existing) existing.trips += 1;
        else group.drivers.set(boardTrip.driver.id, {
          id: boardTrip.driver.id,
          name: boardTrip.driver.name,
          ref_id: boardTrip.driver.ref_id,
          trips: 1,
        });
        allDrivers.add(boardTrip.driver.id);
      }

      if (boardTrip.vehicle) {
        const existing = group.vehicles.get(boardTrip.vehicle.id);
        if (existing) existing.trips += 1;
        else group.vehicles.set(boardTrip.vehicle.id, {
          id: boardTrip.vehicle.id,
          plate_number: boardTrip.vehicle.plate_number,
          trips: 1,
        });
        allVehicles.add(boardTrip.vehicle.id);
      }

      const category = boardTrip.rate_category ?? 'Uncategorised';
      group.categories.set(category, (group.categories.get(category) ?? 0) + 1);

      byStatus[trip.status] = (byStatus[trip.status] ?? 0) + 1;
      totalBilled += boardTrip.billing_amount ?? 0;
      // A monthly commitment is only covered once both a driver and a truck
      // are on the day — either one missing is a gap the operator must fill.
      if (!boardTrip.driver || !boardTrip.vehicle) unassigned += 1;
    }

    const payload = [...companies.values()]
      .map((group) => {
        const days = new Map<string, BoardTrip[]>();
        for (const trip of group.trips) {
          const bucket = days.get(trip.date);
          if (bucket) bucket.push(trip);
          else days.set(trip.date, [trip]);
        }

        return {
          customer: group.customer,
          total_trips: group.trips.length,
          total_billed: group.trips.reduce((sum, t) => sum + (t.billing_amount ?? 0), 0),
          unassigned_trips: group.trips.filter((t) => !t.driver || !t.vehicle).length,
          drivers: [...group.drivers.values()].sort((a, b) => b.trips - a.trips),
          vehicles: [...group.vehicles.values()].sort((a, b) => b.trips - a.trips),
          categories: [...group.categories.entries()]
            .map(([name, count]) => ({ name, trips: count }))
            .sort((a, b) => b.trips - a.trips),
          days: [...days.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dayTrips]) => ({ date, trips: dayTrips })),
        };
      })
      // Busiest company first — that's the one the month is really about.
      .sort((a, b) => b.total_trips - a.total_trips || (a.customer?.name || '').localeCompare(b.customer?.name || ''));

    res.json({
      success: true,
      data: {
        month,
        start: start.toISOString(),
        end: end.toISOString(),
        summary: {
          total_trips: trips.length,
          companies: companies.size,
          drivers_used: allDrivers.size,
          vehicles_used: allVehicles.size,
          total_billed: totalBilled,
          unassigned_trips: unassigned,
          by_status: byStatus,
          truncated: trips.length === MONTHLY_BOARD_TRIP_CAP,
        },
        companies: payload,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to build the monthly trip board');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to load the monthly trip board' },
    });
  }
};

/**
 * Dispatch trip media (delay video or POD photo) natively to WhatsApp Cloud API.
 */
export const shareTripMediaToWhatsApp = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { category, recipientPhone } = req.body || {};

    if (!whatsappService.isConfigured()) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'WHATSAPP_CONFIG_MISSING',
          message: 'WhatsApp Business API credentials (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID) are not configured in backend environment.',
        },
      });
    }

    const result = await whatsappService.shareTripMedia(id, {
      category: category === 'pod' ? 'pod' : 'delay',
      recipientPhone,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to share trip media to WhatsApp:');
    res.status(400).json({
      success: false,
      error: {
        code: 'WHATSAPP_DISPATCH_FAILED',
        message: error?.message || 'Failed to dispatch trip media via WhatsApp Cloud API',
      },
    });
  }
};
