import type { ComponentProps } from 'react';
import type { StmtItem } from '@/lib/finance/statementModel';
import { StatementTable } from './StatementTable';

type TableProps = ComponentProps<typeof StatementTable>;
type Shared = Omit<TableProps, 'items' | 'title' | 'aside' | 'footer' | 'fill'>;

export interface StatementSide {
  title: string;
  items: StmtItem[];
  footer: Extract<StmtItem, { kind: 'total' }>;
}

export interface TwoColumnPart {
  key: string;
  /** Heading above the pair, e.g. "Trading account". Omitted for a single-part statement. */
  title?: string;
  hint?: string;
  left: StatementSide;
  right: StatementSide;
}

/**
 * Two-column statement (Tally layout): each part is a pair of equal-height cards whose totals sit
 * on the same line. The whole view scrolls as one; cards don't scroll on their own.
 */
export function TwoColumnStatement({ parts, aside = 'Amount (SAR)', ...table }: Shared & { parts: TwoColumnPart[]; aside?: string }) {
  return (
    <div className="table-container min-h-0 flex-1 space-y-4 overflow-auto pb-1 print:overflow-visible">
      {parts.map((p) => (
        <section key={p.key} aria-label={p.title} className="space-y-1.5">
          {p.title && (
            <div className="flex flex-wrap items-baseline gap-x-2 px-1">
              <h2 className="text-sm font-semibold text-foreground">{p.title}</h2>
              {p.hint && <p className="text-[11px] text-muted-foreground">{p.hint}</p>}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2 print:grid-cols-2">
            {[p.left, p.right].map((side) => (
              <StatementTable key={side.title} {...table} items={side.items} title={side.title} aside={aside} footer={side.footer} fill />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
