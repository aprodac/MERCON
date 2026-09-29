import type { ReactNode } from 'react';
import type { AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { BucketChip } from '@/lib/finance/chips';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { cn } from '@/lib/utils';

const th = 'h-9 px-3 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-xs align-middle';

/** Flat list of open documents with selection; the page supplies the bulk bar and row action. */
export function DocumentAgeingTable({
  docs,
  selected,
  onSelectedChange,
  partyNoun,
  documentDateLabel,
  toolbar,
  renderAction,
}: {
  docs: AgeingDocument[];
  selected: Set<string>;
  onSelectedChange: (ids: Set<string>) => void;
  partyNoun: string;
  documentDateLabel: string;
  toolbar: ReactNode;
  renderAction?: (doc: AgeingDocument) => ReactNode;
}) {
  const allSelected = docs.length > 0 && docs.every((d) => selected.has(d.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };

  return (
    <ScrollTableCard toolbar={toolbar} className="max-h-full flex-initial max-md:max-h-[75vh]">
      <table className="w-full min-w-[820px] text-left">
        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
          <tr>
            <th className={cn(th, 'w-10')}>
              <Checkbox
                aria-label="Select all"
                checked={allSelected}
                onCheckedChange={(c) => onSelectedChange(c ? new Set(docs.map((d) => d.id)) : new Set())}
              />
            </th>
            <th className={th}>Ref</th>
            <th className={th}>{partyNoun}</th>
            <th className={th}>{documentDateLabel}</th>
            <th className={th}>Due date</th>
            <th className={th}>Age</th>
            <th className={cn(th, 'text-right')}>Balance</th>
            {renderAction && <th className={cn(th, 'w-24')} />}
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 && (
            <tr>
              <td colSpan={8} className="py-12 text-center text-xs text-muted-foreground">Nothing matches these filters.</td>
            </tr>
          )}
          {docs.map((d) => (
            <tr key={d.id} className={cn('border-b transition-colors hover:bg-muted/40', selected.has(d.id) && 'bg-muted/40')}>
              <td className={td}>
                <Checkbox aria-label={`Select ${d.ref_id ?? d.id}`} checked={selected.has(d.id)} onCheckedChange={(c) => toggle(d.id, !!c)} />
              </td>
              <td className={cn(td, 'font-medium text-foreground')}>{d.ref_id ?? d.id.slice(0, 8)}</td>
              <td className={cn(td, 'text-foreground')}>{d.party_name}</td>
              <td className={cn(td, 'text-muted-foreground')}>{formatDate(d.doc_date)}</td>
              <td className={cn(td, 'text-muted-foreground')}>{formatDate(d.due_date)}</td>
              <td className={td}>
                <span className="flex items-center gap-1.5">
                  <BucketChip bucket={d.bucket} />
                  {d.days_overdue > 0 && <span className="text-[11px] text-muted-foreground">{d.days_overdue} days</span>}
                </span>
              </td>
              <td className={cn(td, 'fin-num text-right font-semibold text-foreground')}>{formatMoney(d.balance)}</td>
              {renderAction && <td className={cn(td, 'text-right')}>{renderAction(d)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTableCard>
  );
}
