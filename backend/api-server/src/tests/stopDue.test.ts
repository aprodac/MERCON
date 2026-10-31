import test from 'node:test';
import assert from 'node:assert/strict';
import { stopDueAt, stopMinutesLate } from '@mercon/shared-types';

// TRP-0024 (TestFlight 29 Oct): Riyadh booked 20:00, left 20:26; Jeddah booked 10:00 next day (14 h), arrived 10:26.
const stops = [
  { planned_arrival: '2026-10-28T20:00:00+03:00', actual_departure: '2026-10-28T20:26:00+03:00' },
  { planned_arrival: '2026-10-29T10:00:00+03:00', actual_departure: null },
];

test('a stop after a late departure is due departure + transit time', () => {
  assert.equal(stopDueAt(stops, 1)?.toISOString(), new Date('2026-10-29T10:26:00+03:00').toISOString());
  assert.equal(stopMinutesLate(stops, 1, '2026-10-29T10:26:00+03:00'), 0);
  assert.equal(stopMinutesLate(stops, 1, '2026-10-29T11:00:00+03:00'), 34);
});

test('the first stop, and one before its previous stop is left, are due at the booked time', () => {
  assert.equal(stopMinutesLate(stops, 0, '2026-10-28T20:27:00+03:00'), 27);
  const notLeft = [{ ...stops[0], actual_departure: null }, stops[1]];
  assert.equal(stopMinutesLate(notLeft, 1, '2026-10-29T10:26:00+03:00'), 26);
});

test('leaving early never makes the booked arrival late', () => {
  const early = [{ ...stops[0], actual_departure: '2026-10-28T19:00:00+03:00' }, stops[1]];
  assert.equal(stopMinutesLate(early, 1, '2026-10-29T10:00:00+03:00'), 0);
});

test('no planned time, or no arrival, is not judged', () => {
  assert.equal(stopDueAt([{ planned_arrival: null }], 0), null);
  assert.equal(stopMinutesLate(stops, 1, null), null);
});

// TRP-0084 (TestFlight 31 Oct): Riyadh booked 04:00, left 04:31; Al Bahah booked 20:35 (16 h 35 m) — due 21:06, not 20:35.
test('a stop not reached yet is due departure + transit time', () => {
  const trp84 = [
    { planned_arrival: '2026-10-31T04:00:00+03:00', actual_departure: '2026-10-31T04:31:00+03:00' },
    { planned_arrival: '2026-10-31T20:35:00+03:00', actual_departure: null },
  ];
  assert.equal(stopDueAt(trp84, 1)?.toISOString(), new Date('2026-10-31T21:06:00+03:00').toISOString());
});
