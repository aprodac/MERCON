import type { LucideIcon } from 'lucide-react';
import {
  Home, Truck, CalendarRange, Calculator, Building2, Car, Users, Wrench, Handshake,
  ReceiptText, Clock, CreditCard, Wallet, Landmark, Scale, HandCoins, BookOpen, BookOpenText,
  FolderTree, CalendarCheck, BarChart3, FileBarChart, Coins, TrendingUp, FileSpreadsheet,
  SlidersHorizontal, Files, GraduationCap, Bell, Settings, Palette, UserCog, ShieldCheck,
  MapPin, Layers, Tags, FileType, Trash2, ScrollText, AlertTriangle, Activity, FolderArchive,
} from 'lucide-react';
import type { ModuleKey } from '@mercon/shared-types';

/**
 * Single source of truth for the app's navigation. The sidebar, the ⌘K palette, the "+ New" menu,
 * the pinned top-bar area and the Settings inner nav all read from here — so a page is declared once
 * and can't drift into duplicates. Access fields mirror the route guards in router.tsx.
 */

export interface NavAccessFields {
  /** Module governance key — disabled modules show locked (or disappear when hidden). */
  moduleKey?: ModuleKey;
  /** Permission from usePermissions().can(). */
  permissionKey?: string;
  /** Mirrors <RequireRole roles={['Admin']}>: Admin, or a super admin. */
  adminOnly?: boolean;
  /** Mirrors <RequireRole roles={['SuperAdmin']}> / super-admin-only entries. */
  superAdminOnly?: boolean;
}

export type NavSectionId = 'home' | 'operations' | 'fleet' | 'finance' | 'workspace';
export type FinanceGroupId = 'sales' | 'purchases' | 'banking' | 'accounting' | 'reports';
export type SettingsGroupId = 'general' | 'access' | 'master-data' | 'safety' | 'aprodac';

export interface NavPage extends NavAccessFields {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  section: NavSectionId;
  group?: FinanceGroupId;
  /** Extra search terms for the ⌘K palette. */
  keywords?: string[];
  /** Custom active matcher; default is exact path or path + '/…'. */
  match?: (pathname: string) => boolean;
  /** Reachable from ⌘K / pins but not listed in the sidebar. */
  hiddenInSidebar?: boolean;
}

export interface NavAction extends NavAccessFields {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  section: 'operations' | 'fleet' | 'finance' | 'settings';
  shortcut?: string;
}

export interface SettingsNavPage extends NavAccessFields {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  settingsGroup: SettingsGroupId;
  keywords?: string[];
  match?: (pathname: string) => boolean;
}

/**
 * Each section has one muted hue so pages are recognisable by colour everywhere (sidebar dots and icons,
 * collapsed rail, Ctrl K palette, pinned chips). `onDark` classes are for the charcoal sidebar; `onLight` for
 * light surfaces (with dark-mode pairs). The active page always overrides with the brand coral.
 */
export interface SectionTone {
  dot: string;
  iconOnDark: string;
  iconOnDarkHover: string;
  iconOnLight: string;
}

export const SECTION_TONES: Record<NavSectionId, SectionTone | null> = {
  home: null,
  operations: {
    dot: 'bg-[#FAC775]',
    iconOnDark: 'text-[#FAC775]/80',
    iconOnDarkHover: 'group-hover/row:text-[#FAC775]',
    iconOnLight: 'text-[#BA7517] dark:text-[#FAC775]',
  },
  fleet: {
    dot: 'bg-[#85B7EB]',
    iconOnDark: 'text-[#85B7EB]/80',
    iconOnDarkHover: 'group-hover/row:text-[#85B7EB]',
    iconOnLight: 'text-[#185FA5] dark:text-[#85B7EB]',
  },
  finance: {
    dot: 'bg-[#5DCAA5]',
    iconOnDark: 'text-[#5DCAA5]/80',
    iconOnDarkHover: 'group-hover/row:text-[#5DCAA5]',
    iconOnLight: 'text-[#0F6E56] dark:text-[#5DCAA5]',
  },
  workspace: {
    dot: 'bg-[#AFA9EC]',
    iconOnDark: 'text-[#AFA9EC]/80',
    iconOnDarkHover: 'group-hover/row:text-[#AFA9EC]',
    iconOnLight: 'text-[#534AB7] dark:text-[#AFA9EC]',
  },
};

