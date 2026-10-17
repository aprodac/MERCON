/**
 * Route: /recycle-bin — what was deleted (trips, drivers, trucks, customers,
 * quotations, places…), newest first. Same /trash API and rules as the web's
 * Recycle Bin: Admins and Operators restore; only Admins delete for good
 * (it can't be undone, and the server refuses everyone else).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react-native';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppTopBar } from '@/components/AppTopBar';
import { BG, Chips, EmptyState, INK, MUTED, SkeletonCard, p, tap } from '@/features/notifications/components/parts';

interface TrashItem { id: string; type: string; name: string; deletedAt: string }

const TYPE_LABEL: Record<string, string> = {
  Trip: 'Trips', Driver: 'Drivers', Vehicle: 'Trucks', Customer: 'Customers',
  Quotation: 'Quotations', Location: 'Places', MaintenanceRecord: 'Maintenance', Expense: 'Expenses',
};
const one = (type: string) => (TYPE_LABEL[type] ?? type).replace(/s$/, '').toLowerCase();

const trashApi = {
  list: async () => ((await api.get('/trash')).data?.data ?? []) as TrashItem[],
  restore: (it: TrashItem) => api.post(`/trash/${it.type}/${it.id}/restore`),
  remove: (it: TrashItem) => api.delete(`/trash/${it.type}/${it.id}`),
};

function ago(iso: string): string {
  const d = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  return `${Math.floor(d)} days ago`;
}

export default function RecycleBinScreen() {
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const queryClient = useQueryClient();
  const bin = useQuery({ queryKey: ['recycle-bin'], queryFn: trashApi.list });
  const [type, setType] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);

  const items = useMemo(() => bin.data ?? [], [bin.data]);
  const chips = useMemo(() => {
    const types = [...new Set(items.map((i) => i.type))];
    return [{ value: 'all', label: 'All', count: items.length }, ...types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t, count: items.filter((i) => i.type === t).length }))];
  }, [items]);
  const active = chips.some((c) => c.value === type) ? type : 'all';
  const shown = active === 'all' ? items : items.filter((i) => i.type === active);

  const run = async (it: TrashItem, what: 'restore' | 'remove') => {
    setBusy(it.id);
    try {
      if (what === 'restore') await trashApi.restore(it);
      else await trashApi.remove(it);
      await bin.refetch();
      // A restored trip / driver / truck shows up again in its lists.
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch (e) {
      Alert.alert(what === 'restore' ? 'Could not restore' : 'Could not delete', getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const restore = (it: TrashItem) => { tap(); run(it, 'restore'); };
  const remove = (it: TrashItem) => {
    tap();
    Alert.alert('Delete for good?', `"${it.name}" (${one(it.type)}) is deleted permanently, with its files. This can't be undone.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete for good', style: 'destructive', onPress: () => run(it, 'remove') },
    ]);
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <AppTopBar title="Recycle bin" />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120, gap: 14 }}
        refreshControl={<RefreshControl refreshing={bin.isRefetching} onRefresh={() => bin.refetch()} tintColor="#FA634E" />}
      >
        {items.length ? <Chips options={chips} value={active} onChange={setType} /> : null}
        <View style={s.pad}>
          <Text style={s.note}>
            {isAdmin
              ? 'Restore puts it back where it was. Delete for good removes it permanently.'
              : 'Restore puts it back where it was. Only an Admin can delete for good.'}
          </Text>
          {bin.isLoading ? <SkeletonCard rows={4} /> : bin.error ? (
            <EmptyState icon={Trash2} title="Couldn't open the recycle bin" text={getApiErrorMessage(bin.error)} />
          ) : shown.length === 0 ? (
            <EmptyState icon={Trash2} color="#16A34A" title="The recycle bin is empty" text="Deleted trips, drivers, trucks and customers show up here." />
          ) : (
            <View style={p.card}>
              {shown.map((it, i) => (
                <View key={`${it.type}:${it.id}`} style={[s.row, i > 0 && p.rowBorder]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.name} numberOfLines={1}>{it.name}</Text>
                    <Text style={s.meta}>{TYPE_LABEL[it.type]?.replace(/s$/, '') ?? it.type} · deleted {ago(it.deletedAt)}</Text>
                  </View>
                  <TouchableOpacity style={s.restore} onPress={() => restore(it)} disabled={busy === it.id} accessibilityLabel={`Restore ${it.name}`}>
                    <RotateCcw size={14} color={INK} strokeWidth={2.4} />
                    <Text style={s.restoreText}>Restore</Text>
                  </TouchableOpacity>
                  {isAdmin ? (
                    <TouchableOpacity style={s.remove} onPress={() => remove(it)} disabled={busy === it.id} accessibilityLabel={`Delete ${it.name} for good`}>
                      <Trash2 size={16} color="#B42318" strokeWidth={2.2} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pad: { paddingHorizontal: 16, gap: 12 },
  note: { fontSize: 13, color: MUTED, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  name: { fontSize: 15, fontWeight: '700', color: INK },
  meta: { fontSize: 12, color: MUTED },
  restore: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F1F3F7' },
  restoreText: { fontSize: 13, fontWeight: '700', color: INK },
  remove: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF3F2', alignItems: 'center', justifyContent: 'center' },
});
