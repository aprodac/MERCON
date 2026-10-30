import test from 'node:test';
import assert from 'node:assert/strict';
import { canUndoTripLogEntry, dutyHours, isDutyCategory, tripLogEntries, usesTripLog } from '@mercon/shared-types';
import { buildDriverUpdates } from '../services/operatorInbox';

const NOW = Date.parse('2026-10-17T10:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000);

const logDoc = (id: string, entry: string, minAgo: number, meta: Record<string, unknown> = {}) => ({
  id, doc_type: 'Waybill', file_url: `/uploads/${id}.jpg`, mime_type: 'image/jpeg', createdAt: ago(minAgo), files: [],
  ai_extracted_json: { operation: 'log', log_entry: entry, source: 'external_app_screenshot', ...meta },
});

test('trip log', async (t) => {
  await t.test('groups screenshots by send, oldest first, with time, place and GPS', () => {
    const entries = tripLogEntries([
      logDoc('b1', 'e2', 30, { place: 'Taif' }),
      logDoc('a1', 'e1', 120, { gps: { latitude: '21.4', longitude: '39.8', captured_at: ago(125).toISOString() } }),
      logDoc('a2', 'e1', 119),
      { id: 'x', file_url: '/uploads/x.jpg', createdAt: ago(5), ai_extracted_json: { operation: 'pickup' } },
    ]);
    assert.deepEqual(entries.map((e) => e.id), ['e1', 'e2']);
    assert.equal(entries[0].docs.length, 2);
    assert.equal(entries[0].at, ago(125).toISOString());
    assert.deepEqual(entries[0].gps, { lat: 21.4, lng: 39.8 });
    assert.equal(entries[1].place, 'Taif');
    assert.equal(entries[1].stop_id, null);
  });

  await t.test('only customer-app trips not started on the step screens use the log', () => {
    assert.equal(usesTripLog({ driver_workflow: 'EXTERNAL_APP', driver_workflow_state: null }), true);
    assert.equal(usesTripLog({ driver_workflow: 'EXTERNAL_APP', driver_workflow_state: 'TRIP_LOG' }), true);
    assert.equal(usesTripLog({ driver_workflow: 'EXTERNAL_APP', driver_workflow_state: 'GOING_TO_PICKUP' }), false);
    // Every trip runs as a trip log since 30 Oct; one started on the old screens finishes there.
    assert.equal(usesTripLog({ driver_workflow: 'NATIVE', driver_workflow_state: null }), true);
    assert.equal(usesTripLog({ driver_workflow: 'NATIVE', driver_workflow_state: 'ARRIVED_AT_PICKUP' }), false);
  });

  await t.test('a send can be taken back only shortly after, and never once it is on a stop', () => {
    const [fresh] = tripLogEntries([logDoc('a', 'e', 5)]);
    const [old] = tripLogEntries([logDoc('b', 'e', 40)]);
    const [used] = tripLogEntries([logDoc('c', 'e', 5, { stop_id: 's1' })]);
    assert.equal(canUndoTripLogEntry(fresh, NOW), true);
    assert.equal(canUndoTripLogEntry(old, NOW), false);
    assert.equal(canUndoTripLogEntry(used, NOW), false);
  });

  await t.test('each send is its own row in From drivers, with its place, keyed by the send', () => {
    const trip = {
      id: 't1', ref_id: 'TRP-0300', status: 'InTransit', customer: null, vehicle: null, driver: null,
      stops: [{ id: 'p', stop_sequence: 1, stop_type: 'Pickup', location_name: 'Riyadh', location_address: null, actual_arrival: null, delay_reason: null, delay_note: null, delay_logged_at: null }],
    };
    const ups = buildDriverUpdates([trip], new Map([['t1', [
      logDoc('a1', 'e1', 120, { place: 'Riyadh' }), logDoc('a2', 'e1', 119), logDoc('b1', 'e2', 30, { place: 'Taif' }),
    ]]]), []);
    const rows = ups.filter((u) => u.stage === 'log');
    assert.deepEqual(rows.map((u) => u.key).sort(), ['log:e1', 'log:e2']);
    assert.equal(rows.find((u) => u.key === 'log:e1')!.items.length, 2);
    assert.equal(rows.find((u) => u.key === 'log:e2')!.place, 'Taif');
  });
});

test('10 / 12 hours duty runs as screenshots only', () => {
  for (const c of ['10_HRS', '12_HRS', '10 hours duty', '12 Hours', '10 HRS']) assert.equal(isDutyCategory(c), true, c);
  for (const c of ['ROUND_TRIP', 'SINGLE_TRIP', 'Round Trip', '10 TON', '', null, undefined]) assert.equal(isDutyCategory(c), false, String(c));
  assert.equal(dutyHours('10_HRS'), 10);
  assert.equal(dutyHours('12 hours duty'), 12);
  assert.equal(dutyHours('ROUND_TRIP'), null);
});
