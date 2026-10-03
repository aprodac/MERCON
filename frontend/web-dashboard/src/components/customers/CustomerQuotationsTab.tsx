import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Edit2, ExternalLink, Plus, Tag } from 'lucide-react';
import { quotationService, Quotation } from '@/services/quotationService';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge, EmptyRow, SearchField, Segmented, SkeletonRows, Toolbar, ui } from '@/components/customers/customerUi';

interface CustomerQuotationsTabProps {
  customerId: string;
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
export default function CustomerQuotationsTab({ customerId, onOpenAddQuotation, onOpenEditQuotation }: CustomerQuotationsTabProps) {
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

  const selectTrigger = 'h-8 w-auto min-w-[130px] gap-2 rounded-md border-slate-200 text-[13px] shadow-none dark:border-slate-700';

  return (
    <section className={cn(ui.card, 'min-w-0 overflow-hidden')}>
      <Toolbar>
        <Segmented
          label="Quotation status"
          value={status}
          onChange={setStatus}
          options={[
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'inactive', label: 'Inactive', count: counts.inactive },
            { id: 'all', label: 'All', count: counts.all },
          ]}
        />
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
          <SearchField value={search} onChange={setSearch} placeholder="Route, place or vehicle" className="flex-1 sm:w-60 sm:flex-none" />
          <Button size="sm" onClick={onOpenAddQuotation} className={ui.btnSm}>
            <Plus /> New quotation
          </Button>
        </div>
      </Toolbar>

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : shown.length === 0 ? (
        <EmptyRow icon={Tag}>
          {quotations.length === 0 ? 'No quotations yet — add the prices agreed with this customer so new trips price themselves.' : 'No quotations match — try another status, filter or search.'}
        </EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className={ui.thead}>
              <tr>
                <th className={cn(ui.thc, 'pl-4')}>Route</th>
                <th className={ui.thc}>Vehicle</th>
                <th className={ui.thc}>Terms</th>
                <th className={cn(ui.thc, 'text-right')}>Rate (SAR)</th>
                <th className={ui.thc}>Status</th>
                <th className={cn(ui.thc, 'w-20 pr-4')}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className={ui.tbody}>
              {shown.map((q) => {
                const r = routeOfQuote(q);
                const rate = Number(q.rate ?? q.base_price ?? 0);
                const monthly = isMonthly(q);
                return (
                  <tr key={q.id} onClick={() => onOpenEditQuotation(q)} className={ui.row}>
                    <td className={cn(ui.tdc, 'max-w-[340px] pl-4')}>
                      <p className="truncate text-slate-900 group-hover:text-[#E5533F] dark:text-white" title={`${r.origin} → ${r.dest}`}>
                        {r.origin} <span className="text-slate-400">→</span> {r.dest}
                      </p>
                      <p className="truncate text-xs text-slate-500">{r.via ? `via ${r.via}` : q.name}</p>
                    </td>
                    <td className={cn(ui.tdc, 'text-slate-700 dark:text-slate-200')}>{q.vehicle_class || q.source_vehicle_label || q.vehicle_type || <span className="text-slate-400">Any</span>}</td>
                    <td className={cn(ui.tdc, 'text-slate-600 dark:text-slate-300')}>
                      {lineTypeLabel(q.line_type || q.rate_category)} <span className="text-slate-300">·</span> {billingLabel(q.billing_type)}
                    </td>
                    <td className={cn(ui.tdc, 'text-right tabular-nums')}>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {rate > 0 ? rate.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                        <span className="ml-1 text-xs font-normal text-slate-400">{monthly ? '/ month' : '/ trip'}</span>
                      </p>
                      {monthly && rate > 0 && <p className="text-xs text-slate-500">≈ {(rate / 30).toLocaleString('en-US', { maximumFractionDigits: 0 })} / day</p>}
                    </td>
                    <td className={ui.tdc}>{q.is_active ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}</td>
                    <td className={cn(ui.tdc, 'pr-4')}>
                      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => onOpenEditQuotation(q)} className={cn(ui.iconSm, 'size-7 text-slate-500')} title="Edit" aria-label="Edit quotation"><Edit2 className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/quotations/${q.id}/edit`)} className={cn(ui.iconSm, 'size-7 text-slate-500')} title="Open full page" aria-label="Open quotation page"><ExternalLink className="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
