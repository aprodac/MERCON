/**
 * The drivers' phones at a glance, above the Drivers list: how many are ready,
 * need checking, are not ready, and never installed the app — plus how many
 * still have an app update to install. Replaces one long wrapping line of text
 * (TestFlight 22 Oct: "make the UI of the marked area good, show never installed").
 * Tap a number to list just those drivers (TestFlight 24 Oct: "if we press never
 * installed it should show that list separately"); tap it again to show everyone.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Download, Smartphone } from 'lucide-react-native';
import { INK, MUTED } from '../../trips/details/components/parts';
import type { FleetPhoneRow } from './driverPhone';

const COLS = [
  { key: 'ready', label: 'Ready', color: '#146C3C' },
  { key: 'check', label: 'Check', color: '#B54708' },
  { key: 'notReady', label: 'Not ready', color: '#B42318' },
  // "Not installed" rather than "Never installed" — it may have been installed once (TestFlight 24 Oct).
  { key: 'never', label: 'Not installed', color: '#52525B' },
] as const;

export type PhoneGroup = (typeof COLS)[number]['key'];
export const PHONE_GROUP_LABEL: Record<PhoneGroup, string> = Object.fromEntries(COLS.map((c) => [c.key, c.label])) as Record<PhoneGroup, string>;

/** Which of the four numbers a driver's phone counts under. */
export function phoneGroupOf(r: FleetPhoneRow): PhoneGroup {
  return r.never_installed ? 'never' : r.level === 'green' ? 'ready' : r.level === 'amber' ? 'check' : 'notReady';
}

export function phoneSummaryOf(rows: FleetPhoneRow[]) {
  const c = { ready: 0, check: 0, notReady: 0, never: 0, updates: 0, latest: null as string | null };
  for (const r of rows) {
    c[phoneGroupOf(r)]++;
    if (r.needs_update) c.updates++;
    c.latest ??= r.latest_version ?? null;
  }
  return c;
}

/** `shown`: drivers in the list below (after search / filter); the counts are for every driver. */
export function PhoneSummary({ shown, filtered, rows, group, onGroup }: {
  shown: number; filtered: boolean; rows: FleetPhoneRow[] | undefined;
  group?: PhoneGroup | null; onGroup?: (g: PhoneGroup | null) => void;
}) {
  const c = rows ? phoneSummaryOf(rows) : null;
  const all = rows?.length ?? shown;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Smartphone size={15} color={MUTED} />
        <Text style={s.title}>Driver app</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.total}>{filtered ? `${shown} of ${all} shown` : `${all} ${all === 1 ? 'driver' : 'drivers'}`}</Text>
      </View>
      <View style={s.cols}>
        {COLS.map((col, i) => {
          const on = group === col.key;
          return (
            <TouchableOpacity
              key={col.key}
              style={[s.col, i > 0 && !on && group !== COLS[i - 1].key && s.colBorder, on && s.colOn]}
              disabled={!onGroup || !c || (!c[col.key] && !on)}
              onPress={() => onGroup?.(on ? null : col.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c ? c[col.key] : 0} ${col.label}`}
            >
              <Text style={[s.num, { color: c && c[col.key] ? col.color : '#A1A1AA' }]}>{c ? c[col.key] : '–'}</Text>
              <Text style={[s.label, on && { color: INK }]} numberOfLines={2}>{col.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {c && c.updates > 0 ? (
        <View style={s.update}>
          <Download size={13} color="#B54708" />
          <Text style={s.updateText}>
            {c.updates} {c.updates === 1 ? 'driver needs' : 'drivers need'} the app update{c.latest ? ` (latest ${c.latest})` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 0.2 },
  total: { fontSize: 13, fontWeight: '700', color: INK },
  cols: { flexDirection: 'row' },
  col: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 4 },
  colBorder: { borderLeftWidth: 1, borderLeftColor: '#EFEFF2' },
  colOn: { backgroundColor: '#F1F2F5', borderRadius: 10, paddingVertical: 4 },
  num: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  label: { fontSize: 11.5, fontWeight: '600', color: MUTED, textAlign: 'center' },
  update: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF6E5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  updateText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#8A5200' },
});
