import React from 'react';
import { Text, View } from 'react-native';
import { Colors, Radius } from '@/theme/tokens';
import type { AssetStatus } from '../types';

const META: Record<AssetStatus, { label: string; bg: string; color: string }> = {
  Available:   { label: 'Available',   bg: Colors.successLight, color: Colors.success },
  OnTrip:      { label: 'On Trip',     bg: Colors.accentLight,  color: Colors.accent },
  Maintenance: { label: 'Maintenance', bg: Colors.warningLight, color: Colors.warning },
  Inactive:    { label: 'Inactive',    bg: Colors.gray100,      color: Colors.gray500 },
};

interface VehicleStatusBadgeProps {
  status: AssetStatus;
  className?: string;
}

/** Status pill — color is automatic from the vehicle's status. */
export function VehicleStatusBadge({ status, className }: VehicleStatusBadgeProps) {
  const meta = META[status] ?? META.Inactive;
  return (
    <View style={{ backgroundColor: meta.bg, borderRadius: Radius.full }} className={`self-start px-2.5 py-1 ${className ?? ''}`}>
      <Text style={{ color: meta.color }} className="text-[11px] font-semibold">{meta.label}</Text>
    </View>
  );
}
