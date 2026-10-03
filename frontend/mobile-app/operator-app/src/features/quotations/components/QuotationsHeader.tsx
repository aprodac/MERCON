import React from 'react';
import { Plus } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';

/** The page's top bar: the shared AppTopBar with the add button. */
export function QuotationsHeader({ onAddPress }: { onAddPress?: () => void }) {
  return (
    <AppTopBar
      title="Quotations"
      actions={onAddPress ? [{ icon: Plus, label: 'New quotation', onPress: onAddPress }] : []}
    />
  );
}
