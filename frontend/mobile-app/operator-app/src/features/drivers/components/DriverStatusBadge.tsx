import React from 'react';
import { Text, View } from 'react-native';
import { Colors, Radius } from '@mercon/mobile-shared/theme/tokens';
import type { DriverDisplayStatus } from '../types';

const META: Record<DriverDisplayStatus, { label: string; bg: string; color: string }> = {
  Available: { label: 'Available', bg: Colors.successLight, color: Colors.success },
  OnTrip:    { label: 'On Trip',   bg: Colors.accentLight,  color: Colors.accent },
  OffDuty:   { label: 'Offline',   bg: Colors.gray100,      color: Colors.gray500 },
  Inactive:  { label: 'Inactive',  bg: Colors.gray100,      color: Colors.gray500 },
  Suspended: { label: 'Suspended', bg: Colors.dangerLight,  color: Colors.danger },
  OnLeave:   { label: 'On Leave',  bg: Colors.infoLight,    color: Colors.info },
};

interface DriverStatusBadgeProps {
  status: DriverDisplayStatus;
  className?: string;
}

/** Status pill — color is automatic from the driver's status. */
export function DriverStatusBadge({ status, className }: DriverStatusBadgeProps) {
  const { label, bg, color } = META[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: Radius.full }} className={`self-start px-2.5 py-1 ${className ?? ''}`}>
      <Text style={{ color }} className="text-[11px] font-semibold">{label}</Text>
    </View>
  );
}
