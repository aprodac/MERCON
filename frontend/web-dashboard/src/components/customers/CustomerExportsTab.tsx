import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Download, FileSpreadsheet, Loader2, Pencil, Plus, ReceiptText, Tag, Trash2, Truck, type LucideIcon } from 'lucide-react';
import { REPORT_SOURCES, REPORT_SOURCE_LABELS, lineTypeLabel, type ReportSource } from '@mercon/shared-types';

import { Badge, EmptyRow, Section, Segmented, SkeletonRows, Toolbar, ui } from '@/components/customers/customerUi';
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
const SOURCE_TONE: Record<ReportSource, string> = {
  trips: 'text-[#E5533F]',
  statement: 'text-indigo-600 dark:text-indigo-400',
  rates: 'text-amber-600 dark:text-amber-400',
};

/** What that data holds for the period, next to each group heading. */
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
 * Customer → Excel trip sheets: the customer's own Excel layouts, grouped by
 * the data they hold (trips, statement of account, rates), each with its own
 * Download for the period picked at the top. MERCON's standard layout covers
 * customers who haven't given a format. An invoice's trip sheet is downloaded
 * from the invoice itself (Trip sheet), which takes exactly its trips.
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
  const upload = (source: ReportSource) => setDialog({ open: true, template: null, source });

  return (
    <>
      <Section
        title="Excel trip sheets"
        meta={<span className="hidden text-xs font-normal text-slate-500 sm:inline">{customerName}'s own layouts, filled from MERCON — or the standard layout</span>}
        action={
          <Button size="sm" onClick={() => upload('trips')} className={ui.btnSm}>
            <Plus /> Upload their format
          </Button>
        }
      >
        <Toolbar>
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { id: 'last_month', label: 'Last month' },
              { id: 'this_month', label: 'This month' },
              { id: 'custom', label: 'Custom' },
            ]}
          />
          {period === 'custom' ? (
            <DateRangePicker
              value={{ from: custom.from, to: custom.to }}
              onChange={(r) => setCustom({ from: r?.from, to: r?.to })}
              buttonClassName="h-8 w-60 rounded-md text-[13px]"
            />
          ) : (
            <span className="px-1 text-[13px] font-medium text-slate-700 tabular-nums dark:text-slate-200">{periodLabel}</span>
          )}
          <span className="ml-auto hidden text-xs text-slate-500 md:inline">Trips and statement downloads use this period; rates are always the active quotations.</span>
        </Toolbar>

        {isLoading ? (
          <SkeletonRows rows={6} />
        ) : isError ? (
          <EmptyRow icon={FileSpreadsheet}>Formats couldn't be loaded — try again, or check the “Customer Excel exports” module is on.</EmptyRow>
        ) : (
          <div>
            {REPORT_SOURCES.map((source) => {
              const Icon = SOURCE_ICON[source];
              const group = bySource[source];
              const standardKey = `standard:${source}`;
              const needsRange = source !== 'rates';
              const summaryLine = source === 'rates' || range ? summaryText(source, summary?.[source]) || 'Counting…' : 'Pick dates first';
              return (
                <div key={source} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-slate-50/70 px-4 py-2 dark:bg-slate-800/30">
                    <Icon className={cn('size-4', SOURCE_TONE[source])} />
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-white">{REPORT_SOURCE_LABELS[source]}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{summaryLine}</span>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.map((t) => {
                      const empty = emptyColumns(t);
                      const shared = !t.customerId;
                      const run = runFor(source);
                      return (
                        <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                          <FileSpreadsheet className={cn('size-4 shrink-0', empty > 0 ? 'text-amber-500' : 'text-emerald-600')} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-[13px] font-medium text-slate-900 dark:text-white">
                              <span className="truncate">{t.name}</span>
                              {shared && <Badge>Shared</Badge>}
                            </p>
                            <p className="truncate text-xs text-slate-500" title={t.original_filename}>
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
                              <span className="mr-1 text-xs text-slate-500">Remove this format?</span>
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(t)} className={cn(ui.btnSm, 'h-7 px-2.5')}>Remove</Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)} className={cn(ui.btnSm, 'h-7 px-2.5')}>Keep</Button>
                            </div>
                          ) : (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={shared || !run || busy === t.id}
                                title={shared ? 'A shared format can only be used from an invoice' : !run ? 'Pick dates first' : `Download for ${source === 'rates' ? 'the active quotations' : periodLabel}`}
                                onClick={() => run && download(t.id, () => reportTemplateService.download(t.id, run))}
                                className={ui.btnSm}
                              >
                                {busy === t.id ? <Loader2 className="animate-spin" /> : <Download />} Download
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, template: t, source })} title="Edit format" aria-label="Edit format" className={cn(ui.iconSm, 'text-slate-500')}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteId(t.id)} title="Remove format" aria-label="Remove format" className={cn(ui.iconSm, 'text-slate-500 hover:bg-rose-50 hover:text-rose-600')}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {group.length === 0 && (
                      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] text-slate-500">
                        <FileSpreadsheet className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                        <span className="flex-1">No {REPORT_SOURCE_LABELS[source].toLowerCase()} layout from them yet — we fill theirs in their columns every time.</span>
                        <Button variant="ghost" size="sm" onClick={() => upload(source)} className={cn(ui.btnSm, 'h-7 px-2 text-[#E5533F] hover:text-[#C2412D]')}>
                          <Plus /> Upload
                        </Button>
                      </li>
                    )}
                    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                      <FileSpreadsheet className="size-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-white">MERCON standard layout</p>
                        <p className="text-xs text-slate-500">Built in · always available</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(needsRange && !range) || busy === standardKey}
                        onClick={() => download(standardKey, () => reportTemplateService.downloadStandard(source, customerId, needsRange ? range! : undefined))}
                        className={ui.btnSm}
                      >
                        {busy === standardKey ? <Loader2 className="animate-spin" /> : <Download />} Download
                      </Button>
                      {/* Keeps Download aligned with the format rows' edit / remove buttons */}
                      <span className="hidden w-[60px] sm:block" />
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <ExportFormatDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        customerId={customerId}
        customerName={customerName}
        template={dialog.template}
        defaultSource={dialog.source}
      />
    </>
  );
}
