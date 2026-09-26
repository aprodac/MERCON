import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, ChevronRight, Tag } from 'lucide-react-native';
import { Colors, Radius, Shadows, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { QuotationValidityBadge } from './QuotationValidityBadge';
import { formatCurrency } from '../services/quotationsService';
import type { QuotationListItem } from '../types';

interface QuotationCardProps {
  quotation: QuotationListItem;
  onView?: (quotation: QuotationListItem) => void;
  className?: string;
}

export function QuotationCard({ quotation, onView, className }: QuotationCardProps) {
  const intermediateCount = quotation.stops.length > 2 ? quotation.stops.length - 2 : 0;

  return (
    <TouchableOpacity
      activeOpacity={onView ? 0.9 : 1}
      onPress={onView ? () => onView(quotation) : undefined}
      className={`bg-white p-4 ${className ?? ''}`}
      style={{ borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.coolGray, ...Shadows.sm }}
    >
      {/* Customer Name */}
      <Text numberOfLines={1} style={{ color: Colors.gray500 }} className="text-[12px] font-semibold uppercase tracking-wider mb-1">
        {quotation.customerName}
      </Text>

      {/* Primary Route Line: First Stop → Last Stop */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center flex-1 gap-1.5 overflow-hidden">
          <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[16px] font-extrabold shrink-0 max-w-[42%]">
            {quotation.firstStop}
          </Text>
          <ArrowRight size={14} color={Colors.primary} strokeWidth={2.5} className="shrink-0" />
          <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[16px] font-extrabold shrink-0 max-w-[42%]">
            {quotation.lastStop}
          </Text>
        </View>

        <QuotationValidityBadge status={quotation.validityStatus} />
      </View>

      {/* Route Subtitle & Stops Note */}
      <View className="flex-row items-center justify-between mt-1">
        <Text numberOfLines={1} style={{ color: Colors.gray500 }} className="text-[12px] font-medium flex-1">
          {quotation.intermediateStopsText ?? 'Direct Route'}
          {intermediateCount > 0 ? ` · +${intermediateCount} stops` : ` · ${quotation.stopsCount} stops`}
        </Text>

        <View className="flex-row items-center gap-0.5">
          <Text style={{ color: Colors.primary }} className="text-[11px] font-bold">Inspect</Text>
          <ChevronRight size={14} color={Colors.primary} strokeWidth={2} />
        </View>
      </View>

      {/* Divider */}
      <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.coolGray, paddingTop: Spacing.sm }} className="gap-2">
        {/* Badges row: Vehicle Class & Line Type */}
        <View className="flex-row items-center gap-2">
          <View style={{ backgroundColor: Colors.gray100, borderRadius: Radius.md }} className="px-2.5 py-1">
            <Text style={{ color: Colors.charcoal }} className="text-[11px] font-semibold">
              {quotation.vehicleClass}
            </Text>
          </View>
          <View style={{ backgroundColor: Colors.gray100, borderRadius: Radius.md }} className="px-2.5 py-1">
            <Text style={{ color: Colors.gray600 }} className="text-[11px] font-medium">
              {quotation.lineType}
            </Text>
          </View>
        </View>

        {/* Rate Row */}
        <View className="flex-row items-baseline justify-between mt-1">
          <View className="flex-row items-baseline gap-1">
            <Text style={{ color: Colors.charcoal }} className="text-[17px] font-extrabold">
              {formatCurrency(quotation.rate, quotation.currency)}
            </Text>
            <Text style={{ color: Colors.gray500 }} className="text-[12px] font-semibold">
              {quotation.isMonthly ? '/ mo' : '/ trip'}
            </Text>
          </View>

          {quotation.isMonthly && quotation.dailyEquivalent !== null ? (
            <Text style={{ color: Colors.gray500 }} className="text-[12px] font-medium">
              ≈ {formatCurrency(quotation.dailyEquivalent, quotation.currency)} / day
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}
