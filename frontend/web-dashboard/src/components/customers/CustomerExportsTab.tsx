import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Download, FilePlus2, FileSpreadsheet, Loader2, Pencil, Plus, ReceiptText, Tag, Trash2, Truck, type LucideIcon } from 'lucide-react';
import { REPORT_SOURCES, REPORT_SOURCE_LABELS, lineTypeLabel, type ReportSource } from '@mercon/shared-types';

import { Badge, EmptyBlock, IconTile, Panel, ui } from '@/components/customers/customerUi';
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
    <div className="flex flex-col gap-6">
      {/* ── Header: what this is · the period every download uses · upload a format ── */}
      <section className={cn(ui.card, 'flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between')}>
        <div className="flex items-start gap-3">
          <IconTile icon={FileSpreadsheet} tone="emerald" />
          <div>
            <h2 className={ui.h2}>Excel trip sheets</h2>
            <p className={cn(ui.muted, 'mt-0.5 max-w-xl')}>
              Download {customerName}'s trips, statement and rates in the Excel layout they asked for — or MERCON's standard layout if they haven't given one.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Period">
            {([['last_month', 'Last month'], ['this_month', 'This month'], ['custom', 'Custom']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                className={cn(
                  'h-8 rounded-md px-3 text-[13px] font-medium transition-colors cursor-pointer',
                  period === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
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
              buttonClassName="h-9 w-60 rounded-lg text-[13px]"
            />
          ) : (
            <span className="px-1 text-[13px] text-slate-500 tabular-nums">{periodLabel}</span>
          )}
          <button type="button" onClick={() => setDialog({ open: true, template: null, source: 'trips' })} className={cn(ui.btn, ui.btnPrimary)}>
            <Plus className="size-4" /> Upload their format
          </button>
        </div>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : isError ? (
        <EmptyBlock icon={FileSpreadsheet} title="Formats couldn't be loaded" text="Try again, or check the “Customer Excel exports” module is on." />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          {REPORT_SOURCES.map((source) => {
            const group = bySource[source];
            const standardKey = `standard:${source}`;
            const needsRange = source !== 'rates';
            const summaryLine = source === 'rates' || range ? summaryText(source, summary?.[source]) || 'Counting…' : 'Pick dates first';
            return (
              <Panel
                key={source}
                title={REPORT_SOURCE_LABELS[source]}
                description={summaryLine}
                icon={SOURCE_ICON[source]}
                tone={source === 'trips' ? 'brand' : source === 'statement' ? 'indigo' : 'amber'}
                flush
              >
                <div className="border-t border-slate-100 dark:border-slate-800">
                  {group.length === 0 ? (
                    <div className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setDialog({ open: true, template: null, source })}
                        className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center transition-colors hover:border-[#FA634E]/50 hover:bg-orange-50/40 dark:border-slate-700 cursor-pointer"
                      >
                        <FilePlus2 className="mb-1 size-5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Upload their {REPORT_SOURCE_LABELS[source].toLowerCase()} sheet</span>
                        <span className={ui.muted}>We fill it in their columns every time</span>
                      </button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {group.map((t) => {
                        const empty = emptyColumns(t);
                        const shared = !t.customerId;
                        const run = runFor(source);
                        return (
                          <li key={t.id} className="flex flex-col gap-3 px-5 py-4">
                            <div className="flex items-start gap-3">
                              <FileSpreadsheet className={cn('mt-0.5 size-4 shrink-0', empty > 0 ? 'text-amber-500' : 'text-emerald-600')} />
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                                  <span className="truncate">{t.name}</span>
                                  {shared && <Badge>Shared</Badge>}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-slate-500" title={t.original_filename}>
                                  {source !== 'statement' && <>{t.rate_category ? `${lineTypeLabel(t.rate_category)} only` : 'All line types'} · </>}
                                  {empty > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400">{empty} column{empty === 1 ? '' : 's'} not mapped</span>
                                  ) : (
                                    `${t.layout?.columns?.length ?? 0} columns`
                                  )}
                                </p>
                              </div>
                              {confirmDeleteId === t.id ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button type="button" onClick={() => handleDelete(t)} className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300">Remove</button>
                                  <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-800">Keep</button>
                                </div>
                              ) : (
                                <div className="flex shrink-0 items-center">
                                  <button type="button" onClick={() => setDialog({ open: true, template: t, source })} title="Edit format" aria-label="Edit format" className={cn(ui.iconBtn, 'size-7')}>
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button type="button" onClick={() => setConfirmDeleteId(t.id)} title="Remove format" aria-label="Remove format" className={cn(ui.iconBtn, 'size-7 hover:bg-rose-50 hover:text-rose-600')}>
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={shared || !run || busy === t.id}
                              title={shared ? 'A shared format can only be used from an invoice' : !run ? 'Pick dates first' : `Download for ${source === 'rates' ? 'the active quotations' : periodLabel}`}
                              onClick={() => run && download(t.id, () => reportTemplateService.download(t.id, run))}
                              className={cn(ui.btn, ui.btnOutline, 'h-8 w-full')}
                            >
                              {busy === t.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                              Download {source === 'rates' ? '' : periodLabel}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/30">
                    <span className="text-xs text-slate-500">MERCON standard layout</span>
                    <button
                      type="button"
                      disabled={(needsRange && !range) || busy === standardKey}
                      onClick={() => download(standardKey, () => reportTemplateService.downloadStandard(source, customerId, needsRange ? range! : undefined))}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#E5533F] hover:underline disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      {busy === standardKey ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      Download
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

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
