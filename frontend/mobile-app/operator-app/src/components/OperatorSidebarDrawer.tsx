/**
 * The operator side menu (from the ☰ button). A flat, shadcn-style list:
 * brand header, "Go to…" filter, the main pages, then Fleet / Finance /
 * Records groups, each row one line with a count badge where something needs
 * attention. Account, version and Log out live on the Profile tab, not here.
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
  Bell, Building2, CreditCard, FileText, FolderOpen, House, Route, Search, SquareUserRound, Tag, Truck, UserCog, Users, Wrench, X,
  type LucideIcon,
} from 'lucide-react-native';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { operatorService } from '@/lib/operator';

const ZINC = {
  fg: '#3E3C3D',
  text: '#3E3C3D',
  muted: '#71717A',
  faint: '#A1A1AA',
  border: '#E4E4E7',
  accent: '#F4F4F5',
  soft: '#FAFAFA',
};

type BadgeTone = 'neutral' | 'red' | 'amber';
type BadgeKey = 'trips' | 'notifications' | 'invoices' | 'documents';

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
      { Icon: MapIcon, label: 'Fleet map', route: '/fleet-map', keywords: 'live map trucks location gps tracking' },
      { Icon: Truck, label: 'Vehicles', route: '/vehicles', keywords: 'trucks trailers' },
      { Icon: Building2, label: '3rd party fleet', route: '/third-party', keywords: 'subcontractors providers 3pl' },
      // Hidden until these screens can do more than list (owner, 2026-09-26).
      // { Icon: Wrench, label: 'Maintenance', route: '/maintenance', keywords: 'service repair' },
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
    const expired = soon.filter((e) => e.days < 0).length;
    const overdue = (invoices.data ?? []).filter(
      (i) => ['Issued', 'PartiallyPaid', 'Overdue'].includes(i.status) && !!i.due_date && new Date(i.due_date).getTime() < now - 86_400_000,
    ).length;
    return {
      notifications: unread ? { text: String(unread), tone: 'red' as const } : null,
      trips: running ? { text: `${running} live`, tone: 'neutral' as const } : null,
      documents: soon.length ? { text: String(soon.length), tone: expired ? ('red' as const) : ('amber' as const) } : null,
      invoices: overdue ? { text: `${overdue} overdue`, tone: 'neutral' as const } : null,
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
  const badges = useMenuBadges(visible);

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

          <View style={{ height: Math.max(insets.bottom, 12) }} />
        </Animated.View>
      </View>
    </Modal>
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
});
