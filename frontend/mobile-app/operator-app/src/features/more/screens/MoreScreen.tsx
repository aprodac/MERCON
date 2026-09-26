import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  Truck,
  FileText,
  CalendarClock,
  User,
  LogOut,
  ChevronRight,
  Wrench,
  Building2,
  Tag,
  CreditCard,
  FolderOpen,
  Menu,
  type LucideIcon,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { OperatorSidebarDrawer } from '../../../components/OperatorSidebarDrawer';

interface MenuItem {
  Icon: LucideIcon;
  label: string;
  desc: string;
  route: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Fleet',
    items: [
      { Icon: Truck, label: 'Vehicles', desc: 'Fleet trucks & trailers', route: '/vehicles' },
      // Hidden until these screens can do more than list (owner, 2026-09-26).
      // { Icon: Building2, label: '3rd Party Fleet', desc: 'Subcontractors & 3PL carriers', route: '/third-party' },
      // { Icon: Wrench, label: 'Maintenance', desc: 'Service & repair records', route: '/maintenance' },
      { Icon: CalendarClock, label: 'Vehicle Renewals', desc: 'Expiring vehicle documents', route: '/vehicle-renewals' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { Icon: Tag, label: 'Quotations', desc: 'Commercial rates & lanes', route: '/quotations' },
      // { Icon: FileText, label: 'Invoices', desc: 'View invoices and record payments', route: '/invoices' },
      // { Icon: CreditCard, label: 'Expenses', desc: 'Operational costs & receipts', route: '/expenses' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      // { Icon: FolderOpen, label: 'Documents', desc: 'Driver & fleet document center', route: '/documents' },
    ],
  },
  {
    title: 'Partners',
    items: [
      { Icon: Users, label: 'Customers', desc: 'View, add and edit customers', route: '/customers' },
    ],
  },
];

const MoreScreen = () => {
  const router = useRouter();
  const { profile, role, signOut } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      
      {/* Header with Top-Right Hamburger Button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open sidebar menu"
          style={styles.hamburgerBtn}
        >
          <Menu size={22} color={Colors.gray800} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarBox}>
            <User size={22} color={Colors.white} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.name ?? 'Operator'}</Text>
            <Text style={styles.profileRole}>{role ?? 'Operator'}</Text>
          </View>
        </View>

        {/* Grouped Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} style={styles.sectionBlock}>
            <Text style={styles.groupLabel}>{section.title}</Text>
            <View style={styles.groupCard}>
              {section.items.map((row, i) => (
                <TouchableOpacity
                  key={row.label}
                  style={[styles.row, i < section.items.length - 1 ? styles.rowBorder : null]}
                  activeOpacity={0.8}
                  onPress={() => router.push(row.route as any)}
                >
                  <View style={styles.rowIconBox}>
                    <row.Icon size={18} color={Colors.gray600} strokeWidth={2} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowDesc}>{row.desc}</Text>
                  </View>
                  <ChevronRight size={18} color={Colors.gray400} strokeWidth={2} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                  await signOut();
                  router.replace('/login');
                },
              },
            ])
          }
        >
          <LogOut size={20} color={Colors.error} strokeWidth={2.2} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sidebar Drawer */}
      <OperatorSidebarDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: '800',
    color: Colors.gray900,
  },
  hamburgerBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 110,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
  },
  profileRole: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  sectionBlock: {
    marginBottom: Spacing.md,
  },
  groupLabel: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  groupCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  rowIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray900,
  },
  rowDesc: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.error,
    marginTop: Spacing.md,
  },
  logoutText: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.error,
  },
});

export default MoreScreen;
