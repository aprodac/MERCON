import { useCallback, useEffect, useState } from 'react';
import { safeSecureStore } from '@mercon/mobile-shared/lib/secure-store';

// Keys may only hold letters, digits, '.', '-', '_' (expo-secure-store).
const PINNED_KEY = 'mercon.quotations.pinned';
const RECENT_KEY = 'mercon.quotations.recent';
const MAX_PINNED = 20;
const MAX_RECENT = 4;

const read = async (key: string): Promise<string[]> => {
  try {
    const raw = await safeSecureStore.getItemAsync(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const write = (key: string, list: string[]) => { safeSecureStore.setItemAsync(key, JSON.stringify(list)).catch(() => {}); };

/**
 * Companies the operator pinned on the quotations page, and the last few they
 * opened — kept on this phone only (a per-person shortcut, not shared data).
 */
export function useCompanyShortcuts() {
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([read(PINNED_KEY), read(RECENT_KEY)]).then(([p, r]) => {
      if (!live) return;
      setPinned(p);
      setRecent(r);
    });
    return () => { live = false; };
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinned((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, MAX_PINNED);
      write(PINNED_KEY, next);
      return next;
    });
  }, []);

  const markOpened = useCallback((id: string) => {
    setRecent((list) => {
      const next = [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT);
      write(RECENT_KEY, next);
      return next;
    });
  }, []);

  return { pinned, recent, togglePin, markOpened };
}
