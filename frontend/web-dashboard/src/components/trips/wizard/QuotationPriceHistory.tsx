import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, History } from 'lucide-react';
import { quotationService } from '@/services/quotationService';
import { LaneRateHistoryPopover } from './LaneRateHistoryPopover';
import { cn } from '@/lib/utils';

const SOURCE_LABEL: Record<string, string> = {
  TRIP_CREATION: 'on a trip',
  QUOTATION_MODULE: 'in Quotations',
  IMPORT: 'by import',
};

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

function Change({ label, from, to }: { label: string; from: number | null; to: number | null }) {
  if (to === null || from === to) return null;
  const up = from !== null && to > from;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      {from !== null && <span className="tabular-nums text-slate-400 line-through">{from.toLocaleString()}</span>}
      {from !== null && <ArrowRight className="w-3 h-3 text-slate-300" />}
      <span className={cn('font-semibold tabular-nums', from === null ? 'text-slate-800 dark:text-slate-100' : up ? 'text-rose-600' : 'text-emerald-600')}>
        {to.toLocaleString()}
      </span>
    </span>
  );
}

/**
 * The selected quotation's price changes (rate and driver payout, who and when),
 * plus the other rates on the same lane — shown right in the price panel.
 */
export function QuotationPriceHistory({
  quotationId,
  origin,
  destination,
  vehicleClass,
  customerId,
}: {
  quotationId?: string | null;
  origin?: string;
  destination?: string;
  vehicleClass?: string;
  customerId?: string;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['quotation-history', quotationId],
    queryFn: () => quotationService.getHistory(quotationId as string),
    enabled: Boolean(quotationId),
    staleTime: 60_000,
  });

  if (!quotationId) return null;
  const items = [...(history as any[])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const shown = showAll ? items : items.slice(0, 2);

  return (
    <div className="mt-2 rounded-xl border border-slate-200/80 dark:border-slate-700 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <History className="w-3.5 h-3.5 text-slate-400" /> Price history
          {items.length > 0 && <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-[10px] text-slate-500">{items.length}</span>}
        </span>
        {origin && destination && (
          <LaneRateHistoryPopover
            origin={origin}
            destination={destination}
            vehicleClass={vehicleClass}
            customerId={customerId}
            triggerClassName="h-6 px-2 text-[11px] font-semibold"
          />
        )}
      </div>

      {isLoading ? (
        <p className="text-[11px] text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-slate-400">No price changes since this quotation was created.</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((h: any) => {
            const when = h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const who = h.changed_by_name || h.changed_by || '';
            return (
              <li key={h.id} className="text-[11px] leading-snug">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <Change label="Rate" from={num(h.old_rate ?? h.old_base_price)} to={num(h.new_rate ?? h.new_base_price)} />
                  <Change label="Payout" from={num(h.old_driver_payout)} to={num(h.new_driver_payout)} />
                </div>
                <div className="text-slate-400">
                  {when}
                  {who && ` · ${who}`}
                  {h.source && SOURCE_LABEL[h.source] && ` · ${SOURCE_LABEL[h.source]}`}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 2 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] font-semibold text-slate-500 hover:text-[#c2410c] cursor-pointer">
          {showAll ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

export default QuotationPriceHistory;
