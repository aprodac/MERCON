import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Image } from 'react-native';
import { Search, X, Check, Building2, Plus } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../../theme/tokens';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { StatusBadge } from '../../../components/Badge';
import { OperatorCustomer, OperatorQuotation } from '../../../lib/operator';
import { RateCategoryType } from '../hooks/useCreateTripForm';
import { API_URL } from '../../../lib/api';
import { filterQuotationsBySearch } from '../../../lib/quotationSearch';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const baseUrl = API_URL ? API_URL.replace(/\/api\/?$/, '') : 'https://dev.mercon.tech';
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

interface CustomerQuotationSectionProps {
  customerId: string;
  setCustomerId: (id: string) => void;
  customerSearchQuery: string;
  setCustomerSearchQuery: (query: string) => void;
  selectedCustomerObj: OperatorCustomer | null;
  customers: OperatorCustomer[];
  activeCustomerQuotations: OperatorQuotation[];
  activeQuotationRates: Array<{ quotation: OperatorQuotation; route: any }>;
  selectedQuotationId: string;
  setSelectedQuotationId: (id: string) => void;
  lineTypeFilter: 'ALL' | RateCategoryType;
  setLineTypeFilter: (filter: 'ALL' | RateCategoryType) => void;
  billingType: 'Monthly' | 'Extra';
  setBillingType: (val: 'Monthly' | 'Extra') => void;
  showDefineQuotationForm: boolean;
  setShowDefineQuotationForm: (val: boolean) => void;
  defineRateCategory: RateCategoryType;
  setDefineRateCategory: (val: RateCategoryType) => void;
  defineLineRateInput: string;
  setDefineLineRateInput: (val: string) => void;
  defineDriverFeeInput: string;
  setDefineDriverFeeInput: (val: string) => void;
  defineBillingType: 'Monthly' | 'Extra';
  setDefineBillingType: (val: 'Monthly' | 'Extra') => void;
  definingQuotation: boolean;
  onDefineQuotationSubmit: () => void;
}

