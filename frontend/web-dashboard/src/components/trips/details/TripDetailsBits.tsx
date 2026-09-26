import { Check, CircleAlert, Plus, FileText, ListOrdered, Phone, Smartphone, Truck, UploadCloud, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import type { DriverStatus } from '@/services/driverService';
import { resolveFileUrl } from '@/lib/documents';
import { formatDuration, formatKm, timeAgo } from '@/lib/fleetLive';
import type { LiveGpsFix, TripOverview } from '@/services/fleetLiveService';
import type { Trip } from '@/services/tripService';
import { minutesLate } from './stopEvidence';

const ON_TIME_GRACE_MIN = 5;

// ── Planned: pre-trip checks ─────────────────────────────────────────────────

export function PreTripChecks({ checks, formatDate }: { checks: NonNullable<TripOverview['checks']>; formatDate: (iso: string) => string }) {
  const rows: { ok: boolean; text: string; detail?: string }[] = checks.third_party
    ? [{ ok: true, text: 'Third-party trip — their truck and driver' }]
    : [
        { ok: checks.driver_assigned, text: checks.driver_assigned ? 'Driver assigned' : 'No driver assigned' },
        { ok: checks.truck_assigned, text: checks.truck_assigned ? 'Truck assigned' : 'No truck assigned' },
      ];
  for (const e of checks.expiring) {
    rows.push({
      ok: false,
      text: `${e.entity === 'Truck' ? e.name : e.name}: ${e.label} ${e.expired ? 'has expired' : 'expires before the trip'}`,
      detail: formatDate(e.expiry_date),
    });
  }
  if (!checks.third_party && checks.expiring.length === 0 && (checks.driver_assigned || checks.truck_assigned)) {
    rows.push({ ok: true, text: 'Documents valid for the trip date' });
  }
  const problems = rows.filter((r) => !r.ok).length;
  return (
    <div className="border-b border-black/[0.06] px-4 py-3 dark:border-white/10">
      <p className={cn('mb-2 text-xs font-semibold', problems ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400')}>
        {problems ? `Before it starts · ${problems} to fix` : 'Ready to start'}
      </p>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className={cn('mt-px flex size-4 shrink-0 items-center justify-center rounded-full', r.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300')}>
              {r.ok ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
            </span>
            <span className="text-foreground">
              {r.text}
              {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Done: trip summary ───────────────────────────────────────────────────────

export function TripSummary({ trip, overview, formatDateTime }: { trip: Trip; overview: TripOverview | undefined; formatDateTime: (iso: string) => string }) {
  const stops = trip.stops ?? [];
  const judged = stops.map((s) => minutesLate(s.planned_arrival, s.actual_arrival)).filter((m): m is number => m != null);
  const onTime = judged.filter((m) => m <= ON_TIME_GRACE_MIN).length;
  const start = trip.actual_start;
  const end = trip.actual_end;
  const durationSec = start && end ? (new Date(end).getTime() - new Date(start).getTime()) / 1000 : null;
  const cells: { label: string; value: string; tone?: 'good' | 'bad' }[] = [
    { label: 'Started', value: start ? formatDateTime(start) : '—' },
    { label: 'Finished', value: end ? formatDateTime(end) : '—' },
    { label: 'Time taken', value: durationSec && durationSec > 0 ? formatDuration(durationSec) : '—' },
    ...(judged.length ? [{ label: 'On time', value: `${onTime} of ${judged.length} stops`, tone: onTime === judged.length ? ('good' as const) : ('bad' as const) }] : []),
    ...(overview?.path_distance_m ? [{ label: 'Distance driven', value: formatKm(overview.path_distance_m / 1000) }] : []),
    invoiceCell(trip),
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-black/[0.06] px-4 py-3 dark:border-white/10">
      {cells.map((c) => (
        <div key={c.label}>
          <p className="text-[11px] text-muted-foreground">{c.label}</p>
          <p className={cn('text-sm font-medium', c.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : c.tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : 'text-foreground')}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function invoiceCell(trip: Trip): { label: string; value: string; tone?: 'good' | 'bad' } {
  const inv = trip.invoices?.[0];
  if (inv) return { label: 'Invoice', value: `${inv.ref_id} · ${inv.status}`, tone: 'good' };
  return trip.status === 'Invoiced' ? { label: 'Invoice', value: 'Invoiced', tone: 'good' } : { label: 'Invoice', value: 'Not invoiced yet' };
}

// ── Banners ─────────────────────────────────────────────────────────────────

export function Banner({ tone, children }: { tone: 'danger' | 'muted'; children: React.ReactNode }) {
  return (
    <div className={cn(
      'flex items-start gap-2 border-b px-4 py-2.5 text-xs',
      tone === 'danger' ? 'border-rose-200/60 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' : 'border-black/[0.06] bg-muted/60 text-muted-foreground dark:border-white/10',
    )}>
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ── Cards below the map ─────────────────────────────────────────────────────

// ── Pieces around the map ───────────────────────────────────────────────────

function Feed({ icon: Icon, label, fix, missing }: { icon: typeof Truck; label: string; fix: LiveGpsFix | null | undefined; missing: string }) {
  const state = !fix ? 'none' : fix.fresh ? 'live' : 'stale';
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Icon className="size-3" /> {label}
      <span className={cn('size-1.5 rounded-full', state === 'live' ? 'bg-emerald-500' : state === 'stale' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600')} />
      <span className={state === 'none' ? '' : 'text-foreground'}>{state === 'live' ? 'Live' : state === 'stale' ? timeAgo(fix!.recorded_at) : missing}</span>
    </span>
  );
}

/** Truck and driver, as a card on the map (top-left): photos, class, contact, and links to their profiles. */
export function TruckDriverOverlay({
  trip, overview, truckLabel, onReassign,
}: { trip: Trip; overview: TripOverview | undefined; truckLabel: string; onReassign: (mode: 'driver' | 'truck') => void }) {
  const navigate = useNavigate();
  const d = trip.driver as (NonNullable<Trip['driver']> & { status?: DriverStatus; ref_id?: string }) | null | undefined;
  const v = trip.vehicle as (NonNullable<Trip['vehicle']> & { image_url?: string | null; trailer_number?: string | null }) | null | undefined;
  const coDriver = (trip as any).coDriver as { id?: string; first_name?: string; last_name?: string; avatar_url?: string | null; phone_primary?: string | null } | undefined;
  const unit = overview?.unit;
  const showFeeds = overview?.phase === 'active' || overview?.phase === 'planned';
  const truckSub = [
    v?.capacity_kg ? `${Math.round(v.capacity_kg / 1000)} ton` : null,
    v?.asset_type ?? null,
    v?.trailer_number ? `Trailer ${v.trailer_number}` : null,
  ].filter(Boolean).join(' · ');
  const change = (mode: 'driver' | 'truck') => (
    <button type="button" onClick={() => onReassign(mode)} className="shrink-0 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400">Change</button>
  );
  const phoneDigits = (p?: string | null) => (p ?? '').replace(/[^0-9]/g, '');

  return (
    <div className="pointer-events-auto w-[300px] overflow-hidden rounded-2xl border border-black/[0.06] bg-white/92 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85">
      {/* Truck */}
      <div className="flex items-start gap-3 p-3">
        {v?.image_url ? (
          <img src={resolveFileUrl(v.image_url)} alt="" className="size-10 shrink-0 rounded-xl border border-black/[0.06] bg-white object-cover dark:border-white/10" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300"><Truck className="size-5" /></span>
        )}
        <div className="min-w-0 flex-1">
          {v && !trip.is_third_party ? (
            <button type="button" onClick={() => navigate(`/vehicles/${v.id}`)} title="Open truck profile" className="block max-w-full truncate text-left font-mono text-sm font-semibold text-foreground hover:underline">
              {v.plate_number}
            </button>
          ) : (
            <p className="truncate font-mono text-sm font-semibold text-foreground">{truckLabel}</p>
          )}
          <p className="truncate text-[11px] text-muted-foreground">{trip.is_third_party ? 'Third-party truck' : truckSub || 'No truck assigned'}</p>
          {v && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', v.icces_device_id ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')} />
              {v.icces_device_id ? 'GPS tracker fitted' : 'No GPS tracker'}
            </p>
          )}
        </div>
        {!trip.is_third_party && change('truck')}
      </div>

      {/* Driver */}
      <div className="flex items-start gap-3 border-t border-black/[0.06] p-3 dark:border-white/10">
        {d ? (
          <DriverAvatar src={d.avatar_url} firstName={d.first_name} lastName={d.last_name} size="md" status={d.status} showStatusDot={!!d.status} />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300"><UserRound className="size-5" /></span>
        )}
        <div className="min-w-0 flex-1">
          {d ? (
            <button type="button" onClick={() => navigate(`/drivers/${d.id}`)} title="Open driver profile" className="line-clamp-2 text-left text-sm leading-snug font-semibold text-foreground hover:underline">
              {`${d.first_name} ${d.last_name}`.trim()}
            </button>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              {trip.is_third_party ? (trip as any).third_party_driver_name || 'Third-party driver' : 'No driver assigned'}
            </p>
          )}
          {d && (
            <p className="truncate text-[11px] text-muted-foreground">
              {[d.ref_id, d.phone_primary, d.status ? DRIVER_STATUS_LABEL[d.status] : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {d?.phone_primary && (
            <div className="mt-1.5 flex gap-1.5">
              <a href={`tel:${d.phone_primary}`} className="flex h-6 items-center gap-1 rounded-full bg-emerald-600/10 px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-300">
                <Phone className="size-3" /> Call
              </a>
              <a href={`https://wa.me/${phoneDigits(d.phone_primary)}`} target="_blank" rel="noreferrer" className="flex h-6 items-center gap-1 rounded-full bg-[#25D366]/12 px-2 text-[11px] font-medium text-emerald-700 hover:bg-[#25D366]/20 dark:text-emerald-300">
                <WhatsAppIcon className="size-3" /> WhatsApp
              </a>
            </div>
          )}
        </div>
        {!trip.is_third_party && change('driver')}
      </div>

      {/* Co-driver */}
      {coDriver?.first_name && (
        <div className="flex items-center gap-2 border-t border-black/[0.06] px-3 py-2 dark:border-white/10">
          <DriverAvatar src={coDriver.avatar_url} firstName={coDriver.first_name} lastName={coDriver.last_name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            <span className="text-muted-foreground">Co-driver · </span>
            {`${coDriver.first_name} ${coDriver.last_name ?? ''}`.trim()}
          </span>
          {coDriver.phone_primary && (
            <a href={`tel:${coDriver.phone_primary}`} aria-label="Call co-driver" className="text-emerald-600 hover:text-emerald-700"><Phone className="size-3.5" /></a>
          )}
        </div>
      )}

      {/* Live GPS feeds while it matters */}
      {showFeeds && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-black/[0.06] bg-muted/40 px-3 py-2 dark:border-white/10">
          <Feed icon={Truck} label="Tracker" fix={unit?.vehicle_gps} missing={unit?.vehicle?.has_tracker === false ? 'No tracker' : 'No fix'} />
          <Feed icon={Smartphone} label="App" fix={unit?.driver_gps} missing={overview?.phase === 'planned' ? 'Off trip' : 'Not sending'} />
        </div>
      )}
    </div>
  );
}

const DRIVER_STATUS_LABEL: Record<string, string> = {
  Available: 'Available',
  OnTrip: 'On a trip',
  OffDuty: 'Off duty',
  Inactive: 'Inactive',
};

export interface FinancialFigures {
  billing: number;
  driverPayout: number;
  coDriverPayout: number;
  charges: number;
  chargesCount: number;
  margin: number;
  marginPercent: string;
  paid: number;
  balanceDue: number;
  is3PL: boolean;
  isMonthly: boolean;
  monthlyRate?: number | null;
  quotationName: string | null;
}

const sar = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`;

/**
 * The trip's money, compact enough for the header: billing with margin and
 * amount due beside it, one bar showing where the billing goes, and the three
 * parts underneath (charges can be added right there).
 */
export function FinancialSummary({ f, onCharges }: { f: FinancialFigures; onCharges: () => void }) {
  const payout = f.driverPayout + f.coDriverPayout;
  const total = Math.max(payout + f.charges + Math.max(f.margin, 0), 1);
  const settled = f.balanceDue <= 0;
  const parts = [
    { key: 'payout', label: f.is3PL ? 'Subcontract' : 'Driver payout', value: payout, color: 'bg-violet-500' },
    { key: 'charges', label: 'Charges', value: f.charges, color: 'bg-amber-400' },
    { key: 'margin', label: 'Margin', value: f.margin, color: 'bg-emerald-500' },
  ];

  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{f.isMonthly ? 'Billing · monthly contract' : 'Billing'}</p>
          <p className="text-2xl leading-tight font-semibold tracking-tight text-foreground tabular-nums">{sar(f.billing)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', f.margin >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300')}>
            {f.marginPercent}% margin
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', settled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300')}>
            {settled ? 'Paid in full' : `${sar(f.balanceDue)} due`}
          </span>
        </div>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => p.value > 0 && (
          <span key={p.key} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.key} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('size-1.5 shrink-0 rounded-full', p.color)} />
              <span className="truncate">{p.label}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <p className={cn('truncate text-sm font-semibold tabular-nums', p.key === 'margin' && p.value < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-foreground')}>
                {sar(p.value)}
              </p>
              {p.key === 'charges' && (
                <button
                  type="button"
                  onClick={onCharges}
                  title="Add or edit additional charges"
                  aria-label="Add charge"
                  className="flex h-5 shrink-0 items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                >
                  <Plus className="size-3" strokeWidth={2.5} /> Add
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The trip's paperwork, at the bottom of the stops panel. Driver photos stay under their stops. */
export function PaperworkSection({ documents, onUpload, onActivity }: { documents: any[]; onUpload: () => void; onActivity: () => void }) {
  const paperwork = documents.filter((d) => !['POD', 'Waybill'].includes(d.doc_type));
  return (
    <div className="border-t border-black/[0.06] px-4 py-3 dark:border-white/10">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Documents · {paperwork.length}</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onActivity} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            <ListOrdered className="size-3.5" /> Activity
          </button>
          <button type="button" onClick={onUpload} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            <UploadCloud className="size-3.5" /> Upload
          </button>
        </div>
      </div>
      {paperwork.length > 0 && (
        <ul className="space-y-1">
          {paperwork.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-xs">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <a href={resolveFileUrl(d.file_url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-foreground hover:underline">
                {d.documentType?.name || d.doc_type || d.title || 'Document'}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
