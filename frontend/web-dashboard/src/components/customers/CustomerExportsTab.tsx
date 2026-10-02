import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Download, FilePlus2, FileSpreadsheet, Loader2, Pencil, Plus, ReceiptText, Tag, Trash2, Truck, type LucideIcon } from 'lucide-react';
import { REPORT_SOURCES, REPORT_SOURCE_LABELS, lineTypeLabel, type ReportSource } from '@mercon/shared-types';

import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import ExportFormatDialog, { exportFormatsKey } from '@/components/reports/ExportFormatDialog';
import { cn } from '@/lib/utils';
import { reportTemplateService, type ExportSummary, type ReportTemplateSummary } from '@/services/reportTemplateService';

type Period = 'last_month' | 'this_month' | 'custom';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const money = (v = 0) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorText = (err: any, fallback: string) => err?.response?.data?.error?.message || err?.userMessage || fallback;

const SOURCE_ICON: Record<ReportSource, LucideIcon> = { trips: Truck, statement: ReceiptText, rates: Tag };

/** One line under each group heading: what that data holds for the period. */
function summaryText(source: ReportSource, s?: ExportSummary): string {
  if (!s) return '';
  if (source === 'trips') return `${s.rows} trip${s.rows === 1 ? '' : 's'} · SAR ${money(s.amount)}`;
  if (source === 'statement') return `${s.rows} entr${s.rows === 1 ? 'y' : 'ies'} · closing balance SAR ${money(s.closingBalance)}`;
  return `${s.rows} active quotation${s.rows === 1 ? '' : 's'}`;
}

function emptyColumns(t: ReportTemplateSummary) {
  return (t.layout?.columns ?? []).filter((c) => c.source.kind === 'blank').length;
}

/**
 * Customer → Excel exports: the customer's own Excel layouts, grouped by the
 * data they hold (trips, statement of account, rates), each with its own
 * Download for the period picked at the top. Standard MERCON-layout exports
 * cover customers who haven't given a format. An invoice's trip sheet is
 * downloaded from the invoice itself (Trip sheet), which takes exactly its trips.
 */
