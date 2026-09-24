import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home, Truck, Users, Car, Building2,
  CreditCard, ReceiptText, Calculator, Files, FileBarChart,
  Settings, LogOut, Wrench, X, MapPin, TrendingUp, Trash2,
  CalendarRange, Wallet, SlidersHorizontal, ChevronsLeft, ChevronsRight,
  FolderArchive, Lock, ShieldCheck, GraduationCap, AlertTriangle,
  FolderTree, BookOpen, BookOpenText, Scale, BarChart3, Clock, Coins,
  ChevronDown, ChevronRight, PlusCircle, Sparkles, Layers, FileText
} from 'lucide-react';

import { authStore } from '@/store/authStore';
import { notificationService } from '@/services/notificationService';
import { settingsService } from '@/services/settingsService';
import type { ModuleKey } from '@mercon/shared-types';
import { usePermissions } from '@/hooks/usePermissions';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

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

interface SubRoute {
  label: string;
  path: string;
  icon?: any;
  permissionKey?: string;
  moduleKey?: ModuleKey;
  isAction?: boolean;
}

interface NavItem {
  icon: any;
  label: string;
  path: string;
  moduleKey?: ModuleKey;
  permissionKey?: string;
  end?: boolean;
  badge?: number;
  subRoutes?: SubRoute[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
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

  // Master Structure of Nav Groups & Sub-routes
  const rawNavGroups: NavGroup[] = [
    {
      label: 'MAIN',
      items: [
        {
          icon: Home,
          label: 'Dashboard',
          path: '/',
          moduleKey: 'dashboard',
          badge: unreadCount > 0 ? unreadCount : undefined,
          subRoutes: [
            { label: 'Overview', path: '/', icon: Home },
            { label: 'Notifications Center', path: '/notifications', icon: Clock },
          ],
        },
      ],
    },
    {
      label: 'OPERATIONS',
      items: [
        {
          icon: Truck,
          label: 'Trips & Dispatch',
          path: '/trips',
          moduleKey: 'trips',
          subRoutes: [
            { label: 'All Operations Trips', path: '/trips', icon: Truck },
            { label: 'Create New Trip', path: '/trips/new', icon: PlusCircle, isAction: true },
            { label: 'Monthly Agreement Trips', path: '/trips/monthly', icon: CalendarRange },
            { label: '3rd Party Fleet Services', path: '/third-party', icon: Building2, moduleKey: 'third-party' },
          ],
        },
        {
          icon: Car,
          label: 'Fleet & Drivers',
          path: '/vehicles',
          moduleKey: 'vehicles',
          subRoutes: [
            { label: 'Vehicle Registry', path: '/vehicles', icon: Car },
            { label: 'Add New Vehicle', path: '/vehicles/new', icon: PlusCircle, isAction: true },
            { label: 'Fleet Maintenance', path: '/maintenance', icon: Wrench, moduleKey: 'maintenance' },
            { label: 'Schedule Maintenance', path: '/maintenance/new', icon: PlusCircle, isAction: true, moduleKey: 'maintenance' },
            { label: 'Driver Roster', path: '/drivers', icon: Users, moduleKey: 'drivers' },
            { label: 'Add New Driver', path: '/drivers/new', icon: PlusCircle, isAction: true, moduleKey: 'drivers' },
            { label: 'Vehicle P&L Financials', path: '/vehicles/financials', icon: TrendingUp, permissionKey: 'fleet.financials' },
          ],
        },
        {
          icon: Building2,
          label: 'Customers & Quotes',
          path: '/customers',
          moduleKey: 'customers',
          subRoutes: [
            { label: 'Customer Directory', path: '/customers', icon: Building2 },
            { label: 'Add New Customer', path: '/customers/new', icon: PlusCircle, isAction: true },
            { label: 'Commercial Quotations', path: '/quotations', icon: Calculator, moduleKey: 'quotations', permissionKey: 'quotations.view' },
            { label: 'New Commercial Quote', path: '/quotations/new', icon: PlusCircle, isAction: true, moduleKey: 'quotations' },
            { label: 'AI Agreement Import', path: '/quotations/import', icon: Sparkles, moduleKey: 'quotations' },
          ],
        },
      ],
    },
    {
      label: 'FINANCE',
      items: [
        {
          icon: Calculator,
          label: 'Sales & Revenue',
          path: '/finance/invoices',
          moduleKey: 'finance',
          subRoutes: [
            { label: 'Commercial Quotations', path: '/quotations', icon: Calculator, moduleKey: 'quotations', permissionKey: 'quotations.view' },
            { label: 'Invoices Ledger', path: '/finance/invoices', icon: ReceiptText, moduleKey: 'finance' },
            { label: 'Create New Invoice', path: '/finance/invoices/new', icon: PlusCircle, isAction: true, moduleKey: 'finance' },
            { label: 'AR Accounts Receivable', path: '/finance/ar-ageing', icon: Clock, moduleKey: 'finance' },
          ],
        },
        {
          icon: CreditCard,
          label: 'Purchases & Bills',
          path: '/finance/bills',
          moduleKey: 'finance',
          subRoutes: [
            { label: 'Vendor Bills Ledger', path: '/finance/bills', icon: CreditCard, moduleKey: 'finance' },
            { label: 'Create Vendor Bill', path: '/finance/bills/new', icon: PlusCircle, isAction: true, moduleKey: 'finance' },
            { label: 'Operating Expenses', path: '/expenses', icon: Wallet, moduleKey: 'expenses', permissionKey: 'reports.view' },
            { label: 'AP Accounts Payable', path: '/finance/ap-ageing', icon: Clock, moduleKey: 'finance' },
          ],
        },
        {
          icon: Building2,
          label: 'Banking & Cash',
          path: '/finance/bank-accounts',
          moduleKey: 'finance',
          subRoutes: [
            { label: 'Bank Accounts', path: '/finance/bank-accounts', icon: Building2, moduleKey: 'finance' },
            { label: 'Add Bank Account', path: '/finance/bank-accounts/new', icon: PlusCircle, isAction: true, moduleKey: 'finance' },
            { label: 'Bank Reconciliation', path: '/finance/reconciliation', icon: Scale, moduleKey: 'finance' },
            { label: 'Driver & Staff Advances', path: '/finance/advances', icon: Wallet, moduleKey: 'finance' },
            { label: 'Issue New Advance', path: '/finance/advances/new', icon: PlusCircle, isAction: true, moduleKey: 'finance' },
          ],
        },
        {
          icon: BookOpen,
          label: 'General Accounting',
          path: '/finance/general-ledger',
          moduleKey: 'finance',
          subRoutes: [
            { label: 'General Ledger', path: '/finance/general-ledger', icon: BookOpenText, moduleKey: 'finance' },
            { label: 'Journal Entries', path: '/finance/journal-entries', icon: BookOpen, moduleKey: 'finance' },
            { label: 'Create Journal Entry', path: '/finance/journal-entries/new', icon: PlusCircle, isAction: true, moduleKey: 'finance' },
            { label: 'Chart of Accounts', path: '/finance/chart-of-accounts', icon: FolderTree, moduleKey: 'finance' },
            { label: 'Accounting Periods', path: '/finance/periods', icon: CalendarRange, moduleKey: 'finance' },
          ],
        },
        {
          icon: BarChart3,
          label: 'Financial Statements',
          path: '/finance/profit-and-loss',
          moduleKey: 'finance',
          subRoutes: [
            { label: 'Profit & Loss Statement', path: '/finance/profit-and-loss', icon: BarChart3, moduleKey: 'finance' },
            { label: 'Balance Sheet', path: '/finance/balance-sheet', icon: FileBarChart, moduleKey: 'finance' },
            { label: 'Trial Balance', path: '/finance/trial-balance', icon: Scale, moduleKey: 'finance' },
            { label: 'Cash Flow Statement', path: '/finance/cash-flow', icon: Coins, moduleKey: 'finance' },
            { label: 'Vehicle P&L Financials', path: '/vehicles/financials', icon: TrendingUp, moduleKey: 'vehicles', permissionKey: 'fleet.financials' },
          ],
        },
      ],
    },
    {
      label: 'COMPLIANCE & REPORTS',
      items: [
        {
          icon: FileBarChart,
          label: 'Reports & Analytics',
          path: '/company-reports',
          moduleKey: 'company-reports',
          permissionKey: 'reports.view',
          subRoutes: [
            { label: 'Company Reports', path: '/company-reports', icon: FileBarChart, moduleKey: 'company-reports', permissionKey: 'reports.view' },
            { label: 'Report Builder Landing', path: '/report-builder', icon: SlidersHorizontal, moduleKey: 'report-builder', permissionKey: 'reports.view' },
            { label: 'Quick Report Generator', path: '/report-builder/quick', icon: Sparkles, moduleKey: 'report-builder', permissionKey: 'reports.view' },
            { label: 'Advanced Report Builder', path: '/report-builder/advanced', icon: Layers, moduleKey: 'report-builder', permissionKey: 'reports.view' },
          ],
        },
        {
          icon: Files,
          label: 'Documents & Academy',
          path: '/documents',
          moduleKey: 'documents',
          subRoutes: [
            { label: 'Documents Vault', path: '/documents', icon: Files, moduleKey: 'documents' },
            { label: 'Learning & Academy', path: '/learning', icon: GraduationCap, moduleKey: 'learning' },
          ],
        },
      ],
    },
    {
      label: 'MASTER DATA',
      items: [
        {
          icon: MapPin,
          label: 'Locations & Taxonomy',
          path: '/locations',
          moduleKey: 'locations',
          permissionKey: 'settings.view',
          subRoutes: [
            { label: 'Locations Master', path: '/locations', icon: MapPin, moduleKey: 'locations', permissionKey: 'settings.view' },
            { label: 'Add New Location', path: '/locations/create', icon: PlusCircle, isAction: true, moduleKey: 'locations', permissionKey: 'settings.view' },
            { label: 'Taxonomy & Universal Colors', path: '/taxonomy', icon: SlidersHorizontal, moduleKey: 'taxonomy', permissionKey: 'settings.view' },
          ],
        },
      ],
    },
    {
      label: 'ACCOUNT & SYSTEM',
      items: [
        {
          icon: Settings,
          label: 'Settings & Admin',
          path: '/settings',
          subRoutes: [
            { label: 'System Settings', path: '/settings', icon: Settings },
            { label: 'Recycle Bin', path: '/settings/recycle-bin', icon: Trash2, moduleKey: 'recycle-bin' },
            ...(isSuperAdmin ? [{ label: 'Module Governance', path: '/settings/module-governance', icon: SlidersHorizontal, permissionKey: 'settings.deployment' }] : []),
            ...(isSuperAdmin ? [{ label: 'Audit Trail Log', path: '/settings/audit-log', icon: ShieldCheck }] : []),
            ...(can('users.view') ? [{ label: 'User Management', path: '/settings/users', icon: Users, permissionKey: 'users.view' }] : []),
            ...(userRole === 'Admin' || isSuperAdmin ? [{ label: 'Error Console', path: '/settings/error-console', icon: AlertTriangle }] : []),
            { label: 'Aprodac Vault', path: '/aprodac-documents', icon: FolderArchive, moduleKey: 'aprodac-documents' },
          ],
        },
      ],
    },
  ];

  const isItemPermitted = (item: NavItem) => {
    if (item.permissionKey && !can(item.permissionKey)) return false;
    return true;
  };

  const checkIsDisabled = (item: NavItem) => {
    return item.moduleKey && !isSuperAdmin && enabledModules && Array.isArray(enabledModules) && !enabledModules.includes(item.moduleKey);
  };

  const hiddenSet = new Set(hiddenModules || []);

  // Filter groups according to permissions and module governance
  const processedNavGroups = rawNavGroups.map(group => {
    const validItems = group.items.filter(item => {
      if (!isItemPermitted(item)) return false;
      if (checkIsDisabled(item)) {
        if (item.moduleKey && hiddenSet.has(item.moduleKey)) return false;
      }
      return true;
    });

    return {
      label: group.label,
      items: validItems,
    };
  }).filter(group => group.items.length > 0);

  // Render a single NavItem with its HoverCard sub-route flyout
  const renderNavItem = (item: NavItem) => {
    const isActive = isItemActive(item.path, item.end) || (item.subRoutes?.some(sr => location.pathname === sr.path) ?? false);
    const isDisabledModule = item.moduleKey && !isSuperAdmin && enabledModules && Array.isArray(enabledModules) && !enabledModules.includes(item.moduleKey);

    const validSubRoutes = (item.subRoutes || []).filter(sr => {
      if (sr.permissionKey && !can(sr.permissionKey)) return false;
      if (sr.moduleKey && !isSuperAdmin && enabledModules && Array.isArray(enabledModules) && !enabledModules.includes(sr.moduleKey)) return false;
      return true;
    });

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
            <span className="text-xs truncate">{item.label}</span>
            <Lock size={13} className="text-amber-400/90 shrink-0 ml-1.5" />
          </div>
          {collapsed && (
            <Lock size={12} className="hidden lg:block absolute top-1.5 right-1.5 text-amber-400/90" />
          )}
        </div>
      );
    }

