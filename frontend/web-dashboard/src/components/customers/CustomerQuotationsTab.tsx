import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Edit2, ExternalLink, Plus, Search, Tag, X } from 'lucide-react';
import { quotationService, Quotation } from '@/services/quotationService';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge, EmptyBlock, Panel, ui } from '@/components/customers/customerUi';

interface CustomerQuotationsTabProps {
  customerId: string;
  customerName: string;
  onOpenAddQuotation: () => void;
  onOpenEditQuotation: (quotation: Quotation) => void;
}

function lineTypeLabel(lineType?: string | null): string {
  const lt = (lineType || '').toUpperCase();
  if (lt.includes('ROUND')) return 'Round trip';
  if (lt.includes('10')) return '10 hrs duty';
  if (lt.includes('12')) return '12 hrs duty';
  return 'Single trip';
}

function billingLabel(billingType?: string | null): string {
  return (billingType || '').toUpperCase().includes('MONTHLY') ? 'Monthly' : 'Extra';
}

function isMonthly(q: Quotation) {
  const pb = String(q.pricing_basis || '').toUpperCase();
  const op = String(q.operation_type || q.billing_type || '').toUpperCase();
  return pb === 'PER_MONTH' || pb === 'PER MONTH' || (pb === '' && op.includes('MONTH'));
}

function routeOfQuote(q: Quotation) {
  const stops = q.stops || [];
  const name = (s: any) => s?.source_label || s?.location?.name;
  return {
    origin: name(stops[0]) || q.route_origin || '—',
    dest: name(stops[stops.length - 1]) || q.route_destination || '—',
    via: stops.length > 2 ? stops.slice(1, -1).map(name).filter(Boolean).join(', ') : '',
  };
}

type StatusFilter = 'all' | 'active' | 'inactive';

