import { useEffect } from 'react';
import { Languages, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { ROUTE_COLOR } from '@/components/maps/live/liveMapStyle';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import type { TrackingBrand } from '@/services/trackingService';
import type { TrackingText } from './trackingI18n';

/** Shared pieces of the customer tracking pages (/t/ trip page and /c/ customer page). */

export const TRACK_BLUE = ROUTE_COLOR.light.line;

export const line = (coords: [number, number][]) => ({
  type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords },
});

/** Blue arrow while live (pointing where the truck is heading), grey once the truck has stopped reporting. */
export function TruckPuck({ heading, live, label }: { heading: number | null; live: boolean; label?: string | null }) {
  const color = live ? TRACK_BLUE : '#94a3b8';
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex size-11 items-center justify-center">
        {live && <span className="absolute inset-0 animate-ping rounded-full opacity-25" style={{ backgroundColor: color }} />}
        <span className="absolute inset-1 rounded-full opacity-20" style={{ backgroundColor: color }} />
        <span className="relative flex size-7 items-center justify-center rounded-full border-[3px] border-white shadow-lg" style={{ backgroundColor: color }}>
          {heading != null ? (
            <svg viewBox="0 0 24 24" className="size-4" style={{ transform: `rotate(${heading}deg)` }} aria-hidden>
              <path d="M12 3 L19 20 L12 16 L5 20 Z" fill="white" />
            </svg>
          ) : (
            <Truck className="size-3.5 text-white" strokeWidth={2.5} />
          )}
        </span>
      </div>
      {label && (
        <span className="-mt-1 rounded-md bg-white/95 px-1.5 text-[11px] font-semibold whitespace-nowrap text-slate-800 shadow-sm ring-1 ring-black/5">{label}</span>
      )}
    </div>
  );
}

export function Chip({ tone, children }: { tone: 'blue' | 'violet' | 'green' | 'slate' | 'amber' | 'red'; children: React.ReactNode }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    green: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-rose-50 text-rose-700',
  } as const;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function BrandMark({ brand, className }: { brand: TrackingBrand; className?: string }) {
  return brand.logo_url
    ? <img src={resolveFileUrl(brand.logo_url)} alt={brand.name} className={cn('h-5 w-auto max-w-[120px] object-contain', className)} />
    : <span className={cn('text-sm font-bold tracking-wide text-[#3E3C3D]', className)}>{brand.name}</span>;
}

export function LangToggle({ text, className }: { text: TrackingText; className?: string }) {
  return (
    <button
      type="button"
      onClick={text.toggle}
      className={cn('pointer-events-auto flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur', className)}
    >
      <Languages className="size-3.5" /> {text.t.language}
    </button>
  );
}

/** "Ask MERCON" — a WhatsApp chat with ops (never the driver), when a support number is set. */
export function AskButton({ brand, text, about }: { brand: TrackingBrand; text: TrackingText; about: string }) {
  if (!brand.support_whatsapp) return null;
  const href = `https://wa.me/${brand.support_whatsapp}?text=${encodeURIComponent(text.t.askText(about))}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white shadow-sm hover:bg-[#1ebe5b]"
    >
      <WhatsAppIcon className="size-4" /> {text.t.ask(brand.name)}
    </a>
  );
}

/** Full-screen photo viewer. */
export function PhotoViewer({ url, onClose, closeLabel }: { url: string | null; onClose: () => void; closeLabel: string }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2B2C]/90 p-4" onClick={onClose}>
      <button type="button" className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white" aria-label={closeLabel}>
        <X className="size-5" />
      </button>
      <img src={resolveFileUrl(url)} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-6">{children}</div>;
}
