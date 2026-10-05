/**
 * Operator Home ("today at a glance"), under the MERCON top bar:
 *   greeting        today's date over "Good afternoon, <name>"
 *   EmergencyStrip  only while a driver emergency is open
 *   TodayCard       ring of done / on the road / to start, and what needs
 *                   you as tiles by kind, most important first
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
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useRouter } from 'expo-router';
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
  const toStart = useMemo(() => toStartToday(inbox.scheduled, inbox.tz, now).length, [inbox.scheduled, inbox.tz, now]);

  const first = (me?.name || me?.username || '').trim().split(/\s+/)[0];
  const hello = `${greeting(inbox.tz, now)}${first ? `, ${first[0].toUpperCase()}${first.slice(1)}` : ''}`;
  const trips = (view: string) => router.push({ pathname: '/trips', params: { view } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <AppTopBar urgent={inbox.counts.now} actions={[{ icon: Search, label: 'Search trips', onPress: () => router.push('/trips') }]} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B76' }}>{dateLabel(inbox.tz, now)}</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#3E3C3D', letterSpacing: -0.4 }} accessibilityRole="header">{hello}</Text>
        </View>

        <EmergencyStrip
          items={emergencies}
          now={now}
          onIntent={onIntent}
          onOpenTrip={(id) => openTrip(id)}
          onAll={() => router.push({ pathname: '/notifications', params: { tab: 'todo' } })}
        />

        <TodayCard
          done={inbox.finishedToday}
          running={inbox.counts.running}
          toStart={toStart}
          needs={needs}
          loading={inbox.loading}
          onTrips={trips}
          onTodo={() => router.push({ pathname: '/notifications', params: { tab: 'todo' } })}
          onKind={(kind) => router.push({ pathname: '/needs-action', params: { kind } })}
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
