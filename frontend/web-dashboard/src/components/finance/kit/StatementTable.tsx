import { Fragment, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { changePct, senseTone, type ChangeSense, type StmtGroup, type StmtItem, type StmtLine } from '@/lib/finance/statementModel';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

export type NegativeFormat = 'minus' | 'parens';
type TotalItem = Extract<StmtItem, { kind: 'total' }>;

const cell = 'px-3 py-2 text-xs';
const num = 'fin-num whitespace-nowrap text-right';

/**
 * Financial statement table. Rows stay plain: each section is introduced by a small coloured pill
 * (icon + name), groups collapse to one line and open on click, accounts open their ledger. Under
 * an amount sits the change against the comparison, coloured by whether it's good news.
 */
export function StatementTable({
  items,
  comparing,
  compareLabel,
  expanded,
  onToggle,
  onLine,
  showCodes,
  negativeFormat,
  showShare = false,
  shareLabel = 'of revenue',
  highlight,
  renderGroupBadge,
  emptyText = 'Nothing recorded.',
  title,
  aside,
  footer,
  fill = false,
  sectionIcons,
}: {
  items: StmtItem[];
  comparing: boolean;
  /** "31 Aug 2026", for the hover text on change lines. */
  compareLabel?: string;
  expanded: Set<string>;
  onToggle: (groupKey: string) => void;
  onLine: (line: StmtLine) => void;
  showCodes: boolean;
  negativeFormat: NegativeFormat;
  showShare?: boolean;
  shareLabel?: string;
  /** Section key to mark briefly (after a header click). */
  highlight?: string | null;
  renderGroupBadge?: (group: StmtGroup) => ReactNode;
  emptyText?: string;
  /** Card heading, e.g. "Costs" / "Income". */
  title?: string;
  /** Small text at the right of the heading, e.g. "Amount (SAR)". */
  aside?: string;
  /** Closing total pinned to the card's bottom edge, so side-by-side totals line up. */
  footer?: TotalItem;
  /** Stretch to the height of its grid row (side-by-side cards of equal height) instead of fitting content. */
  fill?: boolean;
  /** Icon per section key, shown in the section's pill. */
  sectionIcons?: Record<string, LucideIcon>;
}) {
  const money = (n: number) => {
    const text = formatMoney(Math.abs(n));
    if (n > -0.005) return text;
    return <span className={TONE_CLASSES.negative.fg}>{negativeFormat === 'parens' ? `(${text})` : `−${text}`}</span>;
  };

  // Second line under an amount: the change when comparing, otherwise (if enabled) the share
  const subline = (a: number, b: number | null, sense: ChangeSense, share?: number | null) => {
    if (comparing && b !== null) {
      const d = a - b;
      if (Math.abs(d) < 0.005) return <span className="block text-[10px] font-normal text-muted-foreground">no change</span>;
      const tone = senseTone(sense, d);
      const pct = changePct(a, b);
      return (
        <span title={`${formatMoney(b)} on ${compareLabel}`} className={cn('block text-[10px] font-medium', tone ? TONE_CLASSES[tone].fg : 'text-muted-foreground')}>
          {d > 0 ? '▲' : '▼'} {formatMoney(Math.abs(d))}
          {pct !== null && ` · ${Math.abs(pct).toFixed(1)}%`}
        </span>
      );
    }
    if (showShare && share !== undefined && share !== null) {
      return <span className="block text-[10px] font-normal text-muted-foreground">{share.toFixed(1)}% {shareLabel}</span>;
    }
    return null;
  };

  const amountCell = (a: number, b: number | null, sense: ChangeSense, share: number | null | undefined, className?: string) => (
    <td className={cn(cell, num, className)}>
      {money(a)}
      {subline(a, b, sense, share)}
    </td>
  );

  /** Unchanged rows fade back so the eye lands on what moved. */
  const still = (a: number, b: number | null) => comparing && b !== null && Math.abs(a - b) < 0.005;

  const lineRow = (sense: ChangeSense, line: StmtLine, indent: boolean, group?: StmtGroup) => (
    <tr
      key={line.key}
      onClick={() => onLine(line)}
      className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/50', indent && 'text-muted-foreground', still(line.amount, line.compare) && 'opacity-55')}
    >
      <td className={cn(cell, indent ? 'pl-11' : 'pl-5')}>
        <span className="flex items-center gap-1.5">
          <span className={cn(!indent && 'text-foreground')}>
            {showCodes && line.code && <span className="mr-2 inline-block w-10 text-muted-foreground tabular-nums">{line.code}</span>}
            {group?.label ?? line.label}
          </span>
          {group && renderGroupBadge?.(group)}
        </span>
      </td>
      {amountCell(line.amount, line.compare, sense, group?.share ?? line.share, indent ? undefined : 'text-foreground')}
    </tr>
  );

  const totalTone = (t: TotalItem) => (t.tone === 'neutral' ? 'text-foreground' : TONE_CLASSES[t.tone].fg);

  return (
    <ScrollTableCard
      className={cn(fill ? 'h-full flex-1' : 'max-h-full flex-initial max-md:max-h-[75vh]', 'print:max-h-none')}
      containerClassName="print:overflow-visible"
      toolbar={
        title && (
          <>
            <span className="text-xs font-semibold text-foreground">{title}</span>
            {aside && <span className="text-[11px] text-muted-foreground">{aside}</span>}
          </>
        )
      }
      footer={
        footer && (
          <>
            <span className={cn('text-[13px] font-semibold', totalTone(footer))}>{footer.label}</span>
            <span className={cn('fin-num text-right text-[13px] font-semibold', totalTone(footer))}>
              {money(footer.amount)}
              {subline(footer.amount, footer.compare, footer.sense, footer.share)}
            </span>
          </>
        )
      }
      footerClassName={footer ? 'flex-nowrap border-t-[1.5px] border-foreground/30 bg-card px-3' : undefined}
    >
      <table className="w-full min-w-[360px] text-left">
        {items.map((item) => {
          if (item.kind === 'total') {
            return (
              <tbody key={item.key}>
                <tr className="border-t-[1.5px] border-foreground/30 font-semibold">
                  <td className={cn(cell, 'py-2.5 text-[13px]', totalTone(item))}>{item.label}</td>
                  {amountCell(item.amount, item.compare, item.sense, item.share, cn('py-2.5 text-[13px]', totalTone(item)))}
                </tr>
              </tbody>
            );
          }

          if (item.kind === 'line') {
            const fg = item.tone ? TONE_CLASSES[item.tone].fg : 'text-foreground';
            return (
              <tbody key={item.key}>
                <tr className="border-b border-border/60" title={item.hint}>
                  <td className={cn(cell, 'pl-5 font-medium', fg)}>
                    {item.label}
                    {item.tag && <span className="ml-2 rounded bg-muted px-1.5 py-px text-[10px] font-normal text-muted-foreground">{item.tag}</span>}
                  </td>
                  {amountCell(item.amount, item.compare, item.sense, item.share, cn('font-medium', fg))}
                </tr>
              </tbody>
            );
          }

          const tone = TONE_CLASSES[item.tone];
          const Icon = sectionIcons?.[item.key];
          return (
            <tbody key={item.key}>
              <tr id={`stmt-${item.key}`} className={cn('transition-colors', highlight === item.key && 'bg-muted')}>
                <td className={cn(cell, 'pb-1.5 pt-3.5')}>
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-3 text-xs font-semibold', Icon ? 'pl-1.5' : 'pl-3', tone.bg, tone.border, tone.fg)}>
                    {Icon && <Icon className="size-3.5" aria-hidden="true" />}
                    {item.label}
                  </span>
                </td>
                {amountCell(item.amount, item.compare, item.sense, item.share, 'pb-1.5 pt-3.5 text-[13px] font-semibold text-foreground')}
              </tr>
              {item.blocks.length === 0 && (
                <tr className="border-b border-border/60">
                  <td colSpan={2} className={cn(cell, 'pl-5 text-muted-foreground')}>{emptyText}</td>
                </tr>
              )}
              {item.blocks.map((b) => (
                <Fragment key={b.key}>
                  {b.label && (
                    <tr>
                      <td className={cn(cell, 'pb-1 pl-5 pt-2.5 text-[11px] font-medium text-muted-foreground')}>{b.label}</td>
                      {amountCell(b.amount, b.compare, item.sense, b.share, 'pb-1 pt-2.5 text-[11px] font-medium text-muted-foreground')}
                    </tr>
                  )}
                  {b.groups.map((g) => {
                    // One account: the row is that account, clicked straight through to its entries
                    if (g.lines.length === 1) return lineRow(item.sense, g.lines[0], false, g);
                    const open = expanded.has(g.key);
                    return (
                      <Fragment key={g.key}>
                        <tr
                          onClick={() => onToggle(g.key)}
                          aria-expanded={open}
                          className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/50', still(g.amount, g.compare) && 'opacity-55')}
                        >
                          <td className={cn(cell, 'pl-4')}>
                            <span className="flex items-center gap-1.5">
                              <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                              <span className="text-foreground">{g.label}</span>
                              <span className="text-[11px] text-muted-foreground">{g.lines.length}</span>
                              {renderGroupBadge?.(g)}
                            </span>
                          </td>
                          {amountCell(g.amount, g.compare, item.sense, g.share, 'text-foreground')}
                        </tr>
                        {open && g.lines.map((l) => lineRow(item.sense, l, true))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          );
        })}
      </table>
    </ScrollTableCard>
  );
}
