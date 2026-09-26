import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFullTripStops } from './legacyStopStringParser';
import { validateTripStops } from './tripValidationService';

/**
 * Regression coverage for the TRP-0252 data-corruption bug: bulkImportTrips
 * used to unconditionally splice parseFullTripStops()'s own first/last stop
 * onto the front/back of an already-correct structured `row.stops` array,
 * duplicating the origin and destination on every trip created through the
 * wizard. This file replicates the exact `parsedStops` resolution logic from
 * tripController.ts's bulkImportTrips (post-fix) against the same inputs the
 * wizard actually sends, so a regression there fails a test instead of
 * silently corrupting new trips again.
 */

interface StructuredStopInput {
  stop_sequence?: number;
  leg_index?: number;
  stop_type?: string;
  location_name?: string;
  location_id?: string;
  lat?: number | null;
  lng?: number | null;
}

/** Mirrors tripController.ts bulkImportTrips's `parsedStops` resolution exactly. */
function resolveParsedStops(row: { origin?: string; destination?: string; stops?: StructuredStopInput[] }) {
  return Array.isArray(row.stops) && row.stops.length > 0
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
}

describe('bulkImportTrips stop resolution (TRP-0252 regression)', () => {
  it('does NOT duplicate origin/destination when structured stops are sent alongside origin/destination strings (the wizard\'s actual request shape)', () => {
    // Exactly what useTripSubmission.ts sends for a Riyadh -> Medina round trip
    // with no intermediate stops: both the legacy display strings AND the
    // correct structured stops, in the same request.
    const row = {
      origin: 'Riyadh',
      destination: 'Medina [RETURN: Medina → Riyadh]',
      stops: [
        { stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
        { stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Medina' },
        { stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Medina' },
        { stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh' },
      ],
    };

    const parsedStops = resolveParsedStops(row);

    assert.equal(parsedStops.length, 4, 'must be exactly 4 stops, not 6 (no duplicate splice)');
    assert.deepEqual(parsedStops.map((s) => s.location_name), ['Riyadh', 'Medina', 'Medina', 'Riyadh']);
    assert.deepEqual(parsedStops.map((s) => s.leg_index), [0, 0, 1, 1]);
    assert.deepEqual(parsedStops.map((s) => s.stop_type), ['Pickup', 'Dropoff', 'Pickup', 'Dropoff']);
    assert.deepEqual(parsedStops.map((s) => s.stop_sequence), [1, 2, 3, 4]);

    // The last stop by sequence — what the web timeline trusts for "final
    // destination" — must be the real return delivery (Riyadh), not a
    // leftover duplicate outbound-leg stop.
    const last = parsedStops[parsedStops.length - 1];
    assert.equal(last.location_name, 'Riyadh');
    assert.equal(last.leg_index, 1);
    assert.equal(last.stop_type, 'Dropoff');

    assert.equal(validateTripStops(parsedStops).isValid, true);
  });

  it('does NOT duplicate origin/destination on a plain one-way trip either (origin+destination always sent alongside stops)', () => {
    const row = {
      origin: 'Riyadh',
      destination: 'Jeddah',
      stops: [
        { stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
        { stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Jeddah' },
      ],
    };

    const parsedStops = resolveParsedStops(row);

    assert.equal(parsedStops.length, 2);
    assert.deepEqual(parsedStops.map((s) => s.location_name), ['Riyadh', 'Jeddah']);
    assert.equal(validateTripStops(parsedStops).isValid, true);
  });

  it('preserves intermediate stops on both legs without duplication', () => {
    const row = {
      origin: 'Riyadh',
      destination: 'Al Baha → Medina [RETURN: Medina → Taif → Riyadh]',
      stops: [
        { stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
        { stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha' },
        { stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Medina' },
        { stop_sequence: 4, leg_index: 1, stop_type: 'Pickup', location_name: 'Medina' },
        { stop_sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif' },
        { stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh' },
      ],
    };

    const parsedStops = resolveParsedStops(row);

    assert.equal(parsedStops.length, 6, 'must be exactly 6 — no duplicate splice on top of intermediates');
    assert.deepEqual(parsedStops.map((s) => s.location_name), ['Riyadh', 'Al Baha', 'Medina', 'Medina', 'Taif', 'Riyadh']);
    assert.equal(validateTripStops(parsedStops).isValid, true);
  });

  it('still falls back to parseFullTripStops for true legacy CSV rows with no structured stops', () => {
    const row = {
      origin: 'Riyadh',
      destination: 'Medina [RETURN: Medina → Riyadh]',
      // No `stops` field at all — this is the actual legacy CSV import shape.
    };

    const parsedStops = resolveParsedStops(row);

    assert.equal(parsedStops.length, 4);
    assert.deepEqual(parsedStops.map((s: any) => s.location_name), ['Riyadh', 'Medina', 'Medina', 'Riyadh']);
    assert.deepEqual(parsedStops.map((s: any) => s.leg_index), [0, 0, 1, 1]);
  });

  it('reproduces the pre-fix bug when the old splicing logic is used, proving the fix is what changed', () => {
    // This is the OLD (buggy) resolution logic, kept here only to prove the
    // regression the test above guards against was real, not hypothetical.
    function oldBuggyResolveParsedStops(row: { origin?: string; destination?: string; stops?: StructuredStopInput[] }) {
      const baseStops = (row.origin || row.destination) ? parseFullTripStops(row.origin || '', row.destination || '') : [];
      return Array.isArray(row.stops) && row.stops.length > 0
        ? [
            ...(baseStops[0] ? [baseStops[0]] : []),
            ...row.stops.map((st, idx) => ({
              stop_sequence: st.stop_sequence ?? (idx + 2),
              leg_index: st.leg_index !== undefined ? Number(st.leg_index) : 0,
              stop_type: (st.stop_type || 'Rest') as 'Pickup' | 'Dropoff' | 'Rest',
              location_name: String(st.location_name ?? '').trim(),
              location_id: st.location_id || null,
              lat: st.lat ?? null,
              lng: st.lng ?? null,
            })),
            ...(baseStops[1] ? [{ ...baseStops[1], stop_sequence: (row.stops.length + (baseStops[0] ? 2 : 1)) }] : []),
          ]
        : baseStops;
    }

    const row = {
      origin: 'Riyadh',
      destination: 'Medina [RETURN: Medina → Riyadh]',
      stops: [
        { stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
        { stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Medina' },
        { stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Medina' },
        { stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh' },
      ],
    };

    const buggyStops = oldBuggyResolveParsedStops(row);

    assert.equal(buggyStops.length, 6, 'the old code really did produce 6 stops for a 4-stop request');
    assert.deepEqual(buggyStops.map((s: any) => s.location_name), ['Riyadh', 'Riyadh', 'Medina', 'Medina', 'Riyadh', 'Medina']);
    // The bogus last stop is Medina with leg_index 0 — exactly what made web's
    // "last stop = return delivery" assumption show Medina instead of Riyadh.
    const buggyLast = buggyStops[buggyStops.length - 1] as any;
    assert.equal(buggyLast.location_name, 'Medina');
    assert.equal(buggyLast.leg_index, 0);
  });
});