/** Icon colour class for a destination or action on a light surface (settings pages stay neutral). */
export function iconToneOnLight(entry: object): string {
  const section = (entry as { section?: string }).section;
  const tone = section && section in SECTION_TONES ? SECTION_TONES[section as NavSectionId] : null;
  return tone?.iconOnLight ?? 'text-muted-foreground';
}

export const NAV_SECTIONS: { id: NavSectionId; label: string | null }[] = [
  { id: 'home', label: null },
  { id: 'operations', label: 'Operations' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'finance', label: 'Finance' },
  { id: 'workspace', label: 'Workspace' },
];

export const FINANCE_GROUPS: { id: FinanceGroupId; label: string; icon: LucideIcon }[] = [
  { id: 'sales', label: 'Sales', icon: ReceiptText },
  { id: 'purchases', label: 'Purchases', icon: CreditCard },
  { id: 'banking', label: 'Banking', icon: Landmark },
  { id: 'accounting', label: 'Accounting', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'access', label: 'Users & access' },
  { id: 'master-data', label: 'Master data' },
  { id: 'safety', label: 'Data & safety' },
  { id: 'aprodac', label: 'Shared with Aprodac' },
];

const isVehicleFinancials = (p: string) => p === '/vehicles/financials' || /^\/vehicles\/[^/]+\/financials$/.test(p);

