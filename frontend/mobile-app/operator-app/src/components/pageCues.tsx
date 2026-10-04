/**
 * Visual cues shared by every operator page, so each page is recognisable at a
 * glance and they all speak the same visual language:
 *
 *   pageIcon(title)  the page's own icon (same icons as the side drawer),
 *                    shown beside the title in the top bar
 *   <PageTitle>      icon + title for detail pages that draw their own bar
 *   <Tile>           an icon on a soft colour tile; the colour follows what
 *                    the icon stands for (calls green, trucks blue, money
 *                    amber…), so the same thing is the same colour everywhere
 *   <SectionLabel>   a card heading led by its icon
 *   <TabIcon>        the icon for a tab, by its name
 *   <EmptyHint>      an icon + one line for an empty or failed list inside a
 *                    card; the icon is picked from what the line talks about
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Bell, Building2, CalendarDays, CircleAlert, CreditCard, Eye, FileText, FolderOpen, Gauge, IdCard, Inbox, Layers, LayoutGrid, Mail, Map as MapIcon, MapPin,
  MessageCircle, Navigation, Phone, ReceiptText, Route, Satellite, Share2, SquareUserRound, Tag, Truck, User, UserCog, UserRound, UserRoundCog,
  Users, Wallet, Weight, Wrench, type LucideIcon,
} from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { TONE, type Tone } from '@/features/trips/details/tripDetailsModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

const PAGE_ICONS: Record<string, LucideIcon> = {
  trips: Route,
  drivers: Users,
  driver: UserRound,
  vehicles: Truck,
  vehicle: Truck,
  customers: SquareUserRound,
  customer: SquareUserRound,
  quotations: Tag,
  quotation: Tag,
  'fleet map': MapIcon,
  '3rd party fleet': Building2,
  carrier: Building2,
  invoices: ReceiptText,
  expenses: CreditCard,
  documents: FolderOpen,
  maintenance: Wrench,
  users: UserCog,
  profile: User,
  notifications: Bell,
};

export function pageIcon(title?: string | null): LucideIcon | null {
  return PAGE_ICONS[(title ?? '').trim().toLowerCase()] ?? null;
}

/** The small brand-tinted tile that carries a page's icon. */
export function PageIconTile({ title, size = 34 }: { title?: string | null; size?: number }) {
  const Icon = pageIcon(title);
  if (!Icon) return null;
  return (
    <View style={[s.tile, { width: size, height: size, borderRadius: Math.round(size * 0.32) }]}>
      <Icon size={Math.round(size * 0.5)} color={Colors.primary} strokeWidth={2.2} />
    </View>
  );
}

/** Centre title for a detail page's own top bar: the page icon, then its name. */
export function PageTitle({ title }: { title: string }) {
  const Icon = pageIcon(title);
  return (
    <View style={s.title}>
      {Icon ? <Icon size={16} color={Colors.primary} strokeWidth={2.3} /> : null}
      <Text style={s.titleText} numberOfLines={1}>{title}</Text>
    </View>
  );
}

/* ── colour by meaning ─────────────────────────────────────────────────── */

type TileTone = Tone | 'brand';
const toneOf = (t: TileTone) => (t === 'brand' ? { bg: Colors.primaryLight, fg: Colors.primary } : TONE[t]);

/** What each icon stands for → its colour. Anything not listed is gray. */
const ICON_TONE = new Map<LucideIcon, TileTone>([
  [Phone, 'green'], [MessageCircle, 'green'], [Wallet, 'green'],
  [Truck, 'blue'], [UserRound, 'blue'], [Navigation, 'blue'], [Building2, 'blue'], [Gauge, 'blue'],
  [Route, 'violet'], [Tag, 'violet'], [Users, 'violet'], [UserRoundCog, 'violet'], [Layers, 'violet'], [Satellite, 'violet'],
  [MapPin, 'sky'], [FileText, 'sky'], [CalendarDays, 'sky'], [Eye, 'sky'], [Mail, 'sky'],
  [ReceiptText, 'amber'], [IdCard, 'amber'], [Wrench, 'amber'], [Weight, 'amber'],
  [Share2, 'brand'], [CircleAlert, 'brand'],
]);

