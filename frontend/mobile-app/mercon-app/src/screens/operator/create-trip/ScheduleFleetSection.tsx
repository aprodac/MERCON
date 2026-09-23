import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Switch } from 'react-native';
import { Clock, Truck, Sparkles, UserPlus, Search, Check } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../../theme/tokens';
import { Card } from '../../../components/Card';
import { Input } from '../../../components/Input';
import { StatusBadge } from '../../../components/Badge';
import { OperatorDriver, OperatorVehicle, OperatorThirdPartyProvider } from '../../../lib/operator';
import { DriverAvatar, DRIVER_AVATAR_SIZES } from '../../../features/drivers/components/DriverAvatar';
import { MonthlyCalendarSection } from './MonthlyCalendarSection';
import { DayAssignmentOverride } from '../../../components/MonthlyCalendarSelector';

interface ScheduleFleetSectionProps {
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  estimatedHours: string;
  setEstimatedHours: (h: string) => void;
  isEstTravelCalculated: boolean;
  autoEtaDropoffDate: string | null;
  autoEtaDropoffTime: string | null;
  onCalculateAutoEta: (dStr: string, tStr: string, hrsStr?: string) => void;
  billingType: 'Monthly' | 'Extra';
  selectedMonthlyDates: string[];
  setSelectedMonthlyDates: React.Dispatch<React.SetStateAction<string[]>>;
  monthlyCurrentMonth: Date;
  setMonthlyCurrentMonth: (month: Date) => void;
  monthlyAssignmentMode: 'MASTER' | 'PER_DAY' | 'ROTATION';
  setMonthlyAssignmentMode: (mode: 'MASTER' | 'PER_DAY' | 'ROTATION') => void;
  rotationCount?: 2 | 3 | 4;
  onRotationCountChange?: (count: 2 | 3 | 4) => void;
  rotationDrivers?: string[];
  rotationVehicles?: string[];
  onUpdateRotationDriver?: (slotIdx: number, driverId: string) => void;
  onUpdateRotationVehicle?: (slotIdx: number, vehicleId: string) => void;
  onDuplicateFirstDayToAll?: () => void;
  dayAssignments: Record<string, DayAssignmentOverride>;
  setDayAssignments: React.Dispatch<React.SetStateAction<Record<string, DayAssignmentOverride>>>;
  fleetType: 'OWN' | 'THIRD_PARTY';
  setFleetType: (type: 'OWN' | 'THIRD_PARTY') => void;
  driverId: string;
  setDriverId: (id: string) => void;
  driverSearchQuery: string;
  setDriverSearchQuery: (query: string) => void;
  drivers: OperatorDriver[];
  selectedDriverObj: OperatorDriver | null;
  showRecommendedDrivers: boolean;
  setShowRecommendedDrivers: (val: boolean) => void;
  showCoDriver: boolean;
  setShowCoDriver: (val: boolean) => void;
  coDriverId: string;
  setCoDriverId: (id: string) => void;
  coDriverPayoutInput: string;
  setCoDriverPayoutInput: (val: string) => void;
  coDriverSearchQuery: string;
  setCoDriverSearchQuery: (query: string) => void;
  selectedCoDriverObj: OperatorDriver | null;
  vehicleId: string;
  setVehicleId: (id: string) => void;
  vehicleSearchQuery: string;
  setVehicleSearchQuery: (query: string) => void;
  vehicles: OperatorVehicle[];
  selectedVehicleObj: OperatorVehicle | null;
  thirdPartyProviderId: string;
  setThirdPartyProviderId: (id: string) => void;
  thirdPartyProviders: OperatorThirdPartyProvider[];
  thirdPartyCostInput: string;
  setThirdPartyCostInput: (cost: string) => void;
  thirdPartyDriverName: string;
  setThirdPartyDriverName: (name: string) => void;
  thirdPartyDriverPhone: string;
  setThirdPartyDriverPhone: (phone: string) => void;
  thirdPartyVehiclePlate: string;
  setThirdPartyVehiclePlate: (plate: string) => void;
  rateInput: string;
  setRateInput: (val: string) => void;
  costInput: string;
  setCostInput: (val: string) => void;
  formatDateDDMMYYYY: (d: Date) => string;
}

