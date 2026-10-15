import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planStopsEdit, stopsEditMode, isStopReached } from '@mercon/shared-types';

const T = new Date('2026-10-15T08:00:00Z');
const stop = (id: string, seq: number, name: string, leg = 0, reached = false) => ({
  id, stop_sequence: seq, leg_index: leg, location_name: name, location_id: `loc-${name}`, actual_arrival: reached ? T : null,
});
const inc = (name: string, leg = 0) => ({ location_name: name, location_id: `loc-${name}`, leg_index: leg });

describe('trip stops edit rules', () => {
  it('modes by status', () => {
    assert.equal(stopsEditMode('Draft'), 'full');
    assert.equal(stopsEditMode('Scheduled'), 'full');
    for (const s of ['Loading', 'InTransit', 'Delayed']) assert.equal(stopsEditMode(s), 'unreached');
    for (const s of ['Completed', 'Invoiced', 'Cancelled']) assert.equal(stopsEditMode(s), 'locked');
  });

  it('completed / invoiced / cancelled are locked', () => {
    for (const s of ['Completed', 'Invoiced', 'Cancelled']) {
      const r = planStopsEdit(s, [stop('1', 1, 'A')], [inc('A')]);
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.code, 'ROUTE_LOCKED');
    }
  });

  it('a scheduled round trip can add and remove middle stops on either leg', () => {
    const existing = [stop('1', 1, 'A'), stop('2', 2, 'B'), stop('3', 3, 'B', 1), stop('4', 4, 'A', 1)];
    const added = [inc('A'), inc('X'), inc('B'), inc('B', 1), inc('Y', 1), inc('A', 1)];
    assert.deepEqual(planStopsEdit('Scheduled', existing, added), { ok: true, frozenCount: 0, frozenIds: [] });
    assert.equal(planStopsEdit('Draft', existing, [inc('A'), inc('A', 1)]).ok, true);
  });

  it('a running trip can add a stop before the next unreached one', () => {
    const existing = [stop('1', 1, 'A', 0, true), stop('2', 2, 'C'), stop('3', 3, 'D')];
    const r = planStopsEdit('InTransit', existing, [inc('A'), inc('NEW'), inc('C'), inc('D')]);
    assert.deepEqual(r, { ok: true, frozenCount: 1, frozenIds: ['1'] });
  });

  it('a running trip can remove or reorder unreached stops', () => {
    const existing = [stop('1', 1, 'A', 0, true), stop('2', 2, 'C'), stop('3', 3, 'D'), stop('4', 4, 'E')];
    assert.equal(planStopsEdit('Delayed', existing, [inc('A'), inc('E'), inc('D')]).ok, true);
  });

  it('a reached stop cannot be removed, moved or replaced', () => {
    const existing = [stop('1', 1, 'A', 0, true), stop('2', 2, 'B', 0, true), stop('3', 3, 'C')];
    for (const incoming of [[inc('A'), inc('C')], [inc('B'), inc('A'), inc('C')], [inc('NEW'), inc('A'), inc('B'), inc('C')], [inc('A'), inc('X'), inc('C')]]) {
      const r = planStopsEdit('Loading', existing, incoming);
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.code, 'STOP_ALREADY_REACHED');
    }
  });

  it('reached means arrival or departure recorded', () => {
    assert.equal(isStopReached({ actual_arrival: T }), true);
    assert.equal(isStopReached({ actual_departure: T }), true);
    assert.equal(isStopReached({ actual_arrival: null }), false);
  });

  it('new stops renumber after the kept ones (index + 1 over the full list)', () => {
    const existing = [stop('1', 1, 'A', 0, true), stop('2', 2, 'C')];
    const incoming = [inc('A'), inc('N1'), inc('C')];
    const r = planStopsEdit('InTransit', existing, incoming);
    assert.ok(r.ok);
    const created = incoming.map((s, i) => ({ s, seq: i + 1 })).slice(r.ok ? r.frozenCount : 0);
    assert.deepEqual(created.map((c) => [c.s.location_name, c.seq]), [['N1', 2], ['C', 3]]);
  });
});

// Driver app next-stop logic after a mid-trip route edit. The driver app reads
// stops from the server and orders them by stop_sequence; these are the shared
// functions it uses (Home next-stop card, live navigation, stop verification).
import { getTimelineProgress, parseTripRouteNodes, pendingStopFromWorkflow, getLegIntermediateDbStops } from '@mercon/shared-types';

