import type { UserRole } from '@mercon/shared-types';
import { authStore } from '@/store/authStore';

// Keyed by UserRole so a renamed or newly added role fails the build here
// rather than silently losing its permissions at runtime.
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SuperAdmin: ['*'],
  Admin: [
    'trips.view.all',
    'trips.create',
    'trips.dispatch',
    'trips.workflow.start',
    'trips.workflow.arrive',
    'trips.workflow.complete',
    'trips.workflow.pod_upload',
    'trips.rates.edit',
    'trips.delete',
    'quotations.view',
    'quotations.edit',
    'quotations.delete',
    'customers.view',
    'customers.manage',
    'fleet.view',
    'fleet.manage',
    'fleet.financials',
    'drivers.view',
    'drivers.manage',
    'drivers.security.reset',
    'users.view',
    'users.manage',
    'settings.view',
    'reports.view',
    'audit.view',
  ],
  Operator: [
    'trips.view.all',
    'trips.create',
    'trips.dispatch',
    'trips.workflow.start',
    'trips.workflow.arrive',
    'trips.workflow.complete',
    'trips.workflow.pod_upload',
    'trips.rates.edit',
    'trips.delete',
    'quotations.view',
    'quotations.edit',
    'quotations.delete',
    'customers.view',
    'customers.manage',
    'fleet.view',
    'fleet.manage',
    'fleet.financials',
    'drivers.view',
    'drivers.manage',
    'drivers.security.reset',
    'users.view',
    'users.manage',
    'settings.view',
    'reports.view',
    'audit.view',
  ],
  Driver: [
    'trips.view.own',
    'trips.workflow.start',
    'trips.workflow.arrive',
    'trips.workflow.complete',
    'trips.workflow.pod_upload',
  ],
};

export function checkPermission(userRole: UserRole | string | undefined | null, permissionKey: string): boolean {
  if (!userRole) return false;
  const permissions = ROLE_PERMISSIONS[userRole as UserRole] || [];
  if (permissions.includes('*')) return true;
  return permissions.includes(permissionKey);
}

export function usePermissions() {
  const user = authStore.getUser();
  const userRole = user?.role || 'Operator';
  const isSuperAdmin = Boolean(user?.isSuperAdmin || userRole === 'SuperAdmin');

  const can = (permissionKey: string): boolean => {
    if (isSuperAdmin) return true;
    return checkPermission(userRole, permissionKey);
  };

  const canAny = (permissionKeys: string[]): boolean => {
    if (isSuperAdmin) return true;
    return permissionKeys.some((p) => can(p));
  };

  const canAll = (permissionKeys: string[]): boolean => {
    if (isSuperAdmin) return true;
    return permissionKeys.every((p) => can(p));
  };

  return { can, canAny, canAll, userRole, isSuperAdmin, user };
}
