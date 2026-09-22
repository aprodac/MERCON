import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

interface DriverStatCardProps {
  label: string;
  value: number;
  Icon: LucideIcon;
  /** Small secondary line under the label, e.g. "32 available". */
  caption?: string;
  className?: string;
}

/** Compact KPI card styled to match the operator bottom tab bar (#3E3C3D charcoal background, #FA634E accent). */
export function DriverStatCard({ label, value, Icon, caption, className }: DriverStatCardProps) {
  return (
    <View
      style={{
        backgroundColor: '#3E3C3D',
        borderColor: 'rgba(238, 241, 246, 0.15)',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
      }}
      className={`flex-1 flex-row items-center gap-3.5 overflow-hidden rounded-2xl py-3.5 px-4 ${className ?? ''}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/10">
        <Icon size={18} color="#FA634E" strokeWidth={2.4} />
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
