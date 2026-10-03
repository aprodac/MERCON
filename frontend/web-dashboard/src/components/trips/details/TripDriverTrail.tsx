/**
 * Driver side of a trip (driver phone audit): what the driver was sent,
 * whether it reached the phone and was opened, when they tapped "Got it",
 * and what they did in the app — plus a one-line phone status for the map card.
 */
import type { ReactNode } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhoneDot, PushStatusPill } from '@/components/drivers/phone/PhoneStatus';
import { ActivityRow } from '@/components/drivers/phone/DriverPhoneSheet';
import { PHONE_LEVEL_LABEL, timeAgo, type DriverPhoneDetails, type TripDriverTrail } from '@/services/driverPhoneService';
import { fmtDate } from '@/components/details/DetailKit';

/** Latest "Got it" for the current driver, after their latest assignment. */
export function currentAcknowledgement(trail: TripDriverTrail | undefined, driverId: string | null | undefined) {
  if (!trail || !driverId) return { ackAt: null as string | null, assignedAt: null as string | null };
  const assigned = trail.notifications
    .filter((n) => n.type === 'TripAssigned' && n.driverId === driverId)
    .map((n) => n.createdAt)
    .sort()
    .pop() ?? null;
  const ack = trail.acknowledgements
    .filter((a) => a.driverId === driverId && (!assigned || a.createdAt >= assigned))
    .map((a) => a.createdAt)
    .sort()
    .pop() ?? null;
  return { ackAt: ack, assignedAt: assigned };
}

/** "● Ready · Got it 10:42" under the driver on the map card. Click opens the driver trail. */
export function DriverPhoneLine({
  phone,
  ackAt,
  assignedAt,
  tz,
  onOpen,
}: {
  phone: DriverPhoneDetails | undefined;
  ackAt: string | null;
  assignedAt: string | null;
  tz: string;
  onOpen: () => void;
}) {
  if (!phone) return null;
  const level = phone.status.level;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={[...phone.status.reasons, `App last seen ${timeAgo(phone.status.lastSeenAt)}`].join('\n')}
      className="mt-1.5 flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-muted/50 px-2 py-1 text-left text-[11px] hover:bg-muted"
    >
      <span className="flex items-center gap-1">
        <PhoneDot level={level} />
        <span className={cn('font-medium', level === 'green' ? 'text-emerald-700 dark:text-emerald-400' : level === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400')}>
          Phone {PHONE_LEVEL_LABEL[level].toLowerCase()}
        </span>
      </span>
      {ackAt ? (
        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3" /> Got it {fmtDate(ackAt, tz, true).split(', ')[1] ?? ''}
        </span>
      ) : assignedAt ? (
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <Clock className="size-3" /> Not acknowledged
        </span>
      ) : null}
    </button>
  );
}

/** Everything on the driver side of this trip, oldest first. */
export function TripDriverTrailList({ trail, tz }: { trail: TripDriverTrail | undefined; tz: string }) {
  if (!trail) return <p className="text-xs text-muted-foreground">Loading…</p>;

  type Item = { at: string; key: string; node: ReactNode };
  const items: Item[] = [
    ...trail.notifications.map((n) => ({
      at: n.createdAt,
      key: `n-${n.id}`,
      node: (
        <div className="py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Sent to driver: {n.title}
              {n.driverName && <span className="font-medium text-slate-400"> · {n.driverName}</span>}
            </p>
            <span className="text-[11px] text-slate-400 shrink-0">{fmtDate(n.createdAt, tz, true)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PushStatusPill status={n.push} />
            {n.opened_at && <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Opened {fmtDate(n.opened_at, tz, true)}</span>}
            {!n.opened_at && n.read_at && <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Read {fmtDate(n.read_at, tz, true)}</span>}
          </div>
          {n.deliveries.find((d) => d.reason) && (
            <p className="mt-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{n.deliveries.find((d) => d.reason)!.reason}</p>
          )}
        </div>
      ),
    })),
    ...trail.acknowledgements.map((a) => ({
      at: a.createdAt,
      key: `a-${a.id}`,
      node: (
        <div className="flex items-start gap-2.5 py-2 border-b border-slate-100 dark:border-slate-800">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
          <p className="flex-1 text-xs font-bold text-slate-900 dark:text-white">{a.driverName} tapped "Got it"</p>
          <span className="text-[11px] text-slate-400 shrink-0">{fmtDate(a.createdAt, tz, true)}</span>
        </div>
      ),
    })),
    ...trail.activity.map((a) => ({ at: a.createdAt, key: `e-${a.id}`, node: <ActivityRow a={a} tz={tz} showTrip={false} /> })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing recorded on the driver side yet.</p>;
  }
  return <div>{items.map((i) => <div key={i.key}>{i.node}</div>)}</div>;
}
