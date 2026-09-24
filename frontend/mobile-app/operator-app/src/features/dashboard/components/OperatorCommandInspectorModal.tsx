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
import { api } from '@mercon/mobile-shared/lib/api';

/* ─── Category visual config ────────────────────────────────────────────── */

const CATEGORY_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  delay: { bg: '#FEF2F2', color: '#FA634E', label: 'Delay' },
  unassigned: { bg: '#F5F3FF', color: '#7C3AED', label: 'Unassigned' },
  pod: { bg: '#EFF6FF', color: '#2563EB', label: 'POD' },
  doc: { bg: '#FFFBEB', color: '#D97706', label: 'Document' },
  location: { bg: '#FFFBEB', color: '#D97706', label: 'Location' },
};

function getCategoryIcon(category: string, size: number, color: string) {
  switch (category) {
    case 'delay': return <AlertTriangle size={size} color={color} />;
    case 'unassigned': return <UserX size={size} color={color} />;
    case 'pod': return <FileText size={size} color={color} />;
    case 'location': return <MapPin size={size} color={color} />;
    default: return <Calendar size={size} color={color} />;
  }
}

/* ─── Component ──────────────────────────────────────────────────────────── */

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

  const category = item.category;
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.doc;
  const driverPhone = (item.trip?.driver as any)?.phone || (item.driver as any)?.phone || '';

  /* ─── Actions ──────────────────────────────────────────────────────────── */

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
      router.push({ pathname: '/trip-details', params: { id: item.trip.id } });
    } else {
      router.push('/trips');
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

  /* ─── Render ───────────────────────────────────────────────────────────── */

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 24,
            maxHeight: '80%',
            minHeight: 360,
          }}
        >
          {/* ── Handle bar ────────────────────────────────────────────── */}
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#D1D5DB',
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />

          {/* ── Header ───────────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#F5F5F7',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: config.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {getCategoryIcon(category, 18, config.color)}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: '#3E3C3D' }}>
                  {item.entityName}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: '#6E6E80', marginTop: 1 }}>
                  {item.badgeLabel} · {item.tripRef || ''}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: '#F5F5F7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color="#3E3C3D" />
            </TouchableOpacity>
          </View>

          {/* ── Body ─────────────────────────────────────────────────── */}
          <ScrollView
            style={{ flex: 1, marginTop: 14 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
          >
            {/* Status message */}
            {statusMessage && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: '#F0FDF4',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#BBF7D0',
                }}
              >
                <CheckCircle2 size={14} color="#16A34A" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#166534', flex: 1 }}>
                  {statusMessage}
                </Text>
              </View>
            )}

            {/* ── DELAY Details ──────────────────────────────────────── */}
            {category === 'delay' && (
              <View
                style={{
                  backgroundColor: '#FEF2F2',
                  borderRadius: 12,
                  padding: 12,
                  gap: 6,
                  borderWidth: 1,
                  borderColor: '#FECACA',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FA634E' }}>
                  Delay Details
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#3E3C3D' }}>
                  {item.delayReason || 'Schedule overrun — delay reported'}
                </Text>
                {item.delayTimeAgo && (
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#6E6E80' }}>
                    Logged {item.delayTimeAgo}
                  </Text>
                )}
              </View>
            )}

            {/* ── UNASSIGNED Details ─────────────────────────────────── */}
            {category === 'unassigned' && (
              <View style={{ gap: 14 }}>
                <View
                  style={{
                    backgroundColor: '#F5F3FF',
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E9D5FF',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#7C3AED' }}>
                    Assign driver and vehicle to dispatch this trip.
                  </Text>
                </View>

                {/* Driver selector */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D' }}>Driver</Text>
                  {drivers.map((d) => {
                    const isSelected = selectedDriverId === d.id;
                    return (
                      <TouchableOpacity
                        key={d.id}
                        onPress={() => setSelectedDriverId(isSelected ? '' : d.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          padding: 10,
                          borderRadius: 10,
                          backgroundColor: isSelected ? '#FA634E' : '#FAFAFA',
                          borderWidth: 1,
                          borderColor: isSelected ? '#FA634E' : '#EBEBED',
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#EEF1F6',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <User size={14} color={isSelected ? '#FFFFFF' : '#3E3C3D'} />
                        </View>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: isSelected ? '#FFFFFF' : '#3E3C3D',
                            flex: 1,
                          }}
                        >
                          {d.first_name} {d.last_name}
                        </Text>
                        {isSelected && <CheckCircle2 size={16} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Vehicle selector */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D' }}>Vehicle</Text>
                  {vehicles.map((v) => {
                    const isSelected = selectedVehicleId === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => setSelectedVehicleId(isSelected ? '' : v.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          padding: 10,
                          borderRadius: 10,
                          backgroundColor: isSelected ? '#FA634E' : '#FAFAFA',
                          borderWidth: 1,
                          borderColor: isSelected ? '#FA634E' : '#EBEBED',
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#EEF1F6',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Truck size={14} color={isSelected ? '#FFFFFF' : '#3E3C3D'} />
                        </View>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: isSelected ? '#FFFFFF' : '#3E3C3D',
                            flex: 1,
                          }}
                        >
                          {v.plate_number || v.ref_id} · {v.asset_type}
                        </Text>
                        {isSelected && <CheckCircle2 size={16} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── POD Details ────────────────────────────────────────── */}
            {category === 'pod' && (
              <View
                style={{
                  backgroundColor: '#EFF6FF',
                  borderRadius: 12,
                  padding: 12,
                  gap: 4,
                  borderWidth: 1,
                  borderColor: '#BFDBFE',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>
                  Proof of Delivery Received
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '400', color: '#6E6E80' }}>
                  Driver uploaded POD for {item.tripRef || item.entityName}. View full trip to review documents.
                </Text>
              </View>
            )}

            {/* ── DOCUMENT Expiry Details ─────────────────────────────── */}
            {category === 'doc' && (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    backgroundColor: '#FFFBEB',
                    borderRadius: 12,
                    padding: 12,
                    gap: 4,
                    borderWidth: 1,
                    borderColor: '#FDE68A',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#D97706' }}>
                    Expiry Warning
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#3E3C3D' }}>
                    {item.entityName}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '400', color: '#6E6E80' }}>
                    {item.subtitle}
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D' }}>
                    New Expiry Date
                  </Text>
                  <TextInput
                    value={newExpiryDate}
                    onChangeText={setNewExpiryDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9898A4"
                    style={{
                      borderWidth: 1,
                      borderColor: '#EBEBED',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 13,
                      fontWeight: '500',
                      color: '#3E3C3D',
                      backgroundColor: '#FAFAFA',
                    }}
                  />
                </View>
              </View>
            )}

            {/* ── LOCATION Details ───────────────────────────────────── */}
            {category === 'location' && (
              <View
                style={{
                  backgroundColor: '#FFFBEB',
                  borderRadius: 12,
                  padding: 12,
                  gap: 4,
                  borderWidth: 1,
                  borderColor: '#FDE68A',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#D97706' }}>
                  Location Review
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '400', color: '#6E6E80' }}>
                  Coordinates for {item.tripRef || item.entityName} are approximate. Verify pin in trip details.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* ── Footer Actions ───────────────────────────────────────── */}
          <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F5F5F7' }}>
            {/* Call & WhatsApp for delays or trip-linked items */}
            {(category === 'delay' || (item.trip && category !== 'unassigned')) && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleCallDriver}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: '#F5F5F7',
                    borderWidth: 1,
                    borderColor: '#EBEBED',
                  }}
                >
                  <Phone size={14} color="#3E3C3D" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D' }}>Call</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleWhatsAppDriver}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: '#25D366',
                  }}
                >
                  <MessageCircle size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Assign button */}
            {category === 'unassigned' && (
              <TouchableOpacity
                onPress={handleAssignTrip}
                disabled={isSubmitting || (!selectedDriverId && !selectedVehicleId)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 13,
                  borderRadius: 12,
                  backgroundColor: !selectedDriverId && !selectedVehicleId ? '#D1D5DB' : '#FA634E',
                }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                      Assign & Dispatch
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Document renewal button */}
            {category === 'doc' && (
              <TouchableOpacity
                onPress={handleUpdateExpiry}
                disabled={isSubmitting || !newExpiryDate}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 13,
                  borderRadius: 12,
                  backgroundColor: !newExpiryDate ? '#D1D5DB' : '#FA634E',
                }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                      Save Expiry
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Open Trip */}
            {item.trip && (
              <TouchableOpacity
                onPress={handleOpenTrip}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#F5F5F7',
                  borderWidth: 1,
                  borderColor: '#EBEBED',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D' }}>Open Trip</Text>
                <ExternalLink size={13} color="#3E3C3D" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
