import React from 'react';
import { Alert } from 'react-native';
import { MoreHorizontal, Plus, Scale } from 'lucide-react-native';
import { AppTopBar, type TopBarAction } from '@/components/AppTopBar';

/** The page's top bar: the shared AppTopBar with the rate finder, add and ⋯ (Remove driver payouts) buttons. */
export function QuotationsHeader({ onAddPress, onFinderPress, onRemovePayouts }: { onAddPress?: () => void; onFinderPress?: () => void; onRemovePayouts?: () => void }) {
  const actions: TopBarAction[] = [];
  if (onFinderPress) actions.push({ icon: Scale, label: 'Rate finder', onPress: onFinderPress });
  if (onAddPress) actions.push({ icon: Plus, label: 'New quotation', onPress: onAddPress });
  if (onRemovePayouts) {
    actions.push({
      icon: MoreHorizontal,
      label: 'More',
      onPress: () => Alert.alert('Quotations', undefined, [{ text: 'Remove driver payouts…', style: 'destructive', onPress: onRemovePayouts }, { text: 'Cancel', style: 'cancel' }]),
    });
  }
  return <AppTopBar title="Quotations" actions={actions} />;
}
