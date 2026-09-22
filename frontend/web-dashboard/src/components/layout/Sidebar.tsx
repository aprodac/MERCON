import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home, Bell, Truck, Users, Car, Building2,
  CreditCard, ReceiptText, Calculator, Files, FileBarChart,
  Settings, User, LogOut, Wrench, X, MapPin, TrendingUp, Trash2,
  CalendarRange, Wallet, SlidersHorizontal, ChevronsLeft, ChevronsRight, FolderArchive, Lock, ShieldCheck, GraduationCap, AlertTriangle, FolderTree, BookOpen, Scale, BarChart3
} from 'lucide-react';

import { authStore } from '@/store/authStore';
import { notificationService } from '@/services/notificationService';

import { settingsService } from '@/services/settingsService';
import type { ModuleKey } from '@mercon/shared-types';
import { usePermissions } from '@/hooks/usePermissions';

interface SidebarProps {
  active?: string;
  /** Mobile drawer open state — ignored at lg and above, where the sidebar is always visible */
  open?: boolean;
  onClose?: () => void;
  /**
   * Desktop-only rail mode — collapses to an icon strip at lg and above. Mobile drawer is
   * unaffected. Toggled from the handle on the sidebar's own right edge.
   */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ active, open = false, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authStore.getUser();
  const { can, isSuperAdmin, userRole } = usePermissions();
  const isAdmin = userRole === 'Admin';
  const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ME';

  const isItemActive = (itemPath: string, itemEnd?: boolean) => {
    const currentPath = location.pathname;
    if (itemPath === '/vehicles') {
      return currentPath.startsWith('/vehicles') && !currentPath.includes('/financials');
    }
    if (itemPath === '/vehicles/financials') {
      return currentPath.includes('/financials');
    }
    if (itemPath === '/trips') {
      return currentPath === '/trips' || (currentPath.startsWith('/trips/') && !currentPath.startsWith('/trips/monthly'));
    }
    if (itemEnd || itemPath === '/') {
      return currentPath === itemPath;
    }
    return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
  };

  /** MERCON Coral Red (#FA634E) Active Accent */
  const getActiveAccent = () => {
    return {
      from: '#FA634E',
      to: '#DF4834',
      shadow: 'rgba(250, 99, 78, 0.35)',
      border: '#FA634E',
    };
  };

  const handleLogout = () => {
    authStore.clearSession();
    navigate('/login');
  };

