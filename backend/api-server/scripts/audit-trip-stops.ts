import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public';
}
import { prisma } from '../src/db';
import { isRoundTripCategory } from '@mercon/shared-types';

async function runAudit() {
  console.log('====================================================');
  console.log('   MERCON READ-ONLY TRIP STOPS & LOCATION AUDIT    ');
  console.log('====================================================\n');

  // 1. Fetch active trips with stops
  const trips = await prisma.trip.findMany({
    where: { deletedAt: null },
    include: {
      stops: {
        where: { deletedAt: null },
        orderBy: { stop_sequence: 'asc' },
      },
    },
  });

  let tripsWithUnderTwoStopsPerLeg = 0;
  let tripsWithSequenceGapsOrDuplicates = 0;
  let roundTripCatWithNoLeg1 = 0;
  let leg1WithNonRoundTripCat = 0;

  for (const trip of trips) {
    const stops = trip.stops || [];
    const leg0Stops = stops.filter((s) => (s.leg_index ?? 0) === 0);
    const leg1Stops = stops.filter((s) => (s.leg_index ?? 0) === 1);

    // 1a. Less than 2 stops per leg
    if (leg0Stops.length < 2 || (leg1Stops.length > 0 && leg1Stops.length < 2)) {
      tripsWithUnderTwoStopsPerLeg++;
    }

    // 1b. Gaps / duplicates in stop_sequence
    const sequences = stops.map((s) => s.stop_sequence);
    const hasDuplicates = new Set(sequences).size !== sequences.length;
    const isContiguous = sequences.every((seq, idx) => seq === idx + 1);
    if (hasDuplicates || !isContiguous) {
      tripsWithSequenceGapsOrDuplicates++;
    }

    // 1c. Round-trip rate_category vs leg_index 1 consistency
    const isRoundCat = isRoundTripCategory(trip.rate_category || '');
    const hasLeg1 = leg1Stops.length > 0;

    if (isRoundCat && !hasLeg1) {
      roundTripCatWithNoLeg1++;
    }
    if (!isRoundCat && hasLeg1) {
      leg1WithNonRoundTripCat++;
    }
  }

  // 2. Stops with no locationId
  const stopsWithNoLocationId = await prisma.tripStop.count({
    where: {
      deletedAt: null,
      locationId: null,
    },
  });

  // 3. Stop names containing →, ->, or [RETURN:
  const allStops = await prisma.tripStop.findMany({
    where: { deletedAt: null },
    select: { id: true, location_name: true },
  });

  let stopsWithLegacyArrowOrReturnName = 0;
  for (const stop of allStops) {
    const name = stop.location_name || '';
    if (name.includes('→') || name.includes('->') || name.includes('-->') || name.includes('[RETURN:')) {
      stopsWithLegacyArrowOrReturnName++;
    }
  }

  // 4. Duplicate Locations per customer differing only by "CODE - " prefix or case
  const locations = await prisma.location.findMany({
    where: { deletedAt: null },
    select: { id: true, customerId: true, code: true, name: true },
  });

  const customerLocationMap = new Map<string, Map<string, string[]>>();
  let duplicateLocationsCount = 0;

  for (const loc of locations) {
    const custId = loc.customerId || 'global';
    if (!customerLocationMap.has(custId)) {
      customerLocationMap.set(custId, new Map());
    }
    const locMap = customerLocationMap.get(custId)!;

    const rawName = String(loc.name || '').trim();
    let cleanName = rawName;
    const match = rawName.match(/^([A-Za-z0-9_]+)\s*[\-:]\s*(.+)$/);
    if (match) {
      cleanName = match[2].trim();
    }
    const normKey = cleanName.toLowerCase();

    if (!locMap.has(normKey)) {
      locMap.set(normKey, []);
    }
    locMap.get(normKey)!.push(loc.id);
  }

  for (const [, locMap] of customerLocationMap) {
    for (const [, ids] of locMap) {
      if (ids.length > 1) {
        duplicateLocationsCount += ids.length - 1;
      }
    }
  }

  // 5. Documents whose ai_extracted_json.stop_id is not a stop of that trip
  const tripDocuments = await prisma.document.findMany({
    where: {
      entity_type: 'Trip',
      deletedAt: null,
    },
    select: {
      id: true,
      entity_id: true,
      ai_extracted_json: true,
    },
  });

  let docsWithUnresolvedStopId = 0;

  for (const doc of tripDocuments) {
    const stopId = (doc.ai_extracted_json as any)?.stop_id;
    if (stopId && doc.entity_id) {
      const activeStop = await prisma.tripStop.findFirst({
        where: {
          id: String(stopId),
          trip_id: doc.entity_id,
          deletedAt: null,
        },
      });
      if (!activeStop) {
        docsWithUnresolvedStopId++;
      }
    }
  }

  console.log('AUDIT METRICS REPORT:');
  console.log('----------------------------------------------------');
  console.log(`1. Total Active Trips Audited:                         ${trips.length}`);
  console.log(`2. Trips with < 2 stops per leg:                      ${tripsWithUnderTwoStopsPerLeg}`);
  console.log(`3. Trips with gaps/duplicates in stop_sequence:        ${tripsWithSequenceGapsOrDuplicates}`);
  console.log(`4. Round-trip rate_category but NO leg_index 1 stops:   ${roundTripCatWithNoLeg1}`);
  console.log(`5. Leg_index 1 stops present but NON-round rate_cat:   ${leg1WithNonRoundTripCat}`);
  console.log(`6. TripStops with NO locationId:                       ${stopsWithNoLocationId}`);
  console.log(`7. TripStops containing "→", "->", or "[RETURN:":      ${stopsWithLegacyArrowOrReturnName}`);
  console.log(`8. Duplicate Locations per customer ("CODE - " prefix): ${duplicateLocationsCount}`);
  console.log(`9. Documents with invalid/unresolved stop_id:          ${docsWithUnresolvedStopId}`);
  console.log('----------------------------------------------------\n');
}

runAudit()
  .catch((err) => {
    console.error('Audit Script Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
