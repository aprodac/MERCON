/**
 * The small coloured tags that tell quotations apart at a glance:
 *   [Monthly] / [Extra]      billing — purple / orange
 *   [↻ Round trip] …         line type with its own icon
 *   [🚚 10 TON]              truck class
 *   [Expires in 12 days]     validity warning (amber), Expired (red)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Clock, MapPin, Repeat, Truck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { QuotationListItem } from '../types';

export const OPERATION_TONE: Record<'Monthly' | 'Extra', { fg: string; bg: string }> = {
  Monthly: { fg: '#5B34B0', bg: '#F1ECFD' },
  Extra: { fg: '#B54708', bg: '#FFF1E6' },
};

/** The icon for a line type code (see QuotationListItem.lineTypeKey). */
export function lineTypeIcon(key: string): LucideIcon {
  if (key === 'ROUND_TRIP') return Repeat;
  if (key === '10_HRS' || key === '12_HRS') return Clock;
  return ArrowRight;
}

const STATUS_TEXT: Record<string, string> = { Expired: 'Expired', Inactive: 'Inactive', Future: 'Starts later' };

export function Badge({ label, Icon, fg = '#52525B', bg = '#F1F1F3' }: { label: string; Icon?: LucideIcon; fg?: string; bg?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      {Icon ? <Icon size={12} color={fg} strokeWidth={2.4} /> : null}
      <Text style={[s.text, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** "Expires in 12 days" / "Expires today" — only for an active quotation ending soon. */
export function expiryText(q: QuotationListItem): string | null {
  if (!q.expiringSoon || q.daysLeft === null) return null;
  if (q.daysLeft <= 0) return 'Expires today';
  return `Expires in ${q.daysLeft} ${q.daysLeft === 1 ? 'day' : 'days'}`;
}

/** Everything that tells this quotation apart from its neighbours, in one wrapping row. */
export function QuotationBadges({ q, hideTruck }: { q: QuotationListItem; hideTruck?: boolean }) {
  const op = OPERATION_TONE[q.operationKey];
  const expiry = expiryText(q);
  const off = q.validityStatus !== 'Active';
  return (
    <View style={s.row}>
      {off ? (
        <Badge
          label={STATUS_TEXT[q.validityStatus] ?? 'Inactive'}
          fg={q.validityStatus === 'Expired' ? '#B42318' : '#6B6B76'}
          bg={q.validityStatus === 'Expired' ? '#FEF0EE' : '#E9E9EC'}
        />
      ) : null}
      {expiry ? <Badge label={expiry} fg="#B54708" bg="#FEF6E7" /> : null}
      <Badge label={q.operationKey} fg={op.fg} bg={op.bg} />
      {hideTruck ? null : <Badge label={q.vehicleClass} Icon={Truck} />}
      <Badge label={q.lineType} Icon={lineTypeIcon(q.lineTypeKey)} />
      {q.isLocal ? <Badge label="Local" Icon={MapPin} fg="#0E6E8C" bg="#E8F6FA" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, maxWidth: '100%' },
  text: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
