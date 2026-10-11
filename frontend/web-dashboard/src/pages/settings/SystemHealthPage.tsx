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

      <EtaAccuracySection />

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

/**
 * How good the ETAs are: once trucks arrive, what the ETA said vs when they
 * really came, by how far ahead it was said (backend etaAccuracy.ts). The
 * number to watch after every change to routing or the ETA rules.
 */
function EtaAccuracySection() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['eta-accuracy', days],
    queryFn: () => settingsService.getEtaAccuracy(days),
    staleTime: 5 * 60_000,
  });
  const min = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)} min`);
  const bias = (v: number | null | undefined) =>
    v == null ? '—' : Math.abs(v) < 1 ? 'on the dot' : v < 0 ? `${Math.round(-v)} min later than said` : `${Math.round(v)} min earlier than said`;
  const o = data?.overall;

  return (
    <SettingsSection
      title="ETA accuracy"
      description="Once a truck reaches a stop, what its ETA said against when it really arrived — the closer to the arrival, the closer it should be. Road-route ETAs only."
      action={
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-8 rounded-lg border border-black/10 bg-transparent px-2 text-xs dark:border-white/15"
          aria-label="Period"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-600">Couldn’t load ETA accuracy.</p>
      ) : !o?.predictions ? (
        <p className="text-sm text-muted-foreground">
          Nothing to measure yet. ETAs are recorded every 10 minutes while trucks drive, and counted once they reach the stop.
        </p>
      ) : (
        <>
          <StatStrip
            items={[
              { label: 'Typical miss', value: min(o.typicalMissMin), hint: `${o.stops} stops reached` },
              { label: 'Within 15 min', value: o.within15Pct != null ? `${o.within15Pct}%` : '—' },
              { label: '9 in 10 within', value: min(o.p90Min) },
              { label: 'Trucks arrive', value: bias(o.biasMin) },
            ]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Said</th>
                  <th className="py-1.5 pr-3 font-medium">Typical miss</th>
                  <th className="py-1.5 pr-3 font-medium">Within 15 min</th>
                  <th className="py-1.5 pr-3 font-medium">Trucks arrive</th>
                  <th className="py-1.5 font-medium">Predictions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] dark:divide-white/10">
                {data.rows.map((r) => (
                  <tr key={r.horizon}>
                    <td className="py-1.5 pr-3 text-foreground">{r.label}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{min(r.typicalMissMin)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.within15Pct != null ? `${r.within15Pct}%` : '—'}</td>
                    <td className="py-1.5 pr-3">{bias(r.biasMin)}</td>
                    <td className="py-1.5 tabular-nums text-muted-foreground">{r.predictions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.estimates ? (
            <p className="text-xs text-muted-foreground">
              Not counted: {data.estimates} straight-line estimates made while the road route couldn’t be loaded.
            </p>
          ) : null}
        </>
      )}
    </SettingsSection>
  );
}
