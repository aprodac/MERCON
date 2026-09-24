import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { CalendarDays, FileSignature } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { formatDate } from '../services/customersService';
import type { CustomerListItem } from '../types';

interface CellProps {
  Icon: LucideIcon;
  label: string;
  value: string;
}

function Cell({ Icon, label, value }: CellProps) {
  return (
    <View style={{ width: '48%' }}>
      <View className="flex-row items-center gap-1.5">
        <Icon size={11} color={Colors.gray400} strokeWidth={2} />
        <Text numberOfLines={1} className="text-[10px] font-medium text-gray-400">
          {label}
        </Text>
      </View>
      <Text numberOfLines={1} className="mt-1 text-[13px] font-semibold text-gray-900">
        {value}
      </Text>
    </View>
  );
}

interface CustomerInfoGridProps {
  customer: CustomerListItem;
}

export function CustomerInfoGrid({ customer }: CustomerInfoGridProps) {
  return (
    <View className="flex-row flex-wrap justify-between" style={{ rowGap: 14 }}>
      <Cell
        Icon={FileSignature}
        label="Rate Card"
        value={customer.rateCard?.name ?? 'Standard rates'}
      />
      <Cell Icon={CalendarDays} label="Customer Since" value={formatDate(customer.createdAt)} />
    </View>
  );
}
