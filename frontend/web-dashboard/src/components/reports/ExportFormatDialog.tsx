import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Braces, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import {
  LINE_TYPES,
  REPORT_SOURCES,
  REPORT_SOURCE_LABELS,
  TRIP_SHEET_TOKENS,
  lineTypeLabel,
  type ReportSource,
  type TemplateLayout,
} from '@mercon/shared-types';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TemplateMappingEditor from '@/components/reports/TemplateMappingEditor';
import { cn } from '@/lib/utils';
import { reportTemplateService, type ReportTemplateSummary, type TemplateInspection } from '@/services/reportTemplateService';

export const exportFormatsKey = (customerId: string) => ['report-templates', customerId];

const ALL_TRIPS = 'all';

/** Rebuilds an inspection from a saved layout so the mapping editor can show it without the original upload. */
function inspectionFromLayout(layout: TemplateLayout): TemplateInspection {
  return {
    allSheets: [layout.sheetName],
    bestSheet: {
      sheetName: layout.sheetName,
      headerRowIdx: layout.headerRowIdx,
      dataStartRow: layout.dataStartRow,
      dataEndRow: layout.dataEndRow,
      bandSize: layout.bandSize || 1,
      columns: layout.columns.map((c) => ({
        colIndex: c.colIndex,
        headerText: c.headerText,
        sampleValue: '',
        suggestedField: c.source.kind === 'field' ? c.source.key : null,
      })),
    },
  };
}

function layoutFromInspection(inspection: TemplateInspection): TemplateLayout | null {
  const s = inspection.bestSheet;
  if (!s) return null;
  return {
    sheetName: s.sheetName,
    headerRowIdx: s.headerRowIdx,
    dataStartRow: s.dataStartRow,
    dataEndRow: s.dataEndRow,
    bandSize: s.bandSize,
    columns: s.columns.map((c) => ({
      colIndex: c.colIndex,
      headerText: c.headerText,
      source: c.suggestedField ? { kind: 'field' as const, key: c.suggestedField } : { kind: 'blank' as const },
    })),
  };
}

const errorText = (err: any, fallback: string) => err?.response?.data?.error?.message || err?.userMessage || fallback;

/**
 * Add a customer's Excel export format — pick the data (trips, statement, rates),
 * upload their sheet, check the column mapping, save — or edit a saved one
 * (name, line-type filter, mapping, or swap in a new file). The data type is
 * fixed once a format exists.
 */
