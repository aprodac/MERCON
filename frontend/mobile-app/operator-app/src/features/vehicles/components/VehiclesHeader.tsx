import React from 'react';
import { Alert } from 'react-native';
import { Download, Plus } from 'lucide-react-native';
import { AppTopBar } from '@/components/AppTopBar';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { exportVehicles } from '@/lib/exportData';

/** The page's top bar: the shared AppTopBar with export (a spreadsheet through the share sheet) and the add button. Status filtering lives in the pills below it. */
export function VehiclesHeader({ onAddPress }: { onAddPress?: () => void }) {
  return (
    <AppTopBar
      title="Vehicles"
      actions={[
        { icon: Download, label: 'Export trucks', onPress: () => { exportVehicles().catch((e) => Alert.alert('Could not export', getApiErrorMessage(e))); } },
        ...(onAddPress ? [{ icon: Plus, label: 'Add vehicle', onPress: onAddPress }] : []),
      ]}
    />
  );
}
