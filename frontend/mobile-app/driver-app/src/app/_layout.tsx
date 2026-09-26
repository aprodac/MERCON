import '../global.css';

import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { DriverBottomNav } from '@/navigation/DriverBottomNav';

import { LanguageProvider } from '@mercon/mobile-shared/lib/language-context';
import { ThemeProvider } from '@mercon/mobile-shared/lib/theme-context';
import { DriverLiveTracking } from '@/components/DriverLiveTracking';
import { DriverNotificationManager } from '@/components/DriverNotificationManager';
import { AppToastHost } from '@/components/AppToast';
import { signInDriver, syncPushToken, unregisterPushToken } from '@/services/auth';

SplashScreen.preventAutoHideAsync().catch(() => {});

const TAB_ROUTES = [
  '/', '/trips', '/profile', '/notifications', '/documents', '/vehicle', '/settings', '/driver-charges',
];

function RootNavigator() {
  const router = useRouter();
  const { isLoggedIn, isLoading } = useAuth();
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
          source={require('@mercon/mobile-shared/assets/images/merconclosed-logo.webp')}
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
      </Stack>

      {isLoggedIn && <DriverLiveTracking />}
      {isLoggedIn && <DriverNotificationManager />}

      {showBottomNav && (
        <View style={styles.floatingNavOverlay} pointerEvents="box-none">
          <DriverBottomNav />
        </View>
      )}

      <AppToastHost />
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        signIn={signInDriver}
        allowedRoles={['Driver']}
        onSessionStart={syncPushToken}
        onSignOut={unregisterPushToken}
      >
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
