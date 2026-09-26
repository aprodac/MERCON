import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/finance/format';
import { sumBalance, type AgeingDocument } from '@/lib/finance/ageing';

/** "3 selected · SAR 12,000" with an action, shown in a document table's toolbar while rows are selected. */
export function SelectionBar({ docs, children }: { docs: AgeingDocument[]; children: ReactNode }) {
  if (docs.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-2.5 py-1">
      <span className="text-xs text-muted-foreground">
        {docs.length} selected · <span className="fin-num font-medium text-foreground">SAR {formatMoney(sumBalance(docs))}</span>
      </span>
      {children}
    </div>
  );
}
