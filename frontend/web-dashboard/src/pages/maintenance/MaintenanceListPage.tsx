import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, ChevronRight, Download, Plus, Search } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ManageWorkshopsModal from '@/components/maintenance/ManageWorkshopsModal';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { MaintenanceKpiRow, type HubTab } from '@/components/maintenance/hub/MaintenanceKpiRow';
import { OrderSheet } from '@/components/maintenance/hub/OrderSheet';
import { DueTable } from '@/components/maintenance/hub/DueTable';
import { ServicePlansPanel } from '@/components/maintenance/hub/ServicePlansPanel';
import { maintenanceService, type MaintenanceRecord, type MaintenanceType } from '@/services/maintenanceService';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { TYPE_TONE, daysIn, isOpen, stayTone, workSummary } from '@/lib/maintenance/hub';
import { cn } from '@/lib/utils';

const TYPES: MaintenanceType[] = ['Routine', 'Repair', 'Inspection', 'Renewal', 'Emergency'];
const STATUS_LABEL: Record<string, string> = { In_Progress: 'In workshop', 'In Progress': 'In workshop', Scheduled: 'Scheduled', Completed: 'Completed', Cancelled: 'Cancelled' };
const STATUS_TONE: Record<string, 'warning' | 'info' | 'positive' | 'neutral'> = { In_Progress: 'warning', 'In Progress': 'warning', Scheduled: 'info', Completed: 'positive', Cancelled: 'neutral' };
const PER_PAGE = 50;
const ALL = 'all';

const EXPORT_COLUMNS: ExportColumn<MaintenanceRecord>[] = [
  { id: 'ref_id', label: 'Order', accessor: (r) => r.ref_id || `MNT-${r.id.slice(0, 5).toUpperCase()}` },
  { id: 'vehicle', label: 'Truck', accessor: (r) => r.vehicle?.plate_number || '—' },
  { id: 'maintenance_type', label: 'Type', accessor: (r) => r.maintenance_type },
  { id: 'status', label: 'Status', accessor: (r) => STATUS_LABEL[r.status] ?? r.status },
  { id: 'work', label: 'Work', accessor: (r) => workSummary(r) },
  { id: 'workshop_name', label: 'Workshop', accessor: (r) => r.workshop_name },
  { id: 'start_date', label: 'In', accessor: (r) => (r.start_date ? formatDate(r.start_date) : '—') },
  { id: 'end_date', label: 'Out', accessor: (r) => (r.end_date ? formatDate(r.end_date) : '—') },
  { id: 'vat', label: 'VAT (SAR)', accessor: (r) => formatMoney(r.vat_amount ?? 0) },
  { id: 'cost', label: 'Total (SAR)', accessor: (r) => formatMoney(r.cost ?? 0) },
  { id: 'invoice_number', label: 'Invoice', accessor: (r) => r.invoice_number || '—' },
];

const TABS: { value: HubTab; label: string }[] = [
  { value: 'workshop', label: 'In workshop' },
  { value: 'due', label: 'Due' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'history', label: 'History' },
  { value: 'plans', label: 'Service plans' },
];

/**
 * Maintenance hub: which trucks are in the workshop and for how long, what's due by the service
 * plans, what's booked, the full history, and the plans themselves. A row opens the order.
 */
