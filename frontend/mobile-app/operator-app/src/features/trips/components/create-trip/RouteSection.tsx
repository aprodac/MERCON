import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MapPin, Plus, Trash2, ChevronDown, Check, X, Building2 } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '@mercon/mobile-shared/theme/tokens';
import { Card } from '@mercon/mobile-shared/components/Card';
import { Input } from '@mercon/mobile-shared/components/Input';
import { Button } from '@mercon/mobile-shared/components/Button';
import { OperatorLocation } from '../../../../lib/operator';
import { RecentRouteItem, IntermediateStop, RateCategoryType } from '../../hooks/useCreateTripForm';

const TAXONOMY_LINE_TYPES: Array<{
  key: RateCategoryType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = [
  {
    key: 'SINGLE_TRIP',
    label: 'Single Trip',
    color: Colors.statusCompleted,
    bgColor: Colors.statusCompletedBg,
    borderColor: '#BBF7D0',
  },
  {
    key: 'ROUND_TRIP',
    label: 'Round Trip (Return Leg)',
    color: Colors.statusTransit,
    bgColor: Colors.statusTransitBg,
    borderColor: '#BFDBFE',
  },
  {
    key: '10_HRS',
    label: '10 Hours Duty',
    color: Colors.statusDelayed,
    bgColor: Colors.statusDelayedBg,
    borderColor: '#FDE68A',
  },
  {
    key: '12_HRS',
    label: '12 Hours Duty',
    color: Colors.purple,
    bgColor: Colors.purpleLight,
    borderColor: '#DDD6FE',
  },
];

interface LocationPickerInputProps {
  label: string;
  value: string;
  locationId?: string;
  locations: OperatorLocation[];
  onChangeText: (text: string) => void;
  onSelectLocation: (name: string, loc?: OperatorLocation) => void;
  onOpenCreateModal?: (initialName: string) => void;
  onBlur?: () => void;
  placeholder: string;
  style?: any;
}

const LocationPickerInput: React.FC<LocationPickerInputProps> = ({
  label,
  value,
  locationId,
  locations,
  onChangeText,
  onSelectLocation,
  onOpenCreateModal,
  onBlur,
  placeholder,
  style,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Match canonical location by ID or name
  const matchedLoc = useMemo(() => {
    if (locationId) {
      return locations.find((l) => l.id === locationId) || null;
    }
    if (!value || !value.trim()) return null;
    const clean = value.trim().toLowerCase();
    return locations.find((l) => l.name?.toLowerCase() === clean) || null;
  }, [locationId, value, locations]);

  const filteredLocations = useMemo(() => {
    if (!value || !value.trim()) return locations.slice(0, 5);
    const clean = value.trim().toLowerCase();
    return locations
      .filter(
        (l) =>
          (l.name && l.name.toLowerCase().includes(clean)) ||
          (l.city && l.city.toLowerCase().includes(clean)) ||
          (l.address && l.address.toLowerCase().includes(clean))
      )
      .slice(0, 5);
  }, [value, locations]);

  return (
    <View style={[styles.locationPickerContainer, style]}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {matchedLoc ? (
          <View style={styles.masterBadge}>
            <Check size={10} color={Colors.statusCompleted} strokeWidth={3} />
            <Text style={styles.masterBadgeText}>Master Location</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.inputWrapper}>
        <Input
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            setShowSuggestions(true);
          }}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 250);
            if (onBlur) onBlur();
          }}
          placeholder={placeholder}
        />
        {value.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              onSelectLocation('', undefined);
              setShowSuggestions(false);
            }}
          >
            <X size={14} color={Colors.gray500} />
          </TouchableOpacity>
        )}
      </View>

      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          {filteredLocations.map((loc) => (
            <TouchableOpacity
              key={loc.id}
              style={styles.suggestionRow}
              onPress={() => {
                onSelectLocation(loc.name, loc);
                setShowSuggestions(false);
              }}
            >
              <View style={styles.suggestionIconBox}>
                <MapPin size={14} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {loc.name}
                </Text>
                {loc.city || loc.address ? (
                  <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                    {[loc.city, loc.address].filter(Boolean).join(' • ')}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}

          {onOpenCreateModal && (
            <TouchableOpacity
              style={styles.createSuggestionRow}
              onPress={() => {
                setShowSuggestions(false);
                onOpenCreateModal(value.trim());
              }}
            >
              <View style={styles.createIconBox}>
                <Plus size={14} color={Colors.primary} />
              </View>
              <Text style={styles.createSuggestionText} numberOfLines={1}>
                {value.trim() ? `+ Create "${value.trim()}" as New Location` : '+ Create New Master Location'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

interface RouteSectionProps {
  pickupName: string;
  setPickupName: (val: string) => void;
  pickupLat: string;
  setPickupLat: (val: string) => void;
  pickupLng: string;
  setPickupLng: (val: string) => void;
  pickupLocationId?: string;
  setPickupLocationId: (id?: string) => void;
  dropoffName: string;
  setDropoffName: (val: string) => void;
  dropoffLat: string;
  setDropoffLat: (val: string) => void;
  dropoffLng: string;
  setDropoffLng: (val: string) => void;
  dropoffLocationId?: string;
  setDropoffLocationId: (id?: string) => void;
  outboundStops: IntermediateStop[];
  savedRecentRoutes: RecentRouteItem[];
  locations: OperatorLocation[];
  rateCategory: RateCategoryType;
  setRateCategory: (cat: RateCategoryType) => void;
  enableReturnLeg: boolean;
  setEnableReturnLeg: (val: boolean) => void;
  returnLegDriverFeeInput: string;
  setReturnLegDriverFeeInput: (val: string) => void;
  returnLegRateInput: string;
  setReturnLegRateInput: (val: string) => void;
  onAddStop: () => void;
  onRemoveStop: (id: string) => void;
  onUpdateStop: (id: string, name: string) => void;
  onSelectStopLocation: (stopId: string, loc: OperatorLocation) => void;
  onRecalculateTravelTime: (oName: string, dName: string) => void;
  onSaveRecentRoute: (oName: string, dName: string) => void;
  onSelectPickupLocation?: (name: string, loc?: OperatorLocation) => void;
  onSelectDropoffLocation?: (name: string, loc?: OperatorLocation) => void;
  onSelectRecentRoute?: (r: RecentRouteItem) => void;
  onCreateLocation?: (payload: { name: string; city?: string; address?: string }) => Promise<OperatorLocation>;
  returnPickupName?: string;
  setReturnPickupName?: (val: string) => void;
  returnPickupLocationId?: string;
  setReturnPickupLocationId?: (id?: string) => void;
  returnDropoffName?: string;
  setReturnDropoffName?: (val: string) => void;
  returnDropoffLocationId?: string;
  setReturnDropoffLocationId?: (id?: string) => void;
  returnStops?: IntermediateStop[];
  onAddReturnStop?: () => void;
  onRemoveReturnStop?: (id: string) => void;
  onUpdateReturnStop?: (id: string, name: string) => void;
  onSelectReturnStopLocation?: (stopId: string, loc: OperatorLocation) => void;
}

export const RouteSection: React.FC<RouteSectionProps> = ({
  pickupName,
  setPickupName,
  pickupLat,
  setPickupLat,
  pickupLng,
  setPickupLng,
  pickupLocationId,
  setPickupLocationId,
  dropoffName,
  setDropoffName,
  dropoffLat,
  setDropoffLat,
  dropoffLng,
  setDropoffLng,
  dropoffLocationId,
  setDropoffLocationId,
  outboundStops,
  savedRecentRoutes,
  locations,
  rateCategory,
  setRateCategory,
  enableReturnLeg,
  setEnableReturnLeg,
  returnLegDriverFeeInput,
  setReturnLegDriverFeeInput,
  returnLegRateInput,
  setReturnLegRateInput,
  onAddStop,
  onRemoveStop,
  onUpdateStop,
  onSelectStopLocation,
  onRecalculateTravelTime,
  onSaveRecentRoute,
  onSelectPickupLocation,
  onSelectDropoffLocation,
  onSelectRecentRoute,
  onCreateLocation,
  returnPickupName = '',
  setReturnPickupName,
  returnPickupLocationId,
  setReturnPickupLocationId,
  returnDropoffName = '',
  setReturnDropoffName,
  returnDropoffLocationId,
  setReturnDropoffLocationId,
  returnStops = [],
  onAddReturnStop,
  onRemoveReturnStop,
  onUpdateReturnStop,
  onSelectReturnStopLocation,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const activeTaxonomy = TAXONOMY_LINE_TYPES.find((t) => t.key === rateCategory) || TAXONOMY_LINE_TYPES[0];

  // New Location Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetField, setTargetField] = useState<'pickup' | 'dropoff' | string>('pickup');
  const [newLocName, setNewLocName] = useState('');
  const [newLocCity, setNewLocCity] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [creatingLoc, setCreatingLoc] = useState(false);

  const handleOpenCreateModal = (target: 'pickup' | 'dropoff' | string, initialName: string = '') => {
    setTargetField(target);
    setNewLocName(initialName);
    setNewLocCity('');
    setNewLocAddress('');
    setIsModalOpen(true);
  };

  const handlePickupSelect = (name: string, loc?: OperatorLocation) => {
    if (onSelectPickupLocation) {
      onSelectPickupLocation(name, loc);
    } else {
      setPickupName(name);
      setPickupLocationId(loc?.id);
      if (loc?.lat) setPickupLat(String(loc.lat));
      if (loc?.lng) setPickupLng(String(loc.lng));
      if (dropoffName) onRecalculateTravelTime(name, dropoffName);
    }
  };

  const handleDropoffSelect = (name: string, loc?: OperatorLocation) => {
    if (onSelectDropoffLocation) {
      onSelectDropoffLocation(name, loc);
    } else {
      setDropoffName(name);
      setDropoffLocationId(loc?.id);
      if (loc?.lat) setDropoffLat(String(loc.lat));
      if (loc?.lng) setDropoffLng(String(loc.lng));
      if (pickupName) onRecalculateTravelTime(pickupName, name);
    }
  };

  const handleRecentRoutePress = (r: RecentRouteItem) => {
    if (onSelectRecentRoute) {
      onSelectRecentRoute(r);
    } else {
      setPickupName(r.originName);
      if (r.originLat) setPickupLat(r.originLat);
      if (r.originLng) setPickupLng(r.originLng);
      if (r.originLocationId) setPickupLocationId(r.originLocationId);

      setDropoffName(r.destName);
      if (r.destLat) setDropoffLat(r.destLat);
      if (r.destLng) setDropoffLng(r.destLng);
      if (r.destLocationId) setDropoffLocationId(r.destLocationId);

      onRecalculateTravelTime(r.originName, r.destName);
    }
  };

  const handleSaveNewLocation = async () => {
    if (!newLocName.trim() || !onCreateLocation || creatingLoc) return;
    try {
      setCreatingLoc(true);
      const created = await onCreateLocation({
        name: newLocName.trim(),
        city: newLocCity.trim() || undefined,
        address: newLocAddress.trim() || undefined,
      });

      if (targetField === 'pickup') {
        handlePickupSelect(created.name, created);
      } else if (targetField === 'dropoff') {
        handleDropoffSelect(created.name, created);
      } else if (targetField === 'returnPickup') {
        setReturnPickupName?.(created.name);
        setReturnPickupLocationId?.(created.id);
      } else if (targetField === 'returnDropoff') {
        setReturnDropoffName?.(created.name);
        setReturnDropoffLocationId?.(created.id);
      } else {
        onSelectStopLocation(targetField, created);
      }
      setIsModalOpen(false);
    } catch (_) {
      // silent fallback
    } finally {
      setCreatingLoc(false);
    }
  };

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>2. Route Configuration</Text>
        {onCreateLocation && (
          <TouchableOpacity
            style={styles.addLocationHeaderBtn}
            onPress={() => handleOpenCreateModal('pickup', '')}
          >
            <Plus size={12} color={Colors.primary} />
            <Text style={styles.addLocationHeaderText}>+ New Location</Text>
          </TouchableOpacity>
        )}
      </View>

      <Card style={styles.card}>
        {/* Saved Recent Routes Chips */}
        {savedRecentRoutes.length > 0 && (
          <View style={styles.recentRoutesContainer}>
            <Text style={styles.fieldLabel}>Recent Commercial Routes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRoutesScroll}>
              {savedRecentRoutes.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.recentRouteChip}
                  onPress={() => handleRecentRoutePress(r)}
                >
                  <MapPin size={12} color={Colors.primary} />
                  <Text style={styles.recentRouteText}>{r.originName} → {r.destName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Origin / Pickup Input with Autocomplete */}
        <LocationPickerInput
          label="Pickup Origin"
          value={pickupName}
          locationId={pickupLocationId}
          locations={locations}
          onChangeText={(text) => handlePickupSelect(text, undefined)}
          onSelectLocation={(name, loc) => handlePickupSelect(name, loc)}
          onOpenCreateModal={(initialName) => handleOpenCreateModal('pickup', initialName)}
          onBlur={() => onSaveRecentRoute(pickupName, dropoffName)}
          placeholder="e.g. Riyadh Main Warehouse"
        />

        {/* Intermediate Waypoint Stops with Autocomplete */}
        {outboundStops.map((stop, idx) => (
          <View key={stop.id} style={styles.stopRow}>
            <LocationPickerInput
              label={`Intermediate Stop #${idx + 1}`}
              value={stop.name}
              locationId={stop.locationId}
              locations={locations}
              onChangeText={(text) => onUpdateStop(stop.id, text)}
              onSelectLocation={(_, loc) => {
                if (loc) {
                  onSelectStopLocation(stop.id, loc);
                } else {
                  onUpdateStop(stop.id, stop.name);
                }
              }}
              onOpenCreateModal={(initialName) => handleOpenCreateModal(stop.id, initialName)}
              placeholder="e.g. Al Hasa Waypoint"
              style={{ flex: 1 }}
            />
            <TouchableOpacity style={styles.removeStopBtn} onPress={() => onRemoveStop(stop.id)}>
              <Trash2 size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addStopBtn} onPress={onAddStop}>
          <Plus size={14} color={Colors.primary} />
          <Text style={styles.addStopText}>+ Add Waypoint Stop</Text>
        </TouchableOpacity>

        {/* Destination / Dropoff Input with Autocomplete */}
        <LocationPickerInput
          label="Dropoff Destination"
          value={dropoffName}
          locationId={dropoffLocationId}
          locations={locations}
          onChangeText={(text) => handleDropoffSelect(text, undefined)}
          onSelectLocation={(name, loc) => handleDropoffSelect(name, loc)}
          onOpenCreateModal={(initialName) => handleOpenCreateModal('dropoff', initialName)}
          onBlur={() => onSaveRecentRoute(pickupName, dropoffName)}
          placeholder="e.g. Dammam Port Terminal"
          style={{ marginTop: Spacing.xs }}
        />

        {/* Line Type / Rate Category Dropdown Select */}
        <View style={styles.rateCategoryContainer}>
          <Text style={styles.fieldLabel}>Line Type Taxonomy</Text>
          <TouchableOpacity
            style={[
              styles.dropdownHeader,
              { backgroundColor: activeTaxonomy.bgColor, borderColor: activeTaxonomy.borderColor },
            ]}
            onPress={() => setShowDropdown(!showDropdown)}
            activeOpacity={0.8}
          >
            <View style={styles.dropdownBadgeRow}>
              <View style={[styles.badgeDot, { backgroundColor: activeTaxonomy.color }]} />
              <Text style={[styles.dropdownSelectedText, { color: activeTaxonomy.color }]}>
                {activeTaxonomy.label}
              </Text>
            </View>
            <ChevronDown size={18} color={activeTaxonomy.color} />
          </TouchableOpacity>

          {showDropdown && (
            <View style={styles.dropdownListContainer}>
              {TAXONOMY_LINE_TYPES.map((t) => {
                const isSelected = t.key === rateCategory;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.dropdownOptionRow,
                      isSelected && { backgroundColor: t.bgColor },
                    ]}
                    onPress={() => {
                      setRateCategory(t.key);
                      setShowDropdown(false);
                    }}
                  >
                    <View style={styles.dropdownBadgeRow}>
                      <View style={[styles.badgeDot, { backgroundColor: t.color }]} />
                      <Text style={[styles.dropdownOptionText, { color: t.color }]}>{t.label}</Text>
                    </View>
                    {isSelected && <Check size={16} color={t.color} strokeWidth={2.5} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {rateCategory === 'ROUND_TRIP' && (
          <View style={styles.returnLegContainer}>
            <View style={styles.returnLegHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.returnLegTitle}>Enable Return Leg Return Flight</Text>
                <Text style={styles.returnLegSubtitle}>Automatically schedules return legs back to origin</Text>
              </View>
              <Switch
                value={enableReturnLeg}
                onValueChange={setEnableReturnLeg}
                trackColor={{ false: Colors.gray300, true: Colors.primary }}
              />
            </View>

            {enableReturnLeg && (
              <View style={{ gap: Spacing.xs, marginTop: Spacing.xs }}>
                <View style={styles.returnLegInputsRow}>
                  <Input
                    label="Return Rate (SAR)"
                    value={returnLegRateInput}
                    onChangeText={setReturnLegRateInput}
                    placeholder="e.g. 1200"
                    keyboardType="numeric"
                    style={{ flex: 1 }}
                  />
                  <Input
                    label="Return Driver Fee (SAR)"
                    value={returnLegDriverFeeInput}
                    onChangeText={setReturnLegDriverFeeInput}
                    placeholder="e.g. 600"
                    keyboardType="numeric"
                    style={{ flex: 1 }}
                  />
                </View>

                {/* Return Loading Location */}
                <LocationPickerInput
                  label="Return Loading Point"
                  value={returnPickupName || (dropoffName ? dropoffName : '')}
                  locationId={returnPickupLocationId}
                  locations={locations}
                  onChangeText={(text) => setReturnPickupName?.(text)}
                  onSelectLocation={(name, loc) => {
                    setReturnPickupName?.(name);
                    setReturnPickupLocationId?.(loc?.id);
                  }}
                  onOpenCreateModal={(initialName) => handleOpenCreateModal('returnPickup', initialName)}
                  placeholder={dropoffName || "e.g. Dammam Port Terminal"}
                />

                {/* Return Intermediate Stops */}
                {returnStops.map((stop, idx) => (
                  <View key={stop.id} style={styles.stopRow}>
                    <LocationPickerInput
                      label={`Return Intermediate Stop #${idx + 1}`}
                      value={stop.name}
                      locationId={stop.locationId}
                      locations={locations}
                      onChangeText={(text) => onUpdateReturnStop?.(stop.id, text)}
                      onSelectLocation={(_, loc) => {
                        if (loc) {
                          onSelectReturnStopLocation?.(stop.id, loc);
                        } else {
                          onUpdateReturnStop?.(stop.id, stop.name);
                        }
                      }}
                      onOpenCreateModal={(initialName) => handleOpenCreateModal(stop.id, initialName)}
                      placeholder="e.g. Al Hasa Return Waypoint"
                      style={{ flex: 1 }}
                    />
                    {onRemoveReturnStop && (
                      <TouchableOpacity style={styles.removeStopBtn} onPress={() => onRemoveReturnStop(stop.id)}>
                        <Trash2 size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {onAddReturnStop && (
                  <TouchableOpacity style={styles.addStopBtn} onPress={onAddReturnStop}>
                    <Plus size={14} color={Colors.primary} />
                    <Text style={styles.addStopText}>+ Add Return Waypoint Stop</Text>
                  </TouchableOpacity>
                )}

                {/* Return Final Dropoff Location */}
                <LocationPickerInput
                  label="Return Final Dropoff"
                  value={returnDropoffName || (pickupName ? pickupName : '')}
                  locationId={returnDropoffLocationId}
                  locations={locations}
                  onChangeText={(text) => setReturnDropoffName?.(text)}
                  onSelectLocation={(name, loc) => {
                    setReturnDropoffName?.(name);
                    setReturnDropoffLocationId?.(loc?.id);
                  }}
                  onOpenCreateModal={(initialName) => handleOpenCreateModal('returnDropoff', initialName)}
                  placeholder={pickupName || "e.g. Riyadh Main Warehouse"}
                />
              </View>
            )}
          </View>
        )}
      </Card>

      {/* Quick Add Master Location Modal */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Building2 size={16} color={Colors.primary} />
                <Text style={styles.modalTitle}>Create Master Location</Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <X size={18} color={Colors.gray500} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.sm, paddingVertical: Spacing.sm }}>
              <Input
                label="Location Name *"
                value={newLocName}
                onChangeText={setNewLocName}
                placeholder="e.g. Riyadh Central Distribution Center"
              />
              <Input
                label="City (Optional)"
                value={newLocCity}
                onChangeText={setNewLocCity}
                placeholder="e.g. Riyadh"
              />
              <Input
                label="Address / Google Maps Link (Optional)"
                value={newLocAddress}
                onChangeText={setNewLocAddress}
                placeholder="e.g. https://maps.google.com/?q=..."
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button variant="outline" label="Cancel" onPress={() => setIsModalOpen(false)} style={{ flex: 1 }} />
              <Button
                variant="primary"
                label={creatingLoc ? 'Saving…' : 'Create & Select'}
                onPress={handleSaveNewLocation}
                disabled={!newLocName.trim() || creatingLoc}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: Typography.headingS.fontWeight,
    color: Colors.charcoal,
  },
  addLocationHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  addLocationHeaderText: {
    fontSize: Typography.micro,
    fontWeight: '700',
    color: Colors.primary,
  },
  card: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: Typography.subcaption,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  locationPickerContainer: {
    position: 'relative',
    zIndex: 10,
    marginBottom: Spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  masterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.statusCompletedBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  masterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusCompleted,
  },
  inputWrapper: {
    position: 'relative',
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    top: 14,
    zIndex: 2,
  },
  suggestionsContainer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  suggestionIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  suggestionSubtitle: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  createSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray50,
  },
  createIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSuggestionText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  recentRoutesContainer: {
    marginBottom: Spacing.xs,
  },
  recentRoutesScroll: {
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  recentRouteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  recentRouteText: {
    fontSize: Typography.xs,
    color: Colors.gray900,
    fontWeight: '600',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  removeStopBtn: {
    padding: Spacing.sm,
    marginBottom: 4,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  addStopText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  rateCategoryContainer: {
    marginTop: Spacing.sm,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  dropdownBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  dropdownSelectedText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  dropdownListContainer: {
    marginTop: 4,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  dropdownOptionText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  returnLegContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  returnLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  returnLegTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  returnLegSubtitle: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  returnLegInputsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: Typography.headingM.fontSize,
    fontWeight: Typography.headingM.fontWeight,
    color: Colors.charcoal,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
});
