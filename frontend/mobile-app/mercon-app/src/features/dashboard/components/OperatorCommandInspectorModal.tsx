import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  X,
  AlertTriangle,
  FileText,
  UserX,
  MapPin,
  CheckCircle2,
  Phone,
  MessageCircle,
  Truck,
  User,
  Calendar,
  ExternalLink,
} from 'lucide-react-native';
import type { CommandActionItem, DriverRef, VehicleRef } from '../types';
import { api } from '@/lib/api';

interface OperatorCommandInspectorModalProps {
  visible: boolean;
  item: CommandActionItem | null;
  onClose: () => void;
  drivers?: DriverRef[];
  vehicles?: VehicleRef[];
  onRefresh?: () => void;
}

export function OperatorCommandInspectorModal({
  visible,
  item,
  onClose,
  drivers = [],
  vehicles = [],
  onRefresh,
}: OperatorCommandInspectorModalProps) {
  const router = useRouter();

  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [newExpiryDate, setNewExpiryDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!item) return null;

  const isDelay = item.category === 'delay';
  const isUnassigned = item.category === 'unassigned';
  const isPod = item.category === 'pod';
  const isDoc = item.category === 'doc';
  const isLocation = item.category === 'location';

  const driverPhone = (item.trip?.driver as any)?.phone || (item.driver as any)?.phone || '';

  const handleCallDriver = () => {
    if (driverPhone) {
      Linking.openURL(`tel:${driverPhone}`);
    } else {
      setStatusMessage('No phone number available for driver');
    }
  };

  const handleWhatsAppDriver = () => {
    const text = encodeURIComponent(
      `Hello, regarding trip ${item.tripRef || item.entityName} (${item.subtitle}): Please provide an operational update.`
    );
    if (driverPhone) {
      const cleanPhone = driverPhone.replace(/[^\d+]/g, '');
      Linking.openURL(`whatsapp://send?phone=${cleanPhone}&text=${text}`).catch(() => {
        Linking.openURL(`https://wa.me/${cleanPhone}?text=${text}`);
      });
    } else {
      Linking.openURL(`whatsapp://send?text=${text}`).catch(() => {
        Linking.openURL(`https://wa.me/?text=${text}`);
      });
    }
  };

  const handleOpenTrip = () => {
    onClose();
    if (item.trip?.id) {
      router.push({ pathname: '/operator/trip-details', params: { id: item.trip.id } });
    } else {
      router.push('/operator/trips');
    }
  };

  const handleAssignTrip = async () => {
    if (!item.trip?.id) return;
    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      await api.patch(`/trips/${item.trip.id}/dispatch`, {
        driver_id: selectedDriverId || undefined,
        vehicle_id: selectedVehicleId || undefined,
      });
      setStatusMessage('Trip assigned & dispatched successfully!');
      if (onRefresh) onRefresh();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e: any) {
      setStatusMessage(e?.response?.data?.message || 'Failed to assign resources');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExpiry = async () => {
    if (!item.doc?.id || !newExpiryDate) return;
    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      await api.patch(`/documents/${item.doc.id}`, { expiry_date: newExpiryDate });
      setStatusMessage('Document expiry date updated!');
      if (onRefresh) onRefresh();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e: any) {
      setStatusMessage('Failed to update document expiry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-3xl p-5 max-h-[85%] min-h-[420px] flex-col justify-between">
          
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100">
            <View className="flex-row items-center gap-2.5">
              <View
                className={`w-9 h-9 rounded-full items-center justify-center ${
                  isDelay
                    ? 'bg-rose-100 text-[#FA634E]'
                    : isUnassigned
                    ? 'bg-purple-100 text-purple-700'
                    : isPod
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isDelay ? (
                  <AlertTriangle size={20} color="#FA634E" />
                ) : isUnassigned ? (
                  <UserX size={20} color="#7E22CE" />
                ) : isPod ? (
                  <FileText size={20} color="#1D4ED8" />
                ) : isLocation ? (
                  <MapPin size={20} color="#D97706" />
                ) : (
                  <Calendar size={20} color="#D97706" />
                )}
              </View>

              <View className="flex-1">
                <Text className="text-base font-extrabold text-[#3E3C3D]" numberOfLines={1}>
                  {item.entityName}
                </Text>
                <Text className="text-xs font-semibold text-gray-500" numberOfLines={1}>
                  {item.badgeLabel} • {item.subtitle}
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} className="p-2 rounded-full bg-gray-100">
              <X size={18} color="#3E3C3D" />
            </TouchableOpacity>
          </View>

          {/* Body Content */}
          <ScrollView className="flex-1 my-3" showsVerticalScrollIndicator={false}>
            {/* Status Message alert */}
            {statusMessage && (
              <View className="p-3 mb-3 bg-emerald-50 border border-emerald-200 rounded-xl flex-row items-center gap-2">
                <CheckCircle2 size={16} color="#059669" />
                <Text className="text-xs font-bold text-emerald-800 flex-1">{statusMessage}</Text>
              </View>
            )}

            {/* Delay Details */}
            {isDelay && (
              <View className="bg-rose-50/70 border border-rose-100 p-3.5 rounded-2xl gap-2">
                <Text className="text-xs font-black uppercase text-[#FA634E] tracking-wider">
                  Operational Delay Details
                </Text>
                <Text className="text-sm font-bold text-[#3E3C3D]">
                  {item.delayReason || 'Schedule overrun — delay reported'}
                </Text>
                {item.delayTimeAgo && (
                  <Text className="text-xs font-semibold text-gray-500">
                    Logged: {item.delayTimeAgo}
                  </Text>
                )}
              </View>
            )}

            {/* Unassigned Details */}
            {isUnassigned && (
              <View className="gap-3">
                <View className="bg-purple-50 border border-purple-100 p-3.5 rounded-2xl">
                  <Text className="text-xs font-black uppercase text-purple-700 tracking-wider mb-1">
                    Resource Allocation Needed
                  </Text>
                  <Text className="text-xs font-semibold text-gray-600">
                    Select an available driver and vehicle below to dispatch this trip.
                  </Text>
                </View>

                {/* Driver Selector */}
                <View>
                  <Text className="text-xs font-extrabold text-[#3E3C3D] mb-1">Assign Driver</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                    {drivers.map((d) => {
                      const isSelected = selectedDriverId === d.id;
                      return (
                        <TouchableOpacity
                          key={d.id}
                          onPress={() => setSelectedDriverId(isSelected ? '' : d.id)}
                          className={`px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                            isSelected ? 'bg-[#FA634E] border-[#FA634E]' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <User size={14} color={isSelected ? '#FFFFFF' : '#3E3C3D'} />
                          <Text
                            className={`text-xs font-bold ${
                              isSelected ? 'text-white' : 'text-[#3E3C3D]'
                            }`}
                          >
                            {d.first_name} {d.last_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Vehicle Selector */}
                <View>
                  <Text className="text-xs font-extrabold text-[#3E3C3D] mb-1">Assign Vehicle</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                    {vehicles.map((v) => {
                      const isSelected = selectedVehicleId === v.id;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          onPress={() => setSelectedVehicleId(isSelected ? '' : v.id)}
                          className={`px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                            isSelected ? 'bg-[#FA634E] border-[#FA634E]' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <Truck size={14} color={isSelected ? '#FFFFFF' : '#3E3C3D'} />
                          <Text
                            className={`text-xs font-bold ${
                              isSelected ? 'text-white' : 'text-[#3E3C3D]'
                            }`}
                          >
                            {v.plate_number || v.ref_id} ({v.asset_type})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* POD Details */}
            {isPod && (
              <View className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl gap-2">
                <Text className="text-xs font-black uppercase text-blue-700 tracking-wider">
                  Proof of Delivery Received
                </Text>
                <Text className="text-xs font-semibold text-gray-600">
                  Driver uploaded POD proof photos for {item.tripRef || item.entityName}. Tap below to view full trip documents.
                </Text>
              </View>
            )}

            {/* Document Expiry Details */}
            {isDoc && (
              <View className="gap-3">
                <View className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl gap-1">
                  <Text className="text-xs font-black uppercase text-amber-800 tracking-wider">
                    Document Expiry Warning
                  </Text>
                  <Text className="text-sm font-extrabold text-[#3E3C3D]">
                    {item.entityName}
                  </Text>
                  <Text className="text-xs font-semibold text-gray-600">
                    {item.subtitle}
                  </Text>
                </View>

                <View>
                  <Text className="text-xs font-extrabold text-[#3E3C3D] mb-1">
                    Update Expiry Date (YYYY-MM-DD)
                  </Text>
                  <TextInput
                    value={newExpiryDate}
                    onChangeText={setNewExpiryDate}
                    placeholder="2026-12-31"
                    placeholderTextColor="#9CA3AF"
                    className="border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-bold text-[#3E3C3D] bg-white"
                  />
                </View>
              </View>
            )}

            {/* Location Details */}
            {isLocation && (
              <View className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl gap-2">
                <Text className="text-xs font-black uppercase text-amber-800 tracking-wider">
                  Location Precision Review
                </Text>
                <Text className="text-xs font-semibold text-gray-600">
                  Destination coordinates for {item.tripRef || item.entityName} are approximate. Verify pin in trip details.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons Footer */}
          <View className="pt-3 border-t border-gray-100 gap-2">
            {/* Contextual actions: Call & WhatsApp for delays or trips */}
            {(isDelay || (item.trip && !isUnassigned)) && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleCallDriver}
                  className="flex-1 bg-gray-100 py-3 rounded-xl flex-row items-center justify-center gap-2 border border-gray-200"
                >
                  <Phone size={15} color="#3E3C3D" />
                  <Text className="text-xs font-extrabold text-[#3E3C3D]">Call Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleWhatsAppDriver}
                  className="flex-1 bg-emerald-600 py-3 rounded-xl flex-row items-center justify-center gap-2"
                >
                  <MessageCircle size={15} color="#FFFFFF" />
                  <Text className="text-xs font-extrabold text-white">WhatsApp</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Assign button */}
            {isUnassigned && (
              <TouchableOpacity
                onPress={handleAssignTrip}
                disabled={isSubmitting || (!selectedDriverId && !selectedVehicleId)}
                className={`py-3.5 rounded-xl flex-row items-center justify-center gap-2 ${
                  !selectedDriverId && !selectedVehicleId ? 'bg-gray-300' : 'bg-[#FA634E]'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text className="text-xs font-black uppercase tracking-wider text-white">
                      Assign & Dispatch Trip
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Document Renewal Button */}
            {isDoc && (
              <TouchableOpacity
                onPress={handleUpdateExpiry}
                disabled={isSubmitting || !newExpiryDate}
                className={`py-3.5 rounded-xl flex-row items-center justify-center gap-2 ${
                  !newExpiryDate ? 'bg-gray-300' : 'bg-[#FA634E]'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text className="text-xs font-black uppercase tracking-wider text-white">
                      Save Expiry Date
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Primary Open Trip Button */}
            {item.trip && (
              <TouchableOpacity
                onPress={handleOpenTrip}
                className="bg-[#EEF1F6] py-3 rounded-xl flex-row items-center justify-center gap-2 border border-slate-200"
              >
                <Text className="text-xs font-extrabold text-[#3E3C3D]">Open Full Trip Details</Text>
                <ExternalLink size={14} color="#3E3C3D" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