export const NAV_PAGES: NavPage[] = [
  { id: 'home', label: 'Home', path: '/', icon: Home, section: 'home', moduleKey: 'dashboard', keywords: ['dashboard', 'overview'], match: (p) => p === '/' },

  // Operations
  {
    id: 'trips', label: 'Trips', path: '/trips', icon: Truck, section: 'operations', moduleKey: 'trips', keywords: ['dispatch', 'shipments'],
    match: (p) => p === '/trips' || (p.startsWith('/trips/') && !p.startsWith('/trips/monthly')),
  },
  { id: 'monthly-trips', label: 'Monthly trips', path: '/trips/monthly', icon: CalendarRange, section: 'operations', moduleKey: 'trips', keywords: ['agreement', 'contract'] },
  {
    id: 'quotations', label: 'Quotations', path: '/quotations', icon: Calculator, section: 'operations', moduleKey: 'quotations', permissionKey: 'quotations.view',
    keywords: ['rate cards', 'commercial', 'pricing', 'agreement import'],
    match: (p) => p === '/quotations' || p.startsWith('/quotations/') || p === '/rate-cards' || p.startsWith('/rate-cards/'),
  },
  { id: 'customers', label: 'Customers', path: '/customers', icon: Building2, section: 'operations', moduleKey: 'customers', keywords: ['clients'] },

  // Fleet
  {
    id: 'vehicles', label: 'Vehicles', path: '/vehicles', icon: Car, section: 'fleet', moduleKey: 'vehicles', keywords: ['trucks', 'trailers', 'fleet'],
    match: (p) => (p === '/vehicles' || p.startsWith('/vehicles/')) && !isVehicleFinancials(p),
  },
  { id: 'drivers', label: 'Drivers', path: '/drivers', icon: Users, section: 'fleet', moduleKey: 'drivers' },
  { id: 'maintenance', label: 'Maintenance', path: '/maintenance', icon: Wrench, section: 'fleet', moduleKey: 'maintenance', keywords: ['service', 'workshop'] },
  { id: 'third-party', label: 'Third-party fleet', path: '/third-party', icon: Handshake, section: 'fleet', moduleKey: 'third-party', keywords: ['3pl', 'providers', 'subcontract'] },

  // Finance — Sales
  { id: 'invoices', label: 'Invoices', path: '/finance/invoices', icon: ReceiptText, section: 'finance', group: 'sales', moduleKey: 'finance', keywords: ['billing', 'ar'] },
  { id: 'receivables', label: 'Receivables', path: '/finance/ar-ageing', icon: Clock, section: 'finance', group: 'sales', moduleKey: 'finance', keywords: ['ar ageing', 'aging', 'outstanding'] },
  // Finance — Purchases
  { id: 'bills', label: 'Bills', path: '/finance/bills', icon: CreditCard, section: 'finance', group: 'purchases', moduleKey: 'finance', keywords: ['vendor bills', 'ap'] },
  { id: 'expenses', label: 'Expenses', path: '/expenses', icon: Wallet, section: 'finance', group: 'purchases', moduleKey: 'expenses', permissionKey: 'reports.view', keywords: ['operating expenses', 'fuel', 'costs'] },
  { id: 'payables', label: 'Payables', path: '/finance/ap-ageing', icon: Clock, section: 'finance', group: 'purchases', moduleKey: 'finance', keywords: ['ap ageing', 'aging', 'pay bills'] },
  // Finance — Banking
  { id: 'bank-accounts', label: 'Bank accounts', path: '/finance/bank-accounts', icon: Landmark, section: 'finance', group: 'banking', moduleKey: 'finance', keywords: ['cash', 'transfer'] },
  { id: 'reconciliation', label: 'Reconciliation', path: '/finance/reconciliation', icon: Scale, section: 'finance', group: 'banking', moduleKey: 'finance', keywords: ['bank statement'] },
  { id: 'advances', label: 'Advances', path: '/finance/advances', icon: HandCoins, section: 'finance', group: 'banking', moduleKey: 'finance', keywords: ['prepayments', 'driver advance', 'customer advance'] },
  // Finance — Accounting
  { id: 'journal-entries', label: 'Journal entries', path: '/finance/journal-entries', icon: BookOpen, section: 'finance', group: 'accounting', moduleKey: 'finance', keywords: ['je', 'daybook'] },
  { id: 'general-ledger', label: 'General ledger', path: '/finance/general-ledger', icon: BookOpenText, section: 'finance', group: 'accounting', moduleKey: 'finance', keywords: ['gl', 'ledger'] },
  { id: 'chart-of-accounts', label: 'Chart of accounts', path: '/finance/chart-of-accounts', icon: FolderTree, section: 'finance', group: 'accounting', moduleKey: 'finance', keywords: ['coa', 'accounts'] },
  { id: 'period-close', label: 'Period close', path: '/finance/periods', icon: CalendarCheck, section: 'finance', group: 'accounting', moduleKey: 'finance', keywords: ['accounting periods', 'fiscal year', 'lock'] },
  // Finance — Reports
  { id: 'profit-and-loss', label: 'Profit & loss', path: '/finance/profit-and-loss', icon: BarChart3, section: 'finance', group: 'reports', moduleKey: 'finance', keywords: ['p&l', 'income statement'] },
  { id: 'balance-sheet', label: 'Balance sheet', path: '/finance/balance-sheet', icon: FileBarChart, section: 'finance', group: 'reports', moduleKey: 'finance' },
  { id: 'trial-balance', label: 'Trial balance', path: '/finance/trial-balance', icon: Scale, section: 'finance', group: 'reports', moduleKey: 'finance', keywords: ['tb'] },
  { id: 'cash-flow', label: 'Cash flow', path: '/finance/cash-flow', icon: Coins, section: 'finance', group: 'reports', moduleKey: 'finance' },
  {
    id: 'vehicle-pnl', label: 'Vehicle P&L', path: '/vehicles/financials', icon: TrendingUp, section: 'finance', group: 'reports', moduleKey: 'vehicles', permissionKey: 'fleet.financials',
    keywords: ['vehicle profitability', 'truck p&l'], match: isVehicleFinancials,
  },

  // Workspace
  { id: 'company-reports', label: 'Reports', path: '/company-reports', icon: FileSpreadsheet, section: 'workspace', moduleKey: 'company-reports', permissionKey: 'reports.view', keywords: ['company reports', 'export'] },
  { id: 'report-builder', label: 'Report builder', path: '/report-builder', icon: SlidersHorizontal, section: 'workspace', moduleKey: 'report-builder', permissionKey: 'reports.view', keywords: ['quick report', 'advanced builder', 'custom report'] },
  {
    id: 'documents', label: 'Documents', path: '/documents', icon: Files, section: 'workspace', moduleKey: 'documents', keywords: ['files', 'expiry'],
    match: (p) => p === '/documents' || p.startsWith('/documents/') || p.startsWith('/docs/'),
  },
  { id: 'learning', label: 'Learning', path: '/learning', icon: GraduationCap, section: 'workspace', moduleKey: 'learning', keywords: ['academy', 'tutorials'] },
  { id: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell, section: 'workspace', keywords: ['alerts', 'inbox'], hiddenInSidebar: true },
];

