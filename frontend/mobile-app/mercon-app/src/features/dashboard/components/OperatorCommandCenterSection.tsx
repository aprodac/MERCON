import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import {
  AlertTriangle,
  FileText,
  UserX,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react-native';
import { useOperatorCommandQueue } from '../hooks/useOperatorCommandQueue';
import type { CommandActionItem, CommandActionItemCategory } from '../types';
import { OperatorCommandInspectorModal } from './OperatorCommandInspectorModal';

interface OperatorCommandCenterSectionProps {
  onTripPress?: (tripId: string) => void;
}

export function OperatorCommandCenterSection({ onTripPress }: OperatorCommandCenterSectionProps) {
  const {
    actionItems,
    filteredItems,
    counts,
    isLoading,
    activeCategoryFilter,
    setActiveCategoryFilter,
    drivers,
    vehicles,
    refetchAll,
  } = useOperatorCommandQueue();

  const [selectedItem, setSelectedItem] = useState<CommandActionItem | null>(null);

  const categories: { id: CommandActionItemCategory; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'delay', label: 'Delays', count: counts.delay },
    { id: 'unassigned', label: 'Unassigned', count: counts.unassigned },
    { id: 'pod', label: 'POD Ready', count: counts.pod },
    { id: 'doc', label: 'Documents', count: counts.doc },
  ];

  return (
    <View className="bg-white rounded-2xl border border-[#EEF1F6] p-4 shadow-sm">
      {/* ── 1. HEADER ────────────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between pb-3 border-b border-[#EEF1F6]">
        <View className="flex-row items-center gap-2">
          <View className="w-2.5 h-2.5 rounded-full bg-[#FA634E]" />
          <Text className="text-xs font-black uppercase tracking-wider text-[#3E3C3D]">
            OPERATOR COMMAND
          </Text>
        </View>

        <View className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200/80">
          <Text className="text-[10px] font-black uppercase tracking-wider text-[#FA634E]">
            {actionItems.length} ALERTS
          </Text>
        </View>
      </View>

      {/* ── 2. CATEGORY FILTER PILLS ─────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="py-2.5 flex-row gap-1.5"
      >
        {categories.map((cat) => {
          const isActive = activeCategoryFilter === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1.5 ${
                isActive
                  ? 'bg-[#FA634E] border-[#FA634E]'
                  : 'bg-[#EEF1F6]/70 border-slate-200/80'
              }`}
            >
              <Text
                className={`text-[11px] font-bold ${
                  isActive ? 'text-white' : 'text-[#3E3C3D]'
                }`}
              >
                {cat.label}
              </Text>
              <View
                className={`px-1.5 py-0.2 rounded-md ${
                  isActive ? 'bg-white/20' : 'bg-slate-200/80'
                }`}
              >
                <Text
                  className={`text-[10px] font-extrabold ${
                    isActive ? 'text-white' : 'text-[#3E3C3D]'
                  }`}
                >
                  {cat.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── 3. ACTION QUEUE LIST ────────────────────────────────────────────── */}
      <View className="gap-2 pt-1">
        {isLoading ? (
          <View className="p-6 items-center justify-center">
            <ActivityIndicator size="small" color="#FA634E" />
            <Text className="text-xs font-semibold text-gray-400 mt-2">
              Loading operational alerts...
            </Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 items-center justify-center gap-1">
            <CheckCircle2 size={20} color="#059669" />
            <Text className="text-xs font-bold text-[#3E3C3D]">Queue Clear</Text>
            <Text className="text-[10.5px] font-medium text-gray-500">
              All active dispatches and compliance tasks are running smoothly.
            </Text>
          </View>
        ) : (
          filteredItems.slice(0, 5).map((item) => {
            const isDelay = item.category === 'delay';
            const isUnassigned = item.category === 'unassigned';
            const isPod = item.category === 'pod';

            const badgeBg = isDelay
              ? 'bg-rose-100 text-[#FA634E] border-rose-200'
              : isUnassigned
              ? 'bg-purple-100 text-purple-700 border-purple-200'
              : isPod
              ? 'bg-blue-100 text-blue-700 border-blue-200'
              : 'bg-amber-100 text-amber-800 border-amber-200';

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => setSelectedItem(item)}
                className="p-2.5 rounded-xl border border-slate-100 bg-white active:bg-slate-50 flex-row items-center justify-between gap-2.5"
              >
                {/* Avatar Icon */}
                <View className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200/70 items-center justify-center overflow-hidden">
                  {item.avatarUrl ? (
                    <Image
                      source={{ uri: item.avatarUrl }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <Text className="text-[11px] font-black text-[#FA634E]">
                      {item.initials}
                    </Text>
                  )}
                </View>

                {/* Details */}
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-1">
                    <Text className="text-xs font-extrabold text-[#3E3C3D]" numberOfLines={1}>
                      {item.entityName}
                    </Text>
                  </View>
                  <Text className="text-[10.5px] font-semibold text-gray-500" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>

                {/* Badge Tag & Action Arrow */}
                <View className="flex-row items-center gap-1.5">
                  <View className={`px-2 py-0.5 rounded border ${badgeBg}`}>
                    <Text className="text-[9px] font-black uppercase tracking-wider">
                      {item.badgeLabel}
                    </Text>
                  </View>
                  <ChevronRight size={14} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Modal Inspector */}
      <OperatorCommandInspectorModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        drivers={drivers}
        vehicles={vehicles}
        onRefresh={refetchAll}
      />
    </View>
  );
}
