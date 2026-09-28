import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FigurePopover } from '@/components/finance/kit/FigurePopover';
import { HeadlineTerm } from '@/components/finance/kit/HeadlineTerm';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { GL_TYPES, GL_TYPE_META, naturalAmount, typeTotals, type GlAccountType, type GlSummaryModel } from '@/lib/finance/glSummary';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

/**
 * Ledger summary header: one tile per account type (balance at the end of the period, and how it
 * moved), plus the trial check — period debits equal period credits.
 *
 * Balance-sheet types show "from <opening>" and the change; revenue and expenses show what was
 * earned or spent in the period, since their balance before it isn't a useful comparison.
 */
export function LedgerSummaryHeadline({
  totals,
  model,
  openingLabel,
  active,
  onType,
}: {
  totals: ReturnType<typeof typeTotals>;
  model: GlSummaryModel;
  openingLabel: string;
  /** The type the table is filtered to, if any. */
  active: GlAccountType | null;
  onType: (type: GlAccountType | null) => void;
}) {
  const { debit, credit, difference, lines, accounts, activeAccounts } = model.totals;
  const balanced = Math.abs(difference) < 0.005;

  return (
    <Card className="flex shrink-0 flex-col gap-3 rounded-xl p-2.5 shadow-xs xl:flex-row xl:items-center">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {GL_TYPES.map((type) => {
          const meta = GL_TYPE_META[type];
          const t = totals[type];
          const closing = naturalAmount(t.closing, type);
          const periodAmount = naturalAmount(t.movement, type);
          const selected = active === type;
          return (
            <HeadlineTerm
              key={type}
              label={`${meta.label} · ${t.accounts}`}
              amount={closing}
              tone={meta.tone}
              sense={meta.sense}
              compare={meta.statement === 'bs' ? naturalAmount(t.opening, type) : null}
              compareLabel={openingLabel}
              note={
                <>
                  <span className="fin-num font-medium text-foreground/80">{formatMoney(periodAmount)}</span> {type === 'Revenue' ? 'earned' : 'spent'} in period
                </>
              }
              title={selected ? 'Show all account types' : `Show only ${meta.label.toLowerCase()}`}
              onClick={() => onType(selected ? null : type)}
              className={cn(selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background', active && !selected && 'opacity-60')}
            />
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 xl:border-l xl:pl-3">
        <div className="flex flex-col" title="Every posting has a debit and a credit, so the two totals must match.">
          <span className="text-[11px] text-muted-foreground">Trial check</span>
          <span className={cn('flex items-center gap-1 text-sm font-semibold', balanced ? TONE_CLASSES.positive.fg : TONE_CLASSES.negative.fg)}>
            {balanced ? (
              <>
                <Check className="size-3.5" /> Dr = Cr
              </>
            ) : (
              <span className="fin-num">Out by {formatMoney(Math.abs(difference))}</span>
            )}
          </span>
        </div>
        <FigurePopover
          figure={{
            id: 'gl-activity',
            label: 'Period activity',
            value: `${lines.toLocaleString('en-US')} lines`,
            breakdown: [
              { label: 'Total debits', value: formatMoney(debit) },
              { label: 'Total credits', value: formatMoney(credit) },
              { label: 'Difference', value: formatMoney(difference), tone: balanced ? 'positive' : 'negative' },
              { label: 'Accounts with postings', value: `${activeAccounts} of ${accounts}` },
            ],
            explain:
              'Posted and voided journal lines dated inside the period. A voided entry and its reversal both count, and cancel each other out.',
          }}
        />
      </div>
    </Card>
  );
}
