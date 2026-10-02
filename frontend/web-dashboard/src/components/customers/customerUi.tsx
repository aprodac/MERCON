/**
 * Building blocks for the Customers pages (list + details + tabs), so they
 * share one type scale and spacing:
 *   page title     text-2xl font-semibold
 *   section title  text-[15px] font-semibold
 *   body           text-sm (values font-medium)
 *   secondary      text-[13px] text-slate-500
 *   labels         text-xs font-medium text-slate-500 (no uppercase)
 *   KPI value      text-[26px] font-semibold tabular-nums
 * Cards: rounded-xl, 1px border, p-5; gaps between cards 20–24px.
 */
import type { ElementType, ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parsePhoneNumber } from '@/components/ui/PhoneInput';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';

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

/** Card with a title row. `flush` drops the body padding (tables, lists that run edge to edge). */
export function Panel({
  title,
  description,
  icon,
  tone = 'slate',
  action,
  children,
  flush,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ElementType;
  tone?: UiTone;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cn(ui.card, 'min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <IconTile icon={icon} tone={tone} size="sm" />}
          <div className="min-w-0">
            <h2 className={cn(ui.h2, icon && 'leading-8')}>{title}</h2>
            {description && <p className={cn(ui.muted, 'mt-0.5', icon && '-mt-1')}>{description}</p>}
          </div>
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className={flush ? '' : 'px-5 pb-5'}>{children}</div>
    </section>
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
  const box = size === 'lg' ? 'size-16 text-2xl rounded-2xl' : size === 'md' ? 'size-10 text-sm rounded-lg' : 'size-8 text-xs rounded-lg';
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
  if (!phone?.trim()) return null;
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
