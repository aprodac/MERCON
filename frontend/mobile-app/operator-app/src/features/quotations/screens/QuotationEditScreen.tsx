/**
 * Add / edit a quotation. `/quotation-edit` with no id creates one
 * (POST /quotations); with `?id=` it edits (PUT /quotations/:id) — the same
 * fields and payload as the web dashboard's Add / Edit Quotation page, one
 * rate line at a time.
 *
 * The route is kept as an ordered list of stops so a quotation made on the web
 * (via stops, a return leg) keeps its shape when only the price is changed here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarRange, ChevronDown, MapPin, Plus, Route, Truck, Wallet, X } from 'lucide-react-native';
import { LINE_TYPES, TRUCK_CLASSES, lineTypeLabel, normalizeBillingTypeToken, normalizeLineTypeToken } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { DatePickerModal } from '@mercon/mobile-shared/components/common/DateTimePickerModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, useOperatorCustomers,
  type OperatorLocation, type OperatorQuotationDetail,
} from '../../../lib/operator';
import { Field, FormHeader, SaveBar, Section, SwitchRow, formStyles } from '@/features/users/components/FormKit';
import { PickerSheet, Segmented, niceName, tap } from '@/features/trips/create/components/ui';

interface StopDraft {
  key: string;
  locationId: string | null;
  name: string;
  stop_type: string;
  leg_index: number;
}

type Billing = 'EXTRA' | 'MONTHLY';
type Basis = 'PER_TRIP' | 'PER_MONTH';
type Errors = Partial<Record<'customer' | 'route' | 'rate' | 'payout' | 'validity', string>>;

const newStop = (stop_type: string, leg_index = 0): StopDraft => ({
  key: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, locationId: null, name: '', stop_type, leg_index,
});

const toDDMMYYYY = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** DD/MM/YYYY → YYYY-MM-DD (what the API's `new Date()` reads as that calendar day). */
const toIsoDay = (ddmmyyyy: string): string | undefined => {
  const m = ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined;
};

const money = (v: string) => v.replace(/[^0-9.]/g, '');

export default function QuotationEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const [quotation, setQuotation] = useState<OperatorQuotationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    operatorService.quotationById(id)
      .then((q) => { if (live) setQuotation(q); })
      .catch((e) => { if (live) setLoadError(getApiErrorMessage(e)); });
    return () => { live = false; };
  }, [id]);

  const body = () => {
    if (isNew) return <QuotationForm onDone={() => router.back()} />;
    if (loadError) return <Text style={formStyles.errorText}>{loadError}</Text>;
    if (!quotation) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />;
    return <QuotationForm key={quotation.id} quotation={quotation} onDone={() => router.back()} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader
        title={isNew ? 'New quotation' : 'Edit quotation'}
        subtitle={isNew ? 'Route, truck and price for one customer' : quotation?.name ?? undefined}
        onBack={() => router.back()}
      />
      {body()}
    </SafeAreaView>
  );
}

