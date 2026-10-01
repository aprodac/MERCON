import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PartyAvatar } from '@/components/finance/ageing/PartyAvatar';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

export interface PickerCustomer {
  id: string;
  name: string;
  payment_terms?: string | null;
}

/** Searchable customer choice; customers with completed, unbilled trips are listed first. */
export function CustomerPicker({
  customers,
  value,
  onChange,
  unbilled,
  disabled,
  isLoading,
}: {
  customers: PickerCustomer[];
  value: string;
  onChange: (id: string) => void;
  unbilled: Map<string, { count: number; amount: number }>;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = customers.find((c) => c.id === value);
  const ready = customers.filter((c) => (unbilled.get(c.id)?.count ?? 0) > 0).sort((a, b) => (unbilled.get(b.id)?.amount ?? 0) - (unbilled.get(a.id)?.amount ?? 0));
  const rest = customers.filter((c) => !((unbilled.get(c.id)?.count ?? 0) > 0));

  const item = (c: PickerCustomer) => {
    const u = unbilled.get(c.id);
    return (
      <CommandItem
        key={c.id}
        value={`${c.name} ${c.id}`}
        onSelect={() => {
          onChange(c.id);
          setOpen(false);
        }}
        className="flex items-center gap-2 text-xs"
      >
        <PartyAvatar name={c.name} className="size-6 text-[10px]" />
        <span className="min-w-0 flex-1 truncate">{c.name}</span>
        {u && u.count > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {u.count} · <span className="fin-num">{formatMoney(u.amount)}</span>
          </span>
        )}
        <Check className={cn('size-3.5 shrink-0', c.id === value ? 'opacity-100' : 'opacity-0')} />
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Customer"
          disabled={disabled}
          className={cn('h-10 w-full justify-between gap-2 px-2.5 text-left font-normal', !current && 'text-muted-foreground')}
        >
          {current ? (
            <span className="flex min-w-0 items-center gap-2">
              <PartyAvatar name={current.name} className="size-6 text-[10px]" />
              <span className="truncate text-sm font-medium text-foreground">{current.name}</span>
            </span>
          ) : (
            <span className="text-sm">{isLoading ? 'Loading customers…' : 'Choose a customer'}</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search customers…" className="h-9 text-xs" />
          <CommandList className="max-h-80">
            <CommandEmpty className="py-6 text-center text-xs">No customer found.</CommandEmpty>
            {ready.length > 0 && <CommandGroup heading="Ready to bill">{ready.map(item)}</CommandGroup>}
            <CommandGroup heading={ready.length > 0 ? 'Other customers' : 'Customers'}>{rest.map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
