import React from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { Phone, MapPin, FileText, Truck, Calendar, ChevronRight } from 'lucide-react-native';
import { CustomerLogo } from './CustomerLogo';
import { CustomerStatusBadge } from './CustomerStatusBadge';
import { CustomerOverflowMenu } from './CustomerOverflowMenu';
import type { CustomerListItem, CustomerPermissions } from '../types';

interface CustomerCardProps {
  customer: CustomerListItem;
  permissions: CustomerPermissions;
  onViewDetails: (customer: CustomerListItem) => void;
  onCreateTrip: (customer: CustomerListItem) => void;
  onEdit: (customer: CustomerListItem) => void;
  onToggleActive: (customer: CustomerListItem) => void;
  onDelete: (customer: CustomerListItem) => void;
}

/** Horizontal card matching the requested design with Rate Card, Trips, and Date metrics. */
export function CustomerCard({
  customer,
  permissions,
  onViewDetails,
  onEdit,
  onToggleActive,
  onDelete,
}: CustomerCardProps) {
  // Format date: 'Aug 2026'
  const createdAtDate = new Date(customer.createdAt);
  const formattedDate = createdAtDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // Use actual rate card name from DB if it exists, otherwise fallback string
  const rateCardName = customer.rateCard?.name || 'Standard Rates';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onViewDetails(customer)}
      style={{
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
      }}
      className="rounded-[24px] bg-white border border-[#F7F7F7]"
    >
      {/* Top section: Logo, details, badge, menu */}
      <View className="flex-row items-start justify-between">
        
        {/* Left Side: Logo & Info */}
        <View className="flex-row items-start flex-1 mr-3">
          <CustomerLogo name={customer.name} size={54} />
          
          <View className="flex-1 ml-3 mt-0.5">
            <Text numberOfLines={1} className="text-[17px] font-bold text-[#111827]">
              {customer.name}
            </Text>
            
            <View className="flex-row items-center mt-1">
              <Phone size={13} color="#9CA3AF" />
              <Text numberOfLines={1} className="text-[13px] text-[#6B7280] ml-1.5">
                {customer.phone || 'No phone'}
              </Text>
            </View>
            
            <View className="flex-row items-center mt-1">
              <MapPin size={13} color="#9CA3AF" />
              <Text numberOfLines={1} className="text-[13px] text-[#6B7280] ml-1.5">
                Saudi Arabia
              </Text>
            </View>
          </View>
        </View>

        {/* Right Side: Status, overflow menu, and chevron */}
        <View className="items-end justify-between" style={{ height: 54 }}>
          <View className="flex-row items-center">
            <CustomerStatusBadge status={customer.status} />
            <View className="ml-1">
              <CustomerOverflowMenu
                customer={customer}
                permissions={permissions}
                onEdit={() => onEdit(customer)}
                onToggleActive={() => onToggleActive(customer)}
                onDelete={() => onDelete(customer)}
              />
            </View>
          </View>
          <ChevronRight size={18} color="#D1D5DB" className="mr-2" />
        </View>
      </View>

      {/* Thin faint divider */}
      <View className="my-4 h-[1px] bg-[#F3F4F6]" />

      {/* Bottom section: Metrics columns */}
      <View className="flex-row justify-between items-start">
        
        {/* Metric 1: Rate Card */}
        <View className="flex-1 flex-row items-start gap-2 border-r border-[#F3F4F6] pr-2">
          <FileText size={15} color="#4B5563" strokeWidth={2} className="mt-[3px]" />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[11px] text-[#9CA3AF] mb-0.5">Rate Card</Text>
            <Text numberOfLines={1} className="text-[13px] font-bold text-[#111827]">
              {rateCardName}
            </Text>
          </View>
        </View>

        {/* Metric 2: Trips */}
        <View className="flex-1 flex-row items-start gap-2 border-r border-[#F3F4F6] px-3">
          <Truck size={15} color="#4B5563" strokeWidth={2} className="mt-[3px]" />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[11px] text-[#9CA3AF] mb-0.5">Trips (This Month)</Text>
            <Text numberOfLines={1} className="text-[13px] font-bold text-[#111827]">
              {customer.tripsThisMonth ?? 0}
            </Text>
          </View>
        </View>

        {/* Metric 3: Customer Since */}
        <View className="flex-1 flex-row items-start gap-2 pl-3">
          <Calendar size={15} color="#4B5563" strokeWidth={2} className="mt-[3px]" />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[11px] text-[#9CA3AF] mb-0.5">Customer Since</Text>
            <Text numberOfLines={1} className="text-[13px] font-bold text-[#111827]">
              {formattedDate}
            </Text>
          </View>
        </View>

      </View>
    </TouchableOpacity>
  );
}
