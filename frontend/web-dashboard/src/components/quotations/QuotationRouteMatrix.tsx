import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Quotation } from '@/services/quotationService';

/** Usual truck order; classes not listed here follow alphabetically. */
const CLASS_ORDER = ['3-4 TON', '5 TON', '8 TON', '10 TON', '20 TON', '40 FEET'];
const PAGE = 25;

const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const norm = (v?: string | null) => String(v || '').trim().toLowerCase().replace(/_/g, ' ');
const tidy = (v: string) => (v === v.toLowerCase() ? v.replace(/\b\w/g, (c) => c.toUpperCase()) : v);

export const quotationRef = (q: Quotation) => {
  const no = (q as any).quotation_number;
  return no != null ? `QT-${no}` : (q as any).agreement_ref || `QT-${q.id.substring(0, 8).toUpperCase()}`;
};

/** Place names of a quotation's stops in order, falling back to its origin/destination. */
export function quotationStopNames(q: Quotation): string[] {
  const stops = [...((q.stops || []) as any[])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  if (stops.length > 0) return stops.map((s) => tidy(s.location?.name || s.source_label || 'Place'));
  return [q.route_origin || 'Origin', q.route_destination || 'Destination'].map((n) => tidy(String(n)));
}

export const isMonthlyQuotation = (q: Quotation) => {
  const basis = norm(q.pricing_basis);
  if (basis === 'per month') return true;
  if (basis === 'per trip') return false;
  return norm(q.operation_type || q.billing_type).includes('monthly');
};

/** Not bookable today: switched off, expired, or not started yet. */
export function quotationOffLabel(q: Quotation): string | null {
  const now = new Date();
  if (!q.is_active) return 'Off';
  if (q.valid_to && new Date(q.valid_to) < now) return 'Expired';
  if (q.valid_from && new Date(q.valid_from) > now) return 'Future';
  return null;
}

type Row = { key: string; names: string[]; lineType: string; monthly: boolean; cells: Map<string, Quotation[]> };

/**
 * A customer's quotations as one row per route (+ line type, per trip / monthly)
 * and one price column per truck class — AKS's 36 quotations fit in 12 rows and
 * the prices for each truck sit side by side. Each price opens its quotation.
 */
export function QuotationRouteMatrix({ quotations, onOpen }: { quotations: Quotation[]; onOpen: (q: Quotation) => void }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [quotations]);

  const { rows, classes } = useMemo(() => {
    const byKey = new Map<string, Row>();
    const classSet = new Set<string>();
    for (const q of quotations) {
      const names = quotationStopNames(q);
      const stopKey = ((q.stops || []) as any[]).length
        ? [...(q.stops as any[])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((s) => s.locationId || norm(s.source_label)).join('>')
        : names.map(norm).join('>');
      const lineType = q.line_type || q.rate_category || 'Single Trip';
      const monthly = isMonthlyQuotation(q);
      const key = `${stopKey}|${norm(lineType)}|${monthly ? 'm' : 't'}`;
      const vc = q.vehicle_class || 'Other';
      classSet.add(vc);
      if (!byKey.has(key)) byKey.set(key, { key, names, lineType, monthly, cells: new Map() });
      const row = byKey.get(key)!;
      row.cells.set(vc, [...(row.cells.get(vc) || []), q]);
    }
    const classes = [...classSet].sort((a, b) => {
      const ia = CLASS_ORDER.indexOf(a.toUpperCase());
      const ib = CLASS_ORDER.indexOf(b.toUpperCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const rows = [...byKey.values()].sort((a, b) =>
      Number(a.monthly) - Number(b.monthly) || a.names.join(' ').localeCompare(b.names.join(' ')) || a.lineType.localeCompare(b.lineType));
    for (const r of rows) for (const list of r.cells.values()) list.sort((x, y) => Number(x.rate ?? 0) - Number(y.rate ?? 0));
    return { rows, classes };
  }, [quotations]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/20">
              <th className="px-4 py-2.5">Route</th>
              {classes.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2.5 text-right">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {shown.map((r) => (
              <tr key={r.key} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1 font-semibold text-[#3E3C3D] dark:text-slate-100">
                    {r.names.map((n, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {i > 0 && <ArrowRight className="h-3 w-3 text-slate-400" />}
                        {n}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    {r.monthly && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
                    <span>{r.monthly ? 'Monthly' : 'Per trip'} · {r.lineType}{r.names.length > 2 ? ` · ${r.names.length} stops` : ''}</span>
                  </div>
                </td>
                {classes.map((c) => {
                  const list = r.cells.get(c) || [];
                  return (
                    <td key={c} className="px-3 py-2 text-right">
                      {list.length === 0 ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {list.map((q) => {
                            const off = quotationOffLabel(q);
                            const pay = q.driver_payout != null && !isNaN(Number(q.driver_payout)) ? Number(q.driver_payout) : null;
                            return (
                              <button
                                key={q.id}
                                type="button"
                                onClick={() => onOpen(q)}
                                title={`${quotationRef(q)} · open`}
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 text-right transition-colors hover:bg-[#FA634E]/10',
                                  off && 'opacity-50'
                                )}
                              >
                                <div className="whitespace-nowrap font-mono font-bold text-[#3E3C3D] dark:text-slate-100">
                                  {money(Number(q.rate ?? q.base_price ?? 0))}
                                  {r.monthly && <span className="ml-0.5 text-[10px] font-medium text-slate-500">/mo</span>}
                                </div>
                                <div className="whitespace-nowrap text-[10px] text-slate-500">
                                  {off ? `${off} · ` : ''}{pay != null ? `pay ${money(pay)}` : 'pay —'}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/20">
        <span>
          {quotations.length} quotation{quotations.length === 1 ? '' : 's'} on {rows.length} route{rows.length === 1 ? '' : 's'} · "pay" is the driver pay; "—" means it's asked when the trip is booked
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1.5 tabular-nums">{page} / {pages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
