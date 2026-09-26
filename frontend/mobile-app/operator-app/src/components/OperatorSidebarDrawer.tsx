/**
 * The operator side menu (from the ☰ button). A flat, shadcn-style list:
 * brand header, "Go to…" filter, the main pages, then Fleet / Finance /
 * Records groups, each row one line with a count badge where something needs
 * attention, and the account with Sign out at the bottom.
 *
 * Badges read the same React Query caches the home uses, so opening the menu
 * doesn't fire a burst of requests.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Animated, ScrollView, Alert, TouchableWithoutFeedback, Dimensions, Image, TextInput,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import {
  Bell, Building2, CalendarClock, CreditCard, FileText, FolderOpen, House, LogOut, Route, Search, SquareUserRound, Tag, Truck, UserCog, Users, Wrench, X,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { operatorService } from '@/lib/operator';

const ZINC = {
  fg: '#18181B',
  text: '#27272A',
  muted: '#71717A',
  faint: '#A1A1AA',
  border: '#E4E4E7',
  accent: '#F4F4F5',
  soft: '#FAFAFA',
};

type BadgeTone = 'neutral' | 'red' | 'amber';
type BadgeKey = 'trips' | 'notifications' | 'renewals' | 'invoices' | 'documents';

interface MenuItem {
  Icon: LucideIcon;
  label: string;
  route: string;
  /** Extra words the "Go to…" filter matches. */
  keywords?: string;
  badge?: BadgeKey;
}

interface MenuGroup {
  title: string | null;
  items: MenuItem[];
}

const GROUPS: MenuGroup[] = [
  {
    title: null,
    items: [
      { Icon: House, label: 'Home', route: '/', keywords: 'dashboard needs action' },
      { Icon: Route, label: 'Trips', route: '/trips', badge: 'trips', keywords: 'schedule history' },
      { Icon: Users, label: 'Drivers', route: '/drivers' },
      { Icon: Bell, label: 'Notifications', route: '/notifications', badge: 'notifications', keywords: 'alerts' },
    ],
  },
  {
    title: 'Fleet',
    items: [
      { Icon: Truck, label: 'Vehicles', route: '/vehicles', keywords: 'trucks trailers' },
      // Hidden until these screens can do more than list (owner, 2026-09-26).
      // { Icon: Building2, label: '3rd party fleet', route: '/third-party', keywords: 'subcontractors providers 3pl' },
      // { Icon: Wrench, label: 'Maintenance', route: '/maintenance', keywords: 'service repair' },
      { Icon: CalendarClock, label: 'Renewals', route: '/vehicle-renewals', badge: 'renewals', keywords: 'expiring istimara insurance' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { Icon: Tag, label: 'Quotations', route: '/quotations', keywords: 'rates lanes' },
      // { Icon: FileText, label: 'Invoices', route: '/invoices', badge: 'invoices', keywords: 'billing payments' },
      // { Icon: CreditCard, label: 'Expenses', route: '/expenses', keywords: 'costs receipts' },
    ],
  },
  {
    title: 'Records',
    items: [
      // { Icon: FolderOpen, label: 'Documents', route: '/documents', badge: 'documents', keywords: 'compliance files' },
      { Icon: SquareUserRound, label: 'Customers', route: '/customers', keywords: 'clients contacts' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { Icon: UserCog, label: 'User management', route: '/user-management', keywords: 'users accounts drivers passwords logins admin operator' },
    ],
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

interface OperatorSidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Which edge it slides in from — match the side of the button that opens it. */
  side?: 'left' | 'right';
}

/** Counts for the badges, from data the home screen already loads (same query keys). */
function useMenuBadges(enabled: boolean): Record<BadgeKey, { text: string; tone: BadgeTone } | null> {
  const notifications = useNotifications();
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), enabled, staleTime: 60_000 });
  const expiries = useQuery({ queryKey: ['dashboard', 'actions', 'expiries'], queryFn: () => operatorService.documentExpiries().catch(() => []), enabled, staleTime: 5 * 60_000 });
  const invoices = useQuery({ queryKey: ['dashboard', 'actions', 'invoices'], queryFn: () => operatorService.invoices().catch(() => []), enabled, staleTime: 5 * 60_000 });
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    const unread = (notifications.data ?? []).filter((n) => !n.is_read).length;
    const running = (live.data ?? []).filter((u) => u.trip && u.trip.phase !== 'upcoming').length;
    const soon = (expiries.data ?? []).filter((e) => e.days <= 7);
    const vehicleSoon = soon.filter((e) => e.entity_type === 'Vehicle').length;
    const expired = soon.filter((e) => e.days < 0).length;
    const overdue = (invoices.data ?? []).filter(
      (i) => ['Issued', 'PartiallyPaid', 'Overdue'].includes(i.status) && !!i.due_date && new Date(i.due_date).getTime() < now - 86_400_000,
    ).length;
    return {
      notifications: unread ? { text: String(unread), tone: 'red' as const } : null,
      trips: running ? { text: `${running} live`, tone: 'neutral' as const } : null,
      renewals: vehicleSoon ? { text: String(vehicleSoon), tone: 'amber' as const } : null,
      documents: soon.length ? { text: String(soon.length), tone: expired ? ('red' as const) : ('amber' as const) } : null,
      invoices: overdue ? { text: `${overdue} overdue`, tone: 'neutral' as const } : null,
    };
  }, [notifications.data, live.data, expiries.data, invoices.data, now]);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'OP';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '')).toUpperCase();
}

