import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { approxMinutes, dutyMinutesOf, legStats, quotationLegs } from '../services/transitQuotations';
import type { LegSample } from '../services/transitTimes';

const stop = (sequence: number, leg_index: number, name: string, lat = 18, lng = 42) => ({ sequence, leg_index, source_label: null, location: { name, lat, lng } });

describe('transit times per quotation', () => {
  it('splits a quotation into the way there and the way back', () => {
    const legs = quotationLegs([stop(3, 1, 'Najran'), stop(1, 0, 'Khamis'), stop(4, 1, 'Khamis'), stop(2, 0, 'Najran')]);
    assert.deepEqual(legs.map((l) => [l.leg, l.stops.map((s) => s.location!.name)]), [['out', ['Khamis', 'Najran']], ['return', ['Najran', 'Khamis']]]);
    assert.equal(quotationLegs([stop(1, 0, 'Khamis')]).length, 0);
  });

  it('a duty line plans its duty length', () => {
    assert.equal(dutyMinutesOf('10 Hours Duty'), 600);
    assert.equal(dutyMinutesOf('12 Hours Duty'), 720);
    assert.equal(dutyMinutesOf('Single Trip'), null);
  });

  it('falls back to straight line × road factor at truck speed', () => {
    // Khamis → Najran ≈ 175 km straight → ×1.22 ≈ 214 km at 80 km/h ≈ 160 min
    const m = approxMinutes([{ lat: 18.3064, lng: 42.7292 }, { lat: 17.4933, lng: 44.1277 }]);
    assert.ok(m > 140 && m < 180, String(m));
  });

  it('averages the finished trips of the same route and size', () => {
    const s = (min: number, size = '5 TON'): LegSample => ({ tripId: 't', ref: null, leg: 'out', from: 'Khamis', to: 'Najran', size, departedAt: new Date(), actualMin: min, plannedMin: null, loadingDwellMin: null, offloadDwellMin: null });
    assert.deepEqual(legStats([s(200), s(220), s(300, '10 TON')], 'out|khamis|najran|5 TON'), { trips: 2, avg: 210 });
    assert.deepEqual(legStats([], 'out|khamis|najran|5 TON'), { trips: 0, avg: null });
  });
});
