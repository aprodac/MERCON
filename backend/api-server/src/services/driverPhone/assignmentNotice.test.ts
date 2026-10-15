/**
 * When a driver is told about a trip (services/driverPhone/assignmentNotice):
 * 07:00 on the trip day, or 12 h before pickup when that is earlier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentNoticeAt } from './assignmentNotice';

const TZ = 'Asia/Riyadh'; // UTC+3, no DST
const at = (iso: string) => assignmentNoticeAt(new Date(iso), TZ).toISOString();

test('an evening pickup is announced at 07:00 the same day', () => {
  // 20:00 Riyadh on 25 Oct = 17:00 UTC → 07:00 Riyadh = 04:00 UTC
  assert.equal(at('2026-10-25T17:00:00Z'), '2026-10-25T04:00:00.000Z');
});

test('an early pickup is announced 12 h before, the evening before', () => {
  // 06:00 Riyadh on 26 Oct = 03:00 UTC → 18:00 Riyadh on 25 Oct = 15:00 UTC
  assert.equal(at('2026-10-26T03:00:00Z'), '2026-10-25T15:00:00.000Z');
});

test('a pickup at exactly 19:00 lands on both rules at 07:00', () => {
  assert.equal(at('2026-10-25T16:00:00Z'), '2026-10-25T04:00:00.000Z');
});

test('each day of a month plan gets its own notice', () => {
  const days = ['21', '22', '23', '24'].map((d) => at(`2026-10-${d}T17:00:00Z`));
  assert.deepEqual(days, ['2026-10-21T04:00:00.000Z', '2026-10-22T04:00:00.000Z', '2026-10-23T04:00:00.000Z', '2026-10-24T04:00:00.000Z']);
});
