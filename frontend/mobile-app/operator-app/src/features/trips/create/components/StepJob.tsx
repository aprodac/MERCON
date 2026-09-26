/** Step 1 — customer, their quotations, route and price. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList } from 'react-native';
import { ArrowRight, Building2, CheckCircle2, Clock, FileText, Pencil, Repeat, Route, Search, X, Receipt, Plus, ChevronDown, type LucideIcon } from 'lucide-react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { TRUCK_CLASSES, lineTypeLabel, filterQuotationsBySearch, pricingFromQuotation } from '@mercon/shared-types';
import { PriceHistory } from './PriceHistory';
import { getQuotationRoute, type OperatorQuotation } from '../../../../lib/operator';
import { quotationBilling, quotationClass, quotationLineType, type CreateTripForm, type LocationPick } from '../useCreateTrip';
import { Chip, CompanyAvatar, ErrorText, FieldButton, Label, LinkButton, PickerSheet, Section, SkeletonRows, TextField, fmtSar, niceName, tap, ui } from './ui';

const CHARGE_PRESETS = ['Waiting', 'Loading / unloading', 'Toll', 'Night stay', 'Extra stop'];

type LocationTarget =
  | { kind: 'origin' }
  | { kind: 'destination' }
  | { kind: 'stop'; leg: 0 | 1 }
  | { kind: 'returnOrigin' }
  | { kind: 'returnDestination' };

type Sheet = 'customer' | 'quotes' | 'lineType' | 'class' | 'billing' | 'charge' | null;

export function StepJob({ form, showErrors }: { form: CreateTripForm; showErrors: boolean }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [locationTarget, setLocationTarget] = useState<LocationTarget | null>(null);

  const issues = form.stepIssues(1);
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field || i.field === `${field}-${form.slot.id}`)?.message : undefined);

  const applied = form.slot.rateMatched ? (form.slot.matchedRateCard as OperatorQuotation | null) : null;
  // Which quotation's price is open for editing; picking another quotation closes it.
  const [editingPriceOf, setEditingPriceOf] = useState<string | null>(null);
  const editingPrice = Boolean(applied && editingPriceOf === applied.id);
  const quoted = applied ? pricingFromQuotation(applied as any) : null;
  const priceEdited = Boolean(
    quoted && (Number(form.slot.billingAmount) !== Number(quoted.billingAmount) || Number(form.slot.driverPayout || 0) !== Number(quoted.driverPayout || 0)),
  );

  const [billingFilter, setBillingFilter] = useState<BillingFilter>(form.isMonthly ? 'Monthly' : 'ALL');
  const filtered = useMemo(
    () => (billingFilter === 'ALL' ? form.quotations : form.quotations.filter((q) => quotationBilling(q) === billingFilter)),
    [form.quotations, billingFilter],
  );
  // The three most useful quotations: those fitting the route entered, else the first ones.
  const preview = useMemo(() => {
    const fitting = form.routeMatches.filter((q) => filtered.includes(q));
    const rest = filtered.filter((q) => !fitting.includes(q));
    return [...fitting, ...rest].slice(0, 3);
  }, [form.routeMatches, filtered]);

  const pickLocation = (loc: LocationPick) => {
    const t = locationTarget;
    if (!t) return;
    if (t.kind === 'origin' || t.kind === 'destination') form.setEndpoint(t.kind, loc);
    else if (t.kind === 'stop') form.addStop(t.leg, loc);
    else form.setReturnEndpoint(t.kind, loc);
  };

  const applyCard = (q: OperatorQuotation) => {
    tap();
    form.applyQuotation(q, { fillRoute: true });
  };

  const charges = (
    <>
      {form.charges.map((c, i) => (
        <View key={`${c.charge_type}-${i}`} style={styles.chargeRow}>
          <Receipt size={15} color={Colors.gray500} />
          <Text style={styles.chargeName}>{c.charge_type}</Text>
          <Text style={styles.chargeAmt}>SAR {fmtSar(c.amount)}</Text>
          <TouchableOpacity onPress={() => form.setCharges(form.charges.filter((_, j) => j !== i))} hitSlop={8}>
            <X size={16} color={Colors.gray500} />
          </TouchableOpacity>
        </View>
      ))}
      <LinkButton label="+ Add charge" onPress={() => setSheet('charge')} />
    </>
  );

  const tripSelects = (
    <View style={styles.chipRow}>
      <SelectChip label={lineTypeLabel(form.rateCategory)} onPress={() => setSheet('lineType')} />
      <SelectChip label={form.vehicleType} onPress={() => setSheet('class')} />
      <SelectChip label={form.isMonthly ? 'Monthly' : 'Extra'} onPress={() => setSheet('billing')} />
    </View>
  );

  const priceSection = applied ? (
    <Section
      icon={Receipt}
      tone="green"
      title="Price"
      highlight="success"
      badge={<Chip label="Quotation" tone="success" />}
      action={{ label: 'Change', onPress: form.clearQuotation }}
    >
      <View style={styles.chipRow}>
        <InfoChip label={lineTypeLabel(form.rateCategory)} />
        <InfoChip label={form.vehicleType} />
        <InfoChip label={form.isMonthly ? 'Monthly' : 'Extra'} />
      </View>

      {editingPrice ? (
        <>
          <PriceInputs form={form} err={err} />
          <Text style={styles.note}>Changes apply to this trip only. The quotation keeps its price.</Text>
          <PriceHistory
            quotationId={applied!.id}
            origin={form.slot.origin}
            destination={form.slot.destination}
            vehicleClass={form.vehicleType}
            customerId={form.customerId}
            onUse={(rate, payout) => form.updateSlot({ billingAmount: String(rate), ...(payout != null ? { driverPayout: String(payout) } : {}) })}
          />
          <TouchableOpacity style={styles.doneBtn} onPress={() => setEditingPriceOf(null)} activeOpacity={0.8}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.priceView}>
            <PriceStat
              label={form.isMonthly ? 'Monthly rate' : 'Customer rate'}
              value={Number(form.slot.billingAmount) > 0 ? `SAR ${fmtSar(Number(form.slot.billingAmount))}` : '—'}
              sub={form.isMonthly && Number(form.slot.billingAmount) > 0 ? `≈ ${fmtSar(form.money.perTrip)} per trip` : undefined}
            />
            <View style={styles.priceDivider} />
            <PriceStat
              label="Driver payout"
              value={Number(form.slot.driverPayout) > 0 ? `SAR ${fmtSar(Number(form.slot.driverPayout))}` : 'Not set'}
              warn={form.payoutMissing}
            />
          </View>
          {form.payoutMissing ? <Text style={styles.warnNote}>This quotation has no driver payout. Tap Edit price to add it.</Text> : null}
          <View style={styles.priceActions}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                tap();
                setEditingPriceOf(applied!.id);
              }}
              activeOpacity={0.75}
            >
              <Pencil size={14} color={Colors.charcoal} />
              <Text style={styles.editText}>Edit price</Text>
            </TouchableOpacity>
            {priceEdited ? (
              <>
                <Chip label="Edited for this trip" tone="accent" />
                <LinkButton label="Reset" onPress={() => form.updateSlot({ billingAmount: quoted!.billingAmount, driverPayout: quoted!.driverPayout })} />
              </>
            ) : null}
          </View>
        </>
      )}
      {charges}
    </Section>
  ) : form.priceState === 'define' && form.customerId ? (
    <Section icon={Receipt} tone="amber" title="Price" highlight="warning" badge={<Chip label="New quotation" tone="warning" />}>
      <Text style={styles.sectionHint}>No quotation covers this route. Set the trip and price; it is saved for this customer when the trip is created.</Text>
      {tripSelects}
      <PriceInputs form={form} err={err} />
      {charges}
    </Section>
  ) : (
    <Section icon={Receipt} tone="gray" title="Trip and price">
      {tripSelects}
      <Text style={styles.sectionHint}>{form.customerId ? 'Pick a quotation above, or enter the route to set a price.' : 'Choose the customer first.'}</Text>
      {charges}
    </Section>
  );

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={{ gap: Spacing.sm }}>
      <Section icon={Building2} tone="blue" title="Customer">
        <FieldButton
          icon={form.selectedCustomer ? <CompanyAvatar name={form.selectedCustomer.name} url={form.selectedCustomer.logo_url || form.selectedCustomer.avatar_url} size={28} /> : undefined}
          value={niceName(form.selectedCustomer?.name)}
          placeholder="Choose a customer"
          onPress={() => setSheet('customer')}
          error={Boolean(err('customer'))}
          right={form.selectedCustomer ? <Text style={styles.link}>Change</Text> : undefined}
        />
        <ErrorText>{err('customer')}</ErrorText>
      </Section>

      {applied ? (
        <Animated.View entering={FadeIn.duration(200)}>{priceSection}</Animated.View>
      ) : form.customerId ? (
        <Section
          icon={FileText}
          tone="violet"
          title="Quotations"
          badge={form.quotations.length ? <Chip label={String(form.quotations.length)} /> : undefined}
          action={filtered.length > 3 ? { label: `See all ${filtered.length}`, onPress: () => setSheet('quotes') } : undefined}
        >
          {form.quotationsLoading ? (
            <SkeletonRows rows={3} />
          ) : form.quotations.length === 0 ? (
            <Text style={styles.sectionHint}>No quotations for this customer yet. Enter the route below.</Text>
          ) : (
            <>
              <BillingFilterChips quotations={form.quotations} value={billingFilter} onChange={setBillingFilter} />
              {preview.length === 0 ? (
                <Text style={styles.sectionHint}>No {billingFilter === 'Monthly' ? 'monthly' : 'extra'} quotations for this customer.</Text>
              ) : (
                preview.map((q, i) => <QuotationCard key={q.id} q={q} first={i === 0} fits={form.routeMatches.includes(q)} onPress={() => applyCard(q)} />)
              )}
            </>
          )}
        </Section>
      ) : null}

      <Section icon={Route} tone="coral" title="Route" action={{ label: '+ Stop', onPress: () => setLocationTarget({ kind: 'stop', leg: 0 }) }}>
        <RouteTimeline form={form} err={err} onPick={setLocationTarget} />
      </Section>

      {!applied ? priceSection : null}

      {/* Sheets */}
      <PickerSheet
        visible={sheet === 'customer'}
        title="Customer"
        options={form.customers.map((c) => ({
          value: c.id,
          label: niceName(c.name),
          sub: niceName(c.primary_contact_person) || c.contact_phone || undefined,
          leading: <CompanyAvatar name={c.name} url={c.logo_url || c.avatar_url} size={32} />,
        }))}
        value={form.customerId}
        onSelect={(id) => form.setCustomerId(id)}
        onClose={() => setSheet(null)}
        searchPlaceholder="Search customers"
      />
      <QuotationSheet
        visible={sheet === 'quotes'}
        quotations={form.quotations}
        lineTypes={form.lineTypeOptions}
        billing={billingFilter}
        onBillingChange={setBillingFilter}
        onPick={(q) => {
          applyCard(q);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === 'lineType'}
        title="Trip type"
        options={form.lineTypeOptions.map((t) => ({ value: t, label: lineTypeLabel(t) }))}
        value={form.rateCategory}
        onSelect={(v) => form.setRateCategory(v)}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === 'class'}
        title="Truck class"
        options={TRUCK_CLASSES.map((c) => ({ value: c, label: c }))}
        value={form.vehicleType}
        onSelect={(v) => form.setVehicleType(v)}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === 'billing'}
        title="Billing"
        options={[
          { value: 'Extra', label: 'Extra', sub: 'Billed per trip' },
          { value: 'Monthly', label: 'Monthly contract', sub: 'Monthly rate, billed ÷ 30 per trip' },
        ]}
        value={form.billingType}
        onSelect={(v) => form.setBillingType(v as 'Extra' | 'Monthly')}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={locationTarget !== null}
        title={
          locationTarget?.kind === 'origin'
            ? 'Pickup'
            : locationTarget?.kind === 'destination'
            ? 'Drop-off'
            : locationTarget?.kind === 'returnOrigin'
            ? 'Return loading point'
            : locationTarget?.kind === 'returnDestination'
            ? 'Final drop-off'
            : 'Add stop'
        }
        options={form.locations.map((l) => ({
          value: l.id,
          label: niceName(l.name),
          sub: [niceName(l.city), l.address].filter(Boolean).join(' · ') || undefined,
        }))}
        onSelect={(id) => {
          const l = form.locations.find((x) => x.id === id);
          if (l) pickLocation({ name: l.name, locationId: l.id, lat: l.lat ?? null, lng: l.lng ?? null });
        }}
        onCreate={(text) => pickLocation({ name: text, locationId: null })}
        createLabel="Use"
        onClose={() => setLocationTarget(null)}
        searchPlaceholder="Search this customer's places"
        emptyText={form.customerId ? 'No saved places — type a name to use it' : 'Choose a customer first'}
      />
      <ChargeSheet
        visible={sheet === 'charge'}
        onClose={() => setSheet(null)}
        onAdd={(charge_type, amount) => form.setCharges([...form.charges, { charge_type, amount }])}
      />
    </Animated.View>
  );
}

