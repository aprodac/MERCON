/**
 * Operator Home ("today at a glance"), under the MERCON top bar:
 *   greeting        today's date over "Good afternoon, <name>"
 *   EmergencyStrip  only while a driver emergency is open
 *   TodayCard       ring of done / on the road / to start, and how many
 *                   things need you (delayed · no driver or truck · photos)
 *   LiveNow         fleet map + the trips on the road, late ones first
 *   UpNext          trips still to start today, with Assign when one is short
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
import { UpNext } from '../home/UpNext';
import { FromDrivers } from '../home/FromDrivers';
import { dateLabel, greeting, toStartToday } from '../home/today';

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
  const needs = useMemo(() => {
    const count = (...kinds: string[]) => inbox.items.filter((i) => kinds.includes(i.kind)).length;
    return { total: inbox.items.length, delayed: count('delayed', 'late-start'), unassigned: count('unassigned'), photos: count('photos') };
  }, [inbox.items]);
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
          onAll={() => router.push('/notifications')}
        />

        <TodayCard
          done={inbox.finishedToday}
          running={inbox.counts.running}
          toStart={toStart}
          needs={needs}
          loading={inbox.loading}
          onTrips={trips}
          onTodo={(filter) => router.push({ pathname: '/notifications', params: filter ? { filter } : {} })}
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

        <UpNext
          trips={inbox.scheduled}
          tz={inbox.tz}
          now={now}
          onOpenTrip={(id) => openTrip(id)}
          onAssign={(id, what) => openTrip(id, { assign: what })}
          onAll={() => trips('schedule')}
        />

        <FromDrivers updates={inbox.updates} now={now} onSend={(id) => openTrip(id, { tab: 'updates' })} />
      </ScrollView>
      {/* Finished trips waiting for an answer on extra charges */}
      <ChargeAssistant userName={me?.name || me?.username || undefined} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}
