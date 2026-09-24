import React from 'react';
import { View } from 'react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { DriverDisplayStatus } from '../types';

const COLORS: Record<DriverDisplayStatus, string> = {
  Available: Colors.success,  // online — green
  OnTrip: Colors.accent,      // orange
  OffDuty: Colors.gray400,    // offline — grey
  Inactive: Colors.danger,    // unavailable — red
  Suspended: Colors.danger,
  OnLeave: Colors.info,
};

interface DriverStatusIndicatorProps {
  status: DriverDisplayStatus;
  size?: number;
  className?: string;
}

/** Bottom-right dot on DriverAvatar — green (online) / orange (on trip) / grey (offline) / red (unavailable). */
export function DriverStatusIndicator({ status, size = 14, className }: DriverStatusIndicatorProps) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS[status] }}
      className={`border-2 border-white ${className ?? ''}`}
    />
  );
}
