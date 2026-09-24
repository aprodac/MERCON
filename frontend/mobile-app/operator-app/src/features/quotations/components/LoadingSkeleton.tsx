import React from 'react';
import { View } from 'react-native';
import { SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Colors, Radius, Shadows } from '@mercon/mobile-shared/theme/tokens';

/**
 * Structurally mirrors QuotationCard — same card radius, padding, border, and row
 * layout — preventing layout shift when data loads.
 */
export function SkeletonQuotationCard() {
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
      {/* Customer Name */}
      <SkeletonBlock width="40%" height={12} />

      {/* Primary Route: Origin -> Destination */}
      <View className="flex-row items-center gap-2 mt-2">
        <SkeletonBlock width="40%" height={17} />
        <SkeletonBlock width={14} height={14} radius={7} />
        <SkeletonBlock width="40%" height={17} />
      </View>

      {/* Subtitle via text + stops count */}
      <View className="flex-row items-center justify-between mt-2">
        <SkeletonBlock width="50%" height={12} />
        <SkeletonBlock width={54} height={16} radius={Radius.full} />
      </View>

      {/* Divider */}
      <View className="mt-3.5 border-t border-[#EEF1F6] pt-3 gap-2.5">
        {/* Badges row: Vehicle class, Line type, Validity status */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <SkeletonBlock width={64} height={20} radius={Radius.md} />
            <SkeletonBlock width={72} height={20} radius={Radius.md} />
          </View>
          <SkeletonBlock width={58} height={20} radius={Radius.full} />
        </View>

        {/* Rate row */}
        <View className="flex-row items-center justify-between mt-1">
          <SkeletonBlock width="45%" height={20} />
          <SkeletonBlock width="30%" height={14} />
        </View>
      </View>
    </View>
  );
}
