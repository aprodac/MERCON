/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronDown, Plus, Trash2, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatMoney } from '@/lib/finance/format';
import { lineFigures, type DraftLine } from '@/lib/finance/invoiceDraft';
import { tripDestination, tripOrigin, tripRef } from '@/lib/finance/tripBilling';
import { cn } from '@/lib/utils';

/** Descriptions offered when adding a charge line; any text can be typed instead. */
const CHARGE_PRESETS = ['Waiting & labour charges', 'Additional stop charges', 'Detention charges', 'Offloading charges'];

const th = 'px-2 py-2 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-2 py-1 text-xs align-middle';
// Cells read as text until hovered or focused, like a spreadsheet
const cellInput =
  'h-7 rounded-md border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border focus-visible:border-ring focus-visible:bg-background';

function NumberCell({
  value,
  onChange,
  label,
  step = '0.01',
  min = 0,
  max,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  step?: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      aria-label={label}
      value={Number.isFinite(value) && value !== 0 ? value : ''}
      placeholder="0"
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      className={cn(cellInput, 'fin-num text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none', className)}
    />
  );
}

function VatCell({ value, defaultRate, onChange, label }: { value: number | null; defaultRate: number; onChange: (v: number | null) => void; label: string }) {
  const options = [...new Set([15, 0, defaultRate])].sort((a, b) => b - a);
  return (
    <Select value={value === null ? 'default' : String(value)} onValueChange={(v) => onChange(v === 'default' ? null : Number(v))}>
      <SelectTrigger aria-label={label} className={cn(cellInput, 'w-full gap-1 [&>span]:flex-1 [&>span]:whitespace-nowrap [&>span]:text-right [&>svg]:size-3 [&>svg]:opacity-40')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="default" className="text-xs">
          {defaultRate}% default
        </SelectItem>
        {options.map((r) => (
          <SelectItem key={r} value={String(r)} className="text-xs">
            {r === 0 ? '0% zero-rated' : `${r}%`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Every line of the draft in one grid: trip lines (rate fixed by the trip's billing amount) and
 * charge lines (fully editable). Discount and VAT can be set per line.
 */
export function InvoiceLinesTable({
  lines,
  tripsById,
  defaultTaxRate,
  onChange,
  onRemove,
  onAddLine,
  onPickTrips,
  onAddAllTrips,
  customerChosen,
  unbilled,
}: {
  lines: DraftLine[];
  tripsById: Map<string, any>;
  defaultTaxRate: number;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
  onAddLine: (description?: string) => void;
  onPickTrips: () => void;
  onAddAllTrips: () => void;
  customerChosen: boolean;
  /** Billable trips of the customer not on this invoice yet. */
  unbilled: { count: number; amount: number };
}) {
  const addButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onPickTrips} disabled={!customerChosen}>
        <Truck className="size-3.5" /> Add trips
        {unbilled.count > 0 && (
          <Chip tone="brand" size="sm" className="ml-0.5">
            {unbilled.count}
          </Chip>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" /> Add charge <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem className="text-xs" onSelect={() => onAddLine('')}>
            Blank line
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {CHARGE_PRESETS.map((p) => (
            <DropdownMenuItem key={p} className="text-xs" onSelect={() => onAddLine(p)}>
              {p}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Truck className="size-5 text-muted-foreground" />
        </span>
        {!customerChosen ? (
          <div>
            <p className="text-sm font-medium text-foreground">Start with the customer</p>
            <p className="mt-1 text-xs text-muted-foreground">Their completed, unbilled trips can then be added in one go.</p>
          </div>
        ) : unbilled.count > 0 ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {unbilled.count} completed {unbilled.count === 1 ? 'trip is' : 'trips are'} ready to bill
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Worth <span className="fin-num font-medium text-foreground">SAR {formatMoney(unbilled.amount)}</span> before VAT.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" size="sm" className="h-8 bg-brand text-xs text-white hover:bg-brand-hover" onClick={onAddAllTrips}>
                Add all {unbilled.count}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onPickTrips}>
                Choose trips
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onAddLine('')}>
                Add a charge instead
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">No trips waiting to be billed</p>
              <p className="mt-1 text-xs text-muted-foreground">Add a charge line to invoice something else.</p>
            </div>
            <div className="flex justify-center">{addButtons}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="table-container min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-background shadow-xs">
            <tr>
              <th className={cn(th, 'w-8 pl-4 text-muted-foreground')}>#</th>
              <th className={th}>Item</th>
              <th className={cn(th, 'w-16 text-right')}>Qty</th>
              <th className={cn(th, 'w-28 text-right')}>Rate</th>
              <th className={cn(th, 'w-20 text-right')}>Disc. %</th>
              <th className={cn(th, 'w-32 text-right')}>VAT</th>
              <th className={cn(th, 'w-32 pr-3 text-right')}>Amount</th>
              <th className="w-9" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const f = lineFigures(l, defaultTaxRate);
              const trip = l.tripId ? tripsById.get(l.tripId) : undefined;
              const name = l.kind === 'trip' ? tripRef(trip ?? { id: l.tripId, ref_id: null }) : l.description;
              return (
                <tr key={l.key} className="group [&>td]:border-b [&>td]:border-border/60 hover:bg-muted/30">
                  <td className={cn(td, 'pl-4 text-muted-foreground tabular-nums')}>{i + 1}</td>
                  <td className={td}>
                    {l.kind === 'trip' ? (
                      <div className="min-w-0 px-2 py-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="whitespace-nowrap font-medium text-foreground tabular-nums">{trip ? tripRef(trip) : l.description}</span>
                          <Chip tone="info" size="sm">Trip</Chip>
                          {trip?.vehicle_type && <span className="truncate text-[11px] text-muted-foreground">{trip.vehicle_type}</span>}
                        </div>
                        {trip && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {tripOrigin(trip)} → {tripDestination(trip)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Input
                        value={l.description}
                        onChange={(e) => onChange(l.key, { description: e.target.value })}
                        placeholder="Describe the charge"
                        aria-label={`Line ${i + 1} description`}
                        autoFocus={!l.description && l.rate === 0}
                        className={cn(cellInput, 'font-medium', !l.description.trim() && 'border-border')}
                      />
                    )}
                  </td>
                  <td className={td}>
                    {l.kind === 'trip' ? (
                      <span className="block px-2 text-right tabular-nums text-muted-foreground">1</span>
                    ) : (
                      <NumberCell value={l.quantity} step="1" min={1} label={`Line ${i + 1} quantity`} onChange={(v) => onChange(l.key, { quantity: v })} />
                    )}
                  </td>
                  <td className={td}>
                    {l.kind === 'trip' ? (
                      <span className="fin-num block px-2 text-right" title="The trip's billing amount">
                        {formatMoney(l.rate)}
                      </span>
                    ) : (
                      <NumberCell value={l.rate} label={`Line ${i + 1} rate`} onChange={(v) => onChange(l.key, { rate: Math.max(0, v) })} />
                    )}
                  </td>
                  <td className={td}>
                    <NumberCell value={l.discount_pct} max={100} label={`Line ${i + 1} discount percent`} onChange={(v) => onChange(l.key, { discount_pct: Math.min(100, Math.max(0, v)) })} />
                  </td>
                  <td className={td}>
                    <VatCell value={l.tax_rate} defaultRate={defaultTaxRate} label={`Line ${i + 1} VAT`} onChange={(v) => onChange(l.key, { tax_rate: v })} />
                  </td>
                  <td className={cn(td, 'pr-3 text-right')}>
                    <span className="fin-num font-medium text-foreground">{formatMoney(f.amount)}</span>
                    {f.discount > 0 && (
                      <span className="fin-num block text-[10px] text-muted-foreground line-through">{formatMoney(f.gross)}</span>
                    )}
                  </td>
                  <td className={cn(td, 'pr-2')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                      aria-label={`Remove ${name || `line ${i + 1}`}`}
                      title="Remove line"
                      onClick={() => onRemove(l.key)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
        {addButtons}
        {unbilled.count > 0 && (
          <button type="button" onClick={onAddAllTrips} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Add the other {unbilled.count} unbilled {unbilled.count === 1 ? 'trip' : 'trips'} (SAR {formatMoney(unbilled.amount)})
          </button>
        )}
      </div>
    </div>
  );
}
