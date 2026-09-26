import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PartySort } from '@/lib/finance/ageing';

/** Search + "Overdue only" + optional sort, rendered inside a table card's header. */
export function AgeingFilterBar({
  search,
  onSearch,
  placeholder,
  overdueOnly,
  onOverdueOnly,
  sort,
  onSort,
  partyNoun,
  trailing,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  overdueOnly: boolean;
  onOverdueOnly: (value: boolean) => void;
  sort?: PartySort;
  onSort?: (value: PartySort) => void;
  partyNoun?: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="ageing-overdue-only" checked={overdueOnly} onCheckedChange={onOverdueOnly} />
          <Label htmlFor="ageing-overdue-only" className="cursor-pointer text-xs font-normal text-muted-foreground">Overdue only</Label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {trailing}
        {sort && onSort && (
          <Select value={sort} onValueChange={(v) => onSort(v as PartySort)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total_desc">Highest total first</SelectItem>
              <SelectItem value="overdue_desc">Most overdue first</SelectItem>
              <SelectItem value="total_asc">Lowest total first</SelectItem>
              <SelectItem value="name_asc">{partyNoun ?? 'Name'} A–Z</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </>
  );
}
