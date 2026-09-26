import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveMonth, toDayKey } from '../utils/tripBoard';

describe('resolveMonth', () => {
  it('parses a valid YYYY-MM string', () => {
    const result = resolveMonth('2026-03');
    assert.equal(result.month, '2026-03');
    assert.equal(result.start.getFullYear(), 2026);
    assert.equal(result.start.getMonth(), 2);
    assert.equal(result.start.getDate(), 1);
    assert.equal(result.end.getMonth(), 2);
    assert.equal(result.end.getDate(), 31);
  });

  it('handles February in a leap year correctly', () => {
    const result = resolveMonth('2028-02');
    assert.equal(result.end.getDate(), 29);
  });

  it('falls back to the current month for an invalid format', () => {
    const now = new Date();
    const result = resolveMonth('not-a-month');
    assert.equal(result.start.getFullYear(), now.getFullYear());
    assert.equal(result.start.getMonth(), now.getMonth());
  });

  it('falls back to the current month for an out-of-range month', () => {
    const now = new Date();
    const result = resolveMonth('2026-13');
    assert.equal(result.start.getMonth(), now.getMonth());
  });

  it('falls back to the current month for an out-of-range year', () => {
    const now = new Date();
    const result = resolveMonth('1899-05');
    assert.equal(result.start.getFullYear(), now.getFullYear());
  });

  it('falls back to the current month when the param is missing', () => {
    const now = new Date();
    const result = resolveMonth(undefined);
    assert.equal(result.month, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  });

  it('start is midnight and end is the last instant of the month', () => {
    const result = resolveMonth('2026-06');
    assert.equal(result.start.getHours(), 0);
    assert.equal(result.start.getMinutes(), 0);
    assert.equal(result.end.getHours(), 23);
    assert.equal(result.end.getMinutes(), 59);
  });
});

describe('toDayKey', () => {
  it('formats a Date object as local YYYY-MM-DD', () => {
    const d = new Date(2026, 8, 5); // September 5, 2026 (local)
    assert.equal(toDayKey(d), '2026-09-05');
  });

  it('formats an ISO date string', () => {
    assert.equal(toDayKey('2026-01-15T00:00:00'), '2026-01-15');
  });

  it('returns the epoch sentinel for null', () => {
    assert.equal(toDayKey(null), '1970-01-01');
  });

  it('returns the epoch sentinel for undefined', () => {
    assert.equal(toDayKey(undefined), '1970-01-01');
  });

  it('returns the epoch sentinel for an invalid date string', () => {
    assert.equal(toDayKey('not-a-date'), '1970-01-01');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 3); // January 3, 2026
    assert.equal(toDayKey(d), '2026-01-03');
  });
});
