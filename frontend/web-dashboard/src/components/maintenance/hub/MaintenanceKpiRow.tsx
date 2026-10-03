import { AlertTriangle, CalendarClock, ReceiptText, Wrench } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { MaintenanceOverview } from '@/services/maintenanceService';
import { formatMoney } from '@/lib/finance/format';
import { LONG_STAY_DAYS } from '@/lib/maintenance/hub';
import { cn } from '@/lib/utils';

export type HubTab = 'workshop' | 'due' | 'scheduled' | 'history' | 'plans';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const unit = (n: number, one: string, many: string) => <span className="ml-1.5 text-[16px] font-semibold opacity-85">{n === 1 ? one : many}</span>;

/**
 * The four maintenance figures, in the fleet KpiCard style (same as the Vehicles page). Each card
 * opens its tab below.
 */
export function MaintenanceKpiRow({ data, tab, onTab }: { data?: MaintenanceOverview; tab: HubTab; onTab: (t: HubTab) => void }) {
  if (!data) {
    return (
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
      </div>
    );
  }
  const { in_workshop: w, due, scheduled: s, cost } = data;
  const change = cost.last_month > 0.005 ? Math.round(((cost.this_month - cost.last_month) / cost.last_month) * 100) : null;
  const today = new Date().getDay();

  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiCard
        title="IN WORKSHOP"
        className="kpi-tint-maintenance"
        variant="amber"
        icon={Wrench}
        standaloneIcon={false}
        value={<span>{w.count}{unit(w.count, 'truck', 'trucks')}</span>}
        trend={w.long > 0 || w.overdue_return > 0 ? 'down' : 'neutral'}
        trendValue={w.count === 0 ? 'All trucks on the road' : w.long > 0 ? `${w.long} over ${LONG_STAY_DAYS} days` : w.overdue_return > 0 ? `${w.overdue_return} past return date` : `Longest ${w.longest?.days ?? 0} days`}
        progressSegments={
          w.count
            ? [
                { label: `Up to ${LONG_STAY_DAYS} days`, value: w.count - w.long, color: '#F59E0B' },
                { label: `Over ${LONG_STAY_DAYS} days`, value: w.long, color: '#EF4444' },
              ]
            : undefined
        }
        isActive={tab === 'workshop'}
        onClick={() => onTab('workshop')}
      />
      <KpiCard
        title="SERVICE DUE"
        className="kpi-tint-maintenance"
        variant="rose"
        icon={AlertTriangle}
        standaloneIcon={false}
        value={<span>{due.overdue + due.due_soon}{unit(due.overdue + due.due_soon, 'service', 'services')}</span>}
        trend={due.overdue > 0 ? 'down' : due.plans === 0 ? 'neutral' : 'up'}
        trendValue={due.plans === 0 ? 'No service plans yet' : due.overdue > 0 ? `${due.overdue} overdue` : 'Nothing overdue'}
        progressSegments={
          due.plans
            ? [
                { label: 'Overdue', value: due.overdue, color: '#EF4444' },
                { label: 'Due soon', value: due.due_soon, color: '#F59E0B' },
                { label: 'No record', value: due.never, color: '#9CA3AF' },
              ]
            : undefined
        }
        isActive={tab === 'due' || tab === 'plans'}
        onClick={() => onTab(due.plans === 0 ? 'plans' : 'due')}
      />
      <KpiCard
        title="SCHEDULED"
        className="kpi-tint-maintenance"
        variant="blue"
        icon={CalendarClock}
        standaloneIcon={false}
        value={<span>{s.count}{unit(s.count, 'booked', 'booked')}</span>}
        trend="neutral"
        trendValue={s.next ? `Next: ${s.next.plate} ${new Date(s.next.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Nothing in the next 14 days'}
        customFooter={
          <div className="mt-4 flex gap-1">
            {s.week.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${n} booked`}>
                <div className={cn('h-1.5 w-full rounded-full', n > 0 ? 'bg-blue-500' : 'bg-charcoal-strong/[0.06] dark:bg-white/[0.08]')} />
                <span className="text-[9px] font-semibold text-[#9898A4]">{i === 0 ? 'Today' : WEEKDAY[(today + i) % 7]}</span>
              </div>
            ))}
          </div>
        }
        isActive={tab === 'scheduled'}
        onClick={() => onTab('scheduled')}
      />
      <KpiCard
        title="COST THIS MONTH"
        className="kpi-tint-maintenance"
        variant="emerald"
        icon={ReceiptText}
        standaloneIcon={false}
        value={<span>{formatMoney(cost.this_month)}<span className="ml-1.5 text-[16px] font-semibold opacity-85">SAR</span></span>}
        trend={change === null ? 'neutral' : change > 0 ? 'down' : 'up'}
        trendValue={`${change === null ? 'No cost last month' : `${change > 0 ? '+' : ''}${change}% vs last month`} · ${cost.downtime_days} truck-days off`}
        chartData={cost.trend.map((t) => t.amount)}
        isActive={tab === 'history'}
        onClick={() => onTab('history')}
      />
    </div>
  );
}
