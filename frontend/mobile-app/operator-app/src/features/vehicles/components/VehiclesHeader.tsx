import React from 'react';
import { Plus } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';

/** The page's top bar: the shared AppTopBar with the add button. Status filtering lives in the pills below it. */
export function VehiclesHeader({ onAddPress }: { onAddPress?: () => void }) {
  return (
    <AppTopBar
      title="Vehicles"
      actions={onAddPress ? [{ icon: Plus, label: 'Add vehicle', onPress: onAddPress }] : []}
    />
  );
}
