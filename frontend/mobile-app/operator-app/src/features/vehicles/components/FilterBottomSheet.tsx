import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { AssetStatus } from '../types';

const STATUS_OPTIONS: { value: AssetStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'Available', label: 'Available' },
  { value: 'OnTrip', label: 'On Trip' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Inactive', label: 'Inactive' },
];

interface FilterBottomSheetProps {
  visible: boolean;
  value: AssetStatus | null;
  onChange: (status: AssetStatus | null) => void;
  onClose: () => void;
}

export function FilterBottomSheet({ visible, value, onChange, onClose }: FilterBottomSheetProps) {
  const handleSelect = (val: AssetStatus | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(val);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/30" onPress={onClose}>
        <Pressable className="gap-1 rounded-t-3xl bg-white p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-gray-900">Filter by Status</Text>
            <TouchableOpacity onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-gray-100">
              <X size={16} color="#3B3B44" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              onPress={() => handleSelect(opt.value)}
              className="flex-row items-center justify-between rounded-xl px-3 py-3"
            >
              <Text className="text-sm text-gray-700">{opt.label}</Text>
              {value === opt.value && <Check size={16} color="#FA634E" />}
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
