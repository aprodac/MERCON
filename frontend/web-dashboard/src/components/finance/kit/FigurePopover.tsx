import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ChipTone } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import { TONE_CLASSES } from './tones';

/** A headline figure; clicking it opens its breakdown. */
export interface SummaryFigure {
  id: string;
  label: string;
  value: string;
  tone?: ChipTone;
  /** Rows shown in the popover. */
  breakdown?: { label: string; value: string; tone?: ChipTone }[];
  /** How the figure is worked out, under the breakdown. */
  explain?: string;
  footer?: ReactNode;
}

export function FigurePopover({ figure }: { figure: SummaryFigure }) {
  const valueClass = cn('fin-num text-base font-semibold leading-tight', figure.tone ? TONE_CLASSES[figure.tone].fg : 'text-foreground');
  const body = (
    <>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {figure.label}
        {figure.breakdown && <ChevronDown className="size-3" />}
      </span>
      <span className={valueClass}>{figure.value}</span>
    </>
  );
  if (!figure.breakdown) return <div className="flex flex-col">{body}</div>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex flex-col rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 text-xs">
        <p className="mb-2 font-semibold text-foreground">{figure.label}</p>
        <dl className="space-y-1.5">
          {figure.breakdown.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className={cn('fin-num font-medium', row.tone ? TONE_CLASSES[row.tone].fg : 'text-foreground')}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {figure.explain && <p className="mt-2.5 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">{figure.explain}</p>}
        {figure.footer && <div className="mt-2.5 border-t pt-2">{figure.footer}</div>}
      </PopoverContent>
    </Popover>
  );
}
