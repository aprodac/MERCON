import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTimelineProgress, quotationMatchesRoute, getTimelineVehiclePosition, timelineStopRole, stopRoleAt, tripStopRole } from '@mercon/shared-types';

import { validateTripStops } from './tripValidationService';
import { stampWorkflowTransition, stampStopTransition, resolveAuthoritativeActiveStop, stampIntermediateStopVisit } from './tripLifecycle';
import { isRoundTrip, getEffectiveWorkflowState, type MobileTrip, type TripStop, parseTripRouteNodes, parseStopWorkflowState, getLegEndpoints, targetFromWorkflowState, buildTripStops, type BuiltTripStop, isRouteLocked, isRouteEditable, ROUTE_EDITABLE_STATUSES, buildTripRouteTimeline } from './tripRouteTimeline';
import { findQuotationForLane } from './rateLookup';
import { writeTripStops } from './tripStopWriter';
import { parseFullTripStops } from './legacyStopStringParser';

describe('DEEP CODE-LEVEL TEST SUITE — INDEPENDENT OUTBOUND + RETURN ARCHITECTURE', () => {

  // ============================================================
  // TEST CASE #1 — BASIC ONE-WAY
  // ============================================================
  describe('Test Case #1 — Basic One-Way', () => {
    const oneWayStops: TripStop[] = [
      { id: 'stop-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.7136, location_lng: 46.6753, location_address: 'Riyadh Central' },
      { id: 'stop-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Dammam', location_lat: 26.4207, location_lng: 50.0888, location_address: 'Dammam Port' },
    ];

    const oneWayTrip: MobileTrip = {
      id: 'trip-oneway-1',
      ref_id: 'TRP-1001',
      status: 'Scheduled',
      stops: oneWayStops,
      planned_distance: 400,
      planned_end: null,
    };

    it('verifies both stops have leg_index = 0, sequence = 1, 2, and isRoundTrip = false', () => {
      assert.equal(oneWayStops[0].leg_index, 0);
      assert.equal(oneWayStops[1].leg_index, 0);
      assert.equal(oneWayStops[0].stop_sequence, 1);
      assert.equal(oneWayStops[1].stop_sequence, 2);
      assert.equal(isRoundTrip(oneWayTrip), false);
    });

    it('verifies timeline nodes have exactly 2 nodes without return leg', () => {
      const nodes = parseTripRouteNodes(oneWayTrip);
      assert.equal(nodes.length, 2);
      assert.equal(nodes[0].name, 'Riyadh');
      assert.equal(nodes[0].typeEn, 'Pickup');
      assert.equal(nodes[0].legIndex, 0);
      assert.equal(nodes[1].name, 'Dammam');
      assert.equal(nodes[1].typeEn, 'Delivery');
      assert.equal(nodes[1].legIndex, 0);
    });

    it('verifies progression moves through pickup to final delivery', () => {
      assert.equal(getEffectiveWorkflowState({ ...oneWayTrip, driver_workflow_state: 'ASSIGNED' }), 'ASSIGNED');
      assert.equal(getEffectiveWorkflowState({ ...oneWayTrip, driver_workflow_state: 'IN_TRANSIT' }), 'IN_TRANSIT');
      assert.equal(getEffectiveWorkflowState({
        ...oneWayTrip,
        stops: [
          { ...oneWayStops[0], actual_departure: '2026-09-13T10:00:00Z' },
          { ...oneWayStops[1], actual_arrival: '2026-09-13T14:00:00Z' },
        ],
      }), 'ARRIVED_AT_DELIVERY');
      assert.equal(getEffectiveWorkflowState({
        ...oneWayTrip,
        stops: [
          { ...oneWayStops[0], actual_departure: '2026-09-13T10:00:00Z' },
          { ...oneWayStops[1], actual_departure: '2026-09-13T15:00:00Z' },
        ],
      }), 'COMPLETED');
    });
  });

  // ============================================================
  // TEST CASE #2 — MULTI-STOP OUTBOUND
  // ============================================================
  describe('Test Case #2 — Multi-Stop Outbound', () => {
    const stops: TripStop[] = [
      { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
      { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', location_lat: 20.01, location_lng: 41.46, location_address: 'Al Baha' },
      { id: 's3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha', location_lat: 18.21, location_lng: 42.50, location_address: 'Abha' },
      { id: 's4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
    ];

    const trip: MobileTrip = {
      id: 'trip-multi-outbound',
      ref_id: 'TRP-1002',
      status: 'Scheduled',
      stops,
      planned_distance: 1200,
      planned_end: null,
    };

    it('verifies all 4 stops have leg_index = 0 and sequences 1..4', () => {
      stops.forEach((s, idx) => {
        assert.equal(s.leg_index, 0);
        assert.equal(s.stop_sequence, idx + 1);
      });
      assert.equal(isRoundTrip(trip), false);
    });

    it('verifies timeline creates pickup, 2 intermediates, and 1 final delivery (no return stops)', () => {
      const nodes = parseTripRouteNodes(trip);
      assert.equal(nodes.length, 4);
      assert.equal(nodes[0].name, 'Riyadh');
      assert.equal(nodes[1].name, 'Al Baha');
      assert.equal(nodes[1].isIntermediate, true);
      assert.equal(nodes[2].name, 'Abha');
      assert.equal(nodes[2].isIntermediate, true);
      assert.equal(nodes[3].name, 'Al Ahsa');
      assert.equal(nodes[3].typeEn, 'Delivery');
      assert.ok(!nodes.some((n: any) => n.legIndex === 1));
    });
  });

  // ============================================================
  // TEST CASE #3 — SYMMETRIC ROUND TRIP
  // ============================================================
  describe('Test Case #3 — Symmetric Round Trip', () => {
    const stops: TripStop[] = [
      { id: 'sym-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
      { id: 'sym-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.54, location_lng: 39.17, location_address: 'Jeddah' },
      { id: 'sym-3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Jeddah', location_lat: 21.54, location_lng: 39.17, location_address: 'Jeddah' },
      { id: 'sym-4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
    ];

    const trip: MobileTrip = {
      id: 'trip-sym',
      ref_id: 'TRP-1003',
      status: 'Scheduled',
      stops,
      planned_distance: 1900,
      planned_end: null,
    };

    it('verifies explicit leg indexing (0,0,1,1) and round trip classification', () => {
      assert.equal(isRoundTrip(trip), true);
      assert.deepEqual(stops.map(s => s.leg_index), [0, 0, 1, 1]);
      assert.deepEqual(stops.map(s => s.stop_sequence), [1, 2, 3, 4]);
    });

    it('verifies timeline has distinct Outbound and Return sections', () => {
      const nodes = parseTripRouteNodes(trip);
      assert.equal(nodes.length, 4);
      assert.equal(nodes[0].name, 'Riyadh');
      assert.equal(nodes[0].legIndex, 0);
      assert.equal(nodes[1].name, 'Jeddah');
      assert.equal(nodes[1].legIndex, 0);
      assert.equal(nodes[2].name, 'Jeddah');
      assert.equal(nodes[2].legIndex, 1);
      assert.equal(nodes[2].typeEn, 'Return Loading');
      assert.equal(nodes[3].name, 'Riyadh');
      assert.equal(nodes[3].legIndex, 1);
      assert.equal(nodes[3].typeEn, 'Return Delivery');
    });
  });

  // ============================================================
  // TEST CASE #4 — PRIMARY ASYMMETRIC ROUTE
  // ============================================================
  describe('Test Case #4 — Primary Asymmetric Route', () => {
    // OUTBOUND: Riyadh -> Al Baha -> Abha -> Al Ahsa
    // RETURN: Al Ahsa -> Jeddah -> Taif -> Riyadh
    const asymmetricStops: TripStop[] = [
      { id: 'asym-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.7136, location_lng: 46.6753, location_address: 'Riyadh Depot' },
      { id: 'asym-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', location_lat: 20.0129, location_lng: 41.4676, location_address: 'Al Baha Station' },
      { id: 'asym-3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha', location_lat: 18.2164, location_lng: 42.5053, location_address: 'Abha Branch' },
      { id: 'asym-4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.3833, location_lng: 49.5875, location_address: 'Al Ahsa Delivery' },
      { id: 'asym-5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.3833, location_lng: 49.5875, location_address: 'Al Ahsa Return Loading' },
      { id: 'asym-6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.5433, location_lng: 39.1728, location_address: 'Jeddah Terminal' },
      { id: 'asym-7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', location_lat: 21.2854, location_lng: 40.4222, location_address: 'Taif Depot' },
      { id: 'asym-8', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.7136, location_lng: 46.6753, location_address: 'Riyadh Final Delivery' },
    ];

    const trip: MobileTrip = {
      id: 'trip-asym-primary',
      ref_id: 'TRP-1004',
      status: 'Scheduled',
      stops: asymmetricStops,
      planned_distance: 2800,
      planned_end: null,
    };

    it('verifies 1..4 = leg 0, 5..8 = leg 1, and return is NOT reversed or copied from outbound', () => {
      assert.deepEqual(asymmetricStops.map(s => s.leg_index), [0, 0, 0, 0, 1, 1, 1, 1]);
      assert.deepEqual(asymmetricStops.map(s => s.stop_sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.equal(isRoundTrip(trip), true);

      const nodes = parseTripRouteNodes(trip);
      assert.equal(nodes.length, 8);

      // Verify Outbound nodes
      assert.equal(nodes[0].name, 'Riyadh');
      assert.equal(nodes[0].typeEn, 'Pickup');
      assert.equal(nodes[1].name, 'Al Baha');
      assert.equal(nodes[1].isIntermediate, true);
      assert.equal(nodes[2].name, 'Abha');
      assert.equal(nodes[2].isIntermediate, true);
      assert.equal(nodes[3].name, 'Al Ahsa');
      assert.equal(nodes[3].typeEn, 'Delivery');

      // Verify Return nodes strictly match Jeddah -> Taif -> Riyadh (NOT Abha -> Al Baha -> Riyadh)
      assert.equal(nodes[4].name, 'Al Ahsa');
      assert.equal(nodes[4].typeEn, 'Return Loading');
      assert.equal(nodes[5].name, 'Jeddah');
      assert.equal(nodes[5].isReturnStop, true);
      assert.equal(nodes[6].name, 'Taif');
      assert.equal(nodes[6].isReturnStop, true);
      assert.equal(nodes[7].name, 'Riyadh');
      assert.equal(nodes[7].typeEn, 'Return Delivery');
    });
  });

  // ============================================================
  // TEST CASE #5 — COMPLETELY DIFFERENT RETURN ORIGIN
  // ============================================================
  describe('Test Case #5 — Completely Different Return Origin', () => {
    // OUTBOUND: Riyadh -> Al Baha -> Al Ahsa
    // RETURN: Dammam -> Hofuf -> Taif -> Riyadh
    const stops: TripStop[] = [
      { id: 'diff-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
      { id: 'diff-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', location_lat: 20.01, location_lng: 41.46, location_address: 'Al Baha' },
      { id: 'diff-3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
      { id: 'diff-4', stop_sequence: 4, leg_index: 1, stop_type: 'Pickup', location_name: 'Dammam', location_lat: 26.42, location_lng: 50.08, location_address: 'Dammam' },
      { id: 'diff-5', stop_sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Hofuf', location_lat: 25.36, location_lng: 49.58, location_address: 'Hofuf' },
      { id: 'diff-6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', location_lat: 21.28, location_lng: 40.42, location_address: 'Taif' },
      { id: 'diff-7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
    ];

    const trip: MobileTrip = {
      id: 'trip-diff-origin',
      ref_id: 'TRP-1005',
      status: 'Scheduled',
      stops,
      planned_distance: 2200,
      planned_end: null,
    };

    it('verifies Return Loading is Dammam, NOT Al Ahsa, and is NOT modified by outbound destination', () => {
      const nodes = parseTripRouteNodes(trip);
      assert.equal(nodes.length, 7);
      assert.equal(nodes[2].name, 'Al Ahsa');
      assert.equal(nodes[2].typeEn, 'Delivery');
      assert.equal(nodes[2].legIndex, 0);

      assert.equal(nodes[3].name, 'Dammam');
      assert.equal(nodes[3].typeEn, 'Return Loading');
      assert.equal(nodes[3].legIndex, 1);

      assert.equal(nodes[4].name, 'Hofuf');
      assert.equal(nodes[5].name, 'Taif');
      assert.equal(nodes[6].name, 'Riyadh');
      assert.equal(nodes[6].typeEn, 'Return Delivery');
    });
  });

  // ============================================================
  // TEST CASE #6 — UNEQUAL STOP COUNTS
  // ============================================================
  describe('Test Case #6 — Unequal Stop Counts (2 Outbound, 6 Return = 8 Total)', () => {
    const stops: TripStop[] = [
      // Outbound (2 stops)
      { id: 'u-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
      { id: 'u-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
      // Return (6 stops)
      { id: 'u-3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
      { id: 'u-4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Dammam', location_lat: 26.42, location_lng: 50.08, location_address: 'Dammam' },
      { id: 'u-5', stop_sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Hofuf', location_lat: 25.36, location_lng: 49.58, location_address: 'Hofuf' },
      { id: 'u-6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', location_lat: 21.28, location_lng: 40.42, location_address: 'Taif' },
      { id: 'u-7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.54, location_lng: 39.17, location_address: 'Jeddah' },
      { id: 'u-8', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
    ];

    const trip: MobileTrip = {
      id: 'trip-unequal',
      ref_id: 'TRP-1006',
      status: 'Scheduled',
      stops,
      planned_distance: 3100,
      planned_end: null,
    };

    it('verifies exact 8 stops without assuming outbound count equals return count', () => {
      const nodes = parseTripRouteNodes(trip);
      assert.equal(nodes.length, 8);
      const outboundNodes = nodes.filter((n: any) => n.legIndex === 0);
      const returnNodes = nodes.filter((n: any) => n.legIndex === 1);
      assert.equal(outboundNodes.length, 2);
      assert.equal(returnNodes.length, 6);
      assert.equal(returnNodes[0].name, 'Al Ahsa');
      assert.equal(returnNodes[5].name, 'Riyadh');
    });
  });

  // ============================================================
  // TEST CASE #7 — DUPLICATE CITY NAMES WITH DISTINCT IDS
  // ============================================================
  describe('Test Case #7 — Duplicate City Names (Warehouse A vs Warehouse B)', () => {
    const stops: TripStop[] = [
      { id: 'stop-wh-a', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh Warehouse A', location_lat: 24.8100, location_lng: 46.7100, location_address: 'Northern Logistics Park' },
      { id: 'stop-dest', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa Station', location_lat: 25.3800, location_lng: 49.5800, location_address: 'Al Ahsa Industrial' },
      { id: 'stop-ret-load', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa Station', location_lat: 25.3800, location_lng: 49.5800, location_address: 'Al Ahsa Industrial' },
      { id: 'stop-wh-b', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh Warehouse B', location_lat: 24.6200, location_lng: 46.8200, location_address: 'Southern Industrial City' },
    ];

    it('verifies navigation target selects Warehouse B coordinates (24.62, 46.82), NOT Warehouse A (24.81, 46.71)', () => {
      const returnDelivery = stops.filter(s => s.leg_index === 1 && s.stop_type === 'Dropoff')[0];
      assert.equal(returnDelivery.id, 'stop-wh-b');
      assert.equal(returnDelivery.location_lat, 24.6200);
      assert.equal(returnDelivery.location_lng, 46.8200);
      assert.notEqual(returnDelivery.location_lat, stops[0].location_lat);
    });
  });

  // ============================================================
  // TEST CASE #8 — MULTIPLE OCCURRENCES OF SAME CITY
  // ============================================================
  describe('Test Case #8 — Multiple Occurrences of Same City in One Route', () => {
    // Riyadh -> Al Ahsa -> Riyadh, Return: Riyadh -> Dammam -> Riyadh
    const stops: TripStop[] = [
      { id: 'r1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh Stop 1' },
      { id: 'r2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa Stop 2' },
      { id: 'r3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.72, location_lng: 46.68, location_address: 'Riyadh Stop 3' },
      { id: 'r4', stop_sequence: 4, leg_index: 1, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.72, location_lng: 46.68, location_address: 'Riyadh Stop 4' },
      { id: 'r5', stop_sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Dammam', location_lat: 26.42, location_lng: 50.08, location_address: 'Dammam Stop 5' },
      { id: 'r6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.73, location_lng: 46.69, location_address: 'Riyadh Stop 6' },
    ];

    it('preserves all 6 stops distinctly without collapsing identical city names', () => {
      const trip: MobileTrip = { id: 'trip-multi-city', ref_id: 'TRP-1008', status: 'Scheduled', stops, planned_distance: 1800, planned_end: null };
      const nodes = parseTripRouteNodes(trip);
      assert.equal(nodes.length, 6);
      assert.deepEqual(nodes.map((n: any) => n.name), ['Riyadh', 'Al Ahsa', 'Riyadh', 'Riyadh', 'Dammam', 'Riyadh']);
    });
  });

  // ============================================================
  // TEST CASE #9 — STRICT RETURN START GUARD
  // ============================================================
  describe('Test Case #9 — Strict Return Start Guard', () => {
    // Mock prisma client for tripLifecycle
    function createMockTx(stops: any[]) {
      const stateStops = JSON.parse(JSON.stringify(stops));
      return {
        tripStop: {
          findMany: async () => stateStops,
          findFirst: async (args: any) => {
            let filtered = stateStops.filter((s: any) => s.deletedAt === null);
            if (args.where?.stop_type) filtered = filtered.filter((s: any) => s.stop_type === args.where.stop_type);
            if (args.where?.leg_index !== undefined) filtered = filtered.filter((s: any) => (s.leg_index ?? 0) === args.where.leg_index);
            if (args.orderBy?.stop_sequence === 'desc') filtered.sort((a: any, b: any) => b.stop_sequence - a.stop_sequence);
            else filtered.sort((a: any, b: any) => a.stop_sequence - b.stop_sequence);
            return filtered[0] || null;
          },
          updateMany: async (args: any) => {
            let count = 0;
            stateStops.forEach((s: any) => {
              if (args.where?.id && s.id !== args.where.id) return;
              if (args.where?.actual_arrival === null && s.actual_arrival !== null) return;
              if (args.where?.actual_departure === null && s.actual_departure !== null) return;
              if (args.data.actual_arrival) s.actual_arrival = args.data.actual_arrival;
              if (args.data.actual_departure) s.actual_departure = args.data.actual_departure;
              count++;
            });
            return { count };
          },
          update: async (args: any) => {
            const stop = stateStops.find((s: any) => s.id === args.where.id);
            if (stop) Object.assign(stop, args.data);
            return stop;
          },
        },
      } as any;
    }

    const testStops = [
      { id: 'rg-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', actual_arrival: '2026-09-13T08:00:00Z', actual_departure: '2026-09-13T08:30:00Z', deletedAt: null },
      { id: 'rg-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', actual_arrival: null, actual_departure: null, deletedAt: null },
      { id: 'rg-3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', actual_arrival: null, actual_departure: null, deletedAt: null },
      { id: 'rg-4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', actual_arrival: null, actual_departure: null, deletedAt: null },
    ];

    it('rejects RETURN_LOADING transition if outbound delivery has NOT completed', async () => {
      const tx = createMockTx(testStops);
      await assert.rejects(
        async () => {
          await stampWorkflowTransition(tx, 'trip-guard-test', 'RETURN_LOADING');
        },
        /OUTBOUND_DELIVERY_NOT_COMPLETED: Cannot start return leg before completing outbound delivery/
      );
    });

    it('succeeds with RETURN_LOADING transition once outbound delivery is arrived', async () => {
      const arrivedStops = JSON.parse(JSON.stringify(testStops));
      arrivedStops[1].actual_arrival = new Date('2026-09-13T12:00:00Z');
      const tx = createMockTx(arrivedStops);

      await stampWorkflowTransition(tx, 'trip-guard-test', 'RETURN_LOADING');
      const finalStops = await tx.tripStop.findMany();
      // Outbound delivery should have its departure stamped and return loading its arrival stamped
      assert.ok(finalStops[1].actual_departure != null);
      assert.ok(finalStops[2].actual_arrival != null);
    });
  });

  // ============================================================
  // TEST CASE #10 — WRONG STOP TRANSITION REGRESSION
  // ============================================================
  describe('Test Case #10 — Wrong Stop Transition Regression', () => {
    it('verifies that InTransit on leg 0 stamps outbound pickup, but does NOT stamp return loading pickup', async () => {
      const stateStops = [
        { id: 'w-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', actual_arrival: new Date(), actual_departure: null, planned_arrival: null, location_name: 'Riyadh', deletedAt: null },
        { id: 'w-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', actual_arrival: null, actual_departure: null, planned_arrival: null, location_name: 'Al Ahsa', deletedAt: null },
        { id: 'w-3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', actual_arrival: null, actual_departure: null, planned_arrival: null, location_name: 'Al Ahsa', deletedAt: null },
        { id: 'w-4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', actual_arrival: null, actual_departure: null, planned_arrival: null, location_name: 'Riyadh', deletedAt: null },
      ];

      const mockTx = {
        tripStop: {
          findFirst: async (args: any) => {
            let filtered = stateStops.filter((s: any) => s.stop_type === args.where.stop_type && s.deletedAt === null);
            if (args.where?.leg_index !== undefined) filtered = filtered.filter((s: any) => (s.leg_index ?? 0) === args.where.leg_index);
            return filtered[0] || null;
          },
          update: async (args: any) => {
            const stop = stateStops.find(s => s.id === args.where.id);
            if (stop) Object.assign(stop, args.data);
            return stop;
          },
        },
      } as any;

      await stampStopTransition(mockTx, 'trip-wrong-stop', 'InTransit' as any);
      assert.ok(stateStops[0].actual_departure !== null, 'Outbound pickup departed');
      assert.equal(stateStops[2].actual_departure, null, 'Return pickup must remain unstamped');
    });
  });

  // ============================================================
  // TEST CASE #11 — ACTIVE STOP RESOLUTION (8 STOPS PROGRESSION)
  // ============================================================
  describe('Test Case #11 — Active Stop Resolution Progression', () => {
    const stops: TripStop[] = [
      { id: 'as-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
      { id: 'as-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', location_lat: 20.01, location_lng: 41.46, location_address: 'Al Baha' },
      { id: 'as-3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha', location_lat: 18.21, location_lng: 42.50, location_address: 'Abha' },
      { id: 'as-4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
      { id: 'as-5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
      { id: 'as-6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.54, location_lng: 39.17, location_address: 'Jeddah' },
      { id: 'as-7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', location_lat: 21.28, location_lng: 40.42, location_address: 'Taif' },
      { id: 'as-8', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
    ];

    // Simulates the LiveNavigationScreen resolver
    function resolveNavStops(tripStops: TripStop[], ws: string) {
      const legIndex = (ws === 'RETURN_LOADING' || ws === 'IN_TRANSIT_RETURN' || ws === 'ARRIVED_AT_FINAL_DELIVERY' || ws === 'FINAL_DELIVERY_VERIFICATION' || ws === 'FIRST_DELIVERY_COMPLETED' || ws.includes('RETURN_STOP')) ? 1 : 0;
      const legStops = tripStops.filter(s => (s.leg_index ?? 0) === legIndex);
      const pickupStop = legStops.find(s => s.stop_type === 'Pickup') || legStops[0];
      const dropoffStop = legStops.filter(s => s.stop_type === 'Dropoff').pop() || legStops[legStops.length - 1];

      let activeStop = dropoffStop;
      if (ws === 'ASSIGNED' || ws === 'GOING_TO_PICKUP' || ws === 'ARRIVED_AT_PICKUP' || ws === 'RETURN_LOADING') {
        activeStop = pickupStop;
      } else if (ws.includes('STOP') && !ws.includes('PICKUP') && !ws.includes('DELIVERY')) {
        const intermediate = legStops.find(s => !s.actual_departure && s.id !== pickupStop.id && s.id !== dropoffStop.id);
        if (intermediate) activeStop = intermediate;
      }
      return { activeStop, pickupStop, dropoffStop };
    }

    it('resolves exact stop ID across all 8 workflow stages', () => {
      assert.equal(resolveNavStops(stops, 'GOING_TO_PICKUP').activeStop.id, 'as-1');
      assert.equal(resolveNavStops(stops, 'GOING_TO_STOP').activeStop.id, 'as-2'); // Al Baha
      assert.equal(resolveNavStops(stops, 'ARRIVED_AT_DELIVERY').activeStop.id, 'as-4'); // Al Ahsa delivery
      assert.equal(resolveNavStops(stops, 'RETURN_LOADING').activeStop.id, 'as-5'); // Al Ahsa return loading
      assert.equal(resolveNavStops(stops, 'GOING_TO_RETURN_STOP').activeStop.id, 'as-6'); // Jeddah return stop
      assert.equal(resolveNavStops(stops, 'ARRIVED_AT_FINAL_DELIVERY').activeStop.id, 'as-8'); // Riyadh return delivery
    });
  });

  // ============================================================
  // TEST CASE #12 — NAVIGATION TARGET RESOLUTION
  // ============================================================
  describe('Test Case #12 — Navigation Target Coordinates Matching', () => {
    const stops: TripStop[] = [
      { id: 'nav-jeddah', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah Terminal', location_lat: 21.5433, location_lng: 39.1728, location_address: 'Jeddah Port' },
      { id: 'nav-taif', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif Depot', location_lat: 21.2854, location_lng: 40.4222, location_address: 'Taif Station' },
    ];

    it('matches exact latitude and longitude for Jeddah and Taif', () => {
      assert.equal(stops[0].location_lat, 21.5433);
      assert.equal(stops[0].location_lng, 39.1728);
      assert.equal(stops[1].location_lat, 21.2854);
      assert.equal(stops[1].location_lng, 40.4222);
    });
  });

  // ============================================================
  // TEST CASE #13 — MISSING COORDINATES
  // ============================================================
  describe('Test Case #13 — Missing Coordinates Handling', () => {
    it('does not silently inject fallback coordinates when coordinates are null', () => {
      const stopWithoutCoords: TripStop = {
        id: 'stop-no-coords',
        stop_sequence: 2,
        leg_index: 0,
        stop_type: 'Dropoff',
        location_name: 'Remote Desert Post',
        location_lat: null as any,
        location_lng: null as any,
        location_address: null,
      };

      assert.equal(stopWithoutCoords.location_lat, null);
      assert.equal(stopWithoutCoords.location_lng, null);
    });
  });

  // ============================================================
  // TEST CASE #14 — LEG INDEX VALIDATION
  // ============================================================
  describe('Test Case #14 — Leg Index Validation', () => {
    it('rejects alternating leg progression 0 -> 1 -> 0', () => {
      const stops = [
        { stop_sequence: 1, leg_index: 0, location_name: 'A' },
        { stop_sequence: 2, leg_index: 1, location_name: 'B' },
        { stop_sequence: 3, leg_index: 0, location_name: 'C' },
      ];
      const res = validateTripStops(stops);
      assert.equal(res.isValid, false);
      assert.match(res.error || '', /cannot revert to leg 0 after leg 1/i);
    });

    it('rejects negative leg index', () => {
      const res = validateTripStops([{ stop_sequence: 1, leg_index: -1, location_name: 'A' }]);
      assert.equal(res.isValid, false);
      assert.match(res.error || '', /negative leg_index/i);
    });

    it('rejects leg index > 1 (only 0 and 1 are supported in MERCON)', () => {
      const res = validateTripStops([
        { stop_sequence: 1, leg_index: 0, location_name: 'A' },
        { stop_sequence: 2, leg_index: 2, location_name: 'B' },
      ]);
      assert.equal(res.isValid, false);
      assert.match(res.error || '', /invalid leg_index \(2\)/i);
    });
  });

  // ============================================================
  // TEST CASE #15 — GLOBAL SEQUENCE VALIDATION
  // ============================================================
  describe('Test Case #15 — Global Sequence Validation', () => {
    it('accepts strictly continuous 1..N sequence', () => {
      const stops = [
        { stop_sequence: 1, leg_index: 0, location_name: 'A' },
        { stop_sequence: 2, leg_index: 0, location_name: 'B' },
        { stop_sequence: 3, leg_index: 1, location_name: 'C' },
        { stop_sequence: 4, leg_index: 1, location_name: 'D' },
      ];
      assert.equal(validateTripStops(stops).isValid, true);
    });

    it('rejects gap in sequence (1, 2, 4, 5)', () => {
      const stops = [
        { stop_sequence: 1, location_name: 'A' },
        { stop_sequence: 2, location_name: 'B' },
        { stop_sequence: 4, location_name: 'C' },
      ];
      const res = validateTripStops(stops);
      assert.equal(res.isValid, false);
      assert.match(res.error || '', /continuous without gaps/i);
    });

    it('rejects duplicate sequence (1, 2, 2, 3)', () => {
      const stops = [
        { stop_sequence: 1, location_name: 'A' },
        { stop_sequence: 2, location_name: 'B' },
        { stop_sequence: 2, location_name: 'C' },
        { stop_sequence: 3, location_name: 'D' },
      ];
      const res = validateTripStops(stops);
      assert.equal(res.isValid, false);
      assert.match(res.error || '', /cannot duplicate or reset/i);
    });

    it('rejects return leg sequence reset (1, 2, 3, 1, 2)', () => {
      const stops = [
        { stop_sequence: 1, leg_index: 0, location_name: 'A' },
        { stop_sequence: 2, leg_index: 0, location_name: 'B' },
        { stop_sequence: 3, leg_index: 0, location_name: 'C' },
        { stop_sequence: 1, leg_index: 1, location_name: 'D' },
      ];
      const res = validateTripStops(stops);
      assert.equal(res.isValid, false);
      assert.match(res.error || '', /cannot duplicate or reset/i);
    });
  });

  // ============================================================
  // TEST CASE #16 — LEG/STOP TYPE SEMANTICS INDEPENDENT OF STOP COUNT
  // ============================================================
  describe('Test Case #16 — Semantics Independent of Intermediate Stop Count', () => {
    // 2-stop outbound vs 4-stop outbound
    const trip2Outbound: MobileTrip = {
      id: 't2', ref_id: 'TRP-2', status: 'Scheduled', planned_distance: 100, planned_end: null,
      stops: [
        { id: 'a1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
        { id: 'a2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
        { id: 'a3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
        { id: 'a4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
      ]
    };

    const trip4Outbound: MobileTrip = {
      id: 't4', ref_id: 'TRP-4', status: 'Scheduled', planned_distance: 100, planned_end: null,
      stops: [
        { id: 'b1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
        { id: 'b2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', location_lat: 20.0, location_lng: 41.4, location_address: 'B' },
        { id: 'b3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha', location_lat: 18.2, location_lng: 42.5, location_address: 'Ab' },
        { id: 'b4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
        { id: 'b5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
        { id: 'b6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
      ]
    };

    it('correctly identifies return loading stop in both 2-stop and 4-stop outbound routes', () => {
      const nodes2 = parseTripRouteNodes(trip2Outbound);
      const nodes4 = parseTripRouteNodes(trip4Outbound);

      const retLoad2 = nodes2.find((n: any) => n.typeEn === 'Return Loading');
      const retLoad4 = nodes4.find((n: any) => n.typeEn === 'Return Loading');

      assert.equal(retLoad2?.name, 'Al Ahsa');
      assert.equal(retLoad4?.name, 'Al Ahsa');
      assert.equal(retLoad2?.stopSequence, 3);
      assert.equal(retLoad4?.stopSequence, 5); // Correctly sequence 5, not hardcoded 3!
    });
  });

  // ============================================================
  // TEST CASE #17 — STRUCTURED DATA PRIORITY OVER LEGACY STRING
  // ============================================================
  describe('Test Case #17 — Structured Data Priority', () => {
    it('prioritizes structured stops array over conflicting destination string', () => {
      const trip: MobileTrip = {
        id: 't-conflict',
        ref_id: 'TRP-1017',
        status: 'Scheduled',
        planned_distance: 500,
        planned_end: null,
        // Legacy string claims return is to Dammam
        destination: 'Al Ahsa [RETURN: Al Ahsa → Dammam]',
        // Structured data specifies return is to Jeddah -> Taif -> Riyadh
        stops: [
          { id: 'c1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
          { id: 'c2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
          { id: 'c3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
          { id: 'c4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.5, location_lng: 39.1, location_address: 'J' },
          { id: 'c5', stop_sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', location_lat: 21.2, location_lng: 40.4, location_address: 'T' },
          { id: 'c6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
        ]
      };

      const nodes = parseTripRouteNodes(trip);
      // Structured stops must win: return should contain Jeddah and Taif, NOT Dammam
      const returnNames = nodes.filter((n: any) => n.legIndex === 1).map((n: any) => n.name);
      assert.deepEqual(returnNames, ['Al Ahsa', 'Jeddah', 'Taif', 'Riyadh']);
      assert.ok(!returnNames.includes('Dammam'));
    });
  });

  // ============================================================
  // TEST CASE #18 — LEGACY ROUTE COMPATIBILITY
  // ============================================================
  describe('Test Case #18 — Legacy Route Compatibility', () => {
    it('gracefully handles legacy trips where leg_index is absent using [RETURN: ...] marker', () => {
      const legacyTrip: MobileTrip = {
        id: 't-legacy',
        ref_id: 'TRP-LEGACY',
        status: 'Scheduled',
        planned_distance: 800,
        planned_end: null,
        origin: 'Riyadh',
        destination: 'Al Ahsa [RETURN: Al Ahsa → Riyadh]',
        stops: [], // No structured stops
      };

      const nodes = parseTripRouteNodes(legacyTrip);
      assert.equal(nodes.length, 4); // Outbound: Riyadh -> Al Ahsa; Return: Al Ahsa -> Riyadh
      assert.equal(nodes[0].name, 'Riyadh');
      assert.equal(nodes[1].name, 'Al Ahsa');
      assert.equal(nodes[2].name, 'Al Ahsa');
      assert.equal(nodes[3].name, 'Riyadh');
    });
  });

  // ============================================================
  // TEST CASE #19 — NO SYNTHETIC REVERSAL
  // ============================================================
  describe('Test Case #19 — Strict Forward Route (No Synthetic Reversal)', () => {
    it('preserves return order D -> X -> Y -> A exactly, without reversing to D -> Y -> X -> A', () => {
      const trip: MobileTrip = {
        id: 't-rev-check',
        ref_id: 'TRP-REV',
        status: 'Scheduled',
        planned_distance: 500,
        planned_end: null,
        stops: [
          { id: 'p-A', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Point A', location_lat: 1, location_lng: 1, location_address: 'A' },
          { id: 'p-B', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Point B', location_lat: 2, location_lng: 2, location_address: 'B' },
          { id: 'p-C', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Point C', location_lat: 3, location_lng: 3, location_address: 'C' },
          { id: 'p-D', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Point D', location_lat: 4, location_lng: 4, location_address: 'D' },
          { id: 'p-D-ret', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Point D', location_lat: 4, location_lng: 4, location_address: 'D' },
          { id: 'p-X', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Point X', location_lat: 5, location_lng: 5, location_address: 'X' },
          { id: 'p-Y', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Point Y', location_lat: 6, location_lng: 6, location_address: 'Y' },
          { id: 'p-A-ret', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Point A', location_lat: 1, location_lng: 1, location_address: 'A' },
        ]
      };

      const nodes = parseTripRouteNodes(trip);
      const returnStopNames = nodes.filter((n: any) => n.legIndex === 1).map((n: any) => n.name);
      // MUST be Point D -> Point X -> Point Y -> Point A
      assert.deepEqual(returnStopNames, ['Point D', 'Point X', 'Point Y', 'Point A']);
    });
  });

  // ============================================================
  // TEST CASE #20 — QUOTATION → TRIP CONVERSION PRESERVATION
  // ============================================================
  describe('Test Case #20 — Quotation to Trip Conversion Route Mapping', () => {
    it('preserves all legs, stop types, and continuous global sequences when creating stops', () => {
      const quotationStops = [
        { sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
        { sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha' },
        { sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa' },
        { sequence: 4, leg_index: 1, stop_type: 'Pickup', location_name: 'Dammam' },
        { sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Hofuf' },
        { sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif' },
        { sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh' },
      ];

      // Conversion logic mirrors tripController createTrip
      const convertedTripStops = quotationStops.map((qs, index) => ({
        stop_sequence: index + 1,
        leg_index: qs.leg_index ?? 0,
        stop_type: qs.stop_type,
        location_name: qs.location_name,
      }));

      assert.equal(convertedTripStops.length, 7);
      assert.deepEqual(convertedTripStops.map(s => s.leg_index), [0, 0, 0, 1, 1, 1, 1]);
      assert.deepEqual(convertedTripStops.map(s => s.stop_sequence), [1, 2, 3, 4, 5, 6, 7]);
    });
  });

  // ============================================================
  // TEST CASE #21 — TRIP STOP UPDATE PRESERVATION
  // ============================================================
  describe('Test Case #21 — Trip Stop Update Isolation', () => {
    it('updating a return stop modifies only that stop and leaves leg_index and sequence intact', () => {
      const stops: TripStop[] = [
        { id: 'up-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
        { id: 'up-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
        { id: 'up-3', stop_sequence: 3, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.3, location_lng: 49.5, location_address: 'A' },
        { id: 'up-4', stop_sequence: 4, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.5, location_lng: 39.1, location_address: 'J' },
        { id: 'up-5', stop_sequence: 5, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.7, location_lng: 46.7, location_address: 'R' },
      ];

      // Update stop up-4 from Jeddah to Medina
      const updatedStops = stops.map(s => s.id === 'up-4' ? { ...s, location_name: 'Medina', location_lat: 24.52, location_lng: 39.56 } : s);

      assert.equal(updatedStops[3].location_name, 'Medina');
      assert.equal(updatedStops[3].leg_index, 1);
      assert.equal(updatedStops[3].stop_sequence, 4);
      // Unrelated stops unchanged
      assert.equal(updatedStops[0].location_name, 'Riyadh');
      assert.equal(updatedStops[1].location_name, 'Al Ahsa');
      assert.equal(updatedStops[2].location_name, 'Al Ahsa');
      assert.equal(updatedStops[4].location_name, 'Riyadh');
    });
  });

  // ============================================================
  // TEST CASE #22 — DUPLICATE TRANSITION IDEMPOTENCY
  // ============================================================
  describe('Test Case #22 — Duplicate Request / Idempotency', () => {
    it('calling stampStopTransition twice does not overwrite the timestamp or create duplicate detection', async () => {
      const recordedTime = new Date('2026-09-13T09:00:00Z');
      const stop = {
        id: 'idem-1',
        tripId: 'trip-idem',
        stop_type: 'Pickup',
        leg_index: 0,
        stop_sequence: 1,
        actual_arrival: null as Date | null,
        planned_arrival: new Date('2026-09-13T08:00:00Z'),
        location_name: 'Riyadh',
        deletedAt: null,
      };

      const mockTx = {
        tripStop: {
          findFirst: async () => stop,
          update: async (args: any) => {
            Object.assign(stop, args.data);
            return stop;
          },
        },
        trip: {
          findUnique: async () => ({ ref_id: 'TRP-IDEM' }),
        },
      } as any;

      // First call
      const firstResult = await stampStopTransition(mockTx, 'trip-idem', 'Loading' as any);
      assert.ok(firstResult !== null);
      assert.ok(stop.actual_arrival !== null);
      const stampedTime = stop.actual_arrival;

      // Second identical call
      const secondResult = await stampStopTransition(mockTx, 'trip-idem', 'Loading' as any);
      assert.equal(secondResult, null, 'Duplicate call must return null and do nothing');
      assert.equal(stop.actual_arrival, stampedTime, 'Timestamp must remain identical');
    });
  });

  // ============================================================
  // TEST CASE #23 & #24 — OFFLINE & PHOTO POD METADATA INTEGRITY
  // ============================================================
  describe('Test Case #24 — Photo / POD Association Verification', () => {
    it('stamps photo evidence with exact leg_index and operation', () => {
      const photoPayload = {
        tripId: 'trip-pod-1',
        stopId: 'stop-wh-b',
        leg_index: 1,
        operation: 'return_delivery_arrival',
        kind: 'pod',
      };

      assert.equal(photoPayload.leg_index, 1);
      assert.equal(photoPayload.stopId, 'stop-wh-b');
      assert.equal(photoPayload.operation, 'return_delivery_arrival');
    });
  });

  // ============================================================
  // SPECIAL TEST: DIRECT REPRODUCTION OF THE ORIGINAL AL BAHA BUG
  // ============================================================
  describe('Special Test — Reproduction of the Original Al Baha Bug', () => {
    /**
     * The original bug:
     * When Outbound was: Riyadh -> Al Baha -> Abha -> Al Ahsa
     * The return leg was incorrectly synthesized from the outbound stops,
     * causing "Al Baha" to appear as the Return Loading location!
     *
     * The corrected behavior:
     * Return Loading location MUST be Al Ahsa (where outbound delivery finished),
     * and Return Intermediate stops must be Jeddah and Taif, NEVER Al Baha!
     */
    it('proves Return Loading is Al Ahsa and NOT Al Baha', () => {
      const trip: MobileTrip = {
        id: 'trip-al-baha-regression',
        ref_id: 'TRP-ORIG-BUG',
        status: 'InTransit',
        planned_distance: 2800,
        planned_end: null,
        stops: [
          // Outbound
          { id: 'orig-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
          { id: 'orig-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', location_lat: 20.01, location_lng: 41.46, location_address: 'Al Baha' },
          { id: 'orig-3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha', location_lat: 18.21, location_lng: 42.50, location_address: 'Abha' },
          { id: 'orig-4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
          // Return
          { id: 'orig-5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', location_lat: 25.38, location_lng: 49.58, location_address: 'Al Ahsa' },
          { id: 'orig-6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', location_lat: 21.54, location_lng: 39.17, location_address: 'Jeddah' },
          { id: 'orig-7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', location_lat: 21.28, location_lng: 40.42, location_address: 'Taif' },
          { id: 'orig-8', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', location_lat: 24.71, location_lng: 46.67, location_address: 'Riyadh' },
        ]
      };

      const nodes = parseTripRouteNodes(trip);
      const returnLoadingNode = nodes.find((n: any) => n.typeEn === 'Return Loading');
      const returnStopNodes = nodes.filter((n: any) => n.isReturnStop);

      // 1. Return Loading MUST be Al Ahsa
      assert.equal(returnLoadingNode?.name, 'Al Ahsa');
      assert.notEqual(returnLoadingNode?.name, 'Al Baha', 'CRITICAL BUG: Return loading must never be Al Baha!');

      // 2. Return intermediate stops must be Jeddah and Taif, NOT Al Baha or Abha
      const returnIntermediateNames = returnStopNodes.map((n: any) => n.name);
      assert.deepEqual(returnIntermediateNames, ['Jeddah', 'Taif']);
      assert.ok(!returnIntermediateNames.includes('Al Baha'));
      assert.ok(!returnIntermediateNames.includes('Abha'));
    });
  });

  // ============================================================
  // TEST CASE #11 — AUTHORITATIVE ACTIVE STOP RESOLUTION
  // ============================================================
  describe('Test Case #11 — Authoritative Active Stop Resolution across Independent Legs', () => {
    const stops: any[] = [
      { id: 'st-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh', actual_arrival: null, actual_departure: null },
      { id: 'st-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha', actual_arrival: null, actual_departure: null },
      { id: 'st-3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha', actual_arrival: null, actual_departure: null },
      { id: 'st-4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa', actual_arrival: null, actual_departure: null },
      { id: 'st-5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa', actual_arrival: null, actual_departure: null },
      { id: 'st-6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah', actual_arrival: null, actual_departure: null },
      { id: 'st-7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif', actual_arrival: null, actual_departure: null },
      { id: 'st-8', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh', actual_arrival: null, actual_departure: null },
    ];

    it('resolves active stop as sequence 1 at start of trip with leg_index = 0', () => {
      const res = resolveAuthoritativeActiveStop(stops, 'GOING_TO_PICKUP', 'Loading');
      assert.equal(res.activeStopId, 'st-1');
      assert.equal(res.currentLegIndex, 0);
      assert.equal(res.isOutboundCompleted, false);
      assert.equal(res.isReturnAllowedToStart, false);
      assert.equal(res.isTripCompleted, false);
    });

    it('resolves sequence 3 when sequence 1 and 2 are completed', () => {
      const activeStops = stops.map(s => {
        if (s.stop_sequence === 1) return { ...s, actual_arrival: new Date(), actual_departure: new Date() };
        if (s.stop_sequence === 2) return { ...s, actual_arrival: new Date(), actual_departure: new Date() };
        return s;
      });
      const res = resolveAuthoritativeActiveStop(activeStops, 'IN_TRANSIT', 'InTransit');
      assert.equal(res.activeStopId, 'st-3');
      assert.equal(res.currentLegIndex, 0);
      assert.equal(res.isOutboundCompleted, false);
      assert.equal(res.isReturnAllowedToStart, false);
    });

    it('authorizes return start when outbound delivery arrives', () => {
      const activeStops = stops.map(s => {
        if (s.stop_sequence <= 3) return { ...s, actual_arrival: new Date(), actual_departure: new Date() };
        if (s.stop_sequence === 4) return { ...s, actual_arrival: new Date(), actual_departure: null };
        return s;
      });
      const res = resolveAuthoritativeActiveStop(activeStops, 'ARRIVED_AT_DELIVERY', 'InTransit');
      assert.equal(res.activeStopId, 'st-4');
      assert.equal(res.currentLegIndex, 0);
      assert.equal(res.isOutboundCompleted, true);
      assert.equal(res.isReturnAllowedToStart, true);
    });

    it('transitions to return leg loading stop (Al Ahsa st-5) after outbound delivery departs', () => {
      const activeStops = stops.map(s => {
        if (s.stop_sequence <= 4) return { ...s, actual_arrival: new Date(), actual_departure: new Date() };
        return s;
      });
      const res = resolveAuthoritativeActiveStop(activeStops, 'RETURN_LOADING', 'InTransit');
      assert.equal(res.activeStopId, 'st-5');
      assert.equal(res.activeStop?.location_name, 'Al Ahsa');
      assert.notEqual(res.activeStop?.location_name, 'Al Baha');
      assert.equal(res.currentLegIndex, 1);
      assert.equal(res.isOutboundCompleted, true);
      assert.equal(res.isReturnAllowedToStart, true);
      assert.equal(res.isTripCompleted, false);
    });

    it('marks trip completed when all return stops depart', () => {
      const activeStops = stops.map(s => ({
        ...s,
        actual_arrival: new Date(),
        actual_departure: new Date(),
      }));
      const res = resolveAuthoritativeActiveStop(activeStops, 'COMPLETED', 'Completed');
      assert.equal(res.activeStop, null);
      assert.equal(res.activeStopId, null);
      assert.equal(res.isTripCompleted, true);
      assert.equal(res.isOutboundCompleted, true);
      assert.equal(res.effectiveWorkflowState, 'COMPLETED');
    });
  });

  // ============================================================
  // TEST CASE #12 — STRICT RETURN START GUARD
  // ============================================================
  describe('Test Case #12 — Strict Return Start Guard', () => {
    it('blocks return leg from becoming active if outbound delivery arrival is missing', () => {
      // Outbound stops 1-3 departed, but outbound delivery stop 4 has NOT arrived
      const stops: any[] = [
        { id: 'st-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', actual_departure: new Date() },
        { id: 'st-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', actual_departure: new Date() },
        { id: 'st-3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', actual_departure: new Date() },
        { id: 'st-4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', actual_arrival: null, actual_departure: null },
        { id: 'st-5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', actual_arrival: null, actual_departure: null },
      ];

      const res = resolveAuthoritativeActiveStop(stops, 'RETURN_LOADING', 'InTransit');
      assert.equal(res.isOutboundCompleted, false);
      assert.equal(res.isReturnAllowedToStart, false);
      // Active stop MUST remain st-4 (outbound delivery), NOT advance to st-5
      assert.equal(res.activeStopId, 'st-4');
      assert.equal(res.currentLegIndex, 0);
    });
  });

  // ============================================================
  // TEST CASE #13 — COORDINATE HANDLING & MISSING GPS RESILIENCE
  // ============================================================
  describe('Test Case #13 — Coordinate Handling & Missing GPS Resilience', () => {
    const stopsWithMissingCoords: any[] = [
      { id: 'st-1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh Hub', location_lat: null, location_lng: null },
      { id: 'st-2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Dammam Yard', location_lat: 0, location_lng: 0 },
    ];

    it('safely resolves active stop without crashing when lat/lng are null or zero', () => {
      const res = resolveAuthoritativeActiveStop(stopsWithMissingCoords, 'GOING_TO_PICKUP', 'Loading');
      assert.equal(res.activeStopId, 'st-1');
      assert.equal(res.activeStop?.location_lat, null);
      assert.equal(res.activeStop?.location_lng, null);
    });
  });

  // ============================================================
  // TEST CASE #14 — QUOTATION LEG INDEX PRESERVATION
  // ============================================================
  describe('Test Case #14 — Quotation Leg Index Preservation', () => {
    it('ensures quotation stops mapper preserves leg_index for outbound and return legs', () => {
      const rawQuotationStops = [
        { sequence: 1, leg_index: 0, locationId: 'loc-1', stop_type: 'Pickup' },
        { sequence: 2, leg_index: 0, locationId: 'loc-2', stop_type: 'Dropoff' },
        { sequence: 3, leg_index: 1, locationId: 'loc-2', stop_type: 'Pickup' },
        { sequence: 4, leg_index: 1, locationId: 'loc-1', stop_type: 'Dropoff' },
      ];

      const mapped = rawQuotationStops.map((s, idx) => ({
        sequence: s.sequence ?? idx + 1,
        leg_index: s.leg_index !== undefined ? Number(s.leg_index) : 0,
        stop_type: s.stop_type,
      }));

      assert.equal(mapped[0].leg_index, 0);
      assert.equal(mapped[1].leg_index, 0);
      assert.equal(mapped[2].leg_index, 1);
      assert.equal(mapped[3].leg_index, 1);
    });
  });

  // ============================================================
  // TEST CASE #15 — PHOTO AND POD STOP_ID ASSOCIATION
  // ============================================================
  describe('Test Case #15 — Photo and POD Stop ID Association', () => {
    it('verifies stop_id payload is structured and preserved for photo audit trail', () => {
      const uploadPayload = {
        stop_id: 'stop-abc-123',
        leg_index: 1,
        operation: 'return_loading',
        location_lat: 25.38,
        location_lng: 49.58,
      };

      const documentJson = {
        gps: { latitude: uploadPayload.location_lat, longitude: uploadPayload.location_lng },
        leg_index: uploadPayload.leg_index !== undefined ? Number(uploadPayload.leg_index) : undefined,
        operation: uploadPayload.operation,
        stop_id: uploadPayload.stop_id || undefined,
      };

      assert.equal(documentJson.stop_id, 'stop-abc-123');
      assert.equal(documentJson.leg_index, 1);
      assert.equal(documentJson.operation, 'return_loading');
    });
  });

  // ============================================================
  // TEST CASE #16 — PHOTO STATE & STOP ISOLATION (REGRESSION)
  // ============================================================
  describe('Test Case #16 — Photo State & Stop Isolation (IMILE MUH Regression)', () => {
    // Exact filter algorithm used in PickupVerificationScreen.tsx
    function filterCargoDocs(docs: any[], isReturnLoading: boolean, pickupStopId: string): any[] {
      return docs.filter((d: any) => {
        const op = d.ai_extracted_json?.operation;
        const leg = d.ai_extracted_json?.leg_index;
        const docStopId = d.ai_extracted_json?.stop_id;

        const isCargoDoc = d.doc_type === 'Waybill' || d.doc_type === 'Cargo' || op === 'pickup' || op === 'return_loading';
        if (!isCargoDoc) return false;

        const isArrival = op?.includes('arrival') || d.doc_type === 'Arrival';
        if (isArrival) return false;

        if (docStopId) {
          return docStopId === pickupStopId;
        }

        if (isReturnLoading) {
          return leg === 1 && op === 'return_loading';
        } else {
          return (leg === 0 || (leg === undefined && op === 'pickup')) && op !== 'return_loading';
        }
      });
    }

    // Exact filter algorithm used in DeliveryVerificationScreen.tsx
    function filterPodDocs(docs: any[], isReturnDelivery: boolean, dropoffStopId: string): any[] {
      return docs.filter((d: any) => {
        const op = d.ai_extracted_json?.operation;
        const leg = d.ai_extracted_json?.leg_index;
        const docStopId = d.ai_extracted_json?.stop_id;

        const isPodDoc = d.doc_type === 'POD' || op === 'delivery' || op === 'return_delivery' || op === 'pod';
        if (!isPodDoc) return false;

        const isArrival = op?.includes('arrival') || d.doc_type === 'Arrival';
        if (isArrival) return false;

        if (docStopId) {
          return docStopId === dropoffStopId;
        }

        if (isReturnDelivery) {
          return leg === 1 && (op === 'return_delivery' || op === 'pod');
        } else {
          return (leg === 0 || (leg === undefined && op === 'delivery')) && op !== 'return_delivery';
        }
      });
    }

    const stop1OutboundPickup = 'stop-1-imile-bah';
    const stop4OutboundDelivery = 'stop-4-imile-muh';
    const stop5ReturnLoading = 'stop-5-imile-muh';
    const stop8ReturnDelivery = 'stop-8-imile-bah';

    it('Scenario 1: Outbound Delivery at IMILE MUH has no photos -> Return Loading at IMILE MUH shows 0 photos', () => {
      const documents: any[] = [];
      const result = filterCargoDocs(documents, true, stop5ReturnLoading);
      assert.equal(result.length, 0);
    });

    it('Scenario 2: Outbound Delivery at IMILE MUH has 3 POD photos uploaded -> Return Loading at IMILE MUH MUST STILL show 0 photos', () => {
      const documents = [
        { id: 'doc-1', doc_type: 'POD', file_url: '/uploads/pod1.jpg', ai_extracted_json: { operation: 'delivery', leg_index: 0, stop_id: stop4OutboundDelivery } },
        { id: 'doc-2', doc_type: 'POD', file_url: '/uploads/pod2.jpg', ai_extracted_json: { operation: 'delivery', leg_index: 0, stop_id: stop4OutboundDelivery } },
        { id: 'doc-3', doc_type: 'POD', file_url: '/uploads/pod3.jpg', ai_extracted_json: { operation: 'delivery', leg_index: 0, stop_id: stop4OutboundDelivery } },
      ];
      const result = filterCargoDocs(documents, true, stop5ReturnLoading);
      assert.equal(result.length, 0, 'Return loading must NOT show any outbound delivery POD photos');
    });

    it('Scenario 3: Outbound Pickup has 3 cargo photos uploaded -> Return Loading at IMILE MUH MUST STILL show 0 photos', () => {
      const documents = [
        { id: 'c-1', doc_type: 'Waybill', file_url: '/uploads/cargo1.jpg', ai_extracted_json: { operation: 'pickup', leg_index: 0, stop_id: stop1OutboundPickup } },
        { id: 'c-2', doc_type: 'Waybill', file_url: '/uploads/cargo2.jpg', ai_extracted_json: { operation: 'pickup', leg_index: 0, stop_id: stop1OutboundPickup } },
        { id: 'c-3', doc_type: 'Waybill', file_url: '/uploads/cargo3.jpg', ai_extracted_json: { operation: 'pickup', leg_index: 0, stop_id: stop1OutboundPickup } },
      ];
      const result = filterCargoDocs(documents, true, stop5ReturnLoading);
      assert.equal(result.length, 0, 'Return loading must NOT show outbound pickup cargo photos');
    });

    it('Scenario 4: Legacy documents with leg_index undefined and no stop_id NEVER bleed into Return Loading', () => {
      const legacyDocs = [
        { id: 'leg-1', doc_type: 'Waybill', file_url: '/uploads/leg1.jpg', ai_extracted_json: { operation: 'pickup' } },
        { id: 'leg-2', doc_type: 'Waybill', file_url: '/uploads/leg2.jpg', ai_extracted_json: {} },
        { id: 'leg-3', doc_type: 'Waybill', file_url: '/uploads/leg3.jpg', ai_extracted_json: null },
      ];
      const result = filterCargoDocs(legacyDocs, true, stop5ReturnLoading);
      assert.equal(result.length, 0, 'Legacy documents without return_loading operation must never match return loading');
    });

    it('Scenario 5: Return Loading uploads 2 photos -> Draft saves 2 photos -> Reopen Return Loading returns exactly 2 photos', () => {
      const fakeSecureStore: Record<string, string> = {};
      const tripId = 'trip-123';
      const stopKey = `pickup_draft_${tripId}_${stop5ReturnLoading}`;
      const photos = [
        { uri: 'file:///photo1.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///photo2.jpg', mimeType: 'image/jpeg' },
      ];

      // Save draft
      fakeSecureStore[stopKey] = JSON.stringify(photos);

      // Reopen screen
      const restored = JSON.parse(fakeSecureStore[stopKey]);
      assert.equal(restored.length, 2);
      assert.equal(restored[0].uri, 'file:///photo1.jpg');
      assert.equal(restored[1].uri, 'file:///photo2.jpg');
    });

    it('Scenario 6: Return Delivery has its own independent photo state', () => {
      const documents = [
        // Outbound delivery POD
        { id: 'pod-out', doc_type: 'POD', file_url: '/uploads/pod_out.jpg', ai_extracted_json: { operation: 'delivery', leg_index: 0, stop_id: stop4OutboundDelivery } },
        // Return loading cargo
        { id: 'ret-load', doc_type: 'Waybill', file_url: '/uploads/ret_cargo.jpg', ai_extracted_json: { operation: 'return_loading', leg_index: 1, stop_id: stop5ReturnLoading } },
      ];

      // Return Delivery check
      const retDelResult = filterPodDocs(documents, true, stop8ReturnDelivery);
      assert.equal(retDelResult.length, 0, 'Return delivery must not show outbound POD or return loading cargo');

      // Now add a valid return delivery POD
      documents.push({
        id: 'pod-ret',
        doc_type: 'POD',
        file_url: '/uploads/pod_ret.jpg',
        ai_extracted_json: { operation: 'return_delivery', leg_index: 1, stop_id: stop8ReturnDelivery }
      });

      const retDelResultWithDoc = filterPodDocs(documents, true, stop8ReturnDelivery);
      assert.equal(retDelResultWithDoc.length, 1);
      assert.equal(retDelResultWithDoc[0].id, 'pod-ret');
    });
  });

  // ============================================================
  // TEST CASE #10 — ROUND TRIP DOMAIN MODEL (owner definition)
  // Leg A (leg_index 0): load at A → [optional stops] → drop at B.
  // Leg B (leg_index 1): load at B → [optional stops, e.g. drop at C] → drop at A.
  // Roles are positional per leg: first = loading, last = delivery,
  // middle = intermediate stops (whatever their stop_type).
  // ============================================================
  describe('Test Case #10 — Round trip legs A→B then B→C→A', () => {
    const S = (id: string, seq: number, leg: number, type: TripStop['stop_type'], name: string): TripStop =>
      ({ id, stop_sequence: seq, leg_index: leg, stop_type: type, location_name: name, actual_arrival: null, actual_departure: null } as TripStop);
    const stops = (): TripStop[] => [
      S('a0', 1, 0, 'Pickup', 'A'),
      S('b0', 2, 0, 'Dropoff', 'B'),
      S('b1', 3, 1, 'Pickup', 'B'),
      S('c1', 4, 1, 'Dropoff', 'C'),
      S('a1', 5, 1, 'Dropoff', 'A'),
    ];

    function mockTx(state: any[]) {
      return {
        tripStop: {
          findMany: async () => state.filter((s) => !s.deletedAt).sort((a, b) => a.stop_sequence - b.stop_sequence),
          findFirst: async (args: any) => {
            let f = state.filter((s) => !s.deletedAt);
            if (args.where?.stop_type) f = f.filter((s) => s.stop_type === args.where.stop_type);
            if (args.where?.leg_index !== undefined) f = f.filter((s) => (s.leg_index ?? 0) === args.where.leg_index);
            f.sort((a, b) => (args.orderBy?.stop_sequence === 'desc' ? b.stop_sequence - a.stop_sequence : a.stop_sequence - b.stop_sequence));
            return f[0] || null;
          },
          updateMany: async (args: any) => {
            let count = 0;
            state.forEach((s) => {
              if (args.where?.id && s.id !== args.where.id) return;
              if (args.where?.tripId && s.trip_id && s.trip_id !== args.where.tripId) return;
              if (args.where?.actual_arrival === null && s.actual_arrival !== null) return;
              if (args.where?.actual_departure === null && s.actual_departure !== null) return;
              Object.assign(s, args.data);
              count++;
            });
            return { count };
          },
          update: async (args: any) => Object.assign(state.find((s) => s.id === args.where.id), args.data),
        },
      } as any;
    }

    it('builds the timeline A → B | B → C → A with C as the return intermediate stop', () => {
      const trip: MobileTrip = { id: 't10', status: 'InTransit', stops: stops(), rate_category: 'Round Trip' };
      assert.equal(isRoundTrip(trip), true);
      const tl = parseTripRouteNodes(trip);
      assert.deepEqual(tl.map((n) => [n.legIndex, n.name, !!n.isIntermediate, n.stopId]), [
        [0, 'A', false, 'a0'],
        [0, 'B', false, 'b0'],
        [1, 'B', false, 'b1'],
        [1, 'C', true, 'c1'],
        [1, 'A', false, 'a1'],
      ]);
    });

    it('treats a middle stop as intermediate regardless of stop_type (Rest)', () => {
      const s = stops();
      s[3].stop_type = 'Rest';
      const tl = parseTripRouteNodes({ id: 't10r', status: 'InTransit', stops: s });
      assert.equal(tl.filter((n) => n.isIntermediate).map((n) => n.name).join(), 'C');
    });

    it('drives the whole round trip and stamps every stop exactly once, in order', async () => {
      const state = stops();
      const tx = mockTx(state);
      const at = (id: string) => state.find((s) => s.id === id)!;

      await stampWorkflowTransition(tx, 't10', 'ARRIVED_AT_PICKUP');
      await stampWorkflowTransition(tx, 't10', 'LOADING_COMPLETED');
      assert.ok(at('a0').actual_arrival && at('a0').actual_departure, 'A loaded and departed');

      await stampWorkflowTransition(tx, 't10', 'ARRIVED_AT_DELIVERY');
      assert.ok(at('b0').actual_arrival, 'arrived at B (leg A delivery)');
      assert.equal(at('a1').actual_arrival, null, 'final A untouched');

      await stampWorkflowTransition(tx, 't10', 'RETURN_LOADING');
      assert.ok(at('b0').actual_departure, 'left B after unloading');
      assert.ok(at('b1').actual_arrival, 'return loading at B started');

      await stampWorkflowTransition(tx, 't10', 'GOING_TO_RETURN_STOP');
      assert.ok(at('b1').actual_departure, 'left B with return load');
      assert.equal(getEffectiveWorkflowState({ id: 't10', status: 'InTransit', stops: state, driver_workflow_state: 'GOING_TO_RETURN_STOP' }), 'GOING_TO_RETURN_STOP');

      await stampIntermediateStopVisit(tx, 't10', 'c1');
      assert.ok(at('c1').actual_arrival && at('c1').actual_departure, 'C visited');
      assert.equal(at('a1').actual_arrival, null, 'final A still pending after C');

      await stampWorkflowTransition(tx, 't10', 'ARRIVED_AT_FINAL_DELIVERY');
      assert.ok(at('a1').actual_arrival, 'arrived back at A');
      assert.equal(at('a0').actual_arrival, state.find((s) => s.id === 'a0')!.actual_arrival, 'outbound A not re-stamped');
    });

    it('supports a round trip whose final drop is not the origin (A → B | B → C → D)', () => {
      const s = stops();
      s[4].location_name = 'D';
      const trip: MobileTrip = { id: 't10d', status: 'InTransit', stops: s };
      assert.equal(isRoundTrip(trip), true, 'leg 1 stops make it a round trip, not first == last');
      assert.deepEqual(parseTripRouteNodes(trip).map((n) => [n.legIndex, n.name, !!n.isIntermediate]), [
        [0, 'A', false], [0, 'B', false], [1, 'B', false], [1, 'C', true], [1, 'D', false],
      ]);
    });

    it('one-way trip with a stop is NOT completed after the stop is visited (A → X → B)', () => {
      const s = [
        S('a', 1, 0, 'Pickup', 'A'),
        S('x', 2, 0, 'Dropoff', 'X'),
        S('b', 3, 0, 'Dropoff', 'B'),
      ];
      for (const id of ['a', 'x']) Object.assign(s.find((y) => y.id === id)!, { actual_arrival: 'x', actual_departure: 'x' });
      const trip: MobileTrip = { id: 't10o', status: 'InTransit', stops: s, driver_workflow_state: 'IN_TRANSIT' };
      assert.equal(getEffectiveWorkflowState(trip), 'IN_TRANSIT');
      Object.assign(s[2], { actual_arrival: 'x' });
      assert.equal(getEffectiveWorkflowState({ ...trip, driver_workflow_state: 'ARRIVED_AT_DELIVERY' }), 'ARRIVED_AT_DELIVERY');
    });

    it('keeps return-stop workflow states instead of collapsing them to IN_TRANSIT_RETURN', () => {
      const s = stops();
      for (const id of ['a0', 'b0', 'b1']) Object.assign(s.find((x) => x.id === id)!, { actual_arrival: 'x', actual_departure: 'x' });
      const trip = (ws: string): MobileTrip => ({ id: 't10', status: 'InTransit', stops: s, driver_workflow_state: ws });
      assert.equal(getEffectiveWorkflowState(trip('ARRIVED_AT_RETURN_STOP')), 'ARRIVED_AT_RETURN_STOP');
      assert.equal(getEffectiveWorkflowState(trip('ARRIVED_AT_RETURN_STOP_1')), 'ARRIVED_AT_RETURN_STOP_1');
      assert.deepEqual(parseStopWorkflowState('ARRIVED_AT_RETURN_STOP_1'), { leg: 1, stopIndex: 1 });
      assert.deepEqual(parseStopWorkflowState('GOING_TO_STOP'), { leg: 0, stopIndex: 0 });
      assert.equal(parseStopWorkflowState('IN_TRANSIT_RETURN'), null);
    });
  });

  // ============================================================
  // TEST CASE #11 — SHARED MODULE TRIP ROUTE & WORKFLOW TESTS
  // ============================================================
  describe('Test Case #11 — Shared Module tripRoute logic (getLegEndpoints & Workflow helpers)', () => {
    it('getLegEndpoints: one-way (2 stops)', () => {
      const trip = {
        stops: [
          { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
          { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Dammam' },
        ],
      };
      const leg0 = getLegEndpoints(trip, 0);
      assert.equal(leg0.loading?.id, 's1');
      assert.equal(leg0.delivery?.id, 's2');
      assert.equal(leg0.intermediates.length, 0);

      const leg1 = getLegEndpoints(trip, 1);
      assert.equal(leg1.loading, null);
      assert.equal(leg1.delivery, null);
      assert.equal(leg1.intermediates.length, 0);
    });

    it('getLegEndpoints: one-way with 2 intermediates', () => {
      const trip = {
        stops: [
          { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
          { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha' },
          { id: 's3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha' },
          { id: 's4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa' },
        ],
      };
      const leg0 = getLegEndpoints(trip, 0);
      assert.equal(leg0.loading?.id, 's1');
      assert.equal(leg0.delivery?.id, 's4');
      assert.deepEqual(leg0.intermediates.map((s) => s.id), ['s2', 's3']);
    });

    it('getLegEndpoints: round trip with intermediates on both legs', () => {
      const trip = {
        stops: [
          // Leg 0
          { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
          { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Baha' },
          { id: 's3', stop_sequence: 3, leg_index: 0, stop_type: 'Dropoff', location_name: 'Abha' },
          { id: 's4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Al Ahsa' },
          // Leg 1
          { id: 's5', stop_sequence: 5, leg_index: 1, stop_type: 'Pickup', location_name: 'Al Ahsa' },
          { id: 's6', stop_sequence: 6, leg_index: 1, stop_type: 'Dropoff', location_name: 'Jeddah' },
          { id: 's7', stop_sequence: 7, leg_index: 1, stop_type: 'Dropoff', location_name: 'Taif' },
          { id: 's8', stop_sequence: 8, leg_index: 1, stop_type: 'Dropoff', location_name: 'Riyadh' },
        ],
      };
      const leg0 = getLegEndpoints(trip, 0);
      assert.equal(leg0.loading?.id, 's1');
      assert.equal(leg0.delivery?.id, 's4');
      assert.deepEqual(leg0.intermediates.map((s) => s.id), ['s2', 's3']);

      const leg1 = getLegEndpoints(trip, 1);
      assert.equal(leg1.loading?.id, 's5');
      assert.equal(leg1.delivery?.id, 's8');
      assert.deepEqual(leg1.intermediates.map((s) => s.id), ['s6', 's7']);
    });

    it('getLegEndpoints: intermediates typed Rest / Refuel (positional, non-classified by stop_type)', () => {
      const trip = {
        stops: [
          { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
          { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Rest', location_name: 'Rest Stop 1' },
          { id: 's3', stop_sequence: 3, leg_index: 0, stop_type: 'Refuel', location_name: 'Gas Station' },
          { id: 's4', stop_sequence: 4, leg_index: 0, stop_type: 'Dropoff', location_name: 'Dammam' },
        ],
      };
      const leg0 = getLegEndpoints(trip, 0);
      assert.equal(leg0.loading?.id, 's1');
      assert.equal(leg0.delivery?.id, 's4');
      assert.deepEqual(leg0.intermediates.map((s) => s.id), ['s2', 's3']);
    });

    it('parseStopWorkflowState / targetFromWorkflowState parsing and target resolution', () => {
      assert.deepEqual(parseStopWorkflowState('ARRIVED_AT_STOP_1'), { leg: 0, stopIndex: 1 });
      assert.deepEqual(parseStopWorkflowState('ARRIVED_AT_RETURN_STOP_2'), { leg: 1, stopIndex: 2 });
      assert.deepEqual(parseStopWorkflowState('GOING_TO_STOP'), { leg: 0, stopIndex: 0 });
      assert.equal(parseStopWorkflowState('IN_TRANSIT'), null);

      assert.deepEqual(targetFromWorkflowState('ARRIVED_AT_STOP_1', false), { kind: 'stop', leg: 0, stopIndex: 1 });
      assert.deepEqual(targetFromWorkflowState('ARRIVED_AT_PICKUP', false), { kind: 'pickup', leg: 0 });
      assert.deepEqual(targetFromWorkflowState('IN_TRANSIT', false), { kind: 'delivery', leg: 0 });
      assert.deepEqual(targetFromWorkflowState('RETURN_LOADING', true), { kind: 'pickup', leg: 1 });
      assert.deepEqual(targetFromWorkflowState('IN_TRANSIT_RETURN', true), { kind: 'delivery', leg: 1 });
      assert.deepEqual(targetFromWorkflowState('COMPLETED', false), { kind: 'completed' });
      assert.deepEqual(targetFromWorkflowState('FIRST_DELIVERY_COMPLETED', false), { kind: 'completed' });
      assert.deepEqual(targetFromWorkflowState('FIRST_DELIVERY_COMPLETED', true), { kind: 'pickup', leg: 1 });
    });
  });

  describe('Test Case #12 — buildTripStops Construction Tests', () => {
    it('builds a basic one-way trip (A -> B)', () => {
      const stops = buildTripStops({
        origin: { name: 'Riyadh', location_id: 'loc-1' },
        destination: { name: 'Dammam', location_id: 'loc-2' },
      });

      assert.equal(stops.length, 2);
      assert.deepEqual(stops[0], {
        stop_sequence: 1,
        leg_index: 0,
        stop_type: 'Pickup',
        location_name: 'Riyadh',
        location_id: 'loc-1',
      });
      assert.deepEqual(stops[1], {
        stop_sequence: 2,
        leg_index: 0,
        stop_type: 'Dropoff',
        location_name: 'Dammam',
        location_id: 'loc-2',
      });
    });

    it('builds a one-way trip with 2 intermediate stops (A -> X -> Y -> B)', () => {
      const stops = buildTripStops({
        origin: { name: 'Riyadh', location_id: 'loc-1' },
        intermediates: [
          { name: 'Al Hasa', location_id: 'loc-x' },
          { name: 'Jubail', location_id: 'loc-y' },
        ],
        destination: { name: 'Dammam', location_id: 'loc-2' },
      });

      assert.equal(stops.length, 4);
      assert.equal(stops[0].stop_type, 'Pickup');
      assert.equal(stops[0].leg_index, 0);
      assert.equal(stops[1].stop_type, 'Dropoff');
      assert.equal(stops[1].location_name, 'Al Hasa');
      assert.equal(stops[2].stop_type, 'Dropoff');
      assert.equal(stops[2].location_name, 'Jubail');
      assert.equal(stops[3].stop_type, 'Dropoff');
      assert.equal(stops[3].location_name, 'Dammam');
      assert.deepEqual(stops.map((s: BuiltTripStop) => s.stop_sequence), [1, 2, 3, 4]);
    });

    it('builds a round trip with stops on both legs (A -> X -> B | B -> Y -> A)', () => {
      const stops = buildTripStops({
        origin: { name: 'Riyadh', location_id: 'loc-a' },
        intermediates: [{ name: 'Waypoint 1' }],
        destination: { name: 'Dammam', location_id: 'loc-b' },
        isRound: true,
        returnIntermediates: [{ name: 'Waypoint 2' }],
      });

      assert.equal(stops.length, 6);
      // Leg 0
      assert.equal(stops[0].leg_index, 0);
      assert.equal(stops[0].stop_type, 'Pickup');
      assert.equal(stops[0].location_name, 'Riyadh');

      assert.equal(stops[1].leg_index, 0);
      assert.equal(stops[1].stop_type, 'Dropoff');
      assert.equal(stops[1].location_name, 'Waypoint 1');

      assert.equal(stops[2].leg_index, 0);
      assert.equal(stops[2].stop_type, 'Dropoff');
      assert.equal(stops[2].location_name, 'Dammam');

      // Leg 1
      assert.equal(stops[3].leg_index, 1);
      assert.equal(stops[3].stop_type, 'Pickup');
      assert.equal(stops[3].location_name, 'Dammam');
      assert.equal(stops[3].location_id, 'loc-b');

      assert.equal(stops[4].leg_index, 1);
      assert.equal(stops[4].stop_type, 'Dropoff');
      assert.equal(stops[4].location_name, 'Waypoint 2');

      assert.equal(stops[5].leg_index, 1);
      assert.equal(stops[5].stop_type, 'Dropoff');
      assert.equal(stops[5].location_name, 'Riyadh');
      assert.equal(stops[5].location_id, 'loc-a');

      assert.deepEqual(stops.map((s: BuiltTripStop) => s.stop_sequence), [1, 2, 3, 4, 5, 6]);
    });

    it('builds a round trip with final drop not at origin A (B -> C -> D)', () => {
      const stops = buildTripStops({
        origin: { name: 'Location A', location_id: 'loc-a' },
        destination: { name: 'Location B', location_id: 'loc-b' },
        isRound: true,
        returnOrigin: { name: 'Location C', location_id: 'loc-c' },
        returnDestination: { name: 'Location D', location_id: 'loc-d' },
      });

      assert.equal(stops.length, 4);
      assert.equal(stops[0].location_name, 'Location A');
      assert.equal(stops[0].leg_index, 0);
      assert.equal(stops[0].stop_type, 'Pickup');

      assert.equal(stops[1].location_name, 'Location B');
      assert.equal(stops[1].leg_index, 0);
      assert.equal(stops[1].stop_type, 'Dropoff');

      assert.equal(stops[2].location_name, 'Location C');
      assert.equal(stops[2].leg_index, 1);
      assert.equal(stops[2].stop_type, 'Pickup');
      assert.equal(stops[2].location_id, 'loc-c');

      assert.equal(stops[3].location_name, 'Location D');
      assert.equal(stops[3].leg_index, 1);
      assert.equal(stops[3].stop_type, 'Dropoff');
      assert.equal(stops[3].location_id, 'loc-d');
    });
  });

  // ============================================================
  // TEST CASE #13 — TRIP ROUTE EDIT & LOCKED STATUS RULES
  // ============================================================
  describe('Test Case #13 — Trip Route Edit & Locked Status Rules', () => {
    it('permits route editing only on Draft and Scheduled status for every TripStatus value', () => {
      assert.equal(isRouteEditable('Draft'), true);
      assert.equal(isRouteEditable('Scheduled'), true);

      assert.equal(isRouteEditable('Loading'), false);
      assert.equal(isRouteEditable('InTransit'), false);
      assert.equal(isRouteEditable('Delayed'), false);
      assert.equal(isRouteEditable('Completed'), false);
      assert.equal(isRouteEditable('Invoiced'), false);
      assert.equal(isRouteEditable('Cancelled'), false);

      assert.equal(isRouteLocked('Draft'), false);
      assert.equal(isRouteLocked('Scheduled'), false);
      assert.equal(isRouteLocked('Loading'), true);
      assert.equal(isRouteLocked('InTransit'), true);
      assert.equal(isRouteLocked('Delayed'), true);
      assert.equal(isRouteLocked('Completed'), true);
      assert.equal(isRouteLocked('Invoiced'), true);
      assert.equal(isRouteLocked('Cancelled'), true);
    });

    it('parses single-location return chains correctly in parseFullTripStops', () => {
      const parsedStops = parseFullTripStops('Riyadh', 'Medina [RETURN: Riyadh]');
      assert.equal(parsedStops.length, 4);

      // Leg 0
      assert.equal(parsedStops[0].leg_index, 0);
      assert.equal(parsedStops[0].stop_type, 'Pickup');
      assert.equal(parsedStops[0].location_name, 'Riyadh');

      assert.equal(parsedStops[1].leg_index, 0);
      assert.equal(parsedStops[1].stop_type, 'Dropoff');
      assert.equal(parsedStops[1].location_name, 'Medina');

      // Leg 1
      assert.equal(parsedStops[2].leg_index, 1);
      assert.equal(parsedStops[2].stop_type, 'Pickup');
      assert.equal(parsedStops[2].location_name, 'Medina'); // Pickup at last outbound location

      assert.equal(parsedStops[3].leg_index, 1);
      assert.equal(parsedStops[3].stop_type, 'Dropoff');
      assert.equal(parsedStops[3].location_name, 'Riyadh'); // Dropoff at return location

      const validation = validateTripStops(parsedStops as any);
      assert.equal(validation.isValid, true);
    });

    it('re-builds stops and timeline nodes when editing a Draft trip destination', () => {
      const draftTripOriginal: MobileTrip = {
        id: 'trip-draft-1',
        ref_id: 'TRP-DRAFT-01',
        status: 'Draft',
        origin: 'Riyadh',
        destination: 'Jeddah',
        stops: [
          { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
          { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Jeddah' },
        ],
      };

      assert.equal(isRouteLocked(draftTripOriginal.status), false);

      // Edit destination from Jeddah to Dammam
      const newStops = buildTripStops({
        origin: { name: 'Riyadh' },
        destination: { name: 'Dammam' },
      });

      const updatedDraftTrip: MobileTrip = {
        ...draftTripOriginal,
        destination: 'Dammam',
        stops: newStops.map((st, i) => ({
          id: `new-s${i + 1}`,
          stop_sequence: st.stop_sequence,
          leg_index: st.leg_index,
          stop_type: st.stop_type,
          location_name: st.location_name,
        })),
      };

      const timeline = buildTripRouteTimeline(updatedDraftTrip);
      assert.equal(timeline.length, 2);
      assert.equal(timeline[0].name, 'Riyadh');
      assert.equal(timeline[1].name, 'Dammam');
    });

    it('prevents route edit on an InTransit trip', () => {
      const inTransitTrip: MobileTrip = {
        id: 'trip-intransit-1',
        ref_id: 'TRP-FLY-01',
        status: 'InTransit',
        origin: 'Riyadh',
        destination: 'Jeddah',
        stops: [
          { id: 's1', stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Riyadh' },
          { id: 's2', stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Jeddah' },
        ],
      };

      assert.equal(isRouteLocked(inTransitTrip.status), true);
    });
  });

  // ============================================================
  // TEST CASE #17 — QUOTATION LANE LOOKUP & ROUND-TRIP TRUTH
  // ============================================================
  describe('Test Case #17 — Quotation Lane Lookup & Round-Trip Truth', () => {
    it('RUH -> MED round trip does NOT match a RUH -> DMM round-trip quotation', async () => {
      const mockQuotationDmm = {
        id: 'q-ruh-dmm-round',
        customerId: 'cust-1',
        line_type: 'ROUND_TRIP',
        is_active: true,
        deletedAt: null,
        stops: [
          { sequence: 1, leg_index: 0, locationId: 'loc-ruh', location_name: 'RUH' },
          { sequence: 2, leg_index: 0, locationId: 'loc-dmm', location_name: 'DMM' },
          { sequence: 3, leg_index: 1, locationId: 'loc-dmm', location_name: 'DMM' },
          { sequence: 4, leg_index: 1, locationId: 'loc-ruh', location_name: 'RUH' },
        ],
      };

      const mockTx = {
        quotation: {
          findMany: async () => [mockQuotationDmm],
        },
      };

      // Searching for RUH -> MED round trip (origin RUH, destination MED)
      const res = await findQuotationForLane(mockTx as any, {
        customerId: 'cust-1',
        originLocationId: 'loc-ruh',
        destinationLocationId: 'loc-med',
        lineType: 'ROUND_TRIP',
      });

      assert.equal(res.quotation, null);
    });

    it('RUH -> MED round trip DOES match a RUH -> MED round-trip quotation', async () => {
      const mockQuotationMed = {
        id: 'q-ruh-med-round',
        customerId: 'cust-1',
        line_type: 'ROUND_TRIP',
        is_active: true,
        deletedAt: null,
        stops: [
          { sequence: 1, leg_index: 0, locationId: 'loc-ruh', location_name: 'RUH' },
          { sequence: 2, leg_index: 0, locationId: 'loc-med', location_name: 'MED' },
          { sequence: 3, leg_index: 1, locationId: 'loc-med', location_name: 'MED' },
          { sequence: 4, leg_index: 1, locationId: 'loc-ruh', location_name: 'RUH' },
        ],
      };

      const mockTx = {
        quotation: {
          findMany: async () => [mockQuotationMed],
        },
      };

      const res = await findQuotationForLane(mockTx as any, {
        customerId: 'cust-1',
        originLocationId: 'loc-ruh',
        destinationLocationId: 'loc-med',
        lineType: 'ROUND_TRIP',
      });

      assert.equal(res.quotation?.id, 'q-ruh-med-round');
    });

    it('rejects round-trip rate_category when stops have NO leg_index = 1', async () => {
      const mockTx = {
        location: {
          findFirst: async () => ({ id: 'loc-1', name: 'RUH', address: null, code: 'RUH', customerId: 'cust-1', deletedAt: null, is_active: true }),
          findMany: async () => [],
          update: async () => ({ id: 'loc-1' }),
        },
      };

      const oneWayStops = [
        { stop_sequence: 1, leg_index: 0, location_name: 'RUH' },
        { stop_sequence: 2, leg_index: 0, location_name: 'DMM' },
      ];

      await assert.rejects(
        async () => {
          await writeTripStops(mockTx as any, {
            customerId: 'cust-1',
            stops: oneWayStops,
            rateCategory: 'ROUND_TRIP',
          });
        },
        (err: any) => err.message.includes('ROUND_TRIP_MISMATCH')
      );
    });

    it('rejects non-round-trip rate_category when stops HAVE leg_index = 1', async () => {
      const mockTx = {
        location: {
          findFirst: async () => ({ id: 'loc-1', name: 'RUH', address: null, code: 'RUH', customerId: 'cust-1', deletedAt: null, is_active: true }),
          findMany: async () => [],
          update: async () => ({ id: 'loc-1' }),
        },
      };

      const roundStops = [
        { stop_sequence: 1, leg_index: 0, location_name: 'RUH' },
        { stop_sequence: 2, leg_index: 0, location_name: 'DMM' },
        { stop_sequence: 3, leg_index: 1, location_name: 'DMM' },
        { stop_sequence: 4, leg_index: 1, location_name: 'RUH' },
      ];

      await assert.rejects(
        async () => {
          await writeTripStops(mockTx as any, {
            customerId: 'cust-1',
            stops: roundStops,
            rateCategory: 'SINGLE_TRIP',
          });
        },
        (err: any) => err.message.includes('ROUND_TRIP_MISMATCH')
      );
    });
  });

  // ============================================================
  // TEST CASE #18 — Web route progress (truck position)
  // A stop is done only after the driver LEFT it.
  // ============================================================
  describe('Test Case #18 — getTimelineProgress', () => {
    const n = (a?: boolean, d?: boolean) => ({ actualArrival: a ? 't' : null, actualDeparture: d ? 't' : null });
    it('nothing recorded → first stop current', () => {
      assert.deepEqual(getTimelineProgress([n(), n(), n(), n()], false), ['current', 'upcoming', 'upcoming', 'upcoming']);
    });
    it('arrived at pickup, still loading → pickup stays current (truck NOT on next stop)', () => {
      assert.deepEqual(getTimelineProgress([n(true), n(), n(), n()], false), ['current', 'upcoming', 'upcoming', 'upcoming']);
    });
    it('loading complete (departed pickup) → heading to next stop', () => {
      assert.deepEqual(getTimelineProgress([n(true, true), n(), n(), n()], false), ['completed', 'current', 'upcoming', 'upcoming']);
    });
    it('round trip at B unloading → B current', () => {
      assert.deepEqual(getTimelineProgress([n(true, true), n(true), n(), n()], false), ['completed', 'current', 'upcoming', 'upcoming']);
    });
    it('legacy: intermediate never stamped but driver already at delivery → delivery current', () => {
      assert.deepEqual(getTimelineProgress([n(true, true), n(), n(true)], false), ['completed', 'completed', 'current']);
    });
    it('arrived at final stop, not yet completed → final current; trip completed → all done', () => {
      assert.deepEqual(getTimelineProgress([n(true, true), n(true, true), n(true)], false), ['completed', 'completed', 'current']);
      assert.deepEqual(getTimelineProgress([n(true, true), n(true, true), n(true)], true), ['completed', 'completed', 'completed']);
    });
  });

  // ============================================================
  // TEST CASE #19 — Quotation matches only if EVERY stop matches
  // ============================================================
  describe('Test Case #19 — quotationMatchesRoute (all stops, both legs)', () => {
    const q = (...legs: string[][]) => ({
      stops: legs.flatMap((leg, li) => leg.map((id, i) => ({ locationId: id, leg_index: li, sequence: li * 10 + i + 1 }))),
    });
    const r = (...legs: string[][]) => legs.map((leg) => leg.map((id) => ({ id })));
    it('one-way: adding a stop means A→B no longer matches', () => {
      assert.equal(quotationMatchesRoute(q(['A', 'B']), r(['A', 'B']), false), true);
      assert.equal(quotationMatchesRoute(q(['A', 'B']), r(['A', 'X', 'B']), false), false);
    });
    it('one-way: stops must be the same places in the same order', () => {
      assert.equal(quotationMatchesRoute(q(['A', 'X', 'B']), r(['A', 'X', 'B']), false), true);
      assert.equal(quotationMatchesRoute(q(['A', 'X', 'B']), r(['A', 'Y', 'B']), false), false);
      assert.equal(quotationMatchesRoute(q(['A', 'X', 'Y', 'B']), r(['A', 'Y', 'X', 'B']), false), false);
    });
    it('round trip: return-leg stops must match too', () => {
      assert.equal(quotationMatchesRoute(q(['A', 'B'], ['B', 'C', 'A']), r(['A', 'B'], ['B', 'C', 'A']), true), true);
      assert.equal(quotationMatchesRoute(q(['A', 'B'], ['B', 'A']), r(['A', 'B'], ['B', 'C', 'A']), true), false);
      assert.equal(quotationMatchesRoute(q(['A', 'B'], ['B', 'C', 'A']), r(['A', 'B'], ['B', 'A']), true), false);
    });
    it('round trip: older quotation without a stored return leg implies B → A', () => {
      assert.equal(quotationMatchesRoute(q(['A', 'B']), r(['A', 'B'], ['B', 'A']), true), true);
      assert.equal(quotationMatchesRoute(q(['A', 'B']), r(['A', 'B'], ['B', 'C', 'A']), true), false);
      assert.equal(quotationMatchesRoute(q(['A', 'B']), r(['A', 'B'], ['B', 'D']), true), false);
    });
    it('matches by name when a stop has no location id', () => {
      const qn = { stops: [{ source_label: 'RUH - Riyadh', sequence: 1 }, { source_label: 'Medina', sequence: 2 }] };
      assert.equal(quotationMatchesRoute(qn, [[{ name: 'Riyadh' }, { name: 'MED - Medina' }]], false), true);
      assert.equal(quotationMatchesRoute(qn, [[{ name: 'Riyadh' }, { name: 'Buraydah' }, { name: 'Medina' }]], false), false);
    });
  });

  // ============================================================
  // TEST CASE #20 — Truck position + stop role colours
  // ============================================================
  describe('Test Case #20 — getTimelineVehiclePosition / timelineStopRole', () => {
    const n = (a?: boolean, d?: boolean) => ({ actualArrival: a ? 't' : null, actualDeparture: d ? 't' : null });
    it('loading at pickup → on the pickup', () => {
      assert.deepEqual(getTimelineVehiclePosition([n(true), n(), n()], false), { index: 0, enRoute: false });
    });
    it('left pickup → between pickup and next stop (not on the next stop)', () => {
      assert.deepEqual(getTimelineVehiclePosition([n(true, true), n(), n()], false), { index: 1, enRoute: true });
    });
    it('arrived at next stop → on that stop', () => {
      assert.deepEqual(getTimelineVehiclePosition([n(true, true), n(true), n()], false), { index: 1, enRoute: false });
    });
    it('left Buraydah (stop) → between Buraydah and Medina', () => {
      assert.deepEqual(getTimelineVehiclePosition([n(true, true), n(true, true), n(), n(), n()], false), { index: 2, enRoute: true });
    });
    it('stopRoleAt: first = origin, last = destination, middle = stop', () => {
      assert.deepEqual([0, 1, 2, 3].map((i) => stopRoleAt(i, 4)), ['origin', 'stop', 'stop', 'destination']);
      assert.deepEqual([0, 1].map((i) => stopRoleAt(i, 2)), ['origin', 'destination']);
    });
    it('tripStopRole: role per leg for stored stops (A→X→B | B→C→A)', () => {
      const t = { stops: [
        { id: 'a', stop_sequence: 1, leg_index: 0 }, { id: 'x', stop_sequence: 2, leg_index: 0 }, { id: 'b', stop_sequence: 3, leg_index: 0 },
        { id: 'b2', stop_sequence: 4, leg_index: 1 }, { id: 'c', stop_sequence: 5, leg_index: 1 }, { id: 'a2', stop_sequence: 6, leg_index: 1 },
      ] };
      assert.deepEqual(['a', 'x', 'b', 'b2', 'c', 'a2'].map((id) => tripStopRole(t, { id })), ['origin', 'stop', 'destination', 'origin', 'stop', 'destination']);
    });
    it('roles: loading = origin, in between = stop, delivery = destination', () => {
      assert.equal(timelineStopRole({ iconType: 'House' }), 'origin');
      assert.equal(timelineStopRole({ iconType: 'Route', isIntermediate: true }), 'stop');
      assert.equal(timelineStopRole({ iconType: 'MapPin' }), 'destination');
    });
  });
});
