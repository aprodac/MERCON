import '../global.css';

import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { queryClient } from '@/lib/query-client';
import { DriverBottomNav } from '@/navigation/DriverBottomNav';
import { OperatorBottomNav } from '@/navigation/OperatorBottomNav';

import { LanguageProvider } from '@/lib/language-context';
import { ThemeProvider } from '@/lib/theme-context';
import { DriverLiveTracking } from '@/lib/DriverLiveTracking';
import { DriverNotificationManager } from '@/components/DriverNotificationManager';

SplashScreen.preventAutoHideAsync().catch(() => {});

const TAB_ROUTES = [
  '/', '/trips', '/profile', '/notifications', '/documents', '/vehicle', '/settings', '/driver-charges',
  '/operator/trips', '/operator/drivers', '/operator/vehicles', '/operator/invoices',
  '/operator/more', '/operator/customers', '/operator/vehicle-renewals',
  '/operator/quotations', '/operator/third-party', '/operator/maintenance',
  '/operator/expenses', '/operator/documents',
];

function RootNavigator() {
  const router = useRouter();
  const { isLoggedIn, isLoading, role } = useAuth();
  const pathname = usePathname();

  // Keep the native splash visible until the session is restored,
  // so the user never sees a flash of the wrong screen.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  // Auth guard: redirect unauthenticated sessions away from protected screens
  useEffect(() => {
    if (!isLoading && !isLoggedIn && pathname !== '/login') {
      router.replace('/login');
    }
  }, [isLoading, isLoggedIn, pathname, router]);

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <Image
          source={require('../../assets/images/merconclosed-logo.webp')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
      </View>
    );
  }

  const showBottomNav = isLoggedIn && TAB_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F3F4F6' } }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="login" />
        <Stack.Screen name="trips" options={{ animation: 'none' }} />
        <Stack.Screen name="profile" options={{ animation: 'none' }} />
        <Stack.Screen name="notifications" options={{ animation: 'none' }} />
        <Stack.Screen name="documents" options={{ animation: 'none' }} />
        <Stack.Screen name="vehicle" options={{ animation: 'none' }} />
        <Stack.Screen name="settings" options={{ animation: 'none' }} />
        <Stack.Screen name="driver-charges" />
        {/* Trip flow */}
        <Stack.Screen name="trip/details" />
        <Stack.Screen name="trip/pickup" />
        <Stack.Screen name="trip/navigate" />
        <Stack.Screen name="trip/stop" />
        <Stack.Screen name="trip/delivery" />
        <Stack.Screen name="trip/completed" />
        <Stack.Screen name="cargo-pod-photos" />
        {/* Operator screens */}
        <Stack.Screen name="operator/trips" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/drivers" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/vehicles" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/invoices" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/more" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/customers" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/trip-details" />
        <Stack.Screen name="operator/create-trip" />
        <Stack.Screen name="operator/vehicle-renewals" />
        <Stack.Screen name="operator/quotations" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/third-party" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/maintenance" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/expenses" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/documents" options={{ animation: 'none' }} />
        <Stack.Screen name="operator/driver-edit" />
        <Stack.Screen name="operator/vehicle-edit" />
        <Stack.Screen name="operator/customer-edit" />
      </Stack>

      {isLoggedIn && role === 'Driver' && <DriverLiveTracking />}
      {isLoggedIn && role === 'Driver' && <DriverNotificationManager />}

      {showBottomNav && (
        <View style={styles.floatingNavOverlay} pointerEvents="box-none">
          {role === 'Operator' || role === 'Admin' ? <OperatorBottomNav /> : <DriverBottomNav />}
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 160,
    height: 160,
  },
  floatingNavOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
});
