import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Single-choice segmented control on the shadcn (Base UI) toggle group. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    // Base UI toggle group: the value is an array even in single-select mode
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as T)}
      className={cn('w-fit rounded-lg border border-border/60 bg-muted p-[3px]', className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-7 rounded-md px-2.5 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
