import { useSyncExternalStore } from 'react';
import { authStore } from '@/store/authStore';
import { DEFAULT_PINNED_PAGE_IDS, MAX_PINS } from '@/config/navigation';

/**
 * Per-user navigation preferences kept in localStorage: pinned pages (top bar) and recently visited
 * pages (⌘K). A tiny external store so the sidebar, header and palette stay in sync without a context.
 * Browser-only for now — pins don't follow the user to another device.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

function userKey(kind: 'pins' | 'recent' | 'sidebar-theme') {
  const id = (authStore.getUser() as { id?: string } | null)?.id ?? 'anon';
  return `mercon_nav_${kind}_${id}`;
}

function read(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

// Keyed by the per-user storage key, so a different user logging in on the same browser gets their own values.
const cache: Record<string, string[]> = {};

function write(kind: 'pins' | 'recent' | 'sidebar-theme', value: string[]) {
  const key = userKey(kind);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — keep working in memory for this session
  }
  cache[key] = value;
  emit();
}

function getPins(): string[] {
  const key = userKey('pins');
  if (!cache[key]) cache[key] = read(key) ?? DEFAULT_PINNED_PAGE_IDS;
  return cache[key];
}

function getRecent(): string[] {
  const key = userKey('recent');
  if (!cache[key]) cache[key] = read(key) ?? [];
  return cache[key];
}

export type SidebarTheme = 'charcoal' | 'light';

function getSidebarTheme(): SidebarTheme {
  const key = userKey('sidebar-theme');
  if (!cache[key]) cache[key] = read(key) ?? ['charcoal'];
  return cache[key][0] === 'light' ? 'light' : 'charcoal';
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const navStore = {
  getPins,
  isPinned: (id: string) => getPins().includes(id),
  togglePin(id: string) {
    const pins = getPins();
    if (pins.includes(id)) write('pins', pins.filter((p) => p !== id));
    else if (pins.length < MAX_PINS) write('pins', [...pins, id]);
  },
  movePin(id: string, delta: -1 | 1) {
    const pins = [...getPins()];
    const i = pins.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= pins.length) return;
    [pins[i], pins[j]] = [pins[j], pins[i]];
    write('pins', pins);
  },
  canPinMore: () => getPins().length < MAX_PINS,
  getRecent,
  getSidebarTheme,
  setSidebarTheme(theme: SidebarTheme) {
    write('sidebar-theme', [theme]);
  },
  pushRecent(id: string) {
    const recent = getRecent();
    if (recent[0] === id) return;
    write('recent', [id, ...recent.filter((r) => r !== id)].slice(0, 5));
  },
};

export function usePinnedIds() {
  return useSyncExternalStore(subscribe, getPins, getPins);
}

export function useSidebarTheme() {
  return useSyncExternalStore(subscribe, getSidebarTheme, getSidebarTheme);
}

export function useRecentIds() {
  return useSyncExternalStore(subscribe, getRecent, getRecent);
}

/** Open the ⌘K command palette from anywhere. */
export const COMMAND_PALETTE_EVENT = 'mercon:command-palette';
export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
}

/** Open the keyboard shortcuts guide from anywhere. */
export const SHORTCUTS_EVENT = 'mercon:keyboard-shortcuts';
export function openShortcutsGuide() {
  window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}
