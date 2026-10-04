/**
 * "To do": everything on the fleet someone has to act on — the same items as
 * Home's Needs action list (useActionInbox), all of them here, in three
 * sections by urgency. Several items of one kind fold into one row that opens
 * a sheet, worst first. Chips narrow it to trips, photos, documents or money.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { CircleCheckBig, TriangleAlert } from 'lucide-react-native';
import type { ActionGroup, ActionIntent, ActionItem, ActionKind, Urgency } from '../../dashboard/actions/actionModel';
import { ActionRow, GroupRow, KindSheet, groupByKind } from '../../dashboard/actions/NeedsAction';
import { Chips, EmptyState, SectionLabel, SkeletonCard, p, tap, INK } from './parts';

export type GroupFilter = 'all' | ActionGroup;

const GROUP_LABEL: Record<ActionGroup, string> = { trips: 'Trips', whatsapp: 'Photos', documents: 'Documents', money: 'Money' };

const SECTIONS: { urgency: Urgency; title: string }[] = [
  { urgency: 'now', title: 'Urgent' },
  { urgency: 'today', title: 'Today' },
  { urgency: 'watch', title: 'Can wait' },
];

export function TodoTab({ items, initialFilter = 'all', loading, liveError, onRetry, now, refreshing, onRefresh, onIntent, onOpenTrip }: {
  items: ActionItem[];
  /** Chip to start on, e.g. Home's "Photos to send" opens on Photos. */
  initialFilter?: GroupFilter;
  loading: boolean;
  liveError: boolean;
  onRetry: () => void;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const [filter, setFilter] = useState<GroupFilter>(initialFilter);
  // A folded row's sheet shows that kind within its own section, so its count matches the row.
  const [sheet, setSheet] = useState<{ kind: ActionKind; urgency: Urgency } | null>(null);

  const chips = useMemo(() => {
    const count = (g: ActionGroup) => items.filter((i) => i.group === g).length;
    return [
      { value: 'all' as GroupFilter, label: 'All', count: items.length },
      ...(Object.keys(GROUP_LABEL) as ActionGroup[]).filter((g) => count(g) > 0).map((g) => ({ value: g as GroupFilter, label: GROUP_LABEL[g], count: count(g) })),
    ];
  }, [items]);
  // A filter whose items have all been handled falls back to All.
  const active = chips.some((c) => c.value === filter) ? filter : 'all';
  const shown = useMemo(() => (active === 'all' ? items : items.filter((i) => i.group === active)), [items, active]);

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FA634E" />}
      >
        {items.length > 0 ? <Chips options={chips} value={active} onChange={setFilter} /> : null}

        <View style={{ paddingHorizontal: 16, gap: 20 }}>
          {liveError ? (
            <TouchableOpacity style={[p.card, { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }]} onPress={() => { tap(); onRetry(); }} activeOpacity={0.7}>
              <TriangleAlert size={18} color="#B54708" />
              <Text style={{ flex: 1, fontSize: 14, color: INK }}>{"Couldn't load live trips. Some alerts may be missing."}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: INK }}>Retry</Text>
            </TouchableOpacity>
          ) : null}

          {loading && items.length === 0 ? (
            <SkeletonCard rows={4} />
          ) : shown.length === 0 ? (
            <EmptyState icon={CircleCheckBig} color="#16A34A" title="You're all caught up" text="Nothing needs you right now. New alerts show up here as they happen." />
          ) : (
            SECTIONS.map((sec) => {
              const list = shown.filter((i) => i.urgency === sec.urgency);
              if (list.length === 0) return null;
              const rows = groupByKind(list);
              return (
                <View key={sec.urgency}>
                  <SectionLabel title={sec.title} count={list.length} tone={sec.urgency === 'now' ? 'red' : undefined} />
                  <View style={p.card}>
                    {rows.map((r, i) =>
                      r.type === 'item' ? (
                        <ActionRow key={r.item.key} item={r.item} first={i === 0} now={now} onIntent={onIntent} onOpenTrip={onOpenTrip} />
                      ) : (
                        <GroupRow key={r.kind} kind={r.kind} items={r.items} first={i === 0} now={now} onPress={() => { tap(); setSheet({ kind: r.kind, urgency: sec.urgency }); }} />
                      ),
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
      <KindSheet kind={sheet?.kind ?? null} items={sheet ? shown.filter((i) => i.urgency === sheet.urgency) : []} now={now} onClose={() => setSheet(null)} onIntent={onIntent} onOpenTrip={onOpenTrip} />
    </>
  );
}