export default function MaintenanceListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as HubTab) || 'workshop';
  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
      if (!('page' in patch)) n.delete('page');
      return n;
    });
  const setTab = (t: HubTab) => set({ tab: t === 'workshop' ? null : t, q: null, type: null, status: null });
  const page = Math.max(1, Number(params.get('page')) || 1);
  const type = params.get('type') || ALL;
  const statusFilter = params.get('status') || ALL;
  const [searchDraft, setSearchDraft] = useState(params.get('q') || '');
  const search = useDebouncedValue(searchDraft, 300);
  useEffect(() => {
    if ((params.get('q') || '') !== search) set({ q: search || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [viewId, setViewId] = useState<string | null>(params.get('view'));
  const [workshopsOpen, setWorkshopsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const overview = useQuery({ queryKey: ['maintenance', 'overview'], queryFn: maintenanceService.getOverview });
  const ordersTab = tab === 'workshop' || tab === 'scheduled' || tab === 'history';
  const listParams = {
    status: tab === 'workshop' ? 'In_Progress' : tab === 'scheduled' ? 'Scheduled' : statusFilter === ALL ? undefined : statusFilter,
    maintenance_type: tab === 'history' && type !== ALL ? type : undefined,
    search: tab === 'history' ? params.get('q') || undefined : undefined,
    page: tab === 'history' ? page : 1,
    per_page: tab === 'history' ? PER_PAGE : 200,
  };
  const list = useQuery({ queryKey: ['maintenance', 'list', listParams], queryFn: () => maintenanceService.getAll(listParams), enabled: ordersTab, placeholderData: (prev) => prev });
  const rows = useMemo(() => {
    const data = list.data?.data ?? [];
    // Longest in first; scheduled soonest first; history as returned (newest first)
    if (tab === 'workshop') return [...data].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    if (tab === 'scheduled') return [...data].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    return data;
  }, [list.data, tab]);
  const pages = list.data?.meta.total_pages ?? 1;

  const workCell = (r: MaintenanceRecord) => (
    <td className="max-w-[320px] px-3 py-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <Chip tone={TYPE_TONE[r.maintenance_type] ?? 'neutral'} size="sm">{r.maintenance_type}</Chip>
        <span className="truncate text-foreground" title={workSummary(r)}>{workSummary(r)}</span>
      </span>
    </td>
  );

  return (
    <DashboardLayout active="Vehicles" title="Maintenance" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <MaintenanceKpiRow data={overview.data} tab={tab} onTab={setTab} />

        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
            {TABS.map((t) => {
              const n =
                t.value === 'workshop' ? overview.data?.in_workshop.count : t.value === 'due' ? (overview.data ? overview.data.due.overdue + overview.data.due.due_soon : undefined) : t.value === 'scheduled' ? overview.data?.scheduled.count : undefined;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={cn('rounded-md px-3 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring', tab === t.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t.label}
                  {n !== undefined && n > 0 && <span className={cn('ml-1.5', t.value === 'due' && TONE_CLASSES.negative.fg)}>{n}</span>}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => setWorkshopsOpen(true)}>
                <Building2 className="size-3.5" /> Workshops
              </Button>
              <Button size="sm" className="h-8 gap-1.5 rounded-full bg-brand px-3.5 text-xs text-white hover:bg-brand-hover" onClick={() => navigate('/maintenance/new')}>
                <Plus className="size-3.5" /> New service
              </Button>
            </div>
          </div>

          {tab === 'history' && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Order, truck, workshop, invoice…" className="h-8 w-60 pl-8 text-xs" aria-label="Search service orders" />
              </div>
              <Select value={type} onValueChange={(v) => v && set({ type: v === ALL ? null : v })}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All types</SelectItem>
                  {TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => v && set({ status: v === ALL ? null : v })}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All statuses</SelectItem>
                  <SelectItem value="Completed" className="text-xs">Completed</SelectItem>
                  <SelectItem value="In_Progress" className="text-xs">In workshop</SelectItem>
                  <SelectItem value="Scheduled" className="text-xs">Scheduled</SelectItem>
                  <SelectItem value="Cancelled" className="text-xs">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={() => setExportOpen(true)}>
                <Download className="size-3.5" /> Export
              </Button>
            </div>
          )}

          {tab === 'due' ? (
            <DueTable onPlans={() => setTab('plans')} />
          ) : tab === 'plans' ? (
            <ServicePlansPanel />
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[820px] text-xs">
                  <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
                    <tr className="border-b text-left">
                      {tab === 'history' && <th className="px-3 py-2 font-medium">In</th>}
                      <th className="px-3 py-2 font-medium">Truck</th>
                      <th className="px-3 py-2 font-medium">Work</th>
                      <th className="px-3 py-2 font-medium">Workshop</th>
                      {tab === 'workshop' && <th className="px-3 py-2 font-medium">In since</th>}
                      {tab === 'workshop' && <th className="px-3 py-2 font-medium">Back by</th>}
                      {tab === 'scheduled' && <th className="px-3 py-2 font-medium">Booked for</th>}
                      {tab === 'history' && <th className="px-3 py-2 font-medium">Days out</th>}
                      {tab === 'history' && <th className="px-3 py-2 font-medium">Status</th>}
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.isLoading &&
                      Array.from({ length: 6 }, (_, i) => (
                        <tr key={i} className="border-b border-border/60"><td colSpan={7} className="px-3 py-2"><Skeleton className="h-5 w-full" /></td></tr>
                      ))}
                    {!list.isLoading && rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-14 text-center">
                          <p className="text-sm font-medium text-foreground">
                            {tab === 'workshop' ? 'Every truck is on the road' : tab === 'scheduled' ? 'Nothing booked' : 'No service orders match'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tab === 'history' ? 'Try another search or filter.' : 'Book a service, or check the Due tab for what’s coming up.'}
                          </p>
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => {
                      const open = isOpen(r.status);
                      const d = daysIn(r.start_date, open ? null : r.end_date);
                      const tone = open ? stayTone(d, r.expected_end_date) : 'neutral';
                      const until = Math.ceil((new Date(r.start_date).getTime() - Date.now()) / 86_400_000);
                      return (
                        <tr key={r.id} onClick={() => setViewId(r.id)} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40', viewId === r.id && 'bg-muted/60')}>
                          {tab === 'history' && <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(r.start_date)}</td>}
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className="font-semibold text-foreground">{r.vehicle?.plate_number ?? '—'}</span>
                            <span className="block text-[11px] text-muted-foreground">{r.ref_id}</span>
                          </td>
                          {workCell(r)}
                          <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground" title={r.workshop_name}>{r.workshop_name}</td>
                          {tab === 'workshop' && (
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className={cn('font-semibold', tone === 'negative' ? TONE_CLASSES.negative.fg : tone === 'warning' ? TONE_CLASSES.warning.fg : 'text-foreground')}>
                                {d} {d === 1 ? 'day' : 'days'}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">since {formatDate(r.start_date)}</span>
                            </td>
                          )}
                          {tab === 'workshop' && (
                            <td className={cn('whitespace-nowrap px-3 py-2', r.expected_end_date && new Date(r.expected_end_date) < new Date() ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>
                              {r.expected_end_date ? formatDate(r.expected_end_date) : '—'}
                            </td>
                          )}
                          {tab === 'scheduled' && (
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className="text-foreground">{formatDate(r.start_date)}</span>
                              <span className="block text-[11px] text-muted-foreground">{until <= 0 ? 'Today' : until === 1 ? 'Tomorrow' : `In ${until} days`}</span>
                            </td>
                          )}
                          {tab === 'history' && <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.status === 'Scheduled' || r.status === 'Cancelled' ? '—' : `${d} ${d === 1 ? 'day' : 'days'}`}</td>}
                          {tab === 'history' && (
                            <td className="whitespace-nowrap px-3 py-2">
                              <Chip tone={STATUS_TONE[r.status] ?? 'neutral'} size="sm">{STATUS_LABEL[r.status] ?? r.status}</Chip>
                            </td>
                          )}
                          <td className="fin-num whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">{Number(r.cost) > 0 ? formatMoney(r.cost) : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {tab === 'history' && pages > 1 && (
                <div className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                  <span>{list.data?.meta.total ?? 0} orders</span>
                  <span className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-7" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                    {page} / {pages}
                    <Button variant="ghost" size="icon" className="size-7" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="size-4" /></Button>
                  </span>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <OrderSheet id={viewId} onOpenChange={(o) => !o && setViewId(null)} />
      <ManageWorkshopsModal open={workshopsOpen} onOpenChange={setWorkshopsOpen} />
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export service orders"
        description="Choose the format and columns."
        fileNamePrefix="maintenance"
        sheetName="Maintenance"
        subtitle="Fleet maintenance"
        filteredData={rows}
        allData={rows}
        selectedData={[]}
        totalCount={list.data?.meta.total ?? rows.length}
        columns={EXPORT_COLUMNS}
        filters={[]}
        formats={['xlsx', 'csv', 'pdf']}
        rowDateAccessor={(m) => m.start_date || m.createdAt}
      />
    </DashboardLayout>
  );
}
