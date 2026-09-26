import React from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, MapPin, X, Wallet, Truck, Building2, Tag, Calendar, Pencil } from 'lucide-react-native';
import { Colors, Radius, Shadows, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { QuotationValidityBadge } from './QuotationValidityBadge';
import { formatCurrency, formatValidityRange } from '../services/quotationsService';
import type { QuotationListItem } from '../types';
import { useRouter } from 'expo-router';

interface QuotationDetailModalProps {
  visible: boolean;
  quotation: QuotationListItem | null;
  onClose: () => void;
}

export function QuotationDetailModal({ visible, quotation, onClose }: QuotationDetailModalProps) {
  const router = useRouter();

  if (!quotation) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="rounded-t-3xl bg-white p-5 max-h-[85%]"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-[#EEF1F6]">
            <View className="flex-1 pr-3">
              <Text numberOfLines={1} style={{ color: Colors.gray500 }} className="text-[12px] font-semibold uppercase tracking-wider">
                {quotation.customerName}
              </Text>
              <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[18px] font-extrabold mt-0.5">
                {quotation.name}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/quotation-edit?id=${quotation.id}`);
                }}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100"
              >
                <Pencil size={14} color={Colors.charcoal} strokeWidth={2.2} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100"
              >
                <X size={16} color={Colors.charcoal} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
            {/* Validity & Status Row */}
            <View className="flex-row items-center justify-between bg-[#F8FAFC] p-3.5 rounded-2xl border border-[#EEF1F6]">
              <View className="flex-row items-center gap-2">
                <Calendar size={16} color={Colors.primary} strokeWidth={2} />
                <View>
                  <Text className="text-[11px] font-medium text-gray-500">Validity Period</Text>
                  <Text className="text-[13px] font-bold text-[#3E3C3D]">
                    {formatValidityRange(quotation.validFrom, quotation.validTo)}
                  </Text>
                </View>
              </View>

              <QuotationValidityBadge status={quotation.validityStatus} />
            </View>

            {/* Financial Overview (Rate + Driver Payout) */}
            <View className="flex-row gap-3">
              {/* Billing Rate */}
              <View className="flex-1 bg-[#FFF0EB] p-3.5 rounded-2xl border border-[#FDE3DF] gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Tag size={14} color={Colors.primary} strokeWidth={2} />
                  <Text style={{ color: Colors.primary }} className="text-[11px] font-bold uppercase tracking-wider">
                    Billing Rate
                  </Text>
                </View>
                <Text style={{ color: Colors.charcoal }} className="text-[16px] font-extrabold mt-0.5">
                  {formatCurrency(quotation.rate, quotation.currency)}
                </Text>
                <Text style={{ color: Colors.gray600 }} className="text-[11px] font-medium">
                  {quotation.isMonthly ? 'Per Month' : 'Per Single Trip'}
                  {quotation.dailyEquivalent ? ` (≈ ${formatCurrency(quotation.dailyEquivalent, quotation.currency)}/day)` : ''}
                </Text>
              </View>

              {/* Driver Payout (Internal Ops Only) */}
              <View className="flex-1 bg-[#EEF1F6] p-3.5 rounded-2xl border border-[#E2E8F0] gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Wallet size={14} color={Colors.charcoal} strokeWidth={2} />
                  <Text style={{ color: Colors.charcoal }} className="text-[11px] font-bold uppercase tracking-wider">
                    Driver Charge
                  </Text>
                </View>
                <Text style={{ color: Colors.charcoal }} className="text-[16px] font-extrabold mt-0.5">
                  {formatCurrency(quotation.driverPayout, quotation.currency)}
                </Text>
                <Text style={{ color: Colors.gray500 }} className="text-[11px] font-medium">
                  Operational Payout
                </Text>
              </View>
            </View>

            {/* Specifications */}
            <View className="bg-white p-4 rounded-2xl border border-[#EEF1F6] gap-2.5">
              <Text className="text-[12px] font-bold uppercase tracking-wider text-gray-400">Specifications</Text>
              
              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] font-medium text-gray-600">Vehicle Class</Text>
                <Text className="text-[13px] font-bold text-[#3E3C3D]">{quotation.vehicleClass}</Text>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] font-medium text-gray-600">Line Type</Text>
                <Text className="text-[13px] font-bold text-[#3E3C3D]">{quotation.lineType}</Text>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] font-medium text-gray-600">Operation Type</Text>
                <Text className="text-[13px] font-bold text-[#3E3C3D]">{quotation.operationType}</Text>
              </View>
            </View>

            {/* Route Stop Sequence */}
            <View className="bg-white p-4 rounded-2xl border border-[#EEF1F6] gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-[12px] font-bold uppercase tracking-wider text-gray-400">Full Route Sequence</Text>
                <Text className="text-[11px] font-bold text-gray-500">{quotation.stopsCount} Stops</Text>
              </View>

              {quotation.stops.length > 0 ? (
                <View className="gap-2">
                  {quotation.stops.map((stop, idx) => (
                    <View key={stop.id} className="flex-row items-center gap-3 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#EEF1F6]">
                      <View className="h-6 w-6 rounded-full bg-[#3E3C3D] items-center justify-center">
                        <Text className="text-[11px] font-bold text-white">{idx + 1}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-[13px] font-bold text-[#3E3C3D]">{stop.shortName}</Text>
                        {stop.canonicalName && (
                          <Text className="text-[11px] font-medium text-gray-400 mt-0.5">{stop.canonicalName}</Text>
                        )}
                      </View>
                      <View className="px-2 py-0.5 rounded bg-gray-200">
                        <Text className="text-[10px] font-semibold text-gray-600 uppercase">{stop.stopType}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="flex-row items-center gap-2 p-3 rounded-xl bg-[#F8FAFC]">
                  <MapPin size={16} color={Colors.primary} />
                  <Text className="text-[13px] font-semibold text-[#3E3C3D]">
                    {quotation.firstStop} → {quotation.lastStop}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
