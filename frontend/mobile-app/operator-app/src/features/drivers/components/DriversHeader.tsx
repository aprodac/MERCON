import React from 'react';
import { SlidersHorizontal } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';

interface DriversHeaderProps {
  onSearchPress?: () => void;
  onFilterPress?: () => void;
  onMenuPress?: () => void;
  filterActive?: boolean;
  className?: string;
}

/** The page's top bar: the shared AppTopBar with this page's filter button. */
export function DriversHeader({ onFilterPress, filterActive }: DriversHeaderProps) {
  return (
    <AppTopBar
      title="Drivers"
      actions={onFilterPress ? [{ icon: SlidersHorizontal, label: 'Filter', onPress: onFilterPress, active: filterActive }] : []}
    />
  );
}
