import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { TripStatus, DocType } from '@prisma/client';
import { isValidTransition, completeTripAndInvoice, stampStopTransition, stampWorkflowTransition, resolveAuthoritativeActiveStop, type DelayDetection } from '../services/tripLifecycle';
import { buildTripRouteTimeline } from '../services/tripRouteTimeline';
import { notifyOperatorsOfDelay } from './notificationController';
import { getDrivingRoute, RoutingUnavailableError } from '../services/routing/routeProvider';
import { compressUploadedImage } from '../services/imageCompressor';
import { calculateBackendTripFinancials } from '../utils/tripFinancials';

/**
 * Everything the driver's app needs about a trip, in one shape.
 *
 * Defined once because every endpoint here returns a trip and they used to
 * each build their own include — some with `stops: true`, which returns the
 * stop's columns but not its Location, so which endpoint the app happened to
 * call decided whether the driver saw a route or a pair of coordinates.
 *
 * Stops carry both halves of "where": `location` is the lane endpoint
 * ("Jeddah"), while location_name/location_address/lat/lng are the exact yard
 * inside it that the driver actually drives to.
 */
const tripInclude = {
  customer: true,
  vehicle: true,
  quotation: {
    select: {
      id: true,
      name: true,
      line_type: true,
      operation_type: true,
      rate: true,
      driver_payout: true,
      stops: {
        orderBy: { sequence: 'asc' as const },
        include: { location: { select: { id: true, name: true, address: true, code: true } } },
      },
    },
  },
  stops: {
    orderBy: { stop_sequence: 'asc' as const },
    include: { location: { select: { id: true, name: true, address: true, code: true } } },
  },
  subcontract: true,
};

const formatMobileTrip = (trip: any) => {
  if (!trip) return trip;
  // Single source of truth for driver payout — calculateBackendTripFinancials
  // is the same function tripController.ts (web dashboard) uses, so the
  // driver app can never disagree with the dashboard about what a trip pays.
  const fin = calculateBackendTripFinancials(trip);
  return {
    ...trip,
    driver_payout: fin.primaryDriverPayout,
    driver_charge: fin.primaryDriverPayout,
    trip_charges: fin.primaryDriverPayout,
    co_driver_payout: fin.coDriverPayout,
    // Server-computed once, from the same function the web dashboard uses —
    // the app should render this directly instead of re-deriving its own
    // route timeline from raw stops.
    route_timeline: buildTripRouteTimeline(trip),
  };
};

