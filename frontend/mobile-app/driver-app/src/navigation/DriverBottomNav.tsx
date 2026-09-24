/**
 * Driver App Bottom Navigation
 * Clean White Floating Pill Container with vertical icon + bilingual label + active underline bar.
 * Matches exact user design reference screenshot.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { House, Truck, User, type LucideIcon } from 'lucide-react-native';
import { Spacing } from '@mercon/mobile-shared/theme/tokens';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

export type DriverTab = 'Home' | 'Trips' | 'Profile';

interface DriverBottomNavProps {
  activeTab?: DriverTab | string;
  onTabPress?: (tab: DriverTab) => void;
}

const TABS: { label: DriverTab; labelKey: string; Icon: LucideIcon; route: string; fallbackBilingual: string }[] = [
  { label: 'Home', labelKey: 'nav_home', Icon: House, route: '/', fallbackBilingual: 'Home / ہوم' },
  { label: 'Trips', labelKey: 'nav_trips', Icon: Truck, route: '/trips', fallbackBilingual: 'Trips / ٹرپس' },
  { label: 'Profile', labelKey: 'nav_profile', Icon: User, route: '/profile', fallbackBilingual: 'Profile / پروفائل' },
];

const CORAL = '#FA634E';
const CHARCOAL = '#3E3C3D';

export function DriverBottomNav(_props: DriverBottomNavProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <View style={styles.wrapper}>
      <View style={styles.pill}>
        {TABS.map(({ label, labelKey, Icon, route, fallbackBilingual }) => {
          const active = route === '/' ? pathname === '/' : pathname.startsWith(route);
          const activeColor = active ? CORAL : CHARCOAL;
          const displayLabel = t(labelKey, fallbackBilingual);

          return (
            <TouchableOpacity
              key={label}
              onPress={() => { if (!active) router.navigate(route as any); }}
              activeOpacity={0.7}
              style={styles.tab}
            >
              <Icon size={22} color={activeColor} strokeWidth={active ? 2.4 : 2} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeColor, fontWeight: active ? '700' : '600' },
                ]}
                numberOfLines={1}
              >
                {displayLabel}
              </Text>
              {active && <View style={styles.activeLine} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 11.5,
    marginTop: 3,
    textAlign: 'center',
  },
  activeLine: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: CORAL,
    marginTop: 4,
  },
});
