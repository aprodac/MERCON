import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ListChecks } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { maintenanceService, type DueStatus } from '@/services/maintenanceService';
import { formatDate } from '@/lib/finance/format';
import { DUE_LABEL, DUE_TONE, dueWording, intervalWording } from '@/lib/maintenance/hub';
import { cn } from '@/lib/utils';

type Filter = 'attention' | 'never' | 'all';
const ATTENTION: DueStatus[] = ['overdue', 'due_soon'];

/** Planned services per truck: what's overdue or coming up, and a one-click "Book" into a new order. */
export function DueTable({ onPlans }: { onPlans: () => void }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['maintenance', 'due'], queryFn: () => maintenanceService.getDue() });
  const [filter, setFilter] = useState<Filter>('attention');
  const rows = useMemo(() => {
    const all = q.data ?? [];
    if (filter === 'attention') return all.filter((r) => ATTENTION.includes(r.status));
    if (filter === 'never') return all.filter((r) => r.status === 'never');
    return all;
  }, [q.data, filter]);
  const counts = useMemo(() => {
    const all = q.data ?? [];
    return { attention: all.filter((r) => ATTENTION.includes(r.status)).length, never: all.filter((r) => r.status === 'never').length, all: all.length };
  }, [q.data]);

  if (!q.isLoading && (q.data ?? []).length === 0) {
    return (
      <div className="px-3 py-14 text-center">
        <ListChecks className="mx-auto mb-2 size-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No service plans yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Add plans like “Oil change every 10,000 km or 6 months” and every truck’s next service shows up here before it’s late.</p>
        <Button size="sm" variant="outline" className="mt-3 h-8 rounded-full text-xs" onClick={onPlans}>
          Set up service plans
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <SegmentedControl
          aria-label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'attention', label: `Needs attention · ${counts.attention}` },
            { value: 'never', label: `No record yet · ${counts.never}` },
            { value: 'all', label: `All · ${counts.all}` },
          ]}
        />
        <span className="ml-auto text-[11px] text-muted-foreground">Due by km or date, whichever comes first. Km is the truck’s last recorded odometer.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] text-xs">
          <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium">Truck</th>
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Last done</th>
              <th className="px-3 py-2 font-medium">Due at</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td colSpan={6} className="px-3 py-2"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Nothing here. Every planned service is on track.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.vehicleId}:${r.planId}`} className="border-b border-border/60 hover:bg-muted/40">
                <td className="px-3 py-2">
                  <span className="font-semibold text-foreground">{r.plate}</span>
                  <span className="block text-[11px] text-muted-foreground">{Math.round(r.odometer).toLocaleString('en-US')} km</span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{r.task}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {intervalWording(r)}
                    {r.scope === 'truck' ? ' · this truck' : r.scope === 'type' ? ` · ${r.asset_type}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.last ? (
                    <Link to={`/maintenance/${r.last.recordId}`} className="hover:text-foreground hover:underline">
                      {formatDate(r.last.date)} · {Math.round(r.last.km).toLocaleString('en-US')} km
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 text-foreground">
                  {[r.dueKm !== null ? `${Math.round(r.dueKm).toLocaleString('en-US')} km` : null, r.dueDate ? formatDate(r.dueDate) : null].filter(Boolean).join(' or ') || '—'}
                </td>
                <td className="px-3 py-2">
                  <Chip tone={DUE_TONE[r.status]} size="sm">{DUE_LABEL[r.status]}</Chip>
                  <span className={cn('mt-0.5 block text-[11px]', r.status === 'overdue' ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>{dueWording(r)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status !== 'booked' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 rounded-full text-xs"
                      onClick={() => navigate(`/maintenance/new?vehicle=${r.vehicleId}&plan=${r.planId}${r.status === 'never' ? '&log=1' : ''}`)}
                    >
                      <CalendarPlus className="size-3.5" /> {r.status === 'never' ? 'Log last service' : 'Book'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
