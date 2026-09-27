import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NAV_ACTIONS, NAV_PAGES, SETTINGS_PAGES, findActiveEntry, isTopLevelPath, resolveNavAccess, type NavAccessContext,
} from '../navigation';
import { checkPermission } from '@/hooks/usePermissions';

const allDestinations = [...NAV_PAGES, ...SETTINGS_PAGES];

function ctx(role: 'Admin' | 'Operator', opts: Partial<NavAccessContext> = {}): NavAccessContext {
  const isSuperAdmin = opts.isSuperAdmin ?? false;
  return {
    can: (key) => isSuperAdmin || checkPermission(role, key),
    userRole: role,
    isSuperAdmin,
    enabledModules: undefined,
    hiddenModules: undefined,
    ...opts,
  };
}

describe('navigation config', () => {
  it('declares every destination exactly once (no duplicate paths or ids)', () => {
    const paths = allDestinations.map((d) => d.path);
    const ids = [...allDestinations, ...NAV_ACTIONS].map((d) => d.id);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every destination from the old sidebar and top bar reachable', () => {
    // Every link the previous Sidebar.tsx / Header.tsx pills offered.
    const oldPaths = [
      '/', '/notifications', '/trips', '/trips/new', '/trips/monthly', '/third-party', '/vehicles', '/vehicles/new', '/maintenance',
      '/maintenance/new', '/drivers', '/drivers/new', '/vehicles/financials', '/customers', '/customers/new', '/quotations',
      '/quotations/new', '/quotations/import', '/finance/invoices', '/finance/invoices/new', '/finance/ar-ageing', '/finance/bills',
      '/finance/bills/new', '/expenses', '/finance/ap-ageing', '/finance/bank-accounts', '/finance/bank-accounts/new',
      '/finance/reconciliation', '/finance/advances', '/finance/advances/new', '/finance/general-ledger', '/finance/journal-entries',
      '/finance/journal-entries/new', '/finance/chart-of-accounts', '/finance/periods', '/finance/profit-and-loss',
      '/finance/balance-sheet', '/finance/trial-balance', '/finance/cash-flow', '/company-reports', '/report-builder',
      '/report-builder/quick', '/report-builder/advanced', '/documents', '/learning', '/locations', '/locations/create', '/taxonomy',
      '/settings', '/settings/recycle-bin', '/settings/module-governance', '/settings/audit-log', '/settings/users',
      '/settings/error-console', '/aprodac-documents',
    ];
    // Reached through a page inside another page (not a nav entry): the AI import button on Quotations and
    // the Quick / Advanced cards on the Report builder landing page.
    const reachableInPage = new Set(['/quotations/import', '/report-builder/quick', '/report-builder/advanced']);
    const navPaths = new Set([...allDestinations.map((d) => d.path), ...NAV_ACTIONS.map((a) => a.path)]);
    const missing = oldPaths.filter((p) => !navPaths.has(p) && !reachableInPage.has(p));
    expect(missing).toEqual([]);
  });

  it('only links to routes that exist in router.tsx', () => {
    const router = readFileSync(resolve(__dirname, '../../router.tsx'), 'utf8');
    const routePaths = new Set([...router.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
    const linked = [...allDestinations.map((d) => d.path), ...NAV_ACTIONS.map((a) => a.path)];
    expect(linked.filter((p) => !routePaths.has(p))).toEqual([]);
  });

  it('applies the same access rules as the route guards', () => {
    const op = ctx('Operator');
    const admin = ctx('Admin');
    const superAdmin = ctx('Admin', { isSuperAdmin: true });
    const byId = (id: string) => allDestinations.find((d) => d.id === id)!;

    // <RequireRole roles={['Admin']}> pages
    expect(resolveNavAccess(byId('users'), op)).toBe('hidden');
    expect(resolveNavAccess(byId('users'), admin)).toBe('visible');
    expect(resolveNavAccess(byId('error-console'), op)).toBe('hidden');
    // <RequireRole roles={['SuperAdmin']}> pages
    expect(resolveNavAccess(byId('module-governance'), admin)).toBe('hidden');
    expect(resolveNavAccess(byId('module-governance'), superAdmin)).toBe('visible');
    expect(resolveNavAccess(byId('audit-log'), admin)).toBe('hidden');
    // permission-gated
    expect(resolveNavAccess(byId('expenses'), op)).toBe('visible');
    expect(resolveNavAccess(byId('locations'), op)).toBe('visible');
  });

  it('locks disabled modules, hides hidden ones, and lets super admins through', () => {
    const invoices = NAV_PAGES.find((p) => p.id === 'invoices')!;
    const enabled = ['dashboard', 'trips'];
    expect(resolveNavAccess(invoices, ctx('Admin', { enabledModules: enabled }))).toBe('locked');
    expect(resolveNavAccess(invoices, ctx('Admin', { enabledModules: enabled, hiddenModules: ['finance'] }))).toBe('hidden');
    expect(resolveNavAccess(invoices, ctx('Admin', { enabledModules: enabled, isSuperAdmin: true }))).toBe('visible');
    expect(resolveNavAccess(invoices, ctx('Admin', { enabledModules: null }))).toBe('visible');
  });

  it('marks exactly one, most specific, active page', () => {
    const active = (p: string) => findActiveEntry(allDestinations, p)?.id;
    expect(active('/')).toBe('home');
    expect(active('/trips')).toBe('trips');
    expect(active('/trips/123/track')).toBe('trips');
    expect(active('/trips/monthly')).toBe('monthly-trips');
    expect(active('/vehicles/abc')).toBe('vehicles');
    expect(active('/vehicles/financials')).toBe('vehicle-pnl');
    expect(active('/vehicles/abc/financials')).toBe('vehicle-pnl');
    expect(active('/finance/invoices/new')).toBe('invoices');
    expect(active('/rate-cards/5/edit')).toBe('quotations');
    expect(active('/settings/error-console/99')).toBe('error-console');
    expect(active('/settings')).toBe('system-settings');
    expect(active('/master-data/taxonomy')).toBe('taxonomy');
  });

  it('treats top-level pages as having no Back button', () => {
    expect(isTopLevelPath('/finance/invoices')).toBe(true);
    expect(isTopLevelPath('/settings/users')).toBe(true);
    expect(isTopLevelPath('/finance/invoices/new')).toBe(false);
  });
});
