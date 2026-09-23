/**
 * Single source of truth for trip route, round-trip detection, stop helpers,
 * timeline construction, and driver workflow state evaluation across MERCON.
 * Shared between backend API server, web dashboard, and mobile app.
 */

export interface TripStopLike {
  id: string;
  trip_id?: string;
  stop_sequence: number;
  leg_index?: number | null;
  stop_type?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  arrived_at?: Date | string | null;
  departure_time?: Date | string | null;
  planned_arrival?: Date | string | null;
  actual_arrival?: Date | string | null;
  actual_departure?: Date | string | null;
  status?: string | null;
  notes?: string | null;
  location?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

export interface TripLike {
  id?: string | null;
  ref_id?: string | null;
  status?: string | null;
  driver_workflow_state?: string | null;
  origin?: string | null;
  destination?: string | null;
  line_type_name?: string | null;
  line_type?: { name?: string | null } | null;
  rate_category?: string | null;
  quotation_line_type?: string | null;
  trip_type?: string | null;
  stops?: TripStopLike[] | null;
  route_timeline?: unknown[] | null;
  planned_distance?: number | null;
  planned_end?: string | null;
}

export interface TimelineStop {
  id: string;
  typeUrdu: string;
  typeEn: string;
  name: string;
  address: string | null;
  iconType: 'House' | 'MapPin' | 'Route';
  isIntermediate?: boolean;
  isReturnStop?: boolean;
  legIndex?: number;
  stopSequence?: number;
  stopId?: string | null;
  plannedArrival?: Date | string | null;
  actualArrival?: Date | string | null;
  actualDeparture?: Date | string | null;
}

export const DRIVER_WORKFLOW_STATES = [
  'ASSIGNED',
  'GOING_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADING',
  'LOADING_COMPLETED',
  'GOING_TO_STOP',
  'ARRIVED_AT_STOP',
  'STOP_VERIFICATION',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
  'DELIVERY_VERIFICATION',
  'DELIVERY_COMPLETED',
  'FIRST_DELIVERY_COMPLETED',
  'RETURN_LOADING',
  'RETURN_LOADING_COMPLETED',
  'GOING_TO_RETURN_STOP',
  'ARRIVED_AT_RETURN_STOP',
  'RETURN_STOP_VERIFICATION',
  'IN_TRANSIT_RETURN',
  'ARRIVED_AT_FINAL_DELIVERY',
  'FINAL_DELIVERY_VERIFICATION',
  'RETURN_DELIVERY_COMPLETED',
  'REVIEW_COMPLETE',
  'COMPLETED',
] as const;

export type DriverWorkflowState = (typeof DRIVER_WORKFLOW_STATES)[number];

export function isRoundTripCategory(category: string): boolean {
  if (!category) return false;
  const c = String(category).toLowerCase().replace(/_/g, ' ').trim();
  return c.includes('round') || c === 'round trip' || c === 'trip/round trip';
}

export function isRoundTrip(trip?: Partial<TripLike> | null): boolean {
  if (!trip) return false;

  // Primary signal: an explicit return leg in structured stops.
  if (Array.isArray(trip.stops) && trip.stops.some((s) => (s.leg_index ?? 0) === 1)) {
    return true;
  }

  const lineType = (
    trip.line_type_name ||
    trip.line_type?.name ||
    trip.quotation_line_type ||
    trip.trip_type ||
    trip.rate_category ||
    ''
  ).toLowerCase();
  if (lineType.includes('round')) return true;

  if (trip.destination?.includes('[RETURN:')) return true;
  if (trip.stops?.some((s) => (s.location_name || '').includes('[RETURN:'))) return true;

  const hasSecondPickup = (trip.stops ?? []).some((s, idx) => idx > 0 && s.stop_type === 'Pickup');
  if (hasSecondPickup) return true;

  // Circular round trip: first and last stop are the same place.
  const stops = trip.stops ?? [];
  if (stops.length >= 3) {
    const first = (stops[0].location_name || stops[0].location?.name || '').toLowerCase().trim();
    const last = (stops[stops.length - 1].location_name || stops[stops.length - 1].location?.name || '').toLowerCase().trim();
    if (first && last && first === last) return true;
  }

  return false;
}

export function stopLabel(stop: TripStopLike): string {
  return stop.location_name || stop.location?.name || stop.location_address || 'Stop';
}

export function stopAddress(stop: TripStopLike): string | null {
  return stop.location_address || stop.location?.address || null;
}

function rawStopName(s: TripStopLike): string {
  return stopLabel(s) || 'Location';
}

function splitChain(str: string): string[] {
  if (!str || !str.trim()) return [];
  return str
    .split(/\s*(?:→|->|-->)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isChain(str: string): boolean {
  return /→|->|-->/.test(str);
}

function expandStops(stops: TripStopLike[]): string[] {
  const names: string[] = [];
  for (const s of stops) {
    const raw = rawStopName(s);
    const cleaned = raw.replace(/\s*\[RETURN:.*?\]/gi, '').trim();
    if (isChain(cleaned)) {
      names.push(...splitChain(cleaned));
    } else if (cleaned) {
      names.push(cleaned);
    }
  }
  return names;
}

function extractReturnChain(trip: TripLike): string {
  if (trip.destination?.includes('[RETURN:')) {
    const m = trip.destination.match(/\[RETURN:\s*(.*?)\s*\]/i);
    if (m?.[1]) return m[1].trim();
  }
  for (const s of trip.stops ?? []) {
    const raw = s.location_name || s.location?.name || '';
    if (raw.includes('[RETURN:')) {
      const m = raw.match(/\[RETURN:\s*(.*?)\s*\]/i);
      if (m?.[1]) return m[1].trim();
    }
  }
  return '';
}

function buildTimeline(
  outboundNodes: string[],
  returnNodes: string[],
  dbStops?: TripStopLike[],
): TimelineStop[] {
  const result: TimelineStop[] = [];
  let seq = 1;

  const node = (
    id: string,
    typeEn: string,
    typeUrdu: string,
    name: string,
    iconType: 'House' | 'MapPin' | 'Route',
    opts?: Partial<TimelineStop>,
  ): TimelineStop => ({
    id,
    typeEn,
    typeUrdu,
    name,
    address: null,
    iconType,
    stopSequence: seq++,
    ...opts,
  });

  if (outboundNodes.length === 0) return result;

  const [origin, ...outboundRest] = outboundNodes;
  result.push(node('origin', 'Pickup', 'پک اپ', origin, 'House', { legIndex: 0 }));

  let outboundDelivery = '';
  if (outboundRest.length > 1) {
    const outboundIntermediates = outboundRest.slice(0, -1);
    outboundDelivery = outboundRest[outboundRest.length - 1];
    outboundIntermediates.forEach((name, idx) => {
      result.push(
        node(
          `outbound-stop-${idx}`,
          `Outbound Stop #${idx + 1}`,
          `آؤٹ باؤنڈ اسٹاپ #${idx + 1}`,
          name,
          'Route',
          { legIndex: 0, isIntermediate: true },
        ),
      );
    });
    result.push(node('outbound-delivery', 'Delivery', 'ڈلیوری', outboundDelivery, 'MapPin', { legIndex: 0 }));
  } else if (outboundRest.length === 1) {
    outboundDelivery = outboundRest[0];
    result.push(node('outbound-delivery', 'Delivery', 'ڈلیوری', outboundDelivery, 'MapPin', { legIndex: 0 }));
  }

  if (returnNodes.length > 0) {
    const [returnPickup, ...returnRest] = returnNodes;
    result.push(node('return-pickup', 'Return Loading', 'واپسی لوڈنگ', returnPickup, 'House', { legIndex: 1 }));

    if (returnRest.length > 1) {
      const returnIntermediates = returnRest.slice(0, -1);
      const returnDelivery = returnRest[returnRest.length - 1];
      returnIntermediates.forEach((name, idx) => {
        result.push(
          node(
            `return-stop-${idx}`,
            `Return Stop #${idx + 1}`,
            `واپسی اسٹاپ #${idx + 1}`,
            name,
            'Route',
            { legIndex: 1, isIntermediate: true, isReturnStop: true },
          ),
        );
      });
      result.push(node('return-delivery', 'Return Delivery', 'واپسی ڈلیوری', returnDelivery, 'MapPin', { legIndex: 1 }));
    } else if (returnRest.length === 1) {
      result.push(node('return-delivery', 'Return Delivery', 'واپسی ڈلیوری', returnRest[0], 'MapPin', { legIndex: 1 }));
    }
  }

  if (dbStops && dbStops.length > 0) {
    const usedStopIds = new Set<string>();
    result.forEach((r) => {
      const match = dbStops.find((s) => {
        if (usedStopIds.has(s.id)) return false;
        if ((s.leg_index ?? 0) !== (r.legIndex ?? 0)) return false;
        return rawStopName(s).toLowerCase().trim() === r.name.toLowerCase().trim();
      });
      if (match) {
        usedStopIds.add(match.id);
        r.address = stopAddress(match);
        r.stopId = match.id;
        r.plannedArrival = match.planned_arrival ?? null;
        r.actualArrival = match.actual_arrival ?? null;
        r.actualDeparture = match.actual_departure ?? null;
      }
    });
  }

  return result;
}

export function parseTripRouteNodes(trip: TripLike | null): TimelineStop[] {
  if (!trip) return [];

  const dbStops = trip.stops ?? [];
  const isRound = isRoundTrip(trip);

  // Strategy 0: Explicit DB Stops with leg_index (Primary Source of Truth)
  const returnLegStops = dbStops.filter((s) => (s.leg_index ?? 0) === 1);
  const outboundLegStops = dbStops.filter((s) => (s.leg_index ?? 0) === 0);

  if (returnLegStops.length > 0) {
    const outboundNames = outboundLegStops.map(rawStopName);
    const returnNames = returnLegStops.map(rawStopName);
    if (outboundNames.length >= 2 && returnNames.length >= 1) {
      return buildTimeline(outboundNames, returnNames, dbStops);
    }
  }

  if (outboundLegStops.length >= 2 && returnLegStops.length === 0 && !isRound) {
    const outboundNames = outboundLegStops.map(rawStopName);
    return buildTimeline(outboundNames, [], dbStops);
  }

  // Strategy 1: Expand DB stops + [RETURN:] chain
  const returnChain = extractReturnChain(trip);
  if (dbStops.length > 0) {
    const expandedNames = expandStops(dbStops);
    const deduped = expandedNames.filter((n, i) => i === 0 || n !== expandedNames[i - 1]);

    if (returnChain) {
      const returnNodes = splitChain(returnChain);
      return buildTimeline(deduped, returnNodes, dbStops);
    }

    // Strategy 2: Detect second Pickup in DB stops for return leg split
    const secondPickupIdx = dbStops.findIndex((s, i) => i > 0 && s.stop_type === 'Pickup');
    if (isRound && secondPickupIdx > 0) {
      const outboundPart = expandStops(dbStops.slice(0, secondPickupIdx));
      const returnPart = expandStops(dbStops.slice(secondPickupIdx));
      if (outboundPart.length >= 2 && returnPart.length >= 1) {
        return buildTimeline(outboundPart, returnPart, dbStops);
      }
    }

    if (!isRound) {
      return buildTimeline(deduped, [], dbStops);
    }
  }

  // Strategy 3: Origin & Destination string parsing
  const originStr = trip.origin || '';
  const destStr = trip.destination || '';
  const originChain = splitChain(originStr);
  const destChain = splitChain(destStr.replace(/\s*\[RETURN:.*?\]/gi, '').trim());

  let outboundNodes: string[] = [];
  if (originChain.length > 1) {
    outboundNodes = [...originChain];
    if (destChain.length > 0 && destChain[destChain.length - 1] !== originChain[originChain.length - 1]) {
      outboundNodes.push(...destChain);
    }
  } else if (originStr && destStr) {
    outboundNodes = [originStr, ...destChain];
  } else if (destChain.length >= 2) {
    outboundNodes = destChain;
  }

  let returnNodes: string[] = [];
  if (returnChain) {
    returnNodes = splitChain(returnChain);
  } else if (isRound && outboundNodes.length >= 2) {
    returnNodes = [outboundNodes[outboundNodes.length - 1], outboundNodes[0]];
  }

  if (outboundNodes.length >= 2) {
    return buildTimeline(outboundNodes, returnNodes, dbStops);
  }

  return [];
}

/** Canonical name for API responses; same function as parseTripRouteNodes. */
export const buildTripRouteTimeline = parseTripRouteNodes;

export function getEffectiveWorkflowState(trip: Partial<TripLike> | null | undefined): string {
  if (!trip) return 'ASSIGNED';
  const ws = trip.driver_workflow_state;
  const stops = [...(trip.stops || [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const isRound = isRoundTrip(trip);

  if (trip.status === 'Completed' || trip.status === 'Invoiced' || ws === 'COMPLETED') {
    return 'COMPLETED';
  }

  if (stops.length > 0) {
    const outboundStops = stops.filter((s) => (s.leg_index ?? 0) === 0);
    const returnStops = stops.filter((s) => (s.leg_index ?? 0) === 1);
    const hasExplicitLegs = returnStops.length > 0;

    const s1 = outboundStops[0] || stops[0];
    const s2 = hasExplicitLegs
      ? (outboundStops.filter((s) => s.stop_type === 'Dropoff').pop() || outboundStops[outboundStops.length - 1])
      : (stops.find((s) => s.stop_sequence === 2) || stops[1] || stops[stops.length - 1]);

    const s3 = isRound
      ? (hasExplicitLegs
          ? (returnStops.find((s) => s.stop_type === 'Pickup') || returnStops[0])
          : stops.find((s) => s.stop_sequence === 3))
      : null;

    const s4 = isRound
      ? (hasExplicitLegs
          ? (returnStops.filter((s) => s.stop_type === 'Dropoff').pop() || returnStops[returnStops.length - 1])
          : (stops.find((s) => s.stop_sequence === 4) || stops[stops.length - 1]))
      : null;

    // 1. Final Delivery (Stop 4 for round trip, Stop 2 for single trip)
    if (isRound && s4) {
      if (s4.actual_departure || ws === 'RETURN_DELIVERY_COMPLETED' || ws === 'COMPLETED') {
        return 'COMPLETED';
      }
      if (s4.actual_arrival || ws === 'ARRIVED_AT_FINAL_DELIVERY' || ws === 'FINAL_DELIVERY_VERIFICATION') {
        return ws && ['ARRIVED_AT_FINAL_DELIVERY', 'FINAL_DELIVERY_VERIFICATION'].includes(ws) ? ws : 'ARRIVED_AT_FINAL_DELIVERY';
      }
    }

    // 2. Return Loading (Stop 3 for round trip)
    if (isRound && s3) {
      if (s3.actual_departure) {
        return (ws && (['IN_TRANSIT_RETURN', 'ARRIVED_AT_FINAL_DELIVERY', 'FINAL_DELIVERY_VERIFICATION'].includes(ws) || parseStopWorkflowState(ws)?.leg === 1))
          ? ws
          : 'IN_TRANSIT_RETURN';
      }
      if (s3.actual_arrival || ws === 'RETURN_LOADING' || ws === 'RETURN_LOADING_COMPLETED') {
        return ws && ['RETURN_LOADING', 'RETURN_LOADING_COMPLETED'].includes(ws) ? ws : 'RETURN_LOADING';
      }
    }

    // 3. Outbound Delivery (Stop 2)
    if (s2) {
      if (s2.actual_departure) {
        if (isRound) {
          return (ws && (['RETURN_LOADING', 'RETURN_LOADING_COMPLETED', 'IN_TRANSIT_RETURN', 'ARRIVED_AT_FINAL_DELIVERY'].includes(ws) || parseStopWorkflowState(ws)?.leg === 1))
            ? ws
            : 'RETURN_LOADING';
        } else {
          return 'COMPLETED';
        }
      }
      if (s2.actual_arrival || ws === 'ARRIVED_AT_DELIVERY' || ws === 'DELIVERY_VERIFICATION' || ws === 'FIRST_DELIVERY_COMPLETED') {
        return ws && ['ARRIVED_AT_DELIVERY', 'DELIVERY_VERIFICATION', 'FIRST_DELIVERY_COMPLETED'].includes(ws) ? ws : 'ARRIVED_AT_DELIVERY';
      }
    }

    // 4. Initial Pickup (Stop 1)
    if (s1) {
      if (s1.actual_departure) {
        return (ws && (['IN_TRANSIT', 'GOING_TO_STOP', 'ARRIVED_AT_STOP', 'STOP_VERIFICATION', 'ARRIVED_AT_DELIVERY', 'DELIVERY_VERIFICATION'].includes(ws) || parseStopWorkflowState(ws)?.leg === 0))
          ? ws
          : 'IN_TRANSIT';
      }
      if (s1.actual_arrival || ws === 'ARRIVED_AT_PICKUP' || ws === 'LOADING' || ws === 'LOADING_COMPLETED') {
        return ws && ['ARRIVED_AT_PICKUP', 'LOADING', 'LOADING_COMPLETED'].includes(ws) ? ws : 'ARRIVED_AT_PICKUP';
      }
    }
  }

  return ws || 'ASSIGNED';
}

export interface AuthoritativeActiveStop {
  activeStop: TripStopLike | null;
  activeStopId: string | null;
  activeStopSequence: number | null;
  currentLegIndex: number;
  nextStop: TripStopLike | null;
  nextStopId: string | null;
  isOutboundCompleted: boolean;
  isReturnAllowedToStart: boolean;
  isTripCompleted: boolean;
  effectiveWorkflowState: string;
}

export function resolveAuthoritativeActiveStop(
  tripOrStops?: { stops?: TripStopLike[] | null; status?: string | null; driver_workflow_state?: string | null } | TripStopLike[] | null,
  workflowStateArg?: string | null,
  tripStatusArg?: string | null
): AuthoritativeActiveStop {
  let trip: { stops?: TripStopLike[] | null; status?: string | null; driver_workflow_state?: string | null } | null = null;
  if (Array.isArray(tripOrStops)) {
    trip = { stops: tripOrStops, driver_workflow_state: workflowStateArg, status: tripStatusArg };
  } else {
    trip = tripOrStops ?? null;
  }

  const stops = trip?.stops || [];
  const statusUpper = (trip?.status || '').toUpperCase();
  const ws = trip?.driver_workflow_state || null;
  const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);

  if (statusUpper === 'COMPLETED' || statusUpper === 'INVOICED' || ws === 'COMPLETED') {
    return {
      activeStop: null,
      activeStopId: null,
      activeStopSequence: null,
      currentLegIndex: sortedStops.some((s) => (s.leg_index ?? 0) === 1) ? 1 : 0,
      nextStop: null,
      nextStopId: null,
      isOutboundCompleted: true,
      isReturnAllowedToStart: true,
      isTripCompleted: true,
      effectiveWorkflowState: 'COMPLETED',
    };
  }

  if (sortedStops.length === 0) {
    return {
      activeStop: null,
      activeStopId: null,
      activeStopSequence: null,
      currentLegIndex: 0,
      nextStop: null,
      nextStopId: null,
      isOutboundCompleted: false,
      isReturnAllowedToStart: false,
      isTripCompleted: false,
      effectiveWorkflowState: ws || (['IN_TRANSIT', 'DISPATCHED', 'ACTIVE'].includes(statusUpper) ? 'AT_PICKUP' : 'SCHEDULED'),
    };
  }

  const outboundStops = sortedStops.filter((s) => (s.leg_index ?? 0) === 0);
  const returnStops = sortedStops.filter((s) => (s.leg_index ?? 0) === 1);
  const isRound = returnStops.length > 0 || (trip ? isRoundTrip(trip) : false);

  const outboundDelivery = outboundStops.filter((s) => s.stop_type === 'Dropoff').pop() ||
    (outboundStops.length > 0 ? outboundStops[outboundStops.length - 1] : null);

  const isOutboundCompleted = Boolean(
    outboundDelivery && (outboundDelivery.actual_departure != null || outboundDelivery.actual_arrival != null)
  );

  const isReturnAllowedToStart = isRound ? isOutboundCompleted : false;

  // Find active stop: first stop that has not departed yet
  let activeIdx = sortedStops.findIndex((s) => !s.actual_departure);

  if (activeIdx === -1) {
    return {
      activeStop: null,
      activeStopId: null,
      activeStopSequence: null,
      currentLegIndex: returnStops.length > 0 ? 1 : 0,
      nextStop: null,
      nextStopId: null,
      isOutboundCompleted: true,
      isReturnAllowedToStart: true,
      isTripCompleted: true,
      effectiveWorkflowState: 'COMPLETED',
    };
  }

  let activeStop = sortedStops[activeIdx];
  const activeLeg = activeStop.leg_index ?? 0;

  // STRICT RETURN START GUARD:
  if (activeLeg === 1 && !isOutboundCompleted && outboundDelivery) {
    activeStop = outboundDelivery;
    activeIdx = sortedStops.findIndex((s) => s.id === outboundDelivery.id);
  }

  const nextStop = activeIdx + 1 < sortedStops.length ? sortedStops[activeIdx + 1] : null;

  return {
    activeStop,
    activeStopId: activeStop?.id || null,
    activeStopSequence: activeStop?.stop_sequence || null,
    currentLegIndex: activeStop?.leg_index ?? 0,
    nextStop,
    nextStopId: nextStop?.id || null,
    isOutboundCompleted,
    isReturnAllowedToStart,
    isTripCompleted: false,
    effectiveWorkflowState: getEffectiveWorkflowState(trip),
  };
}

export function parseStopWorkflowState(ws?: string | null): { leg: 0 | 1; stopIndex: number } | null {
  const m = (ws || '').match(/^(?:GOING_TO_|ARRIVED_AT_)?(RETURN_)?STOP(?:_VERIFICATION)?(?:_(\d+))?$/);
  if (!m) return null;
  return { leg: m[1] ? 1 : 0, stopIndex: m[2] ? parseInt(m[2], 10) : 0 };
}

export function getLegIntermediateDbStops<T extends TripStopLike = TripStopLike>(
  trip: { stops?: T[] | null } | null | undefined,
  leg: 0 | 1
): T[] {
  const sorted = [...(trip?.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const legStops = sorted.filter((s) => (s.leg_index ?? 0) === leg);
  return legStops.length >= 3 ? legStops.slice(1, -1) : [];
}

export type TimelineTarget =
  | { kind: 'pickup'; leg: 0 | 1 }
  | { kind: 'stop'; leg: 0 | 1; stopIndex: number }
  | { kind: 'delivery'; leg: 0 | 1 }
  | { kind: 'completed' };

export function targetFromWorkflowState(ws: string | null | undefined, isRound: boolean): TimelineTarget {
  const stop = parseStopWorkflowState(ws);
  if (stop) return { kind: 'stop', ...stop };

  switch (ws) {
    case 'COMPLETED':
    case 'RETURN_DELIVERY_COMPLETED':
    case 'REVIEW_COMPLETE':
      return { kind: 'completed' };
    case 'DELIVERY_COMPLETED':
    case 'FIRST_DELIVERY_COMPLETED':
      return isRound ? { kind: 'pickup', leg: 1 } : { kind: 'completed' };
    case 'RETURN_LOADING':
      return { kind: 'pickup', leg: 1 };
    case 'LOADING_COMPLETED':
    case 'IN_TRANSIT':
    case 'ARRIVED_AT_DELIVERY':
    case 'DELIVERY_VERIFICATION':
      return { kind: 'delivery', leg: 0 };
    case 'RETURN_LOADING_COMPLETED':
    case 'IN_TRANSIT_RETURN':
    case 'ARRIVED_AT_FINAL_DELIVERY':
    case 'FINAL_DELIVERY_VERIFICATION':
      return { kind: 'delivery', leg: 1 };
    default:
      return { kind: 'pickup', leg: 0 };
  }
}

export function findTimelineIndex(nodes: TimelineStop[], target: TimelineTarget): number {
  if (target.kind === 'completed') return nodes.length;

  const legOf = (n: TimelineStop) => n.legIndex ?? (n.isReturnStop ? 1 : 0);
  const inLeg = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => legOf(n) === target.leg);
  const pool = inLeg.length > 0 ? inLeg : nodes.map((n, i) => ({ n, i }));
  const endpoints = pool.filter(({ n }) => !n.isIntermediate);

  let idx = -1;
  if (target.kind === 'pickup') {
    idx = endpoints[0]?.i ?? -1;
  } else if (target.kind === 'delivery') {
    idx = endpoints[endpoints.length - 1]?.i ?? -1;
  } else {
    const stops = pool.filter(({ n }) => n.isIntermediate);
    idx = (stops[target.stopIndex] ?? stops[stops.length - 1])?.i ?? -1;
  }
  return idx === -1 ? 0 : idx;
}

export interface LegEndpoints<T = TripStopLike> {
  loading: T | null;
  delivery: T | null;
  intermediates: T[];
}

export function getLegStops<T extends TripStopLike = TripStopLike>(
  trip: { stops?: T[] | null } | null | undefined,
  leg: 0 | 1
): T[] {
  if (!trip?.stops || !Array.isArray(trip.stops)) return [];
  return [...trip.stops]
    .filter((s) => (s.leg_index ?? 0) === leg)
    .sort((a, b) => a.stop_sequence - b.stop_sequence);
}

export function getLegEndpoints<T extends TripStopLike = TripStopLike>(
  trip: { stops?: T[] | null } | null | undefined,
  leg: 0 | 1
): LegEndpoints<T> {
  const legStops = getLegStops(trip, leg);
  if (legStops.length === 0) {
    return { loading: null, delivery: null, intermediates: [] };
  }
  if (legStops.length === 1) {
    return { loading: legStops[0], delivery: null, intermediates: [] };
  }
  return {
    loading: legStops[0],
    delivery: legStops[legStops.length - 1],
    intermediates: legStops.slice(1, -1),
  };
}

export function getIntermediateStops(trip: TripLike | null): TimelineStop[] {
  return parseTripRouteNodes(trip).filter((s) => s.isIntermediate);
}

export function getOutboundIntermediateStops(trip: TripLike | null): TimelineStop[] {
  return parseTripRouteNodes(trip).filter((s) => s.isIntermediate && !s.isReturnStop);
}

export function getReturnIntermediateStops(trip: TripLike | null): TimelineStop[] {
  return parseTripRouteNodes(trip).filter((s) => s.isIntermediate && s.isReturnStop);
}
