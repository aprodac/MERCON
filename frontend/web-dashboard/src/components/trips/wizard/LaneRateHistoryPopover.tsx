import React from 'react';
import { formatQuotationRef } from '@mercon/shared-types';
import { History, TrendingUp, Loader2, Check, ArrowRight, DollarSign } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { quotationService } from '@/services/quotationService';
import { cn } from '@/lib/utils';

interface LaneRateHistoryPopoverProps {
  origin: string;
  destination: string;
  vehicleClass?: string;
  customerId?: string;
  onApplyRate?: (billingRate: number, driverPayout: number | null) => void;
  triggerClassName?: string;
}

export const LaneRateHistoryPopover: React.FC<LaneRateHistoryPopoverProps> = ({
  origin,
  destination,
  vehicleClass,
  customerId,
  onApplyRate,
  triggerClassName,
}) => {
  const [open, setOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [historyItems, setHistoryItems] = React.useState<any[]>([]);

  const fetchHistory = React.useCallback(async () => {
    if (!origin || !destination) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const data = await quotationService.getLanePriceHistory({
        origin,
        destination,
        vehicleClass,
        customerId,
      });
      setHistoryItems(data || []);
    } catch {
      setHistoryItems([]);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [origin, destination, vehicleClass, customerId]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      void fetchHistory();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!origin || !destination}
          className={cn(
            'h-7 px-2.5 text-[11px] font-bold border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 gap-1.5 shadow-2xs cursor-pointer rounded-lg',
            triggerClassName
          )}
          title="Click to view historical quotation rates for this route & vehicle class"
        >
          <History className="w-3.5 h-3.5 text-brand shrink-0" />
          <span>Rate History</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        avoidCollisions={true}
        collisionPadding={8}
        className="w-80 p-0 shadow-xl border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden z-[9999] bg-white dark:bg-slate-900"
      >
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-brand shrink-0" />
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white">Route Price History</h4>
              <p className="text-[10px] font-medium text-slate-500 truncate max-w-[210px]">
                {origin || 'Origin'} → {destination || 'Destination'} {vehicleClass ? `(${vehicleClass})` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[min(300px,var(--radix-popover-content-available-height,300px))] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 overscroll-contain">
          {isLoading ? (
            <div className="py-8 px-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Fetching past rate records...</span>
            </div>
          ) : hasError ? (
            <div className="py-6 px-4 text-center text-xs text-rose-500 bg-rose-50/50 dark:bg-rose-950/20 space-y-1">
              <p className="font-bold">Failed to load price history</p>
              <p className="text-[10px] text-slate-500">A network error occurred. Click Rate History again to retry.</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-600 dark:text-slate-300">No past rate records found</p>
              <p className="text-[10px]">No historical quotations exist for this exact origin → destination lane.</p>
            </div>
          ) : (
            historyItems.map((item, idx) => {
              const rawBRate = Number(item.rate ?? item.base_price ?? 0);
              const bRate = isNaN(rawBRate) ? 0 : rawBRate;

              const rawDPayout = item.driver_payout != null ? Number(item.driver_payout) : null;
              const dPayout = rawDPayout != null && !isNaN(rawDPayout) ? rawDPayout : null;

              const margin = dPayout != null ? bRate - dPayout : null;
              const marginPct = margin != null && bRate > 0 ? Math.round((margin / bRate) * 100) : null;

              const parsedDate = item.updatedAt ? new Date(item.updatedAt) : null;
              const formattedDate = parsedDate && !isNaN(parsedDate.getTime())
                ? parsedDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'N/A';

              return (
                <div key={item.id || idx} className="p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      {formatQuotationRef(item.quotation_number) ?? (item.name || 'Quotation Rate')}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">{formattedDate}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 font-mono text-[11px]">
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Customer Billing</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">SAR {bRate.toLocaleString()}</span>
                    </div>

                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Driver Payout</span>
                      <span className="font-black text-slate-700 dark:text-slate-300">
                        {dPayout != null ? `SAR ${dPayout.toLocaleString()}` : '—'}
                      </span>
                    </div>
                  </div>

                  {margin != null && (
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold px-0.5">
                      <span>Margin: SAR {margin.toLocaleString()} ({marginPct}%)</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 font-bold">
                        {item.vehicle_class || '10 TON'}
                      </Badge>
                    </div>
                  )}

                  {onApplyRate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onApplyRate(bRate, dPayout);
                        setOpen(false);
                      }}
                      className="w-full h-7 text-[10px] font-black text-brand hover:text-white hover:bg-brand cursor-pointer gap-1 rounded-md"
                    >
                      <span>Apply This Rate</span>
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
