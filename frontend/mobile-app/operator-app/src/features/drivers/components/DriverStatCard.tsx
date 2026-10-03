import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius } from '@mercon/mobile-shared/theme/tokens';

interface DriverStatCardProps {
  label: string;
  value: number;
  Icon: LucideIcon;
  /** Small secondary line under the label, e.g. "32 available". */
  caption?: string;
  className?: string;
}

/** Compact KPI card — white with a hairline border, same as Home's status card. */
export function DriverStatCard({ label, value, Icon, caption, className }: DriverStatCardProps) {
  return (
    <View
      style={{ backgroundColor: Colors.white, borderColor: '#E9E9EC', borderWidth: 1, borderRadius: Radius.lg }}
      className={`flex-1 flex-row items-center gap-3 py-3.5 px-3.5 ${className ?? ''}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#F4F4F5' }}>
        <Icon size={18} color={Colors.charcoal} strokeWidth={2.2} />
      </View>

      <View className="flex-1" style={{ gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 22, fontWeight: '700', color: '#18181B', lineHeight: 26 }}>
          {value.toLocaleString()}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: '#3F3F46' }}>{label}</Text>
        {caption ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: '#6B6B76' }}>{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}
