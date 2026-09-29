import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { AsOfControl } from '@/components/finance/kit/AsOfControl';

export interface AgeingView<V extends string> {
  key: V;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function BasisToggle({
  value,
  onChange,
  documentLabel,
}: {
  value: 'due' | 'bill';
  onChange: (value: 'due' | 'bill') => void;
  /** "Bill date" for payables, "Invoice date" for receivables. */
  documentLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Ageing by</span>
      <SegmentedControl
        aria-label="Ageing basis"
        value={value}
        onChange={onChange}
        options={[{ value: 'due', label: 'Due date' }, { value: 'bill', label: documentLabel }]}
      />
    </div>
  );
}

/** Toolbar row per DESIGN.md §4.0a: view tabs on the left, as-of / basis / page actions on the right. */
export function AgeingToolbar<V extends string>({
  views,
  view,
  onViewChange,
  asOf,
  onAsOfChange,
  basis,
  onBasisChange,
  documentDateLabel,
  actions,
}: {
  views: AgeingView<V>[];
  view: V;
  onViewChange: (view: V) => void;
  asOf: string;
  onAsOfChange: (date: string) => void;
  basis: 'due' | 'bill';
  onBasisChange: (basis: 'due' | 'bill') => void;
  documentDateLabel: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-center lg:justify-between">
      <Tabs value={view} onValueChange={(v) => onViewChange(v as V)}>
        <TabsList className="h-9">
          {views.map((v) => (
            <TabsTrigger key={v.key} value={v.key} className="gap-1.5 text-xs">
              <v.icon className="size-3.5" />
              {v.label}
              {v.count !== undefined && (
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{v.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <AsOfControl value={asOf} onChange={onAsOfChange} />
        <BasisToggle value={basis} onChange={onBasisChange} documentLabel={documentDateLabel} />
        {actions}
      </div>
    </div>
  );
}
