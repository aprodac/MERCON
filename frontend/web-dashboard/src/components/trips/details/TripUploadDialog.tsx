import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, FileText, ImagePlus, Loader2, PackageCheck, ScrollText, ShieldCheck, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DOC_UPLOAD_ACCEPT } from '@/lib/fileDrop';
import { documentService } from '@/services/documentService';
import type { TripStop } from '@/services/tripService';

/** What the office attaches to a trip. Delivery / loading go on a stop, like the driver's photos. */
type Kind = 'POD' | 'Waybill' | 'CustomsClearance' | 'Emergency';

const KINDS: Array<{ value: Kind; label: string; hint: string; icon: typeof PackageCheck; operation?: string; stopType?: TripStop['stop_type'] }> = [
  { value: 'POD', label: 'Delivery proof', hint: 'Signed delivery note, photos at drop-off', icon: PackageCheck, operation: 'delivery', stopType: 'Dropoff' },
  { value: 'Waybill', label: 'Loading papers', hint: 'Waybill, loading photos', icon: ScrollText, operation: 'pickup', stopType: 'Pickup' },
  { value: 'CustomsClearance', label: 'Customs', hint: 'Clearance papers', icon: ShieldCheck },
  { value: 'Emergency', label: 'Incident', hint: 'Accident, damage, breakdown', icon: AlertTriangle },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: { id: string; ref_id?: string | null; stops?: TripStop[] };
  /** Pre-selected kind, e.g. "Delivery proof" when opened from a stop. */
  defaultKind?: Kind;
}

const stopName = (s: TripStop) => s.location_name || s.location_address || `Stop ${s.stop_sequence}`;
const isImage = (f: File) => f.type.startsWith('image/');

/**
 * Upload to this trip in one step: drop the files, say what they are, upload.
 * Delivery / loading files go under their stop (same place the driver's photos
 * show); customs and incident files go to the trip's documents.
 */
export default function TripUploadDialog({ open, onOpenChange, trip, defaultKind = 'POD' }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [stopId, setStopId] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stops = useMemo(() => [...(trip.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence), [trip.stops]);
  const kindInfo = KINDS.find((k) => k.value === kind)!;
  const wantsStop = Boolean(kindInfo.operation);

  // The usual stop for the kind: last drop-off for delivery proof, first pickup for loading papers.
  const defaultStopFor = (k: Kind) => {
    const info = KINDS.find((x) => x.value === k);
    if (!info?.stopType) return '';
    const matching = stops.filter((s) => s.stop_type === info.stopType);
    const pick = info.stopType === 'Dropoff' ? matching[matching.length - 1] : matching[0];
    return pick?.id ?? '';
  };

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setKind(defaultKind);
    setStopId(defaultStopFor(defaultKind));
    setProgress(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const previews = useMemo(() => files.map((f) => (isImage(f) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
    setError(null);
  };

  const chooseKind = (k: Kind) => {
    setKind(k);
    setStopId(defaultStopFor(k));
  };

  const uploading = progress !== null;
  const upload = async () => {
    if (files.length === 0) {
      setError('Add at least one file.');
      return;
    }
    setError(null);
    setProgress(0);
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    form.append('entity_type', 'Trip');
    form.append('entity_id', trip.id);
    form.append('doc_type', kind);
    if (wantsStop && stopId) form.append('stop_id', stopId);
    if (kindInfo.operation) form.append('operation', kindInfo.operation);
    try {
      await documentService.upload(form, (e: any) => {
        if (e?.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      const stop = stops.find((s) => s.id === stopId);
      toast.success(`Added to ${trip.ref_id ?? 'the trip'}${wantsStop && stop ? ` · ${kindInfo.label.toLowerCase()} at ${stopName(stop)}` : ''}`);
      // Delivery / loading files show with the driver's updates; the rest under Documents.
      queryClient.invalidateQueries({ queryKey: ['documents', 'Trip'] });
      queryClient.invalidateQueries({ queryKey: ['operator-inbox', 'trip-driver-updates', trip.id] });
      queryClient.invalidateQueries({ queryKey: ['trip'] });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || "Couldn't upload. Check your connection and try again.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload to {trip.ref_id ?? 'this trip'}</DialogTitle>
          <DialogDescription>Photos or PDFs. They show on the trip straight away.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* What it is */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What are these files">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => chooseKind(k.value)}
                className={cn(
                  'flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors',
                  kind === k.value ? 'border-[#FA634E] bg-orange-50/60 dark:bg-orange-950/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                )}
              >
                <k.icon className={cn('mt-0.5 size-4 shrink-0', kind === k.value ? 'text-[#E5533F]' : 'text-slate-400')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{k.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{k.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {wantsStop && stops.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">At which stop</span>
              <select
                id="trip-upload-stop"
                value={stopId}
                onChange={(e) => setStopId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Not a specific stop</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stop_sequence}. {stopName(s)} · {s.stop_type === 'Dropoff' ? 'Drop-off' : s.stop_type}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Files */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            className={cn(
              'rounded-xl border-2 border-dashed p-3 transition-colors',
              dragOver ? 'border-[#FA634E] bg-orange-50/50 dark:bg-orange-950/20' : 'border-slate-200 dark:border-slate-700'
            )}
          >
            {files.length === 0 ? (
              <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-1.5 py-5 text-center">
                <ImagePlus className="size-6 text-slate-400" />
                <span className="text-sm font-medium text-foreground">Drop files here or choose them</span>
                <span className="text-[11px] text-muted-foreground">Photos, PDF or Word · several at once</span>
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={`${f.name}:${f.size}`} className="relative size-16 overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10" title={f.name}>
                    {previews[i] ? (
                      <img src={previews[i]!} alt={f.name} className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full flex-col items-center justify-center gap-0.5 bg-slate-50 px-1 dark:bg-slate-800">
                        <FileText className="size-4 text-slate-400" />
                        <span className="w-full truncate text-center text-[9px] text-slate-500">{f.name}</span>
                      </span>
                    )}
                    {!uploading && (
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex size-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-[#FA634E] hover:text-[#E5533F] dark:border-slate-600"
                    aria-label="Add more files"
                  >
                    <ImagePlus className="size-5" />
                  </button>
                )}
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={DOC_UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={upload} disabled={uploading} className="bg-[#FA634E] text-white hover:bg-[#E5533F]">
              {uploading ? (
                <><Loader2 className="mr-1.5 size-4 animate-spin" /> Uploading {progress ? `${progress}%` : '…'}</>
              ) : files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
