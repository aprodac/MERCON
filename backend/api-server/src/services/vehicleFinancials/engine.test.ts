import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  accrueMonthly,
  addYears,
  classifyExpense,
  computeVehicleEconomics,
  monthsBetween,
  sumBreakdowns,
  type EconInput,
  type EconVehicle,
} from './engine';

const vehicle = (id: string, over: Partial<EconVehicle> = {}): EconVehicle => ({
  id, purchasePrice: null, residualValue: null, usefulLifeYears: null, purchaseDay: null, fixedCosts: [], ...over,
});

const base = (over: Partial<EconInput> = {}): EconInput => ({
  from: '2026-09-01', to: '2026-09-30', accrueTo: '2026-09-30',
  vehicles: [vehicle('A'), vehicle('B')], trips: [], costs: [], salaries: [], assignedVehicle: new Map(), ...over,
});

describe('calendar helpers', () => {
  it('lists the months a range touches', () => {
    assert.deepEqual(monthsBetween('2026-11-15', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('adds years and clamps 29 February', () => {
    assert.equal(addYears('2024-02-29', 5), '2029-02-28');
    assert.equal(addYears('2026-03-10', 5), '2031-03-10');
  });
});

describe('accrueMonthly', () => {
  it('a full month gets exactly the monthly amount', () => {
    const m = accrueMonthly(3000, '2026-01-01', null, '2026-09-01', '2026-09-30');
    assert.deepEqual([...m], [['2026-09', 3000]]);
  });

  it('a partial month is prorated by days covered', () => {
    const m = accrueMonthly(3000, '2026-09-16', null, '2026-09-01', '2026-09-30');
    assert.equal(m.get('2026-09'), 1500);
  });

  it('stops at the active end date and at the range end', () => {
    const m = accrueMonthly(3100, '2026-01-01', '2026-08-10', '2026-08-01', '2026-09-30');
    assert.equal(m.get('2026-08'), 1000);
    assert.equal(m.has('2026-09'), false);
  });

  it('returns nothing when the windows do not overlap or the amount is zero', () => {
    assert.equal(accrueMonthly(1000, '2027-01-01', null, '2026-09-01', '2026-09-30').size, 0);
    assert.equal(accrueMonthly(0, '2026-01-01', null, '2026-09-01', '2026-09-30').size, 0);
  });
});

describe('classifyExpense', () => {
  it('maps truck categories to their P&L line', () => {
    assert.equal(classifyExpense('Fuel'), 'fuel');
    assert.equal(classifyExpense('Vehicle Maintenance'), 'maintenance');
    assert.equal(classifyExpense('Tyres'), 'maintenance');
    assert.equal(classifyExpense('Toll & Parking'), 'tolls');
    assert.equal(classifyExpense('Government Fees'), 'other');
  });

  it('never counts salary payments or advances — the salary profile already does', () => {
    assert.equal(classifyExpense('Salary'), null);
    assert.equal(classifyExpense('Salary Advance'), null);
  });
});

describe('computeVehicleEconomics', () => {
  it('builds contribution and net profit from every line', () => {
    const r = computeVehicleEconomics(base({
      trips: [
        { id: 't1', vehicleId: 'A', driverIds: ['d1'], day: '2026-09-05', revenue: 10000, driverPay: 3000, distanceKm: 400 },
      ],
      costs: [
        { vehicleId: 'A', day: '2026-09-06', amount: 1500, line: 'fuel' },
        { vehicleId: 'A', day: '2026-09-07', amount: 500, line: 'maintenance' },
      ],
      salaries: [{ driverId: 'd1', monthly: 2000, fromDay: '2026-01-01', toDay: null }],
      vehicles: [vehicle('A', { purchasePrice: 300000, residualValue: 60000, usefulLifeYears: 5, purchaseDay: '2025-01-01',
        fixedCosts: [{ id: 'f1', category: 'Insurance', label: null, amount: 12000, frequency: 'Yearly', startDay: '2026-01-01', endDay: null }] })],
    }));
    const a = r.vehicles.get('A')!.totals;
    assert.equal(a.revenue, 10000);
    assert.equal(a.direct_costs, 5000);
    assert.equal(a.contribution, 5000);
    assert.equal(a.salary, 2000);
    assert.equal(a.depreciation, 4000); // (300k − 60k) / 60 months
    assert.equal(a.fixed_costs, 1000); // 12k yearly / 12
    assert.equal(a.net_profit, -2000);
    assert.equal(a.margin_percent, -20);
    assert.equal(a.contribution_percent, 50);
  });

  it('splits a driver salary across trucks by trips driven that month', () => {
    const r = computeVehicleEconomics(base({
      trips: [
        { id: 't1', vehicleId: 'A', driverIds: ['d1'], day: '2026-09-02', revenue: 0, driverPay: 0, distanceKm: 0 },
        { id: 't2', vehicleId: 'A', driverIds: ['d1'], day: '2026-09-03', revenue: 0, driverPay: 0, distanceKm: 0 },
        { id: 't3', vehicleId: 'B', driverIds: ['d1'], day: '2026-09-04', revenue: 0, driverPay: 0, distanceKm: 0 },
      ],
      salaries: [{ driverId: 'd1', monthly: 3000, fromDay: '2026-01-01', toDay: null }],
    }));
    assert.equal(r.vehicles.get('A')!.totals.salary, 2000);
    assert.equal(r.vehicles.get('B')!.totals.salary, 1000);
  });

  it('charges a co-driver salary to the truck too', () => {
    const r = computeVehicleEconomics(base({
      trips: [{ id: 't1', vehicleId: 'A', driverIds: ['d1', 'd2'], day: '2026-09-02', revenue: 0, driverPay: 0, distanceKm: 0 }],
      salaries: [
        { driverId: 'd1', monthly: 3000, fromDay: '2026-01-01', toDay: null },
        { driverId: 'd2', monthly: 2500, fromDay: '2026-01-01', toDay: null },
      ],
    }));
    assert.equal(r.vehicles.get('A')!.totals.salary, 5500);
  });

  it('falls back to the assigned truck, else reports the salary as unallocated', () => {
    const r = computeVehicleEconomics(base({
      salaries: [
        { driverId: 'd1', monthly: 3000, fromDay: '2026-01-01', toDay: null },
        { driverId: 'd2', monthly: 2000, fromDay: '2026-01-01', toDay: null },
      ],
      assignedVehicle: new Map([['d1', 'B']]),
    }));
    assert.equal(r.vehicles.get('B')!.totals.salary, 3000);
    assert.equal(r.vehicles.get('B')!.salaryShares[0].basis, 'assigned');
    assert.deepEqual(r.unallocatedSalary, [{ driverId: 'd2', month: '2026-09', amount: 2000 }]);
  });

  it('accrues time-based costs only up to today', () => {
    const r = computeVehicleEconomics(base({
      accrueTo: '2026-09-15',
      salaries: [{ driverId: 'd1', monthly: 3000, fromDay: '2026-01-01', toDay: null }],
      assignedVehicle: new Map([['d1', 'A']]),
    }));
    assert.equal(r.vehicles.get('A')!.totals.salary, 1500);
  });

  it('stops depreciation once the useful life is over', () => {
    const r = computeVehicleEconomics(base({
      vehicles: [vehicle('A', { purchasePrice: 120000, residualValue: 0, usefulLifeYears: 5, purchaseDay: '2021-01-01' })],
    }));
    assert.equal(r.vehicles.get('A')!.totals.depreciation, 0);
    assert.equal(r.vehicles.get('A')!.hasCostProfile, true);
  });

  it('gives an idle truck a null margin, not 0%', () => {
    const r = computeVehicleEconomics(base());
    assert.equal(r.vehicles.get('A')!.totals.margin_percent, null);
  });

  it('fills every month of the range in the monthly series', () => {
    const r = computeVehicleEconomics(base({
      from: '2026-07-01',
      trips: [{ id: 't1', vehicleId: 'A', driverIds: [], day: '2026-08-10', revenue: 900, driverPay: 0, distanceKm: 0 }],
    }));
    assert.deepEqual(r.vehicles.get('A')!.monthly.map((m) => [m.month, m.revenue]), [['2026-07', 0], ['2026-08', 900], ['2026-09', 0]]);
  });

  it('sums breakdowns into fleet totals with fresh percentages', () => {
    const r = computeVehicleEconomics(base({
      trips: [
        { id: 't1', vehicleId: 'A', driverIds: [], day: '2026-09-02', revenue: 1000, driverPay: 400, distanceKm: 0 },
        { id: 't2', vehicleId: 'B', driverIds: [], day: '2026-09-02', revenue: 3000, driverPay: 600, distanceKm: 0 },
      ],
    }));
    const fleet = sumBreakdowns([...r.vehicles.values()].map((v) => v.totals));
    assert.equal(fleet.revenue, 4000);
    assert.equal(fleet.net_profit, 3000);
    assert.equal(fleet.margin_percent, 75);
  });
});
