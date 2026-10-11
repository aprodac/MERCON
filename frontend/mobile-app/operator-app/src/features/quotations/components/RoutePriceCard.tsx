/**
 * "By route" view: one card per route (same stops, line type and billing),
 * with one price cell per truck size — so a company's four Dammam → Dammam
 * 12-hour rates read as one row of 3-4 TON · 5 TON · 10 TON · 20 TON prices.
 * Tap a cell for that quotation's page.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TRUCK_CLASSES, normalizeTruckClass } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { outboundStops } from '../services/quotationsService';
import type { QuotationListItem } from '../types';
import { Badge, OPERATION_TONE, expiryText, lineTypeIcon } from './QuotationBadges';
import { RoutePath } from './QuotationRow';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

export interface RouteGroup {
  key: string;
  quotations: QuotationListItem[];
}

/** Smallest truck first; classes outside the standard list go last. */
export function truckOrder(cls: string): number {
  const i = (TRUCK_CLASSES as readonly string[]).indexOf(cls.toUpperCase());
  if (i >= 0) return i;
  return /\d/.test(cls) ? (TRUCK_CLASSES as readonly string[]).indexOf(normalizeTruckClass(cls)) + 0.5 : 99;
}

/** One group per route + line type + billing, in the order the quotations came. */
export function groupByRoute(list: QuotationListItem[]): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const q of list) {
    const path = outboundStops(q).map((s) => s.shortName.trim().toLowerCase()).join('>') || `${q.firstStop}>${q.lastStop}`.toLowerCase();
    const key = `${path}|${q.lineTypeKey}|${q.operationKey}`;
    const g = map.get(key) ?? { key, quotations: [] };
    g.quotations.push(q);
    map.set(key, g);
  }
  for (const g of map.values()) g.quotations.sort((a, b) => truckOrder(a.vehicleClass) - truckOrder(b.vehicleClass) || a.rate - b.rate);
  return [...map.values()];
}

export function RoutePriceCard({ group, onOpen }: { group: RouteGroup; onOpen: (id: string) => void }) {
  const head = group.quotations[0];
  const op = OPERATION_TONE[head.operationKey];
  return (
    <View style={s.card}>
      <RoutePath q={head} />
      <View style={s.badges}>
        <Badge label={head.operationKey} fg={op.fg} bg={op.bg} />
        <Badge label={head.lineType} Icon={lineTypeIcon(head.lineTypeKey)} />
      </View>
      <View style={s.cells}>
        {group.quotations.map((q) => {
          const off = q.validityStatus !== 'Active';
          const warn = expiryText(q);
          return (
            <TouchableOpacity key={q.id} style={[s.cell, off && s.cellOff, !!warn && s.cellWarn]} activeOpacity={0.75} onPress={() => onOpen(q.id)} accessibilityRole="button" accessibilityLabel={`${q.vehicleClass}, ${q.currency} ${q.rate}`}>
              <Text style={s.truck} numberOfLines={1}>{q.vehicleClass}</Text>
              <Text style={[s.rate, off && { color: MUTED, textDecorationLine: 'line-through' }]} numberOfLines={1} adjustsFontSizeToFit>
                {q.rate.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={s.unit} numberOfLines={1}>{off ? q.validityStatus === 'Future' ? 'starts later' : 'not active' : warn ? 'expiring' : q.isMonthly ? '/ month' : '/ trip'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { minWidth: 86, flexGrow: 1, flexBasis: '22%', gap: 1, borderRadius: 12, backgroundColor: '#F6F6F7', paddingHorizontal: 10, paddingVertical: 8 },
  cellOff: { backgroundColor: '#FBFBFC', borderWidth: 1, borderColor: '#EDEDEF', borderStyle: 'dashed' },
  cellWarn: { backgroundColor: '#FEF6E7' },
  truck: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.3 },
  rate: { fontSize: 17, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 11, color: Colors.gray400 },
});
