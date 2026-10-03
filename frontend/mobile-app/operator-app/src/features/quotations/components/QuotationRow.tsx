/**
 * One quotation in the list — a compact row:
 *   Riyadh → Jeddah                                  SAR 1,500
 *   [10 TON] [Round trip] [+2 stops]                   / trip
 * Status shows only when the quotation is not active. Inside one company's
 * list the customer name is left out (`hideCustomer`). Tap to open the details page.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { niceName } from '@/features/trips/create/components/ui';
import type { QuotationListItem } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

const STATUS_LABEL: Record<string, string> = { Expired: 'Expired', Inactive: 'Inactive', Future: 'Starts later' };

export function QuotationRow({ quotation: q, onPress, hideCustomer }: { quotation: QuotationListItem; onPress: () => void; hideCustomer?: boolean }) {
  const via = Math.max(0, q.stops.length - 2);
  const off = q.validityStatus !== 'Active';
  const tags = [q.vehicleClass, q.lineType, via > 0 ? `+${via} ${via === 1 ? 'stop' : 'stops'}` : null].filter(Boolean) as string[];

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open quotation ${q.firstStop} to ${q.lastStop}`}>
      <View style={s.text}>
        <Text style={[s.route, off && { color: MUTED }]} numberOfLines={2}>
          {niceName(q.firstStop)}
          <Text style={s.arrow}>{'  →  '}</Text>
          {niceName(q.lastStop)}
        </Text>
        {!hideCustomer ? <Text style={s.meta} numberOfLines={1}>{niceName(q.customerName)}</Text> : null}
        <View style={s.tags}>
          {off ? <Text style={[s.tag, s.tagOff, q.validityStatus === 'Expired' && s.tagExpired]}>{STATUS_LABEL[q.validityStatus] ?? 'Inactive'}</Text> : null}
          {tags.map((t) => <Text key={t} style={s.tag} numberOfLines={1}>{t}</Text>)}
        </View>
      </View>
      <View style={s.price}>
        <Text style={s.rate} numberOfLines={1}>
          <Text style={s.cur}>{q.currency || 'SAR'} </Text>
          {q.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </Text>
        <Text style={s.unit}>{q.isMonthly ? 'per month' : 'per trip'}</Text>
      </View>
      <ChevronRight size={16} color="#B4B4BD" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 13, paddingHorizontal: 14 },
  text: { flex: 1, minWidth: 0, gap: 7 },
  route: { fontSize: 16, fontWeight: '700', color: INK, letterSpacing: -0.2, lineHeight: 21 },
  arrow: { color: '#FA634E', fontWeight: '600' },
  meta: { fontSize: 13, color: MUTED, marginTop: -3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontSize: 12, fontWeight: '600', color: '#52525B', backgroundColor: '#F1F1F3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  tagOff: { color: MUTED, backgroundColor: '#E9E9EC' },
  tagExpired: { color: '#FA634E', backgroundColor: '#FFF0EB' },
  price: { alignItems: 'flex-end', gap: 1 },
  rate: { fontSize: 17, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  cur: { fontSize: 12, fontWeight: '700', color: MUTED },
  unit: { fontSize: 12, color: MUTED },
});