export const ScheduleFleetSection: React.FC<ScheduleFleetSectionProps> = ({
  date,
  setDate,
  time,
  setTime,
  estimatedHours,
  setEstimatedHours,
  isEstTravelCalculated,
  autoEtaDropoffDate,
  autoEtaDropoffTime,
  onCalculateAutoEta,
  billingType,
  selectedMonthlyDates,
  setSelectedMonthlyDates,
  monthlyCurrentMonth,
  setMonthlyCurrentMonth,
  monthlyAssignmentMode,
  setMonthlyAssignmentMode,
  rotationCount,
  onRotationCountChange,
  rotationDrivers,
  rotationVehicles,
  onUpdateRotationDriver,
  onUpdateRotationVehicle,
  onDuplicateFirstDayToAll,
  dayAssignments,
  setDayAssignments,
  fleetType,
  setFleetType,
  driverId,
  setDriverId,
  driverSearchQuery,
  setDriverSearchQuery,
  drivers,
  selectedDriverObj,
  showRecommendedDrivers,
  setShowRecommendedDrivers,
  showCoDriver,
  setShowCoDriver,
  coDriverId,
  setCoDriverId,
  coDriverPayoutInput,
  setCoDriverPayoutInput,
  coDriverSearchQuery,
  setCoDriverSearchQuery,
  selectedCoDriverObj,
  vehicleId,
  setVehicleId,
  vehicleSearchQuery,
  setVehicleSearchQuery,
  vehicles,
  selectedVehicleObj,
  thirdPartyProviderId,
  setThirdPartyProviderId,
  thirdPartyProviders,
  thirdPartyCostInput,
  setThirdPartyCostInput,
  thirdPartyDriverName,
  setThirdPartyDriverName,
  thirdPartyDriverPhone,
  setThirdPartyDriverPhone,
  thirdPartyVehiclePlate,
  setThirdPartyVehiclePlate,
  rateInput,
  setRateInput,
  costInput,
  setCostInput,
  formatDateDDMMYYYY,
}) => {
  const filteredDrivers = drivers.filter(
    (d) =>
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(driverSearchQuery.toLowerCase()) ||
      ((d as any).phone || d.phone_primary || '').includes(driverSearchQuery)
  );

  const filteredCoDrivers = drivers.filter(
    (d) =>
      d.id !== driverId &&
      (`${d.first_name} ${d.last_name}`.toLowerCase().includes(coDriverSearchQuery.toLowerCase()) ||
        (((d as any).phone || d.phone_primary || '').includes(coDriverSearchQuery)))
  );

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.plate_number.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) ||
      v.asset_type.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
  );

  // Filter recommended drivers (Available status)
  const recommendedDrivers = drivers.filter((d) => (d.status || 'Available') === 'Available').slice(0, 4);

  return (
    <View style={styles.container}>
      {/* Section 5: Departure Schedule & Auto-ETA */}
      <Text style={styles.sectionTitle}>5. Departure & Schedule</Text>
      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Departure Presets</Text>
        <View style={styles.presetChipsRow}>
          <TouchableOpacity
            style={styles.touchPresetChip}
            onPress={() => {
              const todayStr = formatDateDDMMYYYY(new Date());
              setDate(todayStr);
              onCalculateAutoEta(todayStr, time);
            }}
          >
            <Text style={styles.touchPresetText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.touchPresetChip}
            onPress={() => {
              const tom = new Date(Date.now() + 24 * 60 * 60 * 1000);
              const tomStr = formatDateDDMMYYYY(tom);
              setDate(tomStr);
              onCalculateAutoEta(tomStr, time);
            }}
          >
            <Text style={styles.touchPresetText}>Tomorrow</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputsRow}>
          <Input
            label="Departure Date (DD/MM/YYYY)"
            value={date}
            onChangeText={(val) => {
              setDate(val);
              onCalculateAutoEta(val, time);
            }}
            placeholder="DD/MM/YYYY"
            style={{ flex: 1 }}
          />
          <Input
            label="Time (HH:MM)"
            value={time}
            onChangeText={(val) => {
              setTime(val);
              onCalculateAutoEta(date, val);
            }}
            placeholder="08:00"
            style={{ flex: 1 }}
          />
        </View>

        <View style={{ marginTop: Spacing.xs }}>
          <Input
            label="Estimated Transit Duration (Hours)"
            value={estimatedHours}
            onChangeText={(val) => {
              setEstimatedHours(val);
              onCalculateAutoEta(date, time, val);
            }}
            placeholder="e.g. 4.0"
            keyboardType="numeric"
          />
        </View>

        {autoEtaDropoffDate && autoEtaDropoffTime && (
          <View style={styles.etaBanner}>
            <Clock size={16} color={Colors.primary} />
            <Text style={styles.etaBannerText}>
              Estimated Arrival: {autoEtaDropoffDate} at {autoEtaDropoffTime}
            </Text>
          </View>
        )}
      </Card>

      {/* Monthly Duty Calendar inside Schedule & Fleet */}
      {billingType === 'Monthly' && (
        <MonthlyCalendarSection
          selectedMonthlyDates={selectedMonthlyDates}
          setSelectedMonthlyDates={setSelectedMonthlyDates}
          monthlyCurrentMonth={monthlyCurrentMonth}
          setMonthlyCurrentMonth={setMonthlyCurrentMonth}
          monthlyAssignmentMode={monthlyAssignmentMode}
          setMonthlyAssignmentMode={setMonthlyAssignmentMode}
          rotationCount={rotationCount}
          onRotationCountChange={onRotationCountChange}
          rotationDrivers={rotationDrivers}
          rotationVehicles={rotationVehicles}
          onUpdateRotationDriver={onUpdateRotationDriver}
          onUpdateRotationVehicle={onUpdateRotationVehicle}
          onDuplicateFirstDayToAll={onDuplicateFirstDayToAll}
          dayAssignments={dayAssignments}
          setDayAssignments={setDayAssignments}
          drivers={drivers}
          vehicles={vehicles}
        />
      )}

      {/* Section 6: Fleet & Execution Assignment */}
      <Text style={[styles.sectionTitle, { marginTop: Spacing.md }]}>6. Fleet & Execution</Text>
      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Fleet Assignment Model</Text>

        {/* High-Contrast Toggle Buttons */}
        <View style={styles.fleetToggleRow}>
          <TouchableOpacity
            style={[styles.fleetToggleBtn, fleetType === 'OWN' && styles.fleetToggleBtnActiveOwn]}
            onPress={() => setFleetType('OWN')}
            activeOpacity={0.8}
          >
            <Truck size={16} color={fleetType === 'OWN' ? Colors.white : Colors.charcoal} />
            <Text style={[styles.fleetToggleText, fleetType === 'OWN' && styles.fleetToggleTextActiveOwn]}>
              Own Fleet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fleetToggleBtn, fleetType === 'THIRD_PARTY' && styles.fleetToggleBtnActive3PL]}
            onPress={() => setFleetType('THIRD_PARTY')}
            activeOpacity={0.8}
          >
            <UserPlus size={16} color={fleetType === 'THIRD_PARTY' ? Colors.white : Colors.charcoal} />
            <Text style={[styles.fleetToggleText, fleetType === 'THIRD_PARTY' && styles.fleetToggleTextActive3PL]}>
              3PL Subcontractor
            </Text>
          </TouchableOpacity>
        </View>

        {fleetType === 'OWN' ? (
          <>
            {/* Driver Recommendation Header */}
            {recommendedDrivers.length > 0 && (
              <View style={styles.recommendedHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={14} color={Colors.primary} />
                  <Text style={styles.recommendedTitle}>Recommended Available Drivers</Text>
                </View>
                <TouchableOpacity onPress={() => setShowRecommendedDrivers(!showRecommendedDrivers)}>
                  <Text style={styles.recommendedToggleText}>{showRecommendedDrivers ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {showRecommendedDrivers && recommendedDrivers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedScroll}>
                {recommendedDrivers.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.recommendedDriverCard, driverId === d.id && styles.recommendedDriverCardActive]}
                    onPress={() => setDriverId(d.id)}
                    activeOpacity={0.8}
                  >
                    <DriverAvatar
                      initials={`${d.first_name[0]}${d.last_name[0]}`}
                      avatarUrl={d.avatar_url || d.photo_url}
                      size={DRIVER_AVATAR_SIZES.lg}
                    />
                    <Text style={styles.recommendedDriverName} numberOfLines={1}>
                      {d.first_name} {d.last_name}
                    </Text>
                    <Text style={styles.recommendedDriverSubtext}>
                      {(d as any).phone || d.phone_primary || 'Available'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Primary Driver Search & Select */}
            <Text style={[styles.fieldLabel, { marginTop: Spacing.xs }]}>Primary Driver</Text>
            {selectedDriverObj ? (
              <View style={styles.selectedRow}>
                <DriverAvatar
                  initials={`${selectedDriverObj.first_name[0]}${selectedDriverObj.last_name[0]}`}
                  avatarUrl={selectedDriverObj.avatar_url || selectedDriverObj.photo_url}
                  size={DRIVER_AVATAR_SIZES.xl}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.selectedRowTitle}>
                      {selectedDriverObj.first_name} {selectedDriverObj.last_name}
                    </Text>
                    <StatusBadge status={selectedDriverObj.status || 'Available'} />
                  </View>
                  <Text style={styles.selectedRowSubtext}>
                    {(selectedDriverObj as any).phone || selectedDriverObj.phone_primary || 'No phone'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.clearBtn} onPress={() => setDriverId('assign_later')}>
                  <Text style={styles.clearBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <View style={styles.searchBarContainer}>
                  <Search size={14} color={Colors.gray500} />
                  <TextInput
                    style={styles.searchBarInput}
                    value={driverSearchQuery}
                    onChangeText={setDriverSearchQuery}
                    placeholder="Search driver name, phone, license..."
                    placeholderTextColor={Colors.gray400}
                  />
                </View>
                <Card style={{ maxHeight: 160 }}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    <TouchableOpacity
                      style={[styles.pickerItem, driverId === 'assign_later' && styles.pickerItemActive]}
                      onPress={() => setDriverId('assign_later')}
                    >
                      <Text style={styles.pickerItemText}>Assign Later (Dispatch driver later)</Text>
                      {driverId === 'assign_later' && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                    </TouchableOpacity>
                    {filteredDrivers.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.pickerItem, driverId === d.id && styles.pickerItemActive]}
                        onPress={() => setDriverId(d.id)}
                      >
                        <DriverAvatar
                          initials={`${d.first_name[0]}${d.last_name[0]}`}
                          avatarUrl={d.avatar_url || d.photo_url}
                          size={DRIVER_AVATAR_SIZES.md}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickerItemText}>{d.first_name} {d.last_name}</Text>
                          <Text style={styles.pickerItemSubtext}>{(d as any).phone || d.phone_primary || ''}</Text>
                        </View>
                        <StatusBadge status={d.status || 'Available'} />
                        {driverId === d.id && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </Card>
              </View>
            )}

            {/* Co-Driver Configuration Toggle */}
            <View style={styles.coDriverHeaderRow}>
              <Text style={styles.fieldLabel}>Co-Driver / Reliever</Text>
              <Switch
                value={showCoDriver}
                onValueChange={setShowCoDriver}
                trackColor={{ false: Colors.gray300, true: Colors.primary }}
              />
            </View>

            {showCoDriver && (
              <Card style={styles.coDriverCard}>
                <Text style={styles.fieldLabel}>Select Co-Driver</Text>
                {selectedCoDriverObj ? (
                  <View style={styles.selectedRow}>
                    <DriverAvatar
                      initials={`${selectedCoDriverObj.first_name[0]}${selectedCoDriverObj.last_name[0]}`}
                      avatarUrl={selectedCoDriverObj.avatar_url || selectedCoDriverObj.photo_url}
                      size={DRIVER_AVATAR_SIZES.sm}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedRowTitle}>
                        {selectedCoDriverObj.first_name} {selectedCoDriverObj.last_name}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.clearBtn} onPress={() => setCoDriverId('')}>
                      <Text style={styles.clearBtnText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Card style={{ maxHeight: 120, marginBottom: Spacing.xs }}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredCoDrivers.map((cd) => (
                        <TouchableOpacity
                          key={cd.id}
                          style={[styles.pickerItem, coDriverId === cd.id && styles.pickerItemActive]}
                          onPress={() => setCoDriverId(cd.id)}
                        >
                          <DriverAvatar
                            initials={`${cd.first_name[0]}${cd.last_name[0]}`}
                            avatarUrl={cd.avatar_url || cd.photo_url}
                            size={DRIVER_AVATAR_SIZES.sm}
                          />
                          <Text style={styles.pickerItemText}>{cd.first_name} {cd.last_name}</Text>
                          {coDriverId === cd.id && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </Card>
                )}
                <Input
                  label="Co-Driver Payout Override (SAR)"
                  value={coDriverPayoutInput}
                  onChangeText={setCoDriverPayoutInput}
                  placeholder="Optional (Default: 50/50 split)"
                  keyboardType="numeric"
                />
              </Card>
            )}

            {/* Vehicle Selection */}
            <Text style={[styles.fieldLabel, { marginTop: Spacing.xs }]}>Vehicle Asset</Text>
            {selectedVehicleObj ? (
              <View style={styles.selectedRow}>
                <Truck size={20} color={Colors.gray700} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedRowTitle}>{selectedVehicleObj.plate_number}</Text>
                  <Text style={styles.selectedRowSubtext}>{selectedVehicleObj.asset_type}</Text>
                </View>
                <TouchableOpacity style={styles.clearBtn} onPress={() => setVehicleId('assign_later')}>
                  <Text style={styles.clearBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <View style={styles.searchBarContainer}>
                  <Search size={14} color={Colors.gray500} />
                  <TextInput
                    style={styles.searchBarInput}
                    value={vehicleSearchQuery}
                    onChangeText={setVehicleSearchQuery}
                    placeholder="Search plate, asset code..."
                    placeholderTextColor={Colors.gray400}
                  />
                </View>
                <Card style={{ maxHeight: 140 }}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    <TouchableOpacity
                      style={[styles.pickerItem, vehicleId === 'assign_later' && styles.pickerItemActive]}
                      onPress={() => setVehicleId('assign_later')}
                    >
                      <Text style={styles.pickerItemText}>Assign Later (Assign vehicle later)</Text>
                      {vehicleId === 'assign_later' && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                    </TouchableOpacity>
                    {filteredVehicles.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        style={[styles.pickerItem, vehicleId === v.id && styles.pickerItemActive]}
                        onPress={() => setVehicleId(v.id)}
                      >
                        <Truck size={14} color={Colors.gray600} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickerItemText}>{v.plate_number}</Text>
                          <Text style={styles.pickerItemSubtext}>{v.asset_type}</Text>
                        </View>
                        <StatusBadge status={v.status || 'Available'} />
                        {vehicleId === v.id && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </Card>
              </View>
            )}
          </>
        ) : (
          /* 3PL Subcontractor Section */
          <View style={{ gap: Spacing.xs }}>
            <Text style={styles.fieldLabel}>3PL Subcontractor Carrier</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tpScroll}>
              {thirdPartyProviders.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={[styles.tpCard, thirdPartyProviderId === provider.id && styles.tpCardActive]}
                  onPress={() => setThirdPartyProviderId(provider.id)}
                >
                  <Text style={styles.tpName}>{provider.name}</Text>
                  <Text style={styles.tpPhone}>{provider.phone || 'No phone'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Input
              label="Subcontracted Carrier Cost (SAR)"
              value={thirdPartyCostInput}
              onChangeText={setThirdPartyCostInput}
              placeholder="e.g. 1000"
              keyboardType="numeric"
            />
            <View style={styles.inputsRow}>
              <Input
                label="3PL Driver Name"
                value={thirdPartyDriverName}
                onChangeText={setThirdPartyDriverName}
                placeholder="Driver full name"
                style={{ flex: 1 }}
              />
              <Input
                label="3PL Driver Phone"
                value={thirdPartyDriverPhone}
                onChangeText={setThirdPartyDriverPhone}
                placeholder="Phone number"
                keyboardType="phone-pad"
                style={{ flex: 1 }}
              />
            </View>
            <Input
              label="3PL Vehicle Plate Number"
              value={thirdPartyVehiclePlate}
              onChangeText={setThirdPartyVehiclePlate}
              placeholder="e.g. 1234 ABC"
            />
          </View>
        )}

        {/* Commercial Rates Summary Fields */}
        <View style={styles.financialRatesRow}>
          <Input
            label="Client Billing Rate (SAR)"
            value={rateInput}
            onChangeText={setRateInput}
            placeholder="e.g. 1500"
            keyboardType="numeric"
            style={{ flex: 1 }}
          />
          <Input
            label={fleetType === 'THIRD_PARTY' ? '3PL Cost (SAR)' : 'Driver Fee (SAR)'}
            value={costInput}
            onChangeText={setCostInput}
            placeholder="e.g. 800"
            keyboardType="numeric"
            style={{ flex: 1 }}
          />
        </View>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
  presetChipsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  touchPresetChip: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  touchPresetText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray900,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
  },
  etaBannerText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  fleetToggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  fleetToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  fleetToggleBtnActiveOwn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  fleetToggleBtnActive3PL: {
    backgroundColor: Colors.charcoal,
    borderColor: Colors.charcoal,
  },
  fleetToggleText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  fleetToggleTextActiveOwn: {
    color: Colors.white,
    fontWeight: '800',
  },
  fleetToggleTextActive3PL: {
    color: Colors.white,
    fontWeight: '800',
  },
  recommendedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  recommendedTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  recommendedToggleText: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  recommendedScroll: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  recommendedDriverCard: {
    width: 110,
    alignItems: 'center',
    padding: Spacing.xs,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  recommendedDriverCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  recommendedDriverName: {
    fontSize: Typography.micro,
    fontWeight: '700',
    color: Colors.gray900,
    marginTop: 4,
  },
  recommendedDriverSubtext: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xs,
    height: 38,
  },
  searchBarInput: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.gray900,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  pickerItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  pickerItemText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
  },
  pickerItemSubtext: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  selectedRowTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
  },
  selectedRowSubtext: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.gray200,
    borderRadius: Radius.sm,
  },
  clearBtnText: {
    fontSize: Typography.micro,
    fontWeight: '600',
    color: Colors.gray700,
  },
  coDriverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  coDriverCard: {
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  tpScroll: {
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  tpCard: {
    width: 130,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  tpCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  tpName: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
  },
  tpPhone: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  financialRatesRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
});
