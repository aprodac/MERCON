/** Step 2 — when: one trip's pickup and drop-off, or a monthly contract's days. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Flag, RotateCcw } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { addDaysToDateStr, dropoffDayOffset, returnLegDayOffsets } from '@mercon/shared-types';
import type { CreateTripForm } from '../useCreateTrip';
import { Chip, ErrorText, Section, ValueTile, fmtDay, tap } from './ui';
import { WhenSheet, type WhenValue } from './WhenSheet';
import { RouteTiming } from './RouteTiming';
import { runLength } from './StepAssign';

type PickerTarget = 'pickup' | 'dropoff' | 'returnPickup' | 'returnDropoff' | null;

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StepSchedule({ form, showErrors }: { form: CreateTripForm; showErrors: boolean }) {
  const [picker, setPicker] = useState<PickerTarget>(null);
  const { slot } = form;
  const issues = form.stepIssues(2);
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field || i.field === `${field}-${slot.id}`)?.message : undefined);
  const tomorrow = addDaysToDateStr(form.today, 1);

  const suggestedBadge = !form.dropoffTouched && slot.dropoffTime ? <Chip label="Suggested" /> : null;
  const pickupSet = Boolean(slot.pickupTime && (form.isMonthly || slot.date));

  // Round trip: the way back runs on its own times, often the next day — a
  // monthly contract says which day of each run ("Day 2"), a single trip a date.
  const round = form.isRoundTrip;
  const dropDay = dropoffDayOffset(slot);
  const retDays = returnLegDayOffsets(slot);
  // Monthly: "Day 2 · Fri 9 Oct" from the first operating day picked; Day 1 is each operating day.
  const firstDay = [...form.selectedDates].sort()[0];
  const dayLabel = (day: number) => `Day ${day + 1}${firstDay ? ` · ${fmtDay(addDaysToDateStr(firstDay, day))}` : ''}`;
  const outboundArrival: WhenValue = { date: slot.dropoffDate || slot.date || form.today, time: slot.dropoffTime, day: dropDay };
  const returnLoad: WhenValue | null = slot.returnPickupTime
    ? { date: slot.returnPickupDate || outboundArrival.date, time: slot.returnPickupTime, day: retDays.pickup ?? dropDay }
    : null;
  const returnHome: WhenValue | null = slot.returnDropoffTime && returnLoad
    ? { date: slot.returnDropoffDate || returnLoad.date, time: slot.returnDropoffTime, day: retDays.arrival ?? returnLoad.day }
    : null;
  const show = (v: WhenValue | null) => (!v ? '' : form.isMonthly ? `${dayLabel(v.day ?? 0)} · ${v.time}` : `${fmtDay(v.date)} · ${v.time}`);
  /** Minutes from pickup to the return loading, so the route timing starts the way back there. */
  const returnLoadAt = round && returnLoad && slot.pickupTime ? (returnLoad.day ?? 0) * 1440 + toMin(returnLoad.time) - toMin(slot.pickupTime) : null;
  const returnTo = (slot.returnDestination || '').trim() || slot.origin;
  /** One run, pickup to back home (or to the drop-off without a way back): minutes. */
  const lastEvent = returnHome ?? (slot.dropoffTime ? outboundArrival : null);
  const runMinutes = slot.pickupTime && lastEvent ? (lastEvent.day ?? 0) * 1440 + toMin(lastEvent.time) - toMin(slot.pickupTime) : null;
  const returnFrom = (slot.returnOrigin || '').trim() || slot.destination;

  function wayBack() {
    const homeBadge = !form.returnDropoffTouched && slot.returnDropoffTime ? <Chip label="Suggested" /> : null;
    return (
      <Section icon={RotateCcw} tone="amber" title="Way back" badge={homeBadge}>
        <Text style={styles.legLine} numberOfLines={1}>
          {returnFrom || 'Drop-off'} → {returnTo || 'pickup'}
        </Text>
        <View style={styles.row}>
          <ValueTile caption="Return loading" value={show(returnLoad)} placeholder="Set" onPress={() => setPicker('returnPickup')} error={Boolean(err('returnPickup'))} style={{ flex: 1 }} />
          <ValueTile
            caption="Arrival home"
            value={show(returnHome)}
            placeholder={returnLoad ? 'Set' : '—'}
            onPress={() => returnLoad && setPicker('returnDropoff')}
            error={Boolean(err('returnDropoff'))}
            style={{ flex: 1 }}
          />
        </View>
        <ErrorText>{err('returnPickup') || err('returnDropoff')}</ErrorText>
        {runMinutes && runMinutes > 0 ? (
          <Text style={[styles.hint, runMinutes >= 1440 && form.isMonthly && { color: Colors.danger, fontWeight: '600' }]}>
            {`Whole run ${runLength(runMinutes)}.`}
            {runMinutes >= 1440 && form.isMonthly ? ' Longer than a day: on back-to-back days one driver and truck are still on the road when the next run starts. Rotate crews on step 3, or leave days between runs.' : ''}
          </Text>
        ) : null}
        {!returnLoad ? (
          <Text style={styles.hint}>When does the truck load for the way back? It can be the next day — set the day and time.</Text>
        ) : (
          <View style={styles.wayBackFoot}>
            <Text style={[styles.hint, { flex: 1, marginTop: 0 }]}>
              {!form.returnDropoffTouched ? 'Arrival home is filled in from the drive back. Tap to change.' : 'Arrival home set by you.'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                tap();
                form.setReturnPickup({ returnPickupTime: '' });
              }}
              hitSlop={8}
            >
              <Text style={styles.clear}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
      </Section>
    );
  }

  return (
    <View style={{ gap: Spacing.sm }}>
      {form.isMonthly ? (
        <>
          <MonthlyDays form={form} error={err('selectedDates')} />
          <Section icon={Clock} tone="green" title="Daily timing">
            <View style={styles.row}>
              <ValueTile caption="Pickup" value={slot.pickupTime} placeholder="--:--" onPress={() => setPicker('pickup')} error={Boolean(err('pickup'))} style={{ flex: 1 }} />
              <ValueTile
                caption="Drop-off"
                value={round && slot.dropoffTime ? show(outboundArrival) : slot.dropoffTime}
                placeholder="--:--"
                onPress={() => setPicker('dropoff')}
                error={Boolean(err('dropoff'))}
                style={{ flex: 1 }}
              />
            </View>
            <ErrorText>{err('pickup') || err('dropoff')}</ErrorText>
            <Text style={styles.hint}>
              {form.dutyMinutes && !form.dropoffTouched ? `Drop-off set ${form.dutyMinutes / 60} hours after pickup. ` : ''}
              {round ? 'Day 1 is each operating day; Day 2 is the next day.' : 'A drop-off earlier than pickup means the next morning.'}
            </Text>
          </Section>
          {round ? wayBack() : null}
          <RouteTiming eta={form.eta} pending={form.etaPending} startTime={slot.pickupTime || undefined} dutyMinutes={form.dutyMinutes} returnLoadAt={returnLoadAt} />
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

          <RouteTiming eta={form.eta} pending={form.etaPending} startTime={pickupSet ? slot.pickupTime : undefined} dutyMinutes={form.dutyMinutes} returnLoadAt={returnLoadAt} />

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
          {round ? wayBack() : null}
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
        value={outboundArrival}
        from={pickupSet ? { date: slot.date || form.today, time: slot.pickupTime, day: 0 } : undefined}
        days={form.isMonthly && round}
        today={form.today}
        tz={form.tz}
        onDone={(v) => {
          form.setDropoff(form.isMonthly ? { dropoffTime: v.time, dropoffDay: round ? v.day : undefined } : { dropoffDate: v.date, dropoffTime: v.time });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      {round ? (
        <>
          <WhenSheet
            visible={picker === 'returnPickup'}
            title="Return loading"
            mode={form.isMonthly ? 'time' : 'datetime'}
            days={form.isMonthly}
            value={returnLoad ?? outboundArrival}
            from={slot.dropoffTime ? outboundArrival : undefined}
            fromLabel={`arriving at ${returnFrom || 'the drop-off'}`}
            today={form.today}
            tz={form.tz}
            onDone={(v) => {
              form.setReturnPickup(form.isMonthly ? { returnPickupTime: v.time, returnPickupDay: v.day ?? 0 } : { returnPickupDate: v.date, returnPickupTime: v.time });
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
          <WhenSheet
            visible={picker === 'returnDropoff'}
            title="Arrival home"
            mode={form.isMonthly ? 'time' : 'datetime'}
            days={form.isMonthly}
            value={returnHome ?? returnLoad ?? outboundArrival}
            from={returnLoad ?? undefined}
            fromLabel="loading"
            today={form.today}
            tz={form.tz}
            onDone={(v) => {
              form.setReturnDropoff(form.isMonthly ? { returnDropoffTime: v.time, returnDropoffDay: v.day ?? 0 } : { returnDropoffDate: v.date, returnDropoffTime: v.time });
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        </>
      ) : null}
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
  legLine: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 8 },
  wayBackFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  clear: { fontSize: 12, fontWeight: '700', color: Colors.danger },
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
