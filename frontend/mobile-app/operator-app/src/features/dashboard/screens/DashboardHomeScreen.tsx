/**
 * Operator Home screen. Composes the dashboard feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';


import { useDashboardRefresh } from '../hooks';
import { AppTopBar } from '@/components/AppTopBar';
import { FleetMapCard } from '@/features/fleet/FleetMapCard';
import { Search } from 'lucide-react-native';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { useActionInbox } from '../actions/useActionInbox';
import { HomeStatus, NeedsActionList, UpNext } from '../actions/NeedsAction';
import { useActionIntent } from '../actions/useActionIntent';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { ChargeAssistant } from '@/features/charges/ChargeAssistant';

export default function DashboardHomeScreen() {
  const router = useRouter();
  // Ticks each minute so "12m late" / "in 2h" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { refreshing, refresh } = useDashboardRefresh();

  const inbox = useActionInbox();
  const { data: me } = useCurrentUser();
  const { onIntent, openTrip, toast, setToast } = useActionIntent();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <AppTopBar actions={[{ icon: Search, label: 'Search trips', onPress: () => router.push('/trips') }]} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        <HomeStatus
          needNow={inbox.counts.now}
          running={inbox.counts.running}
          delayed={inbox.counts.delayed}
          today={inbox.today.length}
          day={inbox.day}
          loading={inbox.loading}
          updatedAt={inbox.updatedAt}
          now={now}
          onRunning={() => router.push({ pathname: '/trips', params: { view: 'now' } })}
          onDelayed={() => router.push({ pathname: '/trips', params: { view: 'delayed' } })}
          onToday={() => router.push({ pathname: '/trips', params: { view: 'schedule' } })}
        />

        {inbox.liveError ? (
          <ErrorState message="Couldn't load live trips." onRetry={inbox.retry} />
        ) : null}

        <NeedsActionList
          items={inbox.items}
          loading={inbox.loading}
          onIntent={onIntent}
          onOpenTrip={(id) => openTrip(id)}
          now={now}
        />

        <FleetMapCard units={inbox.units} onOpen={() => router.push('/fleet-map')} />

        <UpNext rows={inbox.today} tz={inbox.tz} onOpenTrip={(id) => openTrip(id)} onAll={() => router.push('/trips')} />
      </ScrollView>
      {/* Finished trips waiting for an answer on extra charges */}
      <ChargeAssistant userName={me?.name || me?.username || undefined} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}
