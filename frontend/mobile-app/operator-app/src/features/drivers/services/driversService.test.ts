import {
  driverFullName,
  driverInitials,
  driverLocationLabel,
  computeDriverStats,
  sortDrivers,
  toDriverListItem,
} from './driversService';
import type { DriverListItem, DriverStatus } from '../types';
import type { RawDriver } from '../api/driversApi';

function describe(name: string, fn: () => void) {
  fn();
}
function it(name: string, fn: () => void) {
  fn();
}
const assert = {
  equal: <T>(actual: T, expected: T, message?: string) => {
    if (actual !== expected) {
      throw new Error(`Assertion failed: ${String(actual)} !== ${String(expected)}. ${message ?? ''}`);
    }
  },
  deepEqual: <T>(actual: T, expected: T) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  },
};

describe('driversService pure functions', () => {
  describe('driverFullName', () => {
    it('concatenates first and last name', () => {
      assert.equal(driverFullName({ firstName: 'Ali', lastName: 'Hassan' }), 'Ali Hassan');
    });
  });

  describe('driverInitials', () => {
    it('returns uppercase first letters of first and last name', () => {
      assert.equal(driverInitials({ firstName: 'tariq', lastName: 'khan' }), 'TK');
    });

    it('handles empty names gracefully', () => {
      assert.equal(driverInitials({ firstName: '', lastName: 'Ahmed' }), 'A');
    });
  });

  describe('driverLocationLabel', () => {
    it('returns "En Route" when driver has an active trip', () => {
      assert.equal(
        driverLocationLabel({ activeTrip: { id: 't1', status: 'InTransit', vehiclePlate: 'ABC-1234' } }),
        'En Route',
      );
    });

    it('returns "Unknown" when driver has no active trip', () => {
      assert.equal(driverLocationLabel({ activeTrip: null }), 'Unknown');
    });
  });

  describe('computeDriverStats', () => {
    it('correctly aggregates driver statuses', () => {
      const drivers: { status: DriverStatus }[] = [
        { status: 'Available' },
        { status: 'Available' },
        { status: 'OnTrip' },
        { status: 'OffDuty' },
        { status: 'Inactive' },
      ];

      const stats = computeDriverStats(drivers);
      assert.deepEqual(stats, {
        totalDrivers: 5,
        online: 2,
        onTrip: 1,
        offline: 1,
        onLeave: 0,
        inactive: 1,
      });
    });

    it('handles empty driver array', () => {
      assert.deepEqual(computeDriverStats([]), {
        totalDrivers: 0,
        online: 0,
        onTrip: 0,
        offline: 0,
        onLeave: 0,
        inactive: 0,
      });
    });
  });

  describe('toDriverListItem', () => {
    it('maps raw driver object to DriverListItem shape', () => {
      const raw: RawDriver = {
        id: 'drv-1',
        ref_id: 'REF-001',
        first_name: 'Mohammed',
        last_name: 'Saeed',
        phone_primary: '+966501234567',
        status: 'OnTrip',
        license_number: 'LIC-999',
        license_expiry: '2027-12-31T00:00:00Z',
        avatar_url: 'https://example.com/avatar.jpg',
        createdAt: '2026-01-01T00:00:00Z',
        trips: [{ id: 'trp-1', status: 'InTransit', vehicle: { plate_number: 'XYZ-9876' } }],
        assignedVehicle: {
          id: 'v-1',
          ref_id: 'VREF-1',
          plate_number: 'XYZ-9876',
          asset_type: 'Flatbed',
          capacity_kg: 20000,
        },
      };

      const tripCountMap = new Map([['drv-1', 42]]);
      const item = toDriverListItem(raw, tripCountMap);

      assert.equal(item.id, 'drv-1');
      assert.equal(item.firstName, 'Mohammed');
      assert.equal(item.lastName, 'Saeed');
      assert.equal(item.avatarUrl, 'https://example.com/avatar.jpg');
      assert.equal(item.activeTrip?.id, 'trp-1');
      assert.equal(item.activeTrip?.vehiclePlate, 'XYZ-9876');
      assert.equal(item.totalTrips, 42);
    });
  });

  describe('sortDrivers', () => {
    const d1: DriverListItem = {
      id: '1',
      ref_id: null,
      firstName: 'Bander',
      lastName: 'Alharbi',
      phone: null,
      status: 'OffDuty',
      licenseNumber: 'L1',
      licenseExpiry: '2028-01-01',
      licenseDaysLeft: 500,
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      activeTrip: null,
      assignedVehicle: null,
      totalTrips: 10,
      monthlyPayout: null,
      nearestDocExpiry: null,
      docDaysLeft: null,
      rating: null,
    };

    const d2: DriverListItem = {
      id: '2',
      ref_id: null,
      firstName: 'Ahmad',
      lastName: 'Zahrani',
      phone: null,
      status: 'Available',
      licenseNumber: 'L2',
      licenseExpiry: '2028-01-01',
      licenseDaysLeft: 500,
      avatarUrl: null,
      createdAt: '2026-05-01T00:00:00Z',
      activeTrip: null,
      assignedVehicle: null,
      totalTrips: 50,
      monthlyPayout: null,
      nearestDocExpiry: null,
      docDaysLeft: null,
      rating: null,
    };

    it('sorts by name alphabetically', () => {
      const sorted = sortDrivers([d1, d2], 'name');
      assert.equal(sorted[0].id, '2'); // Ahmad comes before Bander
      assert.equal(sorted[1].id, '1');
    });

    it('sorts by newest creation date', () => {
      const sorted = sortDrivers([d1, d2], 'newest');
      assert.equal(sorted[0].id, '2'); // May 2026 comes before Jan 2026
    });

    it('sorts by total trips descending', () => {
      const sorted = sortDrivers([d1, d2], 'trips');
      assert.equal(sorted[0].id, '2'); // 50 trips comes before 10 trips
    });

    it('sorts by available status first', () => {
      const sorted = sortDrivers([d1, d2], 'available');
      assert.equal(sorted[0].id, '2'); // Available comes before OffDuty
    });
  });
});
