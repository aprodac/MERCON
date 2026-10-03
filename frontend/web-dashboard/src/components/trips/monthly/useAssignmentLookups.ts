import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ComboboxOption } from '@/components/ui/combobox';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { formatDriverDetails } from '@/utils/driverStatusUtils';

/**
 * Drivers and trucks to pick from when reassigning monthly trips. Shared by
 * the day-cell quick edit and the route ledger so both hit one cached lookup.
 */
export function useAssignmentLookups(enabled: boolean) {
  const { data: driversRes } = useQuery({
    queryKey: ['drivers-ledger-lookup'],
    queryFn: () => driverService.getAll({ per_page: 1000, mode: 'lookup' }),
    enabled,
  });

  const { data: vehiclesRes } = useQuery({
    queryKey: ['vehicles-ledger-lookup'],
    queryFn: () => vehicleService.getAll({ per_page: 1000, mode: 'lookup' }),
    enabled,
  });

  const rawDrivers = useMemo(() => driversRes?.data || [], [driversRes]);
  const rawVehicles = useMemo(() => vehiclesRes?.data || [], [vehiclesRes]);

  const driverOptions = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [
      { value: 'unassigned', label: '— Unassign Driver —', keywords: 'none unassign remove' },
    ];
    rawDrivers.forEach((d) => {
      const details = formatDriverDetails(d);
      const phoneStr = (d as any).phone || d.phone_primary || '';

      opts.push({
        value: d.id,
        label: `${d.first_name} ${d.last_name} (${details})`,
        keywords: `${d.first_name} ${d.last_name} ${phoneStr} ${details} ${d.status || ''}`,
      });
    });
    return opts;
  }, [rawDrivers]);

  const vehicleOptions = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [
      { value: 'unassigned', label: '— Unassign Vehicle —', keywords: 'none unassign remove' },
    ];
    rawVehicles.forEach((v) => {
      const capTon = v.capacity_kg ? (v.capacity_kg / 1000).toFixed(0) + 'T' : '';
      const typeStr = (v as any).type || v.asset_type || 'Truck';
      const meta = [typeStr, capTon].filter(Boolean).join(' · ');

      opts.push({
        value: v.id,
        label: meta ? `${v.plate_number} (${meta})` : v.plate_number,
        keywords: `${v.plate_number} ${typeStr} ${capTon}`,
      });
    });
    return opts;
  }, [rawVehicles]);

  return { rawDrivers, rawVehicles, driverOptions, vehicleOptions };
}
