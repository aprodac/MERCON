/**
 * "Mark as read" for To do (TestFlight feedback "Add mark as read option").
 * To do items are live conditions (a delayed trip, a quiet GPS, expiring
 * documents), not messages, so reading one hides it on this phone for
 * READ_FOR_MS; if it still needs doing after that, it comes back. Emergencies
 * are never hidden — they're cleared with Handled.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { safeSecureStore } from '@mercon/mobile-shared/lib/secure-store';
import type { ActionItem } from '../../dashboard/actions/actionModel';

const KEY = 'operator_todo_read_v1';
export const READ_FOR_MS = 12 * 3600_000;

export function useReadTodo(items: ActionItem[], now: number) {
  const [readAt, setReadAt] = useState<Record<string, number>>({});
  useEffect(() => {
    safeSecureStore.getItemAsync(KEY).then((raw) => {
      try { if (raw) setReadAt(JSON.parse(raw)); } catch { /* start clean */ }
    }).catch(() => {});
  }, []);
  const save = useCallback((next: Record<string, number>) => {
    // Keep only marks still in force, so the store never grows.
    const live = Object.fromEntries(Object.entries(next).filter(([, at]) => Date.now() - at < READ_FOR_MS));
    setReadAt(live);
    safeSecureStore.setItemAsync(KEY, JSON.stringify(live)).catch(() => {});
  }, []);

  const isRead = useCallback((i: ActionItem) => i.kind !== 'emergency' && readAt[i.key] != null && now - readAt[i.key] < READ_FOR_MS, [readAt, now]);
  const unread = useMemo(() => items.filter((i) => !isRead(i)), [items, isRead]);
  const hidden = items.length - unread.length;

  return {
    unread,
    hidden,
    markRead: (list: ActionItem[]) => save({ ...readAt, ...Object.fromEntries(list.filter((i) => i.kind !== 'emergency').map((i) => [i.key, Date.now()])) }),
    showAgain: () => save({}),
  };
}
