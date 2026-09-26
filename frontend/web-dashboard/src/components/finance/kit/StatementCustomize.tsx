import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import type { NegativeFormat } from './StatementTable';

/** View options for a financial statement, plus resetting locally saved account groupings. */
export function StatementCustomize({
  open,
  onOpenChange,
  showCodes,
  onShowCodes,
  keepZero,
  onKeepZero,
  negativeFormat,
  onNegativeFormat,
  overrideCount,
  onResetOverrides,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showCodes: boolean;
  onShowCodes: (v: boolean) => void;
  keepZero: boolean;
  onKeepZero: (v: boolean) => void;
  negativeFormat: NegativeFormat;
  onNegativeFormat: (v: NegativeFormat) => void;
  overrideCount: number;
  onResetOverrides: () => void;
  /** Page-specific options, shown after the common ones. */
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-base">Customize</SheetTitle>
          <SheetDescription className="text-xs">How the statement is shown. Saved in the page link.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-5">
          <CustomizeToggle id="stmt-codes" label="Account codes" hint="Show the code before each account name." checked={showCodes} onChange={onShowCodes} />
          <CustomizeToggle id="stmt-zero" label="Zero-balance accounts" hint="Include accounts with nothing in them." checked={keepZero} onChange={onKeepZero} />
          {children}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Negative amounts</Label>
            <SegmentedControl
              aria-label="Negative amounts"
              value={negativeFormat}
              onChange={onNegativeFormat}
              options={[{ value: 'minus', label: '−1,250.00' }, { value: 'parens', label: '(1,250.00)' }]}
            />
          </div>
          {overrideCount > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-[11px] text-muted-foreground">
                {overrideCount} account {overrideCount === 1 ? 'grouping is' : 'groupings are'} customised in this browser.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onResetOverrides}>
                <RotateCcw className="size-3.5" /> Reset groupings
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One labelled switch in the Customize sheet. */
export function CustomizeToggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id} className="cursor-pointer text-xs font-medium">{label}</Label>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
