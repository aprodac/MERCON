import React from 'react';
import { SlidersHorizontal } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';

interface QuotationsHeaderProps {
  onFilterPress?: () => void;
  onMenuPress?: () => void;
  filterActive?: boolean;
  className?: string;
}

/** The page's top bar: the shared AppTopBar with this page's filter button. */
export function QuotationsHeader({ onFilterPress, filterActive }: QuotationsHeaderProps) {
  return (
    <AppTopBar
      title="Quotations"
      actions={onFilterPress ? [{ icon: SlidersHorizontal, label: 'Filter', onPress: onFilterPress, active: filterActive }] : []}
    />
  );
}
