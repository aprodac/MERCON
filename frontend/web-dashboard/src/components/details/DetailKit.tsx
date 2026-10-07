/**
 * Shared building blocks for the entity detail pages (Driver, Truck, Customer).
 *
 * The three pages are one product family: same header, same KPI cards, same
 * panels, same trip card, same type scale. Anything that should look the same
 * on all three lives here, so the pages cannot drift apart again.
 *
 * Type scale used across the detail pages:
 *   page title   text-2xl/3xl font-black
 *   panel title  text-base font-black
 *   KPI value    text-lg font-black
 *   body value   text-sm font-bold
 *   label        text-[10px] font-extrabold uppercase tracking-widest
 *   micro label  text-[9px]  font-extrabold uppercase tracking-widest
 */
import { splitLegs } from '@mercon/shared-types';
import type { ElementType, ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Banknote, Calendar, ChevronLeft, ChevronRight, Edit2, FileText, MapPin, MoreVertical, Package, Search, Truck, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import VisualRouteProgress from '@/components/trips/VisualRouteProgress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatInDeploymentTz } from '@/lib/datetime';
import { cn } from '@/lib/utils';

// ── Class tokens ────────────────────────────────────────────────────────────

export const dk = {
  page: 'px-5 sm:px-6 lg:px-7 pt-5 pb-5 w-full flex flex-col gap-4 bg-[#EEF1F6] dark:bg-slate-950',
  card: 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs',
  panel: 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-4 sm:p-5 flex flex-col min-h-[460px] overflow-hidden',
  title: 'text-xl sm:text-2xl xl:text-[28px] font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight truncate',
  label: 'text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none',
  micro: 'text-[9.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none',
  kpiValue: 'text-lg font-extrabold text-slate-900 dark:text-white leading-tight truncate tabular-nums whitespace-nowrap',
  value: 'text-sm font-bold text-slate-900 dark:text-white truncate',
  sub: 'text-xs font-medium text-slate-500 dark:text-slate-400 truncate',
  // Round avatar/logo holder on the left of the header
  avatar: 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs shrink-0 w-28 h-28 sm:w-32 sm:h-32 overflow-hidden flex items-center justify-center self-end',
  iconButton: 'w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0',
  // Small tiles inside a panel (trip preview facts, account details)
  tile: 'p-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex flex-col justify-between min-w-0 min-h-[72px]',
  backButton: 'flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer',
};

// ── Formatting helpers ──────────────────────────────────────────────────────

export const EMPTY = '—';

/** One date format for every detail page: "13 Sep 2026" / "13 Sep 2026, 08:00". */
export function fmtDate(value: string | Date | null | undefined, tz: string, withTime = false): string {
  if (!value) return EMPTY;
  try {
    return formatInDeploymentTz(value, tz, withTime ? 'dd MMM yyyy, HH:mm' : 'dd MMM yyyy');
  } catch {
    return EMPTY;
  }
}

export function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "SAR 1,065" — or "—" when there is no amount, so a missing value never reads as zero. */
export function fmtSar(value: unknown, { allowZero = false }: { allowZero?: boolean } = {}): string {
  const n = toNum(value);
  if (!n && !allowZero) return EMPTY;
  return `SAR ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Capacity in tons, the unit the header uses: 5000 → "5 Ton". */
export function fmtTons(kg: unknown): string {
  const n = toNum(kg);
  if (!n) return EMPTY;
  return `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} Ton`;
}

/** Saudi number in international form, digits only: "0546126262" / "+966 546126262" → "966546126262". */
export function saPhoneDigits(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('966')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return `966${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('5')) return `966${d}`;
  return (raw || '').trim().startsWith('+') ? d : `966${d}`;
}

