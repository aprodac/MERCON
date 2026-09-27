/**
 * Price history shown while editing a quotation's price: the changes made to
 * this quotation, and the other quotations priced on the same route.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { History, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Colors, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { lineTypeLabel } from '@mercon/shared-types';
import { operatorService, type LaneQuotation, type QuotationChange } from '../../../../lib/operator';
import { SkeletonRows, fmtDay, fmtSar, niceName, tap } from './ui';

const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const day = (iso: string) => fmtDay(iso.slice(0, 10));

export function PriceHistory({
  quotationId,
  origin,
  destination,
  vehicleClass,
  customerId,
  onUse,
}: {
  quotationId: string;
  origin: string;
  destination: string;
  vehicleClass?: string;
  customerId?: string;
  onUse: (rate: number, driverPayout: number | null) => void;
}) {
  const [changes, setChanges] = useState<QuotationChange[] | null>(null);
  const [lane, setLane] = useState<LaneQuotation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      operatorService.quotationHistory(quotationId).catch(() => null),
      origin && destination ? operatorService.laneQuotations({ origin, destination, vehicleClass, customerId }).catch(() => null) : Promise.resolve([]),
    ]).then(([c, l]) => {
      if (!alive) return;
      if (c === null && l === null) setFailed(true);
      setChanges(c ?? []);
      setLane((l ?? []).filter((q) => q.id !== quotationId));
    });
    return () => {
      alive = false;
    };
  }, [quotationId, origin, destination, vehicleClass, customerId]);

  const loading = changes === null || lane === null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <History size={14} color={Colors.gray600} />
        <Text style={styles.title}>Price history</Text>
      </View>

      {loading ? (
        <SkeletonRows rows={2} height={40} />
      ) : failed ? (
        <Text style={styles.empty}>{'Couldn’t load the history. Close and reopen Edit price to retry.'}</Text>
      ) : (
        <>
          <Text style={styles.group}>This quotation</Text>
          {changes!.length === 0 ? <Text style={styles.empty}>Never changed since it was created.</Text> : null}
          {changes!.slice(0, 6).map((c) => {
            const rateFrom = n(c.old_rate);
            const rateTo = n(c.new_rate);
            const payFrom = n(c.old_driver_payout);
            const payTo = n(c.new_driver_payout);
            return (
              <View key={c.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  {rateTo !== null && rateTo !== rateFrom ? <Change label="Rate" from={rateFrom} to={rateTo} /> : null}
                  {payTo !== null && payTo !== payFrom ? <Change label="Driver" from={payFrom} to={payTo} /> : null}
                  <Text style={styles.meta} numberOfLines={1}>
                    {[day(c.createdAt), niceName(c.changed_by_name || c.changed_by), c.source === 'TRIP_CREATION' ? 'from a trip' : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            );
          })}

          <Text style={[styles.group, { marginTop: Spacing.sm }]}>Other quotations on this route</Text>
          {lane!.length === 0 ? <Text style={styles.empty}>No other quotation for this route.</Text> : null}
          {lane!.slice(0, 6).map((q) => (
            <View key={q.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.laneTitle} numberOfLines={1}>
                  SAR {fmtSar(q.rate)}
                  {q.driver_payout != null ? <Text style={styles.meta}>{`  ·  driver ${fmtSar(q.driver_payout)}`}</Text> : null}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[lineTypeLabel(q.line_type), q.vehicle_class, (q.billing_type || '').toLowerCase().includes('extra') ? 'Extra' : 'Monthly', day(q.updatedAt)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  tap();
                  onUse(q.rate, q.driver_payout);
                }}
                hitSlop={8}
                style={styles.use}
              >
                <Text style={styles.useText}>Use</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function Change({ label, from, to }: { label: string; from: number | null; to: number }) {
  const up = from !== null && to > from;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <View style={styles.change}>
      <Text style={styles.changeLabel}>{label}</Text>
      <Text style={styles.changeFrom}>{from !== null ? fmtSar(from) : '—'}</Text>
      <Text style={styles.arrow}>→</Text>
      <Text style={styles.changeTo}>{fmtSar(to)}</Text>
      {from !== null && from !== to ? <Icon size={13} color={up ? Colors.success : Colors.danger} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.md, padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  group: { fontSize: 11, fontWeight: '700', color: Colors.gray500, marginBottom: 2 },
  empty: { fontSize: 12, color: Colors.gray500, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  changeLabel: { fontSize: 12, color: Colors.gray500, width: 44 },
  changeFrom: { fontSize: 13, color: Colors.gray500, textDecorationLine: 'line-through' },
  arrow: { fontSize: 12, color: Colors.gray400 },
  changeTo: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  meta: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  laneTitle: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  use: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.primaryLight },
  useText: { fontSize: 12, fontWeight: '700', color: Colors.primaryDark },
});
