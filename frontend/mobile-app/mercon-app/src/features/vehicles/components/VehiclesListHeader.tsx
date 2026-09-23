import React from 'react';
import { Text, View } from 'react-native';
import { SortDropdown } from './SortDropdown';
import type { VehicleSortOption } from '../types';

interface VehiclesListHeaderProps {
  total: number;
  sort: VehicleSortOption;
  onSortChange: (sort: VehicleSortOption) => void;
  className?: string;
}

/** Header row sitting immediately above the list: total count on the left, sort dropdown on the right. */
export function VehiclesListHeader({ total, sort, onSortChange, className }: VehiclesListHeaderProps) {
  return (
    <View className={`flex-row items-center justify-between pt-1 ${className ?? ''}`}>
      <Text className="text-[13px] font-bold text-[#3E3C3D]">
        {total} {total === 1 ? 'vehicle' : 'vehicles'}
      </Text>
      <SortDropdown value={sort} onChange={onSortChange} />
    </View>
  );
}
