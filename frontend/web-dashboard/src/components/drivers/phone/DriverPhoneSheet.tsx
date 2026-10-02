/**
 * "Phone & app" — everything about a driver's phone in one side sheet:
 * why it is green/amber/red, each registered phone's permissions, battery
 * and app version, every notification sent to the driver with whether it
 * reached the phone and was opened, and the driver's activity log.
 */
import type { ElementType } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Smartphone, Bell, BellOff, MapPin, MapPinOff, Battery, BatteryWarning, Wifi, Signal, WifiOff, Send, Clock, Activity, CheckCircle2, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { dk, fmtDate, StatusPill } from '@/components/details/DetailKit';
import { useDeploymentTimezone } from '@/lib/datetime';
import { extractApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  driverPhoneService, timeAgo, activityDetail, ACTIVITY_LABEL,
  type DriverDevice, type DriverNotificationTrail, type DriverActivityRow,
} from '@/services/driverPhoneService';
import { PhoneLevelPill, PushStatusPill } from './PhoneStatus';

export const driverPhoneKey = (driverId: string) => ['driver-phone', driverId];

function Fact({ icon: Icon, label, value, bad, warn }: { icon: ElementType; label: string; value: string; bad?: boolean; warn?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 p-2 rounded-lg border text-xs min-w-0',
      bad ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/30'
        : warn ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30'
          : 'border-slate-200/90 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50')}
    >
      <Icon className={cn('w-4 h-4 shrink-0', bad ? 'text-rose-600' : warn ? 'text-amber-600' : 'text-slate-500')} />
      <div className="min-w-0">
        <p className={dk.micro}>{label}</p>
        <p className="font-bold text-slate-900 dark:text-white truncate mt-0.5">{value}</p>
      </div>
    </div>
  );
}

const NOTIF_TEXT: Record<string, string> = { granted: 'Allowed', denied: 'Turned off', undetermined: 'Not asked yet' };
const LOC_TEXT: Record<string, string> = { always: 'Always', while_using: 'While using app', denied: 'Denied', undetermined: 'Not asked yet' };

