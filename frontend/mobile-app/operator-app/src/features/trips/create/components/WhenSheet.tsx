/**
 * iOS-style date and time picker: scroll wheels for day, hour and minute in a
 * bottom sheet, with quick picks and a live summary. Pure JS, so it looks the
 * same on iPhone and Android and needs no native module.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { addDaysToDateStr } from '@mercon/shared-types';
import { fmtDay, tap } from './ui';

const ROW = 44;
const VISIBLE = 5; // odd, so one row sits in the middle
const PAD = ((VISIBLE - 1) / 2) * ROW;
const MINUTE_STEP = 5;

interface WheelItem {
  key: string;
  label: string;
}

/** One scrolling column that snaps to a row; the middle row is the value. */
function Wheel({ items, index, onChange, flex = 1, align = 'center' }: { items: WheelItem[]; index: number; onChange: (i: number) => void; flex?: number; align?: 'center' | 'left' | 'right' }) {
  const ref = useRef<ScrollView>(null);
  const [live, setLive] = useState(index);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow value changes made outside the wheel (quick picks).
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = clamp(Math.round(e.nativeEvent.contentOffset.y / ROW));
    if (i !== live) {
      setLive(i);
      tap();
    }
  };

  const settle = (y: number) => {
    const i = clamp(Math.round(y / ROW));
    if (i !== index) onChange(i);
  };

  return (
    <View style={{ flex, height: ROW * VISIBLE }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: PAD }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          // A slow drag can end without momentum; settle shortly after if nothing else does.
          const y = e.nativeEvent.contentOffset.y;
          if (settleTimer.current) clearTimeout(settleTimer.current);
          settleTimer.current = setTimeout(() => settle(y), 180);
        }}
        onMomentumScrollBegin={() => settleTimer.current && clearTimeout(settleTimer.current)}
        nestedScrollEnabled
      >
        {items.map((it, i) => {
          const dist = Math.abs(i - live);
          return (
            <TouchableOpacity
              key={it.key}
              activeOpacity={0.6}
              style={styles.row}
              onPress={() => {
                ref.current?.scrollTo({ y: i * ROW, animated: true });
                onChange(i);
              }}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.rowText,
                  { textAlign: align, opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.25 },
                  dist === 0 && styles.rowTextOn,
                ]}
              >
                {it.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS: WheelItem[] = Array.from({ length: 24 }, (_, h) => ({ key: `h${h}`, label: String(h).padStart(2, '0') }));
const MINUTES: WheelItem[] = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => ({ key: `m${i}`, label: String(i * MINUTE_STEP).padStart(2, '0') }));

function splitTime(t?: string): { h: number; m: number } {
  const [h, m] = (t || '08:00').split(':').map(Number);
  return { h: Number.isFinite(h) ? h : 8, m: Number.isFinite(m) ? m : 0 };
}
const joinTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const minutesBetween = (d1: string, t1: string, d2: string, t2: string) => {
  const a = splitTime(t1);
  const b = splitTime(t2);
  const days = Math.round((Date.UTC(...(d2.split('-').map(Number) as [number, number, number])) - Date.UTC(...(d1.split('-').map(Number) as [number, number, number]))) / 86400000);
  return days * 1440 + (b.h * 60 + b.m) - (a.h * 60 + a.m);
};
const fmtDuration = (mins: number) => {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h ? `${h} h` : ''}${h && m ? ' ' : ''}${m ? `${m} min` : ''}` || '0 min';
};

/** Now in the deployment timezone, rounded up to the next 5 minutes. */
function nowIn(tz: string): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t: string) => parts.find((p) => p.type === t)?.value || '0';
    let date = `${g('year')}-${g('month')}-${g('day')}`;
    let mins = Number(g('hour')) * 60 + Math.ceil(Number(g('minute')) / MINUTE_STEP) * MINUTE_STEP;
    if (mins >= 1440) {
      mins -= 1440;
      date = addDaysToDateStr(date, 1);
    }
    return { date, time: joinTime(Math.floor(mins / 60), mins % 60) };
  } catch {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), time: joinTime(d.getHours(), 0) };
  }
}

export interface WhenValue {
  date: string;
  time: string;
}

/**
 * `mode="datetime"` picks a day and a time; `mode="time"` only a time
 * (monthly contracts). `from` is the pickup when choosing a drop-off: the
 * sheet then shows the trip length and offers "+ hours" quick picks.
 */
export function WhenSheet({
  visible,
  title,
  mode,
  value,
  today,
  tz,
  from,
  onDone,
  onClose,
}: {
  visible: boolean;
  title: string;
  mode: 'datetime' | 'time';
  value: WhenValue;
  today: string;
  tz: string;
  from?: WhenValue;
  onDone: (v: WhenValue) => void;
  onClose: () => void;
}) {
  // Days from 60 back (entering past trips) to a year ahead.
  const days = useMemo(() => {
    const start = addDaysToDateStr(today, -60);
    return Array.from({ length: 60 + 366 }, (_, i) => {
      const d = addDaysToDateStr(start, i);
      const label = d === today ? 'Today' : d === addDaysToDateStr(today, 1) ? 'Tomorrow' : d === addDaysToDateStr(today, -1) ? 'Yesterday' : fmtDay(d);
      return { key: d, label, date: d };
    });
  }, [today]);

  const [draft, setDraft] = useState<WhenValue>(value);
  // Reset the draft each time the sheet opens.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const openKey = visible ? `${value.date}|${value.time}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (visible) setDraft({ date: value.date || today, time: value.time || '08:00' });
  }

  const { h, m } = splitTime(draft.time);
  const dayIndex = Math.max(0, days.findIndex((d) => d.date === (draft.date || today)));
  const minuteIndex = Math.min(MINUTES.length - 1, Math.round(m / MINUTE_STEP));

  const length = from && mode === 'datetime' ? minutesBetween(from.date, from.time, draft.date, draft.time) : null;
  const lengthTimeOnly = from && mode === 'time' ? ((minutesBetween('2000-01-01', from.time, '2000-01-01', draft.time) + 1440) % 1440 || 1440) : null;

  const addToFrom = (hours: number) => {
    if (!from) return;
    const { h: fh, m: fm } = splitTime(from.time);
    const total = fh * 60 + fm + hours * 60;
    tap();
    setDraft({
      date: mode === 'datetime' ? addDaysToDateStr(from.date, Math.floor(total / 1440)) : draft.date,
      time: joinTime(Math.floor((total % 1440) / 60), total % 60),
    });
  };

  const quick: { label: string; on: () => void }[] = from
    ? [4, 8, 10, 12].map((hrs) => ({ label: `+${hrs} h`, on: () => addToFrom(hrs) }))
    : mode === 'datetime'
      ? [
          { label: 'Now', on: () => (tap(), setDraft(nowIn(tz))) },
          { label: 'Today 08:00', on: () => (tap(), setDraft({ date: today, time: '08:00' })) },
          { label: 'Tomorrow 08:00', on: () => (tap(), setDraft({ date: addDaysToDateStr(today, 1), time: '08:00' })) },
        ]
      : ['06:00', '08:00', '14:00', '20:00'].map((t) => ({ label: t, on: () => (tap(), setDraft({ ...draft, time: t })) }));

  const invalid = length !== null && length <= 0;

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={title} maxHeight="90%">
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{mode === 'datetime' ? `${fmtDay(draft.date)} · ${draft.time}` : draft.time}</Text>
        {length !== null ? (
          <Text style={[styles.summarySub, invalid && { color: Colors.danger }]}>
            {invalid ? 'Before the pickup — move it later' : `${fmtDuration(length)} after pickup`}
          </Text>
        ) : lengthTimeOnly !== null ? (
          <Text style={styles.summarySub}>
            {fmtDuration(lengthTimeOnly)} after pickup{splitTime(draft.time).h * 60 + splitTime(draft.time).m <= splitTime(from!.time).h * 60 + splitTime(from!.time).m ? ' · next morning' : ''}
          </Text>
        ) : null}
      </View>

      <View style={styles.quickRow}>
        {quick.map((q) => (
          <TouchableOpacity key={q.label} onPress={q.on} style={styles.quick} activeOpacity={0.7}>
            <Text style={styles.quickText}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.wheels}>
        <View pointerEvents="none" style={styles.band} />
        {mode === 'datetime' ? (
          <Wheel items={days} index={dayIndex} onChange={(i) => setDraft((d) => ({ ...d, date: days[i].date }))} flex={1.6} align="right" />
        ) : null}
        <Wheel items={HOURS} index={h} onChange={(i) => setDraft((d) => ({ ...d, time: joinTime(i, splitTime(d.time).m) }))} flex={0.7} />
        <Text style={styles.colon}>:</Text>
        <Wheel items={MINUTES} index={minuteIndex} onChange={(i) => setDraft((d) => ({ ...d, time: joinTime(splitTime(d.time).h, i * MINUTE_STEP) }))} flex={0.7} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.done, invalid && { opacity: 0.4 }]}
          disabled={invalid}
          onPress={() => {
            tap();
            onDone(draft);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: 'center', paddingVertical: Spacing.sm },
  summaryValue: { fontSize: 22, fontWeight: '800', color: Colors.charcoal },
  summarySub: { fontSize: 13, color: Colors.gray500, marginTop: 3, fontWeight: '500' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginVertical: Spacing.sm },
  quick: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.gray100 },
  quickText: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
  wheels: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, marginTop: Spacing.xs },
  band: { position: 'absolute', left: 0, right: 0, top: PAD, height: ROW, borderRadius: 12, backgroundColor: Colors.gray100 },
  row: { height: ROW, justifyContent: 'center', paddingHorizontal: 8 },
  rowText: { fontSize: 20, color: Colors.charcoal, fontWeight: '400' },
  rowTextOn: { fontWeight: '700' },
  colon: { fontSize: 22, fontWeight: '700', color: Colors.charcoal, marginHorizontal: -2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: Spacing.base, marginBottom: Spacing.sm },
  cancel: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.gray100, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: Colors.gray700 },
  done: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  doneText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
