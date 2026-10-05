import React from 'react';
import { Plus } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';

/** The page's top bar: the shared AppTopBar with the add button. */
export function DriversHeader({ onAddPress }: { onAddPress?: () => void }) {
  return (
    <AppTopBar
      title="Drivers"
      actions={onAddPress ? [{ icon: Plus, label: 'Add driver', onPress: onAddPress }] : []}
    />
  );
}