  const { data: notificationsRes } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationService.getAll,
    refetchInterval: 60000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 60000,
  });

  const unreadCount = notificationsRes?.data?.filter((n: any) => !n.is_read).length || 0;
  const enabledModules = settings?.enabledModules;
  const hiddenModules = settings?.hiddenModules;

  interface NavItem {
    icon: any;
    label: string;
    path: string;
    moduleKey?: ModuleKey;
    permissionKey?: string;
    end?: boolean;
    badge?: number;
  }

  const rawGroups: { label: string; items: NavItem[] }[] = [
    {
      label: '',
      items: [
        { icon: Home, label: 'Dashboard', path: '/', moduleKey: 'dashboard' },
      ],
    },
    {
      label: 'FINANCE',
      items: [
        { icon: Calculator, label: 'Quotations', path: '/quotations', moduleKey: 'quotations', permissionKey: 'quotations.view' },
        { icon: Wallet, label: 'Expenses', path: '/expenses', moduleKey: 'expenses', permissionKey: 'reports.view' },
        { icon: FolderTree, label: 'Chart of Accounts', path: '/finance/chart-of-accounts', moduleKey: 'finance' },
        { icon: CalendarRange, label: 'Accounting Periods', path: '/finance/periods', moduleKey: 'finance' },
        { icon: BookOpen, label: 'Journal Entries', path: '/finance/journal-entries', moduleKey: 'finance' },
        { icon: ReceiptText, label: 'Invoices', path: '/finance/invoices', moduleKey: 'finance' },
        { icon: CreditCard, label: 'Bills', path: '/finance/bills', moduleKey: 'finance' },
        { icon: Building2, label: 'Bank Accounts', path: '/finance/bank-accounts', moduleKey: 'finance' },
        { icon: Wallet, label: 'Advances', path: '/finance/advances', moduleKey: 'finance' },
        { icon: Scale, label: 'Reconciliation', path: '/finance/reconciliation', moduleKey: 'finance' },
        { icon: Scale, label: 'Trial Balance', path: '/finance/trial-balance', moduleKey: 'finance' },
        { icon: BarChart3, label: 'Profit & Loss', path: '/finance/profit-and-loss', moduleKey: 'finance' },
        { icon: FileBarChart, label: 'Balance Sheet', path: '/finance/balance-sheet', moduleKey: 'finance' },
        { icon: TrendingUp, label: 'Vehicle P&L', path: '/vehicles/financials', moduleKey: 'vehicles', permissionKey: 'fleet.financials' },
      ],
    },
    {
      label: 'COMPLIANCE & REPORTS',
      items: [
        { icon: GraduationCap, label: 'Learning', path: '/learning', moduleKey: 'learning' },
        { icon: Files, label: 'Documents', path: '/documents', moduleKey: 'documents' },
        { icon: FileBarChart, label: 'Company Reports', path: '/company-reports', moduleKey: 'company-reports', permissionKey: 'reports.view' },
        { icon: SlidersHorizontal, label: 'Report Builder', path: '/report-builder', moduleKey: 'report-builder', permissionKey: 'reports.view' },
      ],
    },
    {
      label: 'MASTER DATA',
      items: [
        { icon: MapPin, label: 'Locations', path: '/locations', moduleKey: 'locations', permissionKey: 'settings.view' },
        { icon: SlidersHorizontal, label: 'Taxonomy & Colors', path: '/taxonomy', moduleKey: 'taxonomy', permissionKey: 'settings.view' },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        { icon: Settings, label: 'Settings', path: '/settings', end: true },
        { icon: Trash2, label: 'Recycle Bin', path: '/settings/recycle-bin', moduleKey: 'recycle-bin' },
        ...(isSuperAdmin ? [{ icon: SlidersHorizontal, label: 'Module Governance', path: '/settings/module-governance', permissionKey: 'settings.deployment' }] : []),
        ...(isSuperAdmin ? [{ icon: ShieldCheck, label: 'Audit Log', path: '/settings/audit-log' }] : []),
        ...(can('users.view') ? [{ icon: Users, label: 'User Management', path: '/settings/users', permissionKey: 'users.view' }] : []),
        ...(userRole === 'Admin' || isSuperAdmin ? [{ icon: AlertTriangle, label: 'Error Console', path: '/settings/error-console' }] : []),
        { icon: FolderArchive, label: 'Aprodac Vault', path: '/aprodac-documents', moduleKey: 'aprodac-documents' },
      ],
    },
  ];


  const checkIsDisabled = (item: NavItem) => {
    return item.moduleKey && !isSuperAdmin && enabledModules && Array.isArray(enabledModules) && !enabledModules.includes(item.moduleKey);
  };

  const processedGroups: { label: string; items: NavItem[] }[] = [];
  const comingSoonItems: NavItem[] = [];
  const hiddenSet = new Set(hiddenModules || []);

  rawGroups.forEach((g) => {
    const enabledItems: NavItem[] = [];
    g.items.forEach((item) => {
      if (checkIsDisabled(item)) {
        if (item.moduleKey && hiddenSet.has(item.moduleKey)) return; // fully hidden
        comingSoonItems.push(item);
      } else {
        enabledItems.push(item);
      }
    });
    if (enabledItems.length > 0) {
      processedGroups.push({
        label: g.label,
        items: enabledItems,
      });
    }
  });

  if (comingSoonItems.length > 0) {
    processedGroups.push({
      label: 'COMING SOON',
      items: comingSoonItems,
    });
  }

  const groups = processedGroups;

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
        className={`
          flex flex-col w-[260px] sm:w-[280px] shrink-0 h-[100dvh] lg:h-full
          bg-[#3E3C3D] text-[#EEF1F6] border-r border-white/10 shadow-[6px_0_24px_rgba(0,0,0,0.18)]
          fixed inset-y-0 left-0 z-50 lg:relative lg:z-30
          transform transition-[transform,width,background-color] duration-300 ease-in-out lg:transform-none
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'lg:w-[76px]' : 'lg:w-[230px]'}
        `}
      >
        {/* Header with Logo — Mobile-App Inspired Angled Parallelogram Transition (#EEF1F6 to #3E3C3D) */}
        <div className={`relative flex items-center justify-start shrink-0 h-[84px] lg:h-[92px] px-2 sm:px-3 overflow-hidden bg-[#EEF1F6] ${collapsed ? 'lg:px-1.5' : ''}`}>
          {/* Angled Parallelogram & Dot Matrix SVG Background (Mobile Driver App aesthetic) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 280 92"
            preserveAspectRatio="none"
            fill="none"
          >
            {/* 1. Base Light Cool Gray background */}
            <rect width="280" height="92" fill="#EEF1F6" />

            {/* 2. Dark Charcoal (#3E3C3D) Angled Parallelogram polygon joining the body below */}
            <path d="M -10 92 H 290 V 42 L -10 82 Z" fill="#3E3C3D" />

            {/* 3. Subtle Coral Red (#FA634E) Angled Accent Stripe */}
            <path d="M -10 82 L 290 42" stroke="#FA634E" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />

            {/* 4. Subtle Dotted Pattern on Charcoal area */}
            <g opacity="0.16">
              {[20, 45, 70, 95, 120, 145, 170, 195, 220, 245, 270].map((xVal) => (
                <circle key={xVal} cx={xVal} cy="86" r="1.5" fill="#FFFFFF" />
              ))}
              {[35, 60, 85, 110, 135, 160, 185, 210, 235, 260].map((xVal) => (
                <circle key={xVal} cx={xVal} cy="76" r="1.5" fill="#FFFFFF" />
              ))}
            </g>
          </svg>

          {/* Logo Content - merconclosed.png stuck to Top-Left, expands when unshrinked */}
          <div className="relative z-10 flex items-center justify-start w-full pb-3 pl-0">
            <img
              src="/merconclosed.png"
              alt="MERCON Logo"
              className={`w-auto object-contain object-left drop-shadow-xs -ml-0.5 transition-all duration-200 ease-in-out ${
                collapsed ? 'h-8.5 max-w-[46px]' : 'h-11 sm:h-12 max-w-[72px]'
              }`}
            />
          </div>

          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="absolute right-3 top-3.5 z-20 p-2 rounded-lg text-slate-600 hover:text-[#FA634E] hover:bg-black/5 transition-colors lg:hidden cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Desktop Rail Toggle Button (Collapse / Expand) */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (⌘B)`}
          className="
            group hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-30
            w-7 h-7 items-center justify-center rounded-full
            bg-[#FA634E] text-white border-2 border-[#3E3C3D] shadow-lg shadow-[#FA634E]/40
            hover:bg-white hover:text-[#FA634E] hover:scale-110
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FA634E]
            transition-all duration-150 cursor-pointer
          "
        >
          {collapsed ? (
            <ChevronsRight size={15} className="stroke-[2.8] transition-transform duration-150 group-hover:translate-x-px" />
          ) : (
            <ChevronsLeft size={15} className="stroke-[2.8] transition-transform duration-150 group-hover:-translate-x-px" />
          )}
        </button>

        {/* Nav groups */}
        <div className="flex-1 py-4 space-y-4 overflow-y-auto overflow-x-hidden px-3 sidebar-scrollbar">
          {groups.map((g, idx) => (
            <div key={g.label || `group-${idx}`}>
              {g.label ? (
                <p
                  className={`
                    text-[10px] font-bold text-[#EEF1F6]/50 uppercase tracking-widest px-3 flex items-center gap-1.5 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                    ${collapsed ? 'lg:max-w-0 lg:opacity-0 lg:h-0 lg:mb-0' : 'lg:max-w-full lg:opacity-100 lg:h-4 lg:mb-1.5'}
                  `}
                >
                  <span className="w-1 h-1 rounded-full bg-[#FA634E] shrink-0" />
                  <span>{g.label}</span>
                </p>
              ) : null}
              <div className="space-y-1">
                {g.items.map((item: any) => {
                  const isActive = isItemActive(item.path, item.end);
                  const isDisabledModule = item.moduleKey && !isSuperAdmin && enabledModules && Array.isArray(enabledModules) && !enabledModules.includes(item.moduleKey);

                  if (isDisabledModule) {
                    return (
                      <div
                        key={item.label}
                        title={collapsed ? `${item.label} — Locked` : `${item.label} (Locked)`}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-45 cursor-not-allowed select-none transition-colors duration-200 relative overflow-hidden text-[#EEF1F6]/50 bg-white/5 font-medium"
                      >
                        <span className="w-5 h-5 flex items-center justify-center shrink-0">
                          <item.icon size={17} className="stroke-[1.8] text-[#EEF1F6]/40" />
                        </span>
                        <div
                          className={`
                            flex items-center justify-between flex-1 min-w-0 transition-[opacity,max-width] duration-300 ease-in-out overflow-hidden whitespace-nowrap
                            ${collapsed ? 'lg:max-w-0 lg:opacity-0 lg:pointer-events-none' : 'lg:max-w-[180px] lg:opacity-100'}
                          `}
                        >
                          <span className="text-xs truncate">
                            {item.label}
                          </span>
                          <Lock size={13} className="text-amber-400/90 shrink-0 ml-1.5" />
                        </div>
                        {collapsed && (
                          <Lock size={12} className="hidden lg:block absolute top-1.5 right-1.5 text-amber-400/90" />
                        )}
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={item.label}
                      to={item.path}
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-200 group relative overflow-hidden
                        ${isActive
                          ? 'bg-[#FA634E] text-white font-bold shadow-2xs'
                          : 'text-[#EEF1F6]/75 hover:bg-white/10 hover:text-white font-medium'
                        }
                      `}
                    >
                      <span className="w-5 h-5 flex items-center justify-center shrink-0">
                        <item.icon
                          size={17}
                          className={`transition-colors duration-150 ${
                            isActive ? 'stroke-[2.4] text-white' : 'stroke-[2] text-[#EEF1F6]/60 group-hover:text-white'
                          }`}
                        />
                      </span>
                      <div
                        className={`
                          flex items-center justify-between flex-1 min-w-0 transition-[opacity,max-width] duration-300 ease-in-out overflow-hidden whitespace-nowrap
                          ${collapsed ? 'lg:max-w-0 lg:opacity-0 lg:pointer-events-none' : 'lg:max-w-[180px] lg:opacity-100'}
                        `}
                      >
                        <span className="text-xs truncate">
                          {item.label}
                        </span>
                        {item.badge !== undefined && item.badge > 0 && !isActive && (
                          <span className="w-4 h-4 rounded-full bg-[#FA634E] text-white text-[9px] font-bold flex items-center justify-center shrink-0 ml-1.5">
                            {item.badge > 9 ? '9+' : item.badge}
                          </span>
                        )}
                      </div>
                      {collapsed && item.badge !== undefined && item.badge > 0 && !isActive && (
                        <span aria-hidden="true" className="hidden lg:block absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#FA634E]" />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User profile footer */}
        <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2.5 bg-[#2D2B2C] shrink-0 overflow-hidden">
          <div
            title={collapsed ? user?.name || (isAdmin ? 'Admin User' : 'Mohammed Al-Harbi') : undefined}
            className="w-9 h-9 rounded-xl bg-[#FA634E] text-white flex items-center justify-center text-xs font-black shrink-0 border-2 border-white/20 shadow-md shadow-[#FA634E]/20 select-none"
          >
            {initials}
          </div>
          <div
            className={`
              flex-1 min-w-0 transition-[opacity,max-width] duration-300 ease-in-out overflow-hidden whitespace-nowrap
              ${collapsed ? 'lg:max-w-0 lg:opacity-0 lg:pointer-events-none' : 'lg:max-w-[160px] lg:opacity-100'}
            `}
          >
            <p className="text-xs font-black text-white truncate">{user?.name || (isAdmin ? 'Admin User' : 'Mohammed Al-Harbi')}</p>
            <p className="text-[10px] font-medium text-[#EEF1F6]/60 truncate">{user?.email || (isAdmin ? 'admin@mercon.sa' : 'operator@mercon.sa')}</p>
          </div>
          <button
            onClick={handleLogout}
            className={`
              text-[#EEF1F6]/60 hover:text-[#FA634E] p-2 rounded-xl hover:bg-[#FA634E]/15 transition-all duration-300 shrink-0 cursor-pointer
              ${collapsed ? 'lg:hidden' : ''}
            `}
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
