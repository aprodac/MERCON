import { MobileTrip, TripStop, stopLabel, stopAddress, isRoundTrip, parseStopWorkflowState } from './trips';

export { parseStopWorkflowState };

export interface TimelineStop {
  id: string;
  typeUrdu: string;
  typeEn: string;
  name: string;
  address: string | null;
  iconType: 'House' | 'MapPin' | 'Route';
  isIntermediate?: boolean;
  isReturnStop?: boolean;
  legIndex?: number; // 0 = Outbound, 1 = Return
  stopSequence?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Split a location chain like "Riyadh → Al-Hofuf → Abha" into individual names. */
function splitChain(str: string): string[] {
  if (!str || !str.trim()) return [];
  return str
    .split(/\s*(?:→|->|-->)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Does this string look like a location chain (contains arrow separators)? */
function isChain(str: string): boolean {
  return /→|->|-->/.test(str);
}

/**
 * Extract the best single-line label for a TripStop, preferring
 * location_name → location.name → location_address.
 */
function rawStopName(s: TripStop): string {
  return stopLabel(s) || 'Location';
}

/**
 * Expand DB stop records into a flat list of location name strings.
 * If a stop's name contains arrow chains (e.g. "AL BAHA → AL ABHA"),
 * split it into individual entries. Also strips [RETURN:…] markers.
 */
function expandStops(stops: TripStop[]): string[] {
  const names: string[] = [];
  for (const s of stops) {
    const raw = rawStopName(s);
    // Strip [RETURN:…] suffix — handled separately
    const cleaned = raw.replace(/\s*\[RETURN:.*?\]/gi, '').trim();
    if (isChain(cleaned)) {
      // Stop name IS a location chain → expand each segment
      names.push(...splitChain(cleaned));
    } else if (cleaned) {
      names.push(cleaned);
    }
  }
  return names;
}

/**
 * Find the [RETURN:…] string embedded in any stop's location_name,
 * or in trip.destination.
 */
function extractReturnChain(trip: MobileTrip): string {
  // Check trip.destination first
  if (trip.destination?.includes('[RETURN:')) {
    const m = trip.destination.match(/\[RETURN:\s*(.*?)\s*\]/i);
    if (m?.[1]) return m[1].trim();
  }
  // Check each stop's location_name
  for (const s of trip.stops ?? []) {
    const raw = s.location_name || s.location?.name || '';
    if (raw.includes('[RETURN:')) {
      const m = raw.match(/\[RETURN:\s*(.*?)\s*\]/i);
      if (m?.[1]) return m[1].trim();
    }
  }
  return '';
}

// ─── 6-Node Builder ──────────────────────────────────────────────────────────

function buildTimeline(
  outboundNodes: string[],
  returnNodes: string[],
  dbStops?: TripStop[],
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

  // ── Outbound Leg ─────────────────────────────────────────────────────────
  const [pickup, ...outboundRest] = outboundNodes;

  if (pickup) {
    result.push(node('pickup', 'Pickup', 'پک اپ', pickup, 'House', { legIndex: 0 }));
  }

  let outboundDelivery = '';
  if (outboundRest.length > 1) {
    const outboundIntermediates = outboundRest.slice(0, -1);
    outboundDelivery = outboundRest[outboundRest.length - 1];
    outboundIntermediates.forEach((name, idx) => {
      result.push(
        node(
          `outbound-stop-${idx}`,
          `Intermediate Stop #${idx + 1}`,
          `درمیانی اسٹاپ #${idx + 1}`,
          name, 'Route',
          { legIndex: 0, isIntermediate: true },
        ),
      );
    });
    result.push(node('outbound-delivery', 'Delivery', 'ڈلیوری', outboundDelivery, 'MapPin', { legIndex: 0 }));
  } else if (outboundRest.length === 1) {
    outboundDelivery = outboundRest[0];
    result.push(node('outbound-delivery', 'Delivery', 'ڈلیوری', outboundDelivery, 'MapPin', { legIndex: 0 }));
  }

  // ── Return Leg ───────────────────────────────────────────────────────────
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
            `واپسی کا درمیانی اسٹاپ #${idx + 1}`,
            name, 'Route',
            { legIndex: 1, isIntermediate: true, isReturnStop: true },
          ),
        );
      });
      result.push(node('return-delivery', 'Return Delivery', 'واپسی ڈلیوری', returnDelivery, 'MapPin', { legIndex: 1 }));
    } else if (returnRest.length === 1) {
      result.push(node('return-delivery', 'Return Delivery', 'واپسی ڈلیوری', returnRest[0], 'MapPin', { legIndex: 1 }));
    }
  }

  // ── Attach DB address info where names match ─────────────────────────────
  if (dbStops && dbStops.length > 0) {
    result.forEach((r) => {
      const match = dbStops.find((s) => {
        const label = rawStopName(s).toLowerCase().trim();
        return label === r.name.toLowerCase().trim();
      });
      if (match) {
        r.address = stopAddress(match);
      }
    });
  }

  return result;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Parses any MobileTrip into an ordered list of TimelineStop nodes.
 *
 * Strategy order:
 * 0. Primary: Explicit DB stops with leg_index (Outbound = leg 0, Return = leg 1)
 * 1. Expand DB stops + use [RETURN:] chain from destination/stop name
 * 2. Expand DB stops + detect second Pickup for return leg split
 * 3. trip.origin + trip.destination string parsing
 * 4. Plain DB stops (simple trips)
 */
