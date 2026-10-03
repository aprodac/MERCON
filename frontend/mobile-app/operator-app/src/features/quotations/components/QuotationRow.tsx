/**
 * One quotation in the list — a compact row:
 *   Riyadh → Jeddah  (+2 stops)                      SAR 1,500
 *   ● Active · Customer name                          / trip
 *   Flatbed · Round trip
 * Status is said once, in words, with its dot. Tap to open the details page.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { niceName } from '@/features/trips/create/components/ui';
import { formatCurrency } from '../services/quotationsService';
import { QUOTATION_STATUS } from './status';
import type { QuotationListItem } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

export function QuotationRow({ quotation: q, onPress }: { quotation: QuotationListItem; onPress: () => void }) {
  const st = QUOTATION_STATUS[q.validityStatus] ?? QUOTATION_STATUS.Inactive;
  const via = Math.max(0, q.stops.length - 2);

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open quotation ${q.firstStop} to ${q.lastStop}`}>
      <View style={s.text}>
        <Text style={s.route} numberOfLines={2}>
          {q.firstStop}
          <Text style={s.arrow}>{'  →  '}</Text>
          {q.lastStop}
          {via > 0 ? <Text style={s.via}>{`   +${via} ${via === 1 ? 'stop' : 'stops'}`}</Text> : null}
        </Text>
        <View style={s.metaRow}>
          <View style={[s.dot, { backgroundColor: st.dot }]} />
          <Text style={s.meta} numberOfLines={1}>
            <Text style={{ color: st.fg, fontWeight: '600' }}>{st.label}</Text>
            {`  ·  ${niceName(q.customerName)}`}
          </Text>
        </View>
        <Text style={s.meta} numberOfLines={1}>{[q.vehicleClass, q.lineType].filter(Boolean).join('  ·  ')}</Text>
      </View>
      <View style={s.price}>
        <Text style={s.rate} numberOfLines={1}>{formatCurrency(q.rate, q.currency)}</Text>
        <Text style={s.unit}>{q.isMonthly ? '/ month' : '/ trip'}</Text>
      </View>
      <ChevronRight size={16} color="#B4B4BD" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 13, paddingHorizontal: 14 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  route: { fontSize: 16, fontWeight: '600', color: INK, letterSpacing: -0.2, lineHeight: 21 },
  arrow: { color: '#FA634E', fontWeight: '600' },
  via: { fontSize: 12, fontWeight: '500', color: MUTED },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { fontSize: 13, color: MUTED, flexShrink: 1 },
  price: { alignItems: 'flex-end', gap: 2 },
  rate: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, color: MUTED },
});
