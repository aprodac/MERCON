import React from 'react';
import * as Haptics from 'expo-haptics';
import { SortDropdown as BaseSortDropdown, type SortOption } from '@/shared/components';
import type { DriverSortOption } from '../types';

const OPTIONS: readonly SortOption<DriverSortOption>[] = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Highest Rating' },
  { value: 'trips', label: 'Most Trips' },
  { value: 'available', label: 'Available' },
  { value: 'online', label: 'Online' },
];

interface SortDropdownProps {
  value: DriverSortOption;
  onChange: (value: DriverSortOption) => void;
  className?: string;
}

/** Driver sort options, rendered by the shared dropdown. */
export function SortDropdown({ value, onChange, className }: SortDropdownProps) {
  const handleChange = (val: DriverSortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(val);
  };

  return <BaseSortDropdown value={value} options={OPTIONS} onChange={handleChange} className={className} />;
}
