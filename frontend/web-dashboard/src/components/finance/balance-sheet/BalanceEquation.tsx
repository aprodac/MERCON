import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ChipTone } from '@/components/ui/chip';
import { FigurePopover } from '@/components/finance/kit/FigurePopover';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { BS_SENSE, balanceSheetRatios, type BalanceSheetTree, type BsSectionKey } from '@/lib/finance/bsStructure';
import { HeadlineTerm } from '@/components/finance/kit/HeadlineTerm';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

/** One colour per section, used for its header band and its equation term. */
export const SECTION_TONE: Record<BsSectionKey, ChipTone> = { assets: 'info', liabilities: 'orange', equity: 'violet' };

const ratio = (n: number | null, suffix = '') => (n === null ? '—' : `${n.toFixed(2)}${suffix}`);

/**
 * The accounting equation as the page header: Assets = Liabilities + Equity, each term in its
 * section colour, the balance check on the "=" sign, and the key ratios with their breakdowns.
 */
export function BalanceEquation({
  tree,
  compareLabel,
  onSection,
}: {
  tree: BalanceSheetTree;
  compareLabel?: string;
  /** A term was clicked: open or close that section's groups. */
  onSection: (key: BsSectionKey) => void;
}) {
  const { totals } = tree;
  const r = balanceSheetRatios(totals);
  const balanced = Math.abs(totals.difference) < 0.005;
  const comparing = tree.assets.compare !== null;
  const priorDifference = comparing ? (tree.assets.compare ?? 0) - (tree.liabilities.compare ?? 0) - (tree.equity.compare ?? 0) : 0;
  const priorBalanced = Math.abs(priorDifference) < 0.005;
  const op = 'shrink-0 px-1 text-xl font-light text-muted-foreground';

  return (
    <Card className="flex shrink-0 flex-col gap-3 rounded-xl p-2.5 shadow-xs lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <HeadlineTerm label={tree.assets.label} amount={totals.assets} tone={SECTION_TONE.assets} sense={BS_SENSE.assets} compare={tree.assets.compare} compareLabel={compareLabel} title={`Show or hide the ${tree.assets.label.toLowerCase()} accounts`} onClick={() => onSection('assets')} />
        <div className="flex shrink-0 flex-col items-center px-1">
          <span className={cn('text-xl font-light', balanced ? 'text-muted-foreground' : TONE_CLASSES.negative.fg)}>{balanced ? '=' : '≠'}</span>
          <span className={cn('flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium', balanced ? TONE_CLASSES.positive.fg : TONE_CLASSES.negative.fg)}>
            {balanced ? (
              <>
                <Check className="size-3" /> Balanced
              </>
            ) : (
              `Out by ${formatMoney(Math.abs(totals.difference))}`
            )}
          </span>
          {comparing && (
            <span className={cn('whitespace-nowrap text-[10px]', priorBalanced ? 'text-muted-foreground' : TONE_CLASSES.negative.fg)}>
              {priorBalanced ? 'both dates' : `out by ${formatMoney(Math.abs(priorDifference))} then`}
            </span>
          )}
        </div>
        <HeadlineTerm label={tree.liabilities.label} amount={totals.liabilities} tone={SECTION_TONE.liabilities} sense={BS_SENSE.liabilities} compare={tree.liabilities.compare} compareLabel={compareLabel} title={`Show or hide the ${tree.liabilities.label.toLowerCase()} accounts`} onClick={() => onSection('liabilities')} />
        <span className={op}>+</span>
        <HeadlineTerm label={tree.equity.label} amount={totals.equity} tone={SECTION_TONE.equity} sense={BS_SENSE.equity} compare={tree.equity.compare} compareLabel={compareLabel} title={`Show or hide the ${tree.equity.label.toLowerCase()} accounts`} onClick={() => onSection('equity')} />
      </div>

      <div className="flex shrink-0 items-center gap-1 lg:border-l lg:pl-3">
        <FigurePopover
          figure={{
            id: 'current-ratio',
            label: 'Current ratio',
            value: ratio(r.currentRatio, 'x'),
            tone: r.currentRatio !== null && r.currentRatio < 1 ? 'negative' : undefined,
            breakdown: [
              { label: 'Current assets', value: formatMoney(totals.currentAssets) },
              { label: 'Current liabilities', value: formatMoney(totals.currentLiabilities) },
              { label: 'Working capital', value: formatMoney(r.workingCapital), tone: r.workingCapital < 0 ? 'negative' : undefined },
              { label: 'Quick ratio', value: ratio(r.quickRatio, 'x') },
            ],
            explain:
              'Current assets ÷ current liabilities: what you can turn into cash within a year against what you owe within a year. Below 1x means short-term debts are larger than short-term assets. The quick ratio counts only cash, bank and receivables.',
          }}
        />
        <FigurePopover
          figure={{
            id: 'debt-to-equity',
            label: 'Debt to equity',
            value: ratio(r.debtToEquity),
            tone: r.debtToEquity !== null && r.debtToEquity > 2 ? 'warning' : undefined,
            breakdown: [
              { label: 'Total liabilities', value: formatMoney(totals.liabilities) },
              { label: 'Equity', value: formatMoney(totals.equity) },
            ],
            explain: 'Total liabilities ÷ equity: how much of the business is funded by borrowing against what the owners have put in and kept. Above 2 means debt-heavy.',
          }}
        />
      </div>
    </Card>
  );
}
