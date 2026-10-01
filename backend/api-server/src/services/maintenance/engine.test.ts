import test from 'node:test';
import assert from 'node:assert/strict';
import { daysOut, dueFor, itemsProblem, orderTotals, overlapDays, plansFor, type PlanLike } from './engine';

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const plan = (p: Partial<PlanLike>): PlanLike => ({ id: 'p', task: 'Oil change', asset_type: null, vehicleId: null, interval_km: 10000, interval_days: 180, warn_km: 1000, warn_days: 14, ...p });

test('order totals come from the lines, split by kind, plus VAT', () => {
  const t = orderTotals(
    [
      { kind: 'part', description: 'Oil 5W-40', quantity: 38, unit_price: 15 },
      { kind: 'part', description: 'Filters', quantity: 3, unit_price: 60 },
      { kind: 'labour', description: 'Labour', quantity: 1, unit_price: 100 },
    ],
    127.5,
  );
  assert.equal(t.net, 850);
  assert.equal(t.total, 977.5);
  assert.deepEqual(t.byKind, { part: 750, labour: 100, other: 0 });
  assert.equal(t.lines[0].amount, 570);
});

test('bad lines are reported', () => {
  assert.equal(itemsProblem([{ kind: 'part', description: 'x', quantity: 1, unit_price: 10 }], 1.5), null);
  assert.match(itemsProblem([{ kind: 'part', description: ' ', quantity: 1, unit_price: 10 }], 0) ?? '', /description/);
  assert.match(itemsProblem([{ kind: 'part', description: 'x', quantity: 0, unit_price: 10 }], 0) ?? '', /Quantities/);
  assert.match(itemsProblem([], 15) ?? '', /cost lines before the VAT/);
});

test('days out of service, and the part of them inside a month', () => {
  assert.equal(daysOut(d('2026-09-24'), d('2026-09-30'), d('2026-10-05')), 6);
  assert.equal(daysOut(d('2026-09-28'), null, d('2026-09-30')), 2);
  assert.equal(daysOut(d('2026-09-30'), null, d('2026-09-30')), 1);
  assert.equal(overlapDays(d('2026-08-28'), d('2026-09-03'), d('2026-09-01'), d('2026-09-30'), d('2026-10-01')), 2);
});

test('a truck’s own plan overrides its type’s; a type plan beats an all-trucks plan', () => {
  const plans = [
    plan({ id: 'all', task: 'Oil change' }),
    plan({ id: 'flat', task: 'oil change', asset_type: 'Flatbed', interval_km: 8000 }),
    plan({ id: 'mine', task: 'Tyre rotation', vehicleId: 'v1' }),
    plan({ id: 'mine-oil', task: 'Oil Change', vehicleId: 'v2', interval_km: 5000 }),
    plan({ id: 'reefer', task: 'Reefer unit', asset_type: 'Reefer' }),
  ];
  assert.deepEqual(plansFor(plans, { id: 'v1', asset_type: 'Flatbed' }).map((p) => p.id).sort(), ['flat', 'mine']);
  assert.deepEqual(plansFor(plans, { id: 'v2', asset_type: 'Flatbed' }).map((p) => p.id), ['mine-oil']);
  assert.deepEqual(plansFor(plans, { id: 'v3', asset_type: 'Box' }).map((p) => p.id), ['all']);
});

test('due by km or by days, whichever comes first', () => {
  const last = { date: d('2026-06-01'), km: 200000 };
  assert.equal(dueFor(plan({}), last, 212400, d('2026-09-30'), false).status, 'overdue'); // 2,400 km over
  assert.equal(dueFor(plan({}), last, 209500, d('2026-09-30'), false).status, 'due_soon'); // 500 km left
  assert.equal(dueFor(plan({}), last, 203000, d('2026-11-20'), false).status, 'due_soon'); // 8 days left
  assert.equal(dueFor(plan({}), last, 203000, d('2026-12-05'), false).status, 'overdue'); // past 180 days
  const ok = dueFor(plan({}), last, 203000, d('2026-09-30'), false);
  assert.deepEqual([ok.status, ok.dueKm, ok.remainingKm], ['ok', 210000, 7000]);
  assert.equal(dueFor(plan({ interval_days: null }), last, 203000, d('2027-09-30'), false).status, 'ok');
  assert.equal(dueFor(plan({}), null, 0, d('2026-09-30'), false).status, 'never');
  assert.equal(dueFor(plan({}), last, 212400, d('2026-09-30'), true).status, 'booked');
});
