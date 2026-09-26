import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, FlatList, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, Calendar, Truck, ArrowRight, Building2, MapPin } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { StatusBadge, FilterChip } from '@mercon/mobile-shared/components/Badge';
import { SearchInput } from '@mercon/mobile-shared/components/Input';
import { useOperatorTrips, type OperatorTrip } from '../../../lib/operator';
import { statusLabel, type TripStatus } from '@mercon/mobile-shared/lib/trips';
import { matchesSearch } from '@mercon/mobile-shared/lib/search';
import { API_URL } from '@mercon/mobile-shared/lib/api';

const FILTERS: { label: string; statuses: string[] | null }[] = [
  { label: 'All', statuses: null },
  { label: 'Active', statuses: ['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Emergency'] },
  { label: 'In Transit', statuses: ['InTransit'] },
  { label: 'Completed', statuses: ['Completed', 'Invoiced'] },
  { label: 'Cancelled', statuses: ['Cancelled'] },
];

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = API_URL.replace(/\/api(\/v\d+)?\/?$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${base}${cleanPath}`;
}

const driverName = (t: OperatorTrip) =>
  t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned';

const TripCard = ({ item, onPress }: { item: OperatorTrip; onPress: () => void }) => {
  const stops = item.stops || [];
  const pickupStop = stops.find((s: any) => s.stop_type === 'Pickup') || stops[0];
  const dropoffStop = [...stops].reverse().find((s: any) => s.stop_type === 'Dropoff') || stops[stops.length - 1];

  const origin = pickupStop?.location_name
    ? pickupStop.location_name.split(',')[0].replace(/\]+$/, '').trim()
    : 'Origin';
  const destination = dropoffStop?.location_name
    ? dropoffStop.location_name.split(',')[0].replace(/\]+$/, '').trim()
    : 'Destination';

  const customerLogo = resolveMediaUrl(item.customer?.logo_url);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      {/* Top Bar: Trip ID + Status Badge */}
      <View style={styles.cardTop}>
        <Text style={styles.tripId}>#{item.ref_id ?? item.id.slice(0, 8)}</Text>
        <StatusBadge status={statusLabel(item.status as TripStatus)} />
      </View>

      {/* Customer Row */}
      <View style={styles.customerRow}>
        {customerLogo ? (
          <Image source={{ uri: customerLogo }} style={styles.customerLogo} resizeMode="cover" />
        ) : (
          <View style={styles.customerAvatarFallback}>
            <Building2 size={13} color={Colors.primary} strokeWidth={2.2} />
          </View>
        )}
        <Text style={styles.customerName} numberOfLines={1}>
          {item.customer?.name ?? 'Mercon Client'}
        </Text>
      </View>

      {/* Route Row */}
      <View style={styles.routeContainer}>
        <View style={[styles.routePoint, { justifyContent: 'flex-start' }]}>
          <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
          <Text style={[styles.routeText, { textAlign: 'left' }]} numberOfLines={1}>{origin}</Text>
        </View>

        <View style={styles.arrowCapsule}>
          <ArrowRight size={12} color={Colors.white} strokeWidth={2.5} />
        </View>

        <View style={[styles.routePoint, { justifyContent: 'flex-end' }]}>
          <Text style={[styles.routeText, { textAlign: 'right' }]} numberOfLines={1}>{destination}</Text>
          <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
        </View>
      </View>

      {/* Meta Footer (Driver + Vehicle + Date) */}
      <View style={styles.cardFooter}>
        <View style={[styles.metaItem, { flexShrink: 1, marginRight: 8 }]}>
          <User size={13} color={Colors.gray500} strokeWidth={2} />
          <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={1}>{driverName(item)}</Text>
        </View>

        <View style={[styles.metaItem, { flexShrink: 0 }]}>
          <Calendar size={13} color={Colors.gray400} strokeWidth={2} />
          <Text style={styles.tripDate}>{formatDate(item.planned_start ?? item.createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const TripListScreen = () => {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const { trips, loading, error, refetch } = useOperatorTrips();

  const count = (statuses: string[] | null) =>
    statuses ? trips.filter((t) => statuses.includes(t.status)).length : trips.length;

  const FILTER_PILLS = FILTERS.map((f) => ({
    label: `${f.label} (${count(f.statuses)})`,
    key: f.label,
    statuses: f.statuses,
  }));

  const filtered = useMemo(() => {
    const active = FILTERS.find((f) => f.label === filter) ?? FILTERS[0];
    return trips.filter((t) => {
      const okStatus = !active.statuses || active.statuses.includes(t.status);
      if (!okStatus) return false;
      return matchesSearch(search, [t.ref_id, t.customer?.name, driverName(t)]);
    });
  }, [trips, filter, search]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.gray100} />

      {/* Integrated Header Bar */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Trips</Text>
          <Text style={styles.headerSubtitle}>{filtered.length} {filtered.length === 1 ? 'Trip' : 'Trips'} listed</Text>
        </View>
      </View>

      {/* Search Input */}
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search trips, drivers, customers..."
        style={styles.search}
      />

      {/* Unified Filter Pills Row with Counts */}
      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTER_PILLS.map((p) => (
            <FilterChip
              key={p.key}
              label={p.label}
              active={filter === p.key}
              onPress={() => setFilter(p.key)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Trip Cards List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && trips.length > 0} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <TripCard
            item={item}
            onPress={() => router.push({ pathname: '/trip-details', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
          ) : (
            <View style={styles.emptyState}>
              <Truck size={44} color={Colors.gray400} strokeWidth={1.6} />
              <Text style={styles.emptyText}>{error ?? 'No trips match your filters'}</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.gray100, // Seamless Light Cool Gray surface
  },
  headerRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography['2xl'],
    fontWeight: '800',
    color: Colors.gray900,
  },
  headerSubtitle: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray500,
    marginTop: 2,
  },
  search: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  filtersWrapper: {
    paddingVertical: Spacing.xs,
  },
  filtersRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  list: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: 90,
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    ...Shadows.sm,
    gap: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripId: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.gray900,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  customerLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  customerAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(250, 99, 78, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: Colors.gray900,
    flex: 1,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(238, 241, 246, 0.5)',
    padding: Spacing.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    gap: Spacing.xs,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeText: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: Colors.gray900,
    flexShrink: 1,
  },
  arrowCapsule: {
    backgroundColor: Colors.primary,
    padding: 4,
    borderRadius: Radius.full,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray700,
  },
  tripDate: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray400,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.base,
    color: Colors.gray500,
  },
});

export default TripListScreen;
