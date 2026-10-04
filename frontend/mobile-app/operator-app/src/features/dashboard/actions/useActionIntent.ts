/**
 * What an action item's buttons do (call, WhatsApp, open a trip / driver /
 * truck / customer, mark an emergency handled). Shared by Home and the
 * Notifications "To do" tab so both behave the same.
 */
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useMarkNotificationsRead } from '@/features/notifications/hooks/useNotifications';
import type { ActionIntent } from './actionModel';

export type ActionToast = { message: string; type: 'success' | 'error' } | null;

export function useActionIntent() {
  const router = useRouter();
  const { markRead } = useMarkNotificationsRead();
  // Only for actions that finish right here — never for ones that just open
  // another screen or app, which hasn't done anything yet.
  const [toast, setToast] = useState<ActionToast>(null);

  const openTrip = useCallback(
    (id: string, extra: Record<string, string> = {}) => router.push({ pathname: '/trip-details', params: { id, ...extra } }),
    [router],
  );

  const onIntent = useCallback(
    (intent: ActionIntent) => {
      switch (intent.type) {
        case 'call':
          Linking.openURL(`tel:${intent.phone}`).catch(() => setToast({ message: "Couldn't start the call", type: 'error' }));
          return;
        case 'whatsapp':
          Linking.openURL(`https://wa.me/${(intent.phone ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(intent.text)}`)
            .catch(() => setToast({ message: "Couldn't open WhatsApp", type: 'error' }));
          return;
        case 'trip': {
          const extra: Record<string, string> = {};
          if (intent.tab) extra.tab = intent.tab;
          if (intent.share) extra.share = intent.share;
          if (intent.assign) extra.assign = intent.assign;
          if (intent.times) extra.times = '1';
          openTrip(intent.tripId, extra);
          return;
        }
        case 'handled':
          markRead(intent.notificationId);
          setToast({ message: 'Marked as handled', type: 'success' });
          return;
        case 'driver':
          router.push({ pathname: '/driver-details', params: { id: intent.id } });
          return;
        case 'vehicle':
          router.push({ pathname: '/vehicle-details', params: { id: intent.id } });
          return;
        case 'customer':
          router.push({ pathname: '/customer-details', params: { id: intent.id } });
          return;
        case 'invoices':
          router.push('/invoices');
      }
    },
    [router, markRead, openTrip],
  );

  return { onIntent, openTrip, toast, setToast };
}
