import { Landmark, Wallet } from 'lucide-react';
import type { BankAccount } from '@mercon/shared-types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

/** Bank / cash accounts as radio cards with their book balance. Value is the linked GL account id. */
export function BankAccountPicker({
  accounts,
  value,
  onChange,
  idPrefix,
}: {
  accounts: BankAccount[];
  value: string;
  onChange: (glAccountId: string) => void;
  idPrefix: string;
}) {
  if (accounts.length === 0) {
    return <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No bank or cash accounts yet.</p>;
  }
  return (
    <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {accounts.map((acc) => {
        const id = `${idPrefix}-${acc.id}`;
        const Icon = acc.is_cash ? Wallet : Landmark;
        return (
          <div key={acc.id}>
            <RadioGroupItem value={acc.accountId} id={id} className="peer sr-only" />
            <Label
              htmlFor={id}
              className={cn(
                'flex cursor-pointer flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-xs font-normal transition-colors hover:bg-muted/40',
                'peer-data-[state=checked]:border-foreground/40 peer-data-[state=checked]:bg-muted/60 peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
              )}
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Icon className="size-4 text-muted-foreground" />
                <span className="truncate">{acc.bank_name || (acc.is_cash ? 'Cash' : 'Bank account')}</span>
                {acc.account_number && <span className="text-muted-foreground">····{acc.account_number.slice(-4)}</span>}
              </span>
              <span className="flex items-center justify-between text-muted-foreground">
                Book balance
                <span className="fin-num font-medium text-foreground">{formatMoney(Number(acc.book_balance ?? 0))}</span>
              </span>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
