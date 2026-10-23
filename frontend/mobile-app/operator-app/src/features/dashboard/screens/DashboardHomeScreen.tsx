/**
 * Operator Home ("today at a glance"), under the MERCON top bar:
 *   greeting        "Good afternoon, <name>" with today's date at the end of the line
 *   EmergencyStrip  only while a driver emergency is open
 *   TodayCard       ring of done / on the road / to start, and what needs
 *                   you as tiles by kind, most important first
 *   LiveTrips       a card per trip on the road (its own map, status,
 *                   route, next stop, driver), late ones first
 *   FleetMapCard    every truck on one small map; opens the Fleet map
 *   FleetUtilisation share of trucks that ran a trip today / week / month,
 *                   the fleet right now (on trip · free · maintenance), by body type
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
import { LiveTrips } from '../home/LiveTrips';
import { FleetMapCard } from '../home/FleetMapCard';
import { FleetUtilisation } from '../home/FleetUtilisation';
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
  const { onIntent, openTrip, toast, setToast } = useActionIntent();

  const emergencies = useMemo(() => inbox.items.filter((i) => i.kind === 'emergency'), [inbox.items]);
  const needs = useMemo(() => needTiles(inbox.items), [inbox.items]);
  // Late trips that never started still count as to start, not on the road.
  const toStart = useMemo(() => toStartToday(inbox.scheduled, inbox.tz, now).length + inbox.counts.lateToStart, [inbox.scheduled, inbox.tz, now, inbox.counts.lateToStart]);

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
        {/* The date sits at the end of the greeting's line instead of a row of its own (owner, 23 Oct). */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingHorizontal: 2 }}>
          <Text style={{ flex: 1, fontSize: 24, fontWeight: '700', color: '#3E3C3D', letterSpacing: -0.4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">{hello}</Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B76' }}>{dateLabel(inbox.tz, now)}</Text>
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

        <LiveTrips
          units={inbox.units}
          tz={inbox.tz}
          now={now}
          onOpenTrip={(id) => openTrip(id)}
          onTrack={(trip) => router.push({ pathname: '/fleet-map', params: { trip } })}
          onAll={() => trips('now')}
        />

        <FleetMapCard units={inbox.units} onOpenMap={() => router.push('/fleet-map')} />

        <FleetUtilisation onAll={() => router.push('/vehicles')} />

        <FromDrivers updates={inbox.updates} now={now} onSend={(u) => openTrip(u.trip.id, { share: 'update', update: u.key })} />
      </ScrollView>
      {/* Finished trips waiting for an answer on extra charges */}
      <ChargeAssistant userName={me?.name || me?.username || undefined} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}
