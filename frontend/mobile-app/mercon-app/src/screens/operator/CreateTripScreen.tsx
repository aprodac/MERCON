import React, { useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, RotateCcw, ArrowRight, Building2 } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { Button, Toast } from '../../components';
import { operatorService, invalidateOperatorTrips, CreateTripStopInput } from '../../lib/operator';
import { API_URL } from '../../lib/api';
import { useCreateTripForm } from './hooks/useCreateTripForm';
import { CustomerQuotationSection } from './create-trip/CustomerQuotationSection';
import { RouteSection } from './create-trip/RouteSection';
import { AdditionalChargesSection } from './create-trip/AdditionalChargesSection';
import { ScheduleFleetSection } from './create-trip/ScheduleFleetSection';
import { TripReviewModal } from './create-trip/TripReviewModal';
import { PastDateModal } from './create-trip/PastDateModal';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const baseUrl = API_URL ? API_URL.replace(/\/api\/?$/, '') : 'https://dev.mercon.tech';
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export const CreateTripScreen = () => {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    customerId?: string;
    billingType?: string;
    assignment?: string;
  }>();

  const scrollViewRef = useRef<ScrollView>(null);

  const form = useCreateTripForm(
    searchParams.customerId,
    searchParams.billingType,
    searchParams.assignment
  );

  // Define custom quotation submit handler
  const handleDefineQuotationSubmit = async () => {
    if (!form.customerId) return;
    const rate = parseFloat(form.defineLineRateInput);
    const driverFee = parseFloat(form.defineDriverFeeInput);
    if (isNaN(rate) || rate <= 0) {
      form.showToast('Please enter a valid line rate', 'error');
      return;
    }

    form.setDefiningQuotation(true);
    try {
      const newQuo = await operatorService.createQuotation({
        customer_id: form.customerId,
        origin_name: form.pickupName.trim() || 'Origin',
        origin_location_id: form.pickupLocationId,
        destination_name: form.dropoffName.trim() || 'Destination',
        destination_location_id: form.dropoffLocationId,
        rate,
        driver_payout: isNaN(driverFee) ? undefined : driverFee,
        rate_category: form.defineRateCategory,
        billing_type: form.defineBillingType,
      });

      if (newQuo) {
        form.setQuotations((prev) => [newQuo, ...prev]);
        form.setSelectedQuotationId(newQuo.id);
        form.setRateInput(String(rate));
        if (!isNaN(driverFee)) form.setCostInput(String(driverFee));
        form.setShowDefineQuotationForm(false);
        form.setDefineLineRateInput('');
        form.setDefineDriverFeeInput('');
        form.setHasSavedDraft(false); // Dismiss draft banner when custom quotation is created
        form.showToast('Custom rate card created and selected', 'success');
      }
    } catch (err: any) {
      form.showToast(err?.message || 'Failed to create rate card', 'error');
    } finally {
      form.setDefiningQuotation(false);
    }
  };

  // Submit initiation
  const handleInitiateSubmit = () => {
    if (!form.validatePage1Fields()) {
      form.setPage(1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!form.validatePage2Fields() || form.submitting) return;

    // Check past date
    let isPastDate = false;
    if (form.billingType === 'Monthly') {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      isPastDate = form.selectedMonthlyDates.some((dStr) => {
        const dTs = new Date(`${dStr}T00:00:00`).getTime();
        return !Number.isNaN(dTs) && dTs < cutoff;
      });
    } else {
      const parts = form.date.split('/');
      if (parts.length === 3) {
        const dIso = `${parts[2]}-${parts[1]}-${parts[0]}T${form.time}:00`;
        const plannedTs = new Date(dIso).getTime();
        if (!Number.isNaN(plannedTs) && plannedTs < Date.now() - 5 * 60 * 1000) {
          isPastDate = true;
        }
      }
    }

    if (isPastDate) {
      form.setShowPastDateModal(true);
      return;
    }

    form.setShowReviewModal(true);
  };

  // Primary action button handler for Header top-right
  const handleHeaderAction = () => {
    if (form.page === 1) {
      if (form.validatePage1Fields()) {
        setPageAndScroll(2);
      }
    } else {
      handleInitiateSubmit();
    }
  };

  // Execute Submission
  const executeSubmit = async (isCompletedPastDate = false) => {
    form.setSubmitting(true);
    form.setShowReviewModal(false);
    form.setShowPastDateModal(false);

    try {
      const parts = form.date.split('/');
      const dateIso = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : form.date;
      const plannedPickup = new Date(`${dateIso}T${form.time}:00`).toISOString();

      const dropoffDateIso = form.autoEtaDropoffDate
        ? form.autoEtaDropoffDate.split('/').reverse().join('-')
        : dateIso;
      const dropoffTimeStr = form.autoEtaDropoffTime || form.time;
      const plannedDropoff = new Date(`${dropoffDateIso}T${dropoffTimeStr}:00`).toISOString();

      const pickupLatNum = parseFloat(form.pickupLat) || 0;
      const pickupLngNum = parseFloat(form.pickupLng) || 0;
      const dropoffLatNum = parseFloat(form.dropoffLat) || 0;
      const dropoffLngNum = parseFloat(form.dropoffLng) || 0;

      const stopsPayload: CreateTripStopInput[] = [
        {
          stop_type: 'Pickup',
          leg_index: 0,
          lat: pickupLatNum,
          lng: pickupLngNum,
          planned_arrival: plannedPickup,
          location_name: form.pickupName.trim() || undefined,
          location_id: form.pickupLocationId,
        },
      ];

      form.outboundStops.forEach((s) => {
        const lat = parseFloat(s.lat);
        const lng = parseFloat(s.lng);
        if (s.name.trim() && !Number.isNaN(lat) && !Number.isNaN(lng)) {
          stopsPayload.push({
            stop_type: 'Stop',
            leg_index: 0,
            lat, lng,
            location_name: s.name.trim(),
            location_id: s.locationId,
          });
        }
      });

      stopsPayload.push({
        stop_type: 'Dropoff',
        leg_index: 0,
        lat: dropoffLatNum,
        lng: dropoffLngNum,
        planned_arrival: plannedDropoff,
        location_name: form.dropoffName.trim() || undefined,
        location_id: form.dropoffLocationId,
      });

      if (form.rateCategory === 'ROUND_TRIP' && form.enableReturnLeg) {
        stopsPayload.push({
          stop_type: 'Pickup',
          leg_index: 1,
          lat: dropoffLatNum,
          lng: dropoffLngNum,
          planned_arrival: plannedDropoff,
          location_name: form.dropoffName.trim() || 'Return Pickup',
          location_id: form.dropoffLocationId,
        });

        stopsPayload.push({
          stop_type: 'Dropoff',
          leg_index: 1,
          lat: pickupLatNum,
          lng: pickupLngNum,
          planned_arrival: new Date(new Date(plannedDropoff).getTime() + 4 * 3600000).toISOString(),
          location_name: form.pickupName.trim() || 'Return Dropoff',
          location_id: form.pickupLocationId,
        });
      }

      const formattedCharges = form.additionalCharges.map((c) => ({
        charge_type: c.charge_type,
        rate: c.amount,
        quantity: 1,
        amount: c.amount,
      }));

      if (form.billingType === 'Monthly') {
        const masterDriverId = form.fleetType === 'OWN' && form.driverId !== 'assign_later' ? form.driverId : undefined;
        const masterVehicleId = form.fleetType === 'OWN' && form.vehicleId !== 'assign_later' ? form.vehicleId : undefined;
        const masterCoDriverId = form.fleetType === 'OWN' && form.showCoDriver && form.coDriverId !== 'assign_later' ? form.coDriverId : undefined;
        const masterCoDriverPayout = form.fleetType === 'OWN' && form.showCoDriver && form.coDriverPayoutInput ? parseFloat(form.coDriverPayoutInput) : undefined;

        const durationMs = (parseFloat(form.estimatedHours) || 4) * 3600000;

        const bulkRows: any[] = form.selectedMonthlyDates.map((dStr) => {
          const override = form.dayAssignments[dStr];
          const dDriver = override?.driver_id !== undefined ? (override.driver_id || undefined) : masterDriverId;
          const dVehicle = override?.vehicle_id !== undefined ? (override.vehicle_id || undefined) : masterVehicleId;
          const dCoDriver = override?.co_driver_id !== undefined ? (override.co_driver_id || undefined) : masterCoDriverId;
          const dCoDriverPayout = override?.co_driver_payout !== undefined ? override.co_driver_payout : masterCoDriverPayout;

          const dayStartIso = new Date(`${dStr}T${form.time || '08:00'}:00`).toISOString();
          const dayEndIso = new Date(new Date(dayStartIso).getTime() + durationMs).toISOString();

          const dayStops = stopsPayload.map((s) => ({
            ...s,
            planned_arrival: s.stop_type === 'Pickup' ? dayStartIso : s.stop_type === 'Dropoff' ? dayEndIso : s.planned_arrival,
          }));

          return {
            customer_id: form.customerId,
            driver_id: dDriver,
            vehicle_id: dVehicle,
            co_driver_id: dCoDriver,
            co_driver_payout: dCoDriverPayout,
            planned_start: dayStartIso,
            planned_end: dayEndIso,
            billing_amount: form.effectiveBillingAmount,
            trip_charges: form.fleetType === 'OWN' ? form.financialCost : undefined,
            rate_card_id: form.selectedQuotationId || undefined,
            rate_category: form.rateCategory,
            billing_type: 'Monthly',
            status: isCompletedPastDate ? 'Completed' : 'Scheduled',
            is_third_party: form.fleetType === 'THIRD_PARTY',
            third_party_provider_id: form.fleetType === 'THIRD_PARTY' && form.thirdPartyProviderId ? form.thirdPartyProviderId : undefined,
            third_party_driver_name: form.fleetType === 'THIRD_PARTY' ? form.thirdPartyDriverName : undefined,
            third_party_driver_phone: form.fleetType === 'THIRD_PARTY' ? form.thirdPartyDriverPhone : undefined,
            third_party_vehicle_plate: form.fleetType === 'THIRD_PARTY' ? form.thirdPartyVehiclePlate : undefined,
            third_party_cost: form.fleetType === 'THIRD_PARTY' ? form.financialCost : undefined,
            charges: formattedCharges,
            stops: dayStops,
          };
        });

        const bulkRes = await operatorService.bulkCreateTrips(bulkRows);
        await form.saveToRecentRoutes(form.pickupName.trim(), form.dropoffName.trim());
        await form.discardDraft();
        invalidateOperatorTrips();
        form.showToast(`${bulkRes.imported ?? bulkRows.length} Monthly Duty trips created successfully!`, 'success');
        setTimeout(() => router.replace('/' as any), 1000);
      } else {
        // Single Trip Creation
        const payload: any = {
          customer_id: form.customerId,
          driver_id: form.fleetType === 'OWN' && form.driverId !== 'assign_later' ? form.driverId : undefined,
          vehicle_id: form.fleetType === 'OWN' && form.vehicleId !== 'assign_later' ? form.vehicleId : undefined,
          co_driver_id: form.fleetType === 'OWN' && form.showCoDriver && form.coDriverId !== 'assign_later' ? form.coDriverId : undefined,
          co_driver_payout: form.fleetType === 'OWN' && form.showCoDriver && form.coDriverPayoutInput ? parseFloat(form.coDriverPayoutInput) : undefined,
          planned_start: plannedPickup,
          planned_end: plannedDropoff,
          billing_amount: form.effectiveBillingAmount,
          trip_charges: form.fleetType === 'OWN' ? form.financialCost : undefined,
          rate_card_id: form.selectedQuotationId || undefined,
          rate_category: form.rateCategory,
          billing_type: form.billingType,
          status: isCompletedPastDate ? 'Completed' : 'Scheduled',
          is_third_party: form.fleetType === 'THIRD_PARTY',
          third_party_provider_id: form.fleetType === 'THIRD_PARTY' && form.thirdPartyProviderId ? form.thirdPartyProviderId : undefined,
          third_party_driver_name: form.fleetType === 'THIRD_PARTY' ? form.thirdPartyDriverName : undefined,
          third_party_driver_phone: form.fleetType === 'THIRD_PARTY' ? form.thirdPartyDriverPhone : undefined,
          third_party_vehicle_plate: form.fleetType === 'THIRD_PARTY' ? form.thirdPartyVehiclePlate : undefined,
          third_party_cost: form.fleetType === 'THIRD_PARTY' ? form.financialCost : undefined,
          charges: formattedCharges,
          stops: stopsPayload,
        };

        await operatorService.createTrip(payload);
        await form.saveToRecentRoutes(form.pickupName.trim(), form.dropoffName.trim());
        await form.discardDraft();
        invalidateOperatorTrips();
        form.showToast('Trip created & dispatched successfully!', 'success');
        setTimeout(() => router.replace('/' as any), 1000);
      }
    } catch (err: any) {
      form.showToast(err?.message || 'Failed to create trip', 'error');
    } finally {
      form.setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header Bar with Top-Right Primary Action Button & Customer Company Profile Pic */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.charcoal} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          {form.selectedCustomerObj && (
            (() => {
              const logoUri = resolveMediaUrl(
                form.selectedCustomerObj.logo_url ||
                (form.selectedCustomerObj as any).avatar_url ||
                (form.selectedCustomerObj as any).logo
              );
              return logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.headerCustomerLogo} resizeMode="cover" />
              ) : (
                <View style={styles.headerCustomerIconFallback}>
                  <Building2 size={12} color={Colors.primary} />
                </View>
              );
            })()
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>
            Create New Trip
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={handleHeaderAction}
          disabled={form.submitting}
        >
          <Text style={styles.headerActionBtnText}>
            {form.page === 1 ? 'Next →' : form.submitting ? 'Creating…' : 'Review →'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stepper Bar (Equal 50% Width — No Horizontal Overflow) */}
      <View style={styles.stepperBar}>
        <TouchableOpacity
          style={[styles.stepperTab, form.page === 1 && styles.stepperTabActive]}
          activeOpacity={0.8}
          onPress={() => setPageAndScroll(1)}
        >
          <View style={[styles.stepperDot, form.page === 1 && styles.stepperDotActive]}>
            <Text style={[styles.stepperDotText, form.page === 1 && styles.stepperDotTextActive]}>1</Text>
          </View>
          <Text style={[styles.stepperTabText, form.page === 1 && styles.stepperTabTextActive]} numberOfLines={1}>
            Route & Scope
          </Text>
        </TouchableOpacity>

        <View style={styles.stepperLine} />

        <TouchableOpacity
          style={[styles.stepperTab, form.page === 2 && styles.stepperTabActive]}
          activeOpacity={0.8}
          onPress={() => {
            if (form.validatePage1Fields()) {
              setPageAndScroll(2);
            }
          }}
        >
          <View style={[styles.stepperDot, form.page === 2 && styles.stepperDotActive]}>
            <Text style={[styles.stepperDotText, form.page === 2 && styles.stepperDotTextActive]}>2</Text>
          </View>
          <Text style={[styles.stepperTabText, form.page === 2 && styles.stepperTabTextActive]} numberOfLines={1}>
            Schedule & Fleet
          </Text>
        </TouchableOpacity>
      </View>

      {form.loadingOptions ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
      ) : (
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Inline Unsaved Draft Banner (Not Floating / Overlapping) */}
          {form.hasSavedDraft && (
            <View style={styles.draftBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <RotateCcw size={14} color={Colors.primary} />
                <Text style={styles.draftBannerText}>Unsaved draft from earlier session.</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={styles.draftRestoreBtn} onPress={form.restoreDraft}>
                  <Text style={styles.draftRestoreText}>Restore</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.draftDiscardBtn} onPress={form.discardDraft}>
                  <Text style={styles.draftDiscardText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {form.optionsError ? <Text style={styles.errorText}>{form.optionsError}</Text> : null}

          {/* PAGE 1: Commercial Rates, Route & Additional Charges */}
          {form.page === 1 && (
            <>
              <CustomerQuotationSection
                customerId={form.customerId}
                setCustomerId={form.setCustomerId}
                customerSearchQuery={form.customerSearchQuery}
                setCustomerSearchQuery={form.setCustomerSearchQuery}
                selectedCustomerObj={form.selectedCustomerObj}
                customers={form.customers}
                activeCustomerQuotations={form.activeCustomerQuotations}
                activeQuotationRates={form.activeQuotationRates}
                selectedQuotationId={form.selectedQuotationId}
                setSelectedQuotationId={form.setSelectedQuotationId}
                lineTypeFilter={form.lineTypeFilter}
                setLineTypeFilter={form.setLineTypeFilter}
                billingType={form.billingType}
                setBillingType={form.setBillingType}
                showDefineQuotationForm={form.showDefineQuotationForm}
                setShowDefineQuotationForm={form.setShowDefineQuotationForm}
                defineRateCategory={form.defineRateCategory}
                setDefineRateCategory={form.setDefineRateCategory}
                defineLineRateInput={form.defineLineRateInput}
                setDefineLineRateInput={form.setDefineLineRateInput}
                defineDriverFeeInput={form.defineDriverFeeInput}
                setDefineDriverFeeInput={form.setDefineDriverFeeInput}
                defineBillingType={form.defineBillingType}
                setDefineBillingType={form.setDefineBillingType}
                definingQuotation={form.definingQuotation}
                onDefineQuotationSubmit={handleDefineQuotationSubmit}
              />

              <RouteSection
                pickupName={form.pickupName}
                setPickupName={form.setPickupName}
                pickupLat={form.pickupLat}
                setPickupLat={form.setPickupLat}
                pickupLng={form.pickupLng}
                setPickupLng={form.setPickupLng}
                pickupLocationId={form.pickupLocationId}
                setPickupLocationId={form.setPickupLocationId}
                dropoffName={form.dropoffName}
                setDropoffName={form.setDropoffName}
                dropoffLat={form.dropoffLat}
                setDropoffLat={form.setDropoffLat}
                dropoffLng={form.dropoffLng}
                setDropoffLng={form.setDropoffLng}
                dropoffLocationId={form.dropoffLocationId}
                setDropoffLocationId={form.setDropoffLocationId}
                outboundStops={form.outboundStops}
                savedRecentRoutes={form.savedRecentRoutes}
                locations={form.locations}
                rateCategory={form.rateCategory}
                setRateCategory={form.setRateCategory}
                enableReturnLeg={form.enableReturnLeg}
                setEnableReturnLeg={form.setEnableReturnLeg}
                returnLegDriverFeeInput={form.returnLegDriverFeeInput}
                setReturnLegDriverFeeInput={form.setReturnLegDriverFeeInput}
                returnLegRateInput={form.returnLegRateInput}
                setReturnLegRateInput={form.setReturnLegRateInput}
                onAddStop={form.handleAddStop}
                onRemoveStop={form.handleRemoveStop}
                onUpdateStop={form.handleUpdateStop}
                onSelectStopLocation={form.handleSelectStopLocation}
                onRecalculateTravelTime={form.handleRecalculateTravelTime}
                onSaveRecentRoute={form.saveToRecentRoutes}
              />

              <AdditionalChargesSection
                charges={form.additionalCharges}
                customChargeType={form.customChargeType}
                setCustomChargeType={form.setCustomChargeType}
                customChargeAmount={form.customChargeAmount}
                setCustomChargeAmount={form.setCustomChargeAmount}
                onAddPreset={form.handleAddPresetCharge}
                onAddCustomCharge={form.handleAddCustomCharge}
                onRemoveCharge={form.handleRemoveCharge}
              />

              <View style={{ marginTop: Spacing.sm }}>
                <Button
                  title="Continue to Schedule & Fleet →"
                  onPress={() => {
                    if (form.validatePage1Fields()) {
                      setPageAndScroll(2);
                    }
                  }}
                />
              </View>
            </>
          )}

          {/* PAGE 2: Schedule & Fleet Execution */}
          {form.page === 2 && (
            <>
              <ScheduleFleetSection
                date={form.date}
                setDate={form.setDate}
                time={form.time}
                setTime={form.setTime}
                estimatedHours={form.estimatedHours}
                setEstimatedHours={form.setEstimatedHours}
                isEstTravelCalculated={form.isEstTravelCalculated}
                autoEtaDropoffDate={form.autoEtaDropoffDate}
                autoEtaDropoffTime={form.autoEtaDropoffTime}
                onCalculateAutoEta={form.calculateAutoEta}
                billingType={form.billingType}
                selectedMonthlyDates={form.selectedMonthlyDates}
                setSelectedMonthlyDates={form.setSelectedMonthlyDates}
                monthlyCurrentMonth={form.monthlyCurrentMonth}
                setMonthlyCurrentMonth={form.setMonthlyCurrentMonth}
                monthlyAssignmentMode={form.monthlyAssignmentMode}
                setMonthlyAssignmentMode={form.handleStrategyChange}
                rotationCount={form.rotationCount}
                onRotationCountChange={(cnt) => form.handleStrategyChange('ROTATION', cnt)}
                rotationDrivers={form.rotationDrivers}
                rotationVehicles={form.rotationVehicles}
                onUpdateRotationDriver={form.handleUpdateRotationDriver}
                onUpdateRotationVehicle={form.handleUpdateRotationVehicle}
                onDuplicateFirstDayToAll={form.handleDuplicateFirstDayToAll}
                dayAssignments={form.dayAssignments}
                setDayAssignments={form.setDayAssignments}
                fleetType={form.fleetType}
                setFleetType={form.setFleetType}
                driverId={form.driverId}
                setDriverId={form.setDriverId}
                driverSearchQuery={form.driverSearchQuery}
                setDriverSearchQuery={form.setDriverSearchQuery}
                drivers={form.drivers}
                selectedDriverObj={form.selectedDriverObj}
                showRecommendedDrivers={form.showRecommendedDrivers}
                setShowRecommendedDrivers={form.setShowRecommendedDrivers}
                showCoDriver={form.showCoDriver}
                setShowCoDriver={form.setShowCoDriver}
                coDriverId={form.coDriverId}
                setCoDriverId={form.setCoDriverId}
                coDriverPayoutInput={form.coDriverPayoutInput}
                setCoDriverPayoutInput={form.setCoDriverPayoutInput}
                coDriverSearchQuery={form.coDriverSearchQuery}
                setCoDriverSearchQuery={form.setCoDriverSearchQuery}
                selectedCoDriverObj={form.selectedCoDriverObj}
                vehicleId={form.vehicleId}
                setVehicleId={form.setVehicleId}
                vehicleSearchQuery={form.vehicleSearchQuery}
                setVehicleSearchQuery={form.setVehicleSearchQuery}
                vehicles={form.vehicles}
                selectedVehicleObj={form.selectedVehicleObj}
                thirdPartyProviderId={form.thirdPartyProviderId}
                setThirdPartyProviderId={form.setThirdPartyProviderId}
                thirdPartyProviders={form.thirdPartyProviders}
                thirdPartyCostInput={form.thirdPartyCostInput}
                setThirdPartyCostInput={form.setThirdPartyCostInput}
                thirdPartyDriverName={form.thirdPartyDriverName}
                setThirdPartyDriverName={form.setThirdPartyDriverName}
                thirdPartyDriverPhone={form.thirdPartyDriverPhone}
                setThirdPartyDriverPhone={form.setThirdPartyDriverPhone}
                thirdPartyVehiclePlate={form.thirdPartyVehiclePlate}
                setThirdPartyVehiclePlate={form.setThirdPartyVehiclePlate}
                rateInput={form.rateInput}
                setRateInput={form.setRateInput}
                costInput={form.costInput}
                setCostInput={form.setCostInput}
                formatDateDDMMYYYY={formatDateDDMMYYYY}
              />

              <View style={styles.navBottomRow}>
                <TouchableOpacity style={styles.backStepBtn} onPress={() => setPageAndScroll(1)}>
                  <Text style={styles.backStepBtnText}>← Back</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Button
                    title={form.submitting ? 'Creating…' : 'Review & Create Trip'}
                    onPress={handleInitiateSubmit}
                    disabled={form.submitting}
                    loading={form.submitting}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Modals */}
      <PastDateModal
        visible={form.showPastDateModal}
        onClose={() => form.setShowPastDateModal(false)}
        onConfirmCompleted={() => executeSubmit(true)}
        onConfirmScheduled={() => executeSubmit(false)}
      />

      <TripReviewModal
        visible={form.showReviewModal}
        onClose={() => form.setShowReviewModal(false)}
        onConfirmSubmit={() => executeSubmit(false)}
        submitting={form.submitting}
        selectedCustomerObj={form.selectedCustomerObj}
        rateCategory={form.rateCategory}
        billingType={form.billingType}
        selectedMonthlyDates={form.selectedMonthlyDates}
        monthlyCurrentMonth={form.monthlyCurrentMonth}
        monthlyAssignmentMode={form.monthlyAssignmentMode}
        dayAssignmentsCount={Object.keys(form.dayAssignments).length}
        pickupName={form.pickupName}
        dropoffName={form.dropoffName}
        outboundStops={form.outboundStops}
        fleetType={form.fleetType}
        selected3PLProviderObj={form.selected3PLProviderObj}
        thirdPartyDriverName={form.thirdPartyDriverName}
        thirdPartyDriverPhone={form.thirdPartyDriverPhone}
        thirdPartyVehiclePlate={form.thirdPartyVehiclePlate}
        selectedDriverObj={form.selectedDriverObj}
        showCoDriver={form.showCoDriver}
        selectedCoDriverObj={form.selectedCoDriverObj}
        coDriverPayoutInput={form.coDriverPayoutInput}
        selectedVehicleObj={form.selectedVehicleObj}
        baseBillingRate={form.baseBillingRate}
        totalAdditionalCharges={form.totalAdditionalCharges}
        effectiveBillingAmount={form.effectiveBillingAmount}
        financialCost={form.financialCost}
        netMargin={form.netMargin}
        marginPercent={form.marginPercent}
      />

      <Toast
        visible={form.toastVisible}
        message={form.toastMessage}
        type={form.toastType}
        onDismiss={() => form.setToastVisible(false)}
      />
    </SafeAreaView>
  );

  function setPageAndScroll(p: 1 | 2) {
    form.setPage(p);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }
};

export default CreateTripScreen;

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.coolGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  headerCustomerLogo: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  headerCustomerIconFallback: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: Typography.headingS.fontWeight,
    color: Colors.charcoal,
  },
  headerActionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  headerActionBtnText: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: Colors.white,
  },
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  stepperTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stepperTabActive: {},
  stepperDot: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDotActive: {
    backgroundColor: Colors.primary,
  },
  stepperDotText: {
    fontSize: Typography.micro,
    fontWeight: '700',
    color: Colors.gray700,
  },
  stepperDotTextActive: {
    color: Colors.white,
  },
  stepperTabText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray500,
    flexShrink: 1,
  },
  stepperTabTextActive: {
    color: Colors.charcoal,
    fontWeight: '800',
  },
  stepperLine: {
    width: 24,
    height: 1,
    backgroundColor: Colors.gray300,
    marginHorizontal: 4,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(250, 99, 78, 0.25)',
  },
  draftBannerText: {
    fontSize: Typography.micro,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  draftRestoreBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  draftRestoreText: {
    fontSize: Typography.micro,
    fontWeight: '700',
    color: Colors.white,
  },
  draftDiscardBtn: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
  },
  draftDiscardText: {
    fontSize: Typography.micro,
    color: Colors.gray600,
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  errorText: {
    fontSize: Typography.xs,
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  navBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  backStepBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray200,
  },
  backStepBtnText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray700,
  },
});
