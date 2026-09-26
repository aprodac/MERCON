import React, { useState, useEffect } from 'react';
import { Download, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { exportExcelTable, downloadCSVTable, exportPDFTable } from '@/utils/exportUtils';

export interface ExportColumn<T> {
  id: string;
  label: string;
  accessor: (row: T, index: number) => string | number | boolean | null;
  defaultSelected?: boolean;
}

export interface ExportFilter<T = any> {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  defaultValue?: string;
  filterFn: (row: T, selectedValue: string) => boolean;
}

export interface ExportModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fileNamePrefix?: string;
  filename?: string;
  sheetName?: string;
  subtitle?: string;
  // Data sources
  filteredData?: T[];
  data?: T[];
  allData?: T[];
  selectedData?: T[];
  totalCount?: number;
  // Columns
  columns: ExportColumn<T>[];
  // Optional custom filters within the export modal
  filters?: ExportFilter<T>[];
  // Formats supported (default: xlsx & csv)
  formats?: ('xlsx' | 'csv' | 'pdf')[];
  initialFormat?: 'xlsx' | 'csv' | 'pdf';
  // Themes supported for Excel export
  themes?: { id: string; label: string }[];
  // Optional date filtering
  rowDateAccessor?: (row: T) => string | Date | null | undefined;
  dateRangeLabel?: string;
}

