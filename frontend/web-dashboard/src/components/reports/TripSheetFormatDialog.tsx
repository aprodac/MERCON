import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { LINE_TYPES, TRIP_SHEET_TOKENS, lineTypeLabel, type TemplateLayout } from '@mercon/shared-types';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TemplateMappingEditor from '@/components/reports/TemplateMappingEditor';
import { cn } from '@/lib/utils';
import { reportTemplateService, type ReportTemplateSummary, type TemplateInspection } from '@/services/reportTemplateService';

export const tripSheetFormatsKey = (customerId: string) => ['report-templates', customerId];

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
 * Add a customer's Excel trip-sheet format (upload → check the column mapping → save),
 * or edit a saved one (name, trip filter, mapping, or swap in a new file).
 */
export default function TripSheetFormatDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  /** Set to edit a saved format; absent to add one. */
  template?: ReportTemplateSummary | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!template;

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
  }, [open, template]);

  const handleFile = async (picked: File) => {
    if (!/\.xlsx$/i.test(picked.name)) {
      toast.error('Upload the customer’s sheet as an .xlsx file');
      return;
    }
    setIsInspecting(true);
    try {
      const result = await reportTemplateService.inspect(picked);
      const detected = layoutFromInspection(result);
      if (!detected) {
        toast.error('Couldn’t find a header row in this file. Check it has column titles above the trip rows.');
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
    const rate_category = lineType === ALL_TRIPS ? null : lineType;
    setIsSaving(true);
    try {
      if (template) {
        await reportTemplateService.update(template.id, { name: name.trim(), rate_category, layout, file: file ?? undefined });
        toast.success(`“${name.trim()}” saved`);
      } else {
        if (!file) return;
        await reportTemplateService.create({ file, name: name.trim(), customerId, rate_category, layout });
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
      <DialogContent className={cn('flex max-h-[88vh] flex-col', inspection ? 'sm:max-w-4xl' : 'sm:max-w-md')}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <FileSpreadsheet className="h-4 w-4 text-[#FA634E]" />
            {isEdit ? 'Edit trip sheet format' : 'Add trip sheet format'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {customerName}’s own Excel layout. Their sample rows are replaced with MERCON trips; headers, styling and totals rows stay as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2 pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Format name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monthly trip sheet"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#FA634E] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="space-y-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Line type</span>
              <Select value={lineType} onValueChange={setLineType}>
                <SelectTrigger className="h-8 rounded-lg border-slate-200 bg-slate-50 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TRIPS}>All line types</SelectItem>
                  {LINE_TYPES.map((lt) => (
                    <SelectItem key={lt} value={lt}>{lineTypeLabel(lt)} only</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isInspecting ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-6 dark:border-slate-800 dark:bg-slate-900">
              <RefreshCw className="h-5 w-5 animate-spin text-[#FA634E]" />
              <span className="text-xs font-semibold text-slate-500">Reading the layout…</span>
            </div>
          ) : !inspection ? (
            <label className="group flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-xs font-semibold text-slate-500 transition-all hover:border-[#FA634E] hover:text-[#FA634E] dark:border-slate-700 dark:bg-slate-800/40">
              <Upload className="h-5 w-5 text-slate-400 group-hover:text-[#FA634E]" />
              <span className="font-bold">Upload the customer’s Excel sheet (.xlsx)</span>
              <span className="font-normal text-slate-400">One they sent you, with a few sample rows is best</span>
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="truncate font-mono">{fileLabel}</span>
              </span>
              <label className="cursor-pointer font-semibold text-[#FA634E] hover:underline">
                Replace file
                <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            </div>
          )}

          {inspection && layout && (
            <>
              <TemplateMappingEditor inspection={inspection} layout={layout} onChange={setLayout} canAutoMap={!!file} />
              <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
                <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">
                  Fill heading cells too (invoice no., period…)
                </summary>
                <p className="mt-2 text-slate-500">
                  Type any of these into a cell above or below the trip rows in the Excel file, then upload it again. They’re filled in on export.
                </p>
                <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {TRIP_SHEET_TOKENS.map((t) => (
                    <div key={t.token} className="flex items-baseline gap-2">
                      <code className="shrink-0 font-mono text-[11px] text-[#FA634E]">{`{{${t.token}}}`}</code>
                      <span className="truncate text-slate-500">{t.label}</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>

        {inspection && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 rounded-lg px-3 text-xs font-semibold">
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
