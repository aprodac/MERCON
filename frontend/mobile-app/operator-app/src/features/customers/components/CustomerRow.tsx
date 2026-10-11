/**
 * One customer in the list — a compact row:
 *   (logo)  Company name                                   (⋮)
 *           ● Active · +966 5x xxx xxxx
 *           12 trips this month · SAR 4,200 due
 * Tap the row to open the customer; ⋮ holds edit / suspend / delete for the
 * roles allowed to do them. "due" is red because it is money still owed.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { CompanyAvatar, niceName } from '@/features/trips/create/components/ui';
import { CustomerOverflowMenu } from './CustomerOverflowMenu';
import type { CustomerListItem, CustomerPermissions } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

interface CustomerRowProps {
  customer: CustomerListItem;
  permissions: CustomerPermissions;
  onPress: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

export function CustomerRow({ customer: c, permissions, onPress, onEdit, onToggleActive, onDelete }: CustomerRowProps) {
  const active = c.isActive;
  const money = (n: number) => `${c.currency} ${Math.round(n).toLocaleString('en-US')}`;
  const work = `${c.tripsThisMonth} ${c.tripsThisMonth === 1 ? 'trip' : 'trips'} this month`;

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`}>
      <CompanyAvatar name={c.name} url={c.logoUrl} size={46} />
      <View style={s.text}>
        <Text style={s.name} numberOfLines={2}>{niceName(c.name)}</Text>
        <View style={s.metaRow}>
          <View style={[s.dot, { backgroundColor: active ? '#1F9D55' : '#9898A4' }]} />
          <Text style={s.meta} numberOfLines={1}>
            <Text style={{ color: active ? '#146C3C' : MUTED, fontWeight: '600' }}>{active ? 'Active' : 'Inactive'}</Text>
            {c.phone ? `  ·  ${c.phone}` : ''}
          </Text>
        </View>
        <Text style={s.meta} numberOfLines={1}>
          {work}
          {c.outstanding > 0 ? <Text style={{ color: '#B42318', fontWeight: '600' }}>{`  ·  ${money(c.outstanding)} due`}</Text> : null}
        </Text>
      </View>
      <CustomerOverflowMenu customer={c} permissions={permissions} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 16, fontWeight: '600', color: INK, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { fontSize: 13, color: MUTED, flexShrink: 1, fontVariant: ['tabular-nums'] },
});
