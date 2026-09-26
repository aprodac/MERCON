/** The last look before creating: who for, where, when, who drives, and the money. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { CalendarDays, CircleAlert, Clock3, FileText, Handshake, Receipt, Truck, Users } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { lineTypeLabel, truckClassOfVehicle } from '@mercon/shared-types';
import { DriverAvatar } from '../../../drivers/components/DriverAvatar';
import { UNASSIGNED, type CreateTripForm } from '../useCreateTrip';
import type { OperatorDriverOption } from '../../../../lib/operator';
import { CompanyAvatar, Segmented, fmtDay, fmtSar, initialsOf, niceName, shortName } from './ui';

const fullName = (d?: { first_name?: string; last_name?: string } | null) => (d ? niceName(`${d.first_name || ''} ${d.last_name || ''}`.trim()) : '');

function Avatar({ d, size }: { d?: OperatorDriverOption | null; size: number }) {
  return <DriverAvatar initials={initialsOf(fullName(d))} avatarUrl={d?.avatar_url || d?.photo_url} size={size} />;
}

function Block({ icon: Icon, tint, fg, title, children }: { icon: any; tint: string; fg: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <View style={[styles.blockIcon, { backgroundColor: tint }]}>
          <Icon size={13} color={fg} strokeWidth={2.3} />
        </View>
        <Text style={styles.blockTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function ReviewSheet({
  form,
  visible,
  onClose,
  onConfirm,
}: {
  form: CreateTripForm;
  visible: boolean;
  onClose: () => void;
  onConfirm: (pastChoice: 'Completed' | 'Incomplete') => void;
}) {
  const [pastChoice, setPastChoice] = useState<'Completed' | 'Incomplete'>('Completed');
  const { slot, money } = form;
  const trips = money.trips;
  const multi = form.isMonthly && trips > 1;

  const outbound = [
    { name: slot.origin, kind: 'start' as const },
    ...slot.intermediateLocations.map((n) => ({ name: n, kind: 'stop' as const })),
    { name: slot.destination, kind: 'end' as const },
  ];
  const back = form.isRound
    ? [
        { name: slot.returnOrigin || slot.destination, kind: 'start' as const },
        ...(slot.returnIntermediateLocations || []).map((n) => ({ name: n, kind: 'stop' as const })),
        { name: slot.returnDestination || slot.origin, kind: 'end' as const },
      ]
    : [];

  const days = [...form.selectedDates].sort();
  const marginKnown = money.billing > 0 && money.costKnown;
  const tone = !marginKnown ? 'none' : money.marginPct >= 20 ? 'good' : money.marginPct >= 5 ? 'thin' : 'low';

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Review trip" maxHeight="94%">
      <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: 10, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {/* Customer + route */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <CompanyAvatar name={form.selectedCustomer?.name} url={form.selectedCustomer?.logo_url || form.selectedCustomer?.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={1}>
                {niceName(form.selectedCustomer?.name)}
              </Text>
              <View style={styles.chips}>
                <Text style={styles.chip}>{lineTypeLabel(form.rateCategory)}</Text>
                <Text style={[styles.chip, form.isMonthly ? styles.chipMonthly : styles.chipExtra]}>{form.isMonthly ? 'Monthly' : 'Extra'}</Text>
                <Text style={styles.chip}>{form.vehicleType}</Text>
              </View>
            </View>
          </View>
          <View style={styles.route}>
            <View style={styles.rail} />
            {outbound.map((p, i) => (
              <RouteLine key={`o${i}`} name={p.name} kind={p.kind} />
            ))}
            {back.length ? <Text style={styles.returnLabel}>Return</Text> : null}
            {back.map((p, i) => (
              <RouteLine key={`r${i}`} name={p.name} kind={p.kind} muted />
            ))}
          </View>
        </View>

        {/* When */}
        <Block icon={CalendarDays} tint="#E6F1FB" fg="#185FA5" title={form.isMonthly ? `${trips} days` : 'Schedule'}>
          {form.isMonthly ? (
            <>
              <View style={styles.dayStrip}>
                {days.slice(0, 10).map((d) => {
                  const [dow, num] = fmtDay(d).replace(',', '').split(' ');
                  return (
                    <View key={d} style={styles.dayPill}>
                      <Text style={styles.dayDow}>{dow}</Text>
                      <Text style={styles.dayNum}>{num}</Text>
                    </View>
                  );
                })}
                {days.length > 10 ? (
                  <View style={[styles.dayPill, { backgroundColor: Colors.gray200 }]}>
                    <Text style={styles.dayNum}>+{days.length - 10}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.muted}>
                Every day {slot.pickupTime} → {slot.dropoffTime}
              </Text>
            </>
          ) : (
            <View style={styles.when}>
              <View style={styles.whenTile}>
                <Text style={styles.whenCap}>Pickup</Text>
                <Text style={styles.whenDay}>{fmtDay(slot.date)}</Text>
                <Text style={styles.whenTime}>{slot.pickupTime}</Text>
              </View>
              <View style={styles.whenMid}>
                <View style={styles.whenDash} />
                <Text style={styles.whenLen}>{durationText(slot.date, slot.pickupTime, slot.dropoffDate || slot.date, slot.dropoffTime)}</Text>
                <View style={styles.whenDash} />
              </View>
              <View style={[styles.whenTile, { alignItems: 'flex-end' }]}>
                <Text style={styles.whenCap}>Drop-off</Text>
                <Text style={styles.whenDay}>{fmtDay(slot.dropoffDate || slot.date)}</Text>
                <Text style={styles.whenTime}>{slot.dropoffTime}</Text>
              </View>
            </View>
          )}
        </Block>

        {/* Who */}
        <WhoBlock form={form} />

        {/* Money */}
        <Block icon={Receipt} tint="#EAF3DE" fg="#3B6D11" title={multi ? 'Money per trip' : 'Money'}>
          <MoneyRow label={form.isMonthly ? 'Rate (monthly ÷ 30)' : 'Customer rate'} value={money.perTrip} />
          {form.charges.map((c, i) => (
            <MoneyRow key={i} label={c.charge_type} value={c.amount} />
          ))}
          <MoneyRow label={form.assignmentType === 'third_party' ? 'Partner cost' : 'Driver payout'} value={-money.cost} muted={!money.costKnown} />
          <View style={styles.totalRow}>
            <View>
              <Text style={styles.totalLabel}>Margin</Text>
              <Text style={styles.totalValue}>{marginKnown ? `SAR ${fmtSar(money.margin)}` : '—'}</Text>
            </View>
            <View style={[styles.marginPill, styles[`pill_${tone}`]]}>
              <Text style={[styles.marginText, styles[`pillText_${tone}`]]}>
                {marginKnown ? `${Math.round(money.marginPct)}%` : form.assignmentType === 'third_party' ? 'Partner cost not set' : 'Payout not set'}
              </Text>
            </View>
          </View>
          {marginKnown ? (
            <View style={styles.bar}>
              <View style={[styles.barFill, styles[`fill_${tone}`], { width: `${Math.max(3, Math.min(100, Math.round(money.marginPct)))}%` }]} />
            </View>
          ) : null}
          {multi ? (
            <View style={styles.grand}>
              <Text style={styles.grandLabel}>Billed for {trips} trips</Text>
              <Text style={styles.grandValue}>SAR {fmtSar(money.billing * trips)}</Text>
            </View>
          ) : null}
        </Block>

        {form.savesNewQuotation ? (
          <View style={styles.note}>
            <FileText size={15} color="#854F0B" />
            <Text style={styles.noteText}>A new quotation is saved for this route at SAR {fmtSar(Number(slot.billingAmount) || 0)}.</Text>
          </View>
        ) : null}

        {form.pastTripCount > 0 ? (
          <View style={[styles.note, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <CircleAlert size={15} color="#854F0B" />
              <Text style={styles.noteText}>
                {form.pastTripCount === 1 && trips === 1 ? 'This trip is in the past.' : `${form.pastTripCount} of these trips are in the past.`} Did it happen?
              </Text>
            </View>
            <Segmented
              options={[
                { value: 'Completed', label: 'Yes, completed' },
                { value: 'Incomplete', label: 'Not finished' },
              ]}
              value={pastChoice}
              onChange={setPastChoice}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity style={[styles.primary, form.submitting && { opacity: 0.7 }]} disabled={form.submitting} onPress={() => onConfirm(pastChoice)} activeOpacity={0.85}>
        {form.submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>{trips > 1 ? `Create ${trips} trips` : 'Create trip'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={form.submitting}>
        <Text style={styles.secondaryText}>Back to edit</Text>
      </TouchableOpacity>
    </AppModal>
  );
}

function WhoBlock({ form }: { form: CreateTripForm }) {
  if (form.assignmentType === 'third_party') {
    return (
      <Block icon={Handshake} tint="#EEEDFE" fg="#534AB7" title="3PL partner">
        <Text style={styles.personName}>{niceName(form.selectedProvider?.name) || 'Partner'}</Text>
        <Text style={styles.muted}>
          {[niceName(form.thirdPartyDriverName), form.thirdPartyDriverPhone, form.thirdPartyVehiclePlate].filter(Boolean).join(' · ') || 'Driver and truck not given'}
        </Text>
        {form.awbNumber ? <Text style={styles.awb}>AWB {form.awbNumber}</Text> : null}
      </Block>
    );
  }

  if (form.isMonthly && form.monthlyMode === 'rotation') {
    const people = form.rotationDrivers.map((id) => form.drivers.find((d) => d.id === id)).filter(Boolean) as OperatorDriverOption[];
    return (
      <Block icon={Users} tint="#EEEDFE" fg="#534AB7" title={`Rotating ${people.length} drivers`}>
        {people.map((d) => {
          const truck = form.vehicles.find((v) => v.id === form.driverTruckId(d.id));
          return (
            <View key={d.id} style={styles.person}>
              <Avatar d={d} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{fullName(d)}</Text>
                <Text style={styles.muted}>{truck ? `${truck.plate_number} · ${truckClassOfVehicle(truck)}` : 'No truck'}</Text>
              </View>
            </View>
          );
        })}
        {form.awbNumber ? <Text style={styles.awb}>AWB {form.awbNumber}</Text> : null}
      </Block>
    );
  }

  if (form.driverId === UNASSIGNED) {
    return (
      <Block icon={Clock3} tint="#FAEEDA" fg="#854F0B" title="Driver and truck">
        <Text style={[styles.personName, { color: '#854F0B' }]}>Assigned later, before dispatch</Text>
        {form.awbNumber ? <Text style={styles.awb}>AWB {form.awbNumber}</Text> : null}
      </Block>
    );
  }

  const d = form.selectedDriver;
  const truck = form.vehicleId === UNASSIGNED ? null : form.selectedVehicle;
  const changedDays = form.isMonthly && form.monthlyMode === 'per_day' ? Object.keys(form.dayOverrides).length : 0;
  return (
    <Block icon={Truck} tint="#EEEDFE" fg="#534AB7" title="Driver and truck">
      <View style={styles.person}>
        <Avatar d={d} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={styles.personName} numberOfLines={1}>
            {fullName(d)}
          </Text>
          <Text style={styles.muted}>{d?.phone_primary || 'Driver'}</Text>
        </View>
      </View>
      <View style={styles.truck}>
        <Truck size={15} color={Colors.gray600} />
        <Text style={styles.truckPlate}>{truck ? truck.plate_number : 'Truck assigned later'}</Text>
        {truck ? <Text style={styles.chip}>{truckClassOfVehicle(truck)}</Text> : null}
      </View>
      {form.selectedCoDriver ? (
        <View style={[styles.person, { marginTop: 8 }]}>
          <Avatar d={form.selectedCoDriver} size={28} />
          <Text style={styles.muted}>
            <Text style={{ color: Colors.charcoal, fontWeight: '600' }}>{shortName(fullName(form.selectedCoDriver))}</Text> co-driver · payout split 50/50
          </Text>
        </View>
      ) : null}
      {changedDays ? <Text style={[styles.muted, { marginTop: 6 }]}>Different driver on {changedDays} day{changedDays > 1 ? 's' : ''}</Text> : null}
      {form.awbNumber ? <Text style={styles.awb}>AWB {form.awbNumber}</Text> : null}
    </Block>
  );
}

function RouteLine({ name, kind, muted }: { name: string; kind: 'start' | 'stop' | 'end'; muted?: boolean }) {
  const color = kind === 'start' ? Colors.success : kind === 'end' ? Colors.primary : Colors.gray400;
  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeDot, { backgroundColor: color }, kind === 'stop' && styles.routeDotSmall, muted && { opacity: 0.5 }]} />
      <Text style={[styles.routeName, kind === 'stop' && styles.routeStop, muted && { color: Colors.gray500 }]} numberOfLines={1}>
        {niceName(name)}
      </Text>
    </View>
  );
}

function MoneyRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <View style={styles.moneyRow}>
      <Text style={styles.moneyLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.moneyValue, value < 0 && { color: Colors.gray600 }, muted && { color: Colors.warning }]}>
        {muted ? 'Not set' : `${value < 0 ? '− ' : ''}SAR ${fmtSar(Math.abs(value))}`}
      </Text>
    </View>
  );
}

