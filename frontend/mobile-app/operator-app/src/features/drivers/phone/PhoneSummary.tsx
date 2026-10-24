/**
 * The drivers' phones at a glance, above the Drivers list: how many are ready,
 * need checking, are not ready, and never installed the app — plus how many
 * still have an app update to install. Replaces one long wrapping line of text
 * (TestFlight 22 Oct: "make the UI of the marked area good, show never installed").
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Download, Smartphone } from 'lucide-react-native';
import { INK, MUTED } from '../../trips/details/components/parts';
import type { FleetPhoneRow } from './driverPhone';

const COLS = [
  { key: 'ready', label: 'Ready', color: '#146C3C' },
  { key: 'check', label: 'Check', color: '#B54708' },
  { key: 'notReady', label: 'Not ready', color: '#B42318' },
  { key: 'never', label: 'Never installed', color: '#52525B' },
] as const;

export function phoneSummaryOf(rows: FleetPhoneRow[]) {
  const c = { ready: 0, check: 0, notReady: 0, never: 0, updates: 0, latest: null as string | null };
  for (const r of rows) {
    if (r.never_installed) c.never++;
    else if (r.level === 'green') c.ready++;
    else if (r.level === 'amber') c.check++;
    else c.notReady++;
    if (r.needs_update) c.updates++;
    c.latest ??= r.latest_version ?? null;
  }
  return c;
}

/** `shown`: drivers in the list below (after search / filter); the counts are for every driver. */
export function PhoneSummary({ shown, filtered, rows }: { shown: number; filtered: boolean; rows: FleetPhoneRow[] | undefined }) {
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
        {COLS.map((col, i) => (
          <View key={col.key} style={[s.col, i > 0 && s.colBorder]}>
            <Text style={[s.num, { color: c && c[col.key] ? col.color : '#A1A1AA' }]}>{c ? c[col.key] : '–'}</Text>
            <Text style={s.label} numberOfLines={2}>{col.label}</Text>
          </View>
        ))}
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
  col: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  colBorder: { borderLeftWidth: 1, borderLeftColor: '#EFEFF2' },
  num: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  label: { fontSize: 11.5, fontWeight: '600', color: MUTED, textAlign: 'center' },
  update: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF6E5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  updateText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#8A5200' },
});
