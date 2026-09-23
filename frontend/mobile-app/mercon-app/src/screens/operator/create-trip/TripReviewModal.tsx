import React from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { Colors, Spacing, Typography, Radius } from '../../../theme/tokens';
import { Button } from '../../../components/Button';
import { AppModal } from '../../../components/common/AppModal';
import { OperatorCustomer, OperatorDriver, OperatorVehicle, OperatorThirdPartyProvider } from '../../../lib/operator';
import { API_URL } from '../../../lib/api';
import { RateCategoryType, IntermediateStop } from '../hooks/useCreateTripForm';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const baseUrl = API_URL ? API_URL.replace(/\/api\/?$/, '') : 'https://dev.mercon.tech';
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

interface TripReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmSubmit: () => void;
  submitting: boolean;
  selectedCustomerObj?: OperatorCustomer | null;
  rateCategory: RateCategoryType;
  billingType: 'Monthly' | 'Extra';
  selectedMonthlyDates: string[];
  monthlyCurrentMonth: Date;
  monthlyAssignmentMode: 'MASTER' | 'PER_DAY' | 'ROTATION';
  dayAssignmentsCount: number;
  pickupName: string;
  dropoffName: string;
  outboundStops: IntermediateStop[];
  fleetType: 'OWN' | 'THIRD_PARTY';
  selected3PLProviderObj?: OperatorThirdPartyProvider | null;
  thirdPartyDriverName: string;
  thirdPartyDriverPhone: string;
  thirdPartyVehiclePlate: string;
  selectedDriverObj?: OperatorDriver | null;
  showCoDriver: boolean;
  selectedCoDriverObj?: OperatorDriver | null;
  coDriverPayoutInput: string;
  selectedVehicleObj?: OperatorVehicle | null;
  baseBillingRate: number;
  totalAdditionalCharges: number;
  effectiveBillingAmount: number;
  financialCost: number;
  netMargin: number;
  marginPercent: number;
}

