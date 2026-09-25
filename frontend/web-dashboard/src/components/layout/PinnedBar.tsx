import { NavLink, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, PinOff, Settings2 } from 'lucide-react';

import { useNavAccess } from '@/hooks/useNavAccess';
import { NAV_PAGES, SETTINGS_PAGES, findActiveEntry, getPinnableById, iconToneOnLight, MAX_PINS } from '@/config/navigation';
import { navStore, usePinnedIds } from '@/lib/navigation/navStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** Number of pins always shown inline; the rest go behind "+N" below xl widths. */
const INLINE_AT_LG = 3;

const chipBase =
  'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap outline-none transition-colors ' +
  'focus-visible:ring-2 focus-visible:ring-ring';

/** The user's pinned pages, shown in the top bar (replaces the fixed module pills). */
export default function PinnedBar() {
  const location = useLocation();
  const access = useNavAccess();
  const pinnedIds = usePinnedIds();

  const pins = pinnedIds
    .map((id) => getPinnableById(id))
    .filter((e): e is NonNullable<typeof e> => !!e && access(e) === 'visible');

  const active = findActiveEntry([...NAV_PAGES, ...SETTINGS_PAGES], location.pathname);
  const overflow = pins.slice(INLINE_AT_LG);

  return (
    <div className="hidden lg:flex items-center gap-1.5 min-w-0" aria-label="Pinned pages">
      {pins.map((entry, i) => {
        const isActive = active?.id === entry.id;
        return (
          <NavLink
            key={entry.id}
            to={entry.path}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              chipBase,
              i >= INLINE_AT_LG && 'hidden xl:inline-flex',
              isActive
                ? 'border-border bg-muted text-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <entry.icon size={14} strokeWidth={1.75} className={isActive ? 'text-[#FA634E]' : iconToneOnLight(entry)} />
            {entry.label}
          </NavLink>
        );
      })}

      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(chipBase, 'xl:hidden border-border bg-background text-muted-foreground hover:bg-muted')}>
              +{overflow.length} <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {overflow.map((entry) => (
              <DropdownMenuItem key={entry.id} asChild className="gap-2 text-[13px]">
                <NavLink to={entry.path}>
                  <entry.icon size={15} strokeWidth={1.75} className={iconToneOnLight(entry)} />
                  {entry.label}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Manage pinned pages"
            title="Manage pinned pages"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings2 size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="px-3 py-2.5 border-b">
            <p className="text-sm font-medium">Pinned pages</p>
            <p className="text-xs text-muted-foreground">
              Up to {MAX_PINS}. Pin more from the sidebar (hover a page) or Ctrl K.
            </p>
          </div>
          {pins.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">Nothing pinned yet.</p>
          ) : (
            <ul className="p-1.5 space-y-0.5">
              {pins.map((entry, i) => (
                <li key={entry.id} className="flex items-center gap-2 h-8 px-2 rounded-md hover:bg-muted/60">
                  <entry.icon size={15} strokeWidth={1.75} className={cn('shrink-0', iconToneOnLight(entry))} />
                  <span className="flex-1 text-[13px] truncate">{entry.label}</span>
                  <button
                    type="button"
                    onClick={() => navStore.movePin(entry.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${entry.label} up`}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navStore.movePin(entry.id, 1)}
                    disabled={i === pins.length - 1}
                    aria-label={`Move ${entry.label} down`}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navStore.togglePin(entry.id)}
                    aria-label={`Unpin ${entry.label}`}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <PinOff size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
