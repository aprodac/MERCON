import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Pin, PinOff } from 'lucide-react';

import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import { useNavAccess } from '@/hooks/useNavAccess';
import {
  FINANCE_GROUPS, NAV_ACTIONS, NAV_PAGES, NAV_SECTIONS, SETTINGS_GROUPS, SETTINGS_PAGES, getPinnableById, iconToneOnLight,
  type NavPage, type SettingsNavPage,
} from '@/config/navigation';
import { cn } from '@/lib/utils';
import { COMMAND_PALETTE_EVENT, navStore, usePinnedIds, useRecentIds } from '@/lib/navigation/navStore';

type Destination = NavPage | SettingsNavPage;

function contextLabel(entry: Destination): string {
  if ('settingsGroup' in entry) {
    return `Settings · ${SETTINGS_GROUPS.find((g) => g.id === entry.settingsGroup)?.label ?? ''}`;
  }
  if (entry.section === 'finance' && entry.group) {
    return `Finance · ${FINANCE_GROUPS.find((g) => g.id === entry.group)?.label ?? ''}`;
  }
  return NAV_SECTIONS.find((s) => s.id === entry.section)?.label ?? '';
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const access = useNavAccess();
  const pinnedIds = usePinnedIds();
  const recentIds = useRecentIds();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  const pages = useMemo(() => NAV_PAGES.filter((p) => access(p) === 'visible'), [access]);
  const settingsPages = useMemo(() => SETTINGS_PAGES.filter((p) => access(p) === 'visible'), [access]);
  const actions = useMemo(() => NAV_ACTIONS.filter((a) => access(a) === 'visible'), [access]);

  const resolveVisible = (ids: string[]) =>
    ids.map((id) => getPinnableById(id)).filter((e): e is Destination => !!e && access(e) === 'visible');
  const recent = resolveVisible(recentIds);
  const pinned = resolveVisible(pinnedIds);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const renderDestination = (entry: Destination, group: string) => {
    const isPinned = pinnedIds.includes(entry.id);
    return (
      <CommandItem
        key={`${group}-${entry.id}`}
        value={`${group} ${entry.label} ${contextLabel(entry)} ${(entry.keywords || []).join(' ')}`}
        onSelect={() => go(entry.path)}
        className="group/item gap-2.5"
      >
        <entry.icon size={16} strokeWidth={1.75} className={cn('shrink-0', iconToneOnLight(entry))} />
        <span className="flex-1 truncate">{entry.label}</span>
        <span className="text-xs text-muted-foreground truncate">{contextLabel(entry)}</span>
        {(isPinned || navStore.canPinMore()) && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navStore.togglePin(entry.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={isPinned ? `Unpin ${entry.label}` : `Pin ${entry.label}`}
            title={isPinned ? 'Unpin from top bar' : 'Pin to top bar'}
            className="ml-1 flex items-center justify-center w-6 h-6 rounded text-muted-foreground opacity-0 group-data-[selected=true]/item:opacity-100 hover:bg-muted hover:text-foreground"
          >
            {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
        )}
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, settings and actions…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No results.</CommandEmpty>

        {recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent.map((e) => renderDestination(e, 'recent'))}
          </CommandGroup>
        )}

        {pinned.length > 0 && (
          <CommandGroup heading="Pinned">
            {pinned.map((e) => renderDestination(e, 'pinned'))}
          </CommandGroup>
        )}

        {actions.length > 0 && (
          <CommandGroup heading="Create">
            {actions.map((a) => (
              <CommandItem key={a.id} value={`create ${a.label}`} onSelect={() => go(a.path)} className="gap-2.5">
                <a.icon size={16} strokeWidth={1.75} className={cn('shrink-0', iconToneOnLight(a))} />
                <span className="flex-1">{a.label}</span>
                {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Pages">{pages.map((p) => renderDestination(p, 'page'))}</CommandGroup>

        {settingsPages.length > 0 && (
          <CommandGroup heading="Settings">{settingsPages.map((p) => renderDestination(p, 'settings'))}</CommandGroup>
        )}

        {recent.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground border-t">
            <Clock size={12} /> Pages you visit appear under Recent.
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
