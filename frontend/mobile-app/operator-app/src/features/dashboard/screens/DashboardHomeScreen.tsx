/**
 * Operator Home — kept to what you glance at:
 *   1. HomeHeader     greeting, date, "12 on the road · 2 delayed"
 *   2. EmergencyStrip only while a driver emergency is open
 *   3. FleetMapCard   where the trucks are
 *   4. UpNext         the next trips starting today
 * Everything to act on (delays, unassigned trips, photos, documents,
 * invoices) lives on Notifications → To do; the bell's dot says when.
 * Composes hooks + components only — no direct API calls here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { FleetMapCard } from '@/features/fleet/FleetMapCard';
import { ChargeAssistant } from '@/features/charges/ChargeAssistant';
import { useDashboardRefresh } from '../hooks';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useActionInbox } from '../actions/useActionInbox';
import { useActionIntent } from '../actions/useActionIntent';
import { HomeHeader } from '../home/HomeHeader';
import { EmergencyStrip } from '../home/EmergencyStrip';
import { UpNext } from '../home/UpNext';

export default function DashboardHomeScreen() {
  const router = useRouter();
  // Ticks each minute so "in 20 min" / "5m ago" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { refreshing, refresh } = useDashboardRefresh();

  const inbox = useActionInbox();
  const { data: me } = useCurrentUser();
  const { onIntent, openTrip, toast, setToast } = useActionIntent();
  const emergencies = useMemo(() => inbox.items.filter((i) => i.kind === 'emergency'), [inbox.items]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <AppTopBar urgent={inbox.counts.now} actions={[{ icon: Search, label: 'Search trips', onPress: () => router.push('/trips') }]} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        <HomeHeader
          name={me?.name || me?.username || null}
          tz={inbox.tz}
          now={now}
          running={inbox.counts.running}
          delayed={inbox.counts.delayed}
          loading={inbox.loading}
          onRunning={() => router.push({ pathname: '/trips', params: { view: 'now' } })}
          onDelayed={() => router.push({ pathname: '/trips', params: { view: 'delayed' } })}
        />

        <EmergencyStrip
          items={emergencies}
          now={now}
          onIntent={onIntent}
          onOpenTrip={(id) => openTrip(id)}
          onAll={() => router.push('/notifications')}
        />

        {inbox.liveError ? <ErrorState message="Couldn't load live trips." onRetry={inbox.retry} /> : null}

        <FleetMapCard units={inbox.units} now={now} onOpen={() => router.push('/fleet-map')} />

        <UpNext
          trips={inbox.scheduled}
          tz={inbox.tz}
          now={now}
          onOpenTrip={(id) => openTrip(id)}
          onAll={() => router.push({ pathname: '/trips', params: { view: 'schedule' } })}
        />
      </ScrollView>
      {/* Finished trips waiting for an answer on extra charges */}
      <ChargeAssistant userName={me?.name || me?.username || undefined} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}
