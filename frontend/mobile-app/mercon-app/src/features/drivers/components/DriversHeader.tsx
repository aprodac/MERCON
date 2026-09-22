import React from 'react';
import { Text, View } from 'react-native';
import { SearchButton } from './SearchButton';
import { FilterButton } from './FilterButton';

interface DriversHeaderProps {
  onSearchPress?: () => void;
  onFilterPress?: () => void;
  filterActive?: boolean;
  className?: string;
}

/** Fixed (non-scrolling) page header: title + subtitle on the left, search/filter icon buttons on the right. */
export function DriversHeader({ onFilterPress, filterActive, className }: DriversHeaderProps) {
  return (
    <View className={`flex-row items-center justify-between bg-white px-4 pb-3 pt-3 border-b border-[#EEF1F6] ${className ?? ''}`}>
      <View className="gap-0.5">
        <Text className="text-[24px] font-extrabold leading-[28px] text-[#3E3C3D]">Drivers</Text>
        <Text className="text-[12px] font-medium text-gray-500">Fleet drivers & active assignments</Text>
      </View>
      <View className="flex-row items-center">
        <FilterButton onPress={onFilterPress} active={filterActive} />
      </View>
    </View>
  );
}
