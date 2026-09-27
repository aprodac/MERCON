import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsService } from '@/services/settingsService';
import { usePermissions } from '@/hooks/usePermissions';
import { resolveNavAccess, type NavAccessFields, type NavAccessState } from '@/config/navigation';

/** Resolves visible / locked / hidden for any navigation entry using the current user and module settings. */
export function useNavAccess() {
  const { can, userRole, isSuperAdmin } = usePermissions();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 60000,
  });

  const access = useCallback(
    (entry: NavAccessFields): NavAccessState =>
      resolveNavAccess(entry, {
        can,
        userRole,
        isSuperAdmin,
        enabledModules: settings?.enabledModules,
        hiddenModules: settings?.hiddenModules,
      }),
    // can/userRole/isSuperAdmin derive from the stored user, which only changes on login
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.enabledModules, settings?.hiddenModules, userRole, isSuperAdmin],
  );

  return access;
}
