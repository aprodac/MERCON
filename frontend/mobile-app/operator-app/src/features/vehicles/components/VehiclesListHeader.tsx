import React from 'react';
import { Text } from 'react-native';
import { listPage } from '@/components/ListSearch';

/** The line immediately above the list: the total count. */
export function VehiclesListHeader({ total }: { total: number }) {
  return <Text style={listPage.count}>{total} {total === 1 ? 'vehicle' : 'vehicles'}</Text>;
}
