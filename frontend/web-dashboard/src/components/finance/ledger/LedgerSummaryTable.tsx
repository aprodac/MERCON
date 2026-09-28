import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpenText, CalendarRange, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { GL_TYPE_META, type GlAccountRow, type GlAccountType, type GlFigures, type GlParentGroup, type GlSort, type GlSummaryModel } from '@/lib/finance/glSummary';
import { cn } from '@/lib/utils';

export interface LedgerSummaryFormat {
  /** A debit-positive net as it should read: "1,250.00" + side, or signed. */
  balance: (net: number) => { amount: string; side: 'Dr' | 'Cr' | null };
  money: (n: number) => string;
  showCodes: boolean;
}

const SORT_LABEL: Record<GlSort, string> = { code: 'Account code', activity: 'Most activity', balance: 'Largest balance' };

const th = 'px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-3 py-1.5 text-xs align-middle';
const num = 'fin-num text-right whitespace-nowrap';

function Balance({ net, fmt, strong }: { net: number; fmt: LedgerSummaryFormat; strong?: boolean }) {
  if (Math.abs(net) < 0.005) return <span className="text-muted-foreground/60">—</span>;
  const b = fmt.balance(net);
  return (
    <span className={cn(strong ? 'font-semibold' : 'font-medium', 'text-foreground')}>
      {b.amount}
      {b.side && <span className="ml-1 rounded bg-muted px-1 py-px text-[10px] font-normal text-muted-foreground">{b.side}</span>}
    </span>
  );
}

function Amount({ value, fmt, className }: { value: number; fmt: LedgerSummaryFormat; className?: string }) {
  if (Math.abs(value) < 0.005) return <span className="text-muted-foreground/60">—</span>;
  return <span className={className}>{fmt.money(value)}</span>;
}

/** The five figure cells shared by account, parent, type and total rows. */
function FigureCells({ f, fmt, strong }: { f: GlFigures; fmt: LedgerSummaryFormat; strong?: boolean }) {
  const weight = strong ? 'font-semibold' : 'font-medium';
  return (
    <>
      <td className={cn(td, num, 'max-md:hidden')}>
        <Balance net={f.opening} fmt={fmt} />
      </td>
      <td className={cn(td, num)}>
        <Amount value={f.debit} fmt={fmt} className={cn(weight, TONE_CLASSES.positive.fg)} />
      </td>
      <td className={cn(td, num)}>
        <Amount value={f.credit} fmt={fmt} className={cn(weight, TONE_CLASSES.negative.fg)} />
      </td>
      <td className={cn(td, num, 'max-lg:hidden')}>
        <Balance net={f.debit - f.credit} fmt={fmt} />
      </td>
      <td className={cn(td, num)}>
        <Balance net={f.closing} fmt={fmt} strong />
      </td>
      <td className={cn(td, 'fin-num text-right text-muted-foreground max-sm:hidden')}>{f.lines > 0 ? f.lines.toLocaleString('en-US') : '—'}</td>
    </>
  );
}

const COLS = 8;

/**
 * Every account's opening, debits, credits, net change and closing for the period, grouped by type
 * and parent account. Clicking an account opens its entries in a side panel; the row buttons open
 * the full account ledger or its month-by-month view.
 */
