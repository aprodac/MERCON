import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, CheckCircle2 } from 'lucide-react-native';

interface DriverPaginationProps {
  currentCount: number;
  totalCount: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadNext: () => void;
  className?: string;
}

export function DriverPagination({
  currentCount,
  totalCount,
  page,
  totalPages,
  hasNextPage,
  isFetchingNextPage,
  onLoadNext,
  className,
}: DriverPaginationProps) {
  if (totalCount === 0) return null;

  return (
    <View className={`mt-4 mb-6 items-center gap-3 ${className ?? ''}`}>
      {/* Counts indicator */}
      <Text className="text-[12px] font-semibold text-gray-500">
        Showing <Text className="font-bold text-[#3E3C3D]">{currentCount}</Text> of{' '}
        <Text className="font-bold text-[#3E3C3D]">{totalCount}</Text> drivers (Page {page} of {totalPages})
      </Text>

      {/* Pagination Action */}
      {hasNextPage ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onLoadNext}
          disabled={isFetchingNextPage}
          style={{
            backgroundColor: '#3E3C3D',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 2,
          }}
          className="flex-row items-center justify-center gap-2 rounded-xl px-5 py-3 border border-[#4F4D4E]"
        >
          {isFetchingNextPage ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text className="text-[13px] font-bold text-white tracking-wide">Load More Drivers</Text>
              <ChevronDown size={16} color="#FA634E" strokeWidth={2.5} />
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View className="flex-row items-center gap-1.5 pt-1">
          <CheckCircle2 size={14} color="#16A34A" />
          <Text className="text-[12px] font-medium text-gray-400">All {totalCount} drivers loaded</Text>
        </View>
      )}
    </View>
  );
}
