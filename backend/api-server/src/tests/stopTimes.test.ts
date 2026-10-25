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

test('Check times: a time typed for a stop with no tap is never put in the future', () => {
  // TRP-0049 (TestFlight 21 Oct, 04:26 Riyadh): nothing tapped until the truck
  // was back at Khamis (03:22:40 on 21 Oct); the Start tap was 21 Oct. Typing
  // 21:05:34 / 00:49:03 / 03:11:24 off the screenshots put them on 21–22 Oct
  // and flagged the tapped 03:22:40 as "before the truck reached Muhayil".
  const day = (d: number, clock: string) => new Date(`2026-10-${d}T${clock}+03:00`).toISOString();
  const rows: StopTimeRow[] = [
    { stopId: 'khamis', recordedArrival: null, recordedDeparture: null, arrival: '21:05:34', departure: '00:49:03' },
    { stopId: 'muhayil', recordedArrival: null, recordedDeparture: null, arrival: '03:11:24', departure: '', leftFollowsArrival: true },
    { stopId: 'muhayil-load', recordedArrival: null, recordedDeparture: null, arrival: '', departure: '' },
    { stopId: 'khamis-back', recordedArrival: day(21, '03:22:40'), recordedDeparture: day(21, '03:22:40'), arrival: '', departure: '', leftFollowsArrival: true },
  ];
  const r = resolveStopTimes(rows, TZ, day(21, '03:20:00'), day(21, '04:26:00'));
  assert.equal(r[0].arrival.iso, day(20, '21:05:34'));
  assert.equal(r[0].departure.iso, day(21, '00:49:03'));
  assert.equal(r[1].arrival.iso, day(21, '03:11:24'));
  assert.deepEqual(r.map((s) => s.arrival.error), [null, null, null, null]);
});

test('Check times: taps made late the next morning don\'t push typed times out of order', async (t) => {
  // TRP-0053 (TestFlight 24 Oct): the driver tapped every stop at 10:56–11:01 on 18 Oct;
  // the screenshot says Khamis arrived 18:22:18 and left 23:53:33 on 17 Oct. "Left" was
  // put the night before "Arrived" (picked by the tap's day) → "left before arrived".
  const day18 = (clock: string) => new Date(`2026-10-18T${clock}+03:00`).toISOString();
  const rows: StopTimeRow[] = [
    { stopId: 'khamis', recordedArrival: day18('10:56:00'), recordedDeparture: day18('10:59:00'), arrival: '18:22:18', departure: '23:53:33' },
    { stopId: 'najran', recordedArrival: null, recordedDeparture: null, arrival: '', departure: '' },
    { stopId: 'khamis-back', recordedArrival: day18('11:01:33'), recordedDeparture: null, arrival: '', departure: '' },
  ];

  await t.test('both on the 17th, in order', () => {
    const r = resolveStopTimes(rows, TZ, day18('10:56:00'), day18('23:00:00'));
    assert.equal(r[0].arrival.iso, at('18:22:18'));
    assert.equal(r[0].departure.iso, at('23:53:33'));
    assert.deepEqual([r[0].arrival.error, r[0].departure.error], [null, null]);
  });

  await t.test('a day the operator sets is taken as is', () => {
    const r = resolveStopTimes([{ ...rows[0], arrivalDate: '2026-10-18', departureDate: '2026-10-18' }, rows[1], rows[2]], TZ, day18('10:56:00'), day18('23:00:00'));
    assert.equal(r[0].arrival.iso, day18('18:22:18'));
    assert.equal(r[0].departure.iso, day18('23:53:33'));
  });
});

test('Check times: a "Left" just before its own "Arrived" is flagged on that stop, not a day later', () => {
  // TRP-0056 (TestFlight 24 Oct): Najran arrived 05:53:30, left typed 05:36:30. It went to
  // the next day, so the error showed on the following stop instead of Najran.
  const rows: StopTimeRow[] = [
    { stopId: 'khamis', recordedArrival: at('17:56:34'), recordedDeparture: at('20:32:30'), arrival: '', departure: '' },
    { stopId: 'najran', recordedArrival: null, recordedDeparture: null, arrival: '05:53:30', departure: '05:36:30' },
  ];
  const r = resolveStopTimes(rows, TZ, at('17:00:00'), new Date('2026-10-19T12:00:00+03:00').toISOString());
  assert.equal(r[1].departure.error, 'Left before arrived');
});