/** Customer → Quotations: the prices agreed with this customer, used to price new trips. */
export default function CustomerQuotationsTab({ customerId, customerName, onOpenAddQuotation, onOpenEditQuotation }: CustomerQuotationsTabProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [lineType, setLineType] = useState('ALL');
  const [billing, setBilling] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', 'customer-tab', customerId],
    queryFn: () => quotationService.getAll({ customerId, per_page: 'all' }),
    enabled: !!customerId,
  });
  const quotations = data?.data || [];

  const counts = useMemo(() => ({
    all: quotations.length,
    active: quotations.filter((q) => q.is_active).length,
    inactive: quotations.filter((q) => !q.is_active).length,
  }), [quotations]);
  const lineTypes = useMemo(() => Array.from(new Set(quotations.map((q) => lineTypeLabel(q.line_type || q.rate_category)))), [quotations]);
  const billings = useMemo(() => Array.from(new Set(quotations.map((q) => billingLabel(q.billing_type)))), [quotations]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotations.filter((q) => {
      if (status === 'active' && !q.is_active) return false;
      if (status === 'inactive' && q.is_active) return false;
      if (lineType !== 'ALL' && lineTypeLabel(q.line_type || q.rate_category) !== lineType) return false;
      if (billing !== 'ALL' && billingLabel(q.billing_type) !== billing) return false;
      if (!term) return true;
      const r = routeOfQuote(q);
      return [q.name, r.origin, r.dest, r.via, q.source_vehicle_label, q.vehicle_class, q.source_reference].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [quotations, status, lineType, billing, search]);

  const selectTrigger = 'h-9 w-auto min-w-[140px] gap-2 rounded-lg border-slate-200 text-[13px] dark:border-slate-700';

  return (
    <Panel
      title="Quotations"
      description={`Prices agreed with ${customerName} — new trips on these lanes price themselves`}
      icon={Tag}
      tone="brand"
      flush
      action={
        <button type="button" onClick={onOpenAddQuotation} className={cn(ui.btn, ui.btnPrimary, 'h-8')}>
          <Plus className="size-4" /> New quotation
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex items-center gap-1" role="tablist" aria-label="Quotation status">
          {([['active', 'Active'], ['inactive', 'Inactive'], ['all', 'All']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={status === id}
              onClick={() => setStatus(id)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors cursor-pointer',
                status === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {label}
              <span className={cn('tabular-nums', status === id ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {lineTypes.length > 1 && (
            <Select value={lineType} onValueChange={(v) => v && setLineType(v)}>
              <SelectTrigger className={selectTrigger}><SelectValue placeholder="All line types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-[13px]">All line types</SelectItem>
                {lineTypes.map((lt) => <SelectItem key={lt} value={lt} className="text-[13px]">{lt}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {billings.length > 1 && (
            <Select value={billing} onValueChange={(v) => v && setBilling(v)}>
              <SelectTrigger className={selectTrigger}><SelectValue placeholder="All billing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-[13px]">All billing</SelectItem>
                {billings.map((b) => <SelectItem key={b} value={b} className="text-[13px]">{b}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Route, place or vehicle" aria-label="Search quotations" className={cn(ui.input, 'w-full pl-9 pr-8')} />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {!isLoading && shown.length === 0 ? (
        <div className="p-5">
          <EmptyBlock
            icon={Tag}
            title={quotations.length === 0 ? 'No quotations yet' : 'No quotations match'}
            text={quotations.length === 0 ? 'Add the prices agreed with this customer so new trips price themselves.' : 'Try another status, filter or search.'}
            action={quotations.length === 0 ? (
              <button type="button" onClick={onOpenAddQuotation} className={cn(ui.btn, ui.btnPrimary, 'h-8')}><Plus className="size-4" /> New quotation</button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/40">
              <tr>
                <th className={cn(ui.th, 'pl-5')}>Route</th>
                <th className={ui.th}>Vehicle</th>
                <th className={ui.th}>Terms</th>
                <th className={cn(ui.th, 'text-right')}>Rate (SAR)</th>
                <th className={ui.th}>Status</th>
                <th className={cn(ui.th, 'pr-5')}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></td></tr>
                ))
                : shown.map((q) => {
                  const r = routeOfQuote(q);
                  const rate = Number(q.rate ?? q.base_price ?? 0);
                  const monthly = isMonthly(q);
                  return (
                    <tr key={q.id} onClick={() => onOpenEditQuotation(q)} className="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className={cn(ui.td, 'max-w-[340px] pl-5')}>
                        <p className="truncate text-slate-900 group-hover:text-[#E5533F] dark:text-white" title={`${r.origin} → ${r.dest}`}>
                          {r.origin} <span className="text-slate-400">→</span> {r.dest}
                        </p>
                        <p className="truncate text-xs text-slate-500">{r.via ? `via ${r.via}` : q.name}</p>
                      </td>
                      <td className={cn(ui.td, 'text-slate-700 dark:text-slate-200')}>{q.vehicle_class || q.source_vehicle_label || q.vehicle_type || <span className="text-slate-400">Any</span>}</td>
                      <td className={cn(ui.td, 'text-slate-600 dark:text-slate-300')}>
                        {lineTypeLabel(q.line_type || q.rate_category)} <span className="text-slate-300">·</span> {billingLabel(q.billing_type)}
                      </td>
                      <td className={cn(ui.td, 'text-right tabular-nums')}>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {rate > 0 ? rate.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                          <span className="ml-1 text-xs font-normal text-slate-400">{monthly ? '/ month' : '/ trip'}</span>
                        </p>
                        {monthly && rate > 0 && <p className="text-xs text-slate-500">≈ {(rate / 30).toLocaleString('en-US', { maximumFractionDigits: 0 })} / day</p>}
                      </td>
                      <td className={ui.td}>{q.is_active ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}</td>
                      <td className={cn(ui.td, 'pr-5')}>
                        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => onOpenEditQuotation(q)} className={ui.iconBtn} title="Edit" aria-label="Edit quotation"><Edit2 className="size-4" /></button>
                          <button type="button" onClick={() => navigate(`/quotations/${q.id}/edit`)} className={ui.iconBtn} title="Open full page" aria-label="Open quotation page"><ExternalLink className="size-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
