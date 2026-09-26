/** Step 2 — when: one trip's pickup and drop-off, or a monthly contract's days. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Flag } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { addDaysToDateStr } from '@mercon/shared-types';
import type { CreateTripForm } from '../useCreateTrip';
import { Chip, ErrorText, Section, ValueTile, fmtDay, tap } from './ui';
import { WhenSheet } from './WhenSheet';
import { RouteTiming } from './RouteTiming';

type PickerTarget = 'pickup' | 'dropoff' | null;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StepSchedule({ form, showErrors }: { form: CreateTripForm; showErrors: boolean }) {
  const [picker, setPicker] = useState<PickerTarget>(null);
  const { slot } = form;
  const issues = form.stepIssues(2);
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field || i.field === `${field}-${slot.id}`)?.message : undefined);
  const tomorrow = addDaysToDateStr(form.today, 1);

  const suggestedBadge = !form.dropoffTouched && slot.dropoffTime ? <Chip label="Suggested" /> : null;
  const pickupSet = Boolean(slot.pickupTime && (form.isMonthly || slot.date));

  return (
    <View style={{ gap: Spacing.sm }}>
      {form.isMonthly ? (
        <>
          <MonthlyDays form={form} error={err('selectedDates')} />
          <Section icon={Clock} tone="green" title="Daily timing">
            <View style={styles.row}>
              <ValueTile caption="Pickup" value={slot.pickupTime} placeholder="--:--" onPress={() => setPicker('pickup')} error={Boolean(err('pickup'))} style={{ flex: 1 }} />
              <ValueTile caption="Drop-off" value={slot.dropoffTime} placeholder="--:--" onPress={() => setPicker('dropoff')} error={Boolean(err('dropoff'))} style={{ flex: 1 }} />
            </View>
            <ErrorText>{err('pickup') || err('dropoff')}</ErrorText>
            <Text style={styles.hint}>
              {form.dutyMinutes && !form.dropoffTouched ? `Drop-off set ${form.dutyMinutes / 60} hours after pickup. ` : ''}A drop-off earlier than pickup means the next morning.
            </Text>
          </Section>
          <RouteTiming eta={form.eta} pending={form.etaPending} startTime={slot.pickupTime || undefined} dutyMinutes={form.dutyMinutes} />
        </>
      ) : (
        <>
          <Section icon={ArrowUpRight} tone="green" title="Pickup">
            <View style={styles.row}>
              <ValueTile caption="Date" value={fmtDay(slot.date)} placeholder="Choose" onPress={() => setPicker('pickup')} error={Boolean(err('date'))} style={{ flex: 1 }} />
              <ValueTile caption="Time" value={slot.pickupTime} placeholder="--:--" onPress={() => setPicker('pickup')} error={Boolean(err('pickup'))} style={{ width: 104 }} />
            </View>
            <View style={styles.quickRow}>
              {[
                { label: 'Today', date: form.today },
                { label: 'Tomorrow', date: tomorrow },
              ].map((q) => {
                const on = slot.date === q.date;
                return (
                  <TouchableOpacity
                    key={q.label}
                    onPress={() => {
                      tap();
                      form.updateSlot({ date: q.date });
                    }}
                    style={[styles.quick, on && styles.quickOn]}
                  >
                    <Text style={[styles.quickText, on && styles.quickTextOn]}>{q.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <ErrorText>{err('date') || err('pickup')}</ErrorText>
          </Section>

          <RouteTiming eta={form.eta} pending={form.etaPending} startTime={pickupSet ? slot.pickupTime : undefined} dutyMinutes={form.dutyMinutes} />

          <Section icon={Flag} tone="coral" title="Drop-off" badge={suggestedBadge}>
            <View style={styles.row}>
              <ValueTile caption="Date" value={slot.dropoffTime ? fmtDay(slot.dropoffDate || slot.date) : ''} placeholder="—" onPress={() => setPicker('dropoff')} error={Boolean(err('dropoff'))} style={{ flex: 1 }} />
              <ValueTile caption="Time" value={slot.dropoffTime} placeholder="--:--" onPress={() => setPicker('dropoff')} error={Boolean(err('dropoff'))} style={{ width: 104 }} />
            </View>
            <ErrorText>{err('dropoff')}</ErrorText>
            {!pickupSet ? (
              <Text style={styles.hint}>Set the pickup first — the drop-off is then suggested from the {form.dutyMinutes ? 'duty length' : 'drive time'}.</Text>
            ) : !form.dropoffTouched ? (
              <Text style={styles.hint}>
                Filled in from the {form.dutyMinutes ? 'duty length' : 'route timing above, every stop included'}. Tap to change.
              </Text>
            ) : null}
          </Section>
        </>
      )}

      <WhenSheet
        visible={picker === 'pickup'}
        title="Pickup"
        mode={form.isMonthly ? 'time' : 'datetime'}
        value={{ date: slot.date || form.today, time: slot.pickupTime }}
        today={form.today}
        tz={form.tz}
        onDone={(v) => {
          form.updateSlot({ date: v.date, pickupTime: v.time });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <WhenSheet
        visible={picker === 'dropoff'}
        title="Drop-off"
        mode={form.isMonthly ? 'time' : 'datetime'}
        value={{ date: slot.dropoffDate || slot.date || form.today, time: slot.dropoffTime }}
        from={pickupSet ? { date: slot.date || form.today, time: slot.pickupTime } : undefined}
        today={form.today}
        tz={form.tz}
        onDone={(v) => {
          form.setDropoff(form.isMonthly ? { dropoffTime: v.time } : { dropoffDate: v.date, dropoffTime: v.time });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function MonthlyDays({ form, error }: { form: CreateTripForm; error?: string }) {
  const [month, setMonth] = useState(() => {
    const [y, m] = form.today.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const year = month.getFullYear();
  const mon = month.getMonth();
  const days = new Date(year, mon + 1, 0).getDate();
  const prefix = `${year}-${String(mon + 1).padStart(2, '0')}`;
  const key = (d: number) => `${prefix}-${String(d).padStart(2, '0')}`;

  const cells = useMemo(() => {
    const lead = new Date(year, mon, 1).getDay();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as (number | null)[];
  }, [year, mon, days]);

  const selected = new Set(form.selectedDates);
  const inMonth = form.selectedDates.filter((d) => d.startsWith(prefix));

  const setMonthDays = (pick: (weekday: number) => boolean) => {
    tap();
    const others = form.selectedDates.filter((d) => !d.startsWith(prefix));
    const mine = Array.from({ length: days }, (_, i) => i + 1)
      .filter((d) => pick(new Date(year, mon, d).getDay()))
      .map(key);
    form.setSelectedDates([...others, ...mine].sort());
  };

  const toggle = (d: number) => {
    tap();
    const k = key(d);
    form.setSelectedDates(selected.has(k) ? form.selectedDates.filter((x) => x !== k) : [...form.selectedDates, k].sort());
  };

  return (
    <Section icon={CalendarDays} tone="blue" title="Operating days" badge={form.selectedDates.length ? <Chip label={`${form.selectedDates.length} days`} tone="accent" /> : null}>
      <View style={styles.monthHead}>
        <TouchableOpacity onPress={() => setMonth(new Date(year, mon - 1, 1))} hitSlop={10} style={styles.monthNav}>
          <ChevronLeft size={18} color={Colors.gray700} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity onPress={() => setMonth(new Date(year, mon + 1, 1))} hitSlop={10} style={styles.monthNav}>
          <ChevronRight size={18} color={Colors.gray700} />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.weekday, (w === 'Fri' || w === 'Sat') && { color: Colors.gray400 }]}>
            {w}
          </Text>
        ))}
        {cells.map((d, i) =>
          d == null ? (
            <View key={`e${i}`} style={styles.cell} />
          ) : (
            <TouchableOpacity key={d} style={styles.cell} onPress={() => toggle(d)} activeOpacity={0.7}>
              <View style={[styles.day, selected.has(key(d)) && styles.dayOn, key(d) === form.today && !selected.has(key(d)) && styles.dayToday]}>
                <Text style={[styles.dayText, selected.has(key(d)) && styles.dayTextOn]}>{d}</Text>
              </View>
            </TouchableOpacity>
          ),
        )}
      </View>
      <View style={styles.monthActions}>
        <TouchableOpacity style={styles.quick} onPress={() => setMonthDays((wd) => wd <= 4)}>
          <Text style={styles.quickText}>Sun–Thu</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => setMonthDays(() => true)}>
          <Text style={styles.quickText}>Whole month</Text>
        </TouchableOpacity>
        {inMonth.length > 0 ? (
          <TouchableOpacity style={styles.quick} onPress={() => setMonthDays(() => false)}>
            <Text style={[styles.quickText, { color: Colors.danger }]}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ErrorText>{error}</ErrorText>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  quickRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  quick: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.gray100 },
  quickOn: { backgroundColor: Colors.primaryLight },
  quickText: { fontSize: 12, fontWeight: '600', color: Colors.gray700 },
  quickTextOn: { color: Colors.primaryDark },
  hint: { fontSize: 12, color: Colors.gray500, marginTop: 8, lineHeight: 17 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 },
  monthNav: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '600', color: Colors.gray500, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: Colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayText: { fontSize: 13, color: Colors.charcoal },
  dayTextOn: { color: Colors.white, fontWeight: '700' },
  monthActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});
