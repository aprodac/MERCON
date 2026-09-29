/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { tripService } from '@/services/tripService';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/lib/finance/format';
import { cn } from '@/lib/utils';
import { toPickedTrip, type PickedTrip } from '@/lib/expenses/pickedTrip';

/** Search trips by reference, customer, truck or driver; subcontracted trips can't be chosen. */
export function TripPicker({ value, onChange, disabled }: { value: PickedTrip | null; onChange: (t: PickedTrip | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 250);
  const { data, isFetching } = useQuery({
    queryKey: ['trips', 'expense-picker', q],
    queryFn: () => tripService.getAll({ search: q || undefined, per_page: 25 }),
    enabled: open,
  });
  const trips = ((data?.data ?? []) as any[]).map(toPickedTrip);

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Trip"
            disabled={disabled}
            className={cn('h-9 w-full justify-between gap-2 px-3 text-left text-sm font-normal', !value && 'text-muted-foreground')}
          >
            <span className="truncate">
              {value ? (
                <>
                  <span className="font-medium text-foreground">{value.ref_id ?? 'Trip'}</span>
                  {value.plate && <span className="text-muted-foreground"> · {value.plate}</span>}
                </>
              ) : disabled ? (
                'Not for this category'
              ) : (
                'No trip'
              )}
            </span>
            <ChevronsUpDown className={cn('size-3.5 shrink-0 opacity-50', value && !disabled && 'invisible')} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[340px] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder="Trip #, customer, truck, driver…" className="h-9 text-xs" />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-6 text-center text-xs">{isFetching ? 'Searching…' : 'No trip found.'}</CommandEmpty>
              <CommandGroup>
                {trips.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.id}
                    disabled={t.is_third_party}
                    onSelect={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className="flex items-start gap-2 text-xs"
                  >
                    <Check className={cn('mt-0.5 size-3.5 shrink-0', value?.id === t.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{t.ref_id ?? 'Trip'}</span>
                        <span className="shrink-0 text-muted-foreground">{t.day ? formatDate(t.day) : ''}</span>
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {t.is_third_party ? 'Subcontracted, no expenses' : [t.plate, t.driver, t.customer].filter(Boolean).join(' · ') || 'No truck assigned'}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Remove the trip"
          title="Remove the trip"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