export function parseTripRouteNodes(trip: MobileTrip | null): TimelineStop[] {
  if (!trip) return [];

  // Prefer the server-computed timeline — same function the web dashboard
  // renders — over re-deriving one from raw stops here. Only fall through to
  // the local strategies below for trips fetched without it (e.g. cached
  // offline data from before this field existed).
  if (Array.isArray(trip.route_timeline) && trip.route_timeline.length >= 2) {
    return trip.route_timeline as TimelineStop[];
  }

  const dbStops = trip.stops ?? [];
  const isRound = isRoundTrip(trip);

  // ── Strategy 0: Explicit DB Stops with leg_index (Primary Source of Truth) ──
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

  // ── Strategy 1: Expand DB stops + [RETURN:] chain ────────────────────────
  const returnChain = extractReturnChain(trip);
  if (dbStops.length > 0) {
    const expandedNames = expandStops(dbStops);
    // De-duplicate consecutive identical names
    const deduped = expandedNames.filter((n, i) => i === 0 || n !== expandedNames[i - 1]);

    if (returnChain) {
      const returnNodes = splitChain(returnChain);
      if (deduped.length >= 2 && returnNodes.length >= 1) {
        return buildTimeline(deduped, returnNodes, dbStops);
      }
    }

    // ── Strategy 2: Split at second Pickup for return leg ─────────────────
    const returnStartIdx = dbStops.findIndex((s, idx) => idx > 0 && s.stop_type === 'Pickup');
    if (returnStartIdx !== -1) {
      const outboundExpanded = expandStops(dbStops.slice(0, returnStartIdx));
      const returnExpanded = expandStops(dbStops.slice(returnStartIdx));
      const outDe = outboundExpanded.filter((n, i) => i === 0 || n !== outboundExpanded[i - 1]);
      const retDe = returnExpanded.filter((n, i) => i === 0 || n !== returnExpanded[i - 1]);
      if (outDe.length >= 2) {
        return buildTimeline(outDe, retDe, dbStops);
      }
    }

    // ── Strategy 3: Explicit DB Stops Order (NO REVERSING) ─────────────
    const first = deduped[0]?.toLowerCase().trim();
    const last = deduped[deduped.length - 1]?.toLowerCase().trim();
    const isCircular = first && last && first === last && deduped.length >= 3;

    if (isCircular || isRound) {
      // Outbound: everything up to (but not including) the final duplicate if circular
      const outboundNodes = isCircular ? deduped.slice(0, -1) : deduped;

      let returnNodes: string[] = [];
      if (isCircular) {
        // Strictly preserve the assigned sequence order
        const intermediates = outboundNodes.slice(1, -1);
        returnNodes = [outboundNodes[outboundNodes.length - 1], ...intermediates, outboundNodes[0]];
      } else if (isRound) {
        if (deduped.length > 2) {
          const outboundIntermediates = deduped.slice(1, -1);
          returnNodes = [deduped[deduped.length - 1], ...outboundIntermediates, deduped[0]];
        } else if (deduped.length >= 2) {
          returnNodes = [deduped[deduped.length - 1], deduped[0]];
        }
      }

      if (outboundNodes.length >= 2 && returnNodes.length > 0) {
        return buildTimeline(outboundNodes, returnNodes, dbStops);
      }
    }

    // ── Strategy 4: Simple expanded outbound only ─────────────────────────
    if (deduped.length >= 2) {
      return buildTimeline(deduped, [], dbStops);
    }
  }


  // ── Strategy 4: trip.origin + trip.destination string parsing ────────────
  const destStr = trip.destination || '';
  const originStr = trip.origin?.trim() || '';

  if (destStr.includes('[RETURN:')) {
    const bracketMatch = destStr.match(/^(.*?)\s*\[RETURN:\s*(.*?)\s*\]$/i);
    const outboundStr = bracketMatch ? bracketMatch[1].trim() : destStr.split(/\[RETURN:/i)[0].trim();
    const returnStr = bracketMatch
      ? bracketMatch[2].trim()
      : (destStr.split(/\[RETURN:/i)[1]?.replace(/\]$/, '').trim() ?? '');
    const outboundChain = originStr ? `${originStr} → ${outboundStr}` : outboundStr;
    const outboundNodes = splitChain(outboundChain);
    const returnNodes = splitChain(returnStr);
    if (outboundNodes.length >= 2) {
      return buildTimeline(outboundNodes, returnNodes, dbStops);
    }
  }

  if (originStr || destStr) {
    const destClean = destStr.replace(/\[.*?\]/g, '').trim();
    const fullChain = originStr
      ? (destClean ? `${originStr} → ${destClean}` : originStr)
      : destClean;
    const outboundNodes = splitChain(fullChain);
    let returnNodes: string[] = [];
    if (isRound && outboundNodes.length >= 2) {
      returnNodes = [outboundNodes[outboundNodes.length - 1], outboundNodes[0]];
    }
    if (outboundNodes.length >= 2) {
      return buildTimeline(outboundNodes, returnNodes, dbStops);
    }
  }

  // ── Strategy 5: Quotation stops & lane name fallback ───────────────────
  const quo = (trip as any).quotation;
  if (quo) {
    const quoStops = Array.isArray(quo.stops) ? quo.stops : [];
    if (quoStops.length >= 2) {
      const names = quoStops.map((s: any) => s.location_name || s.source_label || s.location?.name || s.name || 'Location');
      const isQuoRound = isRound || (quo.line_type || '').toLowerCase().includes('round');
      let ret: string[] = [];
      if (isQuoRound) {
        ret = [names[names.length - 1], names[0]];
      }
      return buildTimeline(names, ret, dbStops);
    }

    if (quo.name && typeof quo.name === 'string') {
      const cleanName = quo.name.replace(/\[RETURN:.*?\]/i, '').trim();
      const returnMatch = quo.name.match(/\[RETURN:\s*(.*?)\s*\]/i);
      const splitSegments = cleanName.split(/\s*(?:→|->|-->|–|-)\s*/).map((s: string) => s.trim()).filter(Boolean);
      if (splitSegments.length >= 2) {
        const isQuoRound = isRound || (quo.line_type || '').toLowerCase().includes('round');
        let ret: string[] = [];
        if (returnMatch?.[1]) {
          ret = splitChain(returnMatch[1]);
        } else if (isQuoRound) {
          ret = [splitSegments[splitSegments.length - 1], splitSegments[0]];
        }
        return buildTimeline(splitSegments, ret, dbStops);
      }
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  if (dbStops.length >= 2) {
    const names = dbStops.map(rawStopName);
    const returnStartIdx = dbStops.findIndex((s, idx) => idx > 0 && s.stop_type === 'Pickup');
    const outbound = returnStartIdx !== -1 ? names.slice(0, returnStartIdx) : names;
    const ret = returnStartIdx !== -1
      ? names.slice(returnStartIdx)
      : (isRound ? [names[names.length - 1], names[0]] : []);
    return buildTimeline(outbound, ret, dbStops);
  }

  return [];
}

// ─── Stepper position ────────────────────────────────────────────────────────

/** Where the driver is in the route, independent of node ids/positions. */
export type TimelineTarget =
  | { kind: 'pickup'; leg: 0 | 1 }
  | { kind: 'stop'; leg: 0 | 1; stopIndex: number }
  | { kind: 'delivery'; leg: 0 | 1 }
  | { kind: 'completed' };

/** Maps a driver workflow state to the route node the driver is at / heading to. */
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

/**
 * Index of `target` in a timeline from parseTripRouteNodes. Resolves by
 * leg + role rather than node id, since server (`origin`) and local
 * (`pickup`) timelines name the first node differently. Returns
 * `nodes.length` for a completed trip (every node done).
 */
export function findTimelineIndex(nodes: TimelineStop[], target: TimelineTarget): number {
  if (target.kind === 'completed') return nodes.length;

  const legOf = (n: TimelineStop) => n.legIndex ?? (n.isReturnStop ? 1 : 0);
  const inLeg = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => legOf(n) === target.leg);
  // No explicit return leg in the timeline → fall back to the outbound leg.
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

// ─── Convenience filters ─────────────────────────────────────────────────────

export function getIntermediateStops(trip: MobileTrip | null): TimelineStop[] {
  return parseTripRouteNodes(trip).filter((s) => s.isIntermediate);
}

export function getOutboundIntermediateStops(trip: MobileTrip | null): TimelineStop[] {
  return parseTripRouteNodes(trip).filter((s) => s.isIntermediate && !s.isReturnStop);
}

export function getReturnIntermediateStops(trip: MobileTrip | null): TimelineStop[] {
  return parseTripRouteNodes(trip).filter((s) => s.isIntermediate && s.isReturnStop);
}
