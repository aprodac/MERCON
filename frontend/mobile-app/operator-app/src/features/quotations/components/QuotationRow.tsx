/**
 * One quotation in the list:
 *   Dammam → Jubail → Hafar Al Batin                 SAR 19,000
 *   (logo) Customer — left out inside one company      per month
 *   [Monthly] [🚚 3-4 TON] [↻ Round trip] [Expires in 12 days]
 *   ─────────────────────────────────────────────────────────
 *   Driver SAR 1,100 · Margin SAR 400            Used 34× · 3 days ago
 *
 * The whole route is spelled out (stops in between in grey) so lanes that
 * share their ends still read differently; a long one keeps its first stop
 * after pickup and folds the rest into "+N". A pickup and drop-off at the same
 * place reads "Within Dammam". Tap to open the details page.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ChevronRight, CircleAlert, MapPin } from 'lucide-react-native';
import { niceName } from '@/features/trips/create/components/ui';
import { agoText, formatCurrency, marginOf, outboundStops } from '../services/quotationsService';
import type { QuotationListItem } from '../types';
import { CompanyLogo } from './CompanyLogo';
import { QuotationBadges } from './QuotationBadges';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const BRAND = '#FA634E';

/** The route as one line of text: ends in ink, stops in between in grey. */
export function RoutePath({ q, dim, size = 16 }: { q: QuotationListItem; dim?: boolean; size?: number }) {
  const stops = outboundStops(q).map((s) => niceName(s.shortName));
  const first = stops[0] ?? niceName(q.firstStop);
  const last = stops[stops.length - 1] ?? niceName(q.lastStop);
  const mids = stops.slice(1, -1);
  const arrow = <Text style={s.arrow}>{'  →  '}</Text>;

  if (q.isLocal && mids.length === 0) {
    return (
      <View style={s.local}>
        <MapPin size={size - 2} color={BRAND} strokeWidth={2.4} />
        <Text style={[s.route, { fontSize: size }, dim && { color: MUTED }]} numberOfLines={2}>
          <Text style={s.within}>Within </Text>{first}
        </Text>
      </View>
    );
  }

  // Long routes keep the first stop after pickup and fold the rest into "+N".
  const shown = mids.length > 2 ? [mids[0], `+${mids.length - 1}`] : mids;
  return (
    <Text style={[s.route, { fontSize: size, lineHeight: size + 5 }, dim && { color: MUTED }]} numberOfLines={3}>
      {first}
      {shown.map((m, i) => (
        <Text key={i}>
          {arrow}
          <Text style={s.mid}>{m}</Text>
        </Text>
      ))}
      {arrow}
      {last}
    </Text>
  );
}

export function QuotationRow({ quotation: q, onPress, hideCustomer, hideTruck }: { quotation: QuotationListItem; onPress: () => void; hideCustomer?: boolean; hideTruck?: boolean }) {
  const off = q.validityStatus !== 'Active';
  const cur = q.currency || 'SAR';
  const margin = marginOf(q);
  const pay = q.driverPayout === null
    ? null
    : margin !== null
      ? `Driver ${formatCurrency(q.driverPayout, cur)}  ·  Margin ${formatCurrency(margin, cur)}`
      : `Driver ${formatCurrency(q.driverPayout, cur)}`;
  const used = q.tripCount > 0 ? `Used ${q.tripCount}×${q.lastTripAt ? `  ·  ${agoText(q.lastTripAt)}` : ''}` : 'Not used yet';

  return (
    <TouchableOpacity style={[s.row, off && s.rowOff]} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open quotation ${q.firstStop} to ${q.lastStop}`}>
      <View style={s.top}>
        <View style={s.text}>
          <RoutePath q={q} dim={off} />
          {!hideCustomer ? (
            <View style={s.customer}>
              <CompanyLogo name={q.customerName} uri={q.customerLogo} size={18} />
              <Text style={s.meta} numberOfLines={1}>{niceName(q.customerName)}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.price}>
          <Text style={[s.rate, off && { color: MUTED }]} numberOfLines={1}>
            <Text style={s.cur}>{cur} </Text>
            {q.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </Text>
          <Text style={s.unit}>{q.isMonthly ? 'per month' : 'per trip'}</Text>
        </View>
        <ChevronRight size={16} color="#B4B4BD" />
      </View>

      <QuotationBadges q={q} hideTruck={hideTruck} />

      <View style={s.foot}>
        {pay ? (
          <Text style={s.footText} numberOfLines={1}>{pay}</Text>
        ) : (
          <View style={s.warn}>
            <CircleAlert size={12} color="#B42318" strokeWidth={2.4} />
            <Text style={s.warnText}>No driver pay set</Text>
          </View>
        )}
        <Text style={[s.footText, s.used, q.tripCount === 0 && { color: '#9898A4' }]} numberOfLines={1}>{used}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingTop: 13, paddingBottom: 10, paddingHorizontal: 14 },
  rowOff: { backgroundColor: '#FBFBFC' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, minWidth: 0, gap: 5 },
  route: { fontSize: 16, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  arrow: { color: BRAND, fontWeight: '600' },
  mid: { color: '#8A8A94', fontWeight: '600' },
  local: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  within: { color: MUTED, fontWeight: '600' },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flex: 1, fontSize: 13, color: MUTED },
  price: { alignItems: 'flex-end', gap: 1 },
  rate: { fontSize: 17, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  cur: { fontSize: 12, fontWeight: '700', color: MUTED },
  unit: { fontSize: 12, color: MUTED },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F1F1F3', paddingTop: 8 },
  footText: { flexShrink: 1, fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  used: { marginLeft: 'auto', textAlign: 'right' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  warnText: { fontSize: 12, fontWeight: '600', color: '#B42318' },
});
