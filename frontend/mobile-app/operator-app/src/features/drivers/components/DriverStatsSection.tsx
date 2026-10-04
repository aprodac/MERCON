import React from 'react';
import { FilterChips } from '@/components/FilterChips';
import { useDriverStats } from '../hooks';
import type { DriverStatus } from '../types';

interface DriverStatsSectionProps {
  /** The list's status filter — null is "all drivers". */
  status: DriverStatus | null;
  onSelect: (status: DriverStatus | null) => void;
}

/** The drivers list's status filter: one pill per status with its count; tap one to show only those drivers. */
export function DriverStatsSection({ status, onSelect }: DriverStatsSectionProps) {
  const stats = useDriverStats();
  const count = (n: number) => (stats.loading || stats.error ? '–' : n.toLocaleString());

  return (
    <FilterChips<DriverStatus | null>
      value={status}
      onChange={onSelect}
      items={[
        { key: null, label: 'All', count: count(stats.totalDrivers) },
        { key: 'Available', label: 'Available', count: count(stats.online), dot: '#1F9D55' },
        { key: 'OnTrip', label: 'On trip', count: count(stats.onTrip), dot: '#2F5FD0' },
        { key: 'OffDuty', label: 'Offline', count: count(stats.offline), dot: '#9898A4' },
      ]}
    />
  );
}
