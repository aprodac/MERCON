import React from 'react';
import * as Haptics from 'expo-haptics';
import { SortDropdown as BaseSortDropdown, type SortOption } from '@/shared/components';
import type { VehicleSortOption } from '../types';

const OPTIONS: readonly SortOption<VehicleSortOption>[] = [
  { value: 'plate', label: 'Plate Number' },
  { value: 'newest', label: 'Newest' },
  { value: 'available', label: 'Available' },
  { value: 'capacity', label: 'Capacity' },
  { value: 'odometer', label: 'Odometer' },
];

interface SortDropdownProps {
  value: VehicleSortOption;
  onChange: (value: VehicleSortOption) => void;
  className?: string;
}

/** Vehicle sort options, rendered by the shared dropdown. */
export function SortDropdown({ value, onChange, className }: SortDropdownProps) {
  const handleChange = (val: VehicleSortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(val);
  };

  return <BaseSortDropdown value={value} options={OPTIONS} onChange={handleChange} className={className} />;
}
