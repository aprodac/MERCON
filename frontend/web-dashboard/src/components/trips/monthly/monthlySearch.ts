import type { MonthlyBoardTrip } from '@/services/tripService';

const ROUTE_CONNECTOR_SET = new Set(['to', 'from', 'via', 'ret', 'return', '-', '->', '>', ',']);

const normalisePlace = (s: string) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/^al[\s-]+|^ad[\s-]+|^ar[\s-]+|^ash[\s-]+|^an[\s-]+/g, '')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/kh/g, 'k')
    .replace(/[^a-z0-9]/g, '');

export const computeMonthlyTripSearchRelevance = (trip: MonthlyBoardTrip, search: string): number => {
  if (!search || !search.trim()) return 0;
  const rawQuery = search.trim().toLowerCase();
  const normQuery = normalisePlace(rawQuery);

  const rawTokens = rawQuery.split(/\s+/).filter(Boolean);
  const locationTokens = rawTokens.filter(t => !ROUTE_CONNECTOR_SET.has(t));
  const effectiveTokens = locationTokens.length > 0 ? locationTokens : rawTokens;

  let score = 0;

  const originText = trip.origin || '';
  const destText = trip.destination || '';
  const rateCardName = trip.rate_card?.name || '';

  const matchesText = (text: string, token: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase();
    const normText = normalisePlace(text);
    const normTok = normalisePlace(token);
    return lower.includes(token) || (normTok ? normText.includes(normTok) : false);
  };

  const startsWithText = (text: string, token: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase();
    const normText = normalisePlace(text);
    const normTok = normalisePlace(token);
    return lower.startsWith(token) || (normTok ? normText.startsWith(normTok) : false);
  };

  // 1. Route Pair Match (e.g., "dammam to BURAIDAH", "dammam - BURAIDAH")
  if (locationTokens.length >= 2) {
    const originTerm = locationTokens[0];
    const destTerm = locationTokens[1];

    const originMatches = matchesText(originText, originTerm) || (rateCardName && matchesText(rateCardName.split(/[-–>]/)[0] || '', originTerm));
    const destMatches = matchesText(destText, destTerm) || (rateCardName && matchesText(rateCardName.split(/[-–>]/).slice(1).join(' ') || '', destTerm));

    const originMatchesDest = matchesText(originText, destTerm);
    const destMatchesOrigin = matchesText(destText, originTerm);

    if (originMatches && destMatches) {
      score += 10000;
    } else if (originMatchesDest && destMatchesOrigin) {
      score += 3000;
    } else if (originMatches) {
      score += 2000;
    } else if (destMatches) {
      score += 1500;
    }
  }

  // 2. Single Location / Token Evaluation (e.g. "dammam")
  const primaryTerm = effectiveTokens[0] || rawQuery;

  // Origin match (TOP PRIORITY)
  if (effectiveTokens.every(tok => matchesText(originText, tok))) {
    score += 5000;
    if (startsWithText(originText, primaryTerm)) {
      score += 1000;
    }
  }

  // Rate card route name origin match
  if (rateCardName) {
    const lowerRc = rateCardName.toLowerCase();
    const normRc = normalisePlace(rateCardName);
    if (lowerRc.includes(primaryTerm) || (normQuery && normRc.includes(normQuery))) {
      score += 800;
      if (lowerRc.startsWith(primaryTerm) || (normQuery && normRc.startsWith(normQuery))) {
        score += 1200;
      }
    }
  }

  // Destination match
  if (effectiveTokens.every(tok => matchesText(destText, tok))) {
    score += 1500;
    if (startsWithText(destText, primaryTerm)) {
      score += 300;
    }
  }

  // Driver name / Vehicle plate match
  const driverName = trip.driver?.name || '';
  const vehiclePlate = trip.vehicle?.plate_number || '';

  if (effectiveTokens.every(tok => matchesText(driverName, tok))) {
    score += 1500;
  }
  if (effectiveTokens.every(tok => matchesText(vehiclePlate, tok))) {
    score += 1500;
  }

  // Ref ID match
  if (trip.ref_id && matchesText(trip.ref_id, rawQuery)) {
    score += 8000;
  }

  return score;
};