    const triggerElement = (
      <NavLink
        to={item.path}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group relative overflow-hidden select-none
          ${isActive
            ? 'bg-[#FA634E] text-white font-bold shadow-md shadow-[#FA634E]/25'
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
          <span className="text-xs truncate">{item.label}</span>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {item.badge !== undefined && item.badge > 0 && !isActive && (
              <span className="w-4 h-4 rounded-full bg-[#FA634E] text-white text-[9px] font-bold flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
            {validSubRoutes.length > 0 && (
              <ChevronRight size={13} className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
            )}
          </div>
        </div>
        {collapsed && item.badge !== undefined && item.badge > 0 && !isActive && (
          <span aria-hidden="true" className="hidden lg:block absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#FA634E]" />
        )}
      </NavLink>
    );

    // If there are no sub-routes, return standard nav link
    if (validSubRoutes.length === 0) {
      return <div key={item.label}>{triggerElement}</div>;
    }

    // Wrap item in shadcn HoverCard for flyout sub-routes
    return (
      <HoverCard key={item.label} openDelay={80} closeDelay={150}>
        <HoverCardTrigger asChild>
          {triggerElement}
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={12}
          className="w-64 p-0 bg-white text-[#3E3C3D] border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl rounded-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Flyout Card Header */}
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#FA634E]/10 text-[#FA634E]">
                <item.icon size={15} />
              </span>
              <span className="text-xs font-bold text-[#3E3C3D] tracking-wide truncate max-w-[150px]">
                {item.label}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-slate-200/60 text-[10px] font-extrabold text-slate-600">
              {validSubRoutes.length} pages
            </span>
          </div>

          {/* Flyout Card Sub-Routes List */}
          <div className="p-1.5 space-y-0.5 max-h-[320px] overflow-y-auto sidebar-scrollbar bg-white">
            {validSubRoutes.map((sr) => {
              const isSubActive = location.pathname === sr.path;
              const SubIcon = sr.icon || ChevronRight;

              return (
                <NavLink
                  key={sr.path + sr.label}
                  to={sr.path}
                  onClick={onClose}
                  className={`
                    flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-150 group/sr
                    ${isSubActive
                      ? 'bg-[#FA634E] text-white font-bold shadow-sm shadow-[#FA634E]/30'
                      : sr.isAction
                        ? 'bg-[#FA634E]/5 text-[#FA634E] hover:bg-[#FA634E] hover:text-white font-semibold border border-[#FA634E]/20'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }
                  `}
                >
                  <SubIcon
                    size={14}
                    className={`shrink-0 transition-transform group-hover/sr:scale-110 ${
                      isSubActive
                        ? 'text-white'
                        : sr.isAction
                          ? 'text-[#FA634E] group-hover/sr:text-white'
                          : 'text-slate-400 group-hover/sr:text-[#FA634E]'
                    }`}
                  />
                  <span className="flex-1 truncate">{sr.label}</span>
                  {sr.isAction && (
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase shrink-0 transition-colors ${
                      isSubActive
                        ? 'bg-white text-[#FA634E]'
                        : 'bg-[#FA634E] text-white group-hover/sr:bg-white group-hover/sr:text-[#FA634E]'
                    }`}>
                      NEW
                    </span>
                  )}
                  {isSubActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  )}
                </NavLink>
              );
            })}
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

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
        <div className="flex-1 py-3 space-y-4 overflow-y-auto overflow-x-hidden px-3 sidebar-scrollbar">
          {processedNavGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {group.label !== 'MAIN' && (
                <p
                  className={`
                    text-[10px] font-bold text-[#EEF1F6]/50 uppercase tracking-widest px-3 flex items-center gap-1.5 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                    ${collapsed ? 'lg:max-w-0 lg:opacity-0 lg:h-0 lg:mb-0' : 'lg:max-w-full lg:opacity-100 lg:h-4 lg:mb-1'}
                  `}
                >
                  <span className="w-1 h-1 rounded-full bg-[#FA634E] shrink-0" />
                  <span>{group.label}</span>
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => renderNavItem(item))}
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
