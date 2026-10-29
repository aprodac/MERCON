import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { frozenTripPayout } from '../services/quotationPayoutClear';
import { calculateBackendTripFinancials } from '../utils/tripFinancials';

const pay = (t: { driver_payout: number; co_driver_payout: number; co_driver_id: string | null }, quotationPayout: number | null) => {
  const f = calculateBackendTripFinancials({ ...t, quotation: { rate: 1000, driver_payout: quotationPayout } });
  return { driver: f.primaryDriverPayout, co: f.coDriverPayout, total: f.totalDriverPayout };
};

describe('frozenTripPayout', () => {
  it('leaves a trip with its own pay alone', () => {
    assert.equal(frozenTripPayout(300, { driver_payout: 250, co_driver_payout: 0, co_driver_id: null }), null);
  });

  it('leaves trips alone when the quotation has no payout', () => {
    assert.equal(frozenTripPayout(null, { driver_payout: 0, co_driver_payout: 0, co_driver_id: null }), null);
    assert.equal(frozenTripPayout(0, { driver_payout: 0, co_driver_payout: 0, co_driver_id: null }), null);
  });

  it('keeps every trip paid the same after the quotation payout is cleared', () => {
    const quoted = [25, 100, 150, 199, 200, 201, 300, 450, 1000];
    const coPays = [0, 50, 100, 150, 200, 300, 600];
    for (const q of quoted) {
      for (const co of coPays) {
        for (const coId of [null, 'co-driver']) {
          const trip = { driver_payout: 0, co_driver_payout: co, co_driver_id: coId };
          const before = pay(trip, q);
          const frozen = frozenTripPayout(q, trip);
          assert.notEqual(frozen, null, `q=${q} co=${co} coId=${coId}`);
          const after = pay({ ...trip, driver_payout: frozen! }, null);
          assert.deepEqual(after, before, `q=${q} co=${co} coId=${coId} frozen=${frozen}`);
        }
      }
    }
  });
});
