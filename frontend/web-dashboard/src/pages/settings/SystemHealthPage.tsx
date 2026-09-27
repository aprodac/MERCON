import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

import { SettingsPage, SettingsRow, SettingsSection, StatStrip, StatusDot } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { settingsService } from '@/services/settingsService';

function formatUptime(seconds?: number) {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

export default function SystemHealthPage() {
  const queryClient = useQueryClient();

  const { data: health, isLoading: isHealthLoading, isFetching, isError, refetch: refetchHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: settingsService.getHealth,
    refetchInterval: 15000,
  });

  const { data: auditLogsRes, isLoading: isAuditLoading } = useQuery({
    queryKey: ['system-audit-logs'],
    queryFn: () => settingsService.getAuditLogs({ per_page: 8 }),
  });
  const auditLogs = auditLogsRes?.data || [];

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get });

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceBanner, setMaintenanceBanner] = useState('');

  useEffect(() => {
    if (settings) {
      setMaintenanceMode(Boolean((settings as any).maintenanceMode));
      setMaintenanceBanner((settings as any).maintenanceBanner || '');
    }
  }, [settings]);

  const savedMode = Boolean((settings as any)?.maintenanceMode);
  const savedBanner = (settings as any)?.maintenanceBanner || '';
  const dirty = maintenanceMode !== savedMode || maintenanceBanner.trim() !== savedBanner;

  const updateMaintenanceMutation = useMutation({
    mutationFn: (payload: any) => settingsService.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      toast.success('Maintenance settings saved');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to save maintenance settings');
    },
  });

  const healthy = !isError && health?.database?.connected;
  const t = health?.telemetry;

  return (
    <SettingsPage
      wide
      title="System health"
      description="Whether the platform is up, how busy it is, and the switch that puts it into maintenance. Refreshes every 15 seconds."
      actions={
        <Btn label="Refresh" variant="outline" size="sm" icon={<RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />} onClick={() => refetchHealth()} />
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <StatusDot tone={isHealthLoading ? 'gray' : healthy ? 'green' : 'red'} />
        <span className="font-semibold text-foreground">
          {isHealthLoading ? 'Checking…' : healthy ? 'All systems running' : 'The API or database is not responding'}
        </span>
        {health?.timestamp && <span className="text-muted-foreground">· checked {new Date(health.timestamp).toLocaleTimeString()}</span>}
      </div>

      <StatStrip
        items={[
          { label: 'Database response', value: health?.database?.latencyMs != null ? `${health.database.latencyMs} ms` : '—' },
          { label: 'Active users', value: t?.activeUsers ?? '—' },
          { label: 'Active fleet', value: t ? `${t.activeDrivers ?? 0} drivers` : '—', hint: t ? `${t.activeVehicles ?? 0} vehicles` : undefined },
          { label: 'API uptime', value: formatUptime(t?.serverUptimeSeconds), hint: t?.nodeVersion ? `Node ${t.nodeVersion}` : undefined },
        ]}
      />

      <SettingsSection
        title="Maintenance"
        description="Shows a banner to everyone except Aprodac superadmins. Use it before a planned release or during an incident."
        action={<Btn label="Save" size="sm" disabled={!dirty} isLoading={updateMaintenanceMutation.isPending} onClick={() => updateMaintenanceMutation.mutate({ maintenanceMode, maintenanceBanner: maintenanceBanner.trim() || null })} />}
      >
        <SettingsRow label="Maintenance mode" description={maintenanceMode ? 'On: users see the banner below.' : 'Off'} htmlFor="maintenance-mode">
          <Switch id="maintenance-mode" checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
        </SettingsRow>
        <SettingsRow label="Banner message" description="Leave empty for the default maintenance notice." htmlFor="maintenance-banner" className="sm:items-start">
          <Input
            id="maintenance-banner"
            value={maintenanceBanner}
            onChange={(e) => setMaintenanceBanner(e.target.value)}
            placeholder="Planned maintenance until 22:00. Trips can’t be edited until then."
            className="h-9 w-full sm:w-[420px] text-sm"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Recent activity"
        flush
        action={
          <Link to="/settings/audit-log" className="text-xs font-bold text-brand hover:underline">
            Open audit log
          </Link>
        }
      >
        {isAuditLoading ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Loading…</p>
        ) : auditLogs.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/10 border-t border-black/[0.05] dark:border-white/10">
            {auditLogs.map((log: any) => (
              <li key={log.id} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-foreground">{log.action}</span>
                  <span className="text-muted-foreground"> · {log.entityType}{log.user?.name ? ` · ${log.user.name}` : ''}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
