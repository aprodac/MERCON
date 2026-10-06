/**
 * The operator side menu (from the ☰ button): brand header, a live fleet
 * strip (on the road / delayed / starting soon), "Go to…" filter, the main
 * pages, then Fleet / Finance / Records / Settings groups, and a New trip
 * button. Each row carries a coloured icon tile (Fleet blue, Finance amber,
 * Records sky, Settings gray) and a badge where something needs attention.
 * Account, version and Log out live on the Profile tab, not here.
 *
 * Badges read the same React Query caches the home uses, so opening the menu
 * doesn't fire a burst of requests.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Animated, ScrollView,
  TouchableWithoutFeedback, Image, TextInput, Easing, useWindowDimensions,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  Map as MapIcon,
  Bell, BellRing, Building2, CreditCard, FileText, FolderOpen, House, Plus, Route, Search, SquareUserRound, Tag, Truck, UserCog, Users, Wrench, X,
  type LucideIcon,
} from 'lucide-react-native';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { operatorService } from '@/lib/operator';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { TONE, type Tone } from '@/features/trips/details/tripDetailsModel';

const ZINC = {
  fg: '#3E3C3D',
  text: '#3E3C3D',
  muted: '#71717A',
  faint: '#A1A1AA',
  border: '#E4E4E7',
  accent: '#F4F4F5',
  soft: '#FAFAFA',
};

type BadgeTone = 'neutral' | 'red' | 'amber' | 'green' | 'solidRed';
type BadgeKey = 'trips' | 'tripsLate' | 'notifications' | 'invoices' | 'documents' | 'fleetMap';
type Badge = { text: string; tone: BadgeTone; dot?: boolean };

interface MenuItem {
  Icon: LucideIcon;
  label: string;
  route: string;
  /** Extra words the "Go to…" filter matches. */
  keywords?: string;
  badges?: BadgeKey[];
  /** Icon tile colour; defaults to the group's. `brand` = MERCON orange. */
  tone?: Tone | 'brand';
  /** Only Admins see it (the server refuses everyone else too). */
  adminOnly?: boolean;
}

interface MenuGroup {
  title: string | null;
  /** Colour of the group's dot and its rows' icon tiles. */
  tone: Tone;
  items: MenuItem[];
}

const GROUPS: MenuGroup[] = [
  {
    title: null,
    tone: 'gray',
    items: [
      { Icon: House, label: 'Home', route: '/', keywords: 'dashboard needs action', tone: 'brand' },
      { Icon: Route, label: 'Trips', route: '/trips', badges: ['trips', 'tripsLate'], keywords: 'schedule history', tone: 'violet' },
      { Icon: Users, label: 'Drivers', route: '/drivers', tone: 'green' },
      { Icon: Bell, label: 'Notifications', route: '/notifications', badges: ['notifications'], keywords: 'alerts', tone: 'amber' },
    ],
  },
  {
    title: 'Fleet',
    tone: 'blue',
    items: [
      { Icon: MapIcon, label: 'Fleet map', route: '/fleet-map', badges: ['fleetMap'], keywords: 'live map trucks location gps tracking' },
      { Icon: Truck, label: 'Vehicles', route: '/vehicles', keywords: 'trucks trailers' },
      { Icon: Building2, label: '3rd party fleet', route: '/third-party', keywords: 'subcontractors providers 3pl' },
      // Hidden until these screens can do more than list (owner, 2026-09-26).
      // { Icon: Wrench, label: 'Maintenance', route: '/maintenance', keywords: 'service repair' },
    ],
  },
  {
    title: 'Finance',
    tone: 'amber',
    items: [
      { Icon: Tag, label: 'Quotations', route: '/quotations', keywords: 'rates lanes' },
      // { Icon: FileText, label: 'Invoices', route: '/invoices', badges: ['invoices'], keywords: 'billing payments' },
      // { Icon: CreditCard, label: 'Expenses', route: '/expenses', keywords: 'costs receipts' },
    ],
  },
  {
    title: 'Records',
    tone: 'sky',
    items: [
      { Icon: FolderOpen, label: 'Documents', route: '/documents', badges: ['documents'], keywords: 'compliance files licence expiry papers' },
      { Icon: SquareUserRound, label: 'Customers', route: '/customers', keywords: 'clients contacts' },
    ],
  },
  {
    title: 'Settings',
    tone: 'gray',
    items: [
      { Icon: UserCog, label: 'User management', route: '/user-management', keywords: 'users accounts drivers passwords logins admin operator' },
      { Icon: BellRing, label: 'Push log', route: '/push-log', adminOnly: true, keywords: 'notifications alerts delivered failed delay phones audit' },
    ],
  },
];

interface OperatorSidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Which edge it slides in from — match the side of the button that opens it. */
  side?: 'left' | 'right';
}

interface FleetNow { onRoad: number; delayed: number; upcoming: number }

