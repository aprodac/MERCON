/**
 * Route: /driver-activity?id=&name=[&tripId=&tripRef=] — everything about a
 * driver's phone and what they did, as the web's "Phone & app" sheet shows it:
 *   Phone          — ready / check / not ready and why, each phone's notifications
 *                    and location permission, GPS, battery, network, app version
 *   Notifications  — every notification sent, whether it reached the phone and was opened
 *   Activity       — logins, logouts, app opens, offline/online, permission changes,
 *                    trip updates, photos, emergencies
 * Opened from a trip it starts on "This trip": what was sent for that trip,
 * "Got it" taps and the driver's activity on it.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Battery, BatteryWarning, Bell, BellOff, CheckCircle2, Eye, MapPin, MapPinOff, Send, Signal, Smartphone, Wifi, WifiOff, type LucideIcon,
} from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { EmptyHint, PageTitle } from '@/components/pageCues';
import { Card, Chip, INK, MUTED, PAGE, tap } from '../../trips/details/components/parts';
import { TONE, type Tone } from '../../trips/details/tripDetailsModel';
import {
  ACTIVITY_LABEL, LEVEL_LABEL, LEVEL_TONE, LOC_TEXT, NOTIF_TEXT, PUSH_LABEL, activityDetail, driverPhoneApi, driverPhoneKey, isAlarming, timeAgo, tripTrailKey,
  type ActivityRow, type DriverDevice, type NotificationTrail, type PushStatus,
} from './driverPhone';

type Tab = 'trip' | 'phone' | 'notifications' | 'activity';

const PUSH_TONE: Record<PushStatus, Tone> = { NoDevice: 'red', Sent: 'amber', Delivered: 'green', Failed: 'red', Unknown: 'gray' };

/** "12 Oct, 14:05" in the phone's time. */
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export default function DriverActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id, name, tripId, tripRef } = useLocalSearchParams<{ id: string; name?: string; tripId?: string; tripRef?: string }>();
  const [tab, setTab] = useState<Tab>(tripId ? 'trip' : 'phone');

  const phone = useQuery({ queryKey: driverPhoneKey(id), queryFn: () => driverPhoneApi.details(id), enabled: !!id, refetchInterval: 30_000 });
  const trail = useQuery({ queryKey: tripTrailKey(tripId ?? ''), queryFn: () => driverPhoneApi.tripTrail(tripId!), enabled: !!tripId });

  const testPush = useMutation({
    mutationFn: () => driverPhoneApi.testPush(id),
    onSuccess: () => {
      Alert.alert('Test notification sent', 'Whether it reached the phone shows under Notifications within about 15 minutes.');
      setTimeout(() => queryClient.invalidateQueries({ queryKey: driverPhoneKey(id) }), 2000);
    },
    onError: (e) => Alert.alert('Could not send', getApiErrorMessage(e)),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/driver-details', params: { id } }));
  const refresh = () => { phone.refetch(); if (tripId) trail.refetch(); };
  const data = phone.data;
  const active = data?.devices.filter((d) => d.isActive) ?? [];
  const old = data?.devices.filter((d) => !d.isActive) ?? [];

  const tabs: { id: Tab; label: string }[] = [
    ...(tripId ? [{ id: 'trip' as Tab, label: 'This trip' }] : []),
    { id: 'phone', label: 'Phone' },
    { id: 'notifications', label: 'Alerts' },
    { id: 'activity', label: 'Activity' },
  ];

  const body = () => {
    if (phone.isLoading) return <Card><EmptyHint>Loading…</EmptyHint></Card>;
    if (phone.error || !data) return <Card><ErrorState message={getApiErrorMessage(phone.error) || 'Could not load the phone.'} onRetry={refresh} /></Card>;

    if (tab === 'trip') {
      if (trail.isLoading) return <Card><EmptyHint>Loading…</EmptyHint></Card>;
      if (trail.error || !trail.data) return <Card><ErrorState message="Could not load this trip's trail." onRetry={() => trail.refetch()} /></Card>;
      const t = trail.data;
      // One list, oldest first: what was sent, "Got it", and what the driver did on this trip.
      const rows = [
        ...t.notifications.map((n) => ({ at: n.createdAt, el: <NotificationItem key={`n${n.id}`} n={n} /> })),
        ...t.acknowledgements.map((a) => ({ at: a.createdAt, el: <ActivityItem key={`k${a.id}`} a={{ id: a.id, type: 'Acknowledged', tripId: tripId ?? null, metadata: null, createdAt: a.createdAt }} who={a.driverName} /> })),
        ...t.activity.map((a) => ({ at: a.createdAt, el: <ActivityItem key={`a${a.id}`} a={a} /> })),
      ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
      return (
        <>
          <Text style={s.hint}>Oldest first — what the office sent for {tripRef || 'this trip'}, and what the driver did.</Text>
          <Card style={s.list}>{rows.length ? rows.map((r) => r.el) : <EmptyHint>Nothing sent or done on this trip yet.</EmptyHint>}</Card>
        </>
      );
    }

    if (tab === 'phone') {
      return (
        <>
          {active.length === 0 ? (
            <Card><Text style={[s.reason, { color: TONE.red.fg }]}>No phone registered. The driver needs to log in to the MERCON Driver app.</Text></Card>
          ) : active.map((d) => <DeviceCard key={d.id} d={d} minVersion={data.minVersion} latestVersion={data.latestVersion} />)}
          {old.length ? (
            <>
              <Text style={s.group}>Previous phones</Text>
              {old.map((d) => <DeviceCard key={d.id} d={d} minVersion={data.minVersion} latestVersion={data.latestVersion} />)}
            </>
          ) : null}
        </>
      );
    }

    if (tab === 'notifications') {
      return <Card style={s.list}>{data.notifications.length ? data.notifications.map((n) => <NotificationItem key={n.id} n={n} />) : <EmptyHint>Nothing has been sent to this driver yet.</EmptyHint>}</Card>;
    }

    return <Card style={s.list}>{data.activity.length ? data.activity.map((a) => <ActivityItem key={a.id} a={a} showTrip />) : <EmptyHint>No activity recorded yet.</EmptyHint>}</Card>;
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
          <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
        <PageTitle title="Driver activity" />
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 28 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={phone.isRefetching || trail.isRefetching} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {/* Who, how ready their phone is and why, and a test push */}
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.name} numberOfLines={1}>{name || 'Driver'}</Text>
              <Text style={s.sub}>App last seen {timeAgo(data?.status.lastSeenAt)}</Text>
            </View>
            {data ? <Chip label={LEVEL_LABEL[data.status.level]} tone={LEVEL_TONE[data.status.level]} dot /> : null}
          </View>
          {data ? (
            data.status.reasons.length ? (
              <View style={{ marginTop: 10, gap: 3 }}>
                {data.status.reasons.map((r) => (
                  <Text key={r} style={[s.reason, { color: data.status.level === 'red' ? TONE.red.fg : TONE.amber.fg }]}>• {r}</Text>
                ))}
              </View>
            ) : <Text style={[s.reason, { color: TONE.green.fg, marginTop: 10 }]}>This phone can receive trips and report back.</Text>
          ) : null}
          <TouchableOpacity style={[s.testBtn, testPush.isPending && { opacity: 0.6 }]} disabled={testPush.isPending || !id} onPress={() => { tap(); testPush.mutate(); }} activeOpacity={0.8}>
            {testPush.isPending ? <ActivityIndicator size="small" color={Colors.white} /> : <Send size={15} color={Colors.white} strokeWidth={2.3} />}
            <Text style={s.testText}>{testPush.isPending ? 'Sending…' : 'Send test notification'}</Text>
          </TouchableOpacity>
        </Card>

        <View style={s.tabs}>
          {tabs.map((t) => {
            const on = t.id === tab;
            return (
              <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]} onPress={() => { if (!on) tap(); setTab(t.id); }} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {body()}
      </ScrollView>
    </View>
  );
}

function Fact({ icon: Icon, label, value, bad, warn }: { icon: LucideIcon; label: string; value: string; bad?: boolean; warn?: boolean }) {
  const tone = bad ? TONE.red : warn ? TONE.amber : null;
  return (
    <View style={[s.fact, tone && { backgroundColor: tone.bg, borderColor: tone.bg }]}>
      <Icon size={16} color={tone ? tone.fg : MUTED} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.factLabel}>{label}</Text>
        <Text style={[s.factValue, tone && { color: tone.fg }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const newer = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }) < 0;

function DeviceCard({ d, minVersion, latestVersion }: { d: DriverDevice; minVersion: string | null; latestVersion: string | null }) {
  const reports = d.health_reported_at != null;
  const battery = d.battery_level != null ? `${Math.round(d.battery_level * 100)}%` : '—';
  const network = d.network_type === 'wifi' ? 'Wi-Fi' : d.network_type === 'cellular' ? 'Mobile data' : d.network_type === 'none' ? 'Offline' : d.network_type ?? '—';
  const belowMin = !!minVersion && (!d.app_version || newer(d.app_version, minVersion));
  const notLatest = !!latestVersion && !!d.app_version && newer(d.app_version, latestVersion);
  const model = d.device_model ?? (d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android phone' : 'Phone');
  const os = `${d.os_name === 'ios' ? 'iOS' : d.os_name === 'android' ? 'Android' : d.platform} ${d.os_version ?? ''}`.trim();

  return (
    <Card style={!d.isActive ? { opacity: 0.6 } : undefined}>
      <View style={s.row}>
        <Smartphone size={18} color={MUTED} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.deviceName} numberOfLines={1}>{model}</Text>
          <Text style={s.sub}>{os}</Text>
        </View>
        <Chip label={d.isActive ? `Seen ${timeAgo(d.lastSeenAt)}` : 'Logged out'} tone="gray" />
      </View>
      {!reports ? (
        <Text style={[s.reason, { color: TONE.amber.fg, marginTop: 10 }]}>Old app version — this phone doesn’t report its settings. Ask the driver to update the app.</Text>
      ) : (
        <View style={s.facts}>
          <Fact
            icon={d.notif_permission === 'denied' ? BellOff : Bell}
            label="Notifications"
            value={`${NOTIF_TEXT[d.notif_permission ?? ''] ?? '—'}${d.notif_permission === 'granted' && !d.hasPushToken ? ' (no token)' : ''}`}
            bad={d.notif_permission === 'denied' || (d.notif_permission === 'granted' && !d.hasPushToken)}
            warn={d.notif_permission === 'undetermined'}
          />
          <Fact icon={d.location_permission === 'denied' ? MapPinOff : MapPin} label="Location access" value={LOC_TEXT[d.location_permission ?? ''] ?? '—'} bad={d.location_permission === 'denied'} warn={d.location_permission === 'undetermined'} />
          <Fact icon={d.location_services_on === false ? MapPinOff : MapPin} label="Phone GPS" value={d.location_services_on == null ? '—' : d.location_services_on ? 'On' : 'Off'} warn={d.location_services_on === false} />
          <Fact icon={d.low_power_mode ? BatteryWarning : Battery} label="Battery" value={`${battery}${d.low_power_mode ? ' · saver on' : ''}`} warn={!!d.low_power_mode || (d.battery_level != null && d.battery_level < 0.15)} />
          <Fact icon={d.network_type === 'wifi' ? Wifi : d.network_type === 'none' ? WifiOff : Signal} label="Network" value={network} warn={d.network_type === 'none'} />
          <Fact icon={Smartphone} label="App version" value={`${d.app_version ?? '—'}${d.build_number ? ` (${d.build_number})` : ''}${belowMin ? ' · too old' : notLatest ? ' · update' : ''}`} bad={belowMin} warn={!belowMin && notLatest} />
        </View>
      )}
      <Text style={[s.sub, { marginTop: 10, fontSize: 12 }]}>
        Registered {when(d.createdAt)}{reports ? ` · last report ${when(d.health_reported_at!)}` : ''}
      </Text>
    </Card>
  );
}

function NotificationItem({ n }: { n: NotificationTrail }) {
  const failed = n.deliveries.find((d) => d.reason);
  return (
    <View style={s.item}>
      <View style={s.row}>
        <Text style={[s.itemTitle, { flex: 1 }]} numberOfLines={1}>{n.title}</Text>
        <Text style={s.time}>{when(n.createdAt)}</Text>
      </View>
      {n.driverName ? <Text style={s.sub}>To {n.driverName}</Text> : null}
      <Text style={s.sub} numberOfLines={2}>{n.message}</Text>
      <View style={s.chips}>
        {n.push ? <Chip label={PUSH_LABEL[n.push]} tone={PUSH_TONE[n.push]} /> : <Chip label="No push (in-app only)" tone="gray" />}
        {n.opened_at ? <Chip label={`Opened ${when(n.opened_at)}`} tone="green" />
          : n.read_at ? <Chip label={`Read ${when(n.read_at)}`} tone="green" />
          : !n.is_read ? <Chip label="Not read yet" tone="gray" /> : null}
      </View>
      {failed ? <Text style={[s.sub, { color: TONE.red.fg, fontWeight: '600' }]}>{failed.reason}</Text> : null}
    </View>
  );
}

function ActivityItem({ a, showTrip, who }: { a: ActivityRow; showTrip?: boolean; who?: string }) {
  const detail = activityDetail(a);
  const dot = isAlarming(a) ? TONE.red.dot : a.type === 'Acknowledged' || a.type === 'Login' || a.type === 'CameOnline' ? TONE.green.dot : '#C9CCD6';
  const Icon = a.type === 'Acknowledged' ? CheckCircle2 : a.type === 'AppOpened' ? Eye : null;
  return (
    <View style={[s.item, s.row, { alignItems: 'flex-start' }]}>
      <View style={[s.dot, { backgroundColor: dot }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={s.itemTitle}>
          {Icon ? <Icon size={13} color={INK} /> : null}{Icon ? ' ' : ''}{ACTIVITY_LABEL[a.type] ?? a.type}
          {showTrip && a.tripRef ? <Text style={s.sub}>{`  ·  ${a.tripRef}`}</Text> : null}
        </Text>
        {who ? <Text style={s.sub}>{who}</Text> : null}
        {detail ? <Text style={s.sub} numberOfLines={2}>{detail}</Text> : null}
      </View>
      <Text style={s.time}>{when(a.createdAt)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 18, fontWeight: '800', color: INK },
  sub: { fontSize: 13, color: MUTED },
  reason: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  hint: { fontSize: 12, color: MUTED, paddingHorizontal: 4 },
  group: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6, paddingHorizontal: 4 },
  testBtn: { marginTop: 14, height: 42, borderRadius: 12, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  testText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#EAEAED', borderRadius: 12, padding: 3 },
  tab: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK, fontWeight: '700' },
  deviceName: { fontSize: 15, fontWeight: '700', color: INK },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  fact: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 10, borderWidth: 1, borderColor: '#EDEDF0', backgroundColor: '#FAFAFB' },
  factLabel: { fontSize: 11, color: MUTED },
  factValue: { fontSize: 13, fontWeight: '700', color: INK },
  list: { paddingVertical: 2 },
  item: { paddingVertical: 11, gap: 4, borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  itemTitle: { fontSize: 14, fontWeight: '700', color: INK },
  time: { fontSize: 12, color: '#A1A1AA', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
});