function durationText(d1: string, t1: string, d2: string, t2: string): string {
  if (!d1 || !t1 || !d2 || !t2) return '';
  const toMin = (d: string, t: string) => {
    const [y, m, day] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, day) / 60000 + h * 60 + mi;
  };
  const mins = toMin(d2, t2) - toMin(d1, t1);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h} h` : ''}${h && m ? ' ' : ''}${m ? `${m} min` : ''}`;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 18, padding: Spacing.md, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray100 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroName: { fontSize: 16, fontWeight: '800', color: Colors.charcoal },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  chip: { fontSize: 11, fontWeight: '700', color: Colors.gray700, backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  chipMonthly: { backgroundColor: '#E6F1FB', color: '#0C447C' },
  chipExtra: { backgroundColor: '#FAEEDA', color: '#633806' },
  route: { position: 'relative', marginTop: Spacing.md, paddingLeft: 20 },
  rail: { position: 'absolute', left: 5, top: 10, bottom: 10, borderLeftWidth: 1.5, borderColor: Colors.gray300, borderStyle: 'dashed' },
  routeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
  routeDot: { position: 'absolute', left: -20, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: Colors.gray50 },
  routeDotSmall: { left: -18, width: 7, height: 7, borderWidth: 0 },
  routeName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  routeStop: { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  returnLabel: { fontSize: 10, fontWeight: '800', color: Colors.gray400, letterSpacing: 0.5, marginTop: 4, marginBottom: 2 },
  block: { borderRadius: 16, padding: Spacing.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray100 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  blockIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  blockTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },
  when: { flexDirection: 'row', alignItems: 'center' },
  whenTile: { flex: 1 },
  whenCap: { fontSize: 11, color: Colors.gray500, fontWeight: '600' },
  whenDay: { fontSize: 13, color: Colors.gray700, marginTop: 2 },
  whenTime: { fontSize: 22, fontWeight: '800', color: Colors.charcoal },
  whenMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  whenDash: { flex: 1, borderTopWidth: 1.5, borderColor: Colors.gray300, borderStyle: 'dashed' },
  whenLen: { fontSize: 11, fontWeight: '700', color: Colors.gray500 },
  dayStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  dayPill: { minWidth: 40, alignItems: 'center', paddingVertical: 5, borderRadius: 10, backgroundColor: Colors.primaryLight },
  dayDow: { fontSize: 10, color: Colors.primaryDark, fontWeight: '600' },
  dayNum: { fontSize: 14, color: Colors.primaryDark, fontWeight: '800' },
  muted: { fontSize: 12, color: Colors.gray500, marginTop: 4, flexShrink: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  personName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  truck: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.gray100 },
  truckPlate: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  awb: { marginTop: 8, fontSize: 12, fontWeight: '700', color: Colors.gray600 },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  moneyLabel: { fontSize: 13, color: Colors.gray600, flexShrink: 1 },
  moneyValue: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.gray100, borderStyle: 'dashed' },
  totalLabel: { fontSize: 11, color: Colors.gray500, fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '800', color: Colors.charcoal },
  marginPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  marginText: { fontSize: 14, fontWeight: '800' },
  pill_none: { backgroundColor: '#FAEEDA' },
  pillText_none: { color: '#854F0B', fontSize: 12 },
  pill_good: { backgroundColor: '#EAF3DE' },
  pillText_good: { color: '#27500A' },
  pill_thin: { backgroundColor: '#FAEEDA' },
  pillText_thin: { color: '#854F0B' },
  pill_low: { backgroundColor: '#FCEBEB' },
  pillText_low: { color: '#A32D2D' },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.gray100, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  fill_none: { backgroundColor: Colors.gray300 },
  fill_good: { backgroundColor: '#639922' },
  fill_thin: { backgroundColor: '#EF9F27' },
  fill_low: { backgroundColor: '#E24B4A' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: Colors.gray50 },
  grandLabel: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  grandValue: { fontSize: 15, fontWeight: '800', color: Colors.charcoal },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#FFFBF2', borderWidth: 1, borderColor: '#FAC775' },
  noteText: { flex: 1, fontSize: 13, color: '#854F0B', fontWeight: '600' },
  primary: { marginTop: Spacing.md, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: Colors.gray600, fontSize: 14, fontWeight: '600' },
});
