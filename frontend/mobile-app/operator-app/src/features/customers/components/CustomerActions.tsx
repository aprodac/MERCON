import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface CustomerActionsProps {
  onViewDetails: () => void;
  onCreateTrip: () => void;
}

/** Single button: View Details */
export function CustomerActions({ onViewDetails }: CustomerActionsProps) {
  return (
    <View className="flex-row" style={{ gap: 10 }}>
      <TouchableOpacity
        onPress={onViewDetails}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="View customer details"
        className="h-11 flex-1 items-center justify-center rounded-2xl border border-gray-200 bg-white"
      >
        <Text className="text-[13px] font-bold text-gray-900">View Details</Text>
      </TouchableOpacity>
    </View>
  );
}
