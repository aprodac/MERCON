import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronsLeft, ChevronsRight, Keyboard, Lock, LogOut, Moon, Pin, PinOff, Plus, Search,
  Settings, Sun, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { authStore } from '@/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavAccess } from '@/hooks/useNavAccess';
import {
  FINANCE_GROUPS, NAV_ACTIONS, NAV_ACTION_SECTIONS, NAV_PAGES, NAV_SECTIONS, SECTION_TONES, SETTINGS_PAGES,
  findActiveEntry, isSettingsArea, type FinanceGroupId, type NavAccessState, type NavPage,
} from '@/config/navigation';
import {
  navStore, openCommandPalette, openShortcutsGuide, usePinnedIds, useSidebarTheme, type SidebarTheme,
} from '@/lib/navigation/navStore';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface SidebarProps {
  active?: string;
  /** Mobile drawer open state — ignored at lg and above, where the sidebar is always visible */
  open?: boolean;
  onClose?: () => void;
  /** Desktop-only rail mode — collapses to an icon strip at lg and above. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const OPEN_GROUPS_KEY = 'mercon_nav_open_finance_groups';

function readOpenGroups(): Partial<Record<FinanceGroupId, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) || '{}');
  } catch {
    return {};
  }
}

// Visual tokens per sidebar theme. Charcoal is the brand default; Light follows the app's shadcn tokens
// (so it also darkens correctly in dark mode). Section tone colours pick the matching on-dark / on-light shade.
const SIDEBAR_THEMES = {
  charcoal: {
    aside: 'bg-[#3E3C3D] text-[#EEF1F6] border-white/[0.06]',
    headerBg: '#EEF1F6',
    wedge: '#3E3C3D',
    ring: 'focus-visible:ring-white/30',
    rowIdle: 'text-white/65 hover:bg-white/[0.06] hover:text-white',
    rowActive: 'bg-white/[0.10] text-white',
    hoverBg: 'hover:bg-white/[0.06]',
    label: 'text-white/40',
    icon: 'text-white/45 group-hover/row:text-white/80',
    railIcon: 'text-white/55',
    lockedText: 'text-white/30',
    lockedIcon: 'text-white/25',
    pinBtn: 'text-white/40 hover:text-white hover:bg-white/10',
    divider: 'border-white/[0.06]',
    guide: 'border-white/10',
    chevron: 'text-white/35',
    groupIdle: 'text-white/65 hover:text-white',
    groupActive: 'text-white',
    search: 'bg-white/[0.06] text-white/55 hover:bg-white/[0.10] hover:text-white/80',
    kbd: 'text-white/40 border-white/15',
    newBtn: 'bg-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white',
    flyout: 'border-white/10 bg-[#2D2B2C] text-white',
    name: 'text-white',
    role: 'text-white/45',
    handleBorder: 'border-[#3E3C3D]',
    scrollbar: 'sidebar-scrollbar',
  },
  light: {
    aside: 'bg-[#EEF1F6] text-foreground border-black/[0.06] dark:bg-card dark:border-border',
    headerBg: '#FFFFFF',
    wedge: '#EEF1F6',
    ring: 'focus-visible:ring-ring',
    rowIdle: 'text-foreground/70 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-muted',
    rowActive: 'bg-white text-foreground shadow-xs dark:bg-muted',
    hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-muted',
    label: 'text-muted-foreground',
    icon: 'text-muted-foreground group-hover/row:text-foreground',
    railIcon: 'text-muted-foreground',
    lockedText: 'text-muted-foreground/50',
    lockedIcon: 'text-muted-foreground/40',
    pinBtn: 'text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-background',
    divider: 'border-black/[0.06] dark:border-border',
    guide: 'border-black/[0.08] dark:border-border',
    chevron: 'text-muted-foreground',
    groupIdle: 'text-foreground/70 hover:text-foreground',
    groupActive: 'text-foreground',
    search: 'bg-white text-muted-foreground hover:text-foreground border border-black/[0.06] dark:bg-background dark:border-border',
    kbd: 'text-muted-foreground border-border bg-[#EEF1F6] dark:bg-muted',
    newBtn: 'bg-white text-foreground border border-black/[0.06] hover:bg-white/70 dark:bg-background dark:border-border',
    flyout: 'border-border bg-popover text-popover-foreground',
    name: 'text-foreground',
    role: 'text-muted-foreground',
    handleBorder: 'border-[#EEF1F6] dark:border-background',
    scrollbar: 'sidebar-scrollbar-light',
  },
} as const;

const rowShape =
  'group/row relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium outline-none transition-colors focus-visible:ring-2';

export default function Sidebar({ open = false, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authStore.getUser();
  const { userRole, isSuperAdmin } = usePermissions();
  const access = useNavAccess();
  const pinnedIds = usePinnedIds();
  const sidebarTheme = useSidebarTheme();
  const S = SIDEBAR_THEMES[sidebarTheme];
  const rowBase = cn(rowShape, S.ring);
  const rowIdle = S.rowIdle;
  const rowActive = S.rowActive;
  /** Section-tinted icon class for the current theme (null section tone → neutral). */
  const toneIcon = (section: NavPage['section'], withHover = true) => {
    const tone = SECTION_TONES[section];
    if (!tone) return S.icon;
    if (sidebarTheme === 'light') return tone.iconOnLight;
    return withHover ? cn(tone.iconOnDark, tone.iconOnDarkHover) : tone.iconOnDark;
  };

  const displayName = user?.name || (userRole === 'Admin' ? 'Admin User' : 'User');
  const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const roleLabel = isSuperAdmin ? 'Super admin' : userRole || '';

  // Resolve access once per render for every page / action
  const pages = useMemo(
    () => NAV_PAGES.filter((p) => !p.hiddenInSidebar).map((p) => ({ page: p, state: access(p) })).filter((x) => x.state !== 'hidden'),
    [access],
  );
  const actions = useMemo(() => NAV_ACTIONS.filter((a) => access(a) === 'visible'), [access]);

  const activePage = findActiveEntry(NAV_PAGES, location.pathname);
  const inSettings = !activePage && isSettingsArea(location.pathname);
  const activeGroup = activePage?.section === 'finance' ? activePage.group : undefined;

  const [openGroups, setOpenGroups] = useState<Partial<Record<FinanceGroupId, boolean>>>(readOpenGroups);

  // The group holding the current page always opens
  useEffect(() => {
    if (activeGroup && !openGroups[activeGroup]) {
      setOpenGroups((prev) => ({ ...prev, [activeGroup]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups));
    } catch {
      // ignore
    }
  }, [openGroups]);

  const handleLogout = () => {
    authStore.clearSession();
    navigate('/login');
  };

  const settingsVisible = SETTINGS_PAGES.some((p) => access(p) === 'visible');

  // ── Rows ────────────────────────────────────────────────────────────
  const renderPageRow = (page: NavPage, state: NavAccessState, opts: { nested?: boolean } = {}) => {
    const Icon = page.icon;
    const isActive = activePage?.id === page.id;

    if (state === 'locked') {
      return (
        <div
          key={page.id}
          title={`${page.label} — module disabled`}
          aria-disabled="true"
          className={cn(rowBase, 'cursor-not-allowed', S.lockedText)}
        >
          <Icon size={16} strokeWidth={1.75} className={cn('shrink-0', S.lockedIcon)} />
          <span className="flex-1 truncate">{page.label}</span>
          <Lock size={12} className={cn('shrink-0', S.lockedText)} />
        </div>
      );
    }

    const pinned = pinnedIds.includes(page.id);
    return (
      <NavLink
        key={page.id}
        to={page.path}
        onClick={onClose}
        aria-current={isActive ? 'page' : undefined}
        className={cn(rowBase, isActive ? rowActive : rowIdle, opts.nested && 'h-7')}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          className={cn(
            'shrink-0 transition-colors',
            isActive ? 'text-[#FA634E]' : toneIcon(page.section),
          )}
        />
        <span className="flex-1 truncate">{page.label}</span>
        {(pinned || navStore.canPinMore()) && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navStore.togglePin(page.id);
            }}
            aria-label={pinned ? `Unpin ${page.label} from the top bar` : `Pin ${page.label} to the top bar`}
            title={pinned ? 'Unpin from top bar' : 'Pin to top bar'}
            className={cn(
              'hidden lg:flex items-center justify-center w-5 h-5 rounded shrink-0', S.pinBtn,
              'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity',
            )}
          >
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        )}
      </NavLink>
    );
  };

  /** Collapsed rail: one icon; hover shows the label or the group's pages. */
  const renderRailItem = (
    key: string,
    Icon: LucideIcon,
    label: string,
    isActive: boolean,
    items: { page: NavPage; state: NavAccessState }[],
    to?: string,
    toneClass: string = S.railIcon,
  ) => {
    const trigger = to ? (
      <NavLink
        to={to}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(rowBase, 'justify-center px-0 w-10 mx-auto', isActive ? rowActive : rowIdle)}
      >
        <Icon size={17} strokeWidth={1.75} className={isActive ? 'text-[#FA634E]' : toneClass} />
      </NavLink>
    ) : (
      <button
        type="button"
        aria-label={label}
        className={cn(rowBase, 'justify-center px-0 w-10 mx-auto', isActive ? rowActive : rowIdle)}
      >
        <Icon size={17} strokeWidth={1.75} className={isActive ? 'text-[#FA634E]' : toneClass} />
      </button>
    );

    return (
      <HoverCard key={key} openDelay={60} closeDelay={120}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={10}
          className={cn('w-52 p-1.5 rounded-lg shadow-xl', S.flyout)}
        >
          {items.length === 0 ? (
            <p className="px-2 py-1 text-[13px] font-medium">{label}</p>
          ) : (
            <>
              <p className={cn('px-2 pt-1 pb-1.5 text-[11px] font-medium', S.label)}>{label}</p>
              <div className="space-y-0.5">{items.map(({ page, state }) => renderPageRow(page, state, { nested: true }))}</div>
            </>
          )}
        </HoverCardContent>
      </HoverCard>
    );
  };

  // ── Quick actions (search + new) ───────────────────────────────────
  const newMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Create new"
          title="Create new"
          className={cn(
            'flex items-center justify-center gap-1.5 h-8 rounded-md text-[13px] font-medium outline-none focus-visible:ring-2 transition-colors',
            S.newBtn,
            S.ring,
            collapsed ? 'lg:w-10 lg:mx-auto px-2.5' : 'px-2.5',
          )}
        >
          <Plus size={15} strokeWidth={2} />
          <span className={cn(collapsed && 'lg:hidden')}>New</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'bottom'} align="start" className="w-56">
        {NAV_ACTION_SECTIONS.map((section) => {
          const items = actions.filter((a) => a.section === section.id);
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{section.label}</DropdownMenuLabel>
              {items.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onSelect={() => {
                    onClose?.();
                    navigate(a.path);
                  }}
                  className="gap-2 text-[13px]"
                >
                  <a.icon size={15} strokeWidth={1.75} className="text-muted-foreground" />
                  {a.label}
                  {a.shortcut && <DropdownMenuShortcut>{a.shortcut}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const searchButton = (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search or jump to (Ctrl+K)"
      title="Search or jump to (Ctrl+K)"
      className={cn(
        'flex items-center gap-2 h-8 rounded-md text-[13px] outline-none focus-visible:ring-2 transition-colors',
        S.search,
        S.ring,
        collapsed ? 'lg:w-10 lg:mx-auto lg:justify-center px-2.5 flex-1 lg:flex-none' : 'flex-1 px-2.5',
      )}
    >
      <Search size={15} strokeWidth={1.75} className="shrink-0" />
      <span className={cn('flex-1 text-left truncate', collapsed && 'lg:hidden')}>Search…</span>
      <kbd className={cn('text-[10px] font-medium border rounded px-1', S.kbd, collapsed && 'lg:hidden')}>
        Ctrl K
      </kbd>
    </button>
  );

  // ── Sections ───────────────────────────────────────────────────────
  const renderSections = (rail: boolean) =>
    NAV_SECTIONS.map((section) => {
      const sectionPages = pages.filter((x) => x.page.section === section.id);
      if (sectionPages.length === 0) return null;

      if (rail) {
        // Rail: plain sections list their pages; Finance shows one icon per sub-group.
        if (section.id === 'finance') {
          return (
            <div key={section.id} className={cn('space-y-1 pt-3 mt-3 border-t', S.divider)}>
              {FINANCE_GROUPS.map((g) => {
                const items = sectionPages.filter((x) => x.page.group === g.id);
                if (items.length === 0) return null;
                return renderRailItem(`g-${g.id}`, g.icon, g.label, activeGroup === g.id, items, undefined, toneIcon('finance', false));
              })}
            </div>
          );
        }
        return (
          <div key={section.id} className={cn('space-y-1', section.label && cn('pt-3 mt-3 border-t', S.divider))}>
            {sectionPages.map(({ page, state }) =>
              state === 'locked'
                ? <div key={page.id}>{renderPageRow(page, state)}</div>
                : renderRailItem(page.id, page.icon, page.label, activePage?.id === page.id, [], page.path, toneIcon(page.section, false)),
            )}
          </div>
        );
      }

      return (
        <div key={section.id} className={cn(section.label && 'mt-4')}>
          {section.label && (
            <p className={cn('px-2.5 mb-1 flex items-center gap-1.5 text-[11px] font-medium', S.label)}>
              {SECTION_TONES[section.id] && (
                <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', SECTION_TONES[section.id]!.dot)} />
              )}
              {section.label}
            </p>
          )}

          {section.id !== 'finance' ? (
            <div className="space-y-0.5">{sectionPages.map(({ page, state }) => renderPageRow(page, state))}</div>
          ) : (
            <div className="space-y-0.5">
              {FINANCE_GROUPS.map((g) => {
                const items = sectionPages.filter((x) => x.page.group === g.id);
                if (items.length === 0) return null;
                const isOpen = !!openGroups[g.id];
                const containsActive = activeGroup === g.id;
                return (
                  <div key={g.id}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [g.id]: !prev[g.id] }))}
                      aria-expanded={isOpen}
                      className={cn(
                        'w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium outline-none transition-colors',
                        'focus-visible:ring-2',
                        S.ring,
                        S.hoverBg,
                        containsActive && !isOpen ? S.groupActive : S.groupIdle,
                      )}
                    >
                      <g.icon
                        size={16}
                        strokeWidth={1.75}
                        className={cn('shrink-0', containsActive && !isOpen ? 'text-[#FA634E]' : toneIcon('finance', false))}
                      />
                      <span className="flex-1 text-left">{g.label}</span>
                      <ChevronRight size={14} className={cn('shrink-0 transition-transform duration-150', S.chevron, isOpen && 'rotate-90')} />
                    </button>
                    {isOpen && (
                      <div className={cn('ml-[17px] pl-2 border-l space-y-0.5 py-0.5', S.guide)}>
                        {items.map(({ page, state }) => renderPageRow(page, state, { nested: true }))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[3px] transition-opacity duration-200 lg:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          'flex flex-col w-[272px] shrink-0 h-[100dvh] lg:h-full border-r',
          S.aside,
          'fixed inset-y-0 left-0 z-50 lg:relative lg:z-30',
          'transform transition-[transform,width] duration-200 ease-in-out lg:transform-none',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-60',
        )}
      >
        {/* Brand header — keeps the MERCON angled mark, at a compact height */}
        <div className="relative flex items-center shrink-0 h-16 px-3 overflow-hidden" style={{ backgroundColor: S.headerBg }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 280 64" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <rect width="280" height="64" style={{ fill: S.headerBg }} />
            <path d="M -10 64 H 290 V 34 L -10 58 Z" style={{ fill: S.wedge }} />
            <path d="M -10 58 L 290 34" stroke="#FA634E" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
          </svg>
          <img
            src="/merconclosed.png"
            alt="MERCON"
            className={cn('relative z-10 w-auto object-contain object-left -mt-3', collapsed ? 'lg:h-7 h-9 max-w-[64px]' : 'h-9 max-w-[64px]')}
          />
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="absolute right-2 top-2 z-20 p-1.5 rounded-md text-[#3E3C3D]/70 hover:bg-black/5 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Rail toggle — round handle on the sidebar's right edge (Ctrl+B also works) */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
          className={cn(
            'group hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-30 w-7 h-7 items-center justify-center rounded-full',
            'bg-[#FA634E] text-white border-2 shadow-lg shadow-[#FA634E]/40',
            'hover:bg-white hover:text-[#FA634E] hover:scale-110 transition-all duration-150 cursor-pointer',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FA634E]',
            S.handleBorder,
          )}
        >
          {collapsed ? (
            <ChevronsRight size={15} className="stroke-[2.8] transition-transform duration-150 group-hover:translate-x-px" />
          ) : (
            <ChevronsLeft size={15} className="stroke-[2.8] transition-transform duration-150 group-hover:-translate-x-px" />
          )}
        </button>

        {/* Search + New */}
        <div className={cn('shrink-0 px-3 pt-3 pb-2 flex gap-1.5', collapsed && 'lg:flex-col lg:px-2')}>
          {searchButton}
          {newMenu}
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-3', S.scrollbar, collapsed ? 'px-3 lg:px-2' : 'px-3')}>
          {collapsed ? (
            <>
              {/* The mobile drawer is always the full list; the icon rail is desktop-only */}
              <div className="lg:hidden">{renderSections(false)}</div>
              <div className="hidden lg:block">{renderSections(true)}</div>
            </>
          ) : (
            renderSections(false)
          )}
        </nav>

        {/* Settings + user */}
        <div className={cn('shrink-0 border-t px-3 py-2 space-y-1', S.divider)}>
          {settingsVisible && (
            collapsed ? (
              <div className="hidden lg:block">
                {renderRailItem('settings', Settings, 'Settings', inSettings, [], '/settings')}
              </div>
            ) : null
          )}
          {settingsVisible && (
            <NavLink
              to="/settings"
              onClick={onClose}
              aria-current={inSettings ? 'page' : undefined}
              className={cn(rowBase, inSettings ? rowActive : rowIdle, collapsed && 'lg:hidden')}
            >
              <Settings size={16} strokeWidth={1.75} className={inSettings ? 'text-[#FA634E]' : S.icon} />
              <span className="flex-1">Settings</span>
            </NavLink>
          )}

          <div className={cn('flex items-center gap-1', collapsed && 'lg:flex-col')}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className={cn(
                    'flex items-center gap-2.5 min-w-0 flex-1 h-10 px-1.5 rounded-md text-left outline-none focus-visible:ring-2 transition-colors',
                    S.hoverBg,
                    S.ring,
                    collapsed && 'lg:flex-none lg:w-10 lg:justify-center lg:px-0',
                  )}
                >
                  <span className="w-7 h-7 rounded-md bg-[#FA634E] text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
                    {initials}
                  </span>
                  <span className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
                    <span className={cn('block text-[13px] font-medium truncate', S.name)}>{displayName}</span>
                    <span className={cn('block text-[11px] truncate', S.role)}>{roleLabel}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side={collapsed ? 'right' : 'top'} align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-medium truncate">{displayName}</span>
                  <span className="block text-xs text-muted-foreground truncate">{user?.email || roleLabel}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {settingsVisible && (
                  <DropdownMenuItem onSelect={() => navigate('/settings')} className="gap-2">
                    <Settings size={15} className="text-muted-foreground" /> Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Sidebar theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sidebarTheme} onValueChange={(v) => navStore.setSidebarTheme(v as SidebarTheme)}>
                  <DropdownMenuRadioItem value="charcoal" className="gap-2" onSelect={(e) => e.preventDefault()}>
                    <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full bg-[#3E3C3D] ring-1 ring-border" /> Charcoal
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light" className="gap-2" onSelect={(e) => e.preventDefault()}>
                    <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full bg-white ring-1 ring-border" /> Light
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={openShortcutsGuide} className="gap-2">
                  <Keyboard size={15} className="text-muted-foreground" /> Keyboard shortcuts
                  <DropdownMenuShortcut>?</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} className="gap-2">
                  <LogOut size={15} className="text-muted-foreground" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => navStore.setSidebarTheme(sidebarTheme === 'light' ? 'charcoal' : 'light')}
              aria-label={sidebarTheme === 'light' ? 'Switch sidebar to charcoal' : 'Switch sidebar to light'}
              title={sidebarTheme === 'light' ? 'Charcoal sidebar' : 'Light sidebar'}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-md shrink-0 outline-none focus-visible:ring-2 transition-colors',
                S.hoverBg,
                S.ring,
                S.icon,
              )}
            >
              {sidebarTheme === 'light' ? <Moon size={16} strokeWidth={1.75} /> : <Sun size={16} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
