import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MoneyText } from '@/components/finance/kit';
import type { AdvancePartyType } from '@mercon/shared-types';

interface AdvanceGroupRowProps {
  partyName: string;
  partyType?: AdvancePartyType;
  totalRemaining: number;
  count: number;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Customer: { bg: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  Provider: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  Employee: { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
};

export const AdvanceGroupRow: React.FC<AdvanceGroupRowProps> = ({
  partyName,
  partyType,
  totalRemaining,
  count,
}) => {
  const style = (partyType && TYPE_STYLES[partyType]) || {
    bg: 'bg-muted ',
    text: 'text-foreground ',
    dot: 'bg-slate-400',
  };

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-muted/90 backdrop-blur border-y border-border dark:border-border text-xs font-semibold">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
        <span className="text-foreground font-bold">{partyName}</span>
        {partyType && (
          <Badge variant="outline" className={`${style.bg} ${style.text} border-transparent text-[11px] font-semibold py-0 px-2`}>
            {partyType}
          </Badge>
        )}
        <span className="text-muted-foreground dark:text-muted-foreground font-normal">
          ({count} advance{count === 1 ? '' : 's'})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground dark:text-muted-foreground font-normal">Remaining:</span>
        <MoneyText value={totalRemaining} className="font-bold text-foreground" />
      </div>
    </div>
  );
};