export const CustomerQuotationSection: React.FC<CustomerQuotationSectionProps> = ({
  customerId,
  setCustomerId,
  customerSearchQuery,
  setCustomerSearchQuery,
  selectedCustomerObj,
  customers,
  activeCustomerQuotations,
  activeQuotationRates,
  selectedQuotationId,
  setSelectedQuotationId,
  lineTypeFilter,
  setLineTypeFilter,
  billingType,
  setBillingType,
  showDefineQuotationForm,
  setShowDefineQuotationForm,
  defineRateCategory,
  setDefineRateCategory,
  defineLineRateInput,
  setDefineLineRateInput,
  defineDriverFeeInput,
  setDefineDriverFeeInput,
  defineBillingType,
  setDefineBillingType,
  definingQuotation,
  onDefineQuotationSubmit,
}) => {
  const filteredCustomers = customers.filter((c) => {
    const phone = (c as any).phone || c.contact_phone || c.primary_contact_phone || '';
    return (
      c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
      phone.includes(customerSearchQuery)
    );
  });

  const selectedLogo = resolveMediaUrl(
    selectedCustomerObj?.logo_url ||
    (selectedCustomerObj as any)?.avatar_url ||
    (selectedCustomerObj as any)?.logo ||
    (selectedCustomerObj as any)?.image_url
  );

  const [quotationSearchQuery, setQuotationSearchQuery] = React.useState('');

  const filteredQuotations = React.useMemo(() => {
    if (activeCustomerQuotations.length === 0) return [];
    return filterQuotationsBySearch(activeCustomerQuotations as any, quotationSearchQuery, lineTypeFilter);
  }, [activeCustomerQuotations, quotationSearchQuery, lineTypeFilter]);

  const filteredQuotationRates = React.useMemo(() => {
    if (filteredQuotations.length === 0) return [];
    const matchingIds = new Set(filteredQuotations.map((q) => q.id));
    return activeQuotationRates.filter(({ quotation }) => matchingIds.has(quotation.id));
  }, [activeQuotationRates, filteredQuotations]);

  const lineTypeOptions: Array<{ id: 'ALL' | RateCategoryType; label: string }> = [
    { id: 'ALL', label: 'All Rates' },
    { id: 'SINGLE_TRIP', label: 'Single Trip' },
    { id: 'ROUND_TRIP', label: 'Round Trip' },
    { id: '10_HRS', label: '10 Hrs' },
    { id: '12_HRS', label: '12 Hrs' },
  ];

  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>1. Customer & Rates</Text>

      {!customerId ? (
        <View style={{ gap: Spacing.xs }}>
          <View style={styles.searchBarContainer}>
            <Search size={16} color={Colors.gray500} />
            <TextInput
              style={styles.searchBarInput}
              value={customerSearchQuery}
              onChangeText={setCustomerSearchQuery}
              placeholder="Search customer company name..."
              placeholderTextColor={Colors.gray400}
            />
            {customerSearchQuery ? (
              <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                <X size={16} color={Colors.gray500} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            {filteredCustomers.map((c) => {
              const cLogo = resolveMediaUrl(
                c.logo_url || (c as any).avatar_url || (c as any).logo || (c as any).image_url
              );
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.customerCard}
                  onPress={() => setCustomerId(c.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.customerCardHeader}>
                    {cLogo ? (
                      <Image source={{ uri: cLogo }} style={styles.customerLogo} resizeMode="cover" />
                    ) : (
                      <View style={styles.customerIconFallback}>
                        <Building2 size={14} color={Colors.primary} />
                      </View>
                    )}
                    <Text style={styles.customerCardTitle} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </View>
                  <Text style={styles.customerCardPhone}>
                    {(c as any).phone || c.contact_phone || c.primary_contact_phone || 'No Phone'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.selectedCustomerCard}>
          <View style={styles.selectedCustomerHeader}>
            {selectedLogo ? (
              <Image source={{ uri: selectedLogo }} style={styles.selectedCustomerLogo} resizeMode="cover" />
            ) : (
              <View style={styles.selectedCustomerIconFallback}>
                <Building2 size={18} color={Colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedCustomerTitle}>{selectedCustomerObj?.name}</Text>
              <Text style={styles.selectedCustomerSubtext}>
                {(selectedCustomerObj as any)?.phone || selectedCustomerObj?.contact_phone || selectedCustomerObj?.primary_contact_phone || 'No phone'}
              </Text>
            </View>
            <TouchableOpacity style={styles.changeCustomerBtn} onPress={() => setCustomerId('')}>
              <Text style={styles.changeCustomerText}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Rate Search Bar (Directional e.g. "Riyadh to Hail", Budget "<2000") */}
          <View style={styles.searchBarContainer}>
            <Search size={14} color={Colors.gray500} />
            <TextInput
              style={styles.searchBarInput}
              value={quotationSearchQuery}
              onChangeText={setQuotationSearchQuery}
              placeholder="Search rate cards (e.g. Riyadh to Hail, <2000)..."
              placeholderTextColor={Colors.gray400}
            />
            {quotationSearchQuery ? (
              <TouchableOpacity onPress={() => setQuotationSearchQuery('')}>
                <X size={14} color={Colors.gray500} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Line Type Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {lineTypeOptions.map((opt) => {
              const isChipActive = lineTypeFilter === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.filterChip, isChipActive && styles.filterChipActive]}
                  onPress={() => setLineTypeFilter(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, isChipActive && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active Rate Cards Carousel — Shows Directional & Filtered Customer Quotations */}
          {filteredQuotationRates.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratesCarousel}>
              {filteredQuotationRates.map(({ quotation, route }) => {
                const isSelected = selectedQuotationId === quotation.id;
                const qNum = (quotation as any).quotation_number || quotation.name || `QUO-${quotation.id.slice(0, 6)}`;
                const qStatus = (quotation as any).status || (quotation.is_active !== false ? 'Active' : 'Inactive');
                const bType = (quotation as any).billing_type || (quotation as any).operation_type || 'Rate Card';

                return (
                  <TouchableOpacity
                    key={`${quotation.id}-${route.id || route.rate}`}
                    style={[styles.rateCard, isSelected && styles.rateCardActive]}
                    onPress={() => setSelectedQuotationId(isSelected ? '' : quotation.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.rateCardHeader}>
                      <Text style={styles.rateCardNumber} numberOfLines={1}>{qNum}</Text>
                      <StatusBadge status={qStatus} />
                    </View>
                    <Text style={styles.rateCardLane} numberOfLines={1}>
                      {route.origin_name || route.origin || 'Origin'} → {route.destination_name || route.dest || 'Destination'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={styles.rateCardPrice}>SAR {(route.rate ?? quotation.rate)?.toLocaleString() ?? '—'}</Text>
                      <Text style={styles.rateCardTypeTag}>{bType}</Text>
                    </View>
                    {isSelected && (
                      <View style={styles.selectedCheckBadge}>
                        <Check size={12} color={Colors.white} strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.noQuotationBanner}>
              <Text style={styles.noQuotationText}>
                {activeCustomerQuotations.length === 0
                  ? 'No commercial rate cards found for this customer.'
                  : 'No rate cards match your search / filter criteria.'}
              </Text>
            </View>
          )}

          {/* Define Custom Quotation Toggle */}
          <TouchableOpacity
            style={styles.defineQuotationBanner}
            onPress={() => setShowDefineQuotationForm(!showDefineQuotationForm)}
          >
            <Plus size={16} color={Colors.primary} />
            <Text style={styles.defineQuotationBannerText}>+ Define Custom Commercial Rate Card</Text>
          </TouchableOpacity>

          {showDefineQuotationForm && (
            <Card style={styles.defineQuotationFormCard}>
              <Text style={styles.defineQuotationFormTitle}>Define New Contract Rate Card</Text>
              <View style={styles.defineFormRow}>
                <Input
                  label="Client Rate (SAR)"
                  value={defineLineRateInput}
                  onChangeText={setDefineLineRateInput}
                  placeholder="e.g. 1500"
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
                <Input
                  label="Driver Fee (SAR)"
                  value={defineDriverFeeInput}
                  onChangeText={setDefineDriverFeeInput}
                  placeholder="e.g. 800"
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
              </View>
              <Button
                title={definingQuotation ? 'Creating Rate Card…' : 'Save & Select Rate Card'}
                onPress={onDefineQuotationSubmit}
                loading={definingQuotation}
                disabled={definingQuotation}
                size="sm"
                style={{ marginTop: Spacing.xs }}
              />
            </Card>
          )}
        </View>
      )}
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
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.xs,
  },
  searchBarInput: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.gray900,
  },
  horizontalScroll: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  customerCard: {
    width: 175,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  customerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  customerLogo: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  customerIconFallback: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerCardTitle: {
    fontSize: Typography.bodySm,
    fontWeight: '700',
    color: Colors.gray900,
    flex: 1,
  },
  customerCardPhone: {
    fontSize: Typography.micro,
    color: Colors.gray500,
  },
  selectedCustomerCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    gap: Spacing.xs,
  },
  selectedCustomerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  selectedCustomerLogo: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  selectedCustomerIconFallback: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCustomerTitle: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  selectedCustomerSubtext: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  changeCustomerBtn: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  changeCustomerText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  chipsScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: Typography.micro,
    fontWeight: '600',
    color: Colors.gray700,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  ratesCarousel: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  rateCard: {
    width: 180,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    position: 'relative',
  },
  rateCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  rateCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rateCardNumber: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
    flex: 1,
    marginRight: 4,
  },
  rateCardLane: {
    fontSize: Typography.bodySm,
    fontWeight: '600',
    color: Colors.gray700,
    marginBottom: 6,
  },
  rateCardPrice: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: '800',
    color: Colors.primary,
  },
  rateCardTypeTag: {
    fontSize: Typography.micro,
    fontWeight: '700',
    color: Colors.gray600,
    backgroundColor: Colors.gray200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  selectedCheckBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noQuotationBanner: {
    padding: Spacing.md,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  noQuotationText: {
    fontSize: Typography.xs,
    color: Colors.gray600,
  },
  defineQuotationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
    marginTop: 4,
  },
  defineQuotationBannerText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  defineQuotationFormCard: {
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    marginTop: Spacing.xs,
  },
  defineQuotationFormTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: Spacing.xs,
  },
  defineFormRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
});
