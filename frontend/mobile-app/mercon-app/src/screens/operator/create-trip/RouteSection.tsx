import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { MapPin, Plus, Trash2, ChevronDown, Check } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../../theme/tokens';
import { Card } from '../../../components/Card';
import { Input } from '../../../components/Input';
import { OperatorLocation } from '../../../lib/operator';
import { RecentRouteItem, IntermediateStop, RateCategoryType } from '../hooks/useCreateTripForm';

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
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const activeTaxonomy = TAXONOMY_LINE_TYPES.find((t) => t.key === rateCategory) || TAXONOMY_LINE_TYPES[0];

  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>2. Route Configuration</Text>
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
                  onPress={() => {
                    setPickupName(r.originName);
                    if (r.originLat) setPickupLat(r.originLat);
                    if (r.originLng) setPickupLng(r.originLng);
                    if (r.originLocationId) setPickupLocationId(r.originLocationId);

                    setDropoffName(r.destName);
                    if (r.destLat) setDropoffLat(r.destLat);
                    if (r.destLng) setDropoffLng(r.destLng);
                    if (r.destLocationId) setDropoffLocationId(r.destLocationId);

                    onRecalculateTravelTime(r.originName, r.destName);
                  }}
                >
                  <MapPin size={12} color={Colors.primary} />
                  <Text style={styles.recentRouteText}>{r.originName} → {r.destName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Origin / Pickup Input */}
        <Input
          label="Pickup Origin"
          value={pickupName}
          onChangeText={(val) => {
            setPickupName(val);
            if (dropoffName) onRecalculateTravelTime(val, dropoffName);
          }}
          onBlur={() => onSaveRecentRoute(pickupName, dropoffName)}
          placeholder="e.g. Riyadh Main Warehouse"
        />

        {/* Intermediate Stops */}
        {outboundStops.map((stop, idx) => (
          <View key={stop.id} style={styles.stopRow}>
            <Input
              label={`Intermediate Stop #${idx + 1}`}
              value={stop.name}
              onChangeText={(val) => onUpdateStop(stop.id, val)}
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

        {/* Destination / Dropoff Input */}
        <Input
          label="Dropoff Destination"
          value={dropoffName}
          onChangeText={(val) => {
            setDropoffName(val);
            if (pickupName) onRecalculateTravelTime(pickupName, val);
          }}
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
            )}
          </View>
        )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: Typography.headingS.fontWeight,
    color: Colors.charcoal,
    marginBottom: Spacing.xs,
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
});