export const TripReviewModal: React.FC<TripReviewModalProps> = ({
  visible,
  onClose,
  onConfirmSubmit,
  submitting,
  selectedCustomerObj,
  rateCategory,
  billingType,
  selectedMonthlyDates,
  monthlyCurrentMonth,
  monthlyAssignmentMode,
  dayAssignmentsCount,
  pickupName,
  dropoffName,
  outboundStops,
  fleetType,
  selected3PLProviderObj,
  thirdPartyDriverName,
  thirdPartyDriverPhone,
  thirdPartyVehiclePlate,
  selectedDriverObj,
  showCoDriver,
  selectedCoDriverObj,
  coDriverPayoutInput,
  selectedVehicleObj,
  baseBillingRate,
  totalAdditionalCharges,
  effectiveBillingAmount,
  financialCost,
  netMargin,
  marginPercent,
}) => {
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      type="dialog"
      title="Review Trip Summary"
    >
      <ScrollView style={{ maxHeight: 440, marginVertical: Spacing.sm }} nestedScrollEnabled>
        <View style={styles.reviewSection}>
          <Text style={styles.reviewHeading}>Customer & Scope</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {(() => {
              const cLogo = resolveMediaUrl(
                selectedCustomerObj?.logo_url ||
                (selectedCustomerObj as any)?.avatar_url ||
                (selectedCustomerObj as any)?.logo
              );
              return cLogo ? (
                <Image source={{ uri: cLogo }} style={styles.reviewCustomerLogo} resizeMode="cover" />
              ) : (
                <View style={styles.reviewCustomerIconFallback}>
                  <Building2 size={12} color={Colors.primary} />
                </View>
              );
            })()}
            <Text style={styles.reviewText}>{selectedCustomerObj?.name ?? '—'}</Text>
          </View>
          <Text style={styles.reviewSubtext}>
            Rate Category: {rateCategory === 'ROUND_TRIP' ? 'Round Trip (Return Leg)' : 'Single Trip'}
          </Text>
          <Text style={styles.reviewSubtext}>
            Billing Type: {billingType === 'Monthly' ? 'Monthly Duty Schedule' : 'Spot / Extra'}
          </Text>
        </View>

        {billingType === 'Monthly' && (
          <View style={styles.reviewSection}>
            <Text style={styles.reviewHeading}>Monthly Duty Schedule Summary</Text>
            <Text style={styles.reviewText}>
              {selectedMonthlyDates.length} Trips across{' '}
              {monthlyCurrentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <Text style={styles.reviewSubtext}>
              Assignment Mode: {monthlyAssignmentMode === 'PER_DAY' ? 'Per-Day Overrides' : 'Master Assignment'}
            </Text>
            {dayAssignmentsCount > 0 && (
              <Text style={[styles.reviewSubtext, { color: Colors.primary, fontWeight: '700', marginTop: 2 }]}>
                {dayAssignmentsCount} date(s) with custom driver/truck overrides
              </Text>
            )}
          </View>
        )}

        <View style={styles.reviewSection}>
          <Text style={styles.reviewHeading}>Route Breakdown</Text>
          <Text style={styles.reviewText}>Pickup: {pickupName || '—'}</Text>
          {outboundStops.map((s, idx) => (
            <Text key={s.id} style={styles.reviewSubtext}>Stop #{idx + 1}: {s.name}</Text>
          ))}
          <Text style={styles.reviewText}>Dropoff: {dropoffName || '—'}</Text>
        </View>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewHeading}>Execution & Fleet</Text>
          {fleetType === 'THIRD_PARTY' ? (
            <>
              <Text style={styles.reviewText}>3PL Provider: {selected3PLProviderObj?.name ?? 'Third-Party'}</Text>
              <Text style={styles.reviewSubtext}>
                Driver: {thirdPartyDriverName || 'Unassigned'} ({thirdPartyDriverPhone || 'No phone'})
              </Text>
              <Text style={styles.reviewSubtext}>Plate: {thirdPartyVehiclePlate || 'Unassigned'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.reviewText}>
                Driver: {selectedDriverObj ? `${selectedDriverObj.first_name} ${selectedDriverObj.last_name}` : 'Assign Later'}
              </Text>
              {showCoDriver && selectedCoDriverObj && (
                <Text style={styles.reviewSubtext}>
                  Co-Driver: {selectedCoDriverObj.first_name} {selectedCoDriverObj.last_name} (
                  {coDriverPayoutInput ? `SAR ${coDriverPayoutInput}` : '50/50 Split'})
                </Text>
              )}
              <Text style={styles.reviewSubtext}>
                Truck: {selectedVehicleObj?.plate_number ?? 'Assign Later'}
              </Text>
            </>
          )}
        </View>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewHeading}>Financial Breakdown</Text>
          <Text style={styles.reviewSubtext}>Base Rate: SAR {baseBillingRate.toLocaleString()}</Text>
          <Text style={styles.reviewSubtext}>Surcharges: SAR {totalAdditionalCharges.toLocaleString()}</Text>
          <Text style={styles.reviewText}>Total Billing: SAR {effectiveBillingAmount.toLocaleString()}</Text>
          <Text style={styles.reviewSubtext}>
            {fleetType === 'THIRD_PARTY' ? '3PL Cost:' : 'Driver Payout:'} SAR {financialCost.toLocaleString()}
          </Text>
          <Text style={[styles.reviewText, { color: netMargin >= 0 ? Colors.success : Colors.error }]}>
            Margin: SAR {netMargin.toLocaleString()} ({marginPercent.toFixed(1)}%)
          </Text>
        </View>
      </ScrollView>

      <View style={styles.actionContainer}>
        <Button title="Confirm & Dispatch Trip" onPress={onConfirmSubmit} loading={submitting} disabled={submitting} />
        <Button title="Back to Edit" variant="outline" onPress={onClose} disabled={submitting} />
      </View>
    </AppModal>
  );
};

const styles = StyleSheet.create({
  reviewSection: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  reviewHeading: {
    fontSize: Typography.subcaption,
    fontWeight: '700',
    color: Colors.gray500,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reviewCustomerLogo: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  reviewCustomerIconFallback: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
    marginBottom: 2,
  },
  reviewSubtext: {
    fontSize: Typography.xs,
    color: Colors.gray600,
  },
  actionContainer: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
});