export const NAV_ACTIONS: NavAction[] = [
  { id: 'new-trip', label: 'New trip', path: '/trips/new', icon: Truck, section: 'operations', moduleKey: 'trips', shortcut: 'Alt+T' },
  { id: 'new-quotation', label: 'New quotation', path: '/quotations/new', icon: Calculator, section: 'operations', moduleKey: 'quotations', permissionKey: 'quotations.view' },
  { id: 'new-customer', label: 'New customer', path: '/customers/new', icon: Building2, section: 'operations', moduleKey: 'customers' },
  { id: 'new-vehicle', label: 'New vehicle', path: '/vehicles/new', icon: Car, section: 'fleet', moduleKey: 'vehicles' },
  { id: 'new-driver', label: 'New driver', path: '/drivers/new', icon: Users, section: 'fleet', moduleKey: 'drivers' },
  { id: 'new-maintenance', label: 'Schedule maintenance', path: '/maintenance/new', icon: Wrench, section: 'fleet', moduleKey: 'maintenance' },
  { id: 'new-invoice', label: 'New invoice', path: '/finance/invoices/new', icon: ReceiptText, section: 'finance', moduleKey: 'finance' },
  { id: 'new-bill', label: 'New bill', path: '/finance/bills/new', icon: CreditCard, section: 'finance', moduleKey: 'finance' },
  { id: 'new-journal-entry', label: 'New journal entry', path: '/finance/journal-entries/new', icon: BookOpen, section: 'finance', moduleKey: 'finance' },
  { id: 'new-advance', label: 'New advance', path: '/finance/advances/new', icon: HandCoins, section: 'finance', moduleKey: 'finance' },
  { id: 'new-bank-account', label: 'New bank account', path: '/finance/bank-accounts/new', icon: Landmark, section: 'finance', moduleKey: 'finance' },
  { id: 'new-location', label: 'New location', path: '/locations/create', icon: MapPin, section: 'settings', moduleKey: 'locations', permissionKey: 'settings.view' },
];

export const NAV_ACTION_SECTIONS: { id: NavAction['section']; label: string }[] = [
  { id: 'operations', label: 'Operations' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'finance', label: 'Finance' },
  { id: 'settings', label: 'Master data' },
];

export const SETTINGS_PAGES: SettingsNavPage[] = [
  { id: 'system-settings', label: 'System settings', path: '/settings', icon: Settings, settingsGroup: 'general', keywords: ['company', 'profile', 'preferences'], match: (p) => p === '/settings' || p === '/settings/profile' },
  { id: 'branding', label: 'Branding', path: '/settings/branding', icon: Palette, settingsGroup: 'general', superAdminOnly: true, keywords: ['logo', 'colors', 'theme'] },
  { id: 'users', label: 'Users', path: '/settings/users', icon: UserCog, settingsGroup: 'access', adminOnly: true, keywords: ['user management', 'roles', 'accounts'] },
  { id: 'module-governance', label: 'Module governance', path: '/settings/module-governance', icon: ShieldCheck, settingsGroup: 'access', superAdminOnly: true, keywords: ['modules', 'enable', 'disable'] },
  {
    id: 'locations', label: 'Locations', path: '/locations', icon: MapPin, settingsGroup: 'master-data', moduleKey: 'locations', permissionKey: 'settings.view', keywords: ['places', 'sites'],
  },
  {
    id: 'taxonomy', label: 'Taxonomy', path: '/taxonomy', icon: Layers, settingsGroup: 'master-data', moduleKey: 'taxonomy', permissionKey: 'settings.view', keywords: ['universal colors', 'master data'],
    match: (p) => p === '/taxonomy' || p.startsWith('/master-data'),
  },
  { id: 'taxonomy-settings', label: 'Taxonomy settings', path: '/settings/taxonomy', icon: Tags, settingsGroup: 'master-data', superAdminOnly: true },
  { id: 'document-types', label: 'Document types', path: '/settings/document-types', icon: FileType, settingsGroup: 'master-data', adminOnly: true },
  { id: 'recycle-bin', label: 'Recycle bin', path: '/settings/recycle-bin', icon: Trash2, settingsGroup: 'safety', moduleKey: 'recycle-bin', keywords: ['trash', 'deleted', 'restore'] },
  { id: 'audit-log', label: 'Audit log', path: '/settings/audit-log', icon: ScrollText, settingsGroup: 'safety', superAdminOnly: true, keywords: ['audit trail', 'history'] },
  { id: 'error-console', label: 'Error console', path: '/settings/error-console', icon: AlertTriangle, settingsGroup: 'safety', adminOnly: true, keywords: ['errors', 'logs'] },
  { id: 'system-health', label: 'System health', path: '/settings/system-health', icon: Activity, settingsGroup: 'safety', superAdminOnly: true, keywords: ['status', 'diagnostics'] },
  { id: 'aprodac-vault', label: 'Aprodac vault', path: '/aprodac-documents', icon: FolderArchive, settingsGroup: 'aprodac', moduleKey: 'aprodac-documents', keywords: ['aprodac', 'shared documents', 'vendor'], match: (p) => p === '/aprodac-documents' || p === '/aprodac' },
];