function PriceStat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && { color: Colors.warning }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function PriceInputs({ form, err }: { form: CreateTripForm; err: (f: string) => string | undefined }) {
  const is3PL = form.assignmentType === 'third_party';
  return (
    <View>
      <View style={styles.priceInputs}>
        <View style={{ flex: 1 }}>
          <Label style={styles.priceLabel}>{form.isMonthly ? 'Monthly rate' : 'Customer rate'}</Label>
          <TextField
            prefix="SAR"
            value={form.slot.billingAmount}
            onChangeText={(v) => form.updateSlot({ billingAmount: v.replace(/[^0-9.]/g, '') })}
            keyboardType="decimal-pad"
            placeholder="—"
            error={Boolean(err('billingAmount'))}
            style={styles.onTint}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label style={styles.priceLabel}>{is3PL ? 'Driver payout (not used for 3PL)' : 'Driver payout'}</Label>
          <TextField
            prefix="SAR"
            value={form.slot.driverPayout ?? ''}
            onChangeText={(v) => form.updateSlot({ driverPayout: v.replace(/[^0-9.]/g, '') })}
            keyboardType="decimal-pad"
            placeholder="—"
            style={[styles.onTint, form.payoutMissing && styles.inputWarn]}
          />
        </View>
      </View>
      {form.payoutMissing && form.slot.rateMatched ? <Text style={styles.warnNote}>This quotation has no driver payout — enter it.</Text> : null}
      {form.isMonthly && Number(form.slot.billingAmount) > 0 ? (
        <Text style={styles.note}>Each trip is billed SAR {fmtSar(form.money.perTrip)} (monthly rate ÷ 30).</Text>
      ) : null}
      <ErrorText>{err('billingAmount')}</ErrorText>
    </View>
  );
}