export default function ExportFormatDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  template,
  defaultSource = 'trips',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  /** Set to edit a saved format; absent to add one. */
  template?: ReportTemplateSummary | null;
  /** Data type preselected when adding (e.g. from a group's "upload" link). */
  defaultSource?: ReportSource;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!template;

  const [source, setSource] = useState<ReportSource>('trips');
  const [name, setName] = useState('');
  // The API field is `rate_category`, the legacy name for the trip's line type.
  const [lineType, setLineType] = useState<string>(ALL_TRIPS);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<TemplateInspection | null>(null);
  const [layout, setLayout] = useState<TemplateLayout | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setSource(template?.source ?? defaultSource);
    setName(template?.name ?? '');
    setLineType(template?.rate_category ?? ALL_TRIPS);
    if (template) {
      const copy: TemplateLayout = JSON.parse(JSON.stringify(template.layout));
      setLayout(copy);
      setInspection(inspectionFromLayout(copy));
    } else {
      setLayout(null);
      setInspection(null);
    }
  }, [open, template, defaultSource]);

  const handleFile = async (picked: File) => {
    if (!/\.xlsx$/i.test(picked.name)) {
      toast.error('Upload the customer’s sheet as an .xlsx file');
      return;
    }
    setIsInspecting(true);
    try {
      const result = await reportTemplateService.inspect(picked, source);
      const detected = layoutFromInspection(result);
      if (!detected) {
        toast.error('Couldn’t find a header row in this file. Check it has column titles above the data rows.');
        return;
      }
      setFile(picked);
      setInspection(result);
      setLayout(detected);
      if (!name.trim()) setName(picked.name.replace(/\.xlsx$/i, ''));
    } catch (err) {
      toast.error(errorText(err, 'Could not read the file'));
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSave = async () => {
    if (!layout) return;
    if (!name.trim()) {
      toast.error('Give the format a name');
      return;
    }
    const rate_category = lineType === ALL_TRIPS || source === 'statement' ? null : lineType;
    setIsSaving(true);
    try {
      if (template) {
        await reportTemplateService.update(template.id, { name: name.trim(), rate_category, layout, file: file ?? undefined });
        toast.success(`“${name.trim()}” saved`);
      } else {
        if (!file) return;
        await reportTemplateService.create({ file, name: name.trim(), customerId, source, rate_category, layout });
        toast.success(`“${name.trim()}” added for ${customerName}`);
      }
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorText(err, 'Could not save the format'));
    } finally {
      setIsSaving(false);
    }
  };

  const fileLabel = file?.name ?? template?.original_filename;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('flex flex-col gap-0 overflow-hidden p-0', inspection ? 'h-[88vh] sm:max-w-5xl' : 'sm:max-w-md')}
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12 dark:border-slate-800">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
            {isEdit ? 'Edit export format' : 'Add export format'}
            {(isEdit || inspection) && (
              <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {REPORT_SOURCE_LABELS[source]}
              </span>
            )}
            <span className="truncate text-xs font-normal text-slate-400">· {customerName}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Map {customerName}’s Excel columns to MERCON {REPORT_SOURCE_LABELS[source].toLowerCase()} fields.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-4">
          {/* Before upload: which data the sheet holds — decides the field list and the header matching. */}
          {!isEdit && !inspection && (
            <div className="grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {REPORT_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
                    source === s
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  )}
                >
                  {REPORT_SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          )}

          {/* Name · line type · file — one row */}
          <div
            className={cn(
              'grid shrink-0 gap-2',
              inspection
                ? source === 'statement'
                  ? 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)]'
                  : 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.4fr)]'
                : source === 'statement'
                  ? ''
                  : 'sm:grid-cols-2'
            )}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={source === 'trips' ? 'Format name, e.g. Monthly trips' : source === 'statement' ? 'Format name, e.g. Monthly SOA' : 'Format name, e.g. Rate card 2026'}
              aria-label="Format name"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#FA634E] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {source !== 'statement' && (
              <Select value={lineType} onValueChange={setLineType}>
                <SelectTrigger aria-label="Line type" className="h-8 rounded-lg border-slate-200 text-xs font-semibold dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TRIPS}>All line types</SelectItem>
                  {LINE_TYPES.map((lt) => (
                    <SelectItem key={lt} value={lt}>{lineTypeLabel(lt)} only</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {inspection && (
              <div className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs dark:border-slate-700">
                <span className="truncate font-mono text-[11px] text-slate-600 dark:text-slate-300" title={fileLabel}>{fileLabel}</span>
                <label className="ml-auto shrink-0 cursor-pointer font-semibold text-[#FA634E] hover:underline">
                  {isInspecting ? 'Reading…' : 'Replace'}
                  <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            )}
          </div>

          {!inspection &&
            (isInspecting ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 py-8 text-xs font-semibold text-slate-500 dark:border-slate-800">
                <RefreshCw className="h-4 w-4 animate-spin text-[#FA634E]" /> Reading the layout…
              </div>
            ) : (
              <label className="group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 py-8 text-xs font-semibold text-slate-500 transition-colors hover:border-[#FA634E] hover:text-[#FA634E] dark:border-slate-700">
                <Upload className="h-5 w-5 text-slate-400 group-hover:text-[#FA634E]" />
                Upload their {REPORT_SOURCE_LABELS[source].toLowerCase()} sheet (.xlsx)
                <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            ))}

          {inspection && layout && (
            <TemplateMappingEditor inspection={inspection} layout={layout} onChange={setLayout} canAutoMap={!!file} source={source} />
          )}
        </div>

        {inspection && (
          <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                  <Braces className="h-3.5 w-3.5" /> Heading tokens
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3 text-xs">
                <p className="mb-2 text-slate-500">Type one into any cell outside the data rows in the Excel file; it’s filled on export.</p>
                <div className="space-y-1">
                  {TRIP_SHEET_TOKENS.filter((t) => t.sources.includes(source)).map((t) => (
                    <div key={t.token} className="flex items-baseline gap-2">
                      <code className="shrink-0 font-mono text-[11px] text-[#FA634E]">{`{{${t.token}}}`}</code>
                      <span className="truncate text-slate-500">{t.label}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="ml-auto h-8 rounded-lg px-3 text-xs font-semibold">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[#FA634E] px-4 text-xs font-bold text-white hover:bg-[#FA634E]/90"
            >
              {isSaving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save changes' : 'Save format'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
