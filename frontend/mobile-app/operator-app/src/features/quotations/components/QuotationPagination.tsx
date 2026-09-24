import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

interface QuotationPaginationProps {
  currentCount: number;
  totalCount: number;
  page: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  isFetching?: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  className?: string;
}

export function QuotationPagination({
  currentCount,
  totalCount,
  page,
  totalPages,
  hasPrevPage,
  hasNextPage,
  isFetching,
  onPrevPage,
  onNextPage,
  className,
}: QuotationPaginationProps) {
  if (totalCount === 0) return null;

  const handlePrev = () => {
    if (!hasPrevPage || isFetching) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPrevPage();
  };

  const handleNext = () => {
    if (!hasNextPage || isFetching) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onNextPage();
  };

  return (
    <View className={`my-6 items-center gap-3 ${className ?? ''}`}>
      <View className="flex-row items-center justify-between w-full px-1">
        {/* Previous Button */}
        <TouchableOpacity
          onPress={handlePrev}
          disabled={!hasPrevPage || isFetching}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Previous quotations page"
          className={`flex-row items-center gap-1.5 rounded-xl border px-3.5 py-2.5 ${
            hasPrevPage && !isFetching ? 'bg-white border-[#EEF1F6]' : 'bg-gray-100 border-gray-200 opacity-40'
          }`}
        >
          <ChevronLeft size={16} color={Colors.charcoal} strokeWidth={2} />
          <Text className="text-[13px] font-semibold text-[#3E3C3D]">Previous</Text>
        </TouchableOpacity>

        {/* Page Indicator */}
        <View className="items-center">
          {isFetching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Text className="text-[13px] font-bold text-[#3E3C3D]">
                Page {page} of {totalPages}
              </Text>
              <Text className="text-[11px] font-medium text-gray-400 mt-0.5">
                {totalCount} total quotations
              </Text>
            </>
          )}
        </View>

        {/* Next Button */}
        <TouchableOpacity
          onPress={handleNext}
          disabled={!hasNextPage || isFetching}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Next quotations page"
          className={`flex-row items-center gap-1.5 rounded-xl border px-3.5 py-2.5 ${
            hasNextPage && !isFetching ? 'bg-white border-[#EEF1F6]' : 'bg-gray-100 border-gray-200 opacity-40'
          }`}
        >
          <Text className="text-[13px] font-semibold text-[#3E3C3D]">Next</Text>
          <ChevronRight size={16} color={Colors.charcoal} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
