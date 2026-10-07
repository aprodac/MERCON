/** Step 3 — who: own driver and truck (or several, for a monthly contract), or a 3PL partner. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, Clock3, Handshake, SlidersHorizontal, Sparkles, Truck, User, Users, X } from 'lucide-react-native';
import { Colors, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { truckClassOfVehicle } from '@mercon/shared-types';
import { DriverAvatar } from '../../../drivers/components/DriverAvatar';
import { UNASSIGNED, type CreateTripForm } from '../useCreateTrip';
import { driverChoices, topPicks, truckChoices, truckGroupLabel } from '../assignModel';
import type { OperatorDriverOption, OperatorVehicleOption } from '../../../../lib/operator';
import {
  Card,
  Chip,
  ChipRow,
  ErrorText,
  FieldButton,
  Label,
  LinkButton,
  PickerSheet,
  Section,
  Segmented,
  TextField,
  fmtDay,
  fmtSar,
  initialsOf,
  niceName,
  shortName,
  tap,
  type PickerOption,
} from './ui';

type DriverTarget = { kind: 'master' } | { kind: 'co' } | { kind: 'rotation'; index: number } | { kind: 'day'; date: string };

const fullName = (d?: { first_name?: string; last_name?: string } | null) => (d ? niceName(`${d.first_name || ''} ${d.last_name || ''}`.trim()) : '');

function Avatar({ d, size }: { d?: OperatorDriverOption | null; size: number }) {
  return <DriverAvatar initials={initialsOf(fullName(d))} avatarUrl={d?.avatar_url || d?.photo_url} size={size} />;
}

export function StepAssign({ form, showErrors }: { form: CreateTripForm; showErrors: boolean }) {
  const router = useRouter();
  const [driverTarget, setDriverTarget] = useState<DriverTarget | null>(null);
  const [truckSheet, setTruckSheet] = useState(false);
  const [providerSheet, setProviderSheet] = useState(false);
  const [showAwb, setShowAwb] = useState(Boolean(form.awbNumber));

  const issues = form.stepIssues(3);
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field)?.message : undefined);
  const payoutIssue = showErrors ? form.allIssues.find((i) => i.field.startsWith('driverPayout'))?.message : undefined;

  const truckOf = (driverId: string) => form.vehicles.find((v) => v.id === form.driverTruckId(driverId));

  // The server's ranking, in its order and groups, with its reasons (same as the web picker).
  const choices = useMemo(
    () =>
      driverChoices(form.drivers, form.recommended, {
        tz: form.tz,
        origin: niceName(form.slot.origin),
        destination: niceName(form.slot.destination),
        keepId: form.driverId,
      }),
    [form.drivers, form.recommended, form.tz, form.slot.origin, form.slot.destination, form.driverId],
  );

  const driverOptions = (exclude?: string): PickerOption[] =>
    choices
      .filter((c) => c.driver.id !== exclude)
      .map((c) => {
        const truck = truckOf(c.driver.id);
        return {
          value: c.driver.id,
          label: fullName(c.driver) || 'Driver',
          sub: truck ? `${truck.plate_number} · ${truckClassOfVehicle(truck)}` : 'No truck',
          group: c.groupLabel,
          badge: { label: c.statusLabel, tone: c.statusLabel === 'Free' ? ('success' as const) : ('warning' as const) },
          chips: c.chips.slice(0, 4),
          leading: <Avatar d={c.driver} size={32} />,
          disabled: c.blocked,
        };
      });

  const truckOptions: PickerOption[] = useMemo(() => {
    const opts = truckChoices(form.vehicles, {
      tripClass: form.vehicleType,
      rules: form.compatRules,
      usualTruckId: form.driverId && form.driverId !== UNASSIGNED ? form.driverTruckId(form.driverId) : null,
      driverName: form.selectedDriver?.first_name ? niceName(form.selectedDriver.first_name) : undefined,
      selectedId: form.vehicleId,
    }).map((t) => ({
      value: t.vehicle.id,
      label: t.vehicle.plate_number,
      sub: [niceName(t.vehicle.asset_type), t.cls].filter(Boolean).join(' · '),
      group: truckGroupLabel(t.group, form.vehicleType),
      disabled: t.blocked,
      chips: t.chips,
      leading: <Truck size={18} color={Colors.gray500} />,
    }));
    return [{ value: UNASSIGNED, label: 'Assign later', sub: 'Pick the truck before dispatch', leading: <Clock3 size={18} color={Colors.warning} /> }, ...opts];
  }, [form]);

  const onPickDriver = (id: string) => {
    const t = driverTarget;
    if (!t) return;
    if (t.kind === 'master') form.selectDriver(id);
    else if (t.kind === 'co') form.setCoDriverId(id);
    else if (t.kind === 'rotation') {
      const next = [...form.rotationDrivers];
      next[t.index] = id;
      form.setRotationDrivers(next);
    } else form.setDayOverride(t.date, id);
  };

  const own = form.assignmentType === 'own';
  const later = form.driverId === UNASSIGNED;
  const rotation = form.isMonthly && form.monthlyMode === 'rotation';
  const { picks: top, best: topIsBest } = topPicks(choices);

  return (
    <View style={{ gap: Spacing.sm }}>
      <Segmented
        options={[
          { value: 'own', label: 'Own fleet' },
          { value: 'third_party', label: '3PL partner' },
        ]}
        value={form.assignmentType}
        onChange={form.setAssignmentType}
      />

      {!own ? (
        <Section icon={Handshake} tone="violet" title="Partner">
          <FieldButton
            value={niceName(form.selectedProvider?.name)}
            placeholder="Choose a 3PL partner"
            onPress={() => setProviderSheet(true)}
            error={Boolean(err('thirdPartyProvider'))}
          />
          <ErrorText>{err('thirdPartyProvider')}</ErrorText>
          <Label>Partner cost {form.isMonthly ? 'per trip' : ''}</Label>
          <TextField
            prefix="SAR"
            value={form.thirdPartyCost}
            onChangeText={(v) => form.setThirdPartyCost(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="—"
            error={Boolean(err('thirdPartyCost'))}
          />
          {form.partnerRate && Number(form.partnerRate.cost) > 0 ? (
            <View style={[styles.rowCenter, { gap: 8, marginTop: 6 }]}>
              <Chip label={`Partner rate SAR ${fmtSar(Number(form.partnerRate.cost))}`} tone="success" />
              {Number(form.thirdPartyCost) !== Number(form.partnerRate.cost) ? (
                <LinkButton label="Use it" onPress={() => form.setThirdPartyCost(String(Number(form.partnerRate!.cost)))} />
              ) : null}
            </View>
          ) : null}
          <ErrorText>{err('thirdPartyCost')}</ErrorText>
          {form.partnerDrivers.length > 0 ? (
            <>
              <Label>Sent before</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {form.partnerDrivers.map((d, i) => {
                  const on = Boolean(d.driverName && d.driverName === form.thirdPartyDriverName && (d.vehiclePlate || '') === form.thirdPartyVehiclePlate);
                  return (
                    <TouchableOpacity
                      key={`${d.driverName}-${d.vehiclePlate}-${i}`}
                      onPress={() => {
                        tap();
                        form.usePartnerDriver(d);
                      }}
                      activeOpacity={0.75}
                      style={[styles.pastDriver, on && styles.pastDriverOn]}
                    >
                      <Text style={styles.pastName} numberOfLines={1}>
                        {niceName(d.driverName) || 'Driver'}
                      </Text>
                      <Text style={styles.pastSub} numberOfLines={1}>
                        {[d.vehiclePlate, d.vehicleType].filter(Boolean).join(' · ') || d.driverPhone || '—'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
          <Label>Their driver and truck (optional)</Label>
          <View style={styles.row}>
            <TextField value={form.thirdPartyDriverName} onChangeText={form.setThirdPartyDriverName} placeholder="Driver name" style={{ flex: 1 }} />
            <TextField value={form.thirdPartyDriverPhone} onChangeText={form.setThirdPartyDriverPhone} placeholder="05XXXXXXXX" keyboardType="phone-pad" style={{ flex: 1 }} />
          </View>
          <TextField value={form.thirdPartyVehiclePlate} onChangeText={form.setThirdPartyVehiclePlate} placeholder="Truck plate" style={{ marginTop: 8 }} />
        </Section>
      ) : (
        <>
          {form.isMonthly ? (
            <Section icon={CalendarDays} tone="blue" title="Month plan">
              <Segmented
                options={[
                  { value: 'single', label: 'Same driver' },
                  { value: 'rotation', label: 'Rotate' },
                  { value: 'per_day', label: 'Per day' },
                ]}
                value={form.monthlyMode}
                onChange={form.setMonthlyMode}
                style={{ backgroundColor: Colors.gray100 }}
              />
            </Section>
          ) : null}

          {rotation ? (
            <Section icon={Users} tone="violet" title="Rotation">
              <RotationEditor form={form} truckOf={truckOf} onPick={(index) => setDriverTarget({ kind: 'rotation', index })} />
            </Section>
          ) : later ? (
            <Section icon={Clock3} tone="amber" title="Assign later" highlight="warning" action={{ label: 'Choose now', onPress: () => form.selectDriver('') }}>
              <Text style={styles.hint}>The driver and truck will be picked before dispatch.</Text>
            </Section>
          ) : form.selectedDriver ? (
            <Section
              icon={User}
              tone="violet"
              title={form.isMonthly && form.monthlyMode === 'per_day' ? 'Default driver' : 'Assigned'}
              action={{ label: 'Change', onPress: () => setDriverTarget({ kind: 'master' }) }}
            >
              <AssignedBody
                driver={form.selectedDriver}
                truck={form.vehicleId === UNASSIGNED ? null : form.selectedVehicle}
                chips={choices.find((c) => c.driver.id === form.selectedDriver!.id)?.chips ?? []}
                tripClass={form.vehicleType}
                onChangeTruck={() => setTruckSheet(true)}
              />
            </Section>
          ) : (
            <Section
              icon={Sparkles}
              tone="violet"
              title={top.length ? (topIsBest ? 'Best for this trip' : 'Suggested drivers') : 'Driver'}
              badge={form.recommendedLoading ? <Chip label="Checking…" /> : undefined}
            >
              {!form.slot.pickupTime && top.length ? <Text style={[styles.hint, { marginBottom: 6 }]}>Set the pickup time on step 2 to check clashes and rest.</Text> : null}
              {top.map((c, i) => {
                const truck = truckOf(c.driver.id);
                return (
                  <TouchableOpacity
                    key={c.driver.id}
                    onPress={() => {
                      tap();
                      form.selectDriver(c.driver.id);
                    }}
                    activeOpacity={0.7}
                    style={[styles.driver, i === 0 && { marginTop: 0 }]}
                  >
                    <Avatar d={c.driver} size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.rowCenter}>
                        <Text style={[styles.driverName, { flex: 1 }]} numberOfLines={1}>
                          {fullName(c.driver)}
                        </Text>
                        {c.rec?.score ? <Text style={styles.score}>{c.rec.score}</Text> : null}
                      </View>
                      <Text style={styles.driverSub} numberOfLines={1}>
                        {truck ? `${truck.plate_number} · ${truckClassOfVehicle(truck)}` : 'No truck'}
                      </Text>
                      <ChipRow chips={c.chips.slice(0, 3)} style={{ marginTop: 5 }} />
                    </View>
                    <ChevronRight size={16} color={Colors.gray400} />
                  </TouchableOpacity>
                );
              })}
              <FieldButton
                icon={<User size={16} color={Colors.gray500} />}
                value=""
                placeholder={top.length ? 'Someone else' : 'Choose a driver'}
                onPress={() => setDriverTarget({ kind: 'master' })}
                style={{ marginTop: top.length ? 8 : 0 }}
                error={Boolean(err('assignment'))}
              />
              <ErrorText>{err('assignment')}</ErrorText>
            </Section>
          )}

          {form.isMonthly && form.monthlyMode === 'per_day' ? (
            <Section icon={CalendarDays} tone="blue" title="Per day">
              <DayTiles form={form} onPick={(date) => setDriverTarget({ kind: 'day', date })} />
            </Section>
          ) : null}
        </>
      )}

      {own && form.runCheck.clashDates.length > 0 ? (
        <Card tone="warning">
          <Text style={styles.warnText}>
            Runs overlap on {form.runCheck.clashDates.map((d) => fmtDay(d)).join(', ')}
          </Text>
          <Text style={styles.warnNote}>
            {form.runCheck.minutes ? `Each run takes ${runLength(form.runCheck.minutes)}, so the` : 'The'} same driver or truck is still on the previous run when the next one starts. Rotate drivers and trucks, or leave days between runs.
          </Text>
        </Card>
      ) : null}

      {payoutIssue && own ? (
        <Card tone="warning">
          <Text style={styles.warnText}>{payoutIssue}. Set it on step 1, in the price card.</Text>
        </Card>
      ) : null}

      <Section icon={SlidersHorizontal} tone="gray" title="Extras">
        {own && !later && !rotation ? (
          <ExtraRow
            label="Co-driver"
            value={form.coDriverId ? shortName(fullName(form.selectedCoDriver)) : undefined}
            onPress={() => setDriverTarget({ kind: 'co' })}
            onClear={form.coDriverId ? () => form.setCoDriverId('') : undefined}
          />
        ) : null}
        {own && !later && !rotation && form.coDriverId ? <PaySplit form={form} /> : null}
        {showAwb ? (
          <View style={styles.extraRow}>
            <Text style={styles.extraLabel}>AWB number</Text>
            <TextInput
              style={styles.awbInput}
              value={form.awbNumber}
              onChangeText={form.setAwbNumber}
              placeholder="AWB-00123"
              placeholderTextColor={Colors.gray400}
              autoFocus={!form.awbNumber}
              autoCapitalize="characters"
            />
          </View>
        ) : (
          <ExtraRow label="AWB number" onPress={() => setShowAwb(true)} />
        )}
        {own && !later && !rotation ? <ExtraRow label="Assign later instead" chevron onPress={form.assignLater} last /> : null}
      </Section>

      <PickerSheet
        visible={driverTarget !== null}
        title={driverTarget?.kind === 'co' ? 'Co-driver' : driverTarget?.kind === 'day' ? `Driver for ${fmtDay(driverTarget.date)}` : 'Driver'}
        options={[
          ...(driverTarget?.kind === 'day' ? [{ value: '__default', label: 'Use the default driver' }] : []),
          ...driverOptions(driverTarget?.kind === 'co' ? form.driverId : undefined),
        ]}
        value={
          driverTarget?.kind === 'co'
            ? form.coDriverId
            : driverTarget?.kind === 'rotation'
              ? form.rotationDrivers[driverTarget.index]
              : driverTarget?.kind === 'day'
                ? (form.dayOverrides[driverTarget.date]?.driverId ?? '__default')
                : form.driverId
        }
        onSelect={(v) => (v === '__default' && driverTarget?.kind === 'day' ? form.setDayOverride(driverTarget.date, null) : onPickDriver(v))}
        onClose={() => setDriverTarget(null)}
        searchPlaceholder="Name, phone or plate"
        footerAction={{ label: '+ Add a new driver', onPress: () => router.push('/driver-edit' as any) }}
      />
      <PickerSheet
        visible={truckSheet}
        title="Truck"
        options={truckOptions}
        value={form.vehicleId}
        onSelect={(v) => form.setVehicleId(v)}
        onClose={() => setTruckSheet(false)}
        searchPlaceholder="Plate or type"
        footerAction={{ label: '+ Add a new truck', onPress: () => router.push('/vehicle-edit' as any) }}
      />
      <PickerSheet
        visible={providerSheet}
        title="3PL partner"
        options={form.providers.map((p) => ({ value: p.id, label: niceName(p.name), sub: [niceName(p.contact_person), p.phone].filter(Boolean).join(' · ') || undefined }))}
        value={form.thirdPartyProviderId}
        onSelect={(v) => form.setThirdPartyProviderId(v)}
        onClose={() => setProviderSheet(false)}
        footerAction={{ label: '+ Add a new partner', onPress: () => router.push('/third-party-edit' as any) }}
      />
    </View>
  );
}

/** The chosen driver and their truck, together. */
function AssignedBody({
  driver,
  truck,
  chips,
  tripClass,
  onChangeTruck,
}: {
  driver: OperatorDriverOption;
  truck: OperatorVehicleOption | null;
  chips: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'accent' }[];
  tripClass: string;
  onChangeTruck: () => void;
}) {
  const onTrip = truck?.status === 'OnTrip';
  const truckClass = truck ? truckClassOfVehicle(truck) : null;
  return (
    <View>
      <View style={styles.rowCenter}>
        <Avatar d={driver} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={styles.assignedName} numberOfLines={1}>
            {fullName(driver)}
          </Text>
          <Text style={styles.assignedSub} numberOfLines={1}>
            {driver.phone_primary || 'Driver'}
          </Text>
        </View>
      </View>
      <ChipRow chips={chips.slice(0, 4)} style={{ marginTop: 8 }} />
      <TouchableOpacity style={styles.truckRow} onPress={onChangeTruck} activeOpacity={0.7}>
        <Truck size={16} color={Colors.gray600} />
        <Text style={styles.truckText} numberOfLines={1}>
          {truck ? truck.plate_number : 'No truck yet'}
        </Text>
        {truck ? <Chip label={truckClass || ''} tone={truckClass === tripClass ? 'neutral' : 'warning'} /> : null}
        <Text style={styles.link}>{truck ? 'Change' : 'Choose'}</Text>
      </TouchableOpacity>
      {truck && truckClass !== tripClass ? <Text style={styles.warnNote}>This trip is priced for {tripClass}.</Text> : null}
      {onTrip ? <Text style={styles.warnNote}>This truck is on another trip right now — check it is back in time.</Text> : null}
    </View>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How the trip's driver payout is shared with the co-driver — half each by
 * default; changing one side moves the other so they add up to the payout (web's CoDriverPaySplit).
 */
function PaySplit({ form }: { form: CreateTripForm }) {
  const total = Number(form.slot.driverPayout) || 0;
  const v = form.coDriverSplit;
  const half = round2(total / 2);
  const auto = v.driverPayoutOverride === undefined && v.coDriverPayoutOverride === undefined;
  const driverPay = v.driverPayoutOverride ?? (v.coDriverPayoutOverride !== undefined ? round2(total - v.coDriverPayoutOverride) : half);
  const coPay = v.coDriverPayoutOverride ?? (v.driverPayoutOverride !== undefined ? round2(total - v.driverPayoutOverride) : half);
  const sum = round2(driverPay + coPay);
  const set = (side: 'driver' | 'co', raw: string) => {
    const n = Math.max(0, Number(raw.replace(/[^0-9.]/g, '')) || 0);
    const other = total > 0 ? Math.max(0, round2(total - n)) : undefined;
    form.setCoDriverSplit(side === 'driver' ? { driverPayoutOverride: n, coDriverPayoutOverride: other } : { coDriverPayoutOverride: n, driverPayoutOverride: other });
  };
  return (
    <View style={styles.split}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.splitLabel}>Driver pay</Text>
          <TextField prefix="SAR" value={String(driverPay)} onChangeText={(t) => set('driver', t)} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.splitLabel}>Co-driver pay</Text>
          <TextField prefix="SAR" value={String(coPay)} onChangeText={(t) => set('co', t)} keyboardType="decimal-pad" />
        </View>
      </View>
      <View style={[styles.rowCenter, { marginTop: 6, justifyContent: 'space-between' }]}>
        <Text style={[styles.hint, total > 0 && Math.abs(sum - total) > 0.001 && { color: Colors.warning }]}>
          Per trip · payout SAR {fmtSar(total)}
          {total > 0 && Math.abs(sum - total) > 0.001 ? ` (split adds up to SAR ${fmtSar(sum)})` : ''}
        </Text>
        {auto ? <Chip label="50/50" tone="success" /> : <LinkButton label="Reset 50/50" onPress={() => form.setCoDriverSplit({})} />}
      </View>
    </View>
  );
}

function ExtraRow({ label, value, onPress, onClear, chevron, last }: { label: string; value?: string; onPress: () => void; onClear?: () => void; chevron?: boolean; last?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.extraRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.extraLabel}>{label}</Text>
      {value ? (
        <Text style={styles.extraValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onClear ? (
        <TouchableOpacity onPress={onClear} hitSlop={8}>
          <X size={16} color={Colors.gray500} />
        </TouchableOpacity>
      ) : chevron ? (
        <ChevronRight size={16} color={Colors.gray400} />
      ) : (
        <Text style={styles.link}>Add</Text>
      )}
    </TouchableOpacity>
  );
}

function RotationEditor({
  form,
  truckOf,
  onPick,
}: {
  form: CreateTripForm;
  truckOf: (driverId: string) => OperatorVehicleOption | undefined;
  onPick: (index: number) => void;
}) {
  return (
    <View>
      <Text style={styles.hint}>Drivers take turns day by day, each with their own truck.</Text>
      {form.rotationDrivers.map((id, i) => {
        const d = form.drivers.find((x) => x.id === id);
        const truck = id ? truckOf(id) : undefined;
        return (
          <View key={i} style={[styles.row, { marginTop: 8, alignItems: 'center' }]}>
            <Text style={styles.rotIndex}>{i + 1}</Text>
            <TouchableOpacity onPress={() => onPick(i)} activeOpacity={0.7} style={[styles.driver, { flex: 1, marginTop: 0 }]}>
              {d ? <Avatar d={d} size={32} /> : <User size={18} color={Colors.gray400} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, !d && { color: Colors.gray400, fontWeight: '400' }]} numberOfLines={1}>
                  {d ? fullName(d) : `Choose driver ${i + 1}`}
                </Text>
                {d ? <Text style={styles.driverSub}>{truck ? `${truck.plate_number} · ${truckClassOfVehicle(truck)}` : 'No truck'}</Text> : null}
              </View>
            </TouchableOpacity>
            {form.rotationDrivers.length > 2 ? (
              <TouchableOpacity onPress={() => form.setRotationDrivers(form.rotationDrivers.filter((_, j) => j !== i))} hitSlop={8}>
                <X size={18} color={Colors.gray500} />
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
      {form.rotationDrivers.length < 4 ? <LinkButton label="+ Add driver" onPress={() => form.setRotationDrivers([...form.rotationDrivers, ''])} /> : null}
      <DayTiles form={form} />
    </View>
  );
}

/** One tile per operating day with who drives it; tap to change that day (per-day plan). */
function DayTiles({ form, onPick }: { form: CreateTripForm; onPick?: (date: string) => void }) {
  const dates = [...form.selectedDates].sort();
  if (dates.length === 0) return <Text style={styles.hint}>Pick the operating days on step 2 to see who drives when.</Text>;
  const whoFor = (date: string) => {
    const a = form.dayAssignments[date];
    if (a?.driverId === UNASSIGNED) return { d: null, later: true, changed: true };
    if (a?.driverId) return { d: form.drivers.find((x) => x.id === a.driverId) ?? null, later: false, changed: form.monthlyMode === 'per_day' };
    return { d: form.driverId === UNASSIGNED ? null : form.selectedDriver, later: form.driverId === UNASSIGNED, changed: false };
  };
  return (
    <View>
      <Text style={[styles.hint, { marginBottom: 8 }]}>{onPick ? 'Tap a day to change its driver.' : 'Who drives when'}</Text>
      <View style={styles.tiles}>
        {dates.map((date) => {
          const { d, later, changed } = whoFor(date);
          const clash = form.runCheck.clashDates.includes(date);
          const [dow, day] = fmtDay(date).replace(',', '').split(' ');
          return (
            <TouchableOpacity key={date} disabled={!onPick} onPress={() => onPick?.(date)} activeOpacity={0.7} style={[styles.tile, changed && styles.tileChanged, clash && styles.tileClash]}>
              <Text style={styles.tileDate}>
                {dow} {day}
              </Text>
              {d ? <Avatar d={d} size={28} /> : <Clock3 size={20} color={later ? Colors.warning : Colors.gray300} />}
              <Text style={styles.tileName} numberOfLines={1}>
                {d ? shortName(fullName(d)).split(' ')[0] : later ? 'Later' : '—'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** 1915 → "1 d 7 h 55 min". */
export function runLength(m: number): string {
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return [d ? `${d} d` : '', h ? `${h} h` : '', min ? `${min} min` : ''].filter(Boolean).join(' ') || '0 min';
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hint: { fontSize: 12, color: Colors.gray500, lineHeight: 17 },
  rotIndex: { width: 18, textAlign: 'center', fontSize: 13, fontWeight: '700', color: Colors.gray500 },
  link: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  warnText: { fontSize: 13, color: Colors.warning, fontWeight: '600' },
  warnNote: { fontSize: 12, color: Colors.warning, marginTop: 6 },
  driver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  driverName: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
  driverSub: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  score: { fontSize: 12, fontWeight: '800', color: Colors.success, marginLeft: 6 },
  split: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  splitLabel: { fontSize: 11, color: Colors.gray500, fontWeight: '600', marginBottom: 4 },
  pastDriver: { minWidth: 120, maxWidth: 180, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.gray100, borderWidth: 1.5, borderColor: 'transparent' },
  pastDriverOn: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  pastName: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  pastSub: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  assignedName: { fontSize: 16, fontWeight: '700', color: Colors.charcoal },
  assignedSub: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  truckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  truckText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  extraLabel: { fontSize: 14, color: Colors.charcoal, flex: 1 },
  extraValue: { fontSize: 13, color: Colors.gray600, maxWidth: '55%' },
  awbInput: { flex: 1, fontSize: 14, color: Colors.charcoal, textAlign: 'right', paddingVertical: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: {
    width: '23.5%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.gray100,
  },
  tileChanged: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tileClash: { borderColor: Colors.danger, backgroundColor: '#FEF3F2' },
  tileDate: { fontSize: 11, fontWeight: '600', color: Colors.gray600 },
  tileName: { fontSize: 11, color: Colors.charcoal, maxWidth: '90%' },
});
