/**
 * Operator Home ("today at a glance"), under the MERCON top bar:
 *   TodayCard       the charcoal header: date and "Good afternoon, <name>",
 *                   done / on the road / to start, a day strip with what's
 *                   next, and what needs you as tiles by kind
 *   EmergencyStrip  only while a driver emergency is open
 *   LiveNow         fleet map + the trips on the road, late ones first
 *   FreeTrucks      trucks that can take a job now, by class; Book opens
 *                   Create trip with the truck chosen
 *   FromDrivers     photo sets drivers sent that the customer hasn't had yet
 * Everything to act on in full lives on Notifications → To do.
 * Composes hooks + components only — no direct API calls here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { ChargeAssistant } from '@/features/charges/ChargeAssistant';
import { useDashboardRefresh } from '../hooks';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useActionInbox } from '../actions/useActionInbox';
import { useActionIntent } from '../actions/useActionIntent';
import { EmergencyStrip } from '../home/EmergencyStrip';
import { TodayCard } from '../home/TodayCard';
import { LiveNow } from '../home/LiveNow';
import { FreeTrucks } from '../home/FreeTrucks';
import { useTruckDetails } from '../hooks/useTruckDetails';
import { FromDrivers } from '../home/FromDrivers';
import { dateLabel, greeting, toStartToday } from '../home/today';
import { needTiles } from '../home/needsTiles';

const HEADER = '#3E3C3D';

export default function DashboardHomeScreen() {
  const router = useRouter();
  // Ticks each minute so "in 20 min" / "2h late" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { refreshing, refresh } = useDashboardRefresh();

  const inbox = useActionInbox();
  const { data: me } = useCurrentUser();
  const truckDetails = useTruckDetails();
  const { onIntent, openTrip, toast, setToast } = useActionIntent();

  const emergencies = useMemo(() => inbox.items.filter((i) => i.kind === 'emergency'), [inbox.items]);
  const needs = useMemo(() => needTiles(inbox.items), [inbox.items]);
  const toStartTrips = useMemo(() => toStartToday(inbox.scheduled, inbox.tz, now), [inbox.scheduled, inbox.tz, now]);

  const first = (me?.name || me?.username || '').trim().split(/\s+/)[0];
  const hello = `${greeting(inbox.tz, now)}${first ? `, ${first[0].toUpperCase()}${first.slice(1)}` : ''}`;
  const trips = (view: string) => router.push({ pathname: '/trips', params: { view } });

  // Light status bar text over the charcoal header while Home is in front; back to dark for the other pages.
  useFocusEffect(useCallback(() => {
    StatusBar.setBarStyle('light-content');
    return () => StatusBar.setBarStyle('dark-content');
  }, []));

  return (
    // Charcoal behind the status bar and top bar, continuing into the header.
    <SafeAreaView style={{ flex: 1, backgroundColor: HEADER }} edges={['top']}>
      <AppTopBar tone="dark" urgent={inbox.counts.now} actions={[{ icon: Search, label: 'Search trips', onPress: () => router.push('/trips') }]} />
      <ScrollView
        style={{ backgroundColor: '#F6F6F7' }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FFFFFF" />}
      >
        {/* Keeps the pull-to-refresh bounce charcoal instead of showing the light page above the header. */}
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: HEADER }} />

        <TodayCard
          hello={hello}
          date={dateLabel(inbox.tz, now)}
          units={inbox.units}
          toStartTrips={toStartTrips}
          tz={inbox.tz}
          now={now}
          done={inbox.finishedToday}
          running={inbox.counts.running}
          toStart={toStartTrips.length}
          needs={needs}
          loading={inbox.loading}
          onTrips={trips}
          onTodo={() => router.push({ pathname: '/notifications', params: { tab: 'todo' } })}
          onKind={(kind) => router.push({ pathname: '/needs-action', params: { kind } })}
        />

        <EmergencyStrip
          items={emergencies}
          now={now}
          onIntent={onIntent}
          onOpenTrip={(id) => openTrip(id)}
          onAll={() => router.push({ pathname: '/notifications', params: { tab: 'todo' } })}
        />

        {inbox.liveError ? <ErrorState message="Couldn't load live trips." onRetry={inbox.retry} /> : null}

        <LiveNow
          units={inbox.units}
          tz={inbox.tz}
          now={now}
          onOpenMap={() => router.push('/fleet-map')}
          onOpenTrip={(id) => openTrip(id)}
          onAll={() => trips('now')}
        />

        <FreeTrucks
          units={inbox.units}
          details={truckDetails.data ?? []}
          expiries={inbox.expiries}
          tz={inbox.tz}
          now={now}
          onOpenTruck={(id) => router.push({ pathname: '/vehicle-details', params: { id } })}
          onBook={(vehicleId) => router.push({ pathname: '/create-trip', params: { vehicleId } })}
          onAll={() => router.push('/vehicles')}
        />

        <FromDrivers updates={inbox.updates} now={now} onSend={(u) => openTrip(u.trip.id, { share: 'update', update: u.key })} />
      </ScrollView>
      {/* Finished trips waiting for an answer on extra charges */}
      <ChargeAssistant userName={me?.name || me?.username || undefined} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}
