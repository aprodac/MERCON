import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, Database, Server, Users, Shield, AlertTriangle, CheckCircle2, Clock, RefreshCw, Radio, HardDrive } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { settingsService } from '@/services/settingsService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function SystemHealthPage() {
  const queryClient = useQueryClient();

  const { data: health, isLoading: isHealthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: settingsService.getHealth,
    refetchInterval: 15000, // auto-refresh every 15 sec
  });

  const { data: auditLogsRes, isLoading: isAuditLoading } = useQuery({
    queryKey: ['system-audit-logs'],
    queryFn: () => settingsService.getAuditLogs({ per_page: 20 }),
  });
  const auditLogs = auditLogsRes?.data || [];

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceBanner, setMaintenanceBanner] = useState('');

  useEffect(() => {
    if (settings) {
      setMaintenanceMode(Boolean((settings as any).maintenanceMode));
      setMaintenanceBanner((settings as any).maintenanceBanner || '');
    }
  }, [settings]);

  const updateMaintenanceMutation = useMutation({
    mutationFn: (payload: any) => settingsService.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      toast.success('Maintenance mode & banner settings updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update maintenance state');
    },
  });

  const handleSaveMaintenance = () => {
    updateMaintenanceMutation.mutate({
      maintenanceMode,
      maintenanceBanner: maintenanceBanner.trim() || null,
    });
  };

  return (
    <DashboardLayout active="Account" title="System Health & Diagnostics">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-6 max-w-[1350px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-emerald-600">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Platform Telemetry & Audit Trail
                </h1>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold text-[10px]">
                  SuperAdmin Command Center
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time database performance, operational server telemetry, and emergency maintenance controls
              </p>
            </div>
          </div>

          <Button
            onClick={() => refetchHealth()}
            variant="outline"
            className="h-9 text-xs font-bold gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHealthLoading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </Button>
        </div>

        {/* Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* DB Health */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Database Latency</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                  {health?.database?.latencyMs ?? '—'}
                </span>
                <span className="text-xs text-slate-500 font-semibold">ms</span>
              </div>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
          </Card>

          {/* Active Users */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Active Users</span>
              <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono mt-1 block">
                {health?.telemetry?.activeUsers ?? '—'}
              </span>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </Card>

          {/* Active Drivers & Vehicles */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Active Fleet</span>
              <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono mt-1 block">
                {health?.telemetry?.activeDrivers ?? 0} Drivers / {health?.telemetry?.activeVehicles ?? 0} Vehicles
              </span>
            </div>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <HardDrive className="w-5 h-5" />
            </div>
          </Card>

          {/* Server Uptime */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Node Runtime Uptime</span>
              <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono mt-1 block">
                {health?.telemetry?.serverUptimeSeconds ? `${Math.floor(health.telemetry.serverUptimeSeconds / 3600)}h ${Math.floor((health.telemetry.serverUptimeSeconds % 3600) / 60)}m` : '—'}
              </span>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <Server className="w-5 h-5" />
            </div>
          </Card>

        </div>

        {/* Maintenance Controls */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-500 shrink-0" />
              <div>
                <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Maintenance Mode & Emergency Broadcast
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Enable Maintenance Mode</span>
                <span className="text-[11px] text-slate-500">Displays global notice to non-superadmin users</span>
              </div>
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="w-5 h-5 rounded text-[#FA634E] focus:ring-[#FA634E] cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Broadcast Message Banner</span>
              <div className="flex gap-2">
                <Input
                  value={maintenanceBanner}
                  onChange={(e) => setMaintenanceBanner(e.target.value)}
                  placeholder="e.g. Scheduled system maintenance in progress. Operational updates paused until 22:00 UTC."
                  className="h-9 text-xs"
                />
                <Button
                  onClick={handleSaveMaintenance}
                  disabled={updateMaintenanceMutation.isPending}
                  className="bg-charcoal hover:bg-slate-800 text-white font-bold text-xs h-9 px-4 shrink-0 cursor-pointer"
                >
                  Update Notice
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Stream */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" /> Platform Security & Audit Trail
            </CardTitle>
            <a href="/settings/audit-log" className="text-xs font-semibold text-brand hover:underline">
              View Full Audit Log →
            </a>
          </CardHeader>
          <CardContent className="pt-4">
            {isAuditLoading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold">Loading system audit stream...</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold">No recent activity logged</div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] font-bold bg-white dark:bg-slate-900">
                        {log.entityType}
                      </Badge>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {log.action}
                        {log.user?.name && <span className="text-slate-400 font-normal"> — by {log.user.name}</span>}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