const attachTripDocuments = async (trip: any) => {
  if (!trip) return trip;
  let docs: any[] = [];
  try {
    docs = await prisma.document.findMany({
      where: { entity_type: 'Trip', entity_id: trip.id, deletedAt: null },
      select: {
        id: true,
        doc_type: true,
        file_url: true,
        mime_type: true,
        createdAt: true,
        ai_extracted_json: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (e) {
    logger.warn({ err: e }, 'Failed to attach trip documents:');
  }
  const authoritative_active_stop = resolveAuthoritativeActiveStop(
    trip.stops,
    trip.driver_workflow_state,
    trip.status,
  );
  return formatMobileTrip({ ...trip, documents: docs, authoritative_active_stop });
};

export const getCurrentTrip = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  const include = tripInclude;

  try {
    // 1. Prefer an active in-progress / loading / transit trip.
    let trip = await prisma.trip.findFirst({
      where: {
        driverId,
        deletedAt: null,
        status: {
          in: [TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed]
        },
        NOT: {
          driver_workflow_state: 'COMPLETED'
        }
      },
      include,
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Otherwise show the earliest next upcoming trip that is assigned (Scheduled or Draft)
    if (!trip) {
      trip = await prisma.trip.findFirst({
        where: {
          driverId,
          deletedAt: null,
          status: { in: [TripStatus.Scheduled, TripStatus.Draft] },
          OR: [
            { driver_workflow_state: null },
            { driver_workflow_state: { not: 'COMPLETED' } }
          ]
        },
        include,
        orderBy: [{ planned_start: 'asc' }, { createdAt: 'asc' }],
      });
    }

    res.json({ success: true, data: trip ? await attachTripDocuments(trip) : null });
  } catch (error) {
    logger.error({ err: error }, 'getCurrentTrip error:');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/**
 * Past trips for the logged-in driver: finished, invoiced, or cancelled,
 * newest first. Supports ?limit (default 30, max 100).
 */
export const getTripHistory = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  const parsedLimit = parseInt(String(req.query.limit ?? ''), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 30;

  try {
    const trips = await prisma.trip.findMany({
      where: {
        driverId,
        deletedAt: null,
        status: { in: [TripStatus.Completed, TripStatus.Invoiced, TripStatus.Cancelled] },
      },
      include: tripInclude,
      orderBy: [{ actual_end: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    res.json({ success: true, data: trips.map(formatMobileTrip) });
  } catch (error) {
    logger.error({ err: error }, 'getTripHistory error:');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** Scheduled/upcoming trips for the logged-in driver. */
export const getScheduledTrips = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  try {
    const trips = await prisma.trip.findMany({
      where: {
        driverId,
        deletedAt: null,
        status: { in: [TripStatus.Draft, TripStatus.Scheduled] },
        OR: [
          { driver_workflow_state: null },
          { driver_workflow_state: { not: 'COMPLETED' } }
        ]
      },
      include: tripInclude,
      orderBy: [{ planned_start: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });

    res.json({ success: true, data: trips.map(formatMobileTrip) });
  } catch (error) {
    logger.error({ err: error }, 'getScheduledTrips error:');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** Fetch details for a specific trip by ID for the logged-in driver. */
export const getMobileTripDetails = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  const idStr = String(req.params.id || '');

  try {
    const trip = await prisma.trip.findFirst({
      where: {
        driverId,
        OR: [
          { id: idStr },
          { ref_id: idStr },
        ],
        deletedAt: null,
      },
      include: tripInclude,
    });

    if (!trip) {
      return res.status(404).json({ success: false, error: { message: 'Trip not found' } });
    }

    res.json({ success: true, data: await attachTripDocuments(trip) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const updateTripStatus = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const id = req.params.id as string;
  const { status, driver_workflow_state, reason } = req.body;

  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  
  if (!Object.values(TripStatus).includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } });
  }

  try {
    const trip = await prisma.trip.findFirst({
      where: { id, driverId, deletedAt: null }
    });

    if (!trip) {
      return res.status(404).json({ success: false, error: { message: 'Trip not found or not assigned to you' } });
    }
    if (!isValidTransition(trip.status, status)) {
      return res.status(400).json({ success: false, error: { message: 'That status change is not allowed from the trip\'s current state' } });
    }

    // Completing a trip always goes through the shared helper — this is the
    // path that previously let a driver mark a trip Completed without ever
    // generating its invoice, since only the web dashboard's deliveryVerify
    // did that.
    if (status === TripStatus.Completed) {
      const updatedTrip = await prisma.$transaction(async (tx) => {
        await stampWorkflowTransition(tx, id, driver_workflow_state ?? 'COMPLETED');
        const ut = await completeTripAndInvoice(tx, id, null);
        return tx.trip.update({
          where: { id: ut.id },
          data: {
            driver_workflow_state: driver_workflow_state ?? 'COMPLETED',
          },
        });
      });
      const full = await prisma.trip.findUnique({
        where: { id: updatedTrip.id },
        include: tripInclude,
      });
      return res.json({ success: true, data: await attachTripDocuments(full) });
    }

    // This is the path the driver's app actually takes — including the GPS
    // geofence auto-arrival. It previously moved the trip's status without
    // recording anything on the stop, so a driver arriving through the app
    // left no arrival time at all and the trip was invisible to the delay
    // report. Wrapped in a transaction so status and clock cannot diverge.
    let delay: DelayDetection | null = null;
    const updatedTrip = await prisma.$transaction(async (tx) => {
      if (driver_workflow_state) {
        await stampWorkflowTransition(tx, id, driver_workflow_state);
      }
      delay = await stampStopTransition(tx, id, status as TripStatus);
      return tx.trip.update({
        where: { id },
        data: {
          status,
          driver_workflow_state: driver_workflow_state !== undefined ? driver_workflow_state : undefined,
          notes: reason ? `[DELAY REPORT]: ${reason}` : undefined,
          actual_start: status === TripStatus.InTransit && !trip.actual_start ? new Date() : undefined,
        },
        include: tripInclude
      });
    });

    if (delay) await notifyOperatorsOfDelay(delay);

    res.json({ success: true, data: await attachTripDocuments(updatedTrip) });
  } catch (error: any) {
    logger.error({ err: error }, 'updateTripStatus error:');
    res.status(500).json({ success: false, error: { message: error?.message || 'Failed to update trip status' } });
  }
};

/**
 * Upload a trip photo (cargo at pickup, or POD at delivery) and attach it to the
 * trip as a Document. Expects multipart form-data: file field "file" + "kind".
 */
export const uploadTripPhoto = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const id = req.params.id as string;
  const kind = req.body?.kind === 'pod' ? 'pod' : 'cargo';

  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  if (!req.file) return res.status(400).json({ success: false, error: { message: 'No photo uploaded' } });

  try {
    const trip = await prisma.trip.findFirst({ where: { id, driverId, deletedAt: null } });
    if (!trip) return res.status(404).json({ success: false, error: { message: 'Trip not found or not assigned to you' } });

    // Tags evidence from the EXTERNAL_APP workflow so the web dashboard can
    // surface exactly these for operator time confirmation, without also
    // picking up ordinary NATIVE-workflow cargo/POD photos.
    const isExternalAppEvidence = trip.driver_workflow === 'EXTERNAL_APP';

    const { location_lat, location_lng, captured_at, leg_index, operation, stop_id } = req.body || {};
    const notes = (location_lat && location_lng)
      ? `📍 [GPS: ${location_lat}, ${location_lng}] Captured: ${captured_at || new Date().toISOString()}`
      : undefined;

    // Compress image to save disk space & mobile data bandwidth
    await compressUploadedImage(req.file.path);

    const userId = (req as any).user?.id;
    const isValidUuid = typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

    const isVideo = (req.file.mimetype && req.file.mimetype.startsWith('video/')) ||
      /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(req.file.originalname) ||
      /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(req.file.filename);
    const resolvedMime = isVideo
      ? (req.file.mimetype && req.file.mimetype !== 'application/octet-stream' ? req.file.mimetype : 'video/mp4')
      : (req.file.mimetype || 'image/jpeg');

    const document = await prisma.document.create({
      data: {
        entity_type: 'Trip',
        entity_id: id,
        // No dedicated "cargo photo" enum value; POD for delivery, Waybill for pickup cargo.
        doc_type: kind === 'pod' ? DocType.POD : DocType.Waybill,
        file_url: `/uploads/${req.file.filename}`,
        mime_type: resolvedMime,
        ocr_raw_text: notes,
        ai_extracted_json: {
          gps: (location_lat && location_lng) ? { latitude: location_lat, longitude: location_lng, captured_at } : undefined,
          leg_index: leg_index !== undefined ? Number(leg_index) : undefined,
          operation: operation || undefined,
          stop_id: stop_id || undefined,
          source: isExternalAppEvidence ? 'external_app_screenshot' : undefined,
        },
        created_by: isValidUuid ? userId : undefined,
      },
    });

    res.status(201).json({ success: true, data: document });
  } catch (error: any) {
    logger.error({ err: error }, 'uploadTripPhoto error:');
    res.status(500).json({ success: false, error: { message: error?.message || 'Failed to upload photo' } });
  }
};

/**
 * The road route from the driver's current position to the stop they are
 * heading for.
 *
 * The destination is derived here, not accepted from the caller. That is
 * deliberate: an endpoint that routed to arbitrary coordinates would turn
 * MERCON into a free routing proxy for anyone holding a driver token, and the
 * driver app never needed that freedom — it only ever asks for the stop the
 * trip says is next.
 *
 * Which stop that is mirrors the app: a Dispatched trip is still heading to
 * the pickup, anything later is heading to the dropoff.
 */
export const getTripRoute = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const id = req.params.id as string;

  if (!driverId) {
    return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  }

  const fromLat = Number(req.query.from_lat);
  const fromLng = Number(req.query.from_lng);
  if (!Number.isFinite(fromLat) || !Number.isFinite(fromLng)) {
    return res.status(400).json({
      success: false,
      error: { message: 'from_lat and from_lng are required' },
    });
  }

  try {
    // Same ownership check every other mobile trip endpoint uses: a trip that
    // is not this driver's is indistinguishable from one that does not exist.
    const trip = await prisma.trip.findFirst({
      where: { id, driverId, deletedAt: null },
      select: {
        status: true,
        stops: {
          select: { stop_sequence: true, stop_type: true, location_lat: true, location_lng: true, actual_arrival: true },
          orderBy: { stop_sequence: 'asc' },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: { message: 'Trip not found or not assigned to you' },
      });
    }

    const target = trip.stops.find((s) => s.actual_arrival === null);

    if (!target || target.location_lat == null || target.location_lng == null) {
      return res.status(404).json({
        success: false,
        error: { message: 'That stop has no coordinates to route to' },
      });
    }

    // Distinguish invalid coordinates from an unavailable routing provider:
    if (
      (target.location_lat === 0 && target.location_lng === 0) ||
      target.location_lat < -90 || target.location_lat > 90 ||
      target.location_lng < -180 || target.location_lng > 180
    ) {
      return res.status(422).json({
        success: false,
        error: { code: 'INVALID_STOP_COORDINATES', message: 'Destination coordinates are invalid for road routing' },
      });
    }

    const route = await getDrivingRoute(
      { lat: fromLat, lng: fromLng },
      { lat: target.location_lat, lng: target.location_lng },
    );

    return res.json({ success: true, data: route });
  } catch (error) {
    // A routing outage is not a MERCON outage. 503 tells the app to carry on
    // without a drawn route, which is exactly what it did when the old direct
    // OSRM call failed — the driver keeps the map, the marker and the distance.
    if (error instanceof RoutingUnavailableError) {
      return res.status(503).json({
        success: false,
        error: { message: 'Routing is temporarily unavailable' },
      });
    }
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/**
 * Record a driver GPS location update for an active trip.
 * Path: POST /mobile/trips/:id/location
 */
export const recordDriverLocation = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const id = req.params.id as string;

  if (!driverId) {
    return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  }

  const { latitude, longitude, speed_kph, heading_deg, accuracy_m, recorded_at } = req.body || {};

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, error: { message: 'Invalid coordinates' } });
  }

  try {
    const trip = await prisma.trip.findFirst({
      where: { id, driverId, deletedAt: null },
      select: { id: true, status: true, vehicleId: true },
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: { message: 'Active trip not found or not assigned to you' },
      });
    }

    const terminalStatuses: TripStatus[] = [TripStatus.Completed, TripStatus.Invoiced, TripStatus.Cancelled];
    if (terminalStatuses.includes(trip.status)) {
      return res.status(400).json({
        success: false,
        error: { message: `Cannot record location for trip in state ${trip.status}` },
      });
    }

    const recordedAt = recorded_at && !isNaN(Date.parse(recorded_at))
      ? new Date(recorded_at)
      : new Date();

    logger.info({
      driverId,
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      lat,
      lng,
      recordedAt: recordedAt.toISOString()
    }, '[LOCATION] Received driver GPS');

    const location = await prisma.tripLocation.create({
      data: {
        tripId: trip.id,
        lat,
        lng,
        speed_kph: speed_kph != null && !isNaN(Number(speed_kph)) ? Number(speed_kph) : null,
        heading: heading_deg != null && !isNaN(Number(heading_deg)) ? Number(heading_deg) : null,
        accuracy_m: accuracy_m != null && !isNaN(Number(accuracy_m)) ? Number(accuracy_m) : null,
        recordedAt,
      },
    });

    try {
      const { io } = require('../index');
      if (io) {
        io.emit('fleet:location_update', {
          tripId: trip.id,
          vehicleId: trip.vehicleId,
          lat,
          lng,
          recordedAt,
        });

        // Also broadcast to the trip's dedicated room for live trip tracking
        const speed = speed_kph != null && !isNaN(Number(speed_kph)) ? Number(speed_kph) : 0;
        const heading = heading_deg != null && !isNaN(Number(heading_deg)) ? Number(heading_deg) : null;
        const accuracy = accuracy_m != null && !isNaN(Number(accuracy_m)) ? Number(accuracy_m) : null;
        const nowIso = new Date().toISOString();

        io.to(`trip:${trip.id}`).emit(`trip:location_update:${trip.id}`, {
          lat,
          lng,
          speed,
          heading,
          accuracy,
          status: null,
          source: 'mobile',
          recordedAt: recordedAt.toISOString(),
          ingestedAt: nowIso,
        });
      }
    } catch {
      // Non-fatal socket broadcast
    }

    return res.json({ success: true, data: location });
  } catch (error: any) {
    logger.error({ err: error }, 'recordDriverLocation error:');
    return res.status(500).json({ success: false, error: { message: error?.message || 'Failed to record driver location' } });
  }
};