function DeviceCard({ d, tz, minVersion, latestVersion }: { d: DriverDevice; tz: string; minVersion: string | null; latestVersion: string | null }) {
  const reports = d.health_reported_at != null;
  const battery = d.battery_level != null ? `${Math.round(d.battery_level * 100)}%` : '—';
  const network = d.network_type === 'wifi' ? 'Wi-Fi' : d.network_type === 'cellular' ? 'Mobile data' : d.network_type === 'none' ? 'Offline' : d.network_type ?? '—';
  const NetIcon = d.network_type === 'wifi' ? Wifi : d.network_type === 'none' ? WifiOff : Signal;
  const belowMin = !!minVersion && (!d.app_version || d.app_version.localeCompare(minVersion, undefined, { numeric: true }) < 0);
  const notLatest = !!latestVersion && !!d.app_version && d.app_version.localeCompare(latestVersion, undefined, { numeric: true }) < 0;

  return (
    <div className={cn(dk.card, 'p-3 space-y-2.5', !d.isActive && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-sm font-black text-slate-900 dark:text-white truncate">
            {d.device_model ?? (d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android phone' : 'Phone')}
          </p>
          <span className="text-[11px] font-medium text-slate-400 shrink-0">
            {d.os_name === 'ios' ? 'iOS' : d.os_name === 'android' ? 'Android' : d.platform} {d.os_version ?? ''}
          </span>
        </div>
        {d.isActive ? <StatusPill tone="slate">Seen {timeAgo(d.lastSeenAt)}</StatusPill> : <StatusPill tone="slate">Logged out</StatusPill>}
      </div>

      {!reports ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Old app version — this phone doesn't report its settings. Ask the driver to update the app.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <Fact icon={d.notif_permission === 'denied' ? BellOff : Bell} label="Notifications" value={`${NOTIF_TEXT[d.notif_permission ?? ''] ?? '—'}${d.notif_permission === 'granted' && !d.hasPushToken ? ' (no token)' : ''}`} bad={d.notif_permission === 'denied' || (d.notif_permission === 'granted' && !d.hasPushToken)} warn={d.notif_permission === 'undetermined'} />
          <Fact icon={d.location_permission === 'denied' ? MapPinOff : MapPin} label="Location access" value={LOC_TEXT[d.location_permission ?? ''] ?? '—'} bad={d.location_permission === 'denied'} warn={d.location_permission === 'undetermined'} />
          <Fact icon={d.location_services_on === false ? MapPinOff : MapPin} label="Phone GPS" value={d.location_services_on == null ? '—' : d.location_services_on ? 'On' : 'Off'} warn={d.location_services_on === false} />
          <Fact icon={d.low_power_mode ? BatteryWarning : Battery} label="Battery" value={`${battery}${d.low_power_mode ? ' · saver on' : ''}`} warn={!!d.low_power_mode || (d.battery_level != null && d.battery_level < 0.15)} />
          <Fact icon={NetIcon} label="Network" value={network} warn={d.network_type === 'none'} />
          <Fact icon={Smartphone} label="App version" value={`${d.app_version ?? '—'}${d.build_number ? ` (${d.build_number})` : ''}${belowMin ? ' · too old' : notLatest ? ' · update available' : ''}`} bad={belowMin} warn={!belowMin && notLatest} />
        </div>
      )}
      <p className="text-[11px] font-medium text-slate-400">
        Registered {fmtDate(d.createdAt, tz)}{reports ? ` · last report ${fmtDate(d.health_reported_at, tz, true)}` : ''}
      </p>
    </div>
  );
}

export function NotificationTrailRow({ n, tz }: { n: DriverNotificationTrail; tz: string }) {
  const failed = n.deliveries.find((d) => d.reason);
  return (
    <div className="p-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{n.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{n.message}</p>
        </div>
        <span className="text-[11px] font-medium text-slate-400 shrink-0">{fmtDate(n.createdAt, tz, true)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PushStatusPill status={n.push} />
        {n.opened_at && <StatusPill tone="green"><Eye className="w-3 h-3" /> Opened {fmtDate(n.opened_at, tz, true)}</StatusPill>}
        {!n.opened_at && n.read_at && <StatusPill tone="green"><CheckCircle2 className="w-3 h-3" /> Read {fmtDate(n.read_at, tz, true)}</StatusPill>}
        {!n.opened_at && !n.read_at && !n.is_read && <StatusPill tone="slate">Not read yet</StatusPill>}
      </div>
      {failed && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{failed.reason}</p>}
    </div>
  );
}

export function ActivityRow({ a, tz, showTrip = true }: { a: DriverActivityRow; tz: string; showTrip?: boolean }) {
  const detail = activityDetail(a);
  const alarming = a.type === 'Emergency' || a.type === 'WentOffline' || (a.type === 'PermissionChanged' && /→ (denied|false)/.test(detail ?? ''));
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', alarming ? 'bg-rose-500' : a.type === 'Acknowledged' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900 dark:text-white">
          {ACTIVITY_LABEL[a.type] ?? a.type}
          {showTrip && a.tripRef && <span className="font-mono font-semibold text-slate-400"> · {a.tripRef}</span>}
        </p>
        {detail && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{detail}</p>}
      </div>
      <span className="text-[11px] font-medium text-slate-400 shrink-0">{fmtDate(a.createdAt, tz, true)}</span>
    </div>
  );
}

export default function DriverPhoneSheet({
  driverId,
  driverName,
  open,
  onOpenChange,
}: {
  driverId: string;
  driverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tz = useDeploymentTimezone();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: driverPhoneKey(driverId),
    queryFn: () => driverPhoneService.details(driverId),
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });

  const testPush = useMutation({
    mutationFn: () => driverPhoneService.testPush(driverId),
    onSuccess: () => {
      toast.success('Test notification sent — delivery status updates here within ~15 minutes.');
      setTimeout(() => queryClient.invalidateQueries({ queryKey: driverPhoneKey(driverId) }), 2000);
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });

  const active = data?.devices.filter((d) => d.isActive) ?? [];
  const inactive = data?.devices.filter((d) => !d.isActive) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="text-base font-black">Phone & app — {driverName}</SheetTitle>
            {data && <PhoneLevelPill level={data.status.level} size="lg" />}
          </div>
          <SheetDescription asChild>
            <div className="space-y-1.5">
              {data && data.status.reasons.length > 0 ? (
                <ul className="space-y-0.5">
                  {data.status.reasons.map((r) => (
                    <li key={r} className={cn('text-xs font-semibold', data.status.level === 'red' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400')}>• {r}</li>
                  ))}
                </ul>
              ) : data ? (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">This phone can receive trips and report back.</p>
              ) : null}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> App last seen {timeAgo(data?.status.lastSeenAt)}
                </span>
                <Button
                  size="sm"
                  onClick={() => testPush.mutate()}
                  disabled={testPush.isPending}
                  className="h-8 px-3 bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold rounded-xl text-xs gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> {testPush.isPending ? 'Sending…' : 'Send test push'}
                </Button>
              </div>
            </div>
          </SheetDescription>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : (
          <Tabs defaultValue="phone" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="mx-5 mt-3 self-start">
              <TabsTrigger value="phone"><Smartphone className="w-3.5 h-3.5 mr-1.5" />Phone</TabsTrigger>
              <TabsTrigger value="notifications"><Bell className="w-3.5 h-3.5 mr-1.5" />Notifications</TabsTrigger>
              <TabsTrigger value="activity"><Activity className="w-3.5 h-3.5 mr-1.5" />Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="phone" className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-2.5">
              {active.length === 0 && (
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 pt-2">
                  No phone registered. The driver needs to log in to the MERCON Driver app.
                </p>
              )}
              {active.map((d) => <DeviceCard key={d.id} d={d} tz={tz} minVersion={data.minVersion} latestVersion={data.latestVersion} />)}
              {inactive.length > 0 && (
                <>
                  <p className={cn(dk.label, 'pt-2')}>Previous phones</p>
                  {inactive.map((d) => <DeviceCard key={d.id} d={d} tz={tz} minVersion={data.minVersion} latestVersion={data.latestVersion} />)}
                </>
              )}
            </TabsContent>

            <TabsContent value="notifications" className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-2">
              {data.notifications.length === 0 ? (
                <p className="text-sm text-slate-400 pt-2">Nothing has been sent to this driver yet.</p>
              ) : (
                data.notifications.map((n) => <NotificationTrailRow key={n.id} n={n} tz={tz} />)
              )}
            </TabsContent>

            <TabsContent value="activity" className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              {data.activity.length === 0 ? (
                <p className="text-sm text-slate-400 pt-2">No activity recorded yet. Activity is logged from the phone-health app update onwards.</p>
              ) : (
                data.activity.map((a) => <ActivityRow key={a.id} a={a} tz={tz} />)
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
