import type { Driver, DriverStatus } from '@/services/driverService';

/** The status to show and filter by: on a running trip wins; a stale "OnTrip" flag with no trip is Available. */
export function dutyStatusOf(d: Pick<Driver, 'status' | 'duty'>): DriverStatus {
  if (!d.duty) return d.status;
  if (d.duty.on_trip) return 'OnTrip';
  return d.status === 'OnTrip' ? 'Available' : d.status;
}
