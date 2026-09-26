import * as React from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type ChipTone =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'info'
  | 'violet'
  | 'teal'
  | 'orange'
  | 'brand';

export const chipVariants = cva(
  'inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap shadow-xs transition-colors focus:outline-hidden',
  {
    variants: {
      tone: {
        neutral: 'bg-chip-neutral-bg text-chip-neutral-fg border-chip-neutral-border',
        positive: 'bg-chip-positive-bg text-chip-positive-fg border-chip-positive-border',
        negative: 'bg-chip-negative-bg text-chip-negative-fg border-chip-negative-border',
        warning: 'bg-chip-warning-bg text-chip-warning-fg border-chip-warning-border',
        info: 'bg-chip-info-bg text-chip-info-fg border-chip-info-border',
        violet: 'bg-chip-violet-bg text-chip-violet-fg border-chip-violet-border',
        teal: 'bg-chip-teal-bg text-chip-teal-fg border-chip-teal-border',
        orange: 'bg-chip-orange-bg text-chip-orange-fg border-chip-orange-border',
        brand: 'bg-chip-brand-bg text-chip-brand-fg border-chip-brand-border',
      },
      variant: {
        soft: '',
        solid: 'border-transparent text-white',
        outline: 'bg-transparent',
      },
      size: {
        sm: 'h-5 px-2 text-[11px]',
        md: 'h-6 px-2.5 text-xs',
      },
    },
    compoundVariants: [
      { tone: 'neutral', variant: 'solid', className: 'bg-chip-neutral-fg' },
      { tone: 'positive', variant: 'solid', className: 'bg-chip-positive-fg' },
      { tone: 'negative', variant: 'solid', className: 'bg-chip-negative-fg' },
      { tone: 'warning', variant: 'solid', className: 'bg-chip-warning-fg' },
      { tone: 'info', variant: 'solid', className: 'bg-chip-info-fg' },
      { tone: 'violet', variant: 'solid', className: 'bg-chip-violet-fg' },
      { tone: 'teal', variant: 'solid', className: 'bg-chip-teal-fg' },
      { tone: 'orange', variant: 'solid', className: 'bg-chip-orange-fg' },
      { tone: 'brand', variant: 'solid', className: 'bg-chip-brand-fg' },
    ],
    defaultVariants: {
      tone: 'neutral',
      variant: 'soft',
      size: 'md',
    },
  }
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof chipVariants> {
  tone?: ChipTone;
  dot?: boolean;
  icon?: LucideIcon;
  trailing?: React.ReactNode;
  truncate?: number;
  asChild?: boolean;
}

export const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  (
    {
      className,
      tone = 'neutral',
      variant = 'soft',
      size = 'md',
      dot,
      icon: Icon,
      trailing,
      truncate,
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const isInteractive = asChild || Boolean(props.onClick);

    const innerContent = (
      <>
        {dot && (
          <span
            className={cn('h-1.5 w-1.5 rounded-full shrink-0', {
              'bg-chip-neutral-dot': tone === 'neutral',
              'bg-chip-positive-dot': tone === 'positive',
              'bg-chip-negative-dot': tone === 'negative',
              'bg-chip-warning-dot': tone === 'warning',
              'bg-chip-info-dot': tone === 'info',
              'bg-chip-violet-dot': tone === 'violet',
              'bg-chip-teal-dot': tone === 'teal',
              'bg-chip-orange-dot': tone === 'orange',
              'bg-chip-brand-dot': tone === 'brand',
            })}
          />
        )}
        {Icon && <Icon className="w-3 h-3 shrink-0" />}
        <span className={cn('truncate min-w-0', truncate && 'block')}>
          {asChild && React.isValidElement(children) ? (children as React.ReactElement<any>).props.children : children}
        </span>
        {trailing && <span className="shrink-0">{trailing}</span>}
      </>
    );

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      const { ...otherProps } = props;
      return React.cloneElement(child, {
        ref,
        className: cn(
          chipVariants({ tone, variant, size }),
          'hover:brightness-95 focus-visible:ring-2 ring-ring cursor-pointer select-none',
          className,
          child.props.className
        ),
        style: truncate ? { maxWidth: `${truncate}px`, ...child.props.style } : child.props.style,
        ...otherProps,
        children: innerContent,
      });
    }

    const content = (
      <div
        ref={ref}
        className={cn(
          chipVariants({ tone, variant, size }),
          isInteractive && 'hover:brightness-95 focus-visible:ring-2 ring-ring cursor-pointer select-none',
          className
        )}
        style={truncate ? { maxWidth: `${truncate}px` } : undefined}
        {...props}
      >
        {innerContent}
      </div>
    );

    if (truncate && typeof children === 'string') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>{content}</TooltipTrigger>
            <TooltipContent className="text-xs">{children}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return content;
  }
);

Chip.displayName = 'Chip';
