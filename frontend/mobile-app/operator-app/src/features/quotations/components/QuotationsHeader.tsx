import React from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';

interface QuotationsHeaderProps {
  onFilterPress?: () => void;
  onAddPress?: () => void;
  onMenuPress?: () => void;
  filterActive?: boolean;
  className?: string;
}

/** The page's top bar: the shared AppTopBar with this page's add and filter buttons. */
export function QuotationsHeader({ onFilterPress, onAddPress, filterActive }: QuotationsHeaderProps) {
  return (
    <AppTopBar
      title="Quotations"
      actions={[
        ...(onAddPress ? [{ icon: Plus, label: 'New quotation', onPress: onAddPress }] : []),
        ...(onFilterPress ? [{ icon: SlidersHorizontal, label: 'Filter', onPress: onFilterPress, active: filterActive }] : []),
      ]}
    />
  );
}
