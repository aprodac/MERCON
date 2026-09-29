import test from 'node:test';
import assert from 'node:assert/strict';
import { settlementPosting } from '../utils/driverSettlementEngine';
import { tripPayShares } from '../utils/tripFinancials';

const base = { driverPayAccountId: 'exp', paymentAccountId: 'bank', driverName: 'Ahmed' };

test('a settlement posts trip pay, the advances recovered and the net paid', () => {
  const p = settlementPosting({ ...base, gross: 1500, advances: [{ accountId: 'adv', amount: 500, ref: 'ADV-1' }] });
  assert.equal(p.deducted, 500);
  assert.equal(p.net, 1000);
  assert.deepEqual(p.lines.map((l) => [l.accountId, l.debit, l.credit]), [['exp', 1500, 0], ['adv', 0, 500], ['bank', 0, 1000]]);
  const dr = p.lines.reduce((t, l) => t + l.debit, 0);
  const cr = p.lines.reduce((t, l) => t + l.credit, 0);
  assert.equal(dr, cr);
});

test('advances can cover it all: no bank line, no bank needed', () => {
  const p = settlementPosting({ ...base, paymentAccountId: null, gross: 400, advances: [{ accountId: 'adv', amount: 400, ref: null }] });
  assert.equal(p.net, 0);
  assert.equal(p.lines.length, 2);
});

test('rejects nothing to pay, over-recovery and a missing bank', () => {
  assert.throws(() => settlementPosting({ ...base, gross: 0, advances: [] }), /at least one trip/);
  assert.throws(() => settlementPosting({ ...base, gross: 100, advances: [{ accountId: 'adv', amount: 150, ref: null }] }), /more than the trip pay/);
  assert.throws(() => settlementPosting({ ...base, paymentAccountId: null, gross: 100, advances: [] }), /paid from/);
});

test('trip pay splits between driver and co-driver; extras go to the driver; 3PL owes no driver', () => {
  assert.deepEqual(tripPayShares({ driver_payout: 300, extra_driver_payment: 50 }), { driver: 350, coDriver: 0 });
  assert.deepEqual(tripPayShares({ driver_payout: 200, co_driver_payout: 200, co_driver_id: 'x' } as any), { driver: 200, coDriver: 200 });
  assert.deepEqual(tripPayShares({ is_third_party: true, third_party_cost: 900 }), { driver: 0, coDriver: 0 });
});