/** Readable phone: "+966 54 612 6262" for Saudi mobiles, spaced country code otherwise. */
export function fmtPhone(raw?: string | null): string {
  const d = saPhoneDigits(raw);
  if (!d) return EMPTY;
  if (d.startsWith('966')) {
    const n = d.slice(3);
    if (n.length === 9 && n.startsWith('5')) return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
    if (n.length === 8) return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
    return `+966 ${n}`;
  }
  if (d.startsWith('91') && d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

export function personName(p?: { first_name?: string | null; last_name?: string | null; name?: string | null } | null): string {
  if (!p) return '';
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.name || '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/🔁\s*/g, '').trim();
  return s && !UUID_RE.test(s) ? s : null;
};

function stopLabel(stop: any): string | null {
  if (!stop) return null;
  return (
    clean(stop.location?.name) ||
    clean(stop.location_name) ||
    clean(stop.source_label) ||
    clean(stop.location?.city) ||
    clean(stop.city)
  );
}

/** Origin/destination of a trip or quotation from its stops; never invents a city. */
export function routeOf(entity: any): { origin: string; destination: string } {
  const stops = Array.isArray(entity?.stops)
    ? [...entity.stops].sort((a, b) => (a.stop_sequence ?? a.sequence ?? 0) - (b.stop_sequence ?? b.sequence ?? 0))
    : [];
  // A round trip's destination is its turn-around point (the way out's last drop), not home.
  const legs = splitLegs(stops, entity?.rate_category || entity?.line_type);
  const way = legs.round ? legs.outbound : stops;
  const pickup = way.find((s) => s.stop_type === 'Pickup') || way[0];
  const dropoff = [...way].reverse().find((s) => s.stop_type === 'Dropoff') || way[way.length - 1];
  const origin =
    stopLabel(pickup) ||
    clean(entity?.route_origin) ||
    clean(entity?.origin_name) ||
    clean(entity?.originLocation?.name) ||
    clean(entity?.origin_city);
  const destination =
    (stops.length > 1 ? stopLabel(dropoff) : null) ||
    clean(entity?.route_destination) ||
    clean(entity?.destination_name) ||
    clean(entity?.destinationLocation?.name) ||
    clean(entity?.destination_city);
  return { origin: origin || EMPTY, destination: destination || EMPTY };
}

/** Humanise a raw enum-style type name: "VehicleRegistration" → "Vehicle Registration". */
export function humanize(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One row per document type. Uploading the same type again (a renewal, or
 * pages sent separately) should not stack four "Vehicle Registration" rows;
 * keep the copy that expires last (then the newest) and count the rest.
 */
export function latestPerDocType<T extends { expiry_date?: string | null; createdAt?: string }>(
  docs: T[],
  typeOf: (d: T) => string,
): Array<{ doc: T; name: string; count: number }> {
  const byType = new Map<string, { doc: T; name: string; count: number }>();
  const rank = (d: T) => `${d.expiry_date || ''}|${d.createdAt || ''}`;
  for (const doc of docs) {
    const name = humanize(typeOf(doc) || 'Document');
    const key = name.toLowerCase();
    const seen = byType.get(key);
    if (!seen) byType.set(key, { doc, name, count: 1 });
    else byType.set(key, { doc: rank(doc) > rank(seen.doc) ? doc : seen.doc, name, count: seen.count + 1 });
  }
  return [...byType.values()];
}

/** Shared "Documents & Validity" panel header. */
export function DocsPanelHeader({ right }: { right?: ReactNode }) {
  return <PanelHeader icon={FileText} iconClass="text-blue-600 dark:text-blue-400" title="Documents & Validity" right={right} />;
}

// ── Status pills ────────────────────────────────────────────────────────────

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'slate';

const TONE: Record<Tone, { pill: string; dot: string }> = {
  green: { pill: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40', dot: 'bg-emerald-500' },
  amber: { pill: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/40', dot: 'bg-amber-500' },
  blue: { pill: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-200/80 dark:border-blue-800/40', dot: 'bg-blue-500' },
  red: { pill: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/40', dot: 'bg-rose-500' },
  slate: { pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' },
};

export function StatusPill({ tone, children, size = 'sm', pulse }: { tone: Tone; children: ReactNode; size?: 'sm' | 'lg'; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold shrink-0 whitespace-nowrap',
        size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10.5px]',
        TONE[tone].pill,
      )}
    >
      <span className={cn('rounded-full shrink-0', size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5', TONE[tone].dot, pulse && 'animate-pulse')} />
      {children}
    </span>
  );
}

/** Driver and vehicle duty status → header pill. */
export function entityStatusTone(status?: string | null): Tone {
  const s = (status || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'available' || s === 'active') return 'green';
  if (s === 'ontrip' || s === 'intransit' || s === 'busy') return 'blue';
  if (s === 'loading' || s === 'onleave' || s === 'leave') return 'amber';
  if (s === 'maintenance' || s === 'suspended' || s === 'outofservice') return 'red';
  return 'slate';
}

export function entityStatusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return humanize(status);
}

/** Trip status → pill, identical on every detail page. */
export function TripStatusPill({ status, size }: { status?: string | null; size?: 'sm' | 'lg' }) {
  const s = (status || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'intransit' || s === 'ontrip' || s === 'dispatched') return <StatusPill tone="blue" size={size} pulse>In Transit</StatusPill>;
  if (s === 'loading' || s === 'atpickup' || s === 'atdelivery') return <StatusPill tone="amber" size={size} pulse>{s === 'loading' ? 'Loading' : humanize(status || '')}</StatusPill>;
  if (s === 'delayed') return <StatusPill tone="red" size={size}>Delayed</StatusPill>;
  if (s === 'completed' || s === 'delivered') return <StatusPill tone="green" size={size}>Completed</StatusPill>;
  if (s === 'invoiced') return <StatusPill tone="green" size={size}>Invoiced</StatusPill>;
  return <StatusPill tone="slate" size={size}>{status ? humanize(status) : EMPTY}</StatusPill>;
}

// ── Header ──────────────────────────────────────────────────────────────────

export function DetailTitleRow({
  title,
  status,
  menu,
  onEdit,
}: {
  title: ReactNode;
  status?: ReactNode;
  /** DropdownMenuItem elements for the ⋮ menu; omit to hide the menu. */
  menu?: ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className={dk.title} title={typeof title === 'string' ? title : undefined}>{title}</h1>
        {status}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={dk.iconButton} aria-label="More actions">
                <MoreVertical className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl z-50">
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {onEdit && (
          <Button
            onClick={onEdit}
            className="h-9 px-4 bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>
    </div>
  );
}

/** Header KPI card: icon left, label / value / sub right. */
export function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  mono,
  onClick,
  title,
  trailing,
  leading,
}: {
  icon?: ElementType;
  iconClass?: string;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  onClick?: () => void;
  title?: string;
  trailing?: ReactNode;
  /** Replaces the icon (e.g. a driver avatar). */
  leading?: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      title={title}
      className={cn(dk.card, 'px-4 py-3.5 flex items-center justify-between gap-2.5 min-h-[88px] min-w-0', onClick && 'cursor-pointer group hover:border-slate-300 dark:hover:border-slate-700 transition-colors')}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leading ?? (Icon && <Icon className={cn('w-[22px] h-[22px] stroke-[1.75] shrink-0', iconClass)} />)}
        <div className="min-w-0 flex-1">
          <p className={cn(dk.label, 'mb-1.5 truncate')}>{label}</p>
          <p className={cn(dk.kpiValue, mono && 'font-mono tracking-tight')} title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}>{value}</p>
          {sub && <p className={cn(dk.sub, 'mt-1')} title={typeof sub === 'string' ? sub : undefined}>{sub}</p>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

/** Coloured metric card used in the middle panel (on-time, payout, revenue…). */
const METRIC_TONE: Record<'green' | 'coral' | 'indigo' | 'blue', { text: string; border: string }> = {
  green: { text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/60' },
  coral: { text: 'text-[#FA634E]', border: 'border-rose-200 dark:border-rose-800/60' },
  indigo: { text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800/60' },
  blue: { text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800/60' },
};

export function MetricCard({
  tone,
  label,
  icon: Icon,
  value,
  pill,
}: {
  tone: keyof typeof METRIC_TONE;
  label: string;
  icon: ElementType;
  value: ReactNode;
  pill?: ReactNode;
}) {
  const t = METRIC_TONE[tone];
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between shadow-2xs min-h-[92px] min-w-0">
      <div className="flex items-center justify-between gap-1.5">
        <span className={cn('text-[10px] font-extrabold uppercase tracking-widest', t.text)}>{label}</span>
        <Icon className={cn('w-5 h-5 stroke-[2] shrink-0', t.text)} />
      </div>
      <div className="mt-1 min-w-0">
        <p className={cn('text-xl font-black font-mono tracking-tight leading-none truncate', t.text)}>{value}</p>
        {pill && (
          <span className={cn('mt-1.5 text-[10px] font-bold border px-2 py-0.5 rounded-full inline-block max-w-full truncate', t.text, t.border)}>
            {pill}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────

export function PanelHeader({
  icon: Icon,
  iconClass = 'text-[#FA634E]',
  title,
  count,
  right,
}: {
  icon: ElementType;
  iconClass?: string;
  title: ReactNode;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-100 dark:border-slate-800 shrink-0 min-h-[40px]">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn('w-5 h-5 stroke-[2] shrink-0', iconClass)} />
        <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">{title}</h3>
        {count !== undefined && (
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-[10.5px] font-bold font-mono shrink-0">
            {count}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

export function PanelSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-2 shrink-0">
      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#FA634E] focus:ring-1 focus:ring-[#FA634E] transition-all shadow-2xs"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-200/60 dark:bg-slate-700/60 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: ElementType; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="h-full min-h-[220px] p-4 text-center border border-dashed border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 flex flex-col items-center justify-center">
      <Icon className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-1.5 stroke-[1.5]" />
      <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{title}</p>
      <p className="text-[10.5px] text-slate-400 mt-0.5">{text}</p>
      {action}
    </div>
  );
}

export function ListPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn =
    'p-1 px-2 rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-white text-slate-700 dark:text-slate-300 hover:text-[#FA634E] cursor-pointer flex items-center gap-1 text-[11px] font-extrabold transition-colors shadow-2xs';
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0 mt-2 shadow-2xs">
      <button disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))} className={btn}>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span>Prev</span>
      </button>
      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 font-mono">
        Page {page} of {totalPages}
      </span>
      <button disabled={page >= totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} className={btn}>
        <span>Next</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ViewAllButton({ onClick, label = 'View All Trips' }: { onClick: () => void; label?: string }) {
  return (
    <Button
      onClick={onClick}
      variant="ghost"
      className="w-full mt-3 h-10 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
    >
      <span>{label}</span>
      <ArrowRight className="w-4 h-4" />
    </Button>
  );
}

// ── Trip preview (middle panel when a trip is picked) ───────────────────────

export interface TripFacts {
  id: string;
  ref_id: string;
  status?: string | null;
  date: string;
  origin: string;
  destination: string;
  customerName: string;
  customerLogo?: string | null;
  vehiclePlate: string;
  cargoType: string;
  rateCard: string;
  distance: string;
  driverPayout: string;
}

/** Normalise any trip record into the facts every detail page shows. */
export function tripFacts(t: any, tz: string, fallback?: { vehiclePlate?: string; customerName?: string; customerLogo?: string | null }): TripFacts {
  const route = routeOf(t);
  const km = toNum(t.planned_distance ?? t.distance_km);
  return {
    id: t.id,
    ref_id: t.ref_id || String(t.id || '').slice(0, 8).toUpperCase(),
    status: t.status,
    date: fmtDate(t.actual_start || t.planned_start || t.createdAt, tz, true),
    origin: route.origin,
    destination: route.destination,
    customerName: t.customer?.name || fallback?.customerName || EMPTY,
    customerLogo: t.customer?.logo_url || fallback?.customerLogo || null,
    vehiclePlate: t.vehicle?.plate_number || t.third_party_vehicle_plate || fallback?.vehiclePlate || EMPTY,
    cargoType: t.cargo_type ? humanize(t.cargo_type) : t.rate_category ? humanize(t.rate_category) : EMPTY,
    rateCard: t.rate_card_name || (t.operation_type ? humanize(t.operation_type) : EMPTY),
    distance: km > 0 ? `${Math.round(km).toLocaleString('en-US')} km` : EMPTY,
    driverPayout: fmtSar(t.driver_payout ?? t.driver_charge),
  };
}

function FactTile({ icon: Icon, iconClass, label, children }: { icon: ElementType; iconClass: string; label: string; children: ReactNode }) {
  return (
    <div className={dk.tile}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5 stroke-[2.2] shrink-0', iconClass)} />
        <span className={dk.label}>{label}</span>
      </div>
      <div className="my-auto pt-1 min-w-0">{children}</div>
    </div>
  );
}

export function TripPreview({
  facts,
  stops,
  tz,
  onBack,
  onOpen,
  backLabel = 'Back',
  headerRight,
}: {
  facts: TripFacts;
  stops: any[];
  tz: string;
  /** Omit for the live-trip view, which has no "back". */
  onBack?: () => void;
  onOpen: () => void;
  backLabel?: string;
  headerRight?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 min-h-[40px]">
        {onBack ? (
          <button onClick={onBack} className={dk.backButton}>
            <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
            <span>{backLabel}</span>
          </button>
        ) : (
          <span className="text-base font-black text-slate-900 dark:text-white">Current Trip</span>
        )}
        {headerRight ?? <TripStatusPill status={facts.status} size="lg" />}
      </div>

      <div className="flex items-baseline justify-between gap-3 shrink-0">
        <span className="text-xl font-black font-mono text-[#FA634E] tracking-tight">{facts.ref_id}</span>
        <span className="text-xs font-medium text-slate-400">
          {facts.date}
        </span>
      </div>

      <div className="shrink-0 overflow-hidden">
        {stops.length > 0 ? (
          <VisualRouteProgress stops={stops} tz={tz} tripStatus={facts.status || 'Scheduled'} hideBadges hidePulseAnimation />
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
            <MapPin className="w-4 h-4 text-[#FA634E] shrink-0" />
            <span className="truncate">{facts.origin}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="truncate">{facts.destination}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 content-start">
        <FactTile icon={User} iconClass="text-rose-500" label="Customer">
          <div className="flex items-center gap-1.5 min-w-0">
            {facts.customerLogo ? (
              <img src={facts.customerLogo} alt={facts.customerName} className="w-5 h-5 rounded-md object-contain border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0" />
            ) : null}
            <span className={dk.value} title={facts.customerName}>{facts.customerName}</span>
          </div>
        </FactTile>
        <FactTile icon={Truck} iconClass="text-blue-500" label="Vehicle">
          <span className={cn(dk.value, 'font-mono block')}>{facts.vehiclePlate}</span>
        </FactTile>
        <FactTile icon={Package} iconClass="text-[#FA634E]" label="Cargo Type">
          <span className={cn(dk.value, 'block')}>{facts.cargoType}</span>
        </FactTile>
        <FactTile icon={FileText} iconClass="text-indigo-500" label="Rate Card">
          <span className={cn(dk.value, 'block')}>{facts.rateCard}</span>
        </FactTile>
        <FactTile icon={MapPin} iconClass="text-amber-500" label="Distance">
          <span className={cn(dk.value, 'block')}>{facts.distance}</span>
        </FactTile>
        <FactTile icon={Banknote} iconClass="text-emerald-500" label="Driver Payout">
          <span className={cn(dk.value, 'font-mono text-[#FA634E] dark:text-[#FA634E] block')}>{facts.driverPayout}</span>
        </FactTile>
      </div>

      <Button
        onClick={onOpen}
        variant="ghost"
        className="w-full h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
      >
        <FileText className="w-4 h-4" />
        <span>View Full Trip Details</span>
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ── Trip card (left column on all three pages) ──────────────────────────────

export function TripCard({
  refId,
  status,
  amountLabel,
  amount,
  origin,
  destination,
  date,
  footLabel,
  footValue,
  footIcon: FootIcon,
  footLeading,
  selected,
  onClick,
}: {
  refId: string;
  status?: string | null;
  amountLabel: string;
  amount: string;
  origin: string;
  destination: string;
  date: string;
  footLabel: string;
  footValue: string;
  footIcon?: ElementType;
  footLeading?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border transition-all cursor-pointer flex flex-col p-3 sm:p-3.5 gap-2 shadow-2xs',
        selected
          ? 'border-[#FA634E] ring-1 ring-[#FA634E]/30 bg-white dark:bg-slate-900'
          : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/60',
      )}
    >
      {/* Ref + status | amount */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white font-mono leading-none tracking-tight">{refId}</p>
          <TripStatusPill status={status} />
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className={cn(dk.micro, 'text-[#FA634E] mb-1')}>{amountLabel}</span>
          <span className="text-[11px] font-black font-mono text-[#FA634E] bg-orange-50 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-800/50 px-2 py-0.5 rounded-md leading-none">
            {amount}
          </span>
        </div>
      </div>

      {/* Route */}
      <div className="flex items-center gap-2 py-0.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1" title={origin}>
          <MapPin className="w-4 h-4 text-[#FA634E] fill-[#FA634E]/20 shrink-0" />
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate capitalize">{origin}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0 flex-1" title={destination}>
          <MapPin className="w-4 h-4 text-blue-600 fill-blue-600/20 shrink-0" />
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate capitalize">{destination}</p>
        </div>
      </div>

      <div className="w-full h-px bg-slate-100 dark:bg-slate-800/80" />

      {/* Departure | foot field */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className={cn(dk.micro, 'mb-1')}>Departure</p>
            <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{date}</p>
          </div>
        </div>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {footLeading ?? (FootIcon && <FootIcon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />)}
          <div className="min-w-0">
            <p className={cn(dk.micro, 'mb-1')}>{footLabel}</p>
            <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate" title={footValue}>{footValue}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
