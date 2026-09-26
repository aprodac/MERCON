import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Shadows } from '@mercon/mobile-shared/theme/tokens';

interface DriverStatCardProps {
  label: string;
  value: number;
  Icon: LucideIcon;
  /** Small secondary line under the label, e.g. "32 available". */
  caption?: string;
  className?: string;
}

/** Compact KPI card styled with design system tokens (Colors.navBg background, Colors.primary icon accent). */
export function DriverStatCard({ label, value, Icon, caption, className }: DriverStatCardProps) {
  return (
    <View
      style={{
        backgroundColor: Colors.navBg,
        borderColor: 'rgba(238, 241, 246, 0.15)',
        borderWidth: 1,
        borderRadius: Radius.lg,
        ...Shadows.md,
      }}
      className={`flex-1 flex-row items-center gap-3.5 overflow-hidden py-3.5 px-4 ${className ?? ''}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/10">
        <Icon size={18} color={Colors.primary} strokeWidth={2.4} />
      </View>

      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-[22px] font-extrabold leading-[26px] text-white">
          {value.toLocaleString()}
        </Text>
        <Text numberOfLines={1} className="text-[12px] font-semibold text-white/80">{label}</Text>
        {caption ? (
          <Text numberOfLines={1} className="text-[10px] font-medium text-white/50">{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}
