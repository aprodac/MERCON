import React from 'react';
import { Text, View } from 'react-native';
import { SORT_LABEL } from './FilterBottomSheet';
import type { DriverSortOption } from '../types';

interface DriversListHeaderProps {
  total: number;
  sort: DriverSortOption;
  className?: string;
}

/** "31 drivers        Name A-Z" — sorting itself lives in the one filter sheet. */
export function DriversListHeader({ total, sort, className }: DriversListHeaderProps) {
  return (
    <View className={`flex-row items-baseline justify-between ${className ?? ''}`}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: '#18181B' }}>{total} {total === 1 ? 'driver' : 'drivers'}</Text>
      <Text style={{ fontSize: 13, color: '#6B6B76' }}>{SORT_LABEL[sort]}</Text>
    </View>
  );
}