export function OperatorSidebarDrawer({ visible, onClose, side = 'right' }: OperatorSidebarDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { profile, role, signOut } = useAuth();
  const hidden = side === 'left' ? -DRAWER_WIDTH : DRAWER_WIDTH;
  const [slideAnim] = useState(() => new Animated.Value(hidden));
  const [query, setQuery] = useState('');
  const badges = useMenuBadges(visible);

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : hidden, duration: visible ? 240 : 180, useNativeDriver: true }).start();
  }, [visible, slideAnim, hidden]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.keywords ?? ''}`.toLowerCase().includes(q)) })).filter((g) => g.items.length);
  }, [query]);

  const go = (route: string) => {
    onClose();
    setQuery('');
    if (route === pathname) return;
    // Let the drawer start closing before the next screen mounts.
    setTimeout(() => router.push(route as never), 150);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          onClose();
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  if (!visible) return null;

  const name = profile?.name ?? 'Operator';
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <View style={[styles.overlay, side === 'left' && { flexDirection: 'row-reverse' }]}>
        <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close menu">
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.drawer,
            side === 'left' ? styles.drawerLeft : styles.drawerRight,
            { transform: [{ translateX: slideAnim }], paddingTop: insets.top + 12 },
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
                {g.title ? <Text style={styles.groupLabel}>{g.title}</Text> : null}
                {g.items.map((item) => {
                  const active = item.route === '/' ? pathname === '/' : pathname === item.route || pathname.startsWith(`${item.route}/`);
                  const badge = item.badge ? badges[item.badge] : null;
                  return (
                    <TouchableOpacity
                      key={item.route}
                      onPress={() => go(item.route)}
                      activeOpacity={0.6}
                      style={[styles.item, active && styles.itemActive]}
                      accessibilityRole="link"
                      accessibilityState={{ selected: active }}
                    >
                      <item.Icon size={17} color={active ? ZINC.fg : ZINC.muted} strokeWidth={2} />
                      <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={1}>{item.label}</Text>
                      {badge ? (
                        <View style={[styles.badge, badge.tone === 'red' && styles.badgeRed, badge.tone === 'amber' && styles.badgeAmber]}>
                          <Text style={[styles.badgeText, badge.tone === 'red' && { color: '#B42318' }, badge.tone === 'amber' && { color: '#93370D' }]}>{badge.text}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {groups.length === 0 ? <Text style={styles.empty}>No page matches “{query}”</Text> : null}
          </ScrollView>

          {/* Account */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <View style={styles.account}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initialsOf(name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.role} numberOfLines={1}>{role ?? 'Operator'}</Text>
              </View>
              <TouchableOpacity style={styles.signOut} onPress={handleSignOut} activeOpacity={0.7}>
                <LogOut size={14} color="#B42318" strokeWidth={2} />
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </View>
            {version ? <Text style={styles.version}>Version {version}</Text> : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(9,9,11,0.4)' },
  drawer: {
    width: DRAWER_WIDTH, height: '100%', backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 30, shadowOffset: { width: 8, height: 0 }, elevation: 16,
  },
  drawerLeft: { borderRightWidth: 1, borderRightColor: ZINC.border },
  drawerRight: { borderLeftWidth: 1, borderLeftColor: ZINC.border },
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
  groupLabel: { fontSize: 12, fontWeight: '500', color: ZINC.muted, paddingHorizontal: 10, height: 28, lineHeight: 28 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, height: 42, paddingHorizontal: 10, borderRadius: 8 },
  itemActive: { backgroundColor: ZINC.accent },
  itemText: { flex: 1, fontSize: 15, fontWeight: '500', color: ZINC.text },
  itemTextActive: { color: ZINC.fg, fontWeight: '600' },
  badge: { minWidth: 22, height: 21, borderRadius: 6, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: ZINC.accent, borderWidth: 1, borderColor: ZINC.border },
  badgeRed: { backgroundColor: '#FEF3F2', borderColor: '#FECDCA' },
  badgeAmber: { backgroundColor: '#FFFAEB', borderColor: '#FEDF89' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#52525B' },
  empty: { fontSize: 13, color: ZINC.muted, paddingHorizontal: 10, paddingVertical: 12 },
  footer: { borderTopWidth: 1, borderTopColor: ZINC.border, paddingHorizontal: 12, paddingTop: 10, gap: 4 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 6 },
  avatar: { width: 34, height: 34, borderRadius: 8, backgroundColor: ZINC.fg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  name: { fontSize: 14, fontWeight: '600', color: ZINC.fg },
  role: { fontSize: 12, color: ZINC.muted },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: ZINC.border, backgroundColor: '#FFFFFF' },
  signOutText: { fontSize: 13, fontWeight: '500', color: '#B42318' },
  version: { fontSize: 11, color: ZINC.faint, paddingHorizontal: 6 },
});
