import React from 'react';
import { Text, View } from 'react-native';
import { SortDropdown } from './SortDropdown';
import type { QuotationSortOption } from '../types';

interface QuotationsListHeaderProps {
  total: number;
  sort: QuotationSortOption;
  onSortChange: (sort: QuotationSortOption) => void;
  className?: string;
}

export function QuotationsListHeader({ total, sort, onSortChange, className }: QuotationsListHeaderProps) {
  return (
    <View className={`flex-row items-center justify-between pt-1 ${className ?? ''}`}>
      <Text className="text-[13px] font-bold text-[#3E3C3D]">
        {total} {total === 1 ? 'quotation' : 'quotations'}
      </Text>
      <SortDropdown value={sort} onChange={onSortChange} />
    </View>
  );
}