/** The route as a vertical line of stops; the return leg of a round trip continues underneath. */
function RouteTimeline({ form, err, onPick }: { form: CreateTripForm; err: (f: string) => string | undefined; onPick: (t: LocationTarget) => void }) {
  const { slot } = form;
  const same = (a?: string | null, b?: string | null) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const returnStart = slot.returnOrigin?.trim() || slot.destination;
  const returnEnd = slot.returnDestination?.trim() || slot.origin;

  return (
    <View style={tl.wrap}>
      <View style={tl.rail} />
      <Stop dot="start" value={niceName(slot.origin)} placeholder="Pickup" onPress={() => onPick({ kind: 'origin' })} error={Boolean(err('origin'))} />
      {slot.intermediateLocations.map((name, i) => (
        <Stop key={`o-${i}`} dot="stop" value={niceName(name)} tag="Stop" onRemove={() => form.removeStop(0, i)} />
      ))}
      <Stop dot="end" value={niceName(slot.destination)} placeholder="Drop-off" onPress={() => onPick({ kind: 'destination' })} error={Boolean(err('destination'))} />

      {form.isRound ? (
        <>
          <Text style={tl.legLabel}>Return</Text>
          <Stop
            dot="start"
            muted
            value={niceName(returnStart)}
            placeholder="Return loading point"
            tag={same(returnStart, slot.destination) && returnStart ? 'Same as drop-off' : undefined}
            onPress={() => onPick({ kind: 'returnOrigin' })}
            onRemove={same(returnStart, slot.destination) ? undefined : () => form.setReturnEndpoint('returnOrigin', null)}
          />
          {(slot.returnIntermediateLocations || []).map((name, i) => (
            <Stop key={`r-${i}`} dot="stop" muted value={niceName(name)} tag="Stop" onRemove={() => form.removeStop(1, i)} />
          ))}
          <AddRow label="+ Add return stop" onPress={() => onPick({ kind: 'stop', leg: 1 })} />
          <Stop
            dot="end"
            muted
            value={niceName(returnEnd)}
            placeholder="Final drop-off"
            tag={same(returnEnd, slot.origin) && returnEnd ? 'Back to pickup' : undefined}
            onPress={() => onPick({ kind: 'returnDestination' })}
            onRemove={same(returnEnd, slot.origin) ? undefined : () => form.setReturnEndpoint('returnDestination', null)}
          />
        </>
      ) : null}
      <ErrorText>{err('origin') || err('destination')}</ErrorText>
    </View>
  );
}

