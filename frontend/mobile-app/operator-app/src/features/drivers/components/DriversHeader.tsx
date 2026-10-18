import React from 'react';
import { Alert } from 'react-native';
import { Download, Plus } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { exportDrivers } from '@/lib/exportData';

/** The page's top bar: the shared AppTopBar with export (a spreadsheet through the share sheet) and the add button. */
export function DriversHeader({ onAddPress }: { onAddPress?: () => void }) {
  return (
    <AppTopBar
      title="Drivers"
      actions={[
        { icon: Download, label: 'Export drivers', onPress: () => { exportDrivers().catch((e) => Alert.alert('Could not export', getApiErrorMessage(e))); } },
        ...(onAddPress ? [{ icon: Plus, label: 'Add driver', onPress: onAddPress }] : []),
      ]}
    />
  );
}