export default function CustomerExportsTab({ customerId, customerName }: { customerId: string; customerName: string }) {
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<Period>('last_month');
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const range = useMemo(() => {
    const now = new Date();
    if (period === 'this_month') return { startDate: ymd(startOfMonth(now)), endDate: ymd(endOfMonth(now)) };
    if (period === 'last_month') {
      const last = subMonths(now, 1);
      return { startDate: ymd(startOfMonth(last)), endDate: ymd(endOfMonth(last)) };
    }
    return custom.from && custom.to ? { startDate: ymd(custom.from), endDate: ymd(custom.to) } : null;
  }, [period, custom]);

  const { data: formats = [], isLoading, isError } = useQuery({
    queryKey: exportFormatsKey(customerId),
    queryFn: () => reportTemplateService.list(customerId),
  });
  const { data: summary } = useQuery({
    queryKey: ['report-templates', 'summary', customerId, range],
    queryFn: () => reportTemplateService.summary(customerId, range!),
    enabled: !!range,
  });

  const [dialog, setDialog] = useState<{ open: boolean; template: ReportTemplateSummary | null; source: ReportSource }>({
    open: false,
    template: null,
    source: 'trips',
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const bySource = useMemo(() => {
    const groups: Record<ReportSource, ReportTemplateSummary[]> = { trips: [], statement: [], rates: [] };
    for (const f of formats) (groups[f.source] ?? groups.trips).push(f);
    return groups;
  }, [formats]);

  const runFor = (source: ReportSource) => (source === 'rates' ? {} : range);

  const download = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (err) {
      toast.error(errorText(err, 'Could not build the export'));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (t: ReportTemplateSummary) => {
    try {
      await reportTemplateService.remove(t.id);
      toast.success(`“${t.name}” removed`);
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
    } catch (err) {
      toast.error(errorText(err, 'Could not remove the format'));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const periodLabel = range ? `${format(new Date(range.startDate), 'd MMM')} – ${format(new Date(range.endDate), 'd MMM yyyy')}` : 'Pick dates';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800">
      {/* ── Header: title · period (applies to every download) · new format ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Excel exports</h3>
        <span className="text-xs text-slate-400">{formats.length} format{formats.length === 1 ? '' : 's'}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {([['last_month', 'Last month'], ['this_month', 'This month'], ['custom', 'Custom']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                  period === value ? 'bg-[#FA634E] text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' ? (
            <DateRangePicker
              value={{ from: custom.from, to: custom.to }}
              onChange={(r) => setCustom({ from: r?.from, to: r?.to })}
              buttonClassName="h-8 w-56 rounded-lg text-xs font-semibold"
            />
          ) : (
            <span className="text-xs text-slate-500">{periodLabel}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ open: true, template: null, source: 'trips' })}
            className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> New format
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-xs text-slate-400">Loading formats…</div>
      ) : isError ? (
        <div className="py-10 text-center text-xs text-slate-400">Formats couldn’t be loaded. Try again, or check the “Customer Excel exports” module is on.</div>
      ) : (
        REPORT_SOURCES.map((source) => {
          const Icon = SOURCE_ICON[source];
          const group = bySource[source];
          return (
            <section key={source} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
              <div className="flex items-center gap-1.5 bg-slate-50/70 px-4 py-1.5 text-[11px] dark:bg-slate-900/60">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold text-slate-600 dark:text-slate-300">{REPORT_SOURCE_LABELS[source]}</span>
                <span className="text-slate-400">· {source === 'rates' || range ? summaryText(source, summary?.[source]) || '…' : 'pick dates'}</span>
              </div>

              {group.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setDialog({ open: true, template: null, source })}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <FilePlus2 className="h-4 w-4" />
                  No format yet — <span className="font-semibold text-[#FA634E]">upload their {REPORT_SOURCE_LABELS[source].toLowerCase()} sheet</span>
                </button>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {group.map((t) => {
                    const empty = emptyColumns(t);
                    const shared = !t.customerId;
                    const run = runFor(source);
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                        <FileSpreadsheet className={cn('h-4 w-4 shrink-0', empty > 0 ? 'text-amber-500' : 'text-emerald-600')} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {t.name}
                            {shared && <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[10px] font-medium text-slate-500 dark:bg-slate-800">Shared</span>}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            <span className="font-mono">{t.original_filename}</span>
                            {source !== 'statement' && <> · {t.rate_category ? `${lineTypeLabel(t.rate_category)} only` : 'all line types'}</>}
                            {' · '}
                            {empty > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">{empty} column{empty === 1 ? '' : 's'} empty</span>
                            ) : (
                              `${t.layout?.columns?.length ?? 0} columns`
                            )}
                          </p>
                        </div>

                        {confirmDeleteId === t.id ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => handleDelete(t)} className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              Remove
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-800">
                              Keep
                            </button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button type="button" onClick={() => setDialog({ open: true, template: t, source })} title="Edit format" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteId(t.id)} title="Remove format" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={shared || !run || busy === t.id}
                          title={shared ? 'A shared format can only be used from an invoice' : !run ? 'Pick dates first' : `Download for ${source === 'rates' ? 'the active quotations' : periodLabel}`}
                          onClick={() => run && download(t.id, () => reportTemplateService.download(t.id, run))}
                          className="h-7 shrink-0 gap-1.5 rounded-lg text-xs font-semibold"
                        >
                          {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Download
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}

      {/* ── MERCON's own layout, for customers who haven't given one ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
        <span className="text-slate-500">Standard MERCON layout, no format needed:</span>
        {REPORT_SOURCES.map((source) => {
          const key = `standard:${source}`;
          const needsRange = source !== 'rates';
          return (
            <button
              key={source}
              type="button"
              disabled={(needsRange && !range) || busy === key}
              onClick={() => download(key, () => reportTemplateService.downloadStandard(source, customerId, needsRange ? range! : undefined))}
              className="flex items-center gap-1 font-semibold text-[#FA634E] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === key && <Loader2 className="h-3 w-3 animate-spin" />}
              {REPORT_SOURCE_LABELS[source]}
            </button>
          );
        })}
      </div>

      <ExportFormatDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        customerId={customerId}
        customerName={customerName}
        template={dialog.template}
        defaultSource={dialog.source}
      />
    </div>
  );
}
