import React from 'react';
import { Text, View } from 'react-native';
import { Colors, Radius } from '@/theme/tokens';
import type { QuotationValidityStatus } from '../types';

const META: Record<QuotationValidityStatus, { label: string; bg: string; color: string }> = {
  Active:   { label: 'Active',   bg: Colors.successLight, color: Colors.success },
  Inactive: { label: 'Inactive', bg: Colors.gray100,      color: Colors.gray500 },
  Expired:  { label: 'Expired',  bg: Colors.dangerLight,  color: Colors.danger },
  Future:   { label: 'Future',   bg: Colors.warningLight, color: Colors.warning },
};

interface QuotationValidityBadgeProps {
  status: QuotationValidityStatus;
  className?: string;
}

export function QuotationValidityBadge({ status, className }: QuotationValidityBadgeProps) {
  const meta = META[status] ?? META.Inactive;
  return (
    <View style={{ backgroundColor: meta.bg, borderRadius: Radius.full }} className={`self-start px-2.5 py-1 ${className ?? ''}`}>
      <Text style={{ color: meta.color }} className="text-[11px] font-semibold">{meta.label}</Text>
    </View>
  );
}
