/**
 * Maintenance script to fix legacy photo stop IDs in Document.ai_extracted_json.
 * Rewrites `/^(outbound|return)-stop-\d+$/` timeline IDs to canonical TripStop IDs.
 *
 * Usage:
 *   npx ts-node scripts/fix-legacy-photo-stop-ids.ts           # --dry-run (default)
 *   npx ts-node scripts/fix-legacy-photo-stop-ids.ts --apply   # execute DB updates
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('[ERROR] DATABASE_URL environment variable is required.');
  process.exit(1);
}

let dbTarget = 'Unknown';
try {
  const parsed = new URL(process.env.DATABASE_URL);
  const host = parsed.host;
  const dbName = parsed.pathname.replace(/^\//, '') || 'default';
  dbTarget = `Host: ${host} | DB: ${dbName}`;
} catch {
  dbTarget = '[Unparseable URL]';
}

import { prisma } from '../src/db';
import { getLegEndpoints } from '../src/services/tripRouteTimeline';

const IS_APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`=== Fix Legacy Photo Stop IDs (${IS_APPLY ? 'APPLY MODE' : 'DRY RUN MODE'}) ===`);
  console.log(`Target Database: ${dbTarget}\n`);

  let documents: any[] = [];
  try {
    documents = await prisma.document.findMany({
      where: {
        entity_type: 'Trip',
        deletedAt: null,
      },
      select: {
        id: true,
        entity_id: true,
        file_url: true,
        ai_extracted_json: true,
      },
    });
  } catch (dbErr: any) {
    console.error(`[ERROR] Database query failed: ${dbErr.message || dbErr}`);
    process.exit(1);
  }

  const legacyDocs = documents.filter((doc) => {
    const stopId = (doc.ai_extracted_json as any)?.stop_id;
    return typeof stopId === 'string' && /^(outbound|return)-stop-\d+$/.test(stopId);
  });

  console.log(`Found ${documents.length} total Trip documents.`);
  console.log(`Found ${legacyDocs.length} documents carrying legacy stop_id patterns (outbound-stop-N / return-stop-N).\n`);

  if (legacyDocs.length === 0) {
    console.log('No legacy photo stop IDs found. Nothing to update.');
    return;
  }

  // Pre-fetch trips for matching documents
  const tripIds = Array.from(new Set(legacyDocs.map((d) => d.entity_id).filter(Boolean)));
  const trips = await prisma.trip.findMany({
    where: {
      id: { in: tripIds },
    },
    select: {
      id: true,
      ref_id: true,
      stops: {
        where: { deletedAt: null },
        orderBy: { stop_sequence: 'asc' },
        select: { id: true, leg_index: true, stop_sequence: true, stop_type: true, location_name: true },
      },
    },
  });

  const tripMap = new Map(trips.map((t) => [t.id, t]));

  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of legacyDocs) {
    const currentStopId = (doc.ai_extracted_json as any).stop_id as string;
    const trip = tripMap.get(doc.entity_id);

    if (!trip) {
      console.warn(`[WARN] Doc ${doc.id}: Trip ${doc.entity_id} not found in database.`);
      skippedCount++;
      continue;
    }

    const match = currentStopId.match(/^(outbound|return)-stop-(\d+)$/);
    if (!match) {
      skippedCount++;
      continue;
    }

    const legIndex = match[1] === 'return' ? 1 : 0;
    const intermediateIdx = parseInt(match[2], 10);
    const endpoints = getLegEndpoints(trip as any, legIndex);
    const targetStop = endpoints.intermediates[intermediateIdx];

    if (!targetStop?.id) {
      console.warn(`[UNRESOLVED] Doc ${doc.id} (Trip ${trip.ref_id || trip.id}): Legacy '${currentStopId}' has no matching intermediate stop at index ${intermediateIdx} on leg ${legIndex}.`);
      skippedCount++;
      continue;
    }

    const newStopId = targetStop.id;
    console.log(`[MATCH] Doc ${doc.id} (Trip ${trip.ref_id || trip.id}): '${currentStopId}' -> '${newStopId}' (${targetStop.location_name || 'Intermediate Stop'})`);

    if (IS_APPLY) {
      const updatedJson = {
        ...(typeof doc.ai_extracted_json === 'object' && doc.ai_extracted_json !== null ? doc.ai_extracted_json : {}),
        stop_id: newStopId,
      };
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          ai_extracted_json: updatedJson,
        },
      });
    }

    updatedCount++;
  }

  console.log('\n=== Summary ===');
  console.log(`Mode: ${IS_APPLY ? 'APPLIED TO DB' : 'DRY RUN (No DB changes made)'}`);
  console.log(`Total legacy documents matched: ${legacyDocs.length}`);
  console.log(`Successfully resolved to real TripStop ID: ${updatedCount}`);
  console.log(`Unresolvable or skipped: ${skippedCount}`);

  if (!IS_APPLY && updatedCount > 0) {
    console.log('\nTo apply changes to the database, run:');
    console.log('  npx ts-node scripts/fix-legacy-photo-stop-ids.ts --apply\n');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error in fix-legacy-photo-stop-ids:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
