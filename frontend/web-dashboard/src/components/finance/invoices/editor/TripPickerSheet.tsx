/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search, X } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { tripAmount, tripDestination, tripDoneAt, tripDriver, tripLineType, tripOperationType, tripOrigin, tripRef } from '@/lib/finance/tripBilling';
import { cn } from '@/lib/utils';

type Sort = 'newest' | 'oldest' | 'amount';
const ALL = '__all';

const td = 'px-3 py-2 text-xs align-middle';

/** A filter select that only appears when there is more than one value to choose from. */
function FacetSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) {
  if (values.length < 2) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-8 w-auto min-w-[130px] gap-1.5 text-xs', value !== ALL && 'border-ring')} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          All {label.toLowerCase()}
        </SelectItem>
        {values.map((v) => (
          <SelectItem key={v} value={v} className="text-xs">
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Pick which of a customer's completed, unbilled trips go on the invoice. Trips without a billing
 * amount can't be billed yet and are shown greyed out with a link to the trip.
 */
export function TripPickerSheet({
  open,
  onOpenChange,
  trips,
  isLoading,
  customerName,
  selected,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trips: any[];
  isLoading: boolean;
  customerName: string;
  /** Trip ids already on the invoice. */
  selected: string[];
  onApply: (tripIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [vehicle, setVehicle] = useState(ALL);
  const [lineType, setLineType] = useState(ALL);
  const [operation, setOperation] = useState(ALL);
  const [sort, setSort] = useState<Sort>('newest');

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(selected));
    setSearch('');
  }, [open, selected]);

  const facets = useMemo(() => {
    const uniq = (f: (t: any) => string | null) => [...new Set(trips.map(f).filter((v): v is string => Boolean(v)))].sort();
    return { vehicle: uniq((t) => t.vehicle_type || null), lineType: uniq(tripLineType), operation: uniq(tripOperationType) };
  }, [trips]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = trips.filter((t) => {
      if (vehicle !== ALL && t.vehicle_type !== vehicle) return false;
      if (lineType !== ALL && tripLineType(t) !== lineType) return false;
      if (operation !== ALL && tripOperationType(t) !== operation) return false;
      if (!q) return true;
      const hay = [tripRef(t), tripOrigin(t), tripDestination(t), t.vehicle_type, tripDriver(t), tripLineType(t), tripOperationType(t)].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    const time = (t: any) => new Date(tripDoneAt(t) ?? 0).getTime();
    if (sort === 'amount') rows.sort((a, b) => tripAmount(b) - tripAmount(a));
    else if (sort === 'oldest') rows.sort((a, b) => time(a) - time(b));
    else rows.sort((a, b) => time(b) - time(a));
    return rows;
  }, [trips, search, vehicle, lineType, operation, sort]);

  const billable = shown.filter((t) => tripAmount(t) > 0);
  const allShownPicked = billable.length > 0 && billable.every((t) => picked.has(t.id));
  const pickedTrips = trips.filter((t) => picked.has(t.id));
  const pickedAmount = pickedTrips.reduce((s, t) => s + tripAmount(t), 0);
  const missing = trips.filter((t) => tripAmount(t) <= 0).length;
  const filtered = Boolean(search.trim()) || vehicle !== ALL || lineType !== ALL || operation !== ALL;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      billable.forEach((t) => (allShownPicked ? next.delete(t.id) : next.add(t.id)));
      return next;
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">Add trips</SheetTitle>
          <SheetDescription className="text-xs">
            Completed trips for {customerName || 'this customer'} that aren&apos;t on another invoice yet.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5">
          <div className="relative w-56 max-sm:w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Trip, route, driver…" aria-label="Search trips" className="h-8 pl-8 text-xs" />
          </div>
          <FacetSelect label="Vehicles" value={vehicle} values={facets.vehicle} onChange={setVehicle} />
          <FacetSelect label="Line types" value={lineType} values={facets.lineType} onChange={setLineType} />
          <FacetSelect label="Operations" value={operation} values={facets.operation} onChange={setOperation} />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setSearch('');
                setVehicle(ALL);
                setLineType(ALL);
                setOperation(ALL);
              }}
            >
              <X className="size-3.5" /> Clear
            </Button>
          )}
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="ml-auto h-8 w-[140px] text-xs" aria-label="Sort trips">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">Newest first</SelectItem>
              <SelectItem value="oldest" className="text-xs">Oldest first</SelectItem>
              <SelectItem value="amount" className="text-xs">Highest amount</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {missing > 0 && (
          <p className={cn('flex items-center gap-2 border-b px-5 py-2 text-[11px]', TONE_CLASSES.warning.bg, TONE_CLASSES.warning.fg)}>
            <AlertTriangle className="size-3.5 shrink-0" />
            {missing} {missing === 1 ? 'trip has' : 'trips have'} no billing amount and can&apos;t be invoiced until one is set on the trip.
          </p>
        )}

        <div className="table-container min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : trips.length === 0 ? (
            <div className="p-10 text-center text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Nothing to bill</p>
              <p className="mt-1">This customer has no completed trips waiting for an invoice.</p>
            </div>
          ) : (
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10 bg-background shadow-xs">
                <tr>
                  <th className={cn(td, 'w-10 py-2')}>
                    <Checkbox checked={allShownPicked} onCheckedChange={toggleShown} disabled={billable.length === 0} aria-label="Select all shown trips" />
                  </th>
                  <th className={cn(td, 'py-2 font-semibold')}>Trip</th>
                  <th className={cn(td, 'py-2 font-semibold')}>Route</th>
                  <th className={cn(td, 'w-24 py-2 font-semibold')}>Completed</th>
                  <th className={cn(td, 'w-32 py-2 text-right font-semibold')}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                      No trips match the filters.
                    </td>
                  </tr>
                )}
                {shown.map((t) => {
                  const amount = tripAmount(t);
                  const canBill = amount > 0;
                  const on = picked.has(t.id);
                  const driver = tripDriver(t);
                  const lt = tripLineType(t);
                  const op = tripOperationType(t);
                  const done = tripDoneAt(t);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => canBill && toggle(t.id)}
                      className={cn(
                        '[&>td]:border-b [&>td]:border-border/60 transition-colors',
                        canBill ? 'cursor-pointer hover:bg-muted/40' : 'opacity-60',
                        on && 'bg-muted/60',
                      )}
                    >
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={on} onCheckedChange={() => toggle(t.id)} disabled={!canBill} aria-label={`Select ${tripRef(t)}`} />
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground tabular-nums">{tripRef(t)}</span>
                          {t.vehicle_type && <Chip tone="neutral" size="sm">{t.vehicle_type}</Chip>}
                          {lt && <Chip tone="violet" size="sm">{lt}</Chip>}
                          {op && <Chip tone="teal" size="sm">{op}</Chip>}
                        </div>
                        {driver && <p className="mt-0.5 text-[11px] text-muted-foreground">{driver}</p>}
                      </td>
                      <td className={cn(td, 'max-w-[220px]')}>
                        <p className="truncate text-foreground" title={`${tripOrigin(t)} → ${tripDestination(t)}`}>
                          {tripOrigin(t)} <span className="text-muted-foreground">→</span> {tripDestination(t)}
                        </p>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{done ? formatDate(done) : '—'}</td>
                      <td className={cn(td, 'fin-num whitespace-nowrap text-right font-medium')}>
                        {canBill ? (
                          formatMoney(amount)
                        ) : (
                          <Link to={`/trips/${t.id}`} onClick={(e) => e.stopPropagation()} className={cn('text-[11px] underline-offset-2 hover:underline', TONE_CLASSES.warning.fg)}>
                            Set amount
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-3 border-t p-4 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{picked.size}</span> selected ·{' '}
            <span className="fin-num font-medium text-foreground">SAR {formatMoney(pickedAmount)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 bg-brand text-xs text-white hover:bg-brand-hover"
              onClick={() => {
                onApply(trips.filter((t) => picked.has(t.id)).map((t) => t.id));
                onOpenChange(false);
              }}
            >
              Update invoice
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
