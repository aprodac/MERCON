import type { ReactNode } from 'react';
import { Landmark, Scale, Wallet } from 'lucide-react';
import type { NegativeFormat } from '@/components/finance/kit/StatementTable';
import { TwoColumnStatement, type StatementSide } from '@/components/finance/kit/TwoColumnStatement';
import { BS_SENSE, type BsAccountRow, type BsGroup, type BsSection, type BsSectionKey } from '@/lib/finance/bsStructure';
import type { StmtGroup, StmtItem } from '@/lib/finance/statementModel';
import { SECTION_TONE } from './BalanceEquation';

export type { NegativeFormat };

export const BS_SECTION_ICON = { assets: Wallet, liabilities: Landmark, equity: Scale };

/** One side of the balance sheet: its sections and the total that closes it. */
export interface StatementPart {
  title: string;
  sections: BsSection[];
  totalLabel: string;
  total: number;
  compareTotal: number | null;
}

/** Balance-sheet sections → one side of the shared two-column statement. */
function toSide(part: StatementPart, balanced: boolean, groups: Map<string, BsGroup>): StatementSide {
  const items: StmtItem[] = part.sections.map((s) => {
    // A section whose only block carries its own name needs no block heading
    const headed = s.blocks.length > 1 || (s.blocks[0] && s.blocks[0].label !== s.label);
    return {
      kind: 'section',
      key: s.key,
      label: s.label,
      tone: SECTION_TONE[s.key],
      sense: BS_SENSE[s.key],
      amount: s.amount,
      compare: s.compare,
      blocks: s.blocks.map((b) => ({
        key: b.key,
        label: headed ? b.label : null,
        amount: b.amount,
        compare: b.compare,
        groups: b.groups.map((g) => {
          groups.set(g.key, g);
          return {
            key: g.key,
            label: g.label,
            amount: g.amount,
            compare: g.compare,
            lines: g.accounts.map((a) => ({ key: a.key, label: a.item.name, code: a.item.account_code, amount: a.amount, compare: a.compare, ref: a })),
          };
        }),
      })),
    };
  });
  return {
    title: part.title,
    items,
    footer: {
      kind: 'total',
      key: part.totalLabel,
      label: part.totalLabel,
      // Both sides agree: totals read green, otherwise red
      tone: balanced ? 'positive' : 'negative',
      sense: 'neutral',
      amount: part.total,
      compare: part.compareTotal,
    },
  };
}

/** The balance sheet in two columns: assets on the left, liabilities and equity on the right. */
export function BalanceSheetStatement({
  left,
  right,
  comparing,
  compareLabel,
  expanded,
  onToggle,
  onAccount,
  showCodes,
  negativeFormat,
  highlight,
  renderGroupBadge,
  balanced,
  onlyChanged = false,
}: {
  left: StatementPart;
  right: StatementPart;
  comparing: boolean;
  compareLabel?: string;
  expanded: Set<string>;
  onToggle: (groupKey: string) => void;
  onAccount: (row: BsAccountRow) => void;
  showCodes: boolean;
  negativeFormat: NegativeFormat;
  highlight: BsSectionKey | null;
  renderGroupBadge?: (group: BsGroup) => ReactNode;
  balanced: boolean;
  /** Unchanged accounts are filtered out, so an empty section means nothing moved. */
  onlyChanged?: boolean;
}) {
  const groups = new Map<string, BsGroup>();
  const part = { key: 'balance-sheet', left: toSide(left, balanced, groups), right: toSide(right, balanced, groups) };
  return (
    <TwoColumnStatement
      parts={[part]}
      comparing={comparing}
      compareLabel={compareLabel}
      expanded={expanded}
      onToggle={onToggle}
      onLine={(line) => onAccount(line.ref as BsAccountRow)}
      showCodes={showCodes}
      negativeFormat={negativeFormat}
      highlight={highlight}
      sectionIcons={BS_SECTION_ICON}
      renderGroupBadge={
        renderGroupBadge &&
        ((g: StmtGroup) => {
          const source = groups.get(g.key);
          return source ? renderGroupBadge(source) : null;
        })
      }
      emptyText={onlyChanged ? 'Nothing changed.' : 'Nothing recorded.'}
    />
  );
}
