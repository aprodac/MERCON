import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Download, FileSpreadsheet, Pencil, Plus, ReceiptText, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TripSheetFormatDialog, { tripSheetFormatsKey } from '@/components/reports/TripSheetFormatDialog';
import { cn } from '@/lib/utils';
import { reportTemplateService, type ReportTemplateSummary } from '@/services/reportTemplateService';

type Period = 'this_month' | 'last_month' | 'custom';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorText = (err: any, fallback: string) => err?.response?.data?.error?.message || err?.userMessage || fallback;

function mappedCount(t: ReportTemplateSummary) {
  const cols = t.layout?.columns ?? [];
  return { mapped: cols.filter((c) => c.source.kind !== 'blank').length, total: cols.length };
}

/**
 * Customer → Trip sheets: the customer's own Excel layouts for the trip list
 * sent with their invoice, and a date-range export. The usual export is from
 * the invoice itself (Invoice → Trip sheet), which takes exactly its trips.
 */
export default function CustomerTripSheetsTab({ customerId, customerName }: { customerId: string; customerName: string }) {
  const queryClient = useQueryClient();
  const { data: formats = [], isLoading, isError } = useQuery({
    queryKey: tripSheetFormatsKey(customerId),
    queryFn: () => reportTemplateService.list(customerId),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReportTemplateSummary | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [pickedId, setPickedId] = useState<string>('');
  const selectedId = formats.some((f) => f.id === pickedId) ? pickedId : formats[0]?.id ?? '';
  const [period, setPeriod] = useState<Period>('last_month');
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const [downloading, setDownloading] = useState(false);

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'this_month') return { startDate: ymd(startOfMonth(now)), endDate: ymd(endOfMonth(now)) };
    if (period === 'last_month') {
      const last = subMonths(now, 1);
      return { startDate: ymd(startOfMonth(last)), endDate: ymd(endOfMonth(last)) };
    }
    return custom.from && custom.to ? { startDate: ymd(custom.from), endDate: ymd(custom.to) } : null;
  }, [period, custom]);

  const selected = formats.find((f) => f.id === selectedId);
  const canExport = !!selected?.customerId && !!range;

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['report-templates', 'preview', selectedId, range],
    queryFn: () => reportTemplateService.preview(selectedId, range!),
    enabled: canExport,
  });

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: ReportTemplateSummary) => {
    setEditing(t);
    setDialogOpen(true);
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

  const handleDownload = async () => {
    if (!selectedId || !range) return;
    setDownloading(true);
    try {
      await reportTemplateService.download(selectedId, range);
    } catch (err) {
      toast.error(errorText(err, 'Could not build the trip sheet'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* ── Formats ── */}
      <div className="space-y-3 lg:col-span-3">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Trip sheet formats</h3>
            <p className="text-[11px] text-slate-500">{customerName}’s own Excel layouts for the trip list sent with each invoice.</p>
          </div>
          {formats.length > 0 && (
            <Button variant="outline" size="sm" onClick={openAdd} className="h-8 shrink-0 gap-1.5 rounded-lg text-xs font-semibold">
              <Plus className="h-3.5 w-3.5" /> Add format
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading formats…</div>
        ) : isError ? (
          <div className="py-8 text-center text-xs text-slate-400">Trip sheet formats couldn’t be loaded. Try again, or check the “Customer trip sheets” module is on.</div>
        ) : formats.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-800">
            <FileSpreadsheet className="h-7 w-7 text-slate-300" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No trip sheet format yet</p>
            <p className="max-w-sm text-xs text-slate-500">
              Upload the Excel sheet {customerName} wants trips in. MERCON fills it with the invoice’s trips and keeps their layout.
            </p>
            <Button size="sm" onClick={openAdd} className="mt-1 h-8 gap-1.5 rounded-lg bg-[#FA634E] text-xs font-bold text-white hover:bg-[#FA634E]/90">
              <Plus className="h-3.5 w-3.5" /> Add format
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {formats.map((t) => {
              const { mapped, total } = mappedCount(t);
              const shared = !t.customerId;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {t.name}
                        {shared && <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[10px] font-medium text-slate-500 dark:bg-slate-800">Shared</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        <span className="font-mono">{t.original_filename}</span>
                        {' · '}
                        <span className={cn(mapped < total && 'text-amber-600 dark:text-amber-400')}>{mapped} of {total} columns filled</span>
                        {' · '}
                        {t.rate_category ? `only “${t.rate_category}” trips` : 'all trips'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {confirmDeleteId === t.id ? (
                      <>
                        <button type="button" onClick={() => handleDelete(t)} className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          Remove
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-800">
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => openEdit(t)} title="Edit format" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(t.id)} title="Remove format" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Export by date range ── */}
      <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 lg:col-span-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Export trips</h3>
          <p className="flex items-start gap-1 text-[11px] text-slate-500">
            <ReceiptText className="mt-px h-3 w-3 shrink-0" />
            Sending it with an invoice? Use “Trip sheet” on the invoice — it takes exactly the invoice’s trips.
          </p>
        </div>

        <div className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Format</span>
          <Select value={selectedId} onValueChange={setPickedId} disabled={formats.length === 0}>
            <SelectTrigger className="h-8 rounded-lg text-xs font-semibold">
              <SelectValue placeholder="Add a format first" />
            </SelectTrigger>
            <SelectContent>
              {formats.map((t) => (
                <SelectItem key={t.id} value={t.id} disabled={!t.customerId}>
                  {t.name}{!t.customerId ? ' (shared — invoice only)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Trips from</span>
          <div className="flex gap-1">
            {([['last_month', 'Last month'], ['this_month', 'This month'], ['custom', 'Custom']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                  period === value
                    ? 'border-[#FA634E] bg-orange-50 text-[#FA634E] dark:bg-orange-950/30'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <DateRangePicker
              value={{ from: custom.from, to: custom.to }}
              onChange={(r) => setCustom({ from: r?.from, to: r?.to })}
              buttonClassName="mt-1 h-8 w-full rounded-lg text-xs font-semibold"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {!canExport ? (
              <span className="text-slate-400">Pick a format and dates</span>
            ) : previewLoading ? (
              <span className="text-slate-400">Counting trips…</span>
            ) : preview ? (
              <>
                <strong className="text-slate-900 dark:text-white">{preview.total}</strong> trips
                <span className="text-slate-400"> · </span>
                <span className="font-mono">SAR {money(preview.amount)}</span>
              </>
            ) : null}
          </p>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!canExport || downloading || preview?.total === 0}
            className="h-8 gap-1.5 rounded-lg bg-[#FA634E] px-3 text-xs font-bold text-white hover:bg-[#FA634E]/90"
          >
            {downloading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download .xlsx
          </Button>
        </div>
      </div>

      <TripSheetFormatDialog open={dialogOpen} onOpenChange={setDialogOpen} customerId={customerId} customerName={customerName} template={editing} />
    </div>
  );
}
