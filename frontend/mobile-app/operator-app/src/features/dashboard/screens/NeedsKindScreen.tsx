/**
 * One kind of "needs you" item on its own page (Home → a Today card tile):
 * every item of that kind, by urgency, worst first, each with its buttons and
 * swipe shortcuts. Same live items as Notifications → To do.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleCheckBig } from 'lucide-react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { AppTopBar } from '@/components/AppTopBar';
import { EmptyState, SectionLabel, SkeletonCard, BG, p } from '../../notifications/components/parts';
import { useDashboardRefresh } from '../hooks';
import { useActionInbox } from '../actions/useActionInbox';
import { useActionIntent } from '../actions/useActionIntent';
import { ActionRow, worstFirst } from '../actions/NeedsAction';
import type { ActionKind, Urgency } from '../actions/actionModel';
import { TILE_LABEL } from '../home/needsTiles';

const SECTIONS: { urgency: Urgency; title: string }[] = [
  { urgency: 'now', title: 'Urgent' },
  { urgency: 'today', title: 'Today' },
  { urgency: 'watch', title: 'Can wait' },
];

export default function NeedsKindScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (Object.keys(TILE_LABEL) as ActionKind[]).find((k) => k === params.kind) ?? null;

  // Ticks each minute so "12m late" stays current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const inbox = useActionInbox();
  const { onIntent, openTrip, toast, setToast } = useActionIntent();
  const { refreshing, refresh } = useDashboardRefresh();
  const items = useMemo(() => inbox.items.filter((i) => i.kind === kind), [inbox.items, kind]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <AppTopBar title={kind ? TILE_LABEL[kind] : 'Needs you'} onBack={back} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        {inbox.loading && items.length === 0 ? (
          <SkeletonCard rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon={CircleCheckBig} color="#16A34A" title="All clear" text="Nothing left here. New ones show up as they happen." />
        ) : (
          SECTIONS.map((sec) => {
            const list = items.filter((i) => i.urgency === sec.urgency).sort(worstFirst);
            if (list.length === 0) return null;
            return (
              <View key={sec.urgency}>
                <SectionLabel title={sec.title} count={list.length} tone={sec.urgency === 'now' ? 'red' : undefined} />
                <View style={p.card}>
                  {list.map((item, i) => (
                    <ActionRow key={item.key} item={item} first={i === 0} now={now} onIntent={onIntent} onOpenTrip={(id) => openTrip(id)} />
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}
