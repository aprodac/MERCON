/**
 * Building blocks for the Customers pages (list + details + tabs), so they
 * share one type scale and spacing:
 *   page title     text-2xl font-semibold (details header: text-lg)
 *   section title  text-sm font-semibold
 *   body           text-sm / text-[13px] (values font-medium)
 *   secondary      text-[13px] text-slate-500
 *   labels         text-xs font-medium text-slate-500 (no uppercase)
 *   KPI value      text-[26px] (list) / text-xl (details stat strip), tabular-nums
 * The details page is the compact variant: `Section` cards with a 44px title
 * row, toolbars of 32px controls, `ui.thc` / `ui.tdc` table cells, 16px gaps.
 */
import type { ElementType, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Phone, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { parsePhoneNumber } from '@/components/ui/PhoneInput';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';

/** Sections of the customer details page (?tab=). */
export type CustomerTabId = 'overview' | 'trips' | 'quotations' | 'locations' | 'financials' | 'tracking' | 'exports';

export type UiTone = 'brand' | 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';

const ICON_TONE: Record<UiTone, string> = {
  brand: 'bg-orange-50 text-[#E5533F] dark:bg-orange-950/40 dark:text-orange-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const BADGE_TONE: Record<UiTone, string> = {
  brand: 'bg-orange-50 text-[#C2412D] ring-orange-600/15 dark:bg-orange-950/40 dark:text-orange-300',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-950/40 dark:text-blue-300',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-950/40 dark:text-indigo-300',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300',
};

const DOT_TONE: Record<UiTone, string> = {
  brand: 'bg-[#FA634E]',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
  slate: 'bg-slate-400',
};

export const ui = {
  page: 'px-4 sm:px-6 lg:px-8 pt-2 pb-10 w-full flex flex-col gap-6',
  card: 'rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  h1: 'text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white',
  h2: 'text-[15px] font-semibold text-slate-900 dark:text-white',
  muted: 'text-[13px] text-slate-500 dark:text-slate-400',
  label: 'text-xs font-medium text-slate-500 dark:text-slate-400',
  th: 'px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap',
  td: 'px-4 py-3.5 align-middle',
  input:
    'h-9 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 shadow-none focus-visible:border-[#FA634E] focus-visible:ring-2 focus-visible:ring-[#FA634E]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white',
  btn: 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
  btnPrimary: 'bg-[#FA634E] text-white hover:bg-[#E8523E] shadow-xs',
  btnOutline:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  btnGhost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
  iconBtn:
    'inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer',
  // ── Compact variant (details page) ──
  /** Size for shadcn <Button size="sm">: 32px, 13px text. */
  btnSm: 'h-8 gap-1.5 rounded-md px-3 text-[13px]',
  /** Square 32px icon button for shadcn <Button size="icon">. */
  iconSm: 'size-8 rounded-md',
  /** Table header / body cells — first column adds pl-4, last pr-4. */
  thc: 'h-9 px-3 text-left text-xs font-medium text-slate-500 whitespace-nowrap dark:text-slate-400',
  tdc: 'px-3 py-2.5 align-middle',
  thead: 'border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40',
  tbody: 'divide-y divide-slate-100 dark:divide-slate-800',
  row: 'group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40',
  link: 'font-medium text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white',
};

export function Badge({ tone = 'slate', dot, pulse, children, className }: { tone?: UiTone; dot?: boolean; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', BADGE_TONE[tone], className)}>
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', DOT_TONE[tone])} />}
          <span className={cn('relative inline-flex size-1.5 rounded-full', DOT_TONE[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, tone = 'slate', size = 'md', className }: { icon: ElementType; tone?: UiTone; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-lg', size === 'sm' ? 'size-8' : 'size-9', ICON_TONE[tone], className)}>
      <Icon className="size-4" />
    </span>
  );
}

/** KPI card. Clickable when `onClick` is set; `active` marks the view it opened. */
export function Stat({
  label,
  value,
  unit,
  sub,
  subTone,
  icon,
  tone = 'slate',
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  subTone?: 'rose' | 'emerald';
  icon: ElementType;
  tone?: UiTone;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        ui.card,
        'flex min-w-0 flex-col gap-3 p-4 text-left sm:gap-4 sm:p-5',
        onClick && 'cursor-pointer transition-all hover:border-slate-300 hover:shadow-sm dark:hover:border-slate-700',
        active && 'border-[#FA634E] ring-1 ring-[#FA634E] hover:border-[#FA634E]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <IconTile icon={icon} tone={tone} size="sm" className="hidden sm:inline-flex" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[22px] font-semibold leading-none text-slate-900 tabular-nums sm:text-[26px] dark:text-white">
          {unit && <span className="mr-1 text-sm font-medium text-slate-500">{unit}</span>}
          {value}
        </p>
        {sub && (
          <p
            className={cn(
              'mt-2 truncate text-xs',
              subTone === 'rose' ? 'font-medium text-rose-600 dark:text-rose-400' : subTone === 'emerald' ? 'font-medium text-emerald-600' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {sub}
          </p>
        )}
      </div>
    </Comp>
  );
}

/**
 * One cell of a stat strip (a row of figures sharing one card, split by 1px
 * lines). Clickable when `onClick` is set; `active` marks the tab it opened.
 */
export function StatCell({
  label,
  icon: Icon,
  value,
  unit,
  sub,
  subTone,
  active,
  onClick,
}: {
  label: string;
  icon: ElementType;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  subTone?: 'rose' | 'emerald';
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'relative flex h-full w-full min-w-0 flex-col gap-1 px-4 py-3 text-left',
        onClick && 'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
        active && 'bg-slate-50/80 dark:bg-slate-800/40',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className="size-3.5" /> <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="whitespace-nowrap text-xl font-semibold leading-7 text-slate-900 tabular-nums dark:text-white">
          {unit && <span className="mr-1 text-xs font-medium text-slate-400">{unit}</span>}
          {value}
        </span>
        {sub && (
          <span
            className={cn(
              'truncate text-xs',
              subTone === 'rose' ? 'font-medium text-rose-600 dark:text-rose-400' : subTone === 'emerald' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {sub}
          </span>
        )}
      </span>
    </Comp>
  );
}

/**
 * Compact card with a 44px title row: title, an optional count / meta after it,
 * actions on the right. The body runs edge to edge (tables, lists) unless `padded`.
 */
export function Section({
  title,
  meta,
  action,
  children,
  padded,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={cn(ui.card, 'min-w-0 overflow-hidden', className)}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <span className="truncate">{title}</span>
          {meta}
        </h2>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      <div className={padded ? 'p-4' : undefined}>{children}</div>
    </section>
  );
}

/** Small grey count after a section title or inside a tab. */
export function Count({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-medium text-slate-500 tabular-nums dark:bg-slate-800 dark:text-slate-400', className)}>
      {children}
    </span>
  );
}

/** Toolbar row on top of a table: filters left, search / actions right. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800', className)}>
      {children}
    </div>
  );
}

/** Segmented filter (shadcn tabs look): one pill per option, with an optional count. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex h-8 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800', className)}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors cursor-pointer',
              active ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cn('text-xs tabular-nums', active ? 'text-slate-500' : 'text-slate-400')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 32px search box with a clear button. */
export function SearchField({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border-slate-200 bg-white pl-8 pr-7 text-[13px] shadow-none placeholder:opacity-100 focus-visible:border-[#FA634E] focus-visible:ring-2 focus-visible:ring-[#FA634E]/15 dark:border-slate-700 dark:bg-slate-900"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** One-line empty / error state inside a card. */
export function EmptyRow({ icon: Icon, children, action }: { icon?: ElementType; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
      {Icon && <Icon className="size-4 text-slate-400" />}
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Rows of skeleton bars while a table loads. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></div>
      ))}
    </div>
  );
}

/** Table footer with "1–20 of 64" and prev / next. */
export function Pager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  if (total <= size) return null;
  const btn = 'inline-flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer';
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
      <span className="tabular-nums">{(page - 1) * size + 1}–{Math.min(total, page * size)} of {total}</span>
      <div className="flex items-center gap-1">
        <span className="mr-1 tabular-nums">Page {page} of {pages}</span>
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={btn} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className={btn} aria-label="Next page"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, text, action }: { icon: ElementType; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center dark:border-slate-700">
      <Icon className="mb-2 size-6 text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {text && <p className={cn(ui.muted, 'max-w-sm')}>{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const TRIP_STATUS: Record<string, { tone: UiTone; label: string; pulse?: boolean }> = {
  intransit: { tone: 'blue', label: 'In transit', pulse: true },
  loading: { tone: 'amber', label: 'Loading', pulse: true },
  delayed: { tone: 'rose', label: 'Delayed' },
  completed: { tone: 'emerald', label: 'Completed' },
  invoiced: { tone: 'indigo', label: 'Invoiced' },
  scheduled: { tone: 'slate', label: 'Scheduled' },
  draft: { tone: 'slate', label: 'Draft' },
  cancelled: { tone: 'slate', label: 'Cancelled' },
};

export function TripStatusBadge({ status }: { status?: string | null }) {
  const s = TRIP_STATUS[(status || '').toLowerCase()] ?? { tone: 'slate' as UiTone, label: status || '—' };
  return <Badge tone={s.tone} dot pulse={s.pulse}>{s.label}</Badge>;
}

export function CustomerAvatar({ name, logo, size = 'md' }: { name: string; logo?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-12 text-lg rounded-xl' : size === 'md' ? 'size-10 text-sm rounded-lg' : 'size-8 text-xs rounded-lg';
  return logo ? (
    <img src={logo} alt="" className={cn(box, 'shrink-0 border border-slate-200 bg-white object-contain p-1 dark:border-slate-700')} />
  ) : (
    <span className={cn(box, 'flex shrink-0 items-center justify-center bg-orange-50 font-semibold text-[#E5533F] ring-1 ring-inset ring-orange-200/70 dark:bg-orange-950/40 dark:ring-orange-900/50')}>
      {name?.[0]?.toUpperCase() || 'C'}
    </span>
  );
}

/** Phone number in body type with call / WhatsApp shortcuts. */
export function PhoneLine({ phone, className }: { phone?: string | null; className?: string }) {
  // No number, or a placeholder like "N/A": nothing to show or call.
  if (!phone?.trim() || phone.replace(/\D/g, '').length < 6) return null;
  const { country, nationalNumber } = parsePhoneNumber(phone);
  const shown = `${country.dialCode} ${nationalNumber}`.trim();
  const digits = phone.replace(/[^0-9+]/g, '');
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] text-slate-600 tabular-nums dark:text-slate-300', className)}>
      <span className="mr-0.5">{shown}</span>
      <a href={`tel:${digits}`} onClick={stop} title={`Call ${shown}`} aria-label={`Call ${shown}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
        <Phone className="size-3.5" />
      </a>
      <a href={`https://wa.me/${digits.replace(/^\+/, '')}`} onClick={stop} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${shown}`} aria-label={`WhatsApp ${shown}`} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
        <WhatsAppIcon className="size-3.5" />
      </a>
    </span>
  );
}
