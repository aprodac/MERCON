import React from 'react';
import { View } from 'react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { DriverDisplayStatus } from '../types';

/** Free → green · busy on a trip (loading, pickup, delivery) → yellow · offline / unavailable → red. */
const COLORS: Record<DriverDisplayStatus, string> = {
  Available: '#16A34A',
  OnTrip: '#EAB308',
  OffDuty: '#DC2626',
  Inactive: '#DC2626',
  Suspended: '#DC2626',
  OnLeave: '#DC2626',
};

interface DriverStatusIndicatorProps {
  status: DriverDisplayStatus;
  size?: number;
  className?: string;
}

/** Bottom-right dot on DriverAvatar — green (available) / yellow (on a trip) / red (offline or unavailable). */
export function DriverStatusIndicator({ status, size = 14, className }: DriverStatusIndicatorProps) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS[status] }}
      className={`border-2 border-white ${className ?? ''}`}
    />
  );
}
