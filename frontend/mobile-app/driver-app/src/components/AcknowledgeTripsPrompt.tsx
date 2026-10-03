/**
 * "Got it" — a newly assigned trip stays on screen until the driver taps
 * "Got it", so the office knows the assignment was seen. Unacknowledged
 * trips alert operators after 30 minutes (driverWatch on the API).
 * There is deliberately no decline option.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { CheckCircle2, MapPin, Clock } from 'lucide-react-native';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { Colors, Radius, Spacing, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { showToast } from './AppToast';

interface PendingTrip {
  id: string;
  ref_id: string | null;
  planned_start: string | null;
  customer: string | null;
  from: string | null;
  to: string | null;
}

export const PENDING_ACKS_KEY = ['pending-acknowledgements'];

function formatStart(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function lastKnownPosition(): Promise<{ lat?: number; lng?: number }> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return {};
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {};
  } catch {
    return {};
  }
}

export function AcknowledgeTripsPrompt() {
  const router = useRouter();
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);

  // Refetched on focus/reconnect, every 2 minutes, and whenever the
  // notification manager invalidates queries on a TripAssigned event.
  const { data: pending = [] } = useQuery({
    queryKey: PENDING_ACKS_KEY,
    queryFn: async () => {
      const { data } = await api.get('/mobile/trips/pending-acknowledgements');
      return (data?.data ?? []) as PendingTrip[];
    },
    refetchInterval: 2 * 60_000,
    retry: false,
  });

  const trip = pending[0];
  if (!trip) return null;

  const acknowledge = async (thenOpen: boolean) => {
    setSaving(true);
    try {
      await api.post(`/mobile/trips/${trip.id}/acknowledge`, await lastKnownPosition());
      queryClient.setQueryData<PendingTrip[]>(PENDING_ACKS_KEY, (prev) => (prev ?? []).filter((p) => p.id !== trip.id));
      if (thenOpen) router.push({ pathname: '/trip/details', params: { tripId: trip.id } } as any);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <CheckCircle2 size={28} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{t('ack_title', 'New trip assigned')}</Text>
          <Text style={styles.subtitle}>{t('ack_subtitle', 'Tap "Got it" so the office knows you have seen it.')}</Text>

          <View style={styles.tripBox}>
            <Text style={styles.ref}>{trip.ref_id ?? '—'}{trip.customer ? ` · ${trip.customer}` : ''}</Text>
            {(trip.from || trip.to) && (
              <View style={styles.row}>
                <MapPin size={16} color={Colors.gray500} />
                <Text style={styles.rowText} numberOfLines={2}>
                  {trip.from ?? '—'}{trip.to ? `  →  ${trip.to}` : ''}
                </Text>
              </View>
            )}
            <View style={styles.row}>
              <Clock size={16} color={Colors.gray500} />
              <Text style={styles.rowText}>{t('ack_starts', 'Starts')}: {formatStart(trip.planned_start)}</Text>
            </View>
          </View>

          {pending.length > 1 && (
            <Text style={styles.more}>{t('ack_more', '+{count} more waiting').replace('{count}', String(pending.length - 1))}</Text>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={() => acknowledge(false)} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>{t('ack_got_it', 'Got it')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => acknowledge(true)} disabled={saving} activeOpacity={0.7}>
            <Text style={styles.secondaryText}>{t('ack_got_it', 'Got it')} · {t('ack_view_trip', 'View trip')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    ...Shadows.md,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: { ...Typography.headingL, color: Colors.gray900 },
  subtitle: { ...Typography.bodySmall, color: Colors.gray500, marginTop: Spacing.xs },
  tripBox: {
    marginTop: Spacing.base,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    gap: Spacing.sm,
  },
  ref: { ...Typography.headingS, color: Colors.gray900 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowText: { ...Typography.bodySmall, color: Colors.gray700, flex: 1 },
  more: { ...Typography.caption, color: Colors.gray500, marginTop: Spacing.sm, textAlign: 'center' },
  primaryBtn: {
    marginTop: Spacing.lg,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...Typography.buttonLarge, color: Colors.white },
  secondaryBtn: { marginTop: Spacing.sm, height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...Typography.buttonMedium, color: Colors.charcoal },
});