export function LedgerSummaryTable({
  model,
  fmt,
  search,
  onSearch,
  type,
  onType,
  activeOnly,
  onActiveOnly,
  sort,
  onSort,
  collapsed,
  onToggleParent,
  onCollapseAll,
  onPeek,
  onOpenLedger,
  onOpenMonthly,
  selectedId,
  headerNote,
}: {
  model: GlSummaryModel;
  fmt: LedgerSummaryFormat;
  search: string;
  onSearch: (v: string) => void;
  type: GlAccountType | null;
  onType: (t: GlAccountType | null) => void;
  activeOnly: boolean;
  onActiveOnly: (v: boolean) => void;
  sort: GlSort;
  onSort: (s: GlSort) => void;
  collapsed: Set<string>;
  onToggleParent: (key: string) => void;
  /** true collapses every parent group, false opens them all. */
  onCollapseAll: (collapse: boolean) => void;
  onPeek: (row: GlAccountRow, parent: GlParentGroup | null) => void;
  onOpenLedger: (row: GlAccountRow) => void;
  onOpenMonthly: (row: GlAccountRow) => void;
  selectedId: string | null;
  headerNote?: ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  // "/" jumps to the search box, as in most finance tools
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = Boolean(search.trim() || type || activeOnly);
  const anyParents = model.groups.some((g) => g.parents.length > 0);
  const allCollapsed = anyParents && model.groups.every((g) => g.parents.every((p) => collapsed.has(p.key)));

  const accountRow = (row: GlAccountRow, parent: GlParentGroup | null, indent: boolean) => {
    const open = () => onPeek(row, parent);
    const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    };
    return (
      <tr
        key={row.key}
        tabIndex={0}
        onClick={open}
        onKeyDown={onKeyDown}
        aria-label={`${row.item.code} ${row.item.name}: open entries`}
        className={cn(
          'group h-9 cursor-pointer [&>td]:border-b [&>td]:border-border/60 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60',
          selectedId === row.key && 'bg-muted/60',
        )}
      >
        <td className={cn(td, indent ? 'pl-9' : 'pl-6')}>
          <div className="flex min-w-0 items-center gap-2">
            {fmt.showCodes && <span className="fin-num w-12 shrink-0 text-muted-foreground">{row.item.code}</span>}
            <span className="truncate text-foreground" title={row.item.name}>
              {row.item.name}
            </span>
            {row.lines === 0 && Math.abs(row.closing) >= 0.005 && (
              <Chip tone="neutral" size="sm" className="max-sm:hidden" title="Carries a balance but had no postings in the period">
                No activity
              </Chip>
            )}
          </div>
        </td>
        <FigureCells f={row} fmt={fmt} />
        <td className={cn(td, 'w-16 py-0 pr-2 text-right')}>
          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Open the ${row.item.name} ledger`}
              title="Open account ledger"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLedger(row);
              }}
            >
              <BookOpenText className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Month by month for ${row.item.name}`}
              title="Month by month"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMonthly(row);
              }}
            >
              <CalendarRange className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const toolbar = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56 max-sm:w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onSearch('')}
            placeholder="Search code or name"
            aria-label="Find account"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1 text-[10px] text-muted-foreground">/</kbd>
          )}
        </div>
        {type && (
          <Chip tone={GL_TYPE_META[type].tone} size="sm" className="gap-1.5 pr-1">
            {GL_TYPE_META[type].label}
            <button type="button" aria-label="Show all account types" onClick={() => onType(null)} className="rounded outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-3" />
            </button>
          </Chip>
        )}
        <div className="flex items-center gap-1.5">
          <Switch id="gl-active-only" checked={activeOnly} onCheckedChange={onActiveOnly} />
          <Label htmlFor="gl-active-only" className="cursor-pointer text-xs font-medium">
            With postings only
          </Label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {headerNote}
        <Select value={sort} onValueChange={(v) => onSort(v as GlSort)}>
          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Sort accounts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as GlSort[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {anyParents && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onCollapseAll(!allCollapsed)}>
            {allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        )}
      </div>
    </>
  );

  const { totals } = model;
  const balanced = Math.abs(totals.difference) < 0.005;

  return (
    <ScrollTableCard toolbar={<div className="flex w-full flex-wrap items-center justify-between gap-2 print:hidden">{toolbar}</div>} className="print:overflow-visible" containerClassName="print:overflow-visible">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
          <tr>
            <th className={th}>Account</th>
            <th className={cn(th, 'w-36 text-right max-md:hidden')}>Opening</th>
            <th className={cn(th, 'w-32 text-right')}>Debit</th>
            <th className={cn(th, 'w-32 text-right')}>Credit</th>
            <th className={cn(th, 'w-36 text-right max-lg:hidden')}>Net change</th>
            <th className={cn(th, 'w-40 text-right')}>Closing</th>
            <th className={cn(th, 'w-16 text-right max-sm:hidden')} title="Journal lines posted in the period">
              Lines
            </th>
            <th className="w-16" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {model.groups.length === 0 && (
            <tr>
              <td colSpan={COLS} className="px-3 py-12 text-center text-xs text-muted-foreground">
                <p className="font-medium text-foreground">No accounts match</p>
                <p className="mt-1">{filtered ? 'Try another search, or clear the filters.' : 'No accounts carry a balance or postings in this period.'}</p>
                {filtered && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => {
                      onSearch('');
                      onType(null);
                      onActiveOnly(false);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </td>
            </tr>
          )}
          {model.groups.map((g) => {
            const tone = TONE_CLASSES[g.meta.tone];
            return (
              <Fragment key={g.type}>
                <tr className="h-9 [&>td]:border-b [&>td]:border-border/60 bg-muted/40">
                  <td className={cn(td, 'py-2')}>
                    <div className="flex items-center gap-2">
                      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
                      <span className="text-[13px] font-semibold text-foreground">{g.meta.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {g.accountCount} {g.accountCount === 1 ? 'account' : 'accounts'} · normally {g.meta.normal}
                      </span>
                    </div>
                  </td>
                  <FigureCells f={g} fmt={fmt} strong />
                  <td />
                </tr>
                {g.direct.map((row) => accountRow(row, null, false))}
                {g.parents.map((p) => {
                  const isCollapsed = collapsed.has(p.key);
                  return (
                    <Fragment key={p.key}>
                      <tr
                        className="h-9 cursor-pointer [&>td]:border-b [&>td]:border-border/60 transition-colors hover:bg-muted/40"
                        onClick={() => onToggleParent(p.key)}
                      >
                        <td className={cn(td, 'pl-4')}>
                          <button
                            type="button"
                            aria-expanded={!isCollapsed}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleParent(p.key);
                            }}
                            className="flex min-w-0 items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {isCollapsed ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
                            {fmt.showCodes && p.code && <span className="fin-num w-12 shrink-0 text-muted-foreground">{p.code}</span>}
                            <span className="truncate font-medium text-foreground">{p.name}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{p.accounts.length}</span>
                          </button>
                        </td>
                        <FigureCells f={p} fmt={fmt} />
                        <td />
                      </tr>
                      {!isCollapsed && p.accounts.map((row) => accountRow(row, p, true))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
        {model.groups.length > 0 && (
          <tfoot className="sticky bottom-0 z-10 bg-background shadow-[0_-1px_0_var(--border)]">
            {/* Cells carry the background so scrolled rows don't show through the sticky total */}
            <tr className="[&>td]:bg-background">
              <td className={cn(td, 'py-2.5')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">{filtered ? 'Total of shown accounts' : 'Grand total'}</span>
                  {!filtered && (
                    <Chip tone={balanced ? 'positive' : 'negative'} size="sm">
                      {balanced ? 'Balanced' : `Out by ${fmt.money(Math.abs(totals.difference))}`}
                    </Chip>
                  )}
                  {filtered && (
                    <span className="text-[11px] text-muted-foreground">
                      {model.shown} of {model.total} accounts
                    </span>
                  )}
                </div>
              </td>
              <FigureCells f={filtered ? sumGroups(model) : totals} fmt={fmt} strong />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </ScrollTableCard>
  );
}

function sumGroups(model: GlSummaryModel): GlFigures {
  return model.groups.reduce<GlFigures>(
    (s, g) => ({ opening: s.opening + g.opening, debit: s.debit + g.debit, credit: s.credit + g.credit, closing: s.closing + g.closing, lines: s.lines + g.lines }),
    { opening: 0, debit: 0, credit: 0, closing: 0, lines: 0 },
  );
}