describe('driver app after a mid-trip route edit', () => {
  const s = (id: string, seq: number, name: string, type: string, arrived = false, left = false) => ({
    id, stop_sequence: seq, leg_index: 0, stop_type: type, location_name: name, location_id: `loc-${name}`,
    actual_arrival: arrived ? T.toISOString() : null, actual_departure: left ? T.toISOString() : null,
  });
  // The server returns stops ordered by stop_sequence (mobileTripController).
  const trip = (stops: any[], ws: string) => ({ id: 't', status: 'InTransit', driver_workflow_state: ws, stops: [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence) } as any);
  const nextName = (t: any) => {
    const nodes = parseTripRouteNodes(t);
    return nodes[Math.max(0, getTimelineProgress(nodes, false).indexOf('current'))].name;
  };

  const base = [s('1', 1, 'A', 'Pickup', true, true), s('2', 2, 'X', 'Rest'), s('3', 3, 'B', 'Dropoff')];

  it('next stop is the one inserted before the old next stop (ordered by stop_sequence)', () => {
    assert.equal(nextName(trip(base, 'GOING_TO_STOP')), 'X');
    const withNew = [base[0], s('9', 2, 'NEW', 'Rest'), s('2b', 3, 'X', 'Rest'), s('3', 4, 'B', 'Dropoff')];
    assert.equal(nextName(trip([...withNew].reverse(), 'GOING_TO_STOP')), 'NEW');
  });

  it('a removed unreached stop disappears from the route; next stop moves on', () => {
    assert.equal(nextName(trip([base[0], { ...base[2], stop_sequence: 2 }], 'GOING_TO_STOP')), 'B');
  });

  it('a stop-workflow index pointing at an inserted stop resolves to it, no stale index', () => {
    const t = trip([base[0], s('9', 2, 'NEW', 'Rest'), s('2b', 3, 'X', 'Rest'), s('3', 4, 'B', 'Dropoff')], 'ARRIVED_AT_STOP_0');
    assert.deepEqual(pendingStopFromWorkflow('ARRIVED_AT_STOP_0', t), { leg: 0, stopIndex: 0 });
    assert.equal(getLegIntermediateDbStops(t, 0)[0].location_name, 'NEW');
  });

  it('a workflow index whose stop was removed no longer sends the driver to a stop', () => {
    const t = trip([base[0], base[2]], 'ARRIVED_AT_STOP_1');
    assert.equal(pendingStopFromWorkflow('ARRIVED_AT_STOP_1', t), null);
    assert.equal(pendingStopFromWorkflow('GOING_TO_STOP', t), null);
    assert.deepEqual(pendingStopFromWorkflow('GOING_TO_STOP', trip(base, 'GOING_TO_STOP')), { leg: 0, stopIndex: 0 });
  });
});

import { extraStopNote, findExtraStopRule } from '@mercon/shared-types';

describe('extra stop note and charge rule', () => {
  const qStops = [{ sequence: 1, leg_index: 0 }, { sequence: 2, leg_index: 0 }];
  const tStop = (seq: number, leg = 0) => ({ stop_sequence: seq, leg_index: leg });
  it('shows the note when the trip has more middle stops than its quotation', () => {
    const trip = { quotation: { quotation_number: 123, stops: qStops }, stops: [tStop(1), tStop(2), tStop(3)] };
    assert.equal(extraStopNote(trip), 'Extra stop · route differs from QT-0123');
  });
  it('no note when routes match or the quotation has no stops', () => {
    assert.equal(extraStopNote({ quotation: { quotation_number: 1, stops: qStops }, stops: [tStop(1), tStop(2)] }), null);
    assert.equal(extraStopNote({ quotation: { quotation_number: 1, stops: [] }, stops: [tStop(1), tStop(2), tStop(3)] }), null);
  });
  it('finds the additional-stop rule, preferring an active one', () => {
    const rules = [{ charge_type: 'Waiting', is_active: true }, { charge_type: 'Additional Stop', is_active: false }, { charge_type: 'Extra stops', is_active: true }];
    assert.equal(findExtraStopRule(rules)?.charge_type, 'Extra stops');
    assert.equal(findExtraStopRule([{ charge_type: 'Waiting' }]), null);
  });
});

describe('stop matching', () => {
  it('a stop saved by name only still matches once the server gave it a location id', () => {
    const existing = [{ id: '1', stop_sequence: 1, leg_index: 0, location_name: 'Riyadh DC', location_id: null, actual_arrival: T }, { id: '2', stop_sequence: 2, leg_index: 0, location_name: 'Jeddah', location_id: null, actual_arrival: null }];
    const r = planStopsEdit('InTransit', existing as any, [{ location_name: 'riyadh dc ', location_id: 'new-id', leg_index: 0 }, { location_name: 'Stop', location_id: 'x', leg_index: 0 }, { location_name: 'Jeddah', leg_index: 0 }]);
    assert.equal(r.ok, true);
  });
});
