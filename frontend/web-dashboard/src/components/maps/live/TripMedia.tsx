import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, Play, TriangleAlert, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import type { LiveMediaItem, LiveStopMedia } from '@/services/fleetLiveService';

const KIND_LABEL: Record<LiveMediaItem['kind'], string> = {
  pod: 'Proof of delivery',
  photo: 'Cargo photo',
  video: 'Delay video',
};

/** "VehicleBreakdown" → "Vehicle breakdown". */
function humanizeDelayReason(reason: string | null): string | null {
  if (!reason) return null;
  const words = reason.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What the driver sent from one stop, inline under the stop in the details
 * panel: the delay they reported, a play chip for a delay video, and small
 * thumbnails for POD / cargo photos. Clicking opens the viewer.
 */
export function StopMediaStrip({
  stop, title, onOpen,
}: { stop: LiveStopMedia | undefined; title: string; onOpen: (items: LiveMediaItem[], index: number, title: string) => void; }) {
  if (!stop || (!stop.delay && stop.media.length === 0)) return null;
  const videos = stop.media.filter((m) => m.kind === 'video');
  const photos = stop.media.filter((m) => m.kind !== 'video');
  const reason = humanizeDelayReason(stop.delay?.reason ?? null);
  const open = (item: LiveMediaItem) => onOpen(stop.media, stop.media.indexOf(item), title);

  return (
    <div className="mt-1.5 space-y-1.5">
      {stop.delay && (
        <p className="flex items-start gap-1.5 rounded-lg bg-rose-500/8 px-2 py-1.5 text-[11px] leading-snug text-rose-700 dark:text-rose-300">
          <TriangleAlert className="mt-px size-3 shrink-0" />
          <span>
            {reason && <span className="font-semibold">{reason}</span>}
            {reason && stop.delay.note && ' — '}
            {stop.delay.note}
          </span>
        </p>
      )}
      {(videos.length > 0 || photos.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {videos.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => open(v)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 pr-2.5 pl-1.5 text-[11px] font-medium text-white transition hover:bg-slate-700 dark:bg-white/10 dark:hover:bg-white/20"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-white/15">
                <Play className="size-3 fill-current" />
              </span>
              Delay video
            </button>
          ))}
          {photos.slice(0, 4).map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => open(p)}
              title={KIND_LABEL[p.kind]}
              className="relative size-8 overflow-hidden rounded-lg ring-1 ring-black/10 transition hover:ring-2 hover:ring-blue-500 dark:ring-white/10"
            >
              <img src={resolveFileUrl(p.url)} alt={KIND_LABEL[p.kind]} loading="lazy" className="size-full object-cover" />
              {i === 3 && photos.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-semibold text-white">
                  +{photos.length - 3}
                </span>
              )}
            </button>
          ))}
          {photos.some((p) => p.kind === 'pod') && (
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">POD</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Photo / video viewer: one item at a time, arrow keys to move, video plays inline. */
export function MediaViewer({
  items, index, title, onClose, onIndex,
}: { items: LiveMediaItem[]; index: number; title: string; onClose: () => void; onIndex: (i: number) => void }) {
  const item = items[index];
  const [broken, setBroken] = useState(false);
  const step = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);

  useEffect(() => setBroken(false), [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  if (!item) return null;
  const url = resolveFileUrl(item.url);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* The shared dialog overlay sits under the full-screen map, so the viewer brings its own. */}
      {createPortal(<div className="fixed inset-0 z-[9999] bg-black/75" aria-hidden />, document.body)}
      <DialogContent hideCloseButton className="z-[10000] max-w-3xl gap-0 overflow-hidden rounded-2xl p-0 sm:p-0">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{KIND_LABEL[item.kind]}{title && ` · ${title}`}</DialogTitle>
            <DialogDescription className="text-xs">
              {new Date(item.captured_at).toLocaleString()}
              {items.length > 1 && ` · ${index + 1} of ${items.length}`}
            </DialogDescription>
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" title="Open original" aria-label="Open original">
            <Download className="size-4" />
          </a>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="relative flex h-[min(70vh,560px)] items-center justify-center bg-slate-950">
          {broken ? (
            <p className="flex items-center gap-2 text-sm text-slate-400"><ImageIcon className="size-4" /> This file couldn't be loaded.</p>
          ) : item.kind === 'video' ? (
            <video key={item.id} src={url} controls autoPlay playsInline className="max-h-full max-w-full" onError={() => setBroken(true)} />
          ) : (
            <img key={item.id} src={url} alt={KIND_LABEL[item.kind]} className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
          )}
          {items.length > 1 && (
            <>
              <NavButton side="left" onClick={() => step(-1)} />
              <NavButton side="right" onClick={() => step(1)} />
            </>
          )}
        </div>

        {items.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t p-3">
            {items.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onIndex(i)}
                className={cn('relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10', i === index && 'ring-2 ring-blue-600')}
              >
                {m.kind === 'video' ? (
                  <span className="flex size-full items-center justify-center bg-slate-900 text-white"><Play className="size-4 fill-current" /></span>
                ) : (
                  <img src={resolveFileUrl(m.url)} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={cn(
        'absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition hover:bg-white',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
