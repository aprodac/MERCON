import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Menu } from 'lucide-react-native';
import { FilterButton } from './FilterButton';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

interface DriversHeaderProps {
  onSearchPress?: () => void;
  onFilterPress?: () => void;
  onMenuPress?: () => void;
  filterActive?: boolean;
  className?: string;
}

/** Fixed (non-scrolling) page header: title + subtitle on the left, search/filter icon buttons on the right. */
export function DriversHeader({ onFilterPress, onMenuPress, filterActive, className }: DriversHeaderProps) {
  return (
    <View className={`flex-row items-center justify-between bg-white px-4 pb-3 pt-3 border-b border-[#EEF1F6] ${className ?? ''}`}>
      <View className="gap-0.5">
        <Text className="text-[24px] font-extrabold leading-[28px] text-[#3E3C3D]">Drivers</Text>
        <Text className="text-[12px] font-medium text-gray-500">Fleet drivers & active assignments</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <FilterButton onPress={onFilterPress} active={filterActive} />
        {onMenuPress && (
          <TouchableOpacity
            onPress={onMenuPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open sidebar menu"
            className="h-10 w-10 items-center justify-center rounded-xl bg-[#EEF1F6]"
          >
            <Menu size={18} color={Colors.charcoal} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
