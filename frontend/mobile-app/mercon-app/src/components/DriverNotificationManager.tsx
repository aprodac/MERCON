import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { getSocket } from '@/lib/socket';
import { tripService, type MobileTrip } from '@/lib/trips';
import { notificationService, isNotificationsAvailable } from '@/lib/notifications';
import { DelayReportModal } from './DelayReportModal';
import { queryClient } from '@/lib/query-client';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Gracefully handled if native module is unavailable
}

/**
 * Global driver notification manager:
 * 1. Handles real-time Socket.io foreground prompts when AppState === 'active' for:
 *    - TripAssigned
 *    - TripStartingSoon
 *    - TripDelayPrompt (preserves existing DelayReportModal workflow)
 *    - TripCancelled
 *    - TripReassigned
 * 2. Unbinds notification listener in background/inactive to prevent duplicate alerts.
 *    Does NOT disconnect the shared socket singleton so live tracking is not disrupted.
 * 3. Handles background / cold-start push notification taps via expo-notifications
 *    (including getLastNotificationResponseAsync for cold starts), navigating to the existing
 *    trip details screen (/trip/details?tripId=...) with stale-trip guards.
 * 4. Resolves the active trip and safely triggers the existing DelayReportModal for delay prompts.
 */

// Cache handled notification response identifiers to prevent duplicate executions across remounts/cold starts
const handledResponseIds = new Set<string>();

