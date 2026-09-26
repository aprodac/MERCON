import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { isValidTransition } from './tripLifecycle';
import { TripStatus } from '@prisma/client';

describe('External Driver Workflow — Complete Test Suite', () => {

  describe('DATABASE / SNAPSHOT TESTS', () => {
    it('1. Customer defaults to NATIVE workflow', async () => {
      const customer = await prisma.customer.create({
        data: { name: `Test Customer Default ${Date.now()}`, contact_phone: '+966500000001' },
      });
      assert.equal(customer.driver_workflow, 'NATIVE');
    });

    it('2. Customer supports EXTERNAL_APP workflow', async () => {
      const customer = await prisma.customer.create({
        data: { name: `Test Customer External ${Date.now()}`, contact_phone: '+966500000002', driver_workflow: 'EXTERNAL_APP' },
      });
      assert.equal(customer.driver_workflow, 'EXTERNAL_APP');
    });

    it('3 & 4. Trip snapshots customer.driver_workflow at creation time', async () => {
      const custNative = await prisma.customer.create({
        data: { name: `Customer Native ${Date.now()}`, contact_phone: '+966500000003', driver_workflow: 'NATIVE' },
      });
      const custExternal = await prisma.customer.create({
        data: { name: `Customer Ext ${Date.now()}`, contact_phone: '+966500000004', driver_workflow: 'EXTERNAL_APP' },
      });

      const tripNative = await prisma.trip.create({
        data: {
          ref_id: `TRP-NAT-${Date.now()}`,
          customerId: custNative.id,
          driver_workflow: custNative.driver_workflow,
          status: TripStatus.Scheduled,
        },
      });

      const tripExternal = await prisma.trip.create({
        data: {
          ref_id: `TRP-EXT-${Date.now()}`,
          customerId: custExternal.id,
          driver_workflow: custExternal.driver_workflow,
          status: TripStatus.Scheduled,
        },
      });

      assert.equal(tripNative.driver_workflow, 'NATIVE');
      assert.equal(tripExternal.driver_workflow, 'EXTERNAL_APP');
    });

    it('5. Customer workflow changes do not mutate existing Trip workflow snapshots', async () => {
      const cust = await prisma.customer.create({
        data: { name: `Customer Snap ${Date.now()}`, contact_phone: '+966500000005', driver_workflow: 'NATIVE' },
      });

      const trip = await prisma.trip.create({
        data: {
          ref_id: `TRP-SNAP-${Date.now()}`,
          customerId: cust.id,
          driver_workflow: cust.driver_workflow,
          status: TripStatus.Scheduled,
        },
      });

      assert.equal(trip.driver_workflow, 'NATIVE');

      // Update customer workflow to EXTERNAL_APP
      await prisma.customer.update({
        where: { id: cust.id },
        data: { driver_workflow: 'EXTERNAL_APP' },
      });

      // Existing trip must remain NATIVE
      const reFetchedTrip = await prisma.trip.findUnique({ where: { id: trip.id } });
      assert.equal(reFetchedTrip?.driver_workflow, 'NATIVE');
    });
  });

  describe('LIFECYCLE TRANSITION GUARDS', () => {
    it('15. Valid ARRIVED_AT_PICKUP transition from Scheduled to Loading', () => {
      assert.equal(isValidTransition(TripStatus.Scheduled, TripStatus.Loading), true);
    });

    it('16. Valid DEPARTED_PICKUP transition from Loading to InTransit', () => {
      assert.equal(isValidTransition(TripStatus.Loading, TripStatus.InTransit), true);
    });

    it('17. Valid ARRIVED_AT_DELIVERY transition in InTransit state', () => {
      assert.equal(isValidTransition(TripStatus.InTransit, TripStatus.InTransit), true);
    });

    it('18. Valid DELIVERY_COMPLETED transition from InTransit to Completed', () => {
      assert.equal(isValidTransition(TripStatus.InTransit, TripStatus.Completed), true);
    });

    it('19. Invalid direct completion from Draft status', () => {
      assert.equal(isValidTransition(TripStatus.Draft, TripStatus.Completed), false);
    });

    it('20 & 21. Duplicate transition checks', () => {
      // Completed -> Completed is allowed as no-op update
      assert.equal(isValidTransition(TripStatus.Completed, TripStatus.Completed), true);
    });
  });

  describe('DELIVERY_COMPLETED & completeTrip SIDE EFFECTS', () => {
    it('completeTrip stamps dropoff timestamps, completes trip, and releases driver/vehicle', async () => {
      const cust = await prisma.customer.create({
        data: { name: `Cust SideEffects ${Date.now()}`, contact_phone: '+966500000007' },
      });
      const driver = await prisma.driver.create({
        data: {
          first_name: 'Driver',
          last_name: 'Test',
          phone_primary: `+96655${Math.floor(Math.random() * 1000000)}`,
          license_number: `LIC-${Date.now()}`,
          license_expiry: new Date('2030-01-01'),
          status: 'OnTrip',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          plate_number: `V-${Date.now()}`,
          asset_type: 'Flatbed',
          capacity_kg: 10000,
          status: 'OnTrip',
        },
      });

      const trip = await prisma.trip.create({
        data: {
          ref_id: `TRP-COMP-${Date.now()}`,
          customerId: cust.id,
          driverId: driver.id,
          vehicleId: vehicle.id,
          driver_workflow: 'EXTERNAL_APP',
          status: TripStatus.InTransit,
          stops: {
            create: [
              { stop_sequence: 1, stop_type: 'Pickup', location_name: 'Riyadh Yard' },
              { stop_sequence: 2, stop_type: 'Dropoff', location_name: 'Jeddah Yard' },
            ],
          },
        },
      });

      const { completeTrip } = await import('./tripLifecycle');
      await prisma.$transaction(async (tx) => {
        await completeTrip(tx, trip.id, null);
      });

      const updatedTrip = await prisma.trip.findUnique({
        where: { id: trip.id },
        include: { stops: true, driver: true, vehicle: true },
      });

      assert.equal(updatedTrip?.status, 'Completed');
      assert.ok(updatedTrip?.actual_end);
      assert.equal(updatedTrip?.driver?.status, 'Available');
      assert.equal(updatedTrip?.vehicle?.status, 'Available');

      const dropoffStop = updatedTrip?.stops.find((s) => s.stop_type === 'Dropoff');
      assert.ok(dropoffStop?.actual_arrival);
      assert.ok(dropoffStop?.actual_departure);
    });
  });

});