function QuotationForm({ quotation, onDone }: { quotation?: OperatorQuotationDetail; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !quotation;
  const { customers } = useOperatorCustomers();

  const [customerId, setCustomerId] = useState(quotation?.customerId ?? '');
  const [stops, setStops] = useState<StopDraft[]>(() => {
    const existing = [...(quotation?.stops ?? [])].sort((a, b) => a.sequence - b.sequence);
    if (existing.length >= 2) {
      return existing.map((s) => ({
        key: s.id,
        locationId: s.locationId ?? s.location?.id ?? null,
        name: s.source_label || s.location?.name || '',
        stop_type: s.stop_type,
        leg_index: s.leg_index ?? 0,
      }));
    }
    return [newStop('Pickup'), newStop('Dropoff')];
  });
  const [truckClass, setTruckClass] = useState(quotation?.vehicle_class || quotation?.source_vehicle_label || '10 TON');
  const [lineType, setLineType] = useState(quotation?.line_type || 'SINGLE_TRIP');
  const [billing, setBilling] = useState<Billing>(
    quotation ? (normalizeBillingTypeToken(quotation.operation_type) === 'Monthly' ? 'MONTHLY' : 'EXTRA') : 'EXTRA',
  );
  const [basis, setBasis] = useState<Basis>(
    quotation?.pricing_basis === 'PER_MONTH' ? 'PER_MONTH' : quotation?.pricing_basis === 'PER_TRIP' ? 'PER_TRIP'
      : quotation && normalizeBillingTypeToken(quotation.operation_type) === 'Monthly' ? 'PER_MONTH' : 'PER_TRIP',
  );
  const [rate, setRate] = useState(quotation ? String(Number(quotation.rate) || '') : '');
  const [payout, setPayout] = useState(quotation?.driver_payout != null ? String(Number(quotation.driver_payout)) : '');
  const [validFrom, setValidFrom] = useState(toDDMMYYYY(quotation?.valid_from));
  const [validTo, setValidTo] = useState(toDDMMYYYY(quotation?.valid_to));
  const [isActive, setIsActive] = useState(quotation?.is_active ?? true);

  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [picker, setPicker] = useState<{ kind: 'customer' } | { kind: 'stop'; key: string } | { kind: 'line' } | null>(null);
  const [datePicker, setDatePicker] = useState<'from' | 'to' | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Places are saved per customer, so the list follows the chosen customer.
  useEffect(() => {
    if (!customerId) return;
    let live = true;
    operatorService.locations(customerId).then((l) => { if (live) setLocations(l); }).catch(() => {});
    return () => { live = false; };
  }, [customerId]);

  const customerName = quotation?.customer?.name ?? customers.find((c) => c.id === customerId)?.name ?? '';
  // Truck classes and line types saved on the web's taxonomy may not be in the default lists; keep them selectable.
  const truckOptions = useMemo(() => Array.from(new Set<string>([...TRUCK_CLASSES, truckClass].filter(Boolean))), [truckClass]);
  // Older quotations store the trip type as words ("Single Trip"); that spelling is kept unless the operator picks another type.
  const lineOptions = useMemo(() => {
    const token = normalizeLineTypeToken(lineType);
    const known = (LINE_TYPES as readonly string[]).includes(token);
    return [...LINE_TYPES.map((t) => (t === token ? lineType : t)), ...(known || !lineType ? [] : [lineType])];
  }, [lineType]);

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));
  const setStop = (key: string, patch: Partial<StopDraft>) => {
    setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    clear('route');
  };
  const addStop = () => setStops((list) => [...list.slice(0, -1), newStop('Rest', list[list.length - 1].leg_index), list[list.length - 1]]);
  const removeStop = (key: string) => setStops((list) => list.filter((s) => s.key !== key));

  const changeBilling = (b: Billing) => {
    setBilling(b);
    // A monthly contract is priced per month, an extra trip per trip — still changeable below.
    setBasis(b === 'MONTHLY' ? 'PER_MONTH' : 'PER_TRIP');
  };

  const rateNum = parseFloat(rate);
  const payoutNum = parseFloat(payout);
  const perTrip = basis === 'PER_MONTH' && rateNum > 0 ? rateNum / 30 : rateNum;
  const margin = rateNum > 0 && payoutNum >= 0 && !Number.isNaN(payoutNum) ? perTrip - payoutNum : null;

  const validate = (): Errors => {
    const e: Errors = {};
    if (!customerId) e.customer = 'Choose a customer';
    if (stops.some((s) => !s.name.trim())) e.route = 'Choose a place for every stop';
    if (!(rateNum > 0)) e.rate = 'Enter the rate';
    if (payout && !(payoutNum >= 0)) e.payout = 'Enter a valid amount';
    const from = toIsoDay(validFrom);
    const to = toIsoDay(validTo);
    if (from && to && to < from) e.validity = 'The end date is before the start date';
    return e;
  };

  const handleSave = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const first = stops[0];
    const last = stops[stops.length - 1];
    const payload: Record<string, unknown> = {
      customerId,
      origin_location_id: first.locationId,
      destination_location_id: last.locationId,
      origin_name: first.name.trim(),
      destination_name: last.name.trim(),
      vehicle_class: truckClass,
      source_vehicle_label: truckClass,
      line_type: lineType,
      operation_type: billing,
      billing_type: billing,
      pricing_basis: basis,
      rate: rateNum,
      driver_payout: payout ? payoutNum : null,
      currency: quotation?.currency || 'SAR',
      valid_from: toIsoDay(validFrom),
      valid_to: toIsoDay(validTo),
      stops: stops.map((s, i) => ({
        sequence: i + 1,
        leg_index: s.leg_index,
        locationId: s.locationId,
        location_id: s.locationId,
        source_label: s.name.trim(),
        stop_type: s.stop_type,
      })),
    };

    setSaving(true);
    try {
      if (quotation) await operatorService.updateQuotation(quotation.id, { ...payload, is_active: isActive });
      else await operatorService.createQuotationRaw(payload);
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not create the quotation' : 'Could not save the quotation', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openStop = (key: string) => {
    if (!customerId) {
      setErrors((prev) => ({ ...prev, customer: 'Choose a customer first' }));
      return;
    }
    setPicker({ kind: 'stop', key });
  };

  const stopLabel = (i: number) => (i === 0 ? 'Pickup' : i === stops.length - 1 ? 'Drop-off' : `Stop ${i}`);
  const pickedStop = picker?.kind === 'stop' ? stops.find((s) => s.key === picker.key) : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        <Section title="Customer" Icon={Building2}>
          <Field
            label="Customer"
            required
            value={niceName(customerName)}
            placeholder="Choose a customer"
            error={errors.customer}
            hint={isNew ? undefined : 'A quotation stays with its customer.'}
            onPressBox={isNew ? () => setPicker({ kind: 'customer' }) : undefined}
            editable={false}
            right={isNew ? <ChevronDown size={16} color={Colors.gray400} /> : undefined}
          />
        </Section>

        <Section title="Route" Icon={Route} note="Where the truck loads, any stops on the way, and where it delivers.">
          <View style={s.stops}>
            {stops.map((st, i) => {
              const edge = i === 0 || i === stops.length - 1;
              return (
                <View key={st.key} style={s.stopRow}>
                  <View style={s.rail}>
                    <View style={[s.pin, i === stops.length - 1 && s.pinEnd, !edge && s.pinMid]} />
                    {i < stops.length - 1 ? <View style={s.railLine} /> : null}
                  </View>
                  <TouchableOpacity style={[s.stopBox, errors.route && !st.name.trim() ? { borderColor: Colors.error } : null]} activeOpacity={0.7} onPress={() => openStop(st.key)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.stopCap}>{stopLabel(i)}</Text>
                      <Text style={[s.stopName, !st.name && { color: Colors.gray400, fontWeight: '400' }]} numberOfLines={1}>
                        {st.name ? niceName(st.name) : 'Choose a place'}
                      </Text>
                    </View>
                    {edge ? <MapPin size={16} color={Colors.gray400} /> : (
                      <TouchableOpacity onPress={() => removeStop(st.key)} hitSlop={10} accessibilityLabel={`Remove ${stopLabel(i)}`}>
                        <X size={17} color={Colors.gray500} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          {errors.route ? <Text style={s.error}>{errors.route}</Text> : null}
          <TouchableOpacity style={s.addStop} activeOpacity={0.75} onPress={() => { tap(); addStop(); }}>
            <Plus size={15} color={Colors.charcoal} strokeWidth={2.4} />
            <Text style={s.addStopText}>Add a stop on the way</Text>
          </TouchableOpacity>
        </Section>

        <Section title="Truck and trip type" Icon={Truck}>
          <View>
            <Text style={s.label}>Truck class</Text>
            <View style={s.chips}>
              {truckOptions.map((c) => {
                const on = c === truckClass;
                return (
                  <TouchableOpacity key={c} style={[s.chip, on && s.chipOn]} activeOpacity={0.8} onPress={() => { if (!on) tap(); setTruckClass(c); }}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <Field
            label="Trip type"
            value={lineLabel(lineType)}
            onPressBox={() => setPicker({ kind: 'line' })}
            editable={false}
            right={<ChevronDown size={16} color={Colors.gray400} />}
          />
          <View>
            <Text style={s.label}>Billing</Text>
            <Segmented<Billing>
              style={s.segment}
              options={[{ value: 'EXTRA', label: 'Extra trip' }, { value: 'MONTHLY', label: 'Monthly contract' }]}
              value={billing}
              onChange={changeBilling}
            />
          </View>
        </Section>

        <Section title="Price" Icon={Wallet}>
          <View>
            <Text style={s.label}>Rate is</Text>
            <Segmented<Basis>
              style={s.segment}
              options={[{ value: 'PER_TRIP', label: 'Per trip' }, { value: 'PER_MONTH', label: 'Per month' }]}
              value={basis}
              onChange={setBasis}
            />
          </View>
          <View style={formStyles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label={basis === 'PER_MONTH' ? 'Monthly rate' : 'Rate'}
                required
                prefix="SAR"
                value={rate}
                onChangeText={(v) => { setRate(money(v)); clear('rate'); }}
                keyboardType="decimal-pad"
                placeholder="0"
                error={errors.rate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Driver payout"
                prefix="SAR"
                value={payout}
                onChangeText={(v) => { setPayout(money(v)); clear('payout'); }}
                keyboardType="decimal-pad"
                placeholder="0"
                error={errors.payout}
              />
            </View>
          </View>
          {rateNum > 0 ? (
            <View style={s.summary}>
              {basis === 'PER_MONTH' ? <SummaryRow label="Per trip (month ÷ 30)" value={`SAR ${fmt(perTrip)}`} /> : null}
              {margin != null ? <SummaryRow label="Left after driver payout" value={`SAR ${fmt(margin)}`} strong tone={margin < 0 ? Colors.error : undefined} /> : null}
              {basis !== 'PER_MONTH' && margin == null ? <SummaryRow label="Customer pays per trip" value={`SAR ${fmt(rateNum)}`} strong /> : null}
            </View>
          ) : null}
        </Section>

        <Section title="Validity" Icon={CalendarRange} note="Leave empty for a quotation with no end date.">
          <View style={formStyles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Valid from" value={validFrom} placeholder="Any date" onPressBox={() => setDatePicker('from')} editable={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Valid to" value={validTo} placeholder="Ongoing" onPressBox={() => setDatePicker('to')} editable={false} error={errors.validity} />
            </View>
          </View>
          {!isNew ? (
            <SwitchRow
              title="Active"
              description="Only active quotations are offered when creating a trip."
              value={isActive}
              onChange={setIsActive}
            />
          ) : null}
        </Section>
      </ScrollView>

      <SaveBar label={isNew ? 'Create quotation' : 'Save changes'} onPress={handleSave} saving={saving} />

      <PickerSheet
        visible={picker?.kind === 'customer'}
        title="Customer"
        options={customers.map((c) => ({ value: c.id, label: niceName(c.name) }))}
        value={customerId}
        onSelect={(value) => {
          if (value !== customerId) {
            // Places belong to a customer: a different customer means choosing the route again.
            setLocations([]);
            setStops((list) => list.map((st) => ({ ...st, locationId: null, name: '' })));
          }
          setCustomerId(value);
          clear('customer');
        }}
        onClose={() => setPicker(null)}
        searchPlaceholder="Search customers"
        emptyText="No customers found"
      />
      <PickerSheet
        visible={picker?.kind === 'stop'}
        title={pickedStop ? stopLabel(stops.indexOf(pickedStop)) : 'Place'}
        options={locations.map((l) => ({ value: l.id, label: niceName(l.name), sub: [l.city, l.address].filter(Boolean).join(' · ') || undefined }))}
        value={pickedStop?.locationId}
        onSelect={(value, option) => { if (picker?.kind === 'stop') setStop(picker.key, { locationId: value, name: option.label }); }}
        onCreate={(text) => { if (picker?.kind === 'stop') setStop(picker.key, { locationId: null, name: text }); }}
        createLabel="Use"
        onClose={() => setPicker(null)}
        searchPlaceholder="Search or type a new place"
        emptyText="No saved places for this customer — type a name to add one"
      />
      <PickerSheet
        visible={picker?.kind === 'line'}
        title="Trip type"
        options={lineOptions.map((l) => ({ value: l, label: lineLabel(l) }))}
        value={lineType}
        onSelect={(value) => setLineType(value)}
        onClose={() => setPicker(null)}
      />
      <DatePickerModal
        visible={datePicker !== null}
        onClose={() => setDatePicker(null)}
        selectedDate={(datePicker === 'from' ? validFrom : validTo) || toDDMMYYYY(new Date().toISOString())}
        onSelectDate={(d) => {
          if (datePicker === 'from') setValidFrom(d); else setValidTo(d);
          clear('validity');
          setDatePicker(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** "SINGLE_TRIP" and "Single Trip" both read "Single trip". */
const lineLabel = (v: string) => {
  const token = normalizeLineTypeToken(v);
  return (LINE_TYPES as readonly string[]).includes(token) ? lineTypeLabel(token) : v;
};

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, strong && { fontWeight: '800' }, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  error: { fontSize: 12, color: Colors.error, marginTop: -4 },
  stops: { gap: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  rail: { width: 14, alignItems: 'center', paddingTop: 20 },
  pin: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: Colors.charcoal, backgroundColor: Colors.white },
  pinEnd: { backgroundColor: Colors.charcoal },
  pinMid: { width: 8, height: 8, borderRadius: 4, borderWidth: 0, backgroundColor: Colors.gray400, marginTop: 2 },
  railLine: { flex: 1, width: 1.5, backgroundColor: Colors.gray300, marginTop: 4, marginBottom: -24 },
  stopBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.gray200, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8,
  },
  stopCap: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
  stopName: { fontSize: 15, fontWeight: '600', color: Colors.charcoal, marginTop: 1 },
  addStop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed', backgroundColor: Colors.gray50,
  },
  addStopText: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 999, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white, justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  chipTextOn: { color: Colors.white },
  segment: { backgroundColor: Colors.gray100 },
  summary: { backgroundColor: Colors.gray50, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  summaryLabel: { fontSize: 13, color: Colors.gray500 },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
});
