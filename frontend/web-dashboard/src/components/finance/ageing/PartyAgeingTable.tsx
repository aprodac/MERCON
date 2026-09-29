import { Fragment, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import type { AgeingRow } from '@/services/financeService';
import { AGEING_BUCKETS, type AgeingBucket, type AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { BucketChip } from '@/lib/finance/chips';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { cn } from '@/lib/utils';
import { PartyAvatar } from './PartyAvatar';
import { bucketTone, toneDotVar } from './tones';

const th = 'h-9 px-3 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-xs align-middle';

/** Background tint for a bucket cell, scaled by that bucket's share of the row (5%–20%). */
function heat(bucket: AgeingBucket, value: number, rowTotal: number) {
  if (value <= 0 || rowTotal <= 0) return undefined;
  const pct = Math.round(Math.max(5, Math.min(20, (value / rowTotal) * 20)));
  return { backgroundColor: `color-mix(in oklab, ${toneDotVar(bucketTone(bucket))} ${pct}%, transparent)` };
}

export interface PartyAgeingTableProps {
  rows: AgeingRow[];
  grandTotal: AgeingRow;
  /** Documents per party, already flattened (bills or invoices). */
  documentsByParty: Map<string, AgeingDocument[]>;
  partyNoun: string;
  documentNoun: string;
  documentDateLabel: string;
  toolbar: ReactNode;
  renderPartyHover?: (row: AgeingRow) => ReactNode;
  renderRowActions?: (row: AgeingRow) => ReactNode;
  renderDocumentAction?: (doc: AgeingDocument) => ReactNode;
}

/** Party × bucket ageing table; rows expand in place to their open documents. */
export function PartyAgeingTable({
  rows,
  grandTotal,
  documentsByParty,
  partyNoun,
  documentNoun,
  documentDateLabel,
  toolbar,
  renderPartyHover,
  renderRowActions,
  renderDocumentAction,
}: PartyAgeingTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bucketFilter, setBucketFilter] = useState<Map<string, AgeingBucket>>(new Map());

  const toggle = (id: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const columns = 3 + AGEING_BUCKETS.length + (renderRowActions ? 1 : 0);

  return (
    <ScrollTableCard toolbar={toolbar} className="max-h-full flex-initial max-md:max-h-[75vh]">
      <table className="w-full min-w-[860px] text-left">
        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
          <tr>
            <th className={cn(th, 'w-8')} />
            <th className={th}>{partyNoun}</th>
            {AGEING_BUCKETS.map((b) => (
              <th key={b.key} className={cn(th, 'w-28 text-right')}>{b.label}</th>
            ))}
            <th className={cn(th, 'w-32 text-right')}>Total</th>
            {renderRowActions && <th className={cn(th, 'w-40')} />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns} className="py-12 text-center text-xs text-muted-foreground">
                No {partyNoun.toLowerCase()}s match these filters.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const isOpen = expanded.has(r.party_id);
            const docs = documentsByParty.get(r.party_id) ?? [];
            const onlyBucket = bucketFilter.get(r.party_id);
            const shownDocs = onlyBucket ? docs.filter((d) => d.bucket === onlyBucket) : docs;
            const name = (
              <span className="flex items-center gap-2.5">
                <PartyAvatar name={r.party_name} />
                <span className="font-medium text-foreground">{r.party_name}</span>
              </span>
            );
            return (
              <Fragment key={r.party_id}>
                <tr className="border-b transition-colors hover:bg-muted/40">
                  <td className={td}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} ${documentNoun} for ${r.party_name}`}
                      onClick={() => toggle(r.party_id)}
                    >
                      <ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} />
                    </Button>
                  </td>
                  <td className={td}>
                    {renderPartyHover ? (
                      <HoverCard openDelay={200}>
                        <HoverCardTrigger asChild>
                          <button type="button" className="rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">{name}</button>
                        </HoverCardTrigger>
                        <HoverCardContent align="start" className="w-72 p-3 text-xs">{renderPartyHover(r)}</HoverCardContent>
                      </HoverCard>
                    ) : (
                      name
                    )}
                  </td>
                  {AGEING_BUCKETS.map((b) => {
                    const value = r[b.field];
                    return (
                      <td
                        key={b.key}
                        style={heat(b.key, value, r.total)}
                        onClick={() => {
                          if (value <= 0) return;
                          setBucketFilter((prev) => new Map(prev).set(r.party_id, b.key));
                          toggle(r.party_id, true);
                        }}
                        className={cn(td, 'fin-num text-right', value > 0 ? 'cursor-pointer text-foreground' : 'text-muted-foreground')}
                      >
                        {value > 0 ? formatMoney(value) : '—'}
                      </td>
                    );
                  })}
                  <td className={cn(td, 'fin-num text-right font-semibold text-foreground')}>{formatMoney(r.total)}</td>
                  {renderRowActions && <td className={cn(td, 'text-right')}>{renderRowActions(r)}</td>}
                </tr>
                {isOpen && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={columns} className="px-3 py-2 pl-12">
                      <div className="flex items-center justify-between pb-1.5 text-[11px] text-muted-foreground">
                        <span>
                          {shownDocs.length} open {documentNoun}
                          {onlyBucket && ' in this bucket'}
                        </span>
                        {onlyBucket && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px]"
                            onClick={() => setBucketFilter((prev) => { const next = new Map(prev); next.delete(r.party_id); return next; })}
                          >
                            Show all
                          </Button>
                        )}
                      </div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1 pr-3 text-[11px] font-medium text-muted-foreground">Ref</th>
                            <th className="py-1 pr-3 text-[11px] font-medium text-muted-foreground">{documentDateLabel}</th>
                            <th className="py-1 pr-3 text-[11px] font-medium text-muted-foreground">Due date</th>
                            <th className="py-1 pr-3 text-[11px] font-medium text-muted-foreground">Age</th>
                            <th className="py-1 pr-3 text-right text-[11px] font-medium text-muted-foreground">Balance</th>
                            {renderDocumentAction && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {shownDocs.map((d) => (
                            <tr key={d.id} className="border-b last:border-0">
                              <td className="py-1.5 pr-3 text-xs font-medium text-foreground">{d.ref_id ?? d.id.slice(0, 8)}</td>
                              <td className="py-1.5 pr-3 text-xs text-muted-foreground">{formatDate(d.doc_date)}</td>
                              <td className="py-1.5 pr-3 text-xs text-muted-foreground">{formatDate(d.due_date)}</td>
                              <td className="py-1.5 pr-3">
                                <span className="flex items-center gap-1.5">
                                  <BucketChip bucket={d.bucket} />
                                  {d.days_overdue > 0 && <span className="text-[11px] text-muted-foreground">{d.days_overdue} days</span>}
                                </span>
                              </td>
                              <td className="fin-num py-1.5 pr-3 text-right text-xs font-semibold text-foreground">{formatMoney(d.balance)}</td>
                              {renderDocumentAction && <td className="py-1.5 text-right">{renderDocumentAction(d)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="sticky bottom-0 bg-(--fin-charcoal) text-white">
            <tr>
              <td colSpan={2} className="px-3 py-2.5 text-sm font-semibold">Total</td>
              {AGEING_BUCKETS.map((b) => (
                <td key={b.key} className="fin-num px-3 py-2.5 text-right text-xs">{formatMoney(grandTotal[b.field])}</td>
              ))}
              <td className="fin-num px-3 py-2.5 text-right text-sm font-semibold">{formatMoney(grandTotal.total)}</td>
              {renderRowActions && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </ScrollTableCard>
  );
}
