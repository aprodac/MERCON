import { useState } from 'react';
import type { TemplateLayout } from '@mercon/shared-types';
import type { TemplateInspection } from '@/services/reportTemplateService';
import { FileSearch, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';

const MAPPING_OPTIONS: ComboboxOption[] = [
  { value: 'blank', label: 'Leave empty', group: 'Special' },
  { value: 'formula', label: 'Keep their formula', group: 'Special' },
  { value: 'const', label: 'Same text on every row…', group: 'Special' },

  { value: 'field:ref_id', label: 'Trip / job no.', group: 'Trip', keywords: 'waybill trip job reference number ref' },
  { value: 'field:awb_number', label: 'AWB / shipment no.', group: 'Trip', keywords: 'awb shipment waybill tracking consignment' },
  { value: 'field:date', label: 'Trip date', group: 'Trip', keywords: 'date time created' },
  { value: 'field:status', label: 'Trip status', group: 'Trip', keywords: 'status state condition' },
  { value: 'field:rate_category', label: 'Line type', group: 'Trip', keywords: 'line type rate category service trip type duty' },
  { value: 'field:serial', label: 'Row number (1, 2, 3…)', group: 'Trip', keywords: 'serial index row number' },

  { value: 'field:customer_name', label: 'Customer', group: 'Parties and truck', keywords: 'customer sender company client' },
  { value: 'field:receiver', label: 'Receiver / consignee', group: 'Parties and truck', keywords: 'receiver consignee recipient' },
  { value: 'field:driver_name', label: 'Driver name', group: 'Parties and truck', keywords: 'driver captain name' },
  { value: 'field:driver_phone', label: 'Driver mobile', group: 'Parties and truck', keywords: 'phone mobile contact' },
  { value: 'field:vehicle_plate', label: 'Vehicle plate', group: 'Parties and truck', keywords: 'plate vehicle truck' },
  { value: 'field:vehicle_type', label: 'Vehicle type', group: 'Parties and truck', keywords: 'type class capacity ton' },
  { value: 'field:carrier_name', label: 'Carrier / 3rd party', group: 'Parties and truck', keywords: 'carrier vendor 3rd party subcontractor' },

  { value: 'field:origin', label: 'Pickup location', group: 'Route', keywords: 'pickup origin from start location city' },
  { value: 'field:destination', label: 'Dropoff location', group: 'Route', keywords: 'dropoff destination to end location city' },

  { value: 'field:billing_amount', label: 'Billing amount', group: 'Money', keywords: 'billing amount rate price base' },
  { value: 'field:total_charges', label: 'Extra charges', group: 'Money', keywords: 'extra surcharge waiting detention stop' },
  { value: 'field:total_amount', label: 'Total amount', group: 'Money', keywords: 'total amount sum grand' },

  // What MERCON pays and keeps — the sheet goes to the customer, so these are rarely wanted.
  { value: 'field:driver_payout', label: 'Driver payout', group: 'Internal (MERCON only)', keywords: 'driver charge payout trip charge fee' },
  { value: 'field:balance_amount', label: 'Balance (total − extras − payout)', group: 'Internal (MERCON only)', keywords: 'balance margin net' },
];

type Source = TemplateLayout['columns'][number]['source'];

interface TemplateMappingEditorProps {
  inspection: TemplateInspection;
  layout: TemplateLayout;
  onChange: (layout: TemplateLayout) => void;
  /** Off when editing a saved format: there's no fresh upload whose detection to fall back to. */
  canAutoMap?: boolean;
}

const colLetter = (n: number): string => {
  let s = '';
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
};

const sourceValue = (s: Source) => (s.kind === 'field' ? `field:${s.key}` : s.kind);

const rowInput =
  'w-11 rounded border border-slate-200 bg-white px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-slate-900 outline-none focus:border-[#FA634E] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/**
 * Which MERCON field fills each of the customer's columns. Built to fill its
 * container: a one-line strip on top, then the column list scrolls on its own.
 */
export default function TemplateMappingEditor({ inspection, layout, onChange, canAutoMap = true }: TemplateMappingEditorProps) {
  const [emptyOnly, setEmptyOnly] = useState(false);
  const sheet = inspection.bestSheet;

  if (!sheet) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <FileSearch className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No header row found in this file</p>
      </div>
    );
  }

  const sourceOf = (colIndex: number, suggested: string | null): Source =>
    layout.columns.find((c) => c.colIndex === colIndex)?.source ??
    (suggested ? { kind: 'field', key: suggested as any } : { kind: 'blank' });

  const updateColumn = (colIndex: number, source: Source) => {
    const columns = layout.columns.some((c) => c.colIndex === colIndex)
      ? layout.columns.map((c) => (c.colIndex === colIndex ? { ...c, source } : c))
      : [...layout.columns, { colIndex, headerText: sheet.columns.find((c) => c.colIndex === colIndex)?.headerText ?? '', source }];
    onChange({ ...layout, columns });
  };

  // The server's header matching (xlsxTemplate/aliases.ts) — one matcher, not a second guess here.
  const resetAll = (useDetected: boolean) =>
    onChange({
      ...layout,
      columns: sheet.columns.map((col) => ({
        colIndex: col.colIndex,
        headerText: col.headerText,
        source: useDetected && col.suggestedField ? { kind: 'field' as const, key: col.suggestedField } : { kind: 'blank' as const },
      })),
    });

  const rows = sheet.columns.map((col) => ({ col, source: sourceOf(col.colIndex, col.suggestedField) }));
  const emptyCount = rows.filter((r) => r.source.kind === 'blank').length;
  const filledCount = rows.length - emptyCount;
  const visible = emptyOnly ? rows.filter((r) => r.source.kind === 'blank') : rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      {/* ── One-line strip: where the trips go + progress + bulk actions ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <span>
          Sheet <b className="font-semibold text-slate-800 dark:text-slate-100">{sheet.sheetName}</b>
        </span>
        <span>
          Header row <b className="font-semibold text-slate-800 dark:text-slate-100">{layout.headerRowIdx}</b>
        </span>
        <span className="flex items-center gap-1" title="Their sample rows in this range are replaced by the trips">
          Trip rows
          <input
            type="number"
            min={1}
            aria-label="First trip row"
            value={layout.dataStartRow}
            onChange={(e) => onChange({ ...layout, dataStartRow: Math.max(1, Number(e.target.value) || 1) })}
            className={rowInput}
          />
          –
          <input
            type="number"
            min={layout.dataStartRow}
            aria-label="Last sample row"
            value={layout.dataEndRow}
            onChange={(e) => onChange({ ...layout, dataEndRow: Math.max(layout.dataStartRow, Number(e.target.value) || layout.dataStartRow) })}
            className={rowInput}
          />
        </span>

        <span className="ml-auto">
          <b className="font-semibold text-emerald-600 dark:text-emerald-400">{filledCount}</b> of {rows.length} filled
          {emptyCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {emptyCount} empty</span>}
        </span>
        {emptyCount > 0 && (
          <button
            type="button"
            onClick={() => setEmptyOnly((v) => !v)}
            className={cn(
              'rounded border px-2 py-0.5 font-semibold transition-colors',
              emptyOnly
                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-slate-200 text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300'
            )}
          >
            Empty only
          </button>
        )}
        {canAutoMap && (
          <button type="button" onClick={() => resetAll(true)} title="Match each header again" className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300">
            <Sparkles className="h-3 w-3 text-emerald-500" /> Auto-map
          </button>
        )}
        <button type="button" onClick={() => resetAll(false)} title="Set every column to empty" aria-label="Clear all" className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800">
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {/* ── Columns: the part that matters, scrolls on its own ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-10" />
            <col className="w-[34%]" />
            <col className="w-[18%]" />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-950">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="py-1.5 pl-3 text-left font-semibold" />
              <th className="py-1.5 text-left font-semibold">Their column</th>
              <th className="py-1.5 text-left font-semibold">Sample</th>
              <th className="py-1.5 pr-3 text-left font-semibold">Fill with</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map(({ col, source }) => {
              const isEmpty = source.kind === 'blank';
              return (
                <tr key={col.colIndex}>
                  <td className="py-1 pl-3 font-mono text-[11px] font-semibold text-slate-400">{colLetter(col.colIndex)}</td>
                  <td className="truncate py-1 pr-2 font-medium text-slate-900 dark:text-slate-100" title={col.headerText}>
                    {col.headerText || <span className="italic text-slate-400">No header</span>}
                  </td>
                  <td className="truncate py-1 pr-2 font-mono text-[11px] text-slate-500" title={col.sampleValue || undefined}>
                    {col.sampleValue || '—'}
                  </td>
                  <td className="py-1 pr-3">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <Combobox
                          options={MAPPING_OPTIONS}
                          value={sourceValue(source)}
                          onChange={(val) => {
                            if (val === 'blank') updateColumn(col.colIndex, { kind: 'blank' });
                            else if (val === 'formula') updateColumn(col.colIndex, { kind: 'formula' });
                            else if (val === 'const') updateColumn(col.colIndex, { kind: 'const', value: '' });
                            else updateColumn(col.colIndex, { kind: 'field', key: val.replace('field:', '') as any });
                          }}
                          placeholder="Pick a field"
                          searchPlaceholder="Search fields…"
                          triggerClassName={cn(
                            'h-7 w-full rounded-md text-xs font-medium',
                            isEmpty
                              ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                              : 'border-emerald-300 dark:border-emerald-800'
                          )}
                        />
                      </div>
                      {source.kind === 'const' && (
                        <input
                          type="text"
                          value={source.value}
                          onChange={(e) => updateColumn(col.colIndex, { kind: 'const', value: e.target.value })}
                          placeholder="Text"
                          className="h-7 w-28 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#FA634E] dark:border-slate-700 dark:bg-slate-900"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