export default function ExportModal<T = any>({
  isOpen,
  onClose,
  title,
  description = 'Choose your export preferences, filters, and columns.',
  fileNamePrefix,
  filename,
  sheetName,
  subtitle,
  filteredData,
  data,
  allData,
  selectedData = [],
  totalCount,
  columns,
  filters = [],
  formats = ['xlsx', 'pdf'],
  themes = [],
  rowDateAccessor,
  dateRangeLabel = 'Date Range',
  initialFormat = 'xlsx',
}: ExportModalProps<T>) {
  const effectivePrefix = filename || fileNamePrefix || 'Export';
  const effectiveFilteredData = data || filteredData || [];
  const allowedFormats = (formats || []).filter((f) => f !== 'csv');
  const [scope, setScope] = useState<'filtered' | 'all' | 'selected'>('filtered');
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'pdf'>(initialFormat);
  const [theme, setTheme] = useState<string>(themes[0]?.id || 'standard');
  const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({});
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  // Initialize columns and filter defaults when modal opens or columns change
  useEffect(() => {
    if (isOpen) {
      const initialCols: Record<string, boolean> = {};
      columns.forEach((col) => {
        initialCols[col.id] = col.defaultSelected !== false;
      });
      setSelectedColumns(initialCols);

      const initialFilters: Record<string, string> = {};
      filters.forEach((f) => {
        initialFilters[f.id] = f.defaultValue || 'All';
      });
      setFilterValues(initialFilters);
      setStartDate('');
      setEndDate('');

      // Default scope
      if (selectedData && selectedData.length > 0) {
        setScope('selected');
      } else {
        setScope('filtered');
      }
    }
  }, [isOpen, columns, filters, selectedData]);

  const allColumnsSelected = Object.keys(selectedColumns).length > 0 &&
    Object.values(selectedColumns).every(Boolean);

  const toggleAllColumns = () => {
    const nextState = !allColumnsSelected;
    const updated: Record<string, boolean> = {};
    columns.forEach((col) => {
      updated[col.id] = nextState;
    });
    setSelectedColumns(updated);
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    if (newTheme === 'jd-monthly') {
      const jdColumns = [
        'jd_sl', 'jd_date', 'jd_job', 'jd_driver', 'jd_vehicle', 'jd_vehicle_type', 'jd_mobile', 
        'jd_provider', 'jd_customer', 'jd_receiver', 'jd_waiting', 'jd_stops', 
        'jd_billing', 'jd_total', 'jd_trip_charge', 'jd_balance', 'jd_company'
      ];
      const updated: Record<string, boolean> = {};
      columns.forEach((col) => {
        updated[col.id] = jdColumns.includes(col.id);
      });
      setSelectedColumns(updated);
    } else {
      const updated: Record<string, boolean> = {};
      columns.forEach((col) => {
        updated[col.id] = col.defaultSelected !== false;
      });
      setSelectedColumns(updated);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // 1. Determine base dataset based on scope
      let rows: T[] = [];
      if (scope === 'selected') {
        rows = selectedData;
      } else if (scope === 'all') {
        rows = allData && allData.length > 0 ? allData : effectiveFilteredData;
      } else {
        rows = effectiveFilteredData;
      }

      // 2. Apply additional modal filters (if not exporting explicitly selected rows)
      if (scope !== 'selected') {
        if (filters.length > 0) {
          rows = rows.filter((row) => {
            return filters.every((filter) => {
              const val = filterValues[filter.id] || 'All';
              if (val === 'All') return true;
              return filter.filterFn(row, val);
            });
          });
        }

        if (rowDateAccessor) {
          rows = rows.filter((row) => {
            const rawVal = rowDateAccessor(row);
            if (!rawVal) return true;
            const rowTime = new Date(rawVal).getTime();
            if (isNaN(rowTime)) return true;

            if (startDate) {
              const startTime = new Date(`${startDate}T00:00:00`).getTime();
              if (rowTime < startTime) return false;
            }
            if (endDate) {
              const endTime = new Date(`${endDate}T23:59:59`).getTime();
              if (rowTime > endTime) return false;
            }
            return true;
          });
        }
      }

      if (!rows || rows.length === 0) {
        toast.error('No records match the selected export filters.');
        return;
      }

      // 3. Filter columns
      const activeColumns = columns.filter((col) => selectedColumns[col.id]);
      if (activeColumns.length === 0) {
        toast.error('Please select at least one column to include.');
        return;
      }

      const headers = activeColumns.map((col) => col.label);
      const dataRows = rows.map((row, index) =>
        activeColumns.map((col) => {
          const val = col.accessor(row, index);
          if (val === null || val === undefined) return '';
          return val;
        })
      );

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `${fileNamePrefix}_${dateStr}.${format}`;
      const exportTitle = title.replace(/^Export\s+/i, 'MERCON ').trim();

      if (format === 'xlsx') {
        const headerStrings = headers.map(h => typeof h === 'string' ? h : h);
        await exportExcelTable(exportTitle, headerStrings, dataRows, fileName, { subtitle, sheetName, theme: theme as any });
      } else if (format === 'csv') {
        downloadCSVTable(headers, dataRows, fileName);
      } else if (format === 'pdf') {
        exportPDFTable(exportTitle, headers, dataRows, fileName, { subtitle });
      }

      toast.success(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'} successfully`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate export file.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Live preview counts ────────────────────────────────────────────────
  // Apply the modal's date range + extra filter values to each scope's base
  // dataset so the counts in the scope buttons reflect exactly how many rows
  // will be exported at that moment.
  const applyModalFilters = (rows: T[]): T[] => {
    let result = [...rows];

    // Apply extra filter dropdowns
    if (filters.length > 0) {
      result = result.filter((row) =>
        filters.every((filter) => {
          const val = filterValues[filter.id] || 'All';
          if (val === 'All') return true;
          return filter.filterFn(row, val);
        })
      );
    }

    // Apply date range
    if (rowDateAccessor && (startDate || endDate)) {
      result = result.filter((row) => {
        const rawVal = rowDateAccessor(row);
        if (!rawVal) return true;
        const rowTime = new Date(rawVal).getTime();
        if (isNaN(rowTime)) return true;
        if (startDate) {
          const startTime = new Date(`${startDate}T00:00:00`).getTime();
          if (rowTime < startTime) return false;
        }
        if (endDate) {
          const endTime = new Date(`${endDate}T23:59:59`).getTime();
          if (rowTime > endTime) return false;
        }
        return true;
      });
    }

    return result;
  };

  const filteredPreviewCount = applyModalFilters(effectiveFilteredData).length;
  const allPreviewCount = applyModalFilters(allData && allData.length > 0 ? allData : effectiveFilteredData).length;
  const selectedPreviewCount = selectedData.length; // selection is already explicit

  const actualTotalCount = totalCount !== undefined ? totalCount : (allData?.length || effectiveFilteredData.length);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Download className="w-5 h-5 text-brand" />
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          {/* 2. Format Selector */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 dark:text-slate-300">File Format</label>
            <div className={cn('grid gap-2', allowedFormats.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {allowedFormats.includes('xlsx') && (
                <button
                  type="button"
                  onClick={() => setFormat('xlsx')}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-center font-semibold cursor-pointer transition-all text-xs',
                    format === 'xlsx'
                      ? 'border-brand bg-orange-50/50 dark:bg-orange-950/20 text-brand font-bold'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  Excel (.xlsx)
                </button>
              )}
              {(allowedFormats as string[]).includes('csv') && (
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-center font-semibold cursor-pointer transition-all text-xs',
                    format === 'csv'
                      ? 'border-brand bg-orange-50/50 dark:bg-orange-950/20 text-brand font-bold'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  CSV (.csv)
                </button>
              )}
              {allowedFormats.includes('pdf') && (
                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-center font-semibold cursor-pointer transition-all text-xs',
                    format === 'pdf'
                      ? 'border-brand bg-orange-50/50 dark:bg-orange-950/20 text-brand font-bold'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  PDF (.pdf)
                </button>
              )}
            </div>
          </div>

          {themes && themes.length > 0 && format === 'xlsx' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 dark:text-slate-300">Excel Theme Template</label>
                <button
                  type="button"
                  onClick={() => setIsColumnModalOpen(true)}
                  className="text-[10px] text-brand hover:underline font-semibold cursor-pointer flex items-center gap-1"
                >
                  <Edit2 size={10} />
                  Edit Columns
                </button>
              </div>
              <Select value={theme} onValueChange={handleThemeChange}>
                <SelectTrigger className="h-9 w-full rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <SelectValue placeholder="Select theme..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden text-xs z-[9999]">
                  {themes.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-800/50 py-2 font-medium">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time / Date Range Filter */}
          {scope !== 'selected' && rowDateAccessor && (
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                {dateRangeLabel}
              </label>
              <div className="grid grid-cols-2 gap-3 border border-slate-100 dark:border-slate-800/80 rounded-xl p-3 bg-slate-50/40 dark:bg-slate-950/20">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">From</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg focus-visible:ring-brand/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">To</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg focus-visible:ring-brand/20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. Additional Filters (if defined & not exporting explicitly selected rows) */}
          {scope !== 'selected' && filters.length > 0 && (
            <div className={cn(
              'grid gap-3 border border-slate-100 dark:border-slate-800/80 rounded-xl p-3 bg-slate-50/40 dark:bg-slate-950/20',
              filters.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            )}>
              {filters.map((filter) => (
                <div key={filter.id} className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-400 text-[11px]">
                    {filter.label}
                  </label>
                  <Select
                    value={filterValues[filter.id] || 'All'}
                    onValueChange={(val) =>
                      setFilterValues((prev) => ({ ...prev, [filter.id]: val }))
                    }
                  >
                    <SelectTrigger className="h-8 px-2 w-full text-[11px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900">
                      {filter.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {/* Nested Columns Dialog */}
          <Dialog open={isColumnModalOpen} onOpenChange={setIsColumnModalOpen}>
            <DialogContent className="max-w-md p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-[99999]">
              <DialogHeader>
                <DialogTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  Edit Columns
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-xs">
                  Select which columns to include in your export.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Columns to Include</label>
                  <button
                    type="button"
                    onClick={toggleAllColumns}
                    className="text-[10px] text-brand hover:underline font-semibold cursor-pointer"
                  >
                    {allColumnsSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border border-slate-100 dark:border-slate-800/80 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/20 max-h-72 overflow-y-auto">
                  {columns.map((col) => (
                    <div key={col.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`export-col-${col.id}`}
                        checked={!!selectedColumns[col.id]}
                        onCheckedChange={(checked) => {
                          setSelectedColumns((prev) => ({
                            ...prev,
                            [col.id]: !!checked,
                          }));
                        }}
                      />
                      <label
                        htmlFor={`export-col-${col.id}`}
                        className="text-[11px] text-slate-600 dark:text-slate-400 font-medium select-none cursor-pointer truncate"
                        title={col.label}
                      >
                        {col.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" onClick={() => setIsColumnModalOpen(false)} className="w-full bg-brand text-white hover:bg-brandDark">
                  Save Columns
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between w-full">
          {/* Live count indicator */}
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            {(() => {
              const count = scope === 'selected' ? selectedPreviewCount : scope === 'all' ? allPreviewCount : filteredPreviewCount;
              const cols = Object.values(selectedColumns).filter(Boolean).length;
              return `${count} row${count !== 1 ? 's' : ''} · ${cols} col${cols !== 1 ? 's' : ''}`;
            })()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isExporting}
              className="text-xs font-semibold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="text-xs font-bold bg-brand hover:bg-brand-hover text-white shadow-xs px-4"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              <span>{isExporting ? 'Exporting...' : 'Export File'}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
