/** Step 3 — who: own driver and truck (or several, for a monthly contract), or a 3PL partner. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { CalendarDays, ChevronRight, Clock3, Handshake, SlidersHorizontal, Sparkles, Truck, User, Users, X } from 'lucide-react-native';
import { Colors, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { truckClassOfVehicle } from '@mercon/shared-types';
import { DriverAvatar } from '../../../drivers/components/DriverAvatar';
import { UNASSIGNED, type CreateTripForm } from '../useCreateTrip';
import type { OperatorDriverOption, OperatorVehicleOption } from '../../../../lib/operator';
import {
  Card,
  Chip,
  ErrorText,
  FieldButton,
  Label,
  LinkButton,
  PickerSheet,
  Section,
  Segmented,
  TextField,
  fmtDay,
  initialsOf,
  niceName,
  shortName,
  tap,
  type PickerOption,
} from './ui';

type DriverTarget = { kind: 'master' } | { kind: 'co' } | { kind: 'rotation'; index: number } | { kind: 'day'; date: string };

const fullName = (d?: { first_name?: string; last_name?: string } | null) => (d ? niceName(`${d.first_name || ''} ${d.last_name || ''}`.trim()) : '');
const isFree = (status?: string | null) => !status || status.toLowerCase() === 'available';

function Avatar({ d, size }: { d?: OperatorDriverOption | null; size: number }) {
  return <DriverAvatar initials={initialsOf(fullName(d))} avatarUrl={d?.avatar_url || d?.photo_url} size={size} />;
}

export function StepAssign({ form, showErrors }: { form: CreateTripForm; showErrors: boolean }) {
  const [driverTarget, setDriverTarget] = useState<DriverTarget | null>(null);
  const [truckSheet, setTruckSheet] = useState(false);
  const [providerSheet, setProviderSheet] = useState(false);
  const [showAwb, setShowAwb] = useState(Boolean(form.awbNumber));

  const issues = form.stepIssues(3);
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field)?.message : undefined);
  const payoutIssue = showErrors ? form.allIssues.find((i) => i.field.startsWith('driverPayout'))?.message : undefined;

  const recMap = useMemo(() => new Map(form.recommended.map((r) => [r.driverId, r])), [form.recommended]);
  const truckOf = (driverId: string) => form.vehicles.find((v) => v.id === form.driverTruckId(driverId));

  const driverOptions = (exclude?: string): PickerOption[] => {
    const opts = form.drivers
      .filter((d) => d.id !== exclude && !`${d.first_name} ${d.last_name}`.toLowerCase().includes('audit'))
      .map((d) => {
        const rec = recMap.get(d.id);
        const truck = truckOf(d.id);
        const free = isFree(d.status);
        return {
          value: d.id,
          label: fullName(d) || 'Driver',
          sub: [truck ? `${truck.plate_number} · ${truckClassOfVehicle(truck)}` : 'No truck', rec?.routeTripCount ? `${rec.routeTripCount} trips on this route` : '', !free ? d.status : '']
            .filter(Boolean)
            .join(' · '),
          group: rec && free ? 'Recommended' : free ? 'Available' : 'Busy',
          badge: rec?.capacityMatch === false && truck ? { label: 'Other class', tone: 'warning' as const } : undefined,
          leading: <Avatar d={d} size={32} />,
          disabled: !free,
          score: rec ? rec.score + (rec.capacityMatch ? 1000 : 0) : -1,
        };
      });
    const order: Record<string, number> = { Recommended: 0, Available: 1, Busy: 2 };
    opts.sort((a, b) => order[a.group] - order[b.group] || b.score - a.score || a.label.localeCompare(b.label));
    return opts;
  };

  const truckOptions: PickerOption[] = useMemo(() => {
    const opts = form.vehicles.map((v) => {
      const cls = truckClassOfVehicle(v);
      const free = isFree(v.status) || v.id === form.vehicleId;
      return {
        value: v.id,
        label: v.plate_number,
        sub: [niceName(v.asset_type), cls, !free ? v.status : ''].filter(Boolean).join(' · '),
        group: cls === form.vehicleType ? `${form.vehicleType} trucks` : 'Other classes',
        disabled: !free,
        leading: <Truck size={18} color={Colors.gray500} />,
      };
    });
    opts.sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group.startsWith(form.vehicleType) ? -1 : 1));
    return [{ value: UNASSIGNED, label: 'Assign later', sub: 'Pick the truck before dispatch', leading: <Clock3 size={18} color={Colors.warning} /> }, ...opts];
  }, [form.vehicles, form.vehicleType, form.vehicleId]);

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
  const top = form.recommended
    .filter((r) => form.drivers.some((d) => d.id === r.driverId && isFree(d.status)))
    .sort((a, b) => Number(b.capacityMatch) - Number(a.capacityMatch) || b.score - a.score)
    .slice(0, 3);

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
          <ErrorText>{err('thirdPartyCost')}</ErrorText>
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
                trips={recMap.get(form.selectedDriver.id)?.routeTripCount}
                tripClass={form.vehicleType}
                onChangeTruck={() => setTruckSheet(true)}
              />
            </Section>
          ) : (
            <Section icon={Sparkles} tone="violet" title={top.length ? 'Recommended for this route' : 'Driver'}>
              {top.map((r, i) => {
                const d = form.drivers.find((x) => x.id === r.driverId)!;
                const truck = truckOf(r.driverId);
                return (
                  <TouchableOpacity
                    key={r.driverId}
                    onPress={() => {
                      tap();
                      form.selectDriver(r.driverId);
                    }}
                    activeOpacity={0.7}
                    style={[styles.driver, i === 0 && { marginTop: 0 }]}
                  >
                    <Avatar d={d} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName} numberOfLines={1}>
                        {fullName(d)}
                      </Text>
                      <Text style={styles.driverSub} numberOfLines={1}>
                        {[truck ? `${truck.plate_number} · ${truckClassOfVehicle(truck)}` : 'No truck', r.routeTripCount ? `${r.routeTripCount} trips here` : ''].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {!r.capacityMatch ? <Chip label="Other class" tone="warning" /> : <ChevronRight size={16} color={Colors.gray400} />}
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

      {payoutIssue && own ? (
        <Card tone="warning">
          <Text style={styles.warnText}>{payoutIssue}. Set it on step 1, in the price card.</Text>
        </Card>
      ) : null}

      <Section icon={SlidersHorizontal} tone="gray" title="Extras">
        {own && !later && !rotation ? (
          <ExtraRow
            label="Co-driver"
            value={form.coDriverId ? `${shortName(fullName(form.selectedCoDriver))} · payout split 50/50` : undefined}
            onPress={() => setDriverTarget({ kind: 'co' })}
            onClear={form.coDriverId ? () => form.setCoDriverId('') : undefined}
          />
        ) : null}
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
      />
      <PickerSheet
        visible={truckSheet}
        title="Truck"
        options={truckOptions}
        value={form.vehicleId}
        onSelect={(v) => form.setVehicleId(v)}
        onClose={() => setTruckSheet(false)}
        searchPlaceholder="Plate or type"
      />
      <PickerSheet
        visible={providerSheet}
        title="3PL partner"
        options={form.providers.map((p) => ({ value: p.id, label: niceName(p.name), sub: [niceName(p.contact_person), p.phone].filter(Boolean).join(' · ') || undefined }))}
        value={form.thirdPartyProviderId}
        onSelect={(v) => form.setThirdPartyProviderId(v)}
        onClose={() => setProviderSheet(false)}
      />
    </View>
  );
}

/** The chosen driver and their truck, together. */
function AssignedBody({
  driver,
  truck,
  trips,
  tripClass,
  onChangeTruck,
}: {
  driver: OperatorDriverOption;
  truck: OperatorVehicleOption | null;
  trips?: number;
  tripClass: string;
  onChangeTruck: () => void;
}) {
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
            {[driver.phone_primary, trips ? `${trips} trips on this route` : ''].filter(Boolean).join(' · ') || 'Driver'}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.truckRow} onPress={onChangeTruck} activeOpacity={0.7}>
        <Truck size={16} color={Colors.gray600} />
        <Text style={styles.truckText} numberOfLines={1}>
          {truck ? truck.plate_number : 'No truck yet'}
        </Text>
        {truck ? <Chip label={truckClass || ''} tone={truckClass === tripClass ? 'neutral' : 'warning'} /> : null}
        <Text style={styles.link}>{truck ? 'Change' : 'Choose'}</Text>
      </TouchableOpacity>
      {truck && truckClass !== tripClass ? <Text style={styles.warnNote}>This trip is priced for {tripClass}.</Text> : null}
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
          const [dow, day] = fmtDay(date).replace(',', '').split(' ');
          return (
            <TouchableOpacity key={date} disabled={!onPick} onPress={() => onPick?.(date)} activeOpacity={0.7} style={[styles.tile, changed && styles.tileChanged]}>
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
  tileDate: { fontSize: 11, fontWeight: '600', color: Colors.gray600 },
  tileName: { fontSize: 11, color: Colors.charcoal, maxWidth: '90%' },
});
