import { useMemo, useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAgeingDocuments, type AgeingSide } from '@/hooks/useAgeingWorkspace';
import { buildScheduleWeeks, projectCash, type AgeingDocument, type ScheduleWeek } from '@/lib/finance/ageing';
import { AgeingSchedule } from './AgeingSchedule';

/**
 * Weekly forecast for one side of the ledger, starting from bank + cash on hand.
 * The switch adds the other side (payables on AR, receivables on AP) so the line becomes net cash.
 */
export function AgeingForecast({
  side,
  docs,
  asOf,
  basis,
  startCash,
  renderWeekAction,
}: {
  side: AgeingSide;
  docs: AgeingDocument[];
  asOf: string;
  basis: 'due' | 'bill';
  startCash: number;
  renderWeekAction?: (week: ScheduleWeek) => ReactNode;
}) {
  const [includeOther, setIncludeOther] = useState(false);
  const otherSide: AgeingSide = side === 'receivables' ? 'payables' : 'receivables';
  const other = useAgeingDocuments(otherSide, asOf, basis, includeOther);

  const own = useMemo(() => buildScheduleWeeks(docs, asOf), [docs, asOf]);
  const opposite = useMemo(() => (includeOther ? buildScheduleWeeks(other.docs, asOf) : null), [includeOther, other.docs, asOf]);
  const inflows = side === 'receivables' ? own : opposite;
  const outflows = side === 'payables' ? own : opposite;
  const cash = useMemo(() => projectCash(startCash, inflows, outflows), [startCash, inflows, outflows]);

  return (
    <AgeingSchedule
      inflows={inflows}
      outflows={outflows}
      cash={cash}
      startCash={startCash}
      inflowLabel="Collections"
      outflowLabel="Payments"
      // Week keys match across both schedules; actions always get this side's documents
      renderWeekAction={renderWeekAction && ((w) => renderWeekAction(own.find((o) => o.key === w.key) ?? w))}
      headerAction={
        <div className="flex items-center gap-2">
          <Switch id="forecast-include-other" checked={includeOther} onCheckedChange={setIncludeOther} />
          <Label htmlFor="forecast-include-other" className="cursor-pointer text-xs font-normal text-muted-foreground">
            Include {otherSide}
          </Label>
        </div>
      }
    />
  );
}
