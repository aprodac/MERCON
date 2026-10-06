import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, RefreshCw } from 'lucide-react';

import { SettingsPage, SettingsRow, SettingsSection, StatStrip, StatusDot } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import ConfirmModal from '@/components/ui/ConfirmModal';
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

      <ServerSnapshotSection />

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

/**
 * This server's Hostinger snapshot: when the current one was taken, and a
 * button to replace it (Hostinger keeps one per server). Restoring stays in
 * hPanel — rolling the whole server back is not a one-click job.
 */
function ServerSnapshotSection() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['server-snapshot'],
    queryFn: settingsService.getServerSnapshot,
    // While one is being taken, check every 20 s; otherwise once a minute is plenty.
    refetchInterval: (q) => (q.state.data?.running && q.state.data.running.state !== 'failed' ? 20_000 : 60_000),
    retry: false,
  });
  const take = useMutation({
    mutationFn: settingsService.takeServerSnapshot,
    onSuccess: () => {
      setConfirming(false);
      toast.success('Snapshot started. It takes a few minutes; the site stays up.');
      queryClient.invalidateQueries({ queryKey: ['server-snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['system-audit-logs'] });
    },
    onError: (err: any) => {
      setConfirming(false);
      toast.error(err.response?.data?.error?.message || 'Couldn’t start the snapshot');
    },
  });

  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
  const running = data?.running && data.running.state !== 'failed';
  const failed = data?.running?.state === 'failed';
  const loadError = (error as any)?.response?.data?.error?.message;

  return (
    <SettingsSection
      title="Server snapshot"
      description="A copy of the whole server you can go back to — take one before a big release or a server upgrade. Hostinger keeps one per server, so a new snapshot replaces the last one. Restore it from hPanel (VPS → Snapshot & backups)."
      action={
        data?.configured ? (
          <Btn
            label={running ? 'Taking snapshot…' : 'Take snapshot now'}
            size="sm"
            icon={<Camera size={13} />}
            disabled={running || take.isPending}
            isLoading={take.isPending}
            onClick={() => setConfirming(true)}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">{loadError || 'Couldn’t reach Hostinger.'}</p>
      ) : !data?.configured ? (
        <p className="text-sm text-muted-foreground">
          Not set up on this server yet — needs {data?.missing.join(' and ')} (docs/infra/BACKUP_RESTORE.md).
        </p>
      ) : (
        <>
          <SettingsRow label="Current snapshot" description={data.hostname ?? undefined}>
            <span className="text-sm font-semibold text-foreground">{data.snapshot ? `Taken ${when(data.snapshot.createdAt)}` : 'None yet'}</span>
          </SettingsRow>
          {data.snapshot?.expiresAt ? (
            <SettingsRow label="Kept until" description="Hostinger deletes it after this.">
              <span className="text-sm text-foreground">{when(data.snapshot.expiresAt)}</span>
            </SettingsRow>
          ) : null}
          {running ? (
            <p className="flex items-center gap-2 text-sm text-foreground"><StatusDot tone="amber" /> Taking a new snapshot (started {when(data.running!.startedAt)}). The site stays up meanwhile.</p>
          ) : failed ? (
            <p className="flex items-center gap-2 text-sm text-red-600"><StatusDot tone="red" /> The last snapshot didn’t finish. Try again, or check hPanel.</p>
          ) : null}
        </>
      )}

      <ConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => take.mutate()}
        title="Take a new server snapshot?"
        message={data?.snapshot ? `This replaces the current snapshot from ${when(data.snapshot.createdAt)}. The site stays up while it’s taken.` : 'The site stays up while it’s taken.'}
        confirmLabel="Take snapshot"
        isLoading={take.isPending}
      />
    </SettingsSection>
  );
}
