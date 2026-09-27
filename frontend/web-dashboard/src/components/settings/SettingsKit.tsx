import type { ReactNode } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { cn } from '@/lib/utils';

/**
 * Building blocks every settings-area page is made of, so the area reads as one
 * product instead of a dozen templates. The app header always says "Settings"
 * (the inner nav shows where you are); the page itself carries one title, one
 * sentence of explanation and its primary actions.
 */

export function SettingsPage({
  title,
  description,
  actions,
  wide,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Tables and dashboards use the full width; forms stay readable at ~1000px. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <DashboardLayout active="Settings" title="Settings">
      <div className={cn('w-full px-4 sm:px-6 pt-5 pb-10 animate-fade-in', !wide && 'max-w-[1040px]')}>
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <div className="space-y-5">{children}</div>
      </div>
    </DashboardLayout>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  flush,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** No body padding — for lists and tables that run edge to edge. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl border border-black/[0.06] dark:border-white/10 bg-card shadow-sm', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn(!flush && 'px-5 pb-5', (title || action) && !flush && 'pt-1', !title && !action && !flush && 'pt-5')}>{children}</div>
    </section>
  );
}

/** Label and explanation on the left, the control on the right; stacks on phones. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 py-4 border-t border-black/[0.05] dark:border-white/10 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0 sm:max-w-md">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="sm:shrink-0 sm:min-w-[240px] sm:flex sm:justify-end">{children}</div>}
    </div>
  );
}

/** A handful of numbers in one quiet strip, instead of one oversized card each. */
export function StatStrip({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/10 bg-card shadow-sm divide-y sm:divide-y-0 divide-black/[0.05] dark:divide-white/10 [&>*:nth-child(odd)]:border-r sm:[&>*]:border-r sm:[&>*:last-child]:border-r-0 [&>*]:border-black/[0.05] dark:[&>*]:border-white/10">
      {items.map((item) => (
        <div key={item.label} className="px-5 py-4 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#9898A4]">{item.label}</p>
          <p className="mt-1 text-lg font-bold text-foreground truncate">{item.value}</p>
          {item.hint && <p className="mt-0.5 text-xs text-muted-foreground truncate">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function StatusDot({ tone }: { tone: 'green' | 'amber' | 'red' | 'gray' }) {
  const color = { green: 'bg-[#16A34A]', amber: 'bg-[#D97706]', red: 'bg-[#DC2626]', gray: 'bg-[#9898A4]' }[tone];
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', color)} aria-hidden />;
}