export function DriverNotificationManager() {
  const router = useRouter();
  const { role, profile, isLoggedIn } = useAuth();
  const [delayModalVisible, setDelayModalVisible] = useState(false);
  const [activeTrip, setActiveTrip] = useState<MobileTrip | null>(null);
  const socketRef = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  /**
   * Safely opens the existing DelayReportModal for the active trip,
   * applying stale push protection (cancellation, reassignment, completion).
   */
  const handleOpenDelayWorkflow = async (expectedTripId?: string) => {
    try {
      const currentTrip = await tripService.getCurrent();

      if (!currentTrip || !currentTrip.id) {
        Alert.alert('Trip Unavailable', 'No active trip was found for your account.');
        return;
      }

      // Stale trip guards
      if (currentTrip.status === 'Cancelled') {
        Alert.alert('Trip Cancelled', 'This trip has been cancelled.');
        return;
      }

      if (currentTrip.status === 'Completed' || currentTrip.status === 'Invoiced') {
        Alert.alert('Trip Completed', 'This trip has already been completed.');
        return;
      }

      if (expectedTripId && currentTrip.id !== expectedTripId) {
        Alert.alert('Trip Reassigned', 'This trip is no longer active or assigned to you.');
        return;
      }

      setActiveTrip(currentTrip);
      setDelayModalVisible(true);
    } catch (err) {
      console.warn('[NotificationManager] Failed to resolve active trip:', err);
      Alert.alert('Error', 'Could not load the active trip details. Please check your connection.');
    }
  };

  /**
   * Navigate to trip details screen.
   */
  const navigateToTripDetails = (targetTripId: string) => {
    router.push({ pathname: '/trip/details', params: { tripId: targetTripId } } as any);
  };

  /**
   * Present an in-app prompt when a delay notification arrives while the driver is in the app.
   */
  const handleForegroundDelayPrompt = (payload: any) => {
    const tripId = payload?.entity_id || payload?.metadata?.tripId;
    const notificationId = payload?.id;

    Alert.alert(
      'Trip Delay Detected',
      payload?.message || 'Your trip is delayed. Please report the reason for the delay.',
      [
        {
          text: 'Dismiss',
          style: 'cancel',
          onPress: () => {
            if (notificationId) {
              notificationService.markRead(notificationId).catch(() => {});
            }
          },
        },
        {
          text: 'Report Delay',
          onPress: () => {
            if (notificationId) {
              notificationService.markRead(notificationId).catch(() => {});
            }
            handleOpenDelayWorkflow(tripId);
          },
        },
      ]
    );
  };

  // 1. Socket.io Foreground Lifecycle (active only when app is foregrounded)
  useEffect(() => {
    if (!isLoggedIn || role !== 'Driver' || !profile?.id) {
      return;
    }

    const driverId = profile.id;
    let activeSocket: any = null;

    const connectAndListen = async () => {
      try {
        const socket = await getSocket();
        activeSocket = socket;
        socketRef.current = socket;

        const eventName = `driver:notification:${driverId}`;
        socket.off(eventName); // avoid duplicate listeners
        socket.on(eventName, (payload: any) => {
          const notifId = payload?.id;
          const tripId = payload?.entity_id || payload?.metadata?.tripId;
          const eventType = (payload?.type || '').toString();

          if (eventType === 'TripDelayPrompt') {
            handleForegroundDelayPrompt(payload);
          } else if (eventType === 'TripAssigned') {
            queryClient.invalidateQueries();
            Alert.alert(
              payload?.title || 'Trip Assigned',
              payload?.message || 'You have been assigned a new trip.',
              [
                {
                  text: 'Dismiss',
                  style: 'cancel',
                  onPress: () => {
                    if (notifId) notificationService.markRead(notifId).catch(() => {});
                  },
                },
                {
                  text: 'View Trip',
                  onPress: () => {
                    if (notifId) notificationService.markRead(notifId).catch(() => {});
                    if (tripId) navigateToTripDetails(tripId);
                  },
                },
              ]
            );
          } else if (eventType === 'TripStartingSoon') {
            queryClient.invalidateQueries();
            Alert.alert(
              payload?.title || 'Trip Starting Soon',
              payload?.message || 'Your trip is starting soon. Open the app to prepare.',
              [
                {
                  text: 'Dismiss',
                  style: 'cancel',
                  onPress: () => {
                    if (notifId) notificationService.markRead(notifId).catch(() => {});
                  },
                },
                {
                  text: 'View Trip',
                  onPress: () => {
                    if (notifId) notificationService.markRead(notifId).catch(() => {});
                    if (tripId) navigateToTripDetails(tripId);
                  },
                },
              ]
            );
          } else if (eventType === 'TripCancelled') {
            queryClient.invalidateQueries();
            Alert.alert(
              payload?.title || 'Trip Cancelled',
              payload?.message || 'A trip has been cancelled.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (notifId) notificationService.markRead(notifId).catch(() => {});
                  },
                },
              ]
            );
          } else if (eventType === 'TripReassigned') {
            queryClient.invalidateQueries();
            Alert.alert(
              payload?.title || 'Trip Reassigned',
              payload?.message || 'A trip is no longer assigned to you.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (notifId) notificationService.markRead(notifId).catch(() => {});
                  },
                },
              ]
            );
          }
        });
      } catch (err) {
        console.warn('[NotificationManager] Socket connection error:', err);
      }
    };

    const cleanupSocket = () => {
      const socket = activeSocket || socketRef.current;
      if (socket) {
        const eventName = `driver:notification:${driverId}`;
        socket.off(eventName);
      }
    };

    if (AppState.currentState === 'active') {
      connectAndListen();
    }

    const appStateSub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        connectAndListen();
      } else if (nextAppState.match(/inactive|background/)) {
        cleanupSocket();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      cleanupSocket();
      appStateSub.remove();
    };
  }, [isLoggedIn, role, profile?.id]);

  // 2. Background / Cold-Start Push Notification Tap Handlers
  useEffect(() => {
    if (!isLoggedIn || role !== 'Driver') {
      return;
    }

    let isMounted = true;

    const processNotificationResponse = (response: any) => {
      const identifier = response?.notification?.request?.identifier;
      if (identifier) {
        if (handledResponseIds.has(identifier)) {
          return;
        }
        handledResponseIds.add(identifier);
      }

      const data = response?.notification?.request?.content?.data as any;
      const notifId = data?.notificationId;
      const tripId = data?.tripId || data?.entity_id;
      const eventType = (data?.type || data?.event || '').toString();

      if (notifId) {
        notificationService.markRead(notifId).catch(() => {});
      }

      if (eventType === 'TripDelayPrompt') {
        handleOpenDelayWorkflow(tripId);
      } else if (eventType === 'TripAssigned' || eventType === 'TripStartingSoon') {
        queryClient.invalidateQueries();
        if (tripId) {
          navigateToTripDetails(tripId);
        }
      } else if (eventType === 'TripCancelled') {
        queryClient.invalidateQueries();
        Alert.alert('Trip Cancelled', 'This trip has been cancelled.');
      } else if (eventType === 'TripReassigned') {
        queryClient.invalidateQueries();
        Alert.alert('Trip Reassigned', 'This trip is no longer assigned to you.');
      }
    };

    // A. Cold-start push response recovery:
    let responseSubscription: any = null;
    try {
      if (typeof Notifications?.getLastNotificationResponseAsync === 'function') {
        Notifications.getLastNotificationResponseAsync()
          .then((response) => {
            if (isMounted && response) {
              processNotificationResponse(response);
            }
          })
          .catch((err) => {
            console.warn('[NotificationManager] Error checking cold-start notification:', err);
          });
      }

      // B. Warm / background push notification response listener
      if (typeof Notifications?.addNotificationResponseReceivedListener === 'function') {
        responseSubscription = Notifications.addNotificationResponseReceivedListener(
          processNotificationResponse
        );
      }
    } catch (err) {
      console.warn('[NotificationManager] Notifications listeners unavailable in this environment:', err);
    }

    return () => {
      isMounted = false;
      if (responseSubscription && typeof responseSubscription.remove === 'function') {
        responseSubscription.remove();
      }
    };
  }, [isLoggedIn, role]);

  if (!isLoggedIn || role !== 'Driver') {
    return null;
  }

  return (
    <DelayReportModal
      visible={delayModalVisible}
      tripId={activeTrip?.id ?? null}
      onClose={() => {
        setDelayModalVisible(false);
      }}
      onSuccess={() => {
        setDelayModalVisible(false);
        queryClient.invalidateQueries();
      }}
    />
  );
}