/** An icon on a soft colour tile. `tone` overrides the colour the icon would get by itself. */
export function Tile({ icon: Icon, tone, size = 36, round }: { icon: LucideIcon; tone?: Tone | 'brand'; size?: number; round?: boolean }) {
  const t = toneOf(tone ?? ICON_TONE.get(Icon) ?? 'gray');
  return (
    <View style={{ width: size, height: size, borderRadius: round ? size / 2 : Math.round(size * 0.3), backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={Math.round(size * 0.46)} color={t.fg} strokeWidth={2.2} />
    </View>
  );
}

// A card heading → its icon. First match wins.
const SECTION_ICONS: [RegExp, LucideIcon][] = [
  [/location|stops|places/i, MapPin],
  [/driver/i, UserRound],
  [/month|pay/i, Wallet],
  [/licen[cs]e/i, IdCard],
  [/charge|invoice/i, ReceiptText],
  [/workshop|service|maintenance/i, Wrench],
  [/contact/i, Phone],
  [/right now|trip|road/i, Route],
];

/** A card heading: a small coloured icon, then the label. `flat` drops the bottom margin (when it sits in a row). */
export function SectionLabel({ children, flat }: { children: React.ReactNode; flat?: boolean }) {
  const text = textOf(children);
  const Icon = SECTION_ICONS.find(([re]) => re.test(text))?.[1] ?? null;
  const t = toneOf(Icon ? ICON_TONE.get(Icon) ?? 'gray' : 'gray');
  return (
    <View style={[s.section, flat ? { flex: 1 } : { marginBottom: 10 }]}>
      {Icon ? <Icon size={14} color={t.fg} strokeWidth={2.4} /> : null}
      <Text style={s.sectionText} numberOfLines={1}>{children}</Text>
    </View>
  );
}

// A fact's label → its icon. First match wins.
const FACT_ICONS: [RegExp, LucideIcon][] = [
  [/odometer/i, Gauge],
  [/capacity/i, Weight],
  [/truck|trailer/i, Truck],
  [/tracker|gps/i, Satellite],
  [/line/i, Route],
  [/operation/i, Layers],
  [/pay|margin/i, Wallet],
  [/valid|per day|since|time zone/i, CalendarDays],
  [/company|vat|cr number/i, Building2],
  [/version/i, Layers],
  [/rate|basis/i, Tag],
];

/** One fact as a row: its icon tile, the label, and the value on the right. */
export function FactRow({ label, value, accent, first }: { label: string; value: string; accent?: boolean; first?: boolean }) {
  const Icon = FACT_ICONS.find(([re]) => re.test(label))?.[1] ?? Tag;
  return (
    <View style={[s.fact, !first && s.factBorder]}>
      <Tile icon={Icon} size={32} />
      <Text style={s.factLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.factValue, accent && { color: Colors.primary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const TAB_ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid, trips: Route, docs: FileText, service: Wrench, payout: Wallet, sharing: Share2, invoices: ReceiptText, quotes: Tag, places: MapPin, rates: Tag, details: FileText,
};

/** The icon above a tab's label. Brand colour when the tab is selected. */
export function TabIcon({ label, on }: { label: string; on: boolean }) {
  const Icon = TAB_ICONS[label.trim().toLowerCase()];
  return Icon ? <Icon size={16} color={on ? Colors.primary : '#9898A4'} strokeWidth={2.2} /> : null;
}

// What an empty line is about → its icon. First match wins.
const HINTS: [RegExp, LucideIcon][] = [
  [/couldn.t|aren.t available|try again/i, CircleAlert],
  [/tracking|link/i, Share2],
  [/invoice/i, ReceiptText],
  [/pay|numbers/i, Wallet],
  [/quotation|rate|charge|agreed/i, Tag],
  [/place|location/i, MapPin],
  [/document|upload/i, FileText],
  [/maintenance/i, Wrench],
  [/driver/i, UserRound],
  [/trip|truck/i, Truck],
];

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

/** One line for an empty, loading or failed list inside a card, led by an icon that says what is missing. */
export function EmptyHint({ children, icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  const text = textOf(children);
  const loading = /^loading/i.test(text.trim());
  const failed = /couldn.t|try again/i.test(text);
  const Icon = icon ?? HINTS.find(([re]) => re.test(text))?.[1] ?? Inbox;
  return (
    <View style={s.hint}>
      {loading ? null : <Tile icon={Icon} tone={failed ? 'brand' : undefined} size={34} round />}
      <Text style={s.hintText}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleText: { fontSize: 16, fontWeight: '700', color: INK },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  factBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  factLabel: { fontSize: 14, color: MUTED },
  factValue: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionText: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  hintText: { flex: 1, fontSize: 14, color: MUTED },
});
