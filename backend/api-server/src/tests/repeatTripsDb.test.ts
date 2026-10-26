/** Needs a database (DATABASE_URL). Repeats trips through the real create-trip path. */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { repeatTrips } from '../controllers/tripRepeatController';

const tag = `rpt${Date.now()}`;
const future = (days: number, h: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(h, 0, 0, 0); return d; };
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

let customerId = '', driverA = '', driverB = '', truckA = '', truckB = '';
const made: string[] = [];

async function sourceTrip(driverId: string, vehicleId: string, start: Date, o: { status?: any; payout?: number } = {}) {
  const t = await prisma.trip.create({
    data: {
      customerId, driverId, vehicleId, status: o.status ?? 'Completed', planned_start: start, planned_end: new Date(start.getTime() + 4 * 3_600_000),
      vehicle_type: '5 TON', billing_amount: 1000, driver_payout: o.payout ?? 250,
      stops: { create: [
        { stop_sequence: 1, leg_index: 0, stop_type: 'Pickup', location_name: 'Khamis', location_lat: 18.3, location_lng: 42.7, planned_arrival: start },
        { stop_sequence: 2, leg_index: 0, stop_type: 'Dropoff', location_name: 'Najran', location_lat: 17.5, location_lng: 44.1, planned_arrival: new Date(start.getTime() + 4 * 3_600_000) },
      ] },
      charges: { create: [{ charge_type: 'Waiting', rate: 50, quantity: 2, amount: 100 }] },
    },
  });
  made.push(t.id);
  return t;
}

async function run(body: any): Promise<any> {
  let out: any;
  await repeatTrips({ user: { id: '00000000-0000-0000-0000-000000000000' }, body: { shift_minutes: 0, create_anyway_ids: [], ...body } } as any, { json: (p: any) => { out = p; }, status() { return this; } } as any);
  assert.equal(out.success, true, JSON.stringify(out));
  return out.data;
}

describe('repeat trips (database)', () => {
  before(async () => {
    customerId = (await prisma.customer.create({ data: { name: `${tag} Co`, contact_phone: '0500000000' } })).id;
    const mk = (n: string) => prisma.driver.create({ data: { first_name: n, last_name: tag, license_number: `1${Math.floor(Math.random() * 1e9)}`.slice(0, 10), license_expiry: future(400, 0) } });
    driverA = (await mk('Ali')).id; driverB = (await mk('Bader')).id;
    const tk = (p: string) => prisma.vehicle.create({ data: { plate_number: `${tag}-${p}`, asset_type: 'Box', capacity_kg: 5000 } });
    truckA = (await tk('A')).id; truckB = (await tk('B')).id;
  });

  after(async () => {
    const trips = await prisma.trip.findMany({ where: { customerId }, select: { id: true } });
    const ids = trips.map((t) => t.id);
    await prisma.tripCharge.deleteMany({ where: { tripId: { in: ids } } });
    await prisma.tripStop.deleteMany({ where: { tripId: { in: ids } } });
    await prisma.tripFinancials.deleteMany({ where: { tripId: { in: ids } } });
    await prisma.trip.deleteMany({ where: { id: { in: ids } } });
    await prisma.driver.deleteMany({ where: { id: { in: [driverA, driverB] } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [truckA, truckB] } } });
    await prisma.location.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('copies a day onto another day with the same fields, and skips cancelled trips', async () => {
    const a = await sourceTrip(driverA, truckA, future(-3, 5));
    const b = await sourceTrip(driverB, truckB, future(-3, 6));
    const cancelled = await sourceTrip(driverB, truckB, future(-3, 15), { status: 'Cancelled' });
    const target = future(10, 0);
    const r = await run({ trip_ids: [a.id, b.id, cancelled.id], target_date: dayOf(target) });
    assert.equal(r.summary.text, '2 created, 1 skipped (The trip was cancelled)');
    const created = r.results.filter((x: any) => x.status === 'created');
    const copy = await prisma.trip.findUniqueOrThrow({ where: { id: created[0].new_trip_id }, include: { stops: { orderBy: { stop_sequence: 'asc' } }, charges: true } });
    made.push(...created.map((c: any) => c.new_trip_id));
    assert.equal(copy.status, 'Scheduled');
    assert.equal(copy.customerId, customerId);
    assert.equal(copy.driverId, driverA);
    assert.equal(copy.vehicleId, truckA);
    assert.equal(Number(copy.driver_payout), 250);
    assert.equal(Number(copy.billing_amount), 1000);
    assert.equal(copy.planned_start!.toISOString(), (() => { const d = new Date(target); d.setUTCHours(5); return d.toISOString(); })());
    assert.deepEqual(copy.stops.map((s) => s.location_name), ['Khamis', 'Najran']);
    assert.equal(copy.charges.length, 1);
  });

  it('flags a double booking, and creates it anyway when told to', async () => {
    const src = await sourceTrip(driverA, truckA, future(-2, 5));
    const target = future(10, 0); // driver A is already on the copy made above at 05:00
    const first = await run({ trip_ids: [src.id], target_date: dayOf(target) });
    assert.equal(first.results[0].status, 'clash');
    assert.equal(first.results[0].clashes[0].kind, 'double_booking');
    const again = await run({ trip_ids: [src.id], target_date: dayOf(target), create_anyway_ids: [src.id] });
    assert.equal(again.results[0].status, 'created');
    made.push(again.results[0].new_trip_id);
  });

  it('flags too little rest and a second trip that day', async () => {
    const src = await sourceTrip(driverB, truckB, future(-1, 12)); // 12:00–16:00
    const target = future(20, 0);
    const prior = await sourceTrip(driverB, truckB, new Date(target.getTime() + 5 * 3_600_000), { status: 'Scheduled' }); // 05:00–09:00 that day
    const r = await run({ trip_ids: [src.id], target_date: dayOf(target) });
    assert.equal(r.results[0].status, 'clash');
    const kinds = r.results[0].clashes.map((c: any) => c.kind);
    assert.ok(kinds.includes('same_day'), kinds.join());
    assert.ok(prior.id);
  });

  it('skips a date in the past', async () => {
    const src = await sourceTrip(driverA, truckA, future(-1, 8));
    const r = await run({ trip_ids: [src.id], target_date: dayOf(future(-5, 0)) });
    assert.equal(r.results[0].status, 'skipped');
    assert.match(r.results[0].reason, /passed/);
  });
});