// ── Access ──────────────────────────────────────────────────────────────

export interface NavAccessContext {
  can: (permissionKey: string) => boolean;
  userRole: string | null | undefined;
  isSuperAdmin: boolean;
  /** Settings.enabledModules — undefined/non-array means "no restriction". */
  enabledModules?: string[] | null;
  /** Settings.hiddenModules. */
  hiddenModules?: string[] | null;
}

export type NavAccessState = 'visible' | 'locked' | 'hidden';

/**
 * Same rules as the previous sidebar + route guards: a missing permission or role hides the entry;
 * a disabled module shows it locked (SuperAdmin bypasses), unless the module is also hidden.
 */
export function resolveNavAccess(entry: NavAccessFields, ctx: NavAccessContext): NavAccessState {
  if (entry.superAdminOnly && !ctx.isSuperAdmin) return 'hidden';
  if (entry.adminOnly && !(ctx.isSuperAdmin || ctx.userRole === 'Admin')) return 'hidden';
  if (entry.permissionKey && !ctx.can(entry.permissionKey)) return 'hidden';
  if (entry.moduleKey && !ctx.isSuperAdmin && Array.isArray(ctx.enabledModules) && !ctx.enabledModules.includes(entry.moduleKey)) {
    return ctx.hiddenModules?.includes(entry.moduleKey) ? 'hidden' : 'locked';
  }
  return 'visible';
}

// ── Active matching ─────────────────────────────────────────────────────

function defaultMatch(path: string, pathname: string) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(path + '/');
}

export function matchesPath(entry: { path: string; match?: (p: string) => boolean }, pathname: string) {
  return entry.match ? entry.match(pathname) : defaultMatch(entry.path, pathname);
}

/** The single most specific entry for the current path (longest path wins among matches). */
export function findActiveEntry<T extends { path: string; match?: (p: string) => boolean }>(entries: T[], pathname: string): T | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  let best: T | undefined;
  for (const entry of entries) {
    if (!matchesPath(entry, normalized)) continue;
    if (!best || entry.path.length > best.path.length) best = entry;
  }
  return best;
}

export function isSettingsArea(pathname: string) {
  return SETTINGS_PAGES.some((p) => matchesPath(p, pathname)) || pathname.startsWith('/settings/') || pathname.startsWith('/locations/');
}

/** Top-level destinations where the header hides its Back button. */
export function isTopLevelPath(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return NAV_PAGES.some((p) => p.path === normalized) || SETTINGS_PAGES.some((p) => p.path === normalized) || normalized === '/reports';
}

export const DEFAULT_PINNED_PAGE_IDS = ['trips', 'monthly-trips', 'drivers', 'vehicles'];
export const MAX_PINS = 6;

/** Pages and settings pages that can be pinned / searched, by id. */
export function getPinnableById(id: string): (NavPage | SettingsNavPage) | undefined {
  return NAV_PAGES.find((p) => p.id === id) ?? SETTINGS_PAGES.find((p) => p.id === id);
}
