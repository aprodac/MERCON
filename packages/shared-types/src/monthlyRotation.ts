/**
 * Pure monthly duty rotation strategy & round-robin driver/vehicle cycling helpers.
 */

export interface DayAssignment {
  driverId: string;
  vehicleId: string;
  coDriverId?: string;
  coDriverPayout?: number;
  isCustom?: boolean;
}

export type MonthlyStrategyMode = 'single' | 'rotation' | 'per_day';

export function applyMonthlyAssignmentStrategy(params: {
  mode: MonthlyStrategyMode;
  rotationCount: 2 | 3 | 4;
  selectedDates: string[]; // e.g. ["2026-09-01", "2026-09-02", ...]
  rotationDrivers: string[]; // array of driver IDs for 4 slots
  rotationVehicles: string[]; // array of vehicle IDs for 4 slots
  masterDriver?: string;
  masterVehicle?: string;
  existingDayAssignments?: Record<string, DayAssignment>;
}): Record<string, DayAssignment> {
  const { mode, rotationCount, selectedDates, rotationDrivers, rotationVehicles, masterDriver = '', masterVehicle = '', existingDayAssignments = {} } = params;

  if (!selectedDates || selectedDates.length === 0) {
    return {};
  }

  // Sort operating dates chronologically
  const sortedDates = [...selectedDates].sort();
  const newAssignments: Record<string, DayAssignment> = {};

  if (mode === 'single' || mode === 'per_day') {
    const pDriver = rotationDrivers[0] || masterDriver;
    const pVehicle = rotationVehicles[0] || masterVehicle;
    sortedDates.forEach((dateStr) => {
      // Preserve custom per-day override if present in per_day mode
      if (mode === 'per_day' && existingDayAssignments[dateStr]?.isCustom) {
        newAssignments[dateStr] = existingDayAssignments[dateStr];
      } else {
        newAssignments[dateStr] = {
          driverId: pDriver,
          vehicleId: pVehicle,
          isCustom: false,
        };
      }
    });
  } else {
    // Rotation Mode: Round-robin index calculation
    const activeDrivers = rotationDrivers.slice(0, rotationCount);
    const activeVehicles = rotationVehicles.slice(0, rotationCount);

    sortedDates.forEach((dateStr, idx) => {
      // Preserve custom manual override if user explicitly overrode this date
      if (existingDayAssignments[dateStr]?.isCustom) {
        newAssignments[dateStr] = existingDayAssignments[dateStr];
      } else {
        const assignedD = activeDrivers[idx % rotationCount] || masterDriver;
        const assignedV = activeVehicles[idx % rotationCount] || masterVehicle;
        newAssignments[dateStr] = {
          driverId: assignedD,
          vehicleId: assignedV,
          isCustom: false,
        };
      }
    });
  }

  return newAssignments;
}

export function duplicateFirstDayAssignmentsToAll(
  selectedDates: string[],
  currentAssignments: Record<string, DayAssignment>
): Record<string, DayAssignment> {
  if (!selectedDates || selectedDates.length === 0) return currentAssignments;
  const sorted = [...selectedDates].sort();
  const firstDate = sorted[0];
  const firstAssignment = currentAssignments[firstDate];
  if (!firstAssignment) return currentAssignments;

  const updated: Record<string, DayAssignment> = {};
  selectedDates.forEach((dateStr) => {
    updated[dateStr] = {
      ...firstAssignment,
      isCustom: true,
    };
  });
  return updated;
}
