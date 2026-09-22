import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Truck, Clock, MapPin } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { Button, Card, Input, StatusBadge } from '../../components';
import { getApiErrorMessage } from '../../lib/api';
import {
  operatorService, invalidateOperatorTrips,
  type OperatorCustomer, type OperatorDriver, type OperatorVehicle,
  type OperatorLocation, type QuotationLookupMatch,
} from '../../lib/operator';

const ASSIGN_LATER = 'assign_later';

const CreateTripScreen = () => {
  const router = useRouter();
  // Optional: set when arriving from a customer's "Create Trip" action, so the
  // customer arrives pre-selected instead of having to be found in the list.
  const { customerId: presetCustomerId } = useLocalSearchParams<{ customerId?: string }>();

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<OperatorCustomer[]>([]);
  const [drivers, setDrivers] = useState<OperatorDriver[]>([]);
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>([]);

  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [dropoffLat, setDropoffLat] = useState('');
  const [dropoffLng, setDropoffLng] = useState('');
  const [pickupName, setPickupName] = useState('');
  const [dropoffName, setDropoffName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [etaDate, setEtaDate] = useState('');
  const [etaTime, setEtaTime] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');

  // Set when the operator picks a saved Location via search, instead of
  // typing raw coordinates blind. Cleared whenever the name is hand-edited
  // after a pick, so a stale id is never sent for coordinates that no
  // longer match it.
  const [pickupLocationId, setPickupLocationId] = useState<string | undefined>(undefined);
  const [dropoffLocationId, setDropoffLocationId] = useState<string | undefined>(undefined);
  const [pickupResults, setPickupResults] = useState<OperatorLocation[]>([]);
  const [dropoffResults, setDropoffResults] = useState<OperatorLocation[]>([]);
  const [showPickupResults, setShowPickupResults] = useState(false);
  const [showDropoffResults, setShowDropoffResults] = useState(false);

  // Rate & Billing — auto-filled from a matching quotation when one exists,
  // otherwise the operator enters both manually. Same fields the web
  // dashboard's create-trip wizard sends.
  const [quotationMatch, setQuotationMatch] = useState<QuotationLookupMatch | null>(null);
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [manualRateOverride, setManualRateOverride] = useState(false);
  const [billingAmountInput, setBillingAmountInput] = useState('');
  const [driverPayoutInput, setDriverPayoutInput] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingOptions(true);
      setOptionsError(null);
      try {
        const [c, d, v] = await Promise.all([
          operatorService.customers(),
          operatorService.availableDrivers(),
          operatorService.availableVehicles(),
        ]);
        setCustomers(c);
        setDrivers(d);
        setVehicles(v);
      } catch (e) {
        setOptionsError(getApiErrorMessage(e));
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  // Debounced saved-location search — lets the operator pick a known
  // Location instead of typing raw coordinates, without losing the ability
  // to just type coordinates manually.
  useEffect(() => {
    if (!customerId || !pickupName.trim() || pickupLocationId) {
      setPickupResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const results = await operatorService.searchLocations(customerId, pickupName);
        setPickupResults(results);
        setShowPickupResults(true);
      } catch {
        setPickupResults([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [customerId, pickupName, pickupLocationId]);

  useEffect(() => {
    if (!customerId || !dropoffName.trim() || dropoffLocationId) {
      setDropoffResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const results = await operatorService.searchLocations(customerId, dropoffName);
        setDropoffResults(results);
        setShowDropoffResults(true);
      } catch {
        setDropoffResults([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [customerId, dropoffName, dropoffLocationId]);

  const handlePickPickupLocation = (loc: OperatorLocation) => {
    setPickupLocationId(loc.id);
    setPickupName(loc.name);
    if (loc.lat != null) setPickupLat(String(loc.lat));
    if (loc.lng != null) setPickupLng(String(loc.lng));
    setShowPickupResults(false);
  };

  const handlePickDropoffLocation = (loc: OperatorLocation) => {
    setDropoffLocationId(loc.id);
    setDropoffName(loc.name);
    if (loc.lat != null) setDropoffLat(String(loc.lat));
    if (loc.lng != null) setDropoffLng(String(loc.lng));
    setShowDropoffResults(false);
  };

  const selectedVehicleObj = vehicles.find((v) => v.id === selectedVehicle);

  // Auto rate lookup — re-runs whenever the lane or vehicle changes. A
  // failed/no-match lookup falls back to manual entry rather than blocking
  // the form (see operatorService.lookupQuotation).
  useEffect(() => {
    if (!customerId || manualRateOverride) return;
    let cancelled = false;
    (async () => {
      setLookingUpRate(true);
      const match = await operatorService.lookupQuotation({
        customer_id: customerId,
        origin_location_id: pickupLocationId,
        destination_location_id: dropoffLocationId,
        vehicle_type: selectedVehicleObj?.asset_type,
        rate_category: 'SINGLE_TRIP',
        billing_type: 'EXTRA',
      });
      if (!cancelled) {
        setQuotationMatch(match);
        setLookingUpRate(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, pickupLocationId, dropoffLocationId, selectedVehicleObj?.asset_type, manualRateOverride]);

  const effectiveBillingAmount = quotationMatch && !manualRateOverride
    ? quotationMatch.rate
    : parseFloat(billingAmountInput);
  const effectiveDriverPayout = quotationMatch && !manualRateOverride
    ? quotationMatch.driverPayout
    : parseFloat(driverPayoutInput);
  const hasValidRate = Number.isFinite(effectiveBillingAmount) && effectiveBillingAmount > 0
    && Number.isFinite(effectiveDriverPayout) && effectiveDriverPayout > 0;

  const pickupLatNum = parseFloat(pickupLat);
  const pickupLngNum = parseFloat(pickupLng);
  const dropoffLatNum = parseFloat(dropoffLat);
  const dropoffLngNum = parseFloat(dropoffLng);
  const hasValidCoords =
    !Number.isNaN(pickupLatNum) && !Number.isNaN(pickupLngNum) &&
    !Number.isNaN(dropoffLatNum) && !Number.isNaN(dropoffLngNum);

  // Driver/vehicle are no longer required — "Assign Later" is a valid choice,
  // same as the web dashboard's create-trip wizard.
  const isValid = !!customerId && hasValidCoords &&
    !!pickupName.trim() && !!dropoffName.trim() && hasValidRate;

  // date: DD/MM/YYYY, time: HH:MM — both optional, best-effort parse.
  function parseDateTime(dateStr: string, timeStr: string): string | undefined {
    const dateMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) return undefined;
    const [, dd, mm, yyyy] = dateMatch;
    const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/) ?? ['', '0', '0'];
    const [, hh, min] = timeMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  const handleSubmit = async () => {
    if (!isValid || submitting) return;

    const plannedPickup = parseDateTime(date, time);
    const plannedDropoff = parseDateTime(etaDate, etaTime);

    // Matches CreateTripPage's ordering check on the web: a delivery due
    // before its own collection produces a permanently "late" trip that no
    // driver could ever have run on time.
    if (plannedPickup && plannedDropoff && plannedDropoff <= plannedPickup) {
      Alert.alert('Check the times', 'Delivery due must be after the departure time.');
      return;
    }

    setSubmitting(true);
    try {
      await operatorService.createTrip({
        customer_id: customerId,
        driver_id: selectedDriver && selectedDriver !== ASSIGN_LATER ? selectedDriver : undefined,
        vehicle_id: selectedVehicle && selectedVehicle !== ASSIGN_LATER ? selectedVehicle : undefined,
        planned_start: plannedPickup,
        // Both planned times are what every delay figure is measured against.
        // Omitting them (as this screen used to) creates a trip that can never
        // be counted as late, so it silently vanishes from the delay reports.
        planned_end: plannedDropoff,
        billing_amount: effectiveBillingAmount,
        trip_charges: effectiveDriverPayout,
        rate_card_id: quotationMatch && !manualRateOverride ? quotationMatch.quotationId : undefined,
        vehicle_type: selectedVehicleObj?.asset_type,
        rate_category: 'SINGLE_TRIP',
        billing_type: 'EXTRA',
        stops: [
          {
            stop_type: 'Pickup', lat: pickupLatNum, lng: pickupLngNum,
            planned_arrival: plannedPickup,
            location_name: pickupName.trim() || undefined,
            location_id: pickupLocationId,
          },
          {
            stop_type: 'Dropoff', lat: dropoffLatNum, lng: dropoffLngNum,
            planned_arrival: plannedDropoff,
            location_name: dropoffName.trim() || undefined,
            location_id: dropoffLocationId,
          },
        ],
      });
      invalidateOperatorTrips();
      router.back();
    } catch (e) {
      Alert.alert('Could not create trip', getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.gray900} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Trip</Text>
        <View style={styles.placeholder} />
      </View>

      {loadingOptions ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {optionsError ? <Text style={styles.errorText}>{optionsError}</Text> : null}

          {/* Section: Customer */}
          <Text style={styles.sectionTitle}>Customer</Text>
          <Card style={styles.pickerCard}>
            {customers.length === 0 ? (
              <Text style={styles.emptyHint}>No customers found</Text>
            ) : (
              customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pickerItem, customerId === c.id ? styles.pickerItemActive : null]}
                  activeOpacity={0.8}
                  onPress={() => setCustomerId(c.id)}
                >
                  <Text style={[styles.pickerItemText, customerId === c.id ? styles.pickerItemTextActive : null]}>
                    {c.name}
                  </Text>
                  {customerId === c.id && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                </TouchableOpacity>
              ))
            )}
          </Card>

          {/* Section: Route */}
          <Text style={styles.sectionTitle}>Route</Text>
          <Card style={styles.formCard}>
            <View style={styles.formGroup}>
              <Input
                label="Pickup Location name *"
                value={pickupName}
                onChangeText={(t) => { setPickupName(t); setPickupLocationId(undefined); setShowPickupResults(true); }}
                placeholder="Search a saved location, or type a name"
                maxLength={120}
              />
              {pickupLocationId ? (
                <View style={styles.savedLocationChip}>
                  <MapPin size={11} color={Colors.primary} strokeWidth={2.4} />
                  <Text style={styles.savedLocationChipText}>Saved location — coordinates auto-filled</Text>
                </View>
              ) : (
                showPickupResults && pickupResults.length > 0 && (
                  <View style={styles.searchResults}>
                    {pickupResults.map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={styles.searchResultRow}
                        activeOpacity={0.8}
                        onPress={() => handlePickPickupLocation(loc)}
                      >
                        <MapPin size={13} color={Colors.gray500} strokeWidth={2} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.searchResultName}>{loc.name}</Text>
                          {loc.address ? <Text style={styles.searchResultAddress} numberOfLines={1}>{loc.address}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}
              <Text style={styles.label}>Pickup Coordinates (lat, lng)</Text>
              <View style={styles.rowFields}>
                <Input
                  style={{ flex: 1 }}
                  value={pickupLat}
                  onChangeText={setPickupLat}
                  placeholder="Latitude"
                  keyboardType="numeric"
                  state={pickupLocationId ? 'disabled' : 'default'}
                />
                <Input
                  style={{ flex: 1 }}
                  value={pickupLng}
                  onChangeText={setPickupLng}
                  placeholder="Longitude"
                  keyboardType="numeric"
                  state={pickupLocationId ? 'disabled' : 'default'}
                />
              </View>
            </View>
            <View style={styles.formDivider} />
            <View style={styles.formGroup}>
              <Input
                label="Dropoff Location name *"
                value={dropoffName}
                onChangeText={(t) => { setDropoffName(t); setDropoffLocationId(undefined); setShowDropoffResults(true); }}
                placeholder="Search a saved location, or type a name"
                maxLength={120}
              />
              {dropoffLocationId ? (
                <View style={styles.savedLocationChip}>
                  <MapPin size={11} color={Colors.primary} strokeWidth={2.4} />
                  <Text style={styles.savedLocationChipText}>Saved location — coordinates auto-filled</Text>
                </View>
              ) : (
                showDropoffResults && dropoffResults.length > 0 && (
                  <View style={styles.searchResults}>
                    {dropoffResults.map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={styles.searchResultRow}
                        activeOpacity={0.8}
                        onPress={() => handlePickDropoffLocation(loc)}
                      >
                        <MapPin size={13} color={Colors.gray500} strokeWidth={2} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.searchResultName}>{loc.name}</Text>
                          {loc.address ? <Text style={styles.searchResultAddress} numberOfLines={1}>{loc.address}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}
              <Text style={styles.label}>Dropoff Coordinates (lat, lng)</Text>
              <View style={styles.rowFields}>
                <Input
                  style={{ flex: 1 }}
                  value={dropoffLat}
                  onChangeText={setDropoffLat}
                  placeholder="Latitude"
                  keyboardType="numeric"
                  state={dropoffLocationId ? 'disabled' : 'default'}
                />
                <Input
                  style={{ flex: 1 }}
                  value={dropoffLng}
                  onChangeText={setDropoffLng}
                  placeholder="Longitude"
                  keyboardType="numeric"
                  state={dropoffLocationId ? 'disabled' : 'default'}
                />
              </View>
            </View>
          </Card>

          {/* Section: Date & Time */}
          <Text style={styles.sectionTitle}>Departure (Optional)</Text>
          <Card style={styles.formCard}>
            <View style={styles.rowFields}>
              <Input
                style={{ flex: 1 }}
                label="Date"
                value={date}
                onChangeText={setDate}
                placeholder="DD/MM/YYYY"
                keyboardType="numeric"
              />
              <Input
                style={{ flex: 1 }}
                label="Time"
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                keyboardType="numeric"
              />
            </View>
          </Card>

          {/* Delivery due — the baseline every delay figure is measured from. */}
          <Text style={styles.sectionTitle}>Delivery Due (Optional)</Text>
          <Card style={styles.formCard}>
            <View style={styles.rowFields}>
              <Input
                style={{ flex: 1 }}
                label="Date"
                value={etaDate}
                onChangeText={setEtaDate}
                placeholder="DD/MM/YYYY"
                keyboardType="numeric"
              />
              <Input
                style={{ flex: 1 }}
                label="Time"
                value={etaTime}
                onChangeText={setEtaTime}
                placeholder="HH:MM"
                keyboardType="numeric"
              />
            </View>
          </Card>

          {/* Section: Rate & Billing — auto-filled from a matching quotation
              when the customer/route/vehicle match one on file, otherwise
              entered manually. Same fields the web dashboard sends. */}
          <Text style={styles.sectionTitle}>Rate & Billing</Text>
          <Card style={styles.formCard}>
            {lookingUpRate ? (
              <ActivityIndicator color={Colors.primary} />
            ) : quotationMatch && !manualRateOverride ? (
              <View>
                <View style={styles.rateMatchedRow}>
                  <Text style={styles.label}>Customer Billing Rate</Text>
                  <Text style={styles.rateValue}>SAR {quotationMatch.rate.toLocaleString()}</Text>
                </View>
                <View style={styles.rateMatchedRow}>
                  <Text style={styles.label}>Driver Payout</Text>
                  <Text style={styles.rateValue}>SAR {quotationMatch.driverPayout.toLocaleString()}</Text>
                </View>
                <Text style={styles.rateSourceHint}>Matched an existing quotation for this customer & route.</Text>
                <TouchableOpacity onPress={() => setManualRateOverride(true)}>
                  <Text style={styles.rateOverrideLink}>Use a different rate</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {quotationMatch === null && !lookingUpRate && customerId ? (
                  <Text style={styles.rateSourceHint}>No matching quotation found — enter the rate manually.</Text>
                ) : null}
                <Input
                  label="Customer Billing Rate (SAR) *"
                  value={billingAmountInput}
                  onChangeText={setBillingAmountInput}
                  placeholder="0.00"
                  keyboardType="numeric"
                />
                <Input
                  label="Driver Payout (SAR) *"
                  value={driverPayoutInput}
                  onChangeText={setDriverPayoutInput}
                  placeholder="0.00"
                  keyboardType="numeric"
                />
                {quotationMatch && (
                  <TouchableOpacity onPress={() => setManualRateOverride(false)}>
                    <Text style={styles.rateOverrideLink}>Use matched quotation rate instead</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Card>

          {/* Section: Driver */}
          <Text style={styles.sectionTitle}>Assign Driver</Text>
          <Card style={styles.pickerCard}>
            <TouchableOpacity
              style={[styles.driverItem, selectedDriver === ASSIGN_LATER ? styles.driverItemActive : null]}
              activeOpacity={0.8}
              onPress={() => setSelectedDriver(ASSIGN_LATER)}
            >
              <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                <Clock size={20} color={Colors.gray600} strokeWidth={2} />
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>Assign Later</Text>
                <Text style={styles.driverId}>Create the trip without a driver for now</Text>
              </View>
              {selectedDriver === ASSIGN_LATER && <Check size={18} color={Colors.primary} strokeWidth={3} />}
            </TouchableOpacity>
            {drivers.length === 0 ? (
              <Text style={styles.emptyHint}>No available drivers</Text>
            ) : (
              drivers.map((driver) => (
                <TouchableOpacity
                  key={driver.id}
                  style={[styles.driverItem, selectedDriver === driver.id ? styles.driverItemActive : null]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedDriver(driver.id)}
                >
                  <View style={styles.driverAvatar}>
                    <Text style={styles.driverAvatarText}>
                      {`${driver.first_name[0] ?? ''}${driver.last_name[0] ?? ''}`.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={styles.driverName}>{driver.first_name} {driver.last_name}</Text>
                    <Text style={styles.driverId}>{driver.ref_id ?? driver.license_number}</Text>
                  </View>
                  <StatusBadge status="Available" />
                </TouchableOpacity>
              ))
            )}
          </Card>

          {/* Section: Vehicle */}
          <Text style={styles.sectionTitle}>Assign Vehicle</Text>
          <Card style={styles.pickerCard}>
            <TouchableOpacity
              style={[styles.driverItem, selectedVehicle === ASSIGN_LATER ? styles.driverItemActive : null]}
              activeOpacity={0.8}
              onPress={() => setSelectedVehicle(ASSIGN_LATER)}
            >
              <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                <Clock size={20} color={Colors.gray600} strokeWidth={2} />
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>Assign Later</Text>
                <Text style={styles.driverId}>Create the trip without a truck for now</Text>
              </View>
              {selectedVehicle === ASSIGN_LATER && <Check size={18} color={Colors.primary} strokeWidth={3} />}
            </TouchableOpacity>
            {vehicles.length === 0 ? (
              <Text style={styles.emptyHint}>No available vehicles</Text>
            ) : (
              vehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.driverItem, selectedVehicle === v.id ? styles.driverItemActive : null]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedVehicle(v.id)}
                >
                  <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                    <Truck size={22} color={Colors.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={styles.driverName}>{v.plate_number}</Text>
                    <Text style={styles.driverId}>{v.asset_type}</Text>
                  </View>
                  <StatusBadge status="Available" />
                </TouchableOpacity>
              ))
            )}
          </Card>

          <Button
            title={submitting ? 'Creating…' : 'Create Trip'}
            onPress={handleSubmit}
            disabled={!isValid || submitting}
            loading={submitting}
          />

          {!isValid && (
            <Text style={styles.validationHint}>
              Fill in customer, pickup/dropoff details, and the billing rate & driver payout to create the trip. Driver and truck can be Assigned Later.
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Colors.gray900,
  },
  placeholder: {
    width: 40,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.sm,
  },
  errorText: {
    fontSize: Typography.sm,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  pickerCard: {
    borderRadius: Radius.xl,
  },
  emptyHint: {
    padding: Spacing.lg,
    fontSize: Typography.sm,
    color: Colors.gray500,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  pickerItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  pickerItemText: {
    fontSize: Typography.sm,
    color: Colors.gray700,
    fontWeight: '500',
  },
  pickerItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  formCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  formGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formDivider: {
    height: Spacing.md,
  },
  rowFields: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  driverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  driverItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  vehicleAvatarBg: {
    backgroundColor: Colors.gray200,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  driverId: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  validationHint: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    textAlign: 'center',
    marginTop: -Spacing.xs,
  },
  savedLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: Spacing.xs,
  },
  savedLocationChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  searchResults: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    marginTop: 4,
    marginBottom: Spacing.xs,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    backgroundColor: Colors.white,
  },
  searchResultName: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray900,
  },
  searchResultAddress: {
    fontSize: 11,
    color: Colors.gray500,
  },
  rateMatchedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  rateValue: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.gray900,
  },
  rateSourceHint: {
    fontSize: 11,
    color: Colors.gray500,
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
  rateOverrideLink: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
});

export default CreateTripScreen;
