import React from 'react';
import { Plus, Scale } from 'lucide-react-native';
import { AppTopBar, type TopBarAction } from '@/components/AppTopBar';

/** The page's top bar: the shared AppTopBar with the rate finder and add buttons. */
export function QuotationsHeader({ onAddPress, onFinderPress }: { onAddPress?: () => void; onFinderPress?: () => void }) {
  const actions: TopBarAction[] = [];
  if (onFinderPress) actions.push({ icon: Scale, label: 'Rate finder', onPress: onFinderPress });
  if (onAddPress) actions.push({ icon: Plus, label: 'New quotation', onPress: onAddPress });
  return <AppTopBar title="Quotations" actions={actions} />;
}