/** Counts for the badges and the fleet strip, from data the home screen already loads (same query keys). */
function useMenuBadges(enabled: boolean): { badges: Record<BadgeKey, Badge | null>; fleet: FleetNow | null } {
  const notifications = useNotifications();
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), enabled, staleTime: 60_000 });
  const expiries = useQuery({ queryKey: ['dashboard', 'actions', 'expiries'], queryFn: () => operatorService.documentExpiries().catch(() => []), enabled, staleTime: 5 * 60_000 });
  const invoices = useQuery({ queryKey: ['dashboard', 'actions', 'invoices'], queryFn: () => operatorService.invoices().catch(() => []), enabled, staleTime: 5 * 60_000 });
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    const unread = (notifications.data ?? []).filter((n) => !n.is_read).length;
    const units = live.data ?? [];
    const running = units.filter((u) => u.trip && u.trip.phase !== 'upcoming').length;
    const delayed = units.filter((u) => u.trip?.phase === 'delayed').length;
    const upcoming = units.filter((u) => u.trip?.phase === 'upcoming').length;
    const moving = units.filter((u) => u.motion === 'moving').length;
    const soon = (expiries.data ?? []).filter((e) => e.days <= 7);
    const expired = soon.filter((e) => e.days < 0).length;
    const overdue = (invoices.data ?? []).filter(
      (i) => ['Issued', 'PartiallyPaid', 'Overdue'].includes(i.status) && !!i.due_date && new Date(i.due_date).getTime() < now - 86_400_000,
    ).length;
    return {
      badges: {
        notifications: unread ? { text: unread > 99 ? '99+' : String(unread), tone: 'solidRed' } : null,
        trips: running ? { text: `${running} live`, tone: 'green', dot: true } : null,
        tripsLate: delayed ? { text: `${delayed} late`, tone: 'red' } : null,
        fleetMap: moving ? { text: `${moving} moving`, tone: 'green', dot: true } : null,
        documents: soon.length ? { text: String(soon.length), tone: expired ? 'red' : 'amber' } : null,
        invoices: overdue ? { text: `${overdue} overdue`, tone: 'neutral' } : null,
      },
      // Hide the strip until the live map has answered, rather than flashing zeros.
      fleet: live.data ? { onRoad: running, delayed, upcoming } : null,
    };
  }, [notifications.data, live.data, expiries.data, invoices.data, now]);
}

