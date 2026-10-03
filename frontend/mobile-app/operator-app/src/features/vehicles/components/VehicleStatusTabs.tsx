import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Radius } from '@mercon/mobile-shared/theme/tokens';
import { useVehicleStats } from '../hooks';
import type { AssetStatus } from '../types';

interface VehicleStatusTabsProps {
  value: AssetStatus | null;
  onChange: (status: AssetStatus | null) => void;
}

/** Fleet status summary: each tab shows its live count and filters the list when tapped. */
export function VehicleStatusTabs({ value, onChange }: VehicleStatusTabsProps) {
  const stats = useVehicleStats();
  const count = (n: number) => (stats.loading || stats.error ? '–' : n.toLocaleString());

  const tabs: { key: AssetStatus | null; label: string; count: string; dot: string }[] = [
    { key: null, label: 'All', count: count(stats.totalVehicles), dot: Colors.charcoal },
    { key: 'Available', label: 'Available', count: count(stats.available), dot: Colors.success },
    { key: 'OnTrip', label: 'On trip', count: count(stats.onTrip), dot: Colors.primary },
    { key: 'Maintenance', label: 'Maintenance', count: count(stats.maintenance), dot: Colors.warning },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginHorizontal: -16 }}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <TouchableOpacity
            key={tab.label}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(tab.key);
            }}
            className="flex-row items-center"
            style={{
              gap: 8,
              paddingVertical: 9,
              paddingHorizontal: 14,
              borderRadius: Radius.full,
              backgroundColor: active ? Colors.charcoal : Colors.white,
              borderWidth: 1,
              borderColor: active ? Colors.charcoal : Colors.coolGray,
            }}
          >
            {tab.key !== null && (
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tab.dot }} />
            )}
            <Text className="text-[13px] font-semibold" style={{ color: active ? Colors.white : Colors.charcoal }}>
              {tab.label}
            </Text>
            <Text className="text-[13px] font-bold" style={{ color: active ? 'rgba(255,255,255,0.7)' : Colors.gray400 }}>
              {tab.count}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
