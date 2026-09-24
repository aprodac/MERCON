import React from 'react';
import { View } from 'react-native';
import { SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Colors, Radius, Shadows } from '@mercon/mobile-shared/theme/tokens';

export function SkeletonVehicleStatCard() {
  return (
    <View className="flex-1 flex-row items-center gap-3 rounded-2xl bg-navbg py-4 pl-4 pr-3">
      <SkeletonBlock width={44} height={44} radius={22} className="bg-white/10" />
      <View className="flex-1 gap-1">
        <SkeletonBlock width={46} height={22} className="bg-white/10" />
        <SkeletonBlock width="70%" height={11} className="bg-white/10" />
      </View>
    </View>
  );
}

/**
 * Structurally mirrors VehicleCard — same card radius, padding, border, and row
 * layout — preventing layout shift when the real data loads.
 */
export function SkeletonVehicleCard() {
  return (
    <View
      style={{
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: Colors.coolGray,
        padding: 16,
        backgroundColor: Colors.white,
        ...Shadows.sm,
      }}
    >
      {/* Header — Icon chip + Plate/Asset details + Status badge pill */}
      <View className="flex-row items-center gap-3">
        <SkeletonBlock width={44} height={44} radius={Radius.md} />

        <View className="flex-1 gap-1.5">
          <SkeletonBlock width="55%" height={16} />
          <SkeletonBlock width="75%" height={12} />
        </View>

        <SkeletonBlock width={64} height={20} radius={Radius.full} />
      </View>

      {/* Divider */}
      <View className="mt-3.5 border-t border-[#EEF1F6] pt-3 gap-2.5">
        {/* Driver row */}
        <View className="flex-row items-center gap-2">
          <SkeletonBlock width={16} height={16} radius={8} />
          <SkeletonBlock width="60%" height={13} />
        </View>

        {/* Specs row (Capacity / Odometer / Trailer) */}
        <View className="flex-row items-center gap-2">
          <SkeletonBlock width={16} height={16} radius={4} />
          <SkeletonBlock width="70%" height={13} />
        </View>
      </View>
    </View>
  );
}
