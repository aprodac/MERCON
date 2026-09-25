import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Loader2, MapPin, Truck, UserRound, X } from 'lucide-react';
import { resolveFileUrl } from '@/lib/documents';
import { operatorInboxService } from '@/services/operatorInboxService';

/**
 * The page behind a forwarded WhatsApp link (/s/:token). No login — the
 * unguessable token is the permission — and it shows only the photos and
 * videos the operator chose for that forward. Built for a phone first.
 */
export default function SharedUpdatePage() {
  const { token = '' } = useParams();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-share', token],
    queryFn: () => operatorInboxService.getPublicShare(token),
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <p className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Loading…</p>
      </Shell>
    );
  }
  if (error || !data) {
    const msg = (error as any)?.response?.data?.error?.message || 'This link is not valid.';
    return (
      <Shell>
        <p className="py-24 text-center text-sm text-slate-500">{msg}</p>
      </Shell>
    );
  }

  const opened = data.items.find((i) => i.id === open);

  return (
    <Shell>
      <header className="space-y-1">
        {data.trip_ref && <p className="font-mono text-xs font-semibold text-brand">{data.trip_ref}</p>}
        <h1 className="text-xl font-semibold text-charcoal">{data.headline}</h1>
        {data.customer_name && <p className="text-sm text-slate-500">{data.customer_name}</p>}
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        {data.route && <Meta icon={MapPin} label="Route" value={data.route} />}
        {data.vehicle_plate && <Meta icon={Truck} label="Truck" value={data.vehicle_plate} />}
        {data.driver_name && <Meta icon={UserRound} label="Driver" value={data.driver_name} />}
        <Meta icon={Clock} label="Shared" value={new Date(data.shared_at).toLocaleString()} />
      </dl>

      {data.delay_note && (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700"><span className="font-semibold">Reason: </span>{data.delay_note}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.items.map((m) =>
          m.kind === 'video' ? (
            <video key={m.id} src={resolveFileUrl(m.url)} controls playsInline className="col-span-2 w-full rounded-2xl bg-charcoal-strong sm:col-span-3" />
          ) : (
            <button key={m.id} type="button" onClick={() => setOpen(m.id)} className="aspect-square overflow-hidden rounded-2xl bg-slate-100">
              <img src={resolveFileUrl(m.url)} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ),
        )}
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400">
        {data.items.length} {data.items.length === 1 ? 'item' : 'items'} · taken by the driver on site
      </p>

      {opened && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-strong/90 p-4" onClick={() => setOpen(null)}>
          <button type="button" className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white" aria-label="Close">
            <X className="size-5" />
          </button>
          <img src={resolveFileUrl(opened.url)} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="mb-5 text-sm font-bold tracking-wide text-charcoal">MERCON</p>
        {children}
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-[11px] text-slate-500">{label}</dt>
        <dd className="truncate font-medium text-charcoal">{value}</dd>
      </div>
    </div>
  );
}