export function OperatorSidebarDrawer({ visible, onClose, side = 'right' }: OperatorSidebarDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(screenWidth * 0.82, 320);

  const hidden = side === 'left' ? -drawerWidth : drawerWidth;
  const [mounted, setMounted] = useState(visible);
  const slideAnim = useRef(new Animated.Value(hidden)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState('');
  const { badges, fleet } = useMenuBadges(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideAnim.setValue(hidden);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: hidden,
          duration: 210,
          easing: Easing.bezier(0.4, 0, 1, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible, hidden, mounted, slideAnim, backdropAnim]);

  const { role } = useAuth();
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = (i: MenuItem) => (!i.adminOnly || role === 'Admin') && (!q || `${i.label} ${i.keywords ?? ''}`.toLowerCase().includes(q));
    return GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length);
  }, [query, role]);

  const go = (route: string) => {
    onClose();
    setQuery('');
    if (route === pathname) return;
    // Let the drawer start closing before the next screen mounts.
    setTimeout(() => router.push(route as never), 150);
  };

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close menu">
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.drawer,
            side === 'left' ? styles.drawerLeft : styles.drawerRight,
            { width: drawerWidth, transform: [{ translateX: slideAnim }], paddingTop: insets.top + 12 },
          ]}
        >
          {/* Brand */}
          <View style={styles.header}>
            <View style={styles.brandTile}>
              {/* Same mark as the web dashboard's sidebar (merconclosed.png). */}
              <Image source={require('@mercon/mobile-shared/assets/images/merconclosed.png')} style={styles.mark} resizeMode="contain" accessibilityLabel="MERCON" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>MERCON</Text>
              <Text style={styles.brandSub}>Operations</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close menu" hitSlop={6}>
              <X size={17} color={ZINC.muted} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Fleet right now — tap through to the live map. */}
          {fleet ? (
            <TouchableOpacity style={styles.fleetStrip} onPress={() => go('/fleet-map')} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={`${fleet.onRoad} on the road, ${fleet.delayed} delayed, ${fleet.upcoming} starting soon. Open fleet map`}>
              <FleetStat value={fleet.onRoad} label="On the road" tone="green" />
              <FleetStat value={fleet.delayed} label="Delayed" tone={fleet.delayed ? 'red' : 'gray'} />
              <FleetStat value={fleet.upcoming} label="Starting soon" tone="violet" />
            </TouchableOpacity>
          ) : null}

          {/* Go to… */}
          <View style={styles.search}>
            <Search size={15} color={ZINC.muted} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Go to…"
              placeholderTextColor={ZINC.faint}
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => { const first = groups[0]?.items[0]; if (first) go(first.route); }}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear">
                <X size={14} color={ZINC.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Pages */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nav} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {groups.map((g) => (
              <View key={g.title ?? 'main'} style={{ marginBottom: 10 }}>
                {g.title ? (
                  <View style={styles.groupRow}>
                    <View style={[styles.dot, { backgroundColor: TONE[g.tone].dot }]} />
                    <Text style={styles.groupLabel}>{g.title}</Text>
                  </View>
                ) : null}
                {g.items.map((item) => {
                  const active = item.route === '/' ? pathname === '/' : pathname === item.route || pathname.startsWith(`${item.route}/`);
                  const rowBadges = (item.badges ?? []).map((k) => badges[k]).filter((b): b is Badge => !!b);
                  const tone = item.tone ?? g.tone;
                  const tile = tone === 'brand' ? { bg: Colors.primaryLight, fg: Colors.primary } : TONE[tone];
                  return (
                    <TouchableOpacity
                      key={item.route}
                      onPress={() => go(item.route)}
                      activeOpacity={0.6}
                      style={[styles.item, active && styles.itemActive]}
                      accessibilityRole="link"
                      accessibilityState={{ selected: active }}
                    >
                      {active ? <View style={styles.activeBar} /> : null}
                      <View style={[styles.tile, { backgroundColor: active ? Colors.primary : tile.bg }]}>
                        <item.Icon size={15} color={active ? '#FFFFFF' : tile.fg} strokeWidth={2.2} />
                      </View>
                      <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={1}>{item.label}</Text>
                      {rowBadges.map((b) => <MenuBadge key={b.text} badge={b} />)}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {groups.length === 0 ? <Text style={styles.empty}>No page matches “{query}”</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.newTrip} onPress={() => go('/create-trip')} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="New trip">
              <Plus size={17} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.newTripText}>New trip</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: Math.max(insets.bottom, 12) }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function FleetStat({ value, label, tone }: { value: number; label: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <View style={[styles.stat, { backgroundColor: t.bg }]}>
      <View style={styles.statTop}>
        <View style={[styles.dot, { backgroundColor: t.dot }]} />
        <Text style={[styles.statValue, { color: t.fg }]}>{value}</Text>
      </View>
      <Text style={[styles.statLabel, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const BADGE_TONE: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
  neutral: { bg: ZINC.accent, fg: '#52525B', border: ZINC.border },
  red: { bg: TONE.red.bg, fg: TONE.red.fg },
  amber: { bg: TONE.amber.bg, fg: TONE.amber.fg },
  green: { bg: TONE.green.bg, fg: TONE.green.fg },
  solidRed: { bg: TONE.red.dot, fg: '#FFFFFF' },
};

function MenuBadge({ badge }: { badge: Badge }) {
  const t = BADGE_TONE[badge.tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border ?? t.bg }, badge.tone === 'solidRed' && styles.badgePill]}>
      {badge.dot ? <View style={[styles.dot, { backgroundColor: TONE.green.dot }]} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]}>{badge.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 9, 11, 0.45)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  drawerLeft: {
    left: 0,
    borderRightWidth: 1,
    borderRightColor: ZINC.border,
  },
  drawerRight: {
    right: 0,
    borderLeftWidth: 1,
    borderLeftColor: ZINC.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  brandTile: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: ZINC.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  mark: { width: 30, height: 20 },
  brand: { fontSize: 14, fontWeight: '700', color: ZINC.fg, letterSpacing: 0.3 },
  brandSub: { fontSize: 12, color: ZINC.muted },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, marginHorizontal: 12, marginTop: 14, marginBottom: 8,
    borderWidth: 1, borderColor: ZINC.border, borderRadius: 8, paddingHorizontal: 10, backgroundColor: ZINC.soft,
  },
  searchInput: { flex: 1, fontSize: 14, color: ZINC.fg, paddingVertical: 0 },
  nav: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12 },
  fleetStrip: { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 14 },
  stat: { flex: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 28 },
  groupLabel: { fontSize: 11, fontWeight: '700', color: ZINC.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 8, borderRadius: 9, overflow: 'hidden' },
  itemActive: { backgroundColor: Colors.primaryLight },
  activeBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, backgroundColor: Colors.primary },
  tile: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontSize: 15, fontWeight: '500', color: ZINC.text },
  itemTextActive: { color: Colors.primary, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 22, height: 21, borderRadius: 6, paddingHorizontal: 6, justifyContent: 'center', borderWidth: 1 },
  badgePill: { borderRadius: 11 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  footer: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: ZINC.border },
  newTrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10, backgroundColor: Colors.primary },
  newTripText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  empty: { fontSize: 13, color: ZINC.muted, paddingHorizontal: 10, paddingVertical: 12 },
});
