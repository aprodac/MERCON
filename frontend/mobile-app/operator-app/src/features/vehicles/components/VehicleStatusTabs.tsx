import React from 'react';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { FilterChips } from '@/components/FilterChips';
import { useVehicleStats } from '../hooks';
import type { AssetStatus } from '../types';

interface VehicleStatusTabsProps {
  value: AssetStatus | null;
  onChange: (status: AssetStatus | null) => void;
}

/** Fleet status summary: each pill shows its live count and filters the list when tapped. */
export function VehicleStatusTabs({ value, onChange }: VehicleStatusTabsProps) {
  const stats = useVehicleStats();
  const count = (n: number) => (stats.loading || stats.error ? '–' : n.toLocaleString());

  return (
    <FilterChips<AssetStatus | null>
      value={value}
      onChange={onChange}
      items={[
        { key: null, label: 'All', count: count(stats.totalVehicles) },
        { key: 'Available', label: 'Available', count: count(stats.available), dot: Colors.success },
        { key: 'OnTrip', label: 'On trip', count: count(stats.onTrip), dot: Colors.primary },
        { key: 'Maintenance', label: 'Maintenance', count: count(stats.maintenance), dot: Colors.warning },
      ]}
    />
  );
}
