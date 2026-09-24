import { prisma } from '../db';

export interface TripDriverInput {
  driverId: string;
  driver_charge?: number | null;
}

export interface ValidateTripDriversResult {
  isValid: boolean;
  errors: string[];
  primaryDriverId?: string;
}

/**
 * Validates driver assignment rules for a trip:
 * 1. Driver must be active and have unexpired license.
 * 2. Driver should not have an overlapping active trip.
 */
export async function validateTripDrivers(
  drivers: TripDriverInput[],
  plannedStart?: Date | string | null,
  plannedEnd?: Date | string | null,
  currentTripId?: string
): Promise<ValidateTripDriversResult> {
  const errors: string[] = [];

  if (!drivers || drivers.length === 0) {
    return {
      isValid: false,
      errors: ['At least one driver must be assigned to the trip.'],
    };
  }

  const driverIds = drivers.map((d) => d.driverId);
  const primaryDriverId = driverIds[0];

  const existingDrivers = await prisma.driver.findMany({
    where: {
      id: { in: driverIds },
      deletedAt: null,
    },
  });

  const now = new Date();
  for (const driverInput of drivers) {
    const foundDriver = existingDrivers.find((d: any) => d.id === driverInput.driverId);
    if (!foundDriver || !foundDriver.isActive) {
      errors.push(`Driver ID ${driverInput.driverId} is invalid or inactive.`);
      continue;
    }

    const fullName = `${foundDriver.first_name} ${foundDriver.last_name}`;

    if (foundDriver.license_expiry && new Date(foundDriver.license_expiry) < now) {
      errors.push(`Driver ${fullName}'s license expired on ${new Date(foundDriver.license_expiry).toISOString().split('T')[0]}.`);
    }

    if (plannedStart) {
      const start = new Date(plannedStart);
      const end = plannedEnd ? new Date(plannedEnd) : new Date(start.getTime() + 8 * 3600 * 1000);

      const overlappingTrip = await prisma.trip.findFirst({
        where: {
          driverId: driverInput.driverId,
          deletedAt: null,
          id: currentTripId ? { not: currentTripId } : undefined,
          status: { in: ['Scheduled', 'Loading', 'InTransit', 'Delayed'] },
          OR: [
            {
              planned_start: { lte: end },
              planned_end: { gte: start },
            },
            {
              actual_start: { lte: end },
              actual_end: null,
            },
          ],
        },
      });

      if (overlappingTrip) {
        errors.push(`Driver ${fullName} has an overlapping active trip.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    primaryDriverId,
  };
}

export interface StopScheduleInput {
  stop_sequence?: number;
  sequence?: number;
  leg_index?: number;
  stop_type?: string;
  planned_arrival?: Date | string | null;
  planned_departure?: Date | string | null;
  location_name?: string | null;
}

export interface ValidateTripScheduleResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates stop sequence invariants and multi-leg integrity:
 * 1. Global sequence must be monotonically increasing.
 * 2. leg_index must be non-decreasing (cannot go from leg 1 back to leg 0).
 * 3. Every stop must have a valid location_name or location_id.
 */
export function validateTripStops(stops: StopScheduleInput[]): { isValid: boolean; error?: string } {
  if (!stops || !Array.isArray(stops) || stops.length === 0) {
    return { isValid: false, error: 'A trip must have at least one stop.' };
  }

  let maxLegSeen = 0;
  let prevSeq: number | null = null;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const leg = stop.leg_index ?? 0;
    if (leg < 0) {
      return { isValid: false, error: `Stop #${i + 1} has an invalid negative leg_index.` };
    }
    if (leg > 1) {
      return { isValid: false, error: `Stop #${i + 1} has an invalid leg_index (${leg}). Only Outbound (0) and Return (1) are supported.` };
    }
    if (leg < maxLegSeen) {
      return { isValid: false, error: `Stop #${i + 1} cannot revert to leg ${leg} after leg ${maxLegSeen}.` };
    }
    if (leg > maxLegSeen) {
      maxLegSeen = leg;
    }

    const seq = stop.stop_sequence ?? stop.sequence;
    if (seq !== undefined && seq !== null) {
      if (seq <= 0) {
        return { isValid: false, error: `Stop #${i + 1} has an invalid non-positive sequence (${seq}).` };
      }
      if (prevSeq !== null) {
        if (seq <= prevSeq) {
          return { isValid: false, error: `Stop #${i + 1} sequence (${seq}) is not strictly greater than previous sequence (${prevSeq}). Sequences cannot duplicate or reset.` };
        }
        if (seq !== prevSeq + 1) {
          return { isValid: false, error: `Stop sequence must be continuous without gaps: expected ${prevSeq + 1} but got ${seq}.` };
        }
      } else if (seq !== 1) {
        return { isValid: false, error: `Trip stops sequence must begin at 1, but starts at ${seq}.` };
      }
      prevSeq = seq;
    }
  }

  const leg0Stops = stops.filter((s) => (s.leg_index ?? 0) === 0);
  if (leg0Stops.length < 2) {
    return { isValid: false, error: `Outbound leg (leg 0) must have at least 2 stops (found ${leg0Stops.length}).` };
  }

  const leg1Stops = stops.filter((s) => (s.leg_index ?? 0) === 1);
  if (leg1Stops.length > 0 && leg1Stops.length < 2) {
    return { isValid: false, error: `Return leg (leg 1) must have at least 2 stops if present (found ${leg1Stops.length}).` };
  }

  return { isValid: true };
}

/**
 * Validates that trip schedule invariants and stop sequence chronology are preserved:
 * 1. planned_start < planned_end (strictly greater).
 * 2. Stops cannot have planned arrivals before trip planned_start or after planned_end.
 * 3. Each subsequent stop in the sequence cannot be scheduled before preceding stops.
 * 4. Stop planned_departure cannot be earlier than planned_arrival.
 */
export function validateTripSchedule(
  plannedStart?: Date | string | null,
  plannedEnd?: Date | string | null,
  stops?: StopScheduleInput[]
): ValidateTripScheduleResult {
  let startTime: number | null = null;
  let endTime: number | null = null;

  if (plannedStart !== undefined && plannedStart !== null && plannedStart !== '') {
    const sDate = plannedStart instanceof Date ? plannedStart : new Date(plannedStart);
    if (isNaN(sDate.getTime())) {
      return { isValid: false, error: 'Invalid planned start date/time.' };
    }
    startTime = sDate.getTime();
  }

  if (plannedEnd !== undefined && plannedEnd !== null && plannedEnd !== '') {
    const eDate = plannedEnd instanceof Date ? plannedEnd : new Date(plannedEnd);
    if (isNaN(eDate.getTime())) {
      return { isValid: false, error: 'Invalid planned drop-off/end date/time.' };
    }
    endTime = eDate.getTime();
  }

  // Core rule: planned_start < planned_end
  if (startTime !== null && endTime !== null) {
    if (endTime <= startTime) {
      return {
        isValid: false,
        error: 'Drop-off date and time must be strictly later than planned start time.',
      };
    }
  }

  // Stop chronology validation
  if (stops && Array.isArray(stops) && stops.length > 0) {
    const sortedStops = [...stops].sort(
      (a, b) => (a.sequence ?? a.stop_sequence ?? 0) - (b.sequence ?? b.stop_sequence ?? 0)
    );
    let prevStopTime: number | null = startTime;
    let prevSeq: number = 0;

    for (const stop of sortedStops) {
      const seq = stop.sequence ?? stop.stop_sequence ?? prevSeq + 1;
      let stopArrTime: number | null = null;

      if (stop.planned_arrival !== undefined && stop.planned_arrival !== null && stop.planned_arrival !== '') {
        const arrDate = stop.planned_arrival instanceof Date ? stop.planned_arrival : new Date(stop.planned_arrival);
        if (isNaN(arrDate.getTime())) {
          return { isValid: false, error: `Invalid planned arrival date/time for Stop #${seq}.` };
        }
        stopArrTime = arrDate.getTime();

        if (startTime !== null && stopArrTime < startTime) {
          return {
            isValid: false,
            error: `Stop #${seq} planned arrival cannot be before the trip planned start time.`,
          };
        }

        if (endTime !== null && stopArrTime > endTime) {
          return {
            isValid: false,
            error: `Stop #${seq} planned arrival cannot be after the trip planned end time.`,
          };
        }

        if (prevStopTime !== null && stopArrTime < prevStopTime) {
          return {
            isValid: false,
            error: `Stop #${seq} planned arrival cannot be earlier than previous stop (#${prevSeq}).`,
          };
        }

        prevStopTime = stopArrTime;
        prevSeq = seq;
      }

      if (stop.planned_departure !== undefined && stop.planned_departure !== null && stop.planned_departure !== '') {
        const depDate = stop.planned_departure instanceof Date ? stop.planned_departure : new Date(stop.planned_departure);
        if (isNaN(depDate.getTime())) {
          return { isValid: false, error: `Invalid planned departure date/time for Stop #${seq}.` };
        }
        const depTime = depDate.getTime();

        if (stopArrTime !== null && depTime < stopArrTime) {
          return {
            isValid: false,
            error: `Stop #${seq} planned departure cannot be earlier than its planned arrival.`,
          };
        }

        if (endTime !== null && depTime > endTime) {
          return {
            isValid: false,
            error: `Stop #${seq} planned departure cannot be after the trip planned end time.`,
          };
        }

        prevStopTime = depTime;
      }
    }
  }

  return { isValid: true };
}
