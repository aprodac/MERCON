import { useMemo } from 'react';
import { formatQuotationRef } from '@mercon/shared-types';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { quotationService } from '@/services/quotationService';
import { resolveTaxonomyOption } from '@/utils/taxonomyRegistry';
import type { QuotationLineItem, QuotationSurchargeRule } from '@/pages/quotations/AddQuotationPage';

const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const norm = (v?: string | null) => String(v || '').trim().toLowerCase().replace(/_/g, ' ');
const lineTypeLabel = (v: string) => resolveTaxonomyOption('LINE_TYPE', v)?.label || v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

type Note = { tone: 'warn' | 'info'; text: string };

/**
 * "Check before saving" for a new or edited quotation: each route with all its
 * stops by place name, plus the mistakes worth a second look — a driver pay that
 * looks like a typo, and a route + truck this customer already has a price for.
 */
export function QuotationReviewDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  operationType,
  validFrom,
  validTo,
  lineItems,
  surchargeRules,
  locationNames,
  editingId,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  operationType: 'MONTHLY' | 'EXTRA';
  validFrom: string;
  validTo: string;
  lineItems: QuotationLineItem[];
  surchargeRules: QuotationSurchargeRule[];
  locationNames: Map<string, string>;
  editingId?: string;
  saving: boolean;
  onSave: () => void;
}) {
  // Same cache as the Quotations page, so this is usually already loaded.
  const { data: existingRes } = useQuery({
    queryKey: ['quotations'],
    queryFn: () => quotationService.getAll({ per_page: 'all' }),
    enabled: open && !!customerId,
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const existing = (existingRes?.data || []).filter((q) => q.customerId === customerId && q.id !== editingId && q.is_active !== false);
    return lineItems.map((line) => {
      const stopIds = [line.originLocationId, ...line.viaStops.map((v) => v.locationId), line.destinationLocationId].filter(Boolean);
      const names = stopIds.map((sid) => locationNames.get(sid) || 'Place');
      const rate = parseFloat(line.rate || '0') || 0;
      const pay = line.driverPayout === '' ? null : parseFloat(line.driverPayout);
      const notes: Note[] = [];

      if (pay != null && !isNaN(pay)) {
        if (rate > 0 && pay >= rate) notes.push({ tone: 'warn', text: `Driver pay (SAR ${money(pay)}) is more than the price (SAR ${money(rate)}).` });
        else if (pay > 0 && pay < 10) notes.push({ tone: 'warn', text: `Driver pay SAR ${money(pay)} looks too low${rate ? ` for a SAR ${money(rate)} trip` : ''}. Check for a missing digit.` });
      }

      const same = existing.filter((q) => {
        const qStops = [...(q.stops || [])].sort((a: any, b: any) => a.sequence - b.sequence).map((s: any) => s.locationId);
        return norm(q.vehicle_class) === norm(line.vehicleClass)
          && norm(q.line_type || q.rate_category) === norm(lineTypeLabel(line.lineType))
          && qStops.join('>') === stopIds.join('>');
      });
      if (same.length > 0) {
        const q = same[0] as any;
        const qRate = Number(q.rate ?? q.base_price ?? 0);
        const ref = formatQuotationRef(q.quotation_number) ?? 'another quotation';
        notes.push(qRate === rate
          ? { tone: 'info', text: `${customerName} already has this route and truck at the same price (${ref}). Saving adds a duplicate.` }
          : { tone: 'warn', text: `${customerName} already has this route and truck at SAR ${money(qRate)} (${ref}). Saving adds a second price.` });
      }
      return { line, names, rate, pay, notes };
    });
  }, [lineItems, existingRes, customerId, customerName, editingId, locationNames]);

  const missingPay = rows.filter((r) => r.pay == null || isNaN(r.pay)).length;
  const monthly = operationType === 'MONTHLY';
  const validity = validFrom || validTo
    ? `valid ${validFrom ? fmtDate(validFrom) : 'from today'} → ${validTo ? fmtDate(validTo) : 'no end date'}`
    : 'valid from today, no end date';
  const saveLabel = rows.length > 1 ? `Save ${rows.length} routes` : 'Save quotation';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800 shadow-2xl z-[9999]">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="text-base font-bold text-[#3E3C3D] dark:text-slate-100">Check before saving</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {customerName || 'No customer chosen'} · {monthly ? 'Monthly' : 'Extra'} · {validity}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto border-y border-slate-100 dark:border-slate-800">
          {rows.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-500">No routes — only extra charges are saved.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(({ line, names, rate, pay, notes }) => (
                <li key={line.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1 text-sm font-semibold text-[#3E3C3D] dark:text-slate-100">
                        {names.map((n, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            {i > 0 && <ArrowRight className="h-3 w-3 text-slate-400" />}
                            {n}
                          </span>
                        ))}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {line.vehicleClass} · {lineTypeLabel(line.lineType)}
                        {names.length > 2 && ` · ${names.length} stops`}
                        {' · '}
                        {pay != null && !isNaN(pay) ? `driver pay SAR ${money(pay)}` : 'driver pay set at booking'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-sm font-bold text-[#3E3C3D] dark:text-slate-100">
                      SAR {money(rate)}
                      <span className="ml-1 text-[11px] font-medium text-slate-500">{monthly || line.pricingBasis === 'PER_MONTH' ? '/mo' : '/trip'}</span>
                    </div>
                  </div>
                  {notes.map((n, i) => (
                    <div
                      key={i}
                      className={cn(
                        'mt-2 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs',
                        n.tone === 'warn' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
                      )}
                    >
                      {n.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <span>{n.text}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}

          {surchargeRules.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <div className="mb-1.5 text-xs font-semibold text-slate-500">Extra charges</div>
              <ul className="space-y-1">
                {surchargeRules.map((rule) => (
                  <li key={rule.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#3E3C3D] dark:text-slate-200">{rule.name || 'Unnamed charge'} <span className="text-slate-400">· {rule.unit}</span></span>
                    <span className="font-mono font-semibold text-[#3E3C3D] dark:text-slate-100">SAR {money(parseFloat(rule.amount || '0') || 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-3 px-5 py-3 sm:justify-between">
          <span className="text-[11px] text-slate-500">
            {missingPay > 0 && (
              rows.length === 1
                ? 'No driver pay yet — it’s asked when the trip is booked.'
                : missingPay === rows.length
                ? `None of the ${rows.length} routes has driver pay yet — it’s asked when the trip is booked.`
                : `${missingPay} of ${rows.length} routes ${missingPay === 1 ? 'has' : 'have'} no driver pay yet — it’s asked when the trip is booked.`
            )}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-xl px-4 text-xs font-semibold">
              Back to edit
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="h-9 gap-1.5 rounded-xl border-0 bg-[#FA634E] px-5 text-xs font-bold text-white hover:bg-[#DF4834]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? 'Saving…' : saveLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
