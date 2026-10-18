import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStopTimes, type StopTimeRow } from '@mercon/shared-types';

const TZ = 'Asia/Riyadh';
// 17 Oct, Riyadh time (UTC+3).
const at = (clock: string) => new Date(`2026-10-17T${clock}+03:00`).toISOString();

test('Check times: a drop-off\'s hidden "Left" follows its arrival', async (t) => {
  // TRP-0038 (TestFlight 18 Oct): reached Najran 23:55:07 (drop-off), reached Najran
  // 23:55:12 and left 23:55:14 (loading) — in order, but the drop-off's tapped
  // leave time (23:56:30) blocked the save with "Earlier than the stop before".
  const rows: StopTimeRow[] = [
    { stopId: 'khamis', recordedArrival: at('18:28:50'), recordedDeparture: at('18:28:58'), arrival: '', departure: '' },
    { stopId: 'najran-drop', recordedArrival: at('23:56:00'), recordedDeparture: at('23:56:30'), arrival: '23:55:07', departure: '', leftFollowsArrival: true },
    { stopId: 'najran-load', recordedArrival: at('23:56:10'), recordedDeparture: at('23:54:00'), arrival: '23:55:12', departure: '23:55:14' },
  ];

  await t.test('no error, and the drop-off leaves when it arrived', () => {
    const r = resolveStopTimes(rows, TZ, at('18:00:00'));
    assert.deepEqual(r.map((s) => [s.arrival.error, s.departure.error]), [[null, null], [null, null], [null, null]]);
    assert.equal(r[1].departure.iso, at('23:55:07'));
    assert.equal(r[1].departure.changed, true);
  });

  await t.test('an untouched drop-off whose tapped leave time is after the next arrival is pulled back to its arrival', () => {
    const r = resolveStopTimes([rows[0], { ...rows[1], arrival: '' }, { ...rows[2], arrival: '23:56:05', departure: '23:56:20' }], TZ, at('18:00:00'));
    assert.equal(r[2].arrival.error, null);
    assert.equal(r[1].departure.iso, at('23:56:00'));
  });

  await t.test('a real mix-up still shows: arriving before the stop before', () => {
    const r = resolveStopTimes([rows[0], rows[1], { ...rows[2], arrival: '23:50:00', departure: '' }], TZ, at('18:00:00'));
    assert.equal(r[2].arrival.error, 'Earlier than the stop before');
  });
});