function Stop({
  dot,
  value,
  placeholder,
  onPress,
  onRemove,
  tag,
  muted,
  error,
}: {
  dot: 'start' | 'stop' | 'end';
  value: string;
  placeholder?: string;
  onPress?: () => void;
  onRemove?: () => void;
  tag?: string;
  muted?: boolean;
  error?: boolean;
}) {
  const color = dot === 'start' ? Colors.success : dot === 'end' ? Colors.primary : Colors.gray400;
  return (
    <View style={tl.row}>
      <View style={[tl.dot, { backgroundColor: color }, dot === 'stop' && tl.dotSmall, muted && { opacity: 0.55 }]} />
      <TouchableOpacity
        activeOpacity={onPress ? 0.75 : 1}
        disabled={!onPress && !onRemove}
        onPress={onPress}
        style={[tl.box, muted && tl.boxMuted, error && { borderColor: Colors.danger }]}
      >
        <Text style={[tl.text, !value && tl.placeholder, muted && { color: Colors.gray600 }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {tag ? <Text style={tl.tag}>{tag}</Text> : null}
        {onRemove ? (
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <X size={16} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={tl.row}>
      <View style={tl.dotHollow} />
      <TouchableOpacity onPress={onPress} hitSlop={6} style={{ paddingVertical: 4, alignSelf: 'flex-start' }}>
        <Text style={styles.link}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View style={styles.infoChip}>
      <Text style={styles.infoChipText}>{label}</Text>
    </View>
  );
}

function SelectChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.selectChip} activeOpacity={0.75}>
      <Text style={styles.selectChipText}>{label}</Text>
      <ChevronDown size={14} color={Colors.gray500} />
    </TouchableOpacity>
  );
}

type BillingFilter = 'ALL' | 'Extra' | 'Monthly';

/** Trip type → icon and colour, so a card's shape reads at a glance. */
function typeLook(lineType: string): { Icon: LucideIcon; bg: string; fg: string } {
  if (lineType === 'ROUND_TRIP') return { Icon: Repeat, bg: '#EEEDFE', fg: '#534AB7' };
  if (lineType === '10_HRS' || lineType === '12_HRS') return { Icon: Clock, bg: '#E6F1FB', fg: '#185FA5' };
  return { Icon: ArrowRight, bg: '#FAECE7', fg: '#993C1D' };
}

function QuotationCard({ q, fits, first, onPress }: { q: OperatorQuotation; fits?: boolean; first?: boolean; onPress: () => void }) {
  const route = getQuotationRoute(q);
  const lineType = quotationLineType(q);
  const monthly = quotationBilling(q) === 'Monthly';
  const cls = quotationClass(q);
  const stopsCount = Math.max(0, (q.stops || []).filter((s: any) => (s.leg_index ?? 0) === 0).length - 2);
  const rate = Number(q.rate) || 0;
  const { Icon, bg, fg } = typeLook(lineType);
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.quote, first && { marginTop: 0 }, fits && styles.quoteFits]}>
      <View style={[styles.quoteIcon, { backgroundColor: bg }]}>
        <Icon size={16} color={fg} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.quoteRoute} numberOfLines={1}>
          {niceName(route.origin)} → {niceName(route.dest)}
        </Text>
        <View style={styles.quoteTags}>
          <View style={[styles.tag, monthly ? styles.tagMonthly : styles.tagExtra]}>
            <Text style={[styles.tagText, monthly ? styles.tagMonthlyText : styles.tagExtraText]}>{monthly ? 'Monthly' : 'Extra'}</Text>
          </View>
          <Text style={styles.quoteMeta} numberOfLines={1}>
            {[lineTypeLabel(lineType), cls, stopsCount > 0 ? `${stopsCount} stop${stopsCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {fits ? (
          <View style={styles.fitsRow}>
            <CheckCircle2 size={12} color={Colors.success} />
            <Text style={styles.fitsText}>Fits this route</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.quoteRate}>
          {fmtSar(rate)}
          <Text style={styles.quoteRateUnit}>{monthly ? ' /mo' : ' SAR'}</Text>
        </Text>
        {monthly && rate > 0 ? <Text style={styles.quoteSub}>≈ {fmtSar(rate / 30)} per trip</Text> : null}
        <Text style={[styles.quoteSub, q.driver_payout == null && { color: Colors.warning }]}>
          {q.driver_payout != null ? `Driver ${fmtSar(Number(q.driver_payout))}` : 'No driver payout'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** All / Extra / Monthly with how many quotations each holds. */
function BillingFilterChips({ quotations, value, onChange }: { quotations: OperatorQuotation[]; value: BillingFilter; onChange: (v: BillingFilter) => void }) {
  const monthly = quotations.filter((q) => quotationBilling(q) === 'Monthly').length;
  const options: { value: BillingFilter; label: string; count: number }[] = [
    { value: 'ALL', label: 'All', count: quotations.length },
    { value: 'Extra', label: 'Extra', count: quotations.length - monthly },
    { value: 'Monthly', label: 'Monthly', count: monthly },
  ];
  return (
    <View style={styles.filterRow}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.filterChip, on && styles.filterChipOn]}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterText, on && styles.filterTextOn]}>{o.label}</Text>
            <View style={[styles.filterCount, on && styles.filterCountOn]}>
              <Text style={[styles.filterCountText, on && { color: Colors.charcoal }]}>{o.count}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function QuotationSheet({
  visible,
  quotations,
  lineTypes,
  billing,
  onBillingChange,
  onPick,
  onClose,
}: {
  visible: boolean;
  quotations: OperatorQuotation[];
  lineTypes: string[];
  billing: BillingFilter;
  onBillingChange: (v: BillingFilter) => void;
  onPick: (q: OperatorQuotation) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const list = useMemo(() => {
    const byBilling = billing === 'ALL' ? quotations : quotations.filter((q) => quotationBilling(q) === billing);
    const byType = type === 'ALL' ? byBilling : byBilling.filter((q) => quotationLineType(q) === type);
    return search.trim() ? (filterQuotationsBySearch(byType as any[], search) as OperatorQuotation[]) : byType;
  }, [quotations, billing, search, type]);
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Quotations" maxHeight="90%">
      <View style={ui.searchBar}>
        <Search size={16} color={Colors.gray500} />
        <TextInput style={ui.searchInput} value={search} onChangeText={setSearch} placeholder="City, route or price" placeholderTextColor={Colors.gray400} />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <X size={16} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </View>
      <BillingFilterChips quotations={quotations} value={billing} onChange={onBillingChange} />
      <View style={styles.typeRow}>
        {['ALL', ...lineTypes].map((t) => {
          const on = type === t;
          const look = t === 'ALL' ? null : typeLook(t);
          return (
            <TouchableOpacity key={t} onPress={() => setType(t)} style={[styles.typeChip, on && styles.typeChipOn]}>
              {look ? <look.Icon size={12} color={on ? Colors.primaryDark : look.fg} /> : null}
              <Text style={[styles.typeChipText, on && { color: Colors.primaryDark }]}>{t === 'ALL' ? 'All types' : lineTypeLabel(t)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.resultCount}>
        {list.length} of {quotations.length}
      </Text>
      <FlatList
        data={list}
        keyExtractor={(q) => q.id}
        style={{ maxHeight: 440 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => <QuotationCard q={item} first={index === 0} onPress={() => onPick(item)} />}
        ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', paddingVertical: Spacing.lg }]}>No quotation matches these filters.</Text>}
      />
    </AppModal>
  );
}

function ChargeSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (type: string, amount: number) => void }) {
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const close = () => {
    setType('');
    setAmount('');
    setError('');
    onClose();
  };
  return (
    <AppModal visible={visible} onClose={close} type="bottom-sheet" title="Add charge">
      <Label style={{ marginTop: 0 }}>What for</Label>
      <View style={styles.typeRow}>
        {CHARGE_PRESETS.map((p) => (
          <TouchableOpacity key={p} onPress={() => setType(p)} style={[styles.typeChip, type === p && styles.typeChipOn]}>
            <Text style={[styles.typeChipText, type === p && { color: Colors.primaryDark }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextField value={type} onChangeText={setType} placeholder="Or type a name" style={{ marginTop: Spacing.sm }} />
      <Label>Amount</Label>
      <TextField prefix="SAR" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" />
      <ErrorText>{error}</ErrorText>
      <TouchableOpacity
        style={styles.sheetBtn}
        onPress={() => {
          const n = Number(amount);
          if (!type.trim()) return setError('Enter what the charge is for');
          if (!(n > 0)) return setError('Enter an amount above 0');
          onAdd(type.trim(), n);
          close();
        }}
      >
        <Plus size={16} color={Colors.white} />
        <Text style={styles.sheetBtnText}>Add charge</Text>
      </TouchableOpacity>
    </AppModal>
  );
}

const tl = StyleSheet.create({
  wrap: { position: 'relative', paddingLeft: 22 },
  rail: { position: 'absolute', left: 6, top: 22, bottom: 22, borderLeftWidth: 1.5, borderColor: Colors.gray300, borderStyle: 'dashed' },
  row: { position: 'relative', justifyContent: 'center', marginTop: 6 },
  dot: { position: 'absolute', left: -21, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
  dotSmall: { left: -19, width: 8, height: 8, borderRadius: 4, borderWidth: 0 },
  dotHollow: { position: 'absolute', left: -19, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.gray300, backgroundColor: Colors.white },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: Colors.gray100,
  },
  boxMuted: { backgroundColor: Colors.white, borderColor: Colors.gray200, borderStyle: 'dashed' },
  text: { flex: 1, fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  placeholder: { color: Colors.gray400, fontWeight: '400' },
  tag: { fontSize: 11, color: Colors.gray500 },
  legLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray500, marginTop: Spacing.md, marginBottom: 2 },
});

const styles = StyleSheet.create({
  link: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  infoChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.white },
  infoChipText: { fontSize: 12, fontWeight: '600', color: Colors.gray700 },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: Colors.white,
  },
  selectChipText: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
  muted: { fontSize: 12, color: Colors.gray500, marginTop: 6 },
  divider: { textAlign: 'center', fontSize: 12, color: Colors.gray500, marginTop: Spacing.md },
  quote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.gray100,
  },
  quoteFits: { borderColor: '#97C459', backgroundColor: '#F4F9EC' },
  quoteIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quoteRoute: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  quoteTags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  quoteMeta: { fontSize: 12, color: Colors.gray500, flexShrink: 1 },
  quoteRate: { fontSize: 15, fontWeight: '800', color: Colors.charcoal },
  quoteRateUnit: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
  quoteSub: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  tagMonthly: { backgroundColor: '#E6F1FB' },
  tagMonthlyText: { color: '#0C447C' },
  tagExtra: { backgroundColor: '#FAEEDA' },
  tagExtraText: { color: '#633806' },
  fitsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  fitsText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.gray100 },
  filterChipOn: { backgroundColor: Colors.charcoal },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.gray700 },
  filterTextOn: { color: Colors.white },
  filterCount: { minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, borderRadius: Radius.full, backgroundColor: Colors.white, alignItems: 'center' },
  filterCountOn: { backgroundColor: Colors.white },
  filterCountText: { fontSize: 11, fontWeight: '700', color: Colors.gray600 },
  resultCount: { fontSize: 11, color: Colors.gray500, marginBottom: 4 },
  priceInputs: { flexDirection: 'row', gap: 10 },
  priceLabel: { marginTop: Spacing.sm },
  inputWarn: { borderColor: Colors.warning },
  onTint: { backgroundColor: Colors.white },
  priceView: { flexDirection: 'row', alignItems: 'stretch', marginTop: Spacing.md, padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.white },
  priceDivider: { width: 1, backgroundColor: Colors.gray200, marginHorizontal: Spacing.md },
  statLabel: { fontSize: 11, color: Colors.gray500, fontWeight: '500' },
  statValue: { fontSize: 18, fontWeight: '800', color: Colors.charcoal, marginTop: 2 },
  statSub: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  priceActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200 },
  editText: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  doneBtn: { marginTop: Spacing.md, alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.charcoal },
  doneText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  sectionHint: { fontSize: 12, color: Colors.gray600, lineHeight: 17, marginTop: 2 },
  warnNote: { fontSize: 12, color: Colors.warning, fontWeight: '600', marginTop: 6 },
  note: { fontSize: 12, color: Colors.gray600, marginTop: Spacing.sm },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: 12,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chargeName: { flex: 1, fontSize: 14, color: Colors.charcoal },
  chargeAmt: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: Spacing.sm },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.gray300 },
  typeChipOn: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeChipText: { fontSize: 13, color: Colors.gray700 },
  sheetBtn: {
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 13,
  },
  sheetBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
