import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { settingsService } from '@/services/settingsService';
import { authStore } from '@/store/authStore';
import type { ModuleKey } from '@mercon/shared-types';

interface RequireModuleProps {
  moduleKey: ModuleKey;
  children: ReactNode;
}

const MODULE_FALLBACK_ORDER: { key: ModuleKey; path: string }[] = [
  { key: 'quotations', path: '/quotations' },
  { key: 'trips', path: '/trips' },
  { key: 'dashboard', path: '/' },
  { key: 'drivers', path: '/drivers' },
  { key: 'vehicles', path: '/vehicles' },
  { key: 'customers', path: '/customers' },
  { key: 'locations', path: '/locations' },
];

const MODULE_PATH_MAP: Record<string, string> = {
  quotations: '/quotations',
  trips: '/trips',
  dashboard: '/',
  drivers: '/drivers',
  vehicles: '/vehicles',
  customers: '/customers',
  locations: '/locations',
  expenses: '/expenses',
  documents: '/documents',
  reports: '/reports',
  'company-reports': '/customers', // no page of its own — Customer → Trip sheets
  'report-builder': '/report-builder',
  maintenance: '/maintenance',
  'third-party': '/third-party',
  taxonomy: '/taxonomy',
  'aprodac-documents': '/aprodac-documents',
};

export function getFirstActiveModulePath(enabledModules?: string[], preferredModule?: string): string {
  if (preferredModule && MODULE_PATH_MAP[preferredModule] && enabledModules?.includes(preferredModule)) {
    return MODULE_PATH_MAP[preferredModule];
  }
  if (!enabledModules || !Array.isArray(enabledModules) || enabledModules.length === 0) {
    return '/quotations';
  }
  for (const item of MODULE_FALLBACK_ORDER) {
    if (enabledModules.includes(item.key)) {
      return item.path;
    }
  }
  return '/quotations';
}

/** For features that live inside another page (not a route): same rule as the guard below. */
export function useModuleEnabled(moduleKey: ModuleKey): boolean {
  const user = authStore.getUser();
  const isSuperAdmin = user?.role === 'SuperAdmin' || (user as any)?.isSuperAdmin === true;
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get, staleTime: 60000 });
  if (isSuperAdmin || !settings || !Array.isArray(settings.enabledModules)) return true;
  return settings.enabledModules.includes(moduleKey);
}

/** Blocks direct navigation to a disabled module's URL for regular users — SuperAdmin bypasses to configure & test. */
export default function RequireModule({ moduleKey, children }: RequireModuleProps) {
  const user = authStore.getUser();
  const isSuperAdmin = user?.role === 'SuperAdmin' || (user as any)?.isSuperAdmin === true;

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 60000,
  });

  if (isLoading && !settings) {
    return (
      <div className="flex items-center justify-center min-h-[300px] h-full w-full">
        <div className="w-8 h-8 rounded-full border-3 border-slate-200 border-t-brand animate-spin" />
      </div>
    );
  }

  // SuperAdmins bypass module lockouts so they can manage/test all pages
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Regular users are redirected to the selected default landing page if this module is disabled
  if (settings && Array.isArray(settings.enabledModules) && !settings.enabledModules.includes(moduleKey)) {
    const preferred = (settings as any).defaultRedirectModule || 'quotations';
    const fallbackPath = getFirstActiveModulePath(settings.enabledModules, preferred);
    // Avoid infinite redirect if fallbackPath equals current target
    if (fallbackPath === `/${moduleKey}` || (moduleKey === 'dashboard' && fallbackPath === '/')) {
      return <Navigate to="/quotations" replace />;
    }
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
