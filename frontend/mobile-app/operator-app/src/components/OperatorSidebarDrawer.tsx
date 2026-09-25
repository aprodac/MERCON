import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ScrollView,
  Alert,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  Truck,
  FileText,
  Users,
  CalendarClock,
  Wrench,
  Building2,
  Tag,
  CreditCard,
  FolderOpen,
  User,
  LogOut,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

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

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Fleet',
    items: [
      { Icon: Truck, label: 'Vehicles', desc: 'Fleet trucks & trailers', route: '/vehicles' },
      { Icon: Building2, label: '3rd Party Fleet', desc: 'Subcontractors & providers', route: '/third-party' },
      { Icon: Wrench, label: 'Maintenance', desc: 'Service & repair records', route: '/maintenance' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { Icon: Tag, label: 'Quotations', desc: 'Commercial rates & lanes', route: '/quotations' },
      { Icon: FileText, label: 'Invoices', desc: 'Billing & payment tracking', route: '/invoices' },
      { Icon: CreditCard, label: 'Expenses', desc: 'Operational costs & receipts', route: '/expenses' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { Icon: FolderOpen, label: 'Documents', desc: 'Driver & fleet document center', route: '/documents' },
    ],
  },
  {
    title: 'Partners',
    items: [
      { Icon: Users, label: 'Customers', desc: 'Client directory & contacts', route: '/customers' },
    ],
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

interface OperatorSidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function OperatorSidebarDrawer({ visible, onClose }: OperatorSidebarDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, role, signOut } = useAuth();
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleNavigate = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 150);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
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

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <View style={styles.overlay}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* Drawer content sliding from right */}
        <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.drawerHeader}>
            <View className="flex-row items-center gap-2">
              <View style={styles.logoBadge}>
                <Text style={styles.logoText}>M</Text>
              </View>
              <View>
                <Text style={styles.brandTitle}>MERCON</Text>
                <Text style={styles.brandSub}>Operator System</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
              <X size={20} color={Colors.gray600} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* User Profile Card */}
          <View style={styles.profileSection}>
            <View style={styles.avatarBox}>
              <User size={20} color={Colors.white} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.profileName}>{profile?.name ?? 'Operator'}</Text>
              <Text numberOfLines={1} style={styles.profileRole}>{role ?? 'Operator'}</Text>
            </View>
          </View>

          {/* Scrollable Navigation Sections */}
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {MENU_SECTIONS.map((section) => (
              <View key={section.title} style={styles.sectionBlock}>
                <Text style={styles.sectionHeader}>{section.title}</Text>
                <View style={styles.sectionCard}>
                  {section.items.map((item, idx) => {
                    const isActive = pathname === item.route;
                    return (
                      <TouchableOpacity
                        key={item.label}
                        activeOpacity={0.75}
                        onPress={() => handleNavigate(item.route)}
                        style={[
                          styles.menuRow,
                          idx < section.items.length - 1 ? styles.rowBorder : null,
                          isActive ? styles.activeRow : null,
                        ]}
                      >
                        <View style={[styles.iconBox, isActive ? styles.activeIconBox : null]}>
                          <item.Icon
                            size={18}
                            color={isActive ? Colors.primary : Colors.gray600}
                            strokeWidth={2}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.menuLabel, isActive ? styles.activeMenuLabel : null]}>
                            {item.label}
                          </Text>
                          <Text numberOfLines={1} style={styles.menuDesc}>
                            {item.desc}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Logout */}
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.8} style={styles.logoutBtn}>
              <LogOut size={18} color={Colors.error} strokeWidth={2.2} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawerContainer: {
    width: DRAWER_WIDTH,
    backgroundColor: '#F8FAFC',
    height: '100%',
    ...Shadows.md,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 54,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: Colors.white,
    fontWeight: '900',
    fontSize: 16,
  },
  brandTitle: {
    fontSize: Typography.base,
    fontWeight: '800',
    color: Colors.gray900,
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    fontWeight: '500',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  avatarBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  profileRole: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  sectionBlock: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: Colors.gray500,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray100,
    ...Shadows.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.md,
  },
  activeRow: {
    backgroundColor: '#FFF0EB',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconBox: {
    backgroundColor: '#FDE3DF',
  },
  menuLabel: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray900,
  },
  activeMenuLabel: {
    color: Colors.primary,
    fontWeight: '800',
  },
  menuDesc: {
    fontSize: 11,
    color: Colors.gray500,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.error,
    marginTop: Spacing.sm,
  },
  logoutText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.error,
  },
});
